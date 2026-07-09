from __future__ import annotations

import inspect
import os
from typing import Any, Callable

from argus.checkpoints import mark_checkpoint_resumed
from argus.patcher import extract_edge_map, extract_fn, patch_graph
from argus.session import ArgusSession

# Backward-compat alias — RunSession was the internal name before ArgusSession was public
RunSession = ArgusSession


class ArgusWatcher:
    """LangGraph adapter for ArgusSession.

    Usage (shortest — pass graph directly):
        watcher = ArgusWatcher(graph)
        app = graph.compile()
        result = app.invoke(state)
        print(watcher.run_id)

    Usage (separate watch call):
        watcher = ArgusWatcher()
        watcher.watch(graph)
        app = graph.compile()
        result = app.invoke(state)

    Auto-finalize: runs are saved automatically for linear and fan-out/fan-in
    (DAG) graphs. Only cyclic graphs (with back-edges) need manual finalize():

        watcher.finalize()

    Usage (semantic validators):
        watcher = ArgusWatcher(graph, validators={
            "summarize": lambda out: (len(out.get("summary","")) > 10, "Summary too short"),
            "*": lambda out: ("error" not in out, f"Error: {out.get('error')}"),
        })

    Usage (disable LLM semantic judge):
        watcher = ArgusWatcher(graph, semantic_judge=False)   # skip LLM checks

    Usage (framework-agnostic, without LangGraph):
        from argus import ArgusSession   # use ArgusSession directly
    """

    def __init__(
        self,
        graph: Any = None,
        *,
        max_field_size: int = 50_000,
        validators: dict[str, Callable[[dict], tuple[bool, str]]] | None = None,
        strict: bool = False,
        investigate: bool | str = True,
        redact_keys: set[str] | list[str] | None = None,
        persist_state: bool = True,
        record_http: bool = True,
        semantic_judge: bool = True,
        judge_model: str = "gpt-4o",
    ) -> None:
        self._max_field_size = max_field_size
        self._validators = validators or {}
        self._strict = strict
        self._investigate = investigate  # True | False | "always"
        self._redact_keys = redact_keys
        self._persist_state = persist_state
        self._record_http = record_http
        self._semantic_judge = semantic_judge
        self._judge_model = judge_model
        self._http_recorder_ctx = None
        self._http_recorder = None
        self._session: ArgusSession | None = None

        # If graph was passed to constructor, auto-attach
        if graph is not None:
            self.watch(graph)

    @property
    def run_id(self) -> str | None:
        """The run ID for the current session, or None if watch() hasn't been called."""
        if self._session is None:
            return None
        return self._session.run_id

    def watch_compiled(self, compiled_graph: Any) -> Any:
        """Attach ARGUS to an already-compiled LangGraph graph.

        This is the recommended method when you receive a pre-compiled graph
        or prefer compiling first.  Internally it extracts the underlying
        StateGraph, attaches monitoring, and recompiles.

        Args:
            compiled_graph: A ``CompiledGraph`` returned by ``graph.compile()``.

        Returns:
            A new ``CompiledGraph`` with ARGUS monitoring attached.

        Usage::

            app = graph.compile(checkpointer=memory)
            app = watcher.watch_compiled(app)   # returns a new compiled app
            app.invoke(state)
        """
        # Extract the builder (StateGraph) from the compiled graph
        builder = getattr(compiled_graph, "builder", None)
        if builder is None:
            # Older LangGraph versions may not have .builder
            raise ValueError(
                "Cannot extract StateGraph from this compiled graph. "
                "Your LangGraph version may be too old for watch_compiled(). "
                "Either upgrade langgraph or use watcher.watch(graph) before compile()."
            )

        # Collect compile kwargs from the existing compiled graph so we
        # preserve checkpointer, interrupt_before/after, etc.
        compile_kwargs: dict[str, Any] = {}
        for attr in ("checkpointer", "interrupt_before", "interrupt_after"):
            val = getattr(compiled_graph, attr, None)
            if val is not None:
                compile_kwargs[attr] = val

        self.watch(builder)
        return builder.compile(**compile_kwargs)

    def watch(self, graph: Any) -> None:
        """Attach ARGUS to a LangGraph StateGraph. Must be called before compile().

        If you already have a compiled graph, use ``watch_compiled()`` instead.
        """
        if not hasattr(graph, "nodes"):
            raise ValueError(
                "argus.watch() expects a LangGraph StateGraph instance with a .nodes attribute. "
                "Call watch() before graph.compile(), or use watch_compiled() on a compiled graph."
            )
        if hasattr(graph, "_compiled") and graph._compiled:
            raise ValueError(
                "argus.watch() must be called before graph.compile(). "
                "Use watch_compiled() if you already have a compiled graph."
            )

        node_names = list(graph.nodes.keys())
        edge_map = extract_edge_map(graph)

        # Load .env early so credentials are available for auto-detection
        try:
            from dotenv import load_dotenv

            load_dotenv(override=True)
        except ImportError:
            pass

        # Auto-enable LLM investigation if key is available or user is logged in
        from argus.llm_proxy import is_available as _llm_available

        llm_inv_config = None
        if (self._investigate or self._semantic_judge) and _llm_available():
            from argus.models import LLMInvestigationConfig

            always = (self._investigate == "always") or self._semantic_judge
            llm_inv_config = LLMInvestigationConfig(
                enabled=True,
                always_investigate=always,
                model=self._judge_model,
            )

        self._session = ArgusSession(
            max_field_size=self._max_field_size,
            validators=self._validators,
            strict=self._strict,
            llm_investigation=llm_inv_config,
            redact_keys=self._redact_keys,
            persist_state=self._persist_state,
        )
        self._session.set_node_names(node_names)
        self._session.set_edges(edge_map)

        # store references to original node functions for inspector
        self._session.node_fn_registry = {
            name: extract_fn(graph.nodes[name]) for name in node_names
        }

        # Auto-capture each node function's import path for factory-free replay
        self._session.node_fn_refs = _capture_node_fn_refs(self._session.node_fn_registry)
        self._session.node_fn_paths = _capture_node_fn_paths(self._session.node_fn_registry)

        # Auto-capture the caller's module:function as fallback
        self._session.app_factory_ref = _detect_caller_factory()

        patch_graph(graph, self._session)

        # Start HTTP recording if requested
        if self._record_http:
            try:
                from argus.http_recorder import record_http

                self._http_recorder_ctx = record_http()
                self._http_recorder = self._http_recorder_ctx.__enter__()
            except Exception:
                pass  # HTTP recording is best-effort

    def finalize(self) -> None:
        """Persist the run record.

        For most graphs (linear, fan-out/fan-in, DAGs) this is called
        automatically when all terminal nodes complete. You only need
        to call this manually for cyclic graphs (graphs with back-edges).

        Safe to call even if auto-finalize already ran — it's a no-op
        the second time.
        """
        if self._session is not None:
            self._session.finalize()

            # Save HTTP recordings if any
            if self._http_recorder is not None:
                try:
                    interactions = self._http_recorder.interactions
                    if interactions:
                        from argus.http_recorder import save_http_interactions

                        save_http_interactions(self._session.run_id, interactions)
                except Exception:
                    pass  # best-effort

            # Clean up HTTP recorder context
            if self._http_recorder_ctx is not None:
                try:
                    self._http_recorder_ctx.__exit__(None, None, None)
                except Exception:
                    pass
                self._http_recorder_ctx = None
                self._http_recorder = None

    def resume(self, checkpoint_run_id: str, app: Any, resume_input: Any = None) -> None:
        """Resume a previously interrupted (human-approval) run.

        Marks the checkpoint as resumed, invokes the app, then finalizes.

        Args:
            checkpoint_run_id: run_id of the interrupted run
            app: the compiled LangGraph app (same instance used for the original run)
            resume_input: input to pass to app.invoke() — often None for LangGraph resumes
        """
        mark_checkpoint_resumed(checkpoint_run_id)
        if self._session is not None:
            self._session.reset_for_resume(checkpoint_run_id)
        app.invoke(resume_input)
        self.finalize()


def _detect_caller_factory() -> str | None:
    """Walk the call stack to find the user function that called watch().

    Uses the frame's __name__ (the real Python module name) so the result
    works regardless of cwd or project layout — pip-installed packages,
    src/ layouts, nested folders all resolve correctly.

    Skips functions that appear to compile AND invoke the graph (they would
    return a result dict, not a StateGraph).

    Returns "module:function" string suitable for importlib, or None.
    """
    fallback: str | None = None

    for frame_info in inspect.stack()[2:]:  # skip _detect_caller_factory + watch
        func_name = frame_info.function
        filename = frame_info.filename

        # Skip argus internals, stdlib, site-packages
        if "site-packages" in filename or "argus/" in filename:
            continue
        # Must be inside a named function (not module-level <module>)
        if func_name == "<module>":
            continue

        # Use the real Python module name from the frame globals
        module_name = frame_info.frame.f_globals.get("__name__")
        if not module_name or module_name == "__main__":
            # __main__ isn't importable — fall back to file-path heuristic
            module_name = _module_from_filepath(filename)
            if not module_name:
                continue

        ref = f"{module_name}:{func_name}"

        # Check if this frame has a compiled graph in its locals — if so,
        # the function likely compiles AND invokes the graph and would
        # return a result dict, not the StateGraph builder.
        locals_dict = frame_info.frame.f_locals
        has_compiled = any(
            hasattr(v, "invoke") and hasattr(v, "get_graph")
            for v in locals_dict.values()
            if v is not None
        )
        if has_compiled:
            # Remember as fallback but keep looking for a better candidate
            if fallback is None:
                fallback = ref
            continue

        return ref

    return fallback


def _capture_node_fn_refs(
    fn_registry: dict[str, Any],
) -> dict[str, str]:
    """Build a {node_name: "module:qualname"} map from the live function registry.

    At replay time, each function can be re-imported with importlib — no factory needed.
    """
    refs: dict[str, str] = {}
    for name, fn in fn_registry.items():
        module = getattr(fn, "__module__", None)
        qualname = getattr(fn, "__qualname__", None)
        if not module or not qualname:
            continue
        if module == "__main__":
            # __main__ isn't importable — try to resolve from source file
            src_file = getattr(fn, "__code__", None)
            if src_file:
                resolved = _module_from_filepath(src_file.co_filename)
                if resolved:
                    module = resolved
                else:
                    continue
            else:
                continue
        refs[name] = f"{module}:{qualname}"
    return refs


def _capture_node_fn_paths(
    fn_registry: dict[str, Any],
) -> dict[str, str]:
    """Build a {node_name: relative_file_path:line} map from live functions.

    Stores the source file path (with line number) relative to cwd so replay
    can fall back to direct file loading when importlib fails (e.g. no
    __init__.py).  Format: ``"path/to/file.py:42"``.
    """
    paths: dict[str, str] = {}
    for name, fn in fn_registry.items():
        code = getattr(fn, "__code__", None)
        if code and code.co_filename:
            try:
                rel = os.path.relpath(code.co_filename, os.getcwd())
            except ValueError:
                # On Windows, relpath fails across drives
                rel = code.co_filename
            line = code.co_firstlineno
            paths[name] = f"{rel}:{line}"
    return paths


def _module_from_filepath(filepath: str) -> str | None:
    """Convert an absolute .py path to a dotted module name relative to cwd.

    Fallback used when the frame's __name__ is '__main__'.
    """
    cwd = os.getcwd()
    try:
        rel = os.path.relpath(filepath, cwd)
    except ValueError:
        return None
    if rel.startswith(".."):
        return None
    return rel.removesuffix(".py").replace(os.sep, ".")

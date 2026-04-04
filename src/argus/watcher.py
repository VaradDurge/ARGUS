from __future__ import annotations

from typing import Any, Callable

from argus.checkpoints import mark_checkpoint_resumed
from argus.patcher import extract_edge_map, extract_fn, patch_graph
from argus.session import ArgusSession

# Backward-compat alias — RunSession was the internal name before ArgusSession was public
RunSession = ArgusSession


class ArgusWatcher:
    """LangGraph adapter for ArgusSession.

    Usage (linear graph — auto-finalizes):
        watcher = ArgusWatcher()
        watcher.watch(graph)           # call before graph.compile()
        app = graph.compile()
        result = app.invoke(state)

    Usage (cyclic graph — manual finalize required):
        watcher = ArgusWatcher()
        watcher.watch(graph)
        app = graph.compile()
        result = app.invoke(state)
        watcher.finalize()             # required for graphs with back-edges

    Usage (semantic validators):
        watcher = ArgusWatcher(validators={
            "summarize": lambda out: (len(out.get("summary","")) > 10, "Summary too short"),
            "*": lambda out: ("error" not in out, f"Error: {out.get('error')}"),
        })

    Usage (framework-agnostic, without LangGraph):
        from argus import ArgusSession   # use ArgusSession directly
    """

    def __init__(
        self,
        max_field_size: int = 50_000,
        validators: dict[str, Callable[[dict], tuple[bool, str]]] | None = None,
    ) -> None:
        self._max_field_size = max_field_size
        self._validators = validators or {}
        self._session: ArgusSession | None = None

    def watch(self, graph: Any) -> None:
        """Attach ARGUS to a LangGraph StateGraph. Must be called before compile()."""
        if not hasattr(graph, "nodes"):
            raise ValueError(
                "argus.watch() expects a LangGraph StateGraph instance with a .nodes attribute. "
                "Call watch() before graph.compile()."
            )
        if hasattr(graph, "_compiled") and graph._compiled:
            raise ValueError(
                "argus.watch() must be called before graph.compile(). "
                "Pass the StateGraph, not the compiled CompiledGraph."
            )

        node_names = list(graph.nodes.keys())
        edge_map = extract_edge_map(graph)

        self._session = ArgusSession(
            max_field_size=self._max_field_size,
            validators=self._validators,
        )
        self._session.set_node_names(node_names)
        self._session.set_edges(edge_map)

        # store references to original node functions for inspector
        self._session.node_fn_registry = {
            name: extract_fn(graph.nodes[name]) for name in node_names
        }

        patch_graph(graph, self._session)

    def finalize(self) -> None:
        """Persist the run record.

        Linear graphs: called automatically when the last node completes.
        Cyclic graphs: must be called after app.invoke() returns.
        Human-approval graphs: call after the final resume completes.
        """
        if self._session is not None:
            self._session.finalize()

    def resume(self, checkpoint_run_id: str, app: Any, resume_input: Any = None) -> None:
        """Resume a previously interrupted (human-approval) run.

        Marks the checkpoint as resumed, invokes the app, then finalizes.

        Args:
            checkpoint_run_id: run_id of the interrupted run
            app: the compiled LangGraph app (same instance used for the original run)
            resume_input: input to pass to app.invoke() — often None for LangGraph resumes
        """
        mark_checkpoint_resumed(checkpoint_run_id)
        app.invoke(resume_input)
        self.finalize()

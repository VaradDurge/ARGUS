from __future__ import annotations

import importlib
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable

from argus.models import RunRecord
from argus.storage import load_run
from argus.utils.serializer import safe_deserialize


class ReplayEngine:
    """Loads a saved run's state at a specific node and re-runs the pipeline from there.

    Supports two modes:
      1. Factory-free (preferred): uses stored node_fn_refs to import each node
         function directly and replays via ArgusSession — no factory needed.
      2. Factory mode (fallback): uses an app_factory callable to rebuild the
         full LangGraph graph. Required only when node_fn_refs are missing
         (e.g., old runs recorded before auto-capture was added).
    """

    def __init__(self, max_field_size: int = 50_000) -> None:
        self._max_field_size = max_field_size

    def replay_node(
        self,
        run_id: str,
        node_name: str,
        state_type: type | None = None,
    ) -> str:
        """Re-execute a single node in isolation using its original input state.

        Imports the node function via stored node_fn_refs, runs it with the
        original input_state, and records a single-step RunRecord.

        Returns:
            new run-id of the single-node replay run
        """
        from argus.session import ArgusSession

        record = load_run(run_id)

        step = next((e for e in record.steps if e.node_name == node_name), None)
        if step is None:
            available = [e.node_name for e in record.steps]
            raise ValueError(
                f"Node '{node_name}' not found in run '{run_id}'. "
                f"Available nodes: {available}"
            )

        if not record.node_fn_refs or node_name not in record.node_fn_refs:
            raise ValueError(
                f"No stored function reference for node '{node_name}'. "
                "Re-record the run with the latest argus to enable single-node replay."
            )

        state = safe_deserialize(step.input_state, state_type)
        fn = _import_fn(record.node_fn_refs[node_name])

        session = ArgusSession(max_field_size=self._max_field_size)
        session.set_node_names([node_name])
        session.set_edges({})
        session.parent_run_id = record.run_id
        session.replay_from_step = node_name
        session.node_fn_refs = {node_name: record.node_fn_refs[node_name]}

        wrapped = session.wrap(node_name, fn)
        wrapped(state)

        session.finalize()
        return session.run_id

    def replay(
        self,
        run_id: str,
        from_node: str,
        app_factory: Callable[[], Any] | None = None,
        state_type: type | None = None,
    ) -> str:
        """Replay a run starting from from_node.

        Args:
            run_id: the run-id (or prefix) to replay from
            from_node: the node name to start replay from
            app_factory: optional — only needed if the run has no stored node_fn_refs
            state_type: optional state type class for deserialization

        Returns:
            new run-id of the replay run
        """
        record = load_run(run_id)

        # find the step for from_node
        step = next((e for e in record.steps if e.node_name == from_node), None)
        if step is None:
            available = [e.node_name for e in record.steps]
            raise ValueError(
                f"Node '{from_node}' not found in run '{run_id}'. "
                f"Available nodes: {available}"
            )

        # build frozen outputs ONLY for nodes before from_node
        frozen_map: dict[str, list[Any]] = defaultdict(list)
        for s in record.steps:
            if s.node_name == from_node:
                break
            if s.output_dict is not None:
                frozen_map[s.node_name].append(s.output_dict)

        # deserialize the input state
        state = safe_deserialize(step.input_state, state_type)

        # Try factory-free replay first, fall back to factory mode
        if record.node_fn_refs:
            return self._replay_direct(record, from_node, state, frozen_map)
        elif app_factory is not None:
            return self._replay_with_factory(
                record, from_node, state, frozen_map, app_factory,
            )
        else:
            raise ValueError(
                "Cannot replay: this run has no stored node function references "
                "and no app_factory was provided. Re-record the run with the "
                "latest argus version to enable factory-free replay."
            )

    def _replay_direct(
        self,
        record: RunRecord,
        from_node: str,
        state: Any,
        frozen_map: dict[str, list[Any]],
    ) -> str:
        """Replay by importing node functions directly — no factory needed."""
        from argus.session import ArgusSession

        # Import each node function from the stored refs
        node_fns: dict[str, Callable] = {}
        for name, ref in record.node_fn_refs.items():
            node_fns[name] = _import_fn(ref)

        # Build execution order from the original run's steps (deduplicated, preserves order)
        seen: set[str] = set()
        execution_order: list[str] = []
        reached_from = False
        for s in record.steps:
            if s.node_name == from_node:
                reached_from = True
            if reached_from and s.node_name not in seen:
                seen.add(s.node_name)
                execution_order.append(s.node_name)

        session = ArgusSession(max_field_size=self._max_field_size)
        session.set_node_names(record.graph_node_names)
        session.set_edges(record.graph_edge_map)
        session.parent_run_id = record.run_id
        session.replay_from_step = from_node
        session.frozen_outputs = dict(frozen_map)
        session.node_fn_refs = record.node_fn_refs

        # Store original function refs for inspector type-hint analysis
        session.node_fn_registry = node_fns

        # Wrap and run each node in the recorded execution order.
        # LangGraph nodes return partial state updates (only changed keys),
        # so we merge each output into the running state before passing to
        # the next node — mimicking what LangGraph's reducer does.
        wrapped = {name: session.wrap(name, fn) for name, fn in node_fns.items()}

        for node_name in execution_order:
            fn = wrapped.get(node_name)
            if fn is None:
                raise ValueError(
                    f"Node '{node_name}' has no stored function reference. "
                    f"Available: {list(record.node_fn_refs.keys())}"
                )
            partial = fn(state)
            if isinstance(partial, dict) and isinstance(state, dict):
                state = {**state, **partial}
            else:
                state = partial

        session.finalize()
        return session.run_id

    def _replay_with_factory(
        self,
        record: RunRecord,
        from_node: str,
        state: Any,
        frozen_map: dict[str, list[Any]],
        app_factory: Callable[[], Any],
    ) -> str:
        """Replay using a factory function (legacy fallback)."""
        from argus.watcher import ArgusWatcher

        graph = app_factory()

        # Unwrap compiled graphs
        if hasattr(graph, "invoke") and hasattr(graph, "graph"):
            graph = graph.graph

        if hasattr(graph, "nodes") and not hasattr(graph, "invoke"):
            watcher = ArgusWatcher(max_field_size=self._max_field_size)
            watcher.watch(graph)
            if watcher._session is not None:
                watcher._session.parent_run_id = record.run_id
                watcher._session.replay_from_step = from_node
                watcher._session.frozen_outputs = dict(frozen_map)
            new_run_id = watcher._session.run_id if watcher._session else None
            app = graph.compile()
        else:
            raise ValueError(
                "app_factory must return a LangGraph StateGraph or CompiledGraph. "
                "Got: " + type(graph).__name__
            )

        app.invoke(state)

        if watcher is not None:
            watcher.finalize()

        return new_run_id


def _import_fn(ref: str) -> Callable:
    """Import a function from a 'module:qualname' reference.

    Handles both simple names (module:func) and nested qualnames
    (module:Class.method).
    """
    if ":" not in ref:
        raise ValueError(f"Invalid function ref '{ref}' — expected 'module:qualname'")

    module_path, qualname = ref.rsplit(":", 1)

    # Ensure cwd is importable
    cwd = str(Path.cwd())
    if cwd not in sys.path:
        sys.path.insert(0, cwd)

    try:
        # Force-reload so replay always picks up the user's latest code fixes.
        # Without this, Python's module cache (sys.modules) would serve the
        # stale version from when argus ui first imported the module.
        if module_path in sys.modules:
            module = importlib.reload(sys.modules[module_path])
        else:
            module = importlib.import_module(module_path)
    except ImportError:
        # Module not on sys.path — search for the .py file under CWD
        # (handles pipelines run from subdirectories)
        top_level = module_path.split(".")[0]
        found = list(Path.cwd().rglob(f"{top_level}.py"))
        if found:
            parent = str(found[0].parent)
            if parent not in sys.path:
                sys.path.insert(0, parent)
            try:
                module = importlib.import_module(module_path)
            except ImportError as e2:
                raise ImportError(f"Cannot import module '{module_path}': {e2}") from e2
        else:
            raise ImportError(
                f"Cannot import module '{module_path}': not found on sys.path "
                f"or under {Path.cwd()}"
            )

    # Walk the qualname (handles Class.method, nested classes, etc.)
    obj: Any = module
    for attr in qualname.split("."):
        obj = getattr(obj, attr, None)
        if obj is None:
            raise AttributeError(
                f"'{attr}' not found in '{module_path}' while resolving '{qualname}'"
            )

    if not callable(obj):
        raise TypeError(f"'{ref}' resolved to {type(obj).__name__}, not a callable")

    return obj

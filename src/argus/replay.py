from __future__ import annotations

from collections import defaultdict
from typing import Any, Callable

from argus.storage import load_run
from argus.utils.serializer import safe_deserialize
from argus.watcher import ArgusWatcher


class ReplayEngine:
    """Loads a saved run's state at a specific node and re-runs the pipeline from there."""

    def __init__(self, max_field_size: int = 50_000) -> None:
        self._max_field_size = max_field_size

    def replay(
        self,
        run_id: str,
        from_node: str,
        app_factory: Callable[[], Any],
        state_type: type | None = None,
    ) -> str:
        """Replay a run starting from from_node.

        Args:
            run_id: the run-id (or prefix) to replay from
            from_node: the node name to start replay from
            app_factory: zero-argument callable that returns a compiled LangGraph app
            state_type: optional state type class for deserialization (TypedDict or Pydantic)

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
        # nodes at and after from_node must run live (with the fixed code)
        frozen_map: dict[str, list[Any]] = defaultdict(list)
        for s in record.steps:
            if s.node_name == from_node:
                break
            if s.output_dict is not None:
                frozen_map[s.node_name].append(s.output_dict)

        # deserialize the input state
        state_snapshot = step.input_state
        state = safe_deserialize(state_snapshot, state_type)

        pass  # progress is rendered by the CLI layer

        # get fresh graph and attach watcher
        graph = app_factory()

        # Unwrap compiled graphs: LangGraph CompiledGraph exposes the underlying
        # StateGraph via a `.graph` attribute.  Accept it transparently so users
        # don't need to refactor their build functions.
        if hasattr(graph, "invoke") and hasattr(graph, "graph"):
            graph = graph.graph

        # check if factory returns a StateGraph (not compiled)
        if hasattr(graph, "nodes") and not hasattr(graph, "invoke"):
            watcher = ArgusWatcher(max_field_size=self._max_field_size)
            watcher.watch(graph)
            # link this replay run back to the original
            if watcher._session is not None:
                watcher._session.parent_run_id = run_id
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

        # finalize — handles both linear and cyclic graphs
        if watcher is not None:
            watcher.finalize()

        return new_run_id

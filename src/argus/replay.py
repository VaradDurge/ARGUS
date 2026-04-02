from __future__ import annotations

from typing import Any, Callable

from argus.storage import load_run, save_run
from argus.utils.ids import generate_run_id
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

        # deserialize the input state
        state_snapshot = step.input_state
        state = safe_deserialize(state_snapshot, state_type)

        pass  # progress is rendered by the CLI layer

        # get fresh graph and attach watcher
        graph = app_factory()

        # check if factory returns a StateGraph (not compiled)
        if hasattr(graph, "nodes") and not hasattr(graph, "invoke"):
            watcher = ArgusWatcher(max_field_size=self._max_field_size)
            watcher.watch(graph)
            app = graph.compile()
        elif hasattr(graph, "invoke"):
            # factory returned an already-compiled app — wrap with a new watcher
            # Note: for replay accuracy, factory should return StateGraph, not compiled app
            print(
                "[argus replay] WARNING: app_factory returned a compiled app. "
                "For better replay accuracy, return a StateGraph (before compile)."
            )
            app = graph
        else:
            raise ValueError(
                "app_factory must return a LangGraph StateGraph or compiled CompiledGraph."
            )

        result = app.invoke(state)

        return result

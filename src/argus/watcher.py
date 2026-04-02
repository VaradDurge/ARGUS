from __future__ import annotations

import threading
import traceback
from datetime import datetime, timezone
from typing import Any

from argus import __version__
from argus.inspector import build_root_cause_chain, inspect_transition
from argus.models import NodeEvent, RunRecord
from argus.patcher import extract_edge_map, extract_fn, patch_graph
from argus.storage import save_run
from argus.utils.ids import generate_run_id
from argus.utils.serializer import safe_serialize


class ArgusWatcher:
    """2-line integration for LangGraph pipeline monitoring.

    Usage:
        from argus import ArgusWatcher
        watcher = ArgusWatcher()
        watcher.watch(graph)           # call before graph.compile()
        app = graph.compile()
        result = app.invoke(state)     # run normally; argus captures everything
    """

    def __init__(self, max_field_size: int = 50_000) -> None:
        self._max_field_size = max_field_size
        self._session: RunSession | None = None

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

        self._session = RunSession(
            run_id=generate_run_id(),
            graph_node_names=node_names,
            graph_edge_map=edge_map,
            node_fn_registry={},
            max_field_size=self._max_field_size,
        )

        # store references to the original node functions for inspector
        # extract_fn unwraps StateNodeSpec (LangGraph 0.2+) to get the raw callable
        self._session.node_fn_registry = {
            name: extract_fn(graph.nodes[name]) for name in node_names
        }

        patch_graph(graph, self._session)


class RunSession:
    """Manages state capture and event recording for a single pipeline run."""

    def __init__(
        self,
        run_id: str,
        graph_node_names: list[str],
        graph_edge_map: dict[str, list[str]],
        node_fn_registry: dict[str, Any],
        max_field_size: int,
    ) -> None:
        self.run_id = run_id
        self.graph_node_names = graph_node_names
        self.graph_edge_map = graph_edge_map
        self.node_fn_registry = node_fn_registry
        self.max_field_size = max_field_size

        self._lock = threading.Lock()
        self._events: list[NodeEvent] = []
        self._step_index = 0
        self._initial_state: dict[str, Any] = {}
        self._started_at = datetime.now(timezone.utc).isoformat()
        self._completed = False

    def capture_state(self, state: Any) -> dict[str, Any]:
        snap = safe_serialize(state, self.max_field_size)
        if not self._initial_state and snap:
            self._initial_state = snap
        return snap

    def capture_output(self, output: Any) -> dict[str, Any]:
        return safe_serialize(output, self.max_field_size)

    def on_node_start(self, node_name: str, input_snap: dict[str, Any]) -> None:
        pass  # reserved for future streaming / real-time hooks

    def on_node_end(
        self,
        node_name: str,
        input_snap: dict[str, Any],
        output_snap: dict[str, Any] | None,
        duration_ms: float,
        exc: Exception | None,
    ) -> None:
        with self._lock:
            step_idx = self._step_index
            self._step_index += 1

        # determine status
        if exc is not None:
            status = "crashed"
            tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
            exc_str = f"{type(exc).__name__}: {exc}\n{tb}"
        else:
            status = "pass"
            exc_str = None

        # build merged state (input + output merged, as LangGraph would see it)
        merged = dict(input_snap)
        if output_snap:
            merged.update(output_snap)

        # run inspector (skip if crashed — no output to inspect)
        inspection = None
        if exc is None and output_snap is not None:
            successor_fns = self._get_successor_fns(node_name)
            inspection = inspect_transition(
                current_node=node_name,
                output_dict=output_snap,
                merged_state=merged,
                successor_fns=successor_fns,
            )
            if inspection.is_silent_failure:
                status = "fail"

        event = NodeEvent(
            step_index=step_idx,
            node_name=node_name,
            status=status,
            input_state=input_snap,
            output_dict=output_snap,
            duration_ms=round(duration_ms, 2),
            timestamp_utc=datetime.now(timezone.utc).isoformat(),
            exception=exc_str,
            inspection=inspection,
        )

        with self._lock:
            self._events.append(event)

        # finalize if this is the last node or a crash occurred
        if exc is not None or node_name == self._last_expected_node():
            self._finalize()

    def _get_successor_fns(self, node_name: str) -> list[Any]:
        successors = self.graph_edge_map.get(node_name, [])
        fns = []
        for s in successors:
            fn = self.node_fn_registry.get(s)
            if fn is not None:
                fns.append(fn)
        return fns

    def _last_expected_node(self) -> str | None:
        if not self.graph_node_names:
            return None
        return self.graph_node_names[-1]

    def _finalize(self) -> None:
        with self._lock:
            if self._completed:
                return
            self._completed = True  # tentatively mark; reset on save failure below

        completed_at = datetime.now(timezone.utc).isoformat()

        # compute duration
        try:
            start = datetime.fromisoformat(self._started_at)
            end = datetime.fromisoformat(completed_at)
            duration_ms = (end - start).total_seconds() * 1000
        except Exception:
            duration_ms = None

        # determine overall status
        has_crash = any(e.status == "crashed" for e in self._events)
        has_silent_failure = any(
            e.inspection and e.inspection.is_silent_failure for e in self._events
        )

        if has_crash:
            overall_status = "crashed"
        elif has_silent_failure:
            overall_status = "silent_failure"
        else:
            overall_status = "clean"

        # find first failure step
        first_failure = None
        for e in self._events:
            if e.status in ("fail", "crashed"):
                first_failure = e.node_name
                break

        root_cause_chain = build_root_cause_chain(self._events)

        record = RunRecord(
            run_id=self.run_id,
            argus_version=__version__,
            started_at=self._started_at,
            completed_at=completed_at,
            duration_ms=round(duration_ms, 2) if duration_ms is not None else None,
            overall_status=overall_status,
            first_failure_step=first_failure,
            root_cause_chain=root_cause_chain,
            graph_node_names=self.graph_node_names,
            graph_edge_map=self.graph_edge_map,
            initial_state=self._initial_state,
            steps=list(self._events),
        )

        try:
            save_run(record)
        except Exception:
            # Reset so force_finalize() can retry without re-raising here
            # (re-raising would suppress the original pipeline exception in the patcher)
            with self._lock:
                self._completed = False

    def force_finalize(self) -> None:
        """Force finalization — call after app.invoke() returns if auto-finalize missed."""
        self._finalize()

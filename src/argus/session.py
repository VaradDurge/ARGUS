"""ArgusSession — framework-agnostic monitoring session.

Works with any Python pipeline: LangGraph, Prefect, Temporal, raw functions, etc.
ArgusWatcher is a thin LangGraph adapter that builds an ArgusSession internally.

Usage without LangGraph:
    from argus import ArgusSession

    session = ArgusSession(validators={
        "validate": lambda out: (out.get("score", 0) > 0.5, "Score too low"),
        "*": lambda out: ("error" not in out, f"Node error: {out.get('error')}"),
    })
    session.set_edges({"fetch": ["validate"], "validate": ["process"]})

    fetch   = session.wrap("fetch",    fetch_fn)
    validate = session.wrap("validate", validate_fn)
    process  = session.wrap("process",  process_fn)

    state = fetch(initial_state)
    state = validate(state)
    state = process(state)
    session.finalize()
"""
from __future__ import annotations

import asyncio
import functools
import threading
import time
import traceback
from datetime import datetime, timezone
from typing import Any, Callable

from argus import __version__
from argus.inspector import build_root_cause_chain, inspect_transition
from argus.models import NodeEvent, RunRecord, ValidatorResult
from argus.storage import save_run
from argus.utils.cycle_detection import has_cycles
from argus.utils.ids import generate_run_id
from argus.utils.serializer import safe_serialize

# Optional GraphInterrupt import — only available when langgraph is installed
try:
    from langgraph.errors import GraphInterrupt as _GraphInterrupt  # type: ignore[import]
except ImportError:
    _GraphInterrupt = None  # type: ignore[assignment,misc]


class ArgusSession:
    """Framework-agnostic monitoring session.

    Captures state, validates transitions, and saves a RunRecord on finalize().
    Can be used standalone (via wrap()) or driven by ArgusWatcher (via LangGraph).
    """

    def __init__(
        self,
        run_id: str | None = None,
        max_field_size: int = 50_000,
        validators: dict[str, Callable[[dict], tuple[bool, str]]] | None = None,
        parent_run_id: str | None = None,
    ) -> None:
        self.run_id: str = run_id or generate_run_id()
        self.max_field_size = max_field_size
        self.graph_node_names: list[str] = []
        self.graph_edge_map: dict[str, list[str]] = {}
        self.node_fn_registry: dict[str, Any] = {}

        # validator map: key is node name or "*" (wildcard)
        self._validators: dict[str, Callable[[dict], tuple[bool, str]]] = validators or {}

        self._lock = threading.Lock()
        self._events: list[NodeEvent] = []
        self._step_index = 0
        self._initial_state: dict[str, Any] = {}
        self._started_at = datetime.now(timezone.utc).isoformat()
        self._completed = False
        self._is_cyclic = False
        self._node_attempt_counts: dict[str, int] = {}

        # set by ReplayEngine or ArgusWatcher for linked runs
        self.parent_run_id: str | None = parent_run_id
        self.replay_from_step: str | None = None

    # ── Public configuration ─────────────────────────────────────────────────

    def set_edges(self, edge_map: dict[str, list[str]]) -> None:
        """Register the pipeline topology. Enables cycle detection and successor validation."""
        self.graph_edge_map = edge_map
        self._is_cyclic = has_cycles(edge_map)

    def set_node_names(self, names: list[str]) -> None:
        """Register ordered node names. Used for last-node auto-finalization."""
        self.graph_node_names = names

    # ── Function wrapping (framework-agnostic entry point) ───────────────────

    def wrap(self, node_name: str, fn: Callable) -> Callable:
        """Return a monitored version of fn. Works with sync and async functions."""
        if asyncio.iscoroutinefunction(fn):
            return self._make_async_wrapper(node_name, fn)
        return self._make_sync_wrapper(node_name, fn)

    def instrument(
        self,
        agents: dict[str, Callable],
        edges: dict[str, list[str]] | None = None,
    ) -> dict[str, Callable]:
        """Wrap all agents at once. Returns a dict of the same keys with monitored functions.

        Args:
            agents: mapping of {node_name: function} for every agent in your pipeline.
            edges:  optional topology — same as calling set_edges() separately.

        Example (15 agents):
            wrapped = session.instrument(
                agents={
                    "fetch":    fetch_fn,
                    "validate": validate_fn,
                    "process":  process_fn,
                    # ... all 15
                },
                edges={
                    "fetch":    ["validate"],
                    "validate": ["process"],
                    # ...
                },
            )
            state = wrapped["fetch"](state)
            state = wrapped["validate"](state)
        """
        if edges is not None:
            self.set_edges(edges)
        # register node order from insertion order (Python 3.7+)
        self.set_node_names(list(agents.keys()))
        # populate node_fn_registry with original functions so that
        # inspect_transition can read successor type annotations
        self.node_fn_registry.update(agents)
        return {name: self.wrap(name, fn) for name, fn in agents.items()}

    def node(self, node_name: str) -> Callable:
        """Decorator — instruments the function at definition time.

        Example:
            session = ArgusSession()

            @session.node("fetch")
            def fetch(state):
                ...

            @session.node("validate")
            def validate(state):
                ...
        """
        def decorator(fn: Callable) -> Callable:
            wrapped = self.wrap(node_name, fn)
            # Register name so node list stays up to date
            if node_name not in self.graph_node_names:
                self.graph_node_names.append(node_name)
            return wrapped
        return decorator

    def _make_sync_wrapper(self, node_name: str, original_fn: Callable) -> Callable:
        @functools.wraps(original_fn)
        def _wrapped(state: Any) -> Any:
            input_snap = self.capture_state(state)
            self.on_node_start(node_name, input_snap)
            t0 = time.perf_counter()
            try:
                output = original_fn(state)
                duration = (time.perf_counter() - t0) * 1000
                output_snap = self.capture_output(output)
                self.on_node_end(node_name, input_snap, output_snap, duration, exc=None)
                return output
            except Exception as exc:
                duration = (time.perf_counter() - t0) * 1000
                # Detect GraphInterrupt before treating as crash
                if _GraphInterrupt is not None and isinstance(exc, _GraphInterrupt):
                    self.on_node_end(
                        node_name, input_snap, None, duration, exc=None, is_interrupt=True
                    )
                    raise
                self.on_node_end(node_name, input_snap, None, duration, exc=exc)
                raise

        return _wrapped

    def _make_async_wrapper(self, node_name: str, original_fn: Callable) -> Callable:
        @functools.wraps(original_fn)
        async def _wrapped(state: Any) -> Any:
            input_snap = self.capture_state(state)
            self.on_node_start(node_name, input_snap)
            t0 = time.perf_counter()
            try:
                output = await original_fn(state)
                duration = (time.perf_counter() - t0) * 1000
                output_snap = self.capture_output(output)
                self.on_node_end(node_name, input_snap, output_snap, duration, exc=None)
                return output
            except Exception as exc:
                duration = (time.perf_counter() - t0) * 1000
                if _GraphInterrupt is not None and isinstance(exc, _GraphInterrupt):
                    self.on_node_end(
                        node_name, input_snap, None, duration, exc=None, is_interrupt=True
                    )
                    raise
                self.on_node_end(node_name, input_snap, None, duration, exc=exc)
                raise

        return _wrapped

    # ── State capture ─────────────────────────────────────────────────────────

    def capture_state(self, state: Any) -> dict[str, Any]:
        snap = safe_serialize(state, self.max_field_size)
        if not self._initial_state and snap:
            self._initial_state = snap
        return snap

    def capture_output(self, output: Any) -> dict[str, Any]:
        return safe_serialize(output, self.max_field_size)

    # ── Event recording ───────────────────────────────────────────────────────

    def on_node_start(self, node_name: str, input_snap: dict[str, Any]) -> None:
        pass  # reserved for future streaming / real-time hooks

    def on_node_end(
        self,
        node_name: str,
        input_snap: dict[str, Any],
        output_snap: dict[str, Any] | None,
        duration_ms: float,
        exc: Exception | None,
        is_interrupt: bool = False,
    ) -> None:
        with self._lock:
            step_idx = self._step_index
            self._step_index += 1
            attempt_idx = self._node_attempt_counts.get(node_name, 0)
            self._node_attempt_counts[node_name] = attempt_idx + 1

        # determine status
        if is_interrupt:
            status = "interrupted"
            exc_str = None
        elif exc is not None:
            status = "crashed"
            tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
            exc_str = f"{type(exc).__name__}: {exc}\n{tb}"
        else:
            status = "pass"
            exc_str = None

        # build merged state (input + output merged, as successor would see it)
        merged = dict(input_snap)
        if output_snap:
            merged.update(output_snap)

        # structural inspection (skip on crash or interrupt)
        inspection = None
        if status == "pass" and output_snap is not None:
            successor_fns = self._get_successor_fns(node_name)
            inspection = inspect_transition(
                current_node=node_name,
                output_dict=output_snap,
                merged_state=merged,
                successor_fns=successor_fns,
            )
            if inspection.is_silent_failure:
                status = "fail"

        # semantic validation (skip on crash/interrupt)
        validator_results: list[ValidatorResult] = []
        if output_snap is not None and status in ("pass", "fail"):
            validator_results = self._run_validators(node_name, output_snap)
            if any(not r.is_valid for r in validator_results) and status == "pass":
                status = "semantic_fail"

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
            attempt_index=attempt_idx,
            validator_results=validator_results,
        )

        with self._lock:
            self._events.append(event)

        # auto-finalize: on crash/interrupt always; on last-node only for non-cyclic
        should_finalize = (
            status in ("crashed", "interrupted")
            or (not self._is_cyclic and node_name == self._last_expected_node())
        )
        if should_finalize:
            self._finalize()

    def _run_validators(self, node_name: str, output_snap: dict) -> list[ValidatorResult]:
        results: list[ValidatorResult] = []
        # wildcard runs first, then node-specific
        for key in ("*", node_name):
            fn = self._validators.get(key)
            if fn is None:
                continue
            fn_name = getattr(fn, "__name__", "lambda")
            vname = f"{key}:{fn_name}"
            try:
                is_valid, message = fn(output_snap)
            except Exception as ve:
                is_valid, message = False, f"Validator raised: {ve}"
            results.append(
                ValidatorResult(validator_name=vname, is_valid=is_valid, message=message)
            )
        return results

    def _get_successor_fns(self, node_name: str) -> list[Any]:
        successors = self.graph_edge_map.get(node_name, [])
        return [self.node_fn_registry[s] for s in successors if s in self.node_fn_registry]

    def _last_expected_node(self) -> str | None:
        return self.graph_node_names[-1] if self.graph_node_names else None

    # ── Finalization ──────────────────────────────────────────────────────────

    def _finalize(self) -> None:
        with self._lock:
            if self._completed:
                return
            self._completed = True

        completed_at = datetime.now(timezone.utc).isoformat()

        try:
            start = datetime.fromisoformat(self._started_at)
            end = datetime.fromisoformat(completed_at)
            duration_ms: float | None = (end - start).total_seconds() * 1000
        except Exception:
            duration_ms = None

        has_crash = any(e.status == "crashed" for e in self._events)
        has_interrupt = any(e.status == "interrupted" for e in self._events)
        has_silent_failure = any(
            e.inspection and e.inspection.is_silent_failure for e in self._events
        )
        has_semantic_fail = any(e.status == "semantic_fail" for e in self._events)

        if has_crash:
            overall_status = "crashed"
        elif has_interrupt:
            overall_status = "interrupted"
        elif has_silent_failure or has_semantic_fail:
            overall_status = "silent_failure"
        else:
            overall_status = "clean"

        _fail_statuses = ("fail", "crashed", "semantic_fail")
        first_failure = next(
            (e.node_name for e in self._events if e.status in _fail_statuses),
            None,
        )

        interrupt_node = next(
            (e.node_name for e in self._events if e.status == "interrupted"),
            None,
        )

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
            is_cyclic=self._is_cyclic,
            parent_run_id=self.parent_run_id,
            replay_from_step=self.replay_from_step,
            interrupted=has_interrupt,
            interrupt_node=interrupt_node,
        )

        try:
            save_run(record)
        except Exception:
            with self._lock:
                self._completed = False

    def finalize(self) -> None:
        """Persist the run record. Required for cyclic graphs after app.invoke() returns."""
        self._finalize()

    def force_finalize(self) -> None:
        """Alias for finalize() — used by legacy code and replay engine."""
        self._finalize()

from __future__ import annotations

import dataclasses
import json
import os
from pathlib import Path
from typing import Any

from argus.models import InspectionResult, FieldMismatch, NodeEvent, RunRecord

_ARGUS_DIR = ".argus"
_RUNS_DIR = "runs"


def _runs_path() -> Path:
    base = Path(os.getcwd()) / _ARGUS_DIR / _RUNS_DIR
    base.mkdir(parents=True, exist_ok=True)
    return base


def _to_json_serializable(obj: Any) -> Any:
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: _to_json_serializable(v) for k, v in dataclasses.asdict(obj).items()}
    if isinstance(obj, dict):
        return {k: _to_json_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_json_serializable(i) for i in obj]
    return str(obj)


def save_run(record: RunRecord) -> Path:
    """Write a completed RunRecord to .argus/runs/<run-id>.json atomically."""
    path = _runs_path() / f"{record.run_id}.json"
    tmp = path.with_suffix(".tmp")
    data = _to_json_serializable(record)
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.rename(path)
    return path


def load_run(run_id: str) -> RunRecord:
    """Load a RunRecord by run-id (or 8-char prefix)."""
    runs_dir = _runs_path()
    path = _resolve_run_path(run_id, runs_dir)
    data = json.loads(path.read_text(encoding="utf-8"))
    return _deserialize_run(data)


def list_runs() -> list[dict[str, Any]]:
    """Return summary metadata for all runs, newest first."""
    runs_dir = _runs_path()
    summaries = []
    for f in sorted(runs_dir.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            summaries.append({
                "run_id": data.get("run_id", f.stem),
                "started_at": data.get("started_at", ""),
                "overall_status": data.get("overall_status", "unknown"),
                "duration_ms": data.get("duration_ms"),
                "step_count": len(data.get("steps", [])),
            })
        except Exception:
            continue
    return summaries


def last_run_id() -> str | None:
    runs_dir = _runs_path()
    files = sorted(runs_dir.glob("*.json"), reverse=True)
    if not files:
        return None
    data = json.loads(files[0].read_text(encoding="utf-8"))
    return data.get("run_id")


def _resolve_run_path(run_id: str, runs_dir: Path) -> Path:
    exact = runs_dir / f"{run_id}.json"
    if exact.exists():
        return exact
    # prefix match
    matches = [f for f in runs_dir.glob("*.json") if f.stem.startswith(run_id)]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise ValueError(f"Ambiguous run-id prefix '{run_id}' matches: {[f.stem for f in matches]}")
    raise FileNotFoundError(f"No run found for id '{run_id}' in {runs_dir}")


def _deserialize_run(data: dict[str, Any]) -> RunRecord:
    steps = [_deserialize_event(s) for s in data.get("steps", [])]
    return RunRecord(
        run_id=data["run_id"],
        argus_version=data.get("argus_version", "unknown"),
        started_at=data.get("started_at", ""),
        completed_at=data.get("completed_at"),
        duration_ms=data.get("duration_ms"),
        overall_status=data.get("overall_status", "unknown"),
        first_failure_step=data.get("first_failure_step"),
        root_cause_chain=data.get("root_cause_chain", []),
        graph_node_names=data.get("graph_node_names", []),
        graph_edge_map=data.get("graph_edge_map", {}),
        initial_state=data.get("initial_state", {}),
        steps=steps,
        parent_run_id=data.get("parent_run_id"),
        replay_from_step=data.get("replay_from_step"),
    )


def _deserialize_event(data: dict[str, Any]) -> NodeEvent:
    insp_data = data.get("inspection")
    inspection = None
    if insp_data:
        mismatches = [
            FieldMismatch(**m) for m in insp_data.get("type_mismatches", [])
        ]
        inspection = InspectionResult(
            is_silent_failure=insp_data.get("is_silent_failure", False),
            missing_fields=insp_data.get("missing_fields", []),
            empty_fields=insp_data.get("empty_fields", []),
            type_mismatches=mismatches,
            severity=insp_data.get("severity", "ok"),
            message=insp_data.get("message", ""),
        )
    return NodeEvent(
        step_index=data.get("step_index", 0),
        node_name=data.get("node_name", ""),
        status=data.get("status", "pass"),
        input_state=data.get("input_state", {}),
        output_dict=data.get("output_dict"),
        duration_ms=data.get("duration_ms", 0.0),
        timestamp_utc=data.get("timestamp_utc", ""),
        exception=data.get("exception"),
        inspection=inspection,
    )

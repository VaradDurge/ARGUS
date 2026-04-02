from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FieldMismatch:
    field_name: str
    expected_type: str
    actual_type: str
    actual_value_repr: str


@dataclass
class InspectionResult:
    is_silent_failure: bool
    missing_fields: list[str]
    empty_fields: list[str]
    type_mismatches: list[FieldMismatch]
    severity: str  # "critical" | "warning" | "info" | "ok"
    message: str


@dataclass
class NodeEvent:
    step_index: int
    node_name: str
    status: str  # "pass" | "fail" | "crashed"
    input_state: dict[str, Any]
    output_dict: dict[str, Any] | None
    duration_ms: float
    timestamp_utc: str
    exception: str | None = None
    inspection: InspectionResult | None = None


@dataclass
class RunRecord:
    run_id: str
    argus_version: str
    started_at: str
    completed_at: str | None
    duration_ms: float | None
    overall_status: str  # "clean" | "silent_failure" | "crashed"
    first_failure_step: str | None
    root_cause_chain: list[str]
    graph_node_names: list[str]
    graph_edge_map: dict[str, list[str]]
    initial_state: dict[str, Any]
    steps: list[NodeEvent] = field(default_factory=list)
    parent_run_id: str | None = None
    replay_from_step: str | None = None

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ValidatorResult:
    validator_name: str   # e.g. "*:check_length" or "summarize:my_fn"
    is_valid: bool
    message: str


@dataclass
class FieldMismatch:
    field_name: str
    expected_type: str
    actual_type: str
    actual_value_repr: str


@dataclass
class ToolFailure:
    # "error_response" | "rate_limit" | "empty_result" | "error_in_data" | "partial_failure"
    failure_type: str
    field_name: str    # which key in the output dict triggered detection
    severity: str      # "critical" | "warning"
    evidence: str      # short human-readable description of what was found


@dataclass
class InspectionResult:
    is_silent_failure: bool
    missing_fields: list[str]
    empty_fields: list[str]
    type_mismatches: list[FieldMismatch]
    severity: str  # "critical" | "warning" | "info" | "ok"
    message: str
    unannotated_successors: list[str] = field(default_factory=list)
    suspicious_empty_keys: list[str] = field(default_factory=list)
    tool_failures: list[ToolFailure] = field(default_factory=list)
    has_tool_failure: bool = False  # True if any tool_failures with severity="critical"


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
    attempt_index: int = 0  # how many times this node has run before this event (0-indexed)
    validator_results: list[ValidatorResult] = field(default_factory=list)
    is_subgraph_entry: bool = False   # True if this node is a compiled subgraph
    subgraph_run_id: str | None = None  # run_id of the child session for subgraph nodes


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
    is_cyclic: bool = False  # True if the graph contains back-edges
    subgraph_run_ids: list[str] = field(default_factory=list)  # child run ids
    interrupted: bool = False        # True if a GraphInterrupt occurred
    interrupt_node: str | None = None  # node name where interrupt occurred

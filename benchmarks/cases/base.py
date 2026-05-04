from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class BenchmarkCase:
    id: str
    fault_type: str  # "silent_failure" | "crash" | "semantic_fail" | "multi_hop" | "clean"
    true_fault_node: str | None  # ground-truth root cause; None for clean runs
    description: str
    nodes: list[str]             # execution order
    edges: dict[str, list[str]]  # topology
    node_fns: dict[str, Callable]
    initial_state: dict[str, Any]
    validators: dict[str, Callable] | None = None


@dataclass
class CaseResult:
    case_id: str
    fault_type: str
    true_fault_node: str | None
    # ARGUS
    argus_detected: bool
    argus_root_cause: str | None   # first_failure_step from RunRecord
    argus_overall_status: str
    # Naive monitor (exception-only, simulates LangSmith)
    naive_detected: bool
    naive_crash_node: str | None   # node that raised exception (naive's "root cause")

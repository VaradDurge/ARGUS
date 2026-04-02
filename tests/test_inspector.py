"""Tests for argus.inspector — inspect_transition and build_root_cause_chain."""
from __future__ import annotations

from typing import TypedDict

from argus.inspector import build_root_cause_chain, inspect_transition
from argus.models import InspectionResult, NodeEvent


# ── helpers ──────────────────────────────────────────────────────────────────

class _GradeState(TypedDict):
    documents: list
    grade: str


class _GenerateState(TypedDict):
    grade: str
    answer: str


def _successor_fn(state: _GradeState) -> dict:  # noqa: ARG001
    return {}


def _generate_fn(state: _GenerateState) -> dict:  # noqa: ARG001
    return {}


# ── inspect_transition tests ──────────────────────────────────────────────────

def test_no_successors_returns_ok() -> None:
    result = inspect_transition(
        current_node="last_node",
        output_dict={"x": 1},
        merged_state={"x": 1},
        successor_fns=[],
    )
    assert result.severity == "ok"
    assert not result.is_silent_failure


def test_none_output_returns_ok() -> None:
    result = inspect_transition(
        current_node="node",
        output_dict=None,
        merged_state={},
        successor_fns=[_successor_fn],
    )
    assert not result.is_silent_failure
    assert result.severity == "ok"


def test_missing_required_field_is_critical() -> None:
    # merged_state has 'documents' but is missing 'grade'
    result = inspect_transition(
        current_node="retrieve",
        output_dict={"documents": ["doc1"]},
        merged_state={"documents": ["doc1"]},
        successor_fns=[_successor_fn],
    )
    assert result.is_silent_failure
    assert result.severity == "critical"
    assert "grade" in result.missing_fields


def test_all_required_fields_present_is_ok() -> None:
    result = inspect_transition(
        current_node="grade_docs",
        output_dict={"documents": ["d1"], "grade": "relevant"},
        merged_state={"documents": ["d1"], "grade": "relevant"},
        successor_fns=[_successor_fn],
    )
    assert not result.is_silent_failure
    assert result.severity == "ok"
    assert result.missing_fields == []


def test_empty_required_field_is_silent_failure() -> None:
    # grade is required and empty — treated as missing, not just a warning
    result = inspect_transition(
        current_node="grade_docs",
        output_dict={"documents": ["d1"], "grade": ""},
        merged_state={"documents": ["d1"], "grade": ""},
        successor_fns=[_successor_fn],
    )
    assert result.is_silent_failure
    assert result.severity == "critical"
    assert "grade" in result.missing_fields


def test_empty_required_list_is_silent_failure() -> None:
    # documents is required; empty list means nothing was produced
    result = inspect_transition(
        current_node="retrieve",
        output_dict={"documents": [], "grade": "ok"},
        merged_state={"documents": [], "grade": "ok"},
        successor_fns=[_successor_fn],
    )
    assert result.is_silent_failure
    assert result.severity == "critical"
    assert "documents" in result.missing_fields


def test_type_mismatch_str_field_is_warning() -> None:
    # _GradeState expects grade: str, but we pass an int
    result = inspect_transition(
        current_node="grade_docs",
        output_dict={"documents": ["d1"], "grade": 99},
        merged_state={"documents": ["d1"], "grade": 99},
        successor_fns=[_successor_fn],
    )
    assert result.severity == "warning"
    mismatch_fields = [m.field_name for m in result.type_mismatches]
    assert "grade" in mismatch_fields


def test_successor_without_type_annotation_skipped() -> None:
    def _untyped_fn(state) -> dict:  # no type annotation
        return {}

    result = inspect_transition(
        current_node="node",
        output_dict={"x": 1},
        merged_state={"x": 1},
        successor_fns=[_untyped_fn],
    )
    assert result.severity == "ok"


def test_multiple_successors_union_of_issues() -> None:
    # generate_fn requires 'grade' AND 'answer'; merged state has neither
    result = inspect_transition(
        current_node="start",
        output_dict={},
        merged_state={},
        successor_fns=[_generate_fn],
    )
    assert result.is_silent_failure
    missing = set(result.missing_fields)
    assert "grade" in missing
    assert "answer" in missing


# ── build_root_cause_chain tests ──────────────────────────────────────────────

def _make_event(node: str, is_fail: bool, missing: list[str] | None = None) -> NodeEvent:
    insp = None
    if missing is not None:
        insp = InspectionResult(
            is_silent_failure=bool(missing),
            missing_fields=missing,
            empty_fields=[],
            type_mismatches=[],
            severity="critical" if missing else "ok",
            message="",
        )
    return NodeEvent(
        step_index=0,
        node_name=node,
        status="fail" if is_fail else "pass",
        input_state={},
        output_dict={},
        duration_ms=100.0,
        timestamp_utc="2026-04-01T00:00:00+00:00",
        inspection=insp,
    )


def test_no_failures_empty_chain() -> None:
    events = [
        _make_event("a", is_fail=False),
        _make_event("b", is_fail=False),
    ]
    chain = build_root_cause_chain(events)
    assert chain == []


def test_single_failure_chain() -> None:
    events = [
        _make_event("retrieve", is_fail=False),
        _make_event("grade_docs", is_fail=True, missing=["grade"]),
        _make_event("generate", is_fail=False),
    ]
    chain = build_root_cause_chain(events)
    assert "grade_docs" in chain


def test_chain_includes_origin_node() -> None:
    # retrieve produces empty docs, grade_docs then fails on missing grade
    empty_insp = InspectionResult(
        is_silent_failure=False,
        missing_fields=[],
        empty_fields=["documents"],
        type_mismatches=[],
        severity="warning",
        message="",
    )
    retrieve_event = NodeEvent(
        step_index=0,
        node_name="retrieve",
        status="pass",
        input_state={},
        output_dict={"documents": []},
        duration_ms=100.0,
        timestamp_utc="2026-04-01T00:00:00+00:00",
        inspection=empty_insp,
    )
    grade_event = _make_event("grade_docs", is_fail=True, missing=["grade"])
    chain = build_root_cause_chain([retrieve_event, grade_event])
    assert "grade_docs" in chain

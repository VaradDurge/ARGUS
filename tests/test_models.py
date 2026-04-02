"""Tests for argus.models dataclasses."""
from __future__ import annotations

import dataclasses

from argus.models import FieldMismatch, InspectionResult, NodeEvent, RunRecord


def test_field_mismatch_construction() -> None:
    m = FieldMismatch(
        field_name="grade",
        expected_type="str",
        actual_type="int",
        actual_value_repr="42",
    )
    assert m.field_name == "grade"
    assert m.expected_type == "str"
    assert m.actual_type == "int"
    assert m.actual_value_repr == "42"


def test_inspection_result_ok() -> None:
    r = InspectionResult(
        is_silent_failure=False,
        missing_fields=[],
        empty_fields=[],
        type_mismatches=[],
        severity="ok",
        message="All checks passed",
    )
    assert not r.is_silent_failure
    assert r.severity == "ok"


def test_inspection_result_critical() -> None:
    r = InspectionResult(
        is_silent_failure=True,
        missing_fields=["grade"],
        empty_fields=[],
        type_mismatches=[],
        severity="critical",
        message="Missing required fields: grade",
    )
    assert r.is_silent_failure
    assert "grade" in r.missing_fields
    assert r.severity == "critical"


def test_node_event_defaults() -> None:
    e = NodeEvent(
        step_index=0,
        node_name="retrieve",
        status="pass",
        input_state={"query": "hello"},
        output_dict={"documents": ["doc1"]},
        duration_ms=100.0,
        timestamp_utc="2026-04-01T00:00:00+00:00",
    )
    assert e.exception is None
    assert e.inspection is None
    assert e.step_index == 0


def test_node_event_with_inspection() -> None:
    insp = InspectionResult(
        is_silent_failure=True,
        missing_fields=["grade"],
        empty_fields=[],
        type_mismatches=[],
        severity="critical",
        message="Missing required fields: grade",
    )
    e = NodeEvent(
        step_index=1,
        node_name="grade_documents",
        status="fail",
        input_state={"documents": ["doc1"]},
        output_dict={},
        duration_ms=200.0,
        timestamp_utc="2026-04-01T00:00:01+00:00",
        inspection=insp,
    )
    assert e.inspection is not None
    assert e.inspection.is_silent_failure


def test_run_record_defaults() -> None:
    record = RunRecord(
        run_id="20260401-000000-abc123",
        argus_version="0.1.0",
        started_at="2026-04-01T00:00:00+00:00",
        completed_at="2026-04-01T00:00:01+00:00",
        duration_ms=1000.0,
        overall_status="clean",
        first_failure_step=None,
        root_cause_chain=[],
        graph_node_names=["a", "b"],
        graph_edge_map={"a": ["b"]},
        initial_state={"query": "hello"},
    )
    assert record.steps == []
    assert record.parent_run_id is None
    assert record.replay_from_step is None


def test_run_record_is_dataclass() -> None:
    assert dataclasses.is_dataclass(RunRecord)
    assert dataclasses.is_dataclass(NodeEvent)
    assert dataclasses.is_dataclass(InspectionResult)
    assert dataclasses.is_dataclass(FieldMismatch)

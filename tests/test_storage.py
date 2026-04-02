"""Tests for argus.storage — save/load/list run JSON files."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from argus.models import InspectionResult, NodeEvent, RunRecord
from argus.storage import last_run_id, list_runs, load_run, save_run


def _make_record(run_id: str = "20260401-000000-aaa111", overall_status: str = "clean") -> RunRecord:
    event = NodeEvent(
        step_index=0,
        node_name="node_a",
        status="pass",
        input_state={"x": 1},
        output_dict={"y": 2},
        duration_ms=50.0,
        timestamp_utc="2026-04-01T00:00:00+00:00",
    )
    return RunRecord(
        run_id=run_id,
        argus_version="0.1.0",
        started_at="2026-04-01T00:00:00+00:00",
        completed_at="2026-04-01T00:00:01+00:00",
        duration_ms=1000.0,
        overall_status=overall_status,
        first_failure_step=None,
        root_cause_chain=[],
        graph_node_names=["node_a"],
        graph_edge_map={},
        initial_state={"x": 1},
        steps=[event],
    )


@pytest.fixture(autouse=True)
def use_tmp_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Run each test with a fresh working directory so .argus/runs/ is isolated."""
    monkeypatch.chdir(tmp_path)


def test_save_creates_json_file() -> None:
    record = _make_record()
    path = save_run(record)
    assert path.exists()
    assert path.suffix == ".json"
    data = json.loads(path.read_text())
    assert data["run_id"] == "20260401-000000-aaa111"
    assert data["overall_status"] == "clean"
    assert len(data["steps"]) == 1


def test_load_round_trips_record() -> None:
    record = _make_record()
    save_run(record)
    loaded = load_run(record.run_id)
    assert loaded.run_id == record.run_id
    assert loaded.overall_status == record.overall_status
    assert loaded.duration_ms == record.duration_ms
    assert len(loaded.steps) == 1
    assert loaded.steps[0].node_name == "node_a"
    assert loaded.steps[0].input_state == {"x": 1}
    assert loaded.steps[0].output_dict == {"y": 2}


def test_load_by_prefix() -> None:
    record = _make_record(run_id="20260401-000000-bbb222")
    save_run(record)
    # 8-char prefix
    loaded = load_run("20260401")
    assert loaded.run_id == "20260401-000000-bbb222"


def test_load_raises_for_unknown_run() -> None:
    with pytest.raises(FileNotFoundError):
        load_run("nonexistent-run-id")


def test_list_runs_empty() -> None:
    result = list_runs()
    assert result == []


def test_list_runs_returns_summaries() -> None:
    save_run(_make_record("20260401-000001-aaa001", "clean"))
    save_run(_make_record("20260401-000002-bbb002", "silent_failure"))
    runs = list_runs()
    assert len(runs) == 2
    statuses = {r["overall_status"] for r in runs}
    assert "clean" in statuses
    assert "silent_failure" in statuses


def test_list_runs_reverse_chronological() -> None:
    save_run(_make_record("20260401-000001-aaa001"))
    save_run(_make_record("20260402-000001-bbb001"))
    runs = list_runs()
    # sorted by filename descending → 20260402 first
    assert runs[0]["run_id"].startswith("20260402")


def test_last_run_id_none_when_empty() -> None:
    assert last_run_id() is None


def test_last_run_id_returns_most_recent() -> None:
    save_run(_make_record("20260401-000001-aaa001"))
    save_run(_make_record("20260402-000001-bbb001"))
    rid = last_run_id()
    assert rid is not None
    assert rid.startswith("20260402")


def test_save_with_inspection() -> None:
    insp = InspectionResult(
        is_silent_failure=True,
        missing_fields=["grade"],
        empty_fields=[],
        type_mismatches=[],
        severity="critical",
        message="Missing required fields: grade",
    )
    event = NodeEvent(
        step_index=0,
        node_name="grade_docs",
        status="fail",
        input_state={"docs": ["doc1"]},
        output_dict={},
        duration_ms=100.0,
        timestamp_utc="2026-04-01T00:00:00+00:00",
        inspection=insp,
    )
    record = RunRecord(
        run_id="20260401-000000-ccc333",
        argus_version="0.1.0",
        started_at="2026-04-01T00:00:00+00:00",
        completed_at="2026-04-01T00:00:01+00:00",
        duration_ms=500.0,
        overall_status="silent_failure",
        first_failure_step="grade_docs",
        root_cause_chain=["grade_docs"],
        graph_node_names=["grade_docs"],
        graph_edge_map={},
        initial_state={"docs": ["doc1"]},
        steps=[event],
    )
    save_run(record)
    loaded = load_run(record.run_id)
    assert loaded.steps[0].inspection is not None
    assert loaded.steps[0].inspection.is_silent_failure
    assert "grade" in loaded.steps[0].inspection.missing_fields

"""Integration test: ArgusWatcher on a toy 3-node pipeline with a silent failure.

Requires langgraph to be installed. Skipped if not available.
"""
from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import pytest

langgraph = pytest.importorskip("langgraph", reason="langgraph not installed")

from langgraph.graph import StateGraph  # noqa: E402


# Full state schema for the StateGraph
class _PipelineState(TypedDict):
    query: str
    documents: list[str]
    grade: str
    answer: str


# Per-node input type annotations — the inspector checks the SUCCESSOR's
# first-param annotation to know what fields it requires.
class _GradeInput(TypedDict):
    """What grade_documents needs: query + documents (not grade yet)."""
    query: str
    documents: list[str]


class _GenerateInput(TypedDict):
    """What generate needs: must have grade."""
    query: str
    documents: list[str]
    grade: str


def _node_retrieve(state: _PipelineState) -> dict:
    """Produces documents."""
    return {"documents": ["doc1", "doc2"]}


def _node_grade(state: _GradeInput) -> dict:  # type: ignore[misc]
    # The inspector checks THIS annotation after 'retrieve' runs.
    # _GradeInput only requires query+documents, so retrieve's output is OK.
    # Silent failure: should return {"grade": "relevant"} but returns {} instead.
    return {}


def _node_generate(state: _GenerateInput) -> dict:  # type: ignore[misc]
    # The inspector checks THIS annotation after 'grade_documents' runs.
    # _GenerateInput requires 'grade', which is absent → CRITICAL silent failure.
    grade = state.get("grade", "MISSING")  # type: ignore[call-overload]
    return {"answer": f"Answer based on grade={grade}"}


@pytest.fixture(autouse=True)
def use_tmp_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)


def test_silent_failure_detected() -> None:
    from argus import ArgusWatcher
    from argus.storage import last_run_id, load_run

    graph = StateGraph(_PipelineState)
    graph.add_node("retrieve", _node_retrieve)
    graph.add_node("grade_documents", _node_grade)
    graph.add_node("generate", _node_generate)
    graph.add_edge("retrieve", "grade_documents")
    graph.add_edge("grade_documents", "generate")
    graph.set_entry_point("retrieve")
    graph.set_finish_point("generate")

    watcher = ArgusWatcher()
    watcher.watch(graph)

    app = graph.compile()
    # Initial state intentionally omits 'grade' and 'answer' — grade_documents
    # should set 'grade' but returns {} (the silent failure we're testing for).
    app.invoke({"query": "what is rag?", "documents": []})

    # force finalize in case auto-finalize missed it
    if watcher._session:
        watcher._session.force_finalize()

    run_id = last_run_id()
    assert run_id is not None, "No run was saved"

    record = load_run(run_id)
    assert record.overall_status == "silent_failure", (
        f"Expected silent_failure but got {record.overall_status}"
    )

    # first failure should be at grade_documents (it dropped 'grade')
    assert record.first_failure_step == "grade_documents", (
        f"Expected grade_documents, got {record.first_failure_step}"
    )

    # root cause chain must include grade_documents
    assert "grade_documents" in record.root_cause_chain, (
        f"Expected grade_documents in chain, got {record.root_cause_chain}"
    )

    # steps exist for all 3 nodes
    node_names = [e.node_name for e in record.steps]
    assert "retrieve" in node_names
    assert "grade_documents" in node_names
    assert "generate" in node_names

    # grade_documents step should have inspection showing missing 'grade'
    grade_step = next(e for e in record.steps if e.node_name == "grade_documents")
    assert grade_step.inspection is not None
    assert "grade" in grade_step.inspection.missing_fields

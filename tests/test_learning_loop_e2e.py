"""End-to-end tests for the full learning loop.

Proves: approve pattern → run pipeline → signature fires → stats track it.
"""

import json
from pathlib import Path

import pytest

from argus.candidate_store import (
    approve_candidate,
    disable_custom_signature,
    enable_custom_signature,
    load_custom_signatures,
    save_candidates,
)
from argus.registry import reload_registry
from argus.session import ArgusSession
from argus.signature_stats import compute_stats, record_dispute


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    """Run every test in a temp directory."""
    monkeypatch.chdir(tmp_path)


def _seed_candidate(pattern="test failure output", match_strategy="contains_ci"):
    """Create a pending candidate in .argus/candidates.json."""
    Path(".argus").mkdir(parents=True, exist_ok=True)
    data = {
        "candidates": [
            {
                "id": "cand-test001",
                "pattern": pattern,
                "match_strategy": match_strategy,
                "proposed_category": "test_category",
                "severity": "warning",
                "description": "Test learned pattern",
                "evidence": [f"output containing {pattern}"],
                "confidence": 0.9,
                "times_seen": 1,
                "first_seen": "2026-07-07T00:00:00+00:00",
                "last_seen": "2026-07-07T00:00:00+00:00",
                "status": "pending",
            }
        ],
        "rejected_patterns": [],
    }
    save_candidates(data)


def _run_session_with_output(output_dict: dict) -> str:
    """Run a single-node session that returns the given output. Returns run_id."""
    session = ArgusSession()
    session.set_node_names(["test_node"])

    def node_fn(state):
        return output_dict

    wrapped = session.wrap("test_node", node_fn)
    wrapped({})
    session.finalize()
    return session.run_id


def _read_run(run_id: str) -> dict:
    """Load a run JSON from disk."""
    run_path = Path(".argus/runs") / f"{run_id}.json"
    return json.loads(run_path.read_text(encoding="utf-8"))


def _get_semantic_sig_ids(run_data: dict, node_name: str = "test_node") -> list[str]:
    """Extract sig_ids from semantic_signals of a specific node."""
    for step in run_data.get("steps", []):
        if step.get("node_name") == node_name:
            inspection = step.get("inspection", {})
            if inspection:
                return [
                    s["sig_id"]
                    for s in inspection.get("semantic_signals", [])
                ]
    return []


# ── Test 1: The Core Loop ────────────────────────────────────────────────────


@pytest.mark.integration
def test_approve_run_and_stats():
    """Approve a pattern → run a pipeline that triggers it → verify stats."""
    # 1. Seed and approve a candidate
    _seed_candidate(pattern="test failure output")
    new_sig = approve_candidate("cand-test001")
    assert new_sig is not None
    assert new_sig["id"] == "CS-001"
    assert new_sig["source"] == "learned"

    # 2. Reload registry so CS-001 is live
    reload_registry()

    # 3. Run a session with output that matches the pattern
    run_id = _run_session_with_output({"response": "this is a test failure output from LLM"})

    # 4. Verify the run was saved and CS-001 fired
    run_data = _read_run(run_id)
    sig_ids = _get_semantic_sig_ids(run_data)
    assert "CS-001" in sig_ids, f"CS-001 not in signals: {sig_ids}"

    # 5. Verify compute_stats counts the hit
    stats = compute_stats(sig_ids=["CS-001"])
    assert "CS-001" in stats
    assert stats["CS-001"].total_hits >= 1
    assert stats["CS-001"].runs_hit == 1
    assert stats["CS-001"].source == "learned"

    # 6. Verify incremental hit metadata was updated in custom_signatures.json
    custom = load_custom_signatures()
    cs001 = next(s for s in custom["signatures"] if s["id"] == "CS-001")
    assert cs001["metadata"]["total_hits"] >= 1
    assert "last_hit_at" in cs001["metadata"]


# ── Test 2: Disable Stops Detection ──────────────────────────────────────────


@pytest.mark.integration
def test_disable_stops_detection():
    """Disabled signatures should not fire; re-enabled ones should."""
    # Setup: approve and reload
    _seed_candidate(pattern="test failure output")
    approve_candidate("cand-test001")
    reload_registry()

    # Disable CS-001
    assert disable_custom_signature("CS-001") is True
    reload_registry()

    # Run a session — CS-001 should NOT fire
    run_id_disabled = _run_session_with_output(
        {"response": "this is a test failure output from LLM"}
    )
    run_data = _read_run(run_id_disabled)
    sig_ids = _get_semantic_sig_ids(run_data)
    assert "CS-001" not in sig_ids, f"CS-001 should not fire when disabled: {sig_ids}"

    # Re-enable CS-001
    assert enable_custom_signature("CS-001") is True
    reload_registry()

    # Run again — CS-001 SHOULD fire
    run_id_enabled = _run_session_with_output(
        {"response": "this is a test failure output from LLM"}
    )
    run_data = _read_run(run_id_enabled)
    sig_ids = _get_semantic_sig_ids(run_data)
    assert "CS-001" in sig_ids, f"CS-001 should fire after re-enable: {sig_ids}"


# ── Test 3: Dispute Counted in Stats ─────────────────────────────────────────


@pytest.mark.integration
def test_dispute_counted_in_stats():
    """False-positive disputes should appear in stats."""
    # Setup: approve, reload, run
    _seed_candidate(pattern="test failure output")
    approve_candidate("cand-test001")
    reload_registry()

    run_id = _run_session_with_output({"response": "this is a test failure output"})

    # Record a dispute
    record_dispute(
        sig_id="CS-001",
        run_id=run_id,
        node_name="test_node",
        field_path="response",
        evidence="test failure output",
        reason="this is actually valid output",
    )

    # Stats should reflect the false positive
    stats = compute_stats(sig_ids=["CS-001"])
    assert stats["CS-001"].total_hits >= 1
    assert stats["CS-001"].false_positive_count == 1

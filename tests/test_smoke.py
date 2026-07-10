"""Smoke tests — verify core imports and basic session behaviour."""
import pytest

from argus.llm_tracker import extract_usage, scan_output_for_tokens  # noqa: I001
from argus.models import LLMCallInfo, LLMUsage, NodeEvent, RunRecord
from argus.pricing import calculate_cost
from argus.session import ArgusSession


@pytest.fixture(autouse=True)
def _isolate_runs(tmp_path, monkeypatch):
    """Run every test in a temp directory so .argus/runs/ doesn't pollute the project."""
    monkeypatch.chdir(tmp_path)


def test_imports():
    assert NodeEvent is not None
    assert RunRecord is not None
    assert LLMCallInfo is not None
    assert LLMUsage is not None


def test_pricing_known_model():
    cost = calculate_cost("gpt-4o", 1000, 500)
    assert cost is not None
    assert cost > 0


def test_pricing_unknown_model():
    assert calculate_cost("totally-unknown-model-xyz", 100, 100) is None


def test_scan_output_usage_metadata():
    output = {
        "result": "hello",
        "usage_metadata": {
            "input_tokens": 100,
            "output_tokens": 50,
            "total_tokens": 150,
            "model": "gpt-4o-mini",
        },
    }
    calls = scan_output_for_tokens(output)
    assert len(calls) == 1
    assert calls[0].total_tokens == 150
    assert calls[0].prompt_tokens == 100
    assert calls[0].completion_tokens == 50


def test_scan_output_empty():
    assert scan_output_for_tokens({}) == []
    assert scan_output_for_tokens(None) == []


def test_extract_usage_from_output():
    output = {
        "usage_metadata": {
            "input_tokens": 200,
            "output_tokens": 80,
            "model": "claude-3-5-sonnet",
        },
    }
    usage = extract_usage(None, output)
    assert usage is not None
    assert usage.total_tokens == 280
    assert usage.total_cost_usd is not None


def test_session_creates_run():
    session = ArgusSession()

    def node_a(state):
        return {"value": 42}

    wrapped = session.wrap("node_a", node_a)
    session.set_node_names(["node_a"])
    wrapped({"value": 0})
    session.finalize()


def test_session_detects_missing_field():
    session = ArgusSession()
    session.set_node_names(["producer", "consumer"])
    session.set_edges({"producer": ["consumer"]})

    wrap_p = session.wrap("producer", lambda s: {"key_a": 1})
    wrap_c = session.wrap("consumer", lambda s: {"result": s.get("key_b", "missing")})

    wrap_p({})
    wrap_c({"key_a": 1})
    session.finalize()
    # if no exception, the session ran and inspected transitions successfully


def test_replay_engine_rejects_bad_node():
    from argus.replay import ReplayEngine

    engine = ReplayEngine()
    try:
        engine.replay("nonexistent-run-id-xyz", "fake_node")
        assert False, "Should have raised"
    except (FileNotFoundError, ValueError):
        pass


def test_storage_roundtrip():
    from argus.storage import load_run

    session = ArgusSession()
    session.set_node_names(["step1"])
    wrapped = session.wrap("step1", lambda s: {"out": 1})
    wrapped({"in": 0})
    session.finalize()

    # finalize() saves the run — verify we can load it back
    loaded = load_run(session.run_id)
    assert loaded.run_id == session.run_id
    assert len(loaded.steps) == 1


# ── Parallel workflow tests ──────────────────────────────────────────────────


def test_terminal_nodes_linear():
    """Linear A→B→C: only C is terminal, backward compat with old behavior."""
    session = ArgusSession()
    session.set_node_names(["A", "B", "C"])
    session.set_edges({"A": ["B"], "B": ["C"]})
    assert session._terminal_nodes == {"C"}


def test_terminal_nodes_fan_out():
    """A→[B,C]: both B and C are terminal (no successors)."""
    session = ArgusSession()
    session.set_node_names(["A", "B", "C"])
    session.set_edges({"A": ["B", "C"]})
    assert session._terminal_nodes == {"B", "C"}


def test_terminal_nodes_asymmetric():
    """A→[B,C], B→D: terminals are C and D."""
    session = ArgusSession()
    session.set_node_names(["A", "B", "C", "D"])
    session.set_edges({"A": ["B", "C"], "B": ["D"]})
    assert session._terminal_nodes == {"C", "D"}


def test_terminal_nodes_fan_in():
    """A→[B,C]→D: only D is terminal."""
    session = ArgusSession()
    session.set_node_names(["A", "B", "C", "D"])
    session.set_edges({"A": ["B", "C"], "B": ["D"], "C": ["D"]})
    assert session._terminal_nodes == {"D"}


def test_parallel_fan_out_all_events_captured():
    """A→[B,C]: both B and C events must be in the finalized record."""
    from argus.storage import load_run

    session = ArgusSession()
    edges = {"A": ["B", "C"]}
    wrapped = session.instrument(
        agents={
            "A": lambda s: {"from_a": True},
            "B": lambda s: {"from_b": True},
            "C": lambda s: {"from_c": True},
        },
        edges=edges,
    )

    state = wrapped["A"]({})
    # Simulate parallel execution — order shouldn't matter
    wrapped["B"]({**state, "from_a": True})
    wrapped["C"]({**state, "from_a": True})

    loaded = load_run(session.run_id)
    node_names = [s.node_name for s in loaded.steps]
    assert "A" in node_names
    assert "B" in node_names
    assert "C" in node_names
    assert len(loaded.steps) == 3


def test_parallel_asymmetric_all_events_captured():
    """A→[B,C], B→D: all 4 events captured regardless of completion order."""
    from argus.storage import load_run

    session = ArgusSession()
    edges = {"A": ["B", "C"], "B": ["D"]}
    wrapped = session.instrument(
        agents={
            "A": lambda s: {"from_a": True},
            "B": lambda s: {"from_b": True},
            "C": lambda s: {"from_c": True},
            "D": lambda s: {"from_d": True},
        },
        edges=edges,
    )

    state = wrapped["A"]({})
    # C finishes first, then B→D
    wrapped["C"]({**state, "from_a": True})
    wrapped["B"]({**state, "from_a": True})
    wrapped["D"]({**state, "from_a": True, "from_b": True})

    loaded = load_run(session.run_id)
    node_names = [s.node_name for s in loaded.steps]
    assert set(node_names) == {"A", "B", "C", "D"}
    assert len(loaded.steps) == 4


def test_parallel_asymmetric_d_before_c():
    """A→[B,C], B→D: D finishes before C — C must not be lost."""
    from argus.storage import load_run

    session = ArgusSession()
    edges = {"A": ["B", "C"], "B": ["D"]}
    wrapped = session.instrument(
        agents={
            "A": lambda s: {"from_a": True},
            "B": lambda s: {"from_b": True},
            "C": lambda s: {"from_c": True},
            "D": lambda s: {"from_d": True},
        },
        edges=edges,
    )

    state = wrapped["A"]({})
    # B→D finishes first, then C arrives late
    wrapped["B"]({**state, "from_a": True})
    wrapped["D"]({**state, "from_a": True, "from_b": True})
    # Under the old bug, finalize would have triggered at D.
    # C should still be captured.
    wrapped["C"]({**state, "from_a": True})

    loaded = load_run(session.run_id)
    node_names = [s.node_name for s in loaded.steps]
    assert set(node_names) == {"A", "B", "C", "D"}
    assert len(loaded.steps) == 4
    assert loaded.overall_status in ("clean", "silent_failure")


# ── VAR-7: Input-output coherence checks ─────────────────────────────────────


def _has_failure(step: object, failure_type: str) -> bool:
    insp = getattr(step, "inspection", None)
    if insp is None:
        return False
    return any(f.failure_type == failure_type for f in insp.tool_failures)


def test_selective_attention():
    """Rule 13: output list < 50% of input list items (≥4 items) → flag."""
    from argus.storage import load_run

    session = ArgusSession()
    session.set_node_names(["reducer"])
    wrapped = session.wrap("reducer", lambda s: {"items": [1, 2]})
    wrapped({"items": [1, 2, 3, 4, 5]})
    session.finalize()

    loaded = load_run(session.run_id)
    assert _has_failure(loaded.steps[0], "selective_attention_reduction")


def test_input_echo():
    """Rule 14: output string ≥ 90% similar to input → flag."""
    from argus.storage import load_run

    long_text = "The market outlook is very bullish with strong momentum and positive indicators. " * 2
    session = ArgusSession()
    session.set_node_names(["echo_node"])
    wrapped = session.wrap("echo_node", lambda s: {"result": s["text"]})
    wrapped({"text": long_text})
    session.finalize()

    loaded = load_run(session.run_id)
    assert _has_failure(loaded.steps[0], "input_echo")


def test_contradictory_transformation():
    """Rule 15: input is bullish, output is bearish → flag semantic_contradiction."""
    from argus.storage import load_run

    session = ArgusSession()
    session.set_node_names(["transformer"])
    wrapped = session.wrap(
        "transformer",
        lambda s: {"recommendation": "bearish sell downtrend"},
    )
    wrapped({"signal": "bullish uptrend buy"})
    session.finalize()

    loaded = load_run(session.run_id)
    assert _has_failure(loaded.steps[0], "semantic_contradiction")


def test_context_overflow_proxy():
    """Rule 16: input state > 100K chars → flag context_size_anomaly."""
    from argus.storage import load_run

    session = ArgusSession()
    session.set_node_names(["big_node"])
    wrapped = session.wrap("big_node", lambda s: {"result": "ok"})
    wrapped({"body": "x" * 110_000})
    session.finalize()

    loaded = load_run(session.run_id)
    assert _has_failure(loaded.steps[0], "context_size_anomaly")

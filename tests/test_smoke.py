"""Smoke tests — verify core imports and basic session behaviour."""
from argus.llm_tracker import extract_usage, scan_output_for_tokens  # noqa: I001
from argus.models import LLMCallInfo, LLMUsage, NodeEvent, RunRecord
from argus.pricing import calculate_cost
from argus.session import ArgusSession


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

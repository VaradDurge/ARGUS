"""Tests for ArgusSession — framework-agnostic usage."""
from __future__ import annotations

from typing import TypedDict

import pytest

from argus.session import ArgusSession
from argus.storage import load_run


class SimpleState(TypedDict):
    value: str
    result: str


def _fetch(state: SimpleState) -> dict:
    return {"value": "fetched"}


def _process(state: SimpleState) -> dict:
    return {"result": f"done:{state['value']}"}


def test_wrap_plain_functions_no_langgraph(tmp_path, monkeypatch):
    """ArgusSession.wrap() should work on plain Python functions without LangGraph."""
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()
    session.set_edges({"fetch": ["process"]})
    session.set_node_names(["fetch", "process"])

    fetch   = session.wrap("fetch",   _fetch)
    process = session.wrap("process", _process)

    state: dict = {"value": "", "result": ""}
    state.update(fetch(state))
    state.update(process(state))
    session.finalize()

    record = load_run(session.run_id)
    assert record.overall_status == "clean"
    assert len(record.steps) == 2
    assert record.steps[0].node_name == "fetch"
    assert record.steps[1].node_name == "process"


def test_set_edges_detects_cycle(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    session = ArgusSession()
    session.set_edges({"a": ["b"], "b": ["a"]})
    assert session._is_cyclic is True


def test_set_edges_no_cycle(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    session = ArgusSession()
    session.set_edges({"a": ["b"], "b": ["c"]})
    assert session._is_cyclic is False


def test_finalize_produces_valid_run_record(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    session = ArgusSession()
    session.set_node_names(["step"])

    fn = session.wrap("step", lambda s: {"x": 1})
    fn({"x": 0})
    session.finalize()

    record = load_run(session.run_id)
    assert record.run_id == session.run_id
    assert record.overall_status == "clean"


def test_wrap_async_function(tmp_path, monkeypatch):
    import asyncio
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()
    session.set_node_names(["async_step"])

    async def async_fn(state):
        return {"result": "async"}

    wrapped = session.wrap("async_step", async_fn)
    asyncio.get_event_loop().run_until_complete(wrapped({"result": ""}))
    session.finalize()

    record = load_run(session.run_id)
    assert record.steps[0].node_name == "async_step"
    assert record.steps[0].status == "pass"


def test_wrap_exception_recorded_as_crash(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()
    session.set_node_names(["boom"])

    def boom(state):
        raise ValueError("exploded")

    wrapped = session.wrap("boom", boom)
    with pytest.raises(ValueError):
        wrapped({})

    record = load_run(session.run_id)
    assert record.steps[0].status == "crashed"
    assert "ValueError" in (record.steps[0].exception or "")
    assert record.overall_status == "crashed"


# ── instrument() tests ────────────────────────────────────────────────────────

def test_instrument_wraps_all_agents(tmp_path, monkeypatch):
    """instrument() should return a dict with every agent wrapped."""
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()
    wrapped = session.instrument(
        agents={
            "a": lambda s: {"v": 1},
            "b": lambda s: {"v": 2},
            "c": lambda s: {"v": 3},
        },
        edges={"a": ["b"], "b": ["c"]},
    )

    assert set(wrapped.keys()) == {"a", "b", "c"}

    state: dict = {}
    state.update(wrapped["a"](state))
    state.update(wrapped["b"](state))
    state.update(wrapped["c"](state))
    session.finalize()

    record = load_run(session.run_id)
    assert len(record.steps) == 3
    assert [e.node_name for e in record.steps] == ["a", "b", "c"]
    assert record.overall_status == "clean"


def test_instrument_registers_node_names(tmp_path, monkeypatch):
    """instrument() should register node names so last-node auto-finalize works."""
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()
    session.instrument(
        agents={"x": lambda s: {"v": 1}, "y": lambda s: {"v": 2}},
    )

    assert session.graph_node_names == ["x", "y"]


def test_instrument_registers_edges(tmp_path, monkeypatch):
    """instrument() with edges= should call set_edges and compute is_cyclic."""
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()
    session.instrument(
        agents={"p": lambda s: {}, "q": lambda s: {}},
        edges={"p": ["q"], "q": ["p"]},  # cycle
    )

    assert session._is_cyclic is True


def test_instrument_15_agents(tmp_path, monkeypatch):
    """instrument() should handle 15 agents without issue."""
    monkeypatch.chdir(tmp_path)

    names = [f"agent_{i}" for i in range(15)]
    agents = {name: (lambda s, n=name: {n: "done"}) for name in names}
    edges = {names[i]: [names[i + 1]] for i in range(14)}

    session = ArgusSession()
    wrapped = session.instrument(agents=agents, edges=edges)

    assert len(wrapped) == 15

    state: dict = {}
    for name in names:
        state.update(wrapped[name](state))
    session.finalize()

    record = load_run(session.run_id)
    assert len(record.steps) == 15
    assert record.overall_status == "clean"


# ── @session.node decorator tests ─────────────────────────────────────────────

def test_node_decorator_instruments_function(tmp_path, monkeypatch):
    """@session.node should wrap the function and register the name."""
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()

    @session.node("fetch")
    def fetch(state):
        return {"data": "fetched"}

    fetch({"data": ""})
    session.finalize()

    record = load_run(session.run_id)
    assert record.steps[0].node_name == "fetch"
    assert record.steps[0].status == "pass"


def test_node_decorator_registers_name(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()

    @session.node("step_one")
    def step_one(state):
        return {}

    assert "step_one" in session.graph_node_names


def test_node_decorator_multiple_agents(tmp_path, monkeypatch):
    """Multiple @session.node decorators should all be captured in one run."""
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()
    session.set_edges({"ingest": ["transform"], "transform": ["output"]})

    @session.node("ingest")
    def ingest(state):
        return {"raw": "data"}

    @session.node("transform")
    def transform(state):
        return {"processed": state.get("raw", "") + "_transformed"}

    @session.node("output")
    def output(state):
        return {"result": state.get("processed", "")}

    state: dict = {}
    state.update(ingest(state))
    state.update(transform(state))
    state.update(output(state))
    session.finalize()

    record = load_run(session.run_id)
    assert len(record.steps) == 3
    assert [e.node_name for e in record.steps] == ["ingest", "transform", "output"]
    assert record.overall_status == "clean"


def test_node_decorator_preserves_function_name(tmp_path, monkeypatch):
    """@session.node should preserve __name__ via functools.wraps."""
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()

    @session.node("my_agent")
    def my_agent(state):
        return {}

    assert my_agent.__name__ == "my_agent"


def test_node_decorator_with_validators(tmp_path, monkeypatch):
    """@session.node should respect validators attached to the session."""
    monkeypatch.chdir(tmp_path)

    session = ArgusSession(validators={
        "scorer": lambda out: (out.get("score", 0) >= 5, "Score below threshold"),
    })

    @session.node("scorer")
    def scorer(state):
        return {"score": 2}  # deliberately low

    scorer({"score": 0})
    session.finalize()

    record = load_run(session.run_id)
    assert record.steps[0].status == "semantic_fail"
    assert record.steps[0].validator_results[0].is_valid is False

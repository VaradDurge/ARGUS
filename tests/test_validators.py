"""Tests for semantic validators in ArgusSession / ArgusWatcher."""
from __future__ import annotations

import pytest

from argus.session import ArgusSession
from argus.storage import load_run


def _make_session(validators=None, tmp_path=None, monkeypatch=None):
    monkeypatch.chdir(tmp_path)
    session = ArgusSession(validators=validators)
    session.set_node_names(["node_a", "node_b"])
    session.set_edges({"node_a": ["node_b"]})
    return session


def test_validator_fail_sets_semantic_fail_status(tmp_path, monkeypatch):
    session = _make_session(
        validators={"node_a": lambda out: (False, "output too short")},
        tmp_path=tmp_path,
        monkeypatch=monkeypatch,
    )
    fn = session.wrap("node_a", lambda s: {"value": "x"})
    fn({"value": ""})
    session.wrap("node_b", lambda s: {"result": "ok"})({"value": "x", "result": ""})
    session.finalize()

    record = load_run(session.run_id)
    assert record.steps[0].status == "semantic_fail"
    assert record.steps[0].validator_results[0].is_valid is False
    assert "output too short" in record.steps[0].validator_results[0].message


def test_validator_pass_does_not_change_status(tmp_path, monkeypatch):
    session = _make_session(
        validators={"node_a": lambda out: (True, "all good")},
        tmp_path=tmp_path,
        monkeypatch=monkeypatch,
    )
    fn = session.wrap("node_a", lambda s: {"value": "hello"})
    fn({"value": ""})
    session.wrap("node_b", lambda s: {"result": "ok"})({"value": "hello", "result": ""})
    session.finalize()

    record = load_run(session.run_id)
    assert record.steps[0].status in ("pass", "fail")  # not semantic_fail
    assert record.steps[0].validator_results[0].is_valid is True


def test_wildcard_validator_runs_on_every_node(tmp_path, monkeypatch):
    calls = []
    def wildcard(out):
        calls.append(out)
        return (True, "ok")

    monkeypatch.chdir(tmp_path)
    session = ArgusSession(validators={"*": wildcard})
    session.set_node_names(["a", "b"])
    session.set_edges({"a": ["b"]})

    session.wrap("a", lambda s: {"v": 1})({"v": 0})
    session.wrap("b", lambda s: {"v": 2})({"v": 1})
    session.finalize()

    assert len(calls) == 2


def test_wildcard_and_node_specific_both_run(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    session = ArgusSession(validators={
        "*": lambda out: (True, "wildcard ok"),
        "node_a": lambda out: (False, "node specific fail"),
    })
    session.set_node_names(["node_a"])

    session.wrap("node_a", lambda s: {"x": 1})({"x": 0})
    session.finalize()

    record = load_run(session.run_id)
    vrs = record.steps[0].validator_results
    # both validators ran
    assert len(vrs) == 2
    names = [v.validator_name for v in vrs]
    assert any("*" in n for n in names)
    assert any("node_a" in n for n in names)


def test_validator_exception_is_caught_and_recorded(tmp_path, monkeypatch):
    """A validator that raises should be caught — ARGUS must not crash."""
    def bad_validator(out):
        raise RuntimeError("validator exploded")

    monkeypatch.chdir(tmp_path)
    session = ArgusSession(validators={"node_a": bad_validator})
    session.set_node_names(["node_a"])

    session.wrap("node_a", lambda s: {"x": 1})({"x": 0})
    session.finalize()

    record = load_run(session.run_id)
    vr = record.steps[0].validator_results[0]
    assert vr.is_valid is False
    assert "Validator raised" in vr.message


def test_overall_status_silent_failure_when_semantic_fail(tmp_path, monkeypatch):
    session = _make_session(
        validators={"node_a": lambda out: (False, "bad")},
        tmp_path=tmp_path,
        monkeypatch=monkeypatch,
    )
    session.wrap("node_a", lambda s: {"v": 1})({"v": 0})
    session.wrap("node_b", lambda s: {"r": 1})({"v": 1, "r": 0})
    session.finalize()

    record = load_run(session.run_id)
    assert record.overall_status == "silent_failure"

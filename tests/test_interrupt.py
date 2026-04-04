"""Tests for GraphInterrupt handling (human-approval nodes)."""
from __future__ import annotations

import pytest

from argus.session import ArgusSession
from argus.storage import load_run


class _FakeGraphInterrupt(Exception):
    """Stand-in for langgraph.errors.GraphInterrupt in tests."""


def test_interrupt_recorded_as_interrupted_status(tmp_path, monkeypatch):
    """When a node raises GraphInterrupt, status should be 'interrupted', not 'crashed'."""
    monkeypatch.chdir(tmp_path)

    # Patch _GraphInterrupt inside session module to use our fake
    import argus.session as session_mod
    original = session_mod._GraphInterrupt
    session_mod._GraphInterrupt = _FakeGraphInterrupt

    try:
        session = ArgusSession()
        session.set_node_names(["human_approval"])

        def approval_node(state):
            raise _FakeGraphInterrupt("waiting for human")

        wrapped = session.wrap("human_approval", approval_node)

        with pytest.raises(_FakeGraphInterrupt):
            wrapped({"data": "pending"})

        # finalize after interrupt
        session.finalize()

    finally:
        session_mod._GraphInterrupt = original

    record = load_run(session.run_id)
    assert record.steps[0].status == "interrupted"
    assert record.steps[0].exception is None   # not a crash
    assert record.interrupted is True
    assert record.interrupt_node == "human_approval"
    assert record.overall_status == "interrupted"


def test_interrupt_re_raises_exception(tmp_path, monkeypatch):
    """GraphInterrupt must be re-raised so the pipeline framework can handle resume."""
    monkeypatch.chdir(tmp_path)

    import argus.session as session_mod
    original = session_mod._GraphInterrupt
    session_mod._GraphInterrupt = _FakeGraphInterrupt

    try:
        session = ArgusSession()
        session.set_node_names(["gate"])

        wrapped = session.wrap("gate", lambda s: (_ for _ in ()).throw(_FakeGraphInterrupt("pause")))

        with pytest.raises(_FakeGraphInterrupt):
            wrapped({})
    finally:
        session_mod._GraphInterrupt = original


def test_non_interrupt_exception_still_crashes(tmp_path, monkeypatch):
    """Regular exceptions must still be recorded as 'crashed'."""
    monkeypatch.chdir(tmp_path)

    session = ArgusSession()
    session.set_node_names(["broken"])

    def broken(state):
        raise ValueError("real error")

    wrapped = session.wrap("broken", broken)
    with pytest.raises(ValueError):
        wrapped({})

    session.finalize()

    record = load_run(session.run_id)
    assert record.steps[0].status == "crashed"
    assert record.interrupted is False
    assert record.overall_status == "crashed"

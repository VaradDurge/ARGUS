"""Tests for argus.patcher — graph node wrapping and edge map extraction."""
from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import MagicMock

import pytest

from argus.patcher import extract_edge_map, patch_graph

# ── fake graph helpers ────────────────────────────────────────────────────────

def _simple_node(state: dict) -> dict:
    return {"result": "ok"}


async def _async_node(state: dict) -> dict:
    return {"result": "async_ok"}


class _FakeGraph:
    """Minimal stand-in for a LangGraph StateGraph."""

    def __init__(self, nodes: dict[str, Any], edges: list = None) -> None:
        self.nodes = dict(nodes)
        self.edges = edges or []
        self._conditional_edges: dict = {}


class _FakeSession:
    """Minimal stand-in for RunSession that records calls."""

    def __init__(self) -> None:
        self.started: list[str] = []
        self.ended: list[str] = []
        self.max_field_size = 50_000

    def capture_state(self, state: Any) -> dict:
        return dict(state) if isinstance(state, dict) else {}

    def capture_output(self, output: Any) -> dict:
        return dict(output) if isinstance(output, dict) else {}

    def on_node_start(self, node_name: str, snap: dict) -> None:
        self.started.append(node_name)

    def on_node_end(
        self,
        node_name: str,
        input_snap: dict,
        output_snap: dict | None,
        duration_ms: float,
        exc: Exception | None,
        is_interrupt: bool = False,
    ) -> None:
        self.ended.append(node_name)

    def wrap(self, node_name: str, fn: Any) -> Any:
        """Minimal wrap: delegates to the same wrapper logic as before."""
        import functools
        import time

        session = self

        @functools.wraps(fn)
        def _wrapped(state: Any) -> Any:
            input_snap = session.capture_state(state)
            session.on_node_start(node_name, input_snap)
            t0 = time.perf_counter()
            try:
                output = fn(state)
                duration = (time.perf_counter() - t0) * 1000
                output_snap = session.capture_output(output)
                session.on_node_end(node_name, input_snap, output_snap, duration, exc=None)
                return output
            except Exception as exc:
                duration = (time.perf_counter() - t0) * 1000
                session.on_node_end(node_name, input_snap, None, duration, exc=exc)
                raise

        import asyncio as _asyncio
        if _asyncio.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def _async_wrapped(state: Any) -> Any:
                input_snap = session.capture_state(state)
                session.on_node_start(node_name, input_snap)
                t0 = time.perf_counter()
                try:
                    output = await fn(state)
                    duration = (time.perf_counter() - t0) * 1000
                    output_snap = session.capture_output(output)
                    session.on_node_end(node_name, input_snap, output_snap, duration, exc=None)
                    return output
                except Exception as exc:
                    duration = (time.perf_counter() - t0) * 1000
                    session.on_node_end(node_name, input_snap, None, duration, exc=exc)
                    raise
            return _async_wrapped
        return _wrapped


# ── patch_graph tests ─────────────────────────────────────────────────────────

def test_patch_graph_wraps_sync_node() -> None:
    graph = _FakeGraph(nodes={"my_node": _simple_node})
    session = _FakeSession()
    patch_graph(graph, session)

    wrapped = graph.nodes["my_node"]
    assert wrapped is not _simple_node  # was replaced
    result = wrapped({"x": 1})
    assert result == {"result": "ok"}
    assert "my_node" in session.started
    assert "my_node" in session.ended


def test_patch_graph_wraps_async_node() -> None:
    graph = _FakeGraph(nodes={"async_node": _async_node})
    session = _FakeSession()
    patch_graph(graph, session)

    wrapped = graph.nodes["async_node"]
    assert asyncio.iscoroutinefunction(wrapped)

    result = asyncio.get_event_loop().run_until_complete(wrapped({"x": 1}))
    assert result == {"result": "async_ok"}
    assert "async_node" in session.ended


def test_patch_graph_reraises_exception() -> None:
    def _crashing_node(state: dict) -> dict:
        raise RuntimeError("boom")

    graph = _FakeGraph(nodes={"crash": _crashing_node})
    session = _FakeSession()
    patch_graph(graph, session)

    with pytest.raises(RuntimeError, match="boom"):
        graph.nodes["crash"]({"x": 1})

    assert "crash" in session.ended


def test_patch_graph_raises_without_nodes_attr() -> None:
    class _BadGraph:
        pass

    with pytest.raises(AttributeError, match="argus"):
        patch_graph(_BadGraph(), _FakeSession())  # type: ignore[arg-type]


def test_patch_graph_multiple_nodes() -> None:
    def node_b(state: dict) -> dict:
        return {"b": True}

    graph = _FakeGraph(nodes={"a": _simple_node, "b": node_b})
    session = _FakeSession()
    patch_graph(graph, session)

    graph.nodes["a"]({"x": 1})
    graph.nodes["b"]({"x": 1})
    assert session.started == ["a", "b"]
    assert session.ended == ["a", "b"]


# ── extract_edge_map tests ─────────────────────────────────────────────────────

def test_extract_edge_map_simple_edges() -> None:
    graph = _FakeGraph(
        nodes={"a": _simple_node, "b": _simple_node, "c": _simple_node},
        edges=[("a", "b"), ("b", "c")],
    )
    edge_map = extract_edge_map(graph)
    assert edge_map["a"] == ["b"]
    assert edge_map["b"] == ["c"]


def test_extract_edge_map_empty() -> None:
    graph = _FakeGraph(nodes={"a": _simple_node}, edges=[])
    edge_map = extract_edge_map(graph)
    assert edge_map == {}


def test_extract_edge_map_conditional_edges() -> None:
    graph = _FakeGraph(nodes={"a": _simple_node, "b": _simple_node, "c": _simple_node})
    # Simulate a conditional edge object with .ends attr
    cond = MagicMock()
    cond.ends = {"yes": "b", "no": "c"}
    graph._conditional_edges = {"a": cond}

    edge_map = extract_edge_map(graph)
    assert set(edge_map["a"]) == {"b", "c"}


def test_extract_edge_map_deduplicates() -> None:
    graph = _FakeGraph(
        nodes={"a": _simple_node, "b": _simple_node},
        edges=[("a", "b"), ("a", "b")],  # duplicate
    )
    edge_map = extract_edge_map(graph)
    assert edge_map["a"].count("b") == 1

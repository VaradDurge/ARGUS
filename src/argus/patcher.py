from __future__ import annotations

import asyncio
import functools
import time
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from argus.watcher import RunSession


def extract_fn(node_value: Any) -> Any:
    """Extract the underlying callable from a node value.

    Handles both plain callables (legacy) and LangGraph 0.2+ StateNodeSpec objects.
    """
    # LangGraph 0.2+: StateNodeSpec with .runnable.func
    if hasattr(node_value, "runnable") and hasattr(node_value.runnable, "func"):
        return node_value.runnable.func
    return node_value


def patch_graph(graph: Any, session: RunSession) -> None:
    """Replace every node function in graph.nodes with a monitoring wrapper.

    Must be called before graph.compile().
    """
    if not hasattr(graph, "nodes"):
        raise AttributeError(
            "argus: graph has no 'nodes' attribute. "
            "Ensure you are passing a LangGraph StateGraph before calling compile(). "
            "Requires langgraph>=0.2.0."
        )

    node_names = list(graph.nodes.keys())
    for node_name in node_names:
        node_value = graph.nodes[node_name]

        # LangGraph 0.2+: nodes are StateNodeSpec; patch the inner .runnable.func
        if hasattr(node_value, "runnable") and hasattr(node_value.runnable, "func"):
            original_fn = node_value.runnable.func
            if original_fn is not None:
                if asyncio.iscoroutinefunction(original_fn):
                    node_value.runnable.func = _make_async_wrapper(node_name, original_fn, session)
                else:
                    node_value.runnable.func = _make_sync_wrapper(node_name, original_fn, session)
            # handle dedicated async func if present
            afunc = node_value.runnable.afunc
            if afunc is not None and not asyncio.iscoroutinefunction(original_fn):
                node_value.runnable.afunc = _make_async_wrapper(node_name, afunc, session)
        else:
            # Legacy: nodes are plain callables
            if asyncio.iscoroutinefunction(node_value):
                graph.nodes[node_name] = _make_async_wrapper(node_name, node_value, session)
            else:
                graph.nodes[node_name] = _make_sync_wrapper(node_name, node_value, session)


def _make_sync_wrapper(node_name: str, original_fn: Any, session: RunSession) -> Any:
    @functools.wraps(original_fn)
    def _wrapped(state: Any) -> Any:
        input_snap = session.capture_state(state)
        session.on_node_start(node_name, input_snap)
        t0 = time.perf_counter()
        exc_info = None
        try:
            output = original_fn(state)
            duration = (time.perf_counter() - t0) * 1000
            output_snap = session.capture_output(output)
            session.on_node_end(node_name, input_snap, output_snap, duration, exc=None)
            return output
        except Exception as exc:
            duration = (time.perf_counter() - t0) * 1000
            session.on_node_end(node_name, input_snap, None, duration, exc=exc)
            raise

    return _wrapped


def _make_async_wrapper(node_name: str, original_fn: Any, session: RunSession) -> Any:
    @functools.wraps(original_fn)
    async def _wrapped(state: Any) -> Any:
        input_snap = session.capture_state(state)
        session.on_node_start(node_name, input_snap)
        t0 = time.perf_counter()
        try:
            output = await original_fn(state)
            duration = (time.perf_counter() - t0) * 1000
            output_snap = session.capture_output(output)
            session.on_node_end(node_name, input_snap, output_snap, duration, exc=None)
            return output
        except Exception as exc:
            duration = (time.perf_counter() - t0) * 1000
            session.on_node_end(node_name, input_snap, None, duration, exc=exc)
            raise

    return _wrapped


def extract_edge_map(graph: Any) -> dict[str, list[str]]:
    """Build a {source_node: [dest_nodes]} map from the graph's edge definitions."""
    edge_map: dict[str, list[str]] = {}

    # Standard edges: list of (src, dst) tuples or similar
    edges = getattr(graph, "edges", None) or []
    for edge in edges:
        if isinstance(edge, (tuple, list)) and len(edge) >= 2:
            src, dst = str(edge[0]), str(edge[1])
            edge_map.setdefault(src, [])
            if dst not in edge_map[src]:
                edge_map[src].append(dst)

    # Conditional edges
    cond_edges = getattr(graph, "_conditional_edges", None) or {}
    for src, edge_spec in cond_edges.items():
        src = str(src)
        edge_map.setdefault(src, [])
        # edge_spec may be an object with .ends (dict of condition→node)
        ends = getattr(edge_spec, "ends", None)
        if isinstance(ends, dict):
            for dst in ends.values():
                dst = str(dst)
                if dst not in edge_map[src]:
                    edge_map[src].append(dst)
        elif isinstance(edge_spec, dict):
            for dst in edge_spec.values():
                dst = str(dst)
                if dst not in edge_map[src]:
                    edge_map[src].append(dst)

    return edge_map

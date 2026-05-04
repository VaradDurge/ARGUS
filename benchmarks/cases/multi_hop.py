"""
Multi-hop failure cases — 15 total.

Pipeline: fetch → process → analyze (3 nodes, linear).

  • fetch returns a critical error-pattern output (ARGUS marks it as "fail").
  • process is a clean pass-through.
  • analyze crashes because it tries to use data that fetch never set properly.

ARGUS:  first_failure_step = "fetch"  (correct root cause)
Naive:  only sees the exception at "analyze" → blames "analyze" (wrong)

This is the most important category: it shows ARGUS's root-cause superiority
over exception-only monitors.
"""
from __future__ import annotations

from typing import Any

from benchmarks.cases.base import BenchmarkCase


def _clean_process(state: dict[str, Any]) -> dict[str, Any]:
    """Pass through whatever data is in state without crashing."""
    return {"processed_data": state.get("data")}


def _make_multihop(
    case_id: str,
    fetch_output: dict[str, Any],
    analyze_fn: Any,
    description: str,
) -> BenchmarkCase:
    def fetch(state: dict[str, Any], _out: dict[str, Any] = fetch_output) -> dict[str, Any]:
        return dict(_out)

    return BenchmarkCase(
        id=case_id,
        fault_type="multi_hop",
        true_fault_node="fetch",   # ARGUS should blame fetch, not analyze
        description=description,
        nodes=["fetch", "process", "analyze"],
        edges={"fetch": ["process"], "process": ["analyze"]},
        node_fns={"fetch": fetch, "process": _clean_process, "analyze": analyze_fn},
        initial_state={"query": "benchmark"},
    )


def make_cases() -> list[BenchmarkCase]:
    cases: list[BenchmarkCase] = []

    # Each pair: (fetch_output that triggers silent failure, analyze_fn that crashes on None data)

    scenarios = [
        # fetch error key + analyze crashes on None.strip()
        (
            {"error": "database timeout", "data": None},
            lambda state: {"result": state["processed_data"].strip()},
            "fetch error key → analyze AttributeError on None.strip()",
        ),
        (
            {"error": "auth token expired", "data": None},
            lambda state: {"upper": state["processed_data"].upper()},
            "fetch error key → analyze AttributeError on None.upper()",
        ),
        (
            {"error": "upstream unavailable", "data": None},
            lambda state: {"length": len(state["processed_data"])},
            "fetch error key → analyze TypeError: len(None)",
        ),
        (
            {"error": "rate limit hit", "data": None},
            lambda state: {"words": state["processed_data"].split()},
            "fetch error key → analyze AttributeError on None.split()",
        ),
        (
            {"error": "connection refused", "data": None},
            lambda state: {"count": state["processed_data"]["count"]},
            "fetch error key → analyze TypeError: 'NoneType' not subscriptable",
        ),
        # fetch error_message key + analyze crashes
        (
            {"error_message": "LLM provider 503", "result": None},
            lambda state: {"summary": state.get("result").lower()},
            "fetch error_message key → analyze AttributeError on None.lower()",
        ),
        (
            {"error_message": "embedding failed", "result": None},
            lambda state: {"score": sum(state.get("result", None))},
            "fetch error_message key → analyze TypeError: sum(None)",
        ),
        (
            {"error_message": "tool call failed", "result": None},
            lambda state: {"items": list(state.get("result"))},
            "fetch error_message key → analyze TypeError: list(None)",
        ),
        # fetch HTTP error code + analyze crashes
        (
            {"status_code": 500, "body": None},
            lambda state: {"parsed": state["processed_data"].get("key")},
            "fetch HTTP 500 → analyze AttributeError: NoneType.get()",
        ),
        (
            {"status_code": 503, "body": None},
            lambda state: {"ratio": 1.0 / len(state["processed_data"])},
            "fetch HTTP 503 → analyze TypeError: len(None)",
        ),
        (
            {"status_code": 502, "body": None},
            lambda state: {"first": state["processed_data"][0]},
            "fetch HTTP 502 → analyze TypeError: 'NoneType' not subscriptable",
        ),
        # fetch err key + analyze crashes
        (
            {"err": "pool exhausted", "payload": None},
            lambda state: {"result": state["processed_data"].strip()},
            "fetch err key → analyze AttributeError on None.strip()",
        ),
        (
            {"err": "cache miss", "payload": None},
            lambda state: {"lines": state["processed_data"].splitlines()},
            "fetch err key → analyze AttributeError on None.splitlines()",
        ),
        # fetch errors key + analyze crashes
        (
            {"errors": "batch failed: 3/5 items", "data": None},
            lambda state: {"total": sum(state["processed_data"])},
            "fetch errors key → analyze TypeError: sum(None)",
        ),
        (
            {"errors": "schema validation failed", "data": None},
            lambda state: {"formatted": f"Result: {state['processed_data']!r}".upper()},
            "fetch errors key → analyze KeyError/AttributeError chain",
        ),
    ]

    for i, (fetch_out, analyze_fn, desc) in enumerate(scenarios, start=1):
        cases.append(_make_multihop(
            case_id=f"MH-{i:02d}",
            fetch_output=fetch_out,
            analyze_fn=analyze_fn,
            description=desc,
        ))

    assert len(cases) == 15, f"Expected 15 multi-hop cases, got {len(cases)}"
    return cases

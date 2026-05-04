"""
Silent failure cases — 30 total.

All pipelines: fetch → validate → process (3 nodes, linear).
Fault is always injected at "fetch". validate and process are clean pass-throughs.

ARGUS detects via critical tool-failure patterns (error keys, HTTP 4xx/5xx).
Naive monitor (exception-only) sees all nodes complete without exception → reports CLEAN.

Groups:
  SF-01 to SF-08  : {"error": <message>}           — error key, critical
  SF-09 to SF-16  : {"error_message": <message>}   — error_message key, critical
  SF-17 to SF-21  : {"err": <message>}              — err key, critical
  SF-22 to SF-26  : {"errors": <message>}           — errors key, critical
  SF-27 to SF-30  : {"status_code": <4xx/5xx>}      — HTTP error, critical
"""
from __future__ import annotations

from typing import Any

from benchmarks.cases.base import BenchmarkCase


def _pass_validate(state: dict[str, Any]) -> dict[str, Any]:
    return {"validated": True}


def _pass_process(state: dict[str, Any]) -> dict[str, Any]:
    return {"processed": state.get("validated", False)}


def _make_pipeline(case_id: str, fetch_output: dict[str, Any], description: str) -> BenchmarkCase:
    def fetch(state: dict[str, Any], _out: dict[str, Any] = fetch_output) -> dict[str, Any]:
        return dict(_out)

    return BenchmarkCase(
        id=case_id,
        fault_type="silent_failure",
        true_fault_node="fetch",
        description=description,
        nodes=["fetch", "validate", "process"],
        edges={"fetch": ["validate"], "validate": ["process"]},
        node_fns={"fetch": fetch, "validate": _pass_validate, "process": _pass_process},
        initial_state={"query": "benchmark query"},
    )


def make_cases() -> list[BenchmarkCase]:
    cases: list[BenchmarkCase] = []

    # ── Group 1: {"error": <message>} ────────────────────────────────────────
    error_msgs = [
        "database connection timeout",
        "authentication failed: invalid token",
        "upstream service unavailable",
        "request payload too large",
        "internal server error during processing",
        "network unreachable: DNS resolution failed",
        "permission denied: insufficient privileges",
        "resource not found in remote registry",
    ]
    for i, msg in enumerate(error_msgs, start=1):
        cases.append(_make_pipeline(
            case_id=f"SF-{i:02d}",
            fetch_output={"error": msg, "data": None},
            description=f'error key — "{msg[:50]}"',
        ))

    # ── Group 2: {"error_message": <message>} ────────────────────────────────
    error_message_msgs = [
        "LLM provider returned 503 Service Unavailable",
        "vector store query exceeded quota",
        "tool call returned non-2xx response",
        "embedding model failed: context length exceeded",
        "retrieval pipeline returned zero documents",
        "structured output parsing error: unexpected schema",
        "API gateway timeout after 30s",
        "downstream agent raised unhandled exception",
    ]
    for i, msg in enumerate(error_message_msgs, start=9):
        cases.append(_make_pipeline(
            case_id=f"SF-{i:02d}",
            fetch_output={"error_message": msg, "result": None},
            description=f'error_message key — "{msg[:50]}"',
        ))

    # ── Group 3: {"err": <message>} ──────────────────────────────────────────
    err_msgs = [
        "connection pool exhausted",
        "cache miss and fallback failed",
        "tool executor: subprocess exited with code 1",
        "serialization error: object not JSON-serializable",
        "graph node received unexpected state shape",
    ]
    for i, msg in enumerate(err_msgs, start=17):
        cases.append(_make_pipeline(
            case_id=f"SF-{i:02d}",
            fetch_output={"err": msg, "payload": None},
            description=f'err key — "{msg[:50]}"',
        ))

    # ── Group 4: {"errors": <message>} ───────────────────────────────────────
    errors_msgs = [
        "validation errors: [missing required field 'id']",
        "batch processing errors: 3 of 5 items failed",
        "schema errors: type mismatch on field 'score'",
        "pipeline errors: retry limit reached after 3 attempts",
        "dependency errors: required tool not available",
    ]
    for i, msg in enumerate(errors_msgs, start=22):
        cases.append(_make_pipeline(
            case_id=f"SF-{i:02d}",
            fetch_output={"errors": msg, "data": None},
            description=f'errors key — "{msg[:50]}"',
        ))

    # ── Group 5: {"status_code": <4xx/5xx>} ──────────────────────────────────
    http_codes = [500, 503, 502, 404]
    http_labels = [
        "HTTP 500 Internal Server Error",
        "HTTP 503 Service Unavailable",
        "HTTP 502 Bad Gateway",
        "HTTP 404 Not Found",
    ]
    for i, (code, label) in enumerate(zip(http_codes, http_labels), start=27):
        cases.append(_make_pipeline(
            case_id=f"SF-{i:02d}",
            fetch_output={"status_code": code, "body": None},
            description=f"HTTP error status — {label}",
        ))

    assert len(cases) == 30, f"Expected 30 silent failure cases, got {len(cases)}"
    return cases

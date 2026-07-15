"""LLM loop analysis for ARGUS.

Mandatory, always-on analysis for looped nodes. When a node runs multiple
times (detected via total_iterations > 1), the LLM summarizes what happened
across iterations, detects stalls, and flags unnecessary retries.

Uses the ARGUS LLM proxy (gpt-4o-mini). Fail-open — errors don't block
run persistence.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from typing import Any

from argus.models import (
    LoopAnalysisResult,
    LoopIterationDiff,
    NodeEvent,
    RunRecord,
)

_MODEL = "gpt-4o-mini"
_MAX_OUTPUT_CHARS = 2000  # truncate large outputs for the prompt


def analyze_loops(record: RunRecord) -> list[LoopAnalysisResult]:
    """Analyze all looped nodes in a run. Returns one result per looped node."""
    # Group events by node_name, keep only looped nodes
    groups: dict[str, list[NodeEvent]] = defaultdict(list)
    for e in record.steps:
        if e.total_iterations and e.total_iterations > 1:
            groups[e.node_name].append(e)

    results: list[LoopAnalysisResult] = []
    for node_name, events in groups.items():
        try:
            result = _analyze_single_loop(node_name, events)
            results.append(result)
        except Exception as exc:
            results.append(
                LoopAnalysisResult(
                    node_name=node_name,
                    total_iterations=len(events),
                    summary="",
                    is_stalled=False,
                    stall_details=None,
                    unnecessary_retries=0,
                    unnecessary_details=None,
                    error=str(exc),
                )
            )
    return results


def _truncate(val: Any, max_chars: int = _MAX_OUTPUT_CHARS) -> str:
    """JSON-serialize and truncate for prompt inclusion."""
    try:
        s = json.dumps(val, default=str, ensure_ascii=False)
    except Exception:
        s = str(val)
    if len(s) > max_chars:
        return s[:max_chars] + "...(truncated)"
    return s


def _compress_iterations(events: list[NodeEvent]) -> list[dict[str, Any]]:
    """Compress iteration events into concise dicts for the LLM prompt."""
    compressed = []
    for e in events:
        entry: dict[str, Any] = {
            "attempt": e.attempt_index,
            "status": e.status,
            "duration_ms": round(e.duration_ms, 1),
        }
        if e.output_dict is not None:
            entry["output"] = _truncate(e.output_dict)
        if e.exception:
            entry["exception"] = e.exception[:300]
        if e.inspection and e.inspection.missing_fields:
            entry["missing_fields"] = e.inspection.missing_fields
        if e.inspection and e.inspection.tool_failures:
            entry["tool_failures"] = [tf.failure_type for tf in e.inspection.tool_failures[:3]]
        compressed.append(entry)
    return compressed


def _build_prompt(node_name: str, iterations: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Build the chat prompt for loop analysis."""
    system = (
        "You are a pipeline debugging assistant. You analyze loop iterations "
        "in AI agent pipelines and provide concise, actionable insights.\n\n"
        "Respond with a JSON object containing:\n"
        '- "summary": string — 1-3 sentence natural language summary of '
        "what happened across all iterations. Name each attempt and what "
        "went wrong or right.\n"
        '- "is_stalled": boolean — true if consecutive iterations produced '
        "nearly identical outputs (the loop is stuck).\n"
        '- "stall_details": string|null — if stalled, explain why.\n'
        '- "unnecessary_retries": integer — count of iterations that were '
        "wasted (an earlier iteration already had a correct/sufficient "
        "answer but the loop continued anyway). 0 if none.\n"
        '- "unnecessary_details": string|null — if unnecessary retries, '
        "explain which attempt was already correct.\n"
        '- "iteration_diffs": array of objects, one per consecutive pair:\n'
        '  - "from_attempt": int\n'
        '  - "to_attempt": int\n'
        '  - "summary": string — what changed between these attempts\n'
        '  - "fields_changed": list of field names that differ\n'
    )
    user = (
        f'Node "{node_name}" ran {len(iterations)} times in a loop.\n\n'
        f"Iteration data:\n{json.dumps(iterations, indent=2)}\n\n"
        "Analyze the loop behavior and respond with the JSON object."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _analyze_single_loop(node_name: str, events: list[NodeEvent]) -> LoopAnalysisResult:
    """Call the LLM proxy to analyze a single looped node."""
    from argus.llm_proxy import create_chat_completion, is_available

    total = len(events)

    if not is_available():
        return LoopAnalysisResult(
            node_name=node_name,
            total_iterations=total,
            summary="",
            is_stalled=False,
            stall_details=None,
            unnecessary_retries=0,
            unnecessary_details=None,
            error="Not logged in — run: argus login",
        )

    compressed = _compress_iterations(events)
    messages = _build_prompt(node_name, compressed)

    t0 = time.perf_counter()
    result = create_chat_completion(
        model=_MODEL,
        messages=messages,
        max_tokens=1000,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    duration_ms = (time.perf_counter() - t0) * 1000

    if "error" in result:
        return LoopAnalysisResult(
            node_name=node_name,
            total_iterations=total,
            summary="",
            is_stalled=False,
            stall_details=None,
            unnecessary_retries=0,
            unnecessary_details=None,
            model_used=_MODEL,
            duration_ms=duration_ms,
            error=result["error"],
        )

    # Parse response
    usage = result.get("usage", {})
    content = result.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        data = {}

    diffs = []
    for d in data.get("iteration_diffs", []):
        diffs.append(
            LoopIterationDiff(
                from_attempt=d.get("from_attempt", 0),
                to_attempt=d.get("to_attempt", 0),
                summary=d.get("summary", ""),
                fields_changed=d.get("fields_changed", []),
            )
        )

    return LoopAnalysisResult(
        node_name=node_name,
        total_iterations=total,
        summary=data.get("summary", ""),
        is_stalled=bool(data.get("is_stalled", False)),
        stall_details=data.get("stall_details"),
        unnecessary_retries=int(data.get("unnecessary_retries", 0)),
        unnecessary_details=data.get("unnecessary_details"),
        iteration_diffs=diffs,
        model_used=_MODEL,
        prompt_tokens=usage.get("prompt_tokens", 0),
        completion_tokens=usage.get("completion_tokens", 0),
        duration_ms=duration_ms,
    )

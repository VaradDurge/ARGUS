"""LLM disambiguation for ambiguous heuristic signature matches.

When a signature match has borderline confidence (0.3–0.7), the
deterministic heuristic layer cannot reliably determine whether the
output is a real failure or a false positive. This module asks an LLM
to make the call.

Uses gpt-4o-mini by default. All ambiguous signals for a single node
are batched into ONE LLM call. Falls back gracefully (returns empty
list) if the proxy is unavailable or the LLM call fails.
"""

from __future__ import annotations

import json
import time
from typing import Any

from argus.models import DisambiguationResult, SemanticSignal

_SYSTEM_PROMPT = (
    "You are verifying whether flagged patterns in an AI pipeline node's "
    "output are actual failures or false positives.\n\n"
    "For each flagged pattern, determine if it represents a real problem "
    "(placeholder text, corrupted output, semantic degradation, etc.) or "
    "legitimate content that happens to match a detection pattern.\n\n"
    "Consider the node's input context — if the output is a reasonable "
    "response to the input, the pattern match is likely a false positive.\n\n"
    "Respond with JSON:\n"
    '{"verdicts": [{"sig_id": "<id>", "is_failure": <bool>, '
    '"confidence": <0.0-1.0>, "reason": "<1 sentence>"}]}\n\n'
    "Rules:\n"
    "- Return one verdict per flagged signal, matching by sig_id\n"
    "- is_failure=true means the pattern indicates a real problem\n"
    "- is_failure=false means the content is legitimate despite matching\n"
    "- When in doubt, mark as is_failure=true (false negatives are worse "
    "than false positives for disambiguation)"
)

_MAX_VALUE_LEN = 600
_MAX_PAYLOAD_CHARS = 4000


def _truncate(v: Any) -> str:
    s = str(v) if not isinstance(v, str) else v
    if len(s) > _MAX_VALUE_LEN:
        return s[:_MAX_VALUE_LEN] + "... (truncated)"
    return s


def _compact_dict(d: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    total = 0
    for k, v in d.items():
        if isinstance(v, (bytes, bytearray)):
            continue
        t = _truncate(v)
        total += len(t)
        if total > _MAX_PAYLOAD_CHARS:
            break
        out[k] = t
    return out


def disambiguate_signals(
    node_name: str,
    input_state: dict[str, Any],
    output_dict: dict[str, Any],
    ambiguous_signals: list[SemanticSignal],
    model: str = "gpt-4o-mini",
) -> list[DisambiguationResult]:
    """Ask LLM whether ambiguous heuristic matches are real failures.

    Only called when signals have confidence in the ambiguous range.
    Batches all ambiguous signals for a node into one LLM call.

    Returns disambiguation verdicts. On any error, returns empty list
    (all ambiguous signals remain as-is — fail-open to deterministic behavior).
    """
    if not ambiguous_signals:
        return []

    from argus.llm_proxy import create_chat_completion, is_available  # noqa: PLC0415

    if not is_available():
        return []

    t0 = time.perf_counter()

    compact_in = _compact_dict(input_state)
    compact_out = _compact_dict(output_dict)

    flagged = [
        {
            "sig_id": s.sig_id,
            "category": s.category,
            "field_path": s.dotted_path,
            "evidence": s.evidence,
            "description": s.description,
            "confidence": round(s.confidence, 3),
        }
        for s in ambiguous_signals
    ]

    user_msg = (
        f'Node: "{node_name}"\n'
        f"Input: {json.dumps(compact_in, default=str)}\n"
        f"Output: {json.dumps(compact_out, default=str)}\n\n"
        f"Flagged patterns to verify:\n{json.dumps(flagged, indent=2)}"
    )

    try:
        result = create_chat_completion(
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=200,
            temperature=0.0,
            response_format={"type": "json_object"},
            timeout=8.0,
        )
        elapsed = (time.perf_counter() - t0) * 1000

        if "error" in result:
            return []

        choices = result.get("choices", [])
        raw = choices[0]["message"]["content"] if choices else "{}"
        parsed = json.loads(raw)
        usage = result.get("usage", {})

        verdicts = parsed.get("verdicts", [])
        sig_map = {s.sig_id: s for s in ambiguous_signals}

        results: list[DisambiguationResult] = []
        for v in verdicts:
            sid = v.get("sig_id", "")
            if sid not in sig_map:
                continue
            signal = sig_map[sid]
            results.append(
                DisambiguationResult(
                    sig_id=sid,
                    field_path=signal.dotted_path,
                    original_confidence=signal.confidence,
                    llm_verdict=bool(v.get("is_failure", True)),
                    llm_confidence=float(v.get("confidence", 0.5)),
                    llm_reason=str(v.get("reason", "")),
                    model=model,
                    prompt_tokens=usage.get("prompt_tokens", 0),
                    completion_tokens=usage.get("completion_tokens", 0),
                    duration_ms=round(elapsed, 2),
                )
            )
        return results
    except Exception:
        return []

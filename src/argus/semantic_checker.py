"""Per-node semantic coherence check via a lightweight LLM call.

Called on nodes that pass all deterministic checks (inspector, heuristics,
anomaly detection) to verify that the output is semantically relevant to the
input.  Uses gpt-4o-mini by default — ~500 tokens in, ~50 tokens out,
~$0.000075 per call.
"""

from __future__ import annotations

import json
import time
from typing import Any

from argus.models import SemanticCheckResult

_SYSTEM_PROMPT = (
    "You verify whether an AI pipeline node produced semantically correct "
    "output given its input. Respond with JSON:\n"
    '{"pass": bool, "reason": "<1 sentence>", "confidence": <0.0-1.0>}\n\n'
    "Rules:\n"
    '- "pass": true if the output is a reasonable response to the input\n'
    '- "pass": false ONLY if the output is completely unrelated, contradictory, '
    "or nonsensical given the input\n"
    "- Do not judge quality or completeness, only semantic relevance\n"
    "- If you cannot determine relevance (insufficient context), pass it\n"
    "- This is one node in a MULTI-STEP pipeline. The output does not need to "
    "directly answer the input — it may be an intermediate transformation "
    "(e.g. parsing, filtering, extracting, classifying). As long as the output "
    "is a plausible processing step on the input data, pass it.\n"
    "- The input/output shown may be TRUNCATED. Do NOT fail a node because "
    "the output references content that was truncated from the input. "
    "If a value ends with '... (truncated)' it was cut short — assume the "
    "full value contains more data than what you see.\n"
    "- When in doubt, PASS. False positives are worse than false negatives."
)

_MAX_VALUE_LEN = 800
_MAX_PAYLOAD_CHARS = 6000


def _truncate(v: Any) -> str:
    """Convert a value to a truncated string representation."""
    s = str(v) if not isinstance(v, str) else v
    if len(s) > _MAX_VALUE_LEN:
        return s[:_MAX_VALUE_LEN] + "... (truncated)"
    return s


def _compact_dict(d: dict[str, Any]) -> dict[str, str]:
    """Produce a compact, truncated snapshot of a dict for the prompt."""
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


def _skip_result(reason: str, model: str, ms: float) -> SemanticCheckResult:
    """Return a passing result for skipped/errored checks."""
    return SemanticCheckResult(
        passed=True,
        reason=reason,
        confidence=0.0,
        model=model,
        prompt_tokens=0,
        completion_tokens=0,
        duration_ms=round(ms, 2),
    )


def check_semantic_coherence(
    node_name: str,
    input_state: dict[str, Any],
    output_dict: dict[str, Any],
    model: str = "gpt-4o-mini",
    api_key: str | None = None,
) -> SemanticCheckResult:
    """Check if a node's output is semantically coherent with its input.

    Returns a passing result on any error — this check must never block
    the pipeline.
    """
    t0 = time.perf_counter()

    from argus.llm_proxy import create_chat_completion, is_available  # noqa: PLC0415

    if not is_available():
        return _skip_result("check skipped: not logged in (run: argus login)", model, 0.0)

    compact_in = _compact_dict(input_state)
    compact_out = _compact_dict(output_dict)

    # Skip if there's nothing meaningful to compare
    if not compact_in or not compact_out:
        return _skip_result("check skipped: empty input or output", model, 0.0)

    user_msg = (
        f'Node: "{node_name}"\n'
        f"Input: {json.dumps(compact_in, default=str)}\n"
        f"Output: {json.dumps(compact_out, default=str)}"
    )

    try:
        result = create_chat_completion(
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=80,
            temperature=0.0,
            response_format={"type": "json_object"},
            timeout=5.0,
        )
        elapsed = (time.perf_counter() - t0) * 1000

        if "error" in result:
            return _skip_result(f"check skipped: {result['error']}", model, elapsed)

        choices = result.get("choices", [])
        raw = choices[0]["message"]["content"] if choices else "{}"
        parsed = json.loads(raw)
        usage = result.get("usage", {})

        return SemanticCheckResult(
            passed=bool(parsed.get("pass", True)),
            reason=str(parsed.get("reason", "")),
            confidence=float(parsed.get("confidence", 0.0)),
            model=model,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            duration_ms=round(elapsed, 2),
        )
    except Exception as exc:
        elapsed = (time.perf_counter() - t0) * 1000
        return _skip_result(f"check skipped: {exc}", model, elapsed)

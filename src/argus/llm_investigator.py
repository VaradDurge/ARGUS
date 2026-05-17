"""Selective LLM semantic investigator for ARGUS.

Sits AFTER all deterministic detection layers (heuristics, anomaly detection,
correlation, replay analysis). Triggered only for difficult, ambiguous, or
semantically subtle degradation cases that deterministic systems cannot
confidently explain.

The LLM acts as a semantic forensic investigator — it never becomes the primary
detector, never mutates runtime execution, and never auto-modifies heuristics.

Requires: pip install openai   (or argus-agents[llm])
"""
from __future__ import annotations

import json
import os
import time
from typing import Any

from argus.models import (
    LLMInvestigationConfig,
    LLMInvestigationResult,
    RunRecord,
    SemanticHypothesis,
    SuggestedSignature,
)

# ── Trigger evaluation ────────────────────────────────────────────────────────

_DEFAULT_CONFIG = LLMInvestigationConfig()


def should_investigate(
    record: RunRecord,
    config: LLMInvestigationConfig | None = None,
) -> tuple[bool, list[str]]:
    """Evaluate whether this run warrants LLM investigation.

    Returns (should_trigger, list_of_reasons).
    """
    cfg = config or _DEFAULT_CONFIG
    if not cfg.enabled:
        return False, []
    if cfg.always_investigate:
        return True, ["always_investigate enabled"]
    if record.overall_status == "clean":
        return False, []

    # Trigger on ANY non-clean run — provide insights for all failures,
    # degraded inputs, warnings, and anomalies.
    reasons: list[str] = []

    # Collect evidence about what went wrong
    for event in record.steps:
        if event.status == "fail":
            fields = event.inspection.missing_fields if event.inspection else []
            reasons.append(
                f"silent failure at '{event.node_name}'"
                + (f" (missing: {', '.join(fields)})" if fields else "")
            )
        elif event.status == "degraded_input":
            upstream = (
                event.inspection.degraded_upstream_node if event.inspection else None
            )
            reasons.append(
                f"degraded input at '{event.node_name}'"
                + (f" (from: {upstream})" if upstream else "")
            )
        elif event.status == "crashed":
            reasons.append(f"crash at '{event.node_name}'")
        elif event.status == "semantic_fail":
            reasons.append(f"semantic failure at '{event.node_name}'")
        elif event.status == "pass" and event.inspection:
            insp = event.inspection
            if insp.tool_failures:
                reasons.append(
                    f"tool warning at '{event.node_name}': "
                    f"{insp.tool_failures[0].failure_type}"
                )
            if insp.empty_fields:
                reasons.append(
                    f"empty fields at '{event.node_name}': "
                    f"{', '.join(insp.empty_fields)}"
                )

    if not reasons:
        reasons.append(f"run status: {record.overall_status}")

    return True, reasons


# ── Intelligence compression ──────────────────────────────────────────────────

def _compress_node_summary(record: RunRecord) -> list[dict[str, Any]]:
    """Compress node events into concise summaries for the LLM prompt."""
    summaries: list[dict[str, Any]] = []
    for event in record.steps:
        summary: dict[str, Any] = {
            "step": event.step_index,
            "node": event.node_name,
            "status": event.status,
            "duration_ms": event.duration_ms,
        }
        if event.behavior_type:
            summary["behavior_type"] = event.behavior_type

        # Compact inspection signals
        if event.inspection:
            insp = event.inspection
            signals: dict[str, Any] = {}
            if insp.tool_failures:
                signals["tool_failures"] = [
                    {"type": tf.failure_type, "field": tf.field_name,
                     "severity": tf.severity, "evidence": tf.evidence[:80]}
                    for tf in insp.tool_failures
                ]
            if insp.missing_fields:
                signals["missing_fields"] = insp.missing_fields
            if insp.empty_fields:
                signals["empty_fields"] = insp.empty_fields
            if insp.semantic_signals:
                signals["semantic_signals"] = [
                    {"id": s.sig_id, "category": s.category,
                     "severity": s.severity, "path": s.dotted_path,
                     "evidence": s.evidence[:60]}
                    for s in insp.semantic_signals
                ]
            if signals:
                summary["inspection"] = signals

        # Compact anomaly signals
        if event.anomaly_signals:
            summary["anomalies"] = [
                {"id": a.anomaly_id, "severity": a.severity,
                 "score": a.suspicion_score, "reason": a.reason[:80]}
                for a in event.anomaly_signals
            ]

        # Compact validator results
        failed_validators = [v for v in event.validator_results if not v.is_valid]
        if failed_validators:
            summary["failed_validators"] = [
                {"name": v.validator_name, "message": v.message[:80]}
                for v in failed_validators
            ]

        # Truncated output snapshot (key fields only, max 200 chars per value)
        if event.output_dict:
            truncated: dict[str, str] = {}
            for k, v in event.output_dict.items():
                val_str = str(v)
                truncated[k] = val_str[:200] + "..." if len(val_str) > 200 else val_str
            summary["output_snapshot"] = truncated

        if event.exception:
            summary["exception"] = event.exception[:300]

        summaries.append(summary)
    return summaries


def compress_intelligence(record: RunRecord) -> dict[str, Any]:
    """Compress a RunRecord into a structured intelligence briefing for the LLM.

    This is the primary input to the LLM — everything it needs to reason about
    the execution, without raw giant traces.
    """
    briefing: dict[str, Any] = {
        "run_id": record.run_id,
        "overall_status": record.overall_status,
        "duration_ms": record.duration_ms,
        "node_count": len(record.graph_node_names),
        "step_count": len(record.steps),
        "topology": {
            "nodes": record.graph_node_names,
            "edges": record.graph_edge_map,
        },
    }

    # Root cause chain from deterministic analysis
    if record.root_cause_chain:
        briefing["deterministic_root_cause_chain"] = record.root_cause_chain

    # Correlation intelligence
    corr = record.correlation
    if corr:
        # Flag weak causal evidence for the LLM
        causal_warnings: list[str] = []
        if corr.degradation_origins:
            top = corr.degradation_origins[0]
            if top.confidence < 0.5:
                causal_warnings.append(
                    f"top origin '{top.node_name}' has low confidence "
                    f"({top.confidence:.2f}) — causal attribution is uncertain"
                )
            if all(st == "behavioral_anomaly" for st in top.signal_types):
                causal_warnings.append(
                    f"top origin '{top.node_name}' is based on behavioral "
                    f"anomalies only — no structural degradation evidence"
                )
        for chain in corr.propagation_chains:
            if chain.chain_type == "anomaly_cascade":
                causal_warnings.append(
                    f"propagation chain '{' → '.join(chain.nodes)}' is based "
                    f"on anomaly correlation, not structural field propagation"
                )

        briefing["correlation"] = {
            "causal_summary": corr.causal_summary,
            "degradation_origins": [
                {"node": o.node_name, "step": o.step_index,
                 "signals": list(o.signal_types), "confidence": o.confidence,
                 "reason": o.reason}
                for o in corr.degradation_origins
            ],
            "propagation_chains": [
                {"type": c.chain_type, "nodes": list(c.nodes),
                 "summary": c.summary,
                 "links": [
                     {"from": lnk.source_node, "to": lnk.target_node,
                      "signal": lnk.signal_type, "confidence": lnk.confidence,
                      "evidence": lnk.evidence}
                     for lnk in c.links
                 ]}
                for c in corr.propagation_chains
            ],
            "timeline": [
                {"step": t.step_index, "node": t.node_name,
                 "event": t.event_type, "label": t.label}
                for t in corr.timeline
                if t.event_type != "node_ok"  # omit clean nodes to save tokens
            ],
        }
        if causal_warnings:
            briefing["correlation"]["causal_warnings"] = causal_warnings
        if corr.replay_impact:
            ri = corr.replay_impact
            briefing["correlation"]["replay_impact"] = {
                "improved": ri.improved_nodes,
                "regressed": ri.regressed_nodes,
                "key_fix": ri.key_fix_node,
                "summary": ri.summary,
            }

    # Per-node compressed summaries
    briefing["node_summaries"] = _compress_node_summary(record)

    return briefing


# ── Prompt construction ───────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a semantic forensic investigator for ARGUS, an agent pipeline monitoring system.

You receive compressed execution intelligence from a pipeline run that exhibited \
degradation. Deterministic systems (heuristic scanning, behavioral anomaly detection, \
structural inspection, root-cause correlation) have already analyzed this run. \
Your role is to provide SEMANTIC reasoning about WHY degradation occurred — \
the kind of deep causal understanding that pattern matching cannot achieve.

Your analysis should explain:
- WHY degradation semantically happened (not just WHAT happened)
- WHY downstream reasoning collapsed after the origin point
- WHY retrieval quality degraded (if applicable)
- WHY hallucinations or semantic drift emerged
- WHY replay improved or failed to improve the execution
- WHY outputs became semantically shallow or suspicious

CRITICAL — CAUSAL VALIDATION RULES:

You MUST critically evaluate the correlator's causal attributions. The correlator \
can produce false causal narratives. Before accepting any propagation claim, verify:

1. **Propagation requires concrete evidence.** Acceptable evidence includes:
   - A specific field dropped/corrupted at source that is missing/malformed at target
   - Placeholder text from source appearing in target's input
   - The same semantic degradation pattern (same anomaly ID) at both nodes
   - A KeyError/AttributeError at the target referencing a field the source omitted

2. **"Upstream anomaly + downstream crash" is NOT sufficient for causation.**
   If a node crashed with an internal error (JSONDecodeError, parsing failure, \
   API timeout) and there is no evidence the crash was caused by upstream data, \
   attribute the crash to the node itself. Do NOT fabricate a propagation narrative.

3. **Behavioral anomalies are observations, not causes.** A behavioral anomaly \
   (e.g. low info density, generic response) at an upstream node does NOT prove \
   it caused a downstream failure. Only structural evidence (field drops, corrupted \
   data, placeholder propagation) establishes causation.

4. **Acknowledge uncertainty.** If the evidence is ambiguous, say so. Lower your \
   confidence. Do NOT invent certainty. A 40% confidence with honest reasoning \
   is better than a fabricated 90% confidence.

5. **Self-contained failures are common.** A node that crashes while parsing its \
   own LLM/tool response is a self-contained failure, not a propagation target — \
   unless the upstream node demonstrably corrupted the input it received.

You must respond with valid JSON matching this exact schema:
{
  "root_cause_explanation": "<2-3 sentences. Name the node, field, reason.>",
  "causal_hypotheses": [
    {
      "hypothesis": "<concise causal statement>",
      "confidence": <0.0-1.0>,
      "supporting_evidence": ["<reference to signal/node>", ...],
      "category": "<retrieval_degradation|hallucination_onset|semantic_drift|...>"
    }
  ],
  "degradation_narrative": "<developer-readable forensic narrative, 3-8 sentences>",
  "observations": ["<semantic observation>", ...],
  "debugging_suggestions": ["<actionable fix/prevention suggestion>", ...],
  "confidence": <0.0-1.0 overall confidence>,
  "suggested_signatures": []
}

Rules:
- Be precise and evidence-based. Reference specific nodes and signals.
- Rank hypotheses by confidence. Include 1-4 hypotheses.
- Make debugging suggestions actionable: what to fix, where, and how to prevent recurrence.
- Your confidence should reflect how certain you are, not how bad the degradation is.
- Do NOT speculate beyond what the evidence supports.
- Do NOT suggest changes to ARGUS internals or detection logic.
- If the correlator's causal summary conflicts with the node-level evidence, \
  trust the node-level evidence and explain the discrepancy.
- root_cause_explanation must be 2-3 sentences max. Name the exact node, exact field, \
  and precise reason. No vague phrases like "degradation originated from" or \
  "the execution experienced significant degradation". Be direct: what broke, where, why.
"""

_SIGNATURE_ADDENDUM = """
Additionally, if you notice RECURRING semantic patterns in the outputs that are NOT \
already captured by the existing heuristic signatures, suggest new signatures in the \
"suggested_signatures" array:
{
  "suggested_signatures": [
    {
      "pattern": "<string or regex to match>",
      "match_strategy": "<exact_ci|contains_ci|prefix_ci|regex>",
      "proposed_category": "<category name>",
      "severity": "<critical|warning>",
      "description": "<what this pattern detects>",
      "evidence": ["<real example from this run>", ...],
      "confidence": <0.0-1.0>,
      "reasoning": "<why this is a recurring degradation pattern>"
    }
  ]
}

Only suggest signatures you are >0.7 confident about. Focus on patterns that would \
help catch similar degradation in future runs. Do NOT suggest patterns already covered \
by these existing categories: placeholder_outputs, null_like_semantic, suspicious_phrases, \
corrupted_markers, repeated_filler_text, malformed_embedded_json.
"""


def build_prompt(
    briefing: dict[str, Any],
    trigger_reasons: list[str],
    config: LLMInvestigationConfig,
) -> list[dict[str, str]]:
    """Build the OpenAI chat messages for investigation."""
    system = _SYSTEM_PROMPT
    if config.suggest_signatures:
        system += _SIGNATURE_ADDENDUM

    user_content = (
        "## Investigation Trigger\n"
        "This run was flagged for LLM investigation because:\n"
        + "\n".join(f"- {r}" for r in trigger_reasons)
        + "\n\n## Execution Intelligence\n"
        + json.dumps(briefing, indent=2, default=str)
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


# ── Response parsing ──────────────────────────────────────────────────────────

def _parse_response(raw: str) -> dict[str, Any]:
    """Parse LLM response JSON, handling markdown code fences."""
    text = raw.strip()
    if text.startswith("```"):
        # Strip ```json ... ``` wrapper
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    return json.loads(text)


def _extract_hypotheses(data: dict[str, Any]) -> list[SemanticHypothesis]:
    raw = data.get("causal_hypotheses", [])
    hypotheses: list[SemanticHypothesis] = []
    for h in raw:
        if not isinstance(h, dict):
            continue
        hypotheses.append(SemanticHypothesis(
            hypothesis=str(h.get("hypothesis", "")),
            confidence=float(h.get("confidence", 0.0)),
            supporting_evidence=tuple(str(e) for e in h.get("supporting_evidence", [])),
            category=str(h.get("category", "other")),
        ))
    hypotheses.sort(key=lambda x: -x.confidence)
    return hypotheses


def _extract_suggested_signatures(data: dict[str, Any]) -> list[SuggestedSignature]:
    raw = data.get("suggested_signatures", [])
    sigs: list[SuggestedSignature] = []
    for s in raw:
        if not isinstance(s, dict):
            continue
        confidence = float(s.get("confidence", 0.0))
        if confidence < 0.7:
            continue  # reject low-confidence suggestions
        sigs.append(SuggestedSignature(
            pattern=str(s.get("pattern", "")),
            match_strategy=str(s.get("match_strategy", "contains_ci")),
            proposed_category=str(s.get("proposed_category", "unknown")),
            severity=str(s.get("severity", "warning")),
            description=str(s.get("description", "")),
            evidence=tuple(str(e) for e in s.get("evidence", [])),
            confidence=confidence,
            reasoning=str(s.get("reasoning", "")),
        ))
    return sigs


def parse_investigation_response(
    raw: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    duration_ms: float,
    trigger_reasons: list[str],
) -> LLMInvestigationResult:
    """Parse the raw LLM response into a structured LLMInvestigationResult."""
    try:
        data = _parse_response(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        return LLMInvestigationResult(
            triggered=True,
            trigger_reasons=trigger_reasons,
            root_cause_explanation="",
            causal_hypotheses=[],
            degradation_narrative="",
            observations=[],
            debugging_suggestions=[],
            confidence=0.0,
            suggested_signatures=[],
            model_used=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            investigation_duration_ms=duration_ms,
            error=f"Failed to parse LLM response: {exc}",
        )

    return LLMInvestigationResult(
        triggered=True,
        trigger_reasons=trigger_reasons,
        root_cause_explanation=str(data.get("root_cause_explanation", "")),
        causal_hypotheses=_extract_hypotheses(data),
        degradation_narrative=str(data.get("degradation_narrative", "")),
        observations=[str(o) for o in data.get("observations", [])],
        debugging_suggestions=[str(s) for s in data.get("debugging_suggestions", [])],
        confidence=float(data.get("confidence", 0.0)),
        suggested_signatures=_extract_suggested_signatures(data),
        model_used=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        investigation_duration_ms=duration_ms,
    )


def _not_triggered_result() -> LLMInvestigationResult:
    """Return a minimal result indicating investigation was not triggered."""
    return LLMInvestigationResult(
        triggered=False,
        trigger_reasons=[],
        root_cause_explanation="",
        causal_hypotheses=[],
        degradation_narrative="",
        observations=[],
        debugging_suggestions=[],
        confidence=0.0,
        suggested_signatures=[],
        model_used="",
        prompt_tokens=0,
        completion_tokens=0,
        investigation_duration_ms=0.0,
    )


# ── Main entry point ─────────────────────────────────────────────────────────

def investigate(
    record: RunRecord,
    config: LLMInvestigationConfig | None = None,
) -> LLMInvestigationResult:
    """Run LLM semantic investigation on a completed RunRecord.

    This is the main entry point. It evaluates trigger conditions,
    compresses intelligence, calls the OpenAI API, and parses the response.

    The function is synchronous and blocking — it is called during finalization
    after all deterministic analysis is complete.
    """
    cfg = config or _DEFAULT_CONFIG
    if not cfg.enabled:
        return _not_triggered_result()

    triggered, reasons = should_investigate(record, cfg)
    if not triggered:
        return _not_triggered_result()

    # Compress execution intelligence
    briefing = compress_intelligence(record)
    messages = build_prompt(briefing, reasons, cfg)

    # Load .env if present (no-op if python-dotenv not installed)
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    # Resolve API key
    api_key = cfg.api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return LLMInvestigationResult(
            triggered=True,
            trigger_reasons=reasons,
            root_cause_explanation="",
            causal_hypotheses=[],
            degradation_narrative="",
            observations=[],
            debugging_suggestions=[],
            confidence=0.0,
            suggested_signatures=[],
            model_used=cfg.model,
            prompt_tokens=0,
            completion_tokens=0,
            investigation_duration_ms=0.0,
            error="No OpenAI API key found (set OPENAI_API_KEY or pass api_key in config)",
        )

    # Call OpenAI API
    try:
        import openai  # type: ignore[import-untyped]
    except ImportError:
        return LLMInvestigationResult(
            triggered=True,
            trigger_reasons=reasons,
            root_cause_explanation="",
            causal_hypotheses=[],
            degradation_narrative="",
            observations=[],
            debugging_suggestions=[],
            confidence=0.0,
            suggested_signatures=[],
            model_used=cfg.model,
            prompt_tokens=0,
            completion_tokens=0,
            investigation_duration_ms=0.0,
            error="openai package not installed (pip install openai)",
        )

    client = openai.OpenAI(api_key=api_key)
    t0 = time.perf_counter()
    try:
        response = client.chat.completions.create(
            model=cfg.model,
            messages=messages,  # type: ignore[arg-type]
            max_tokens=cfg.max_tokens,
            temperature=cfg.temperature,
            response_format={"type": "json_object"},
        )
        duration_ms = (time.perf_counter() - t0) * 1000

        choice = response.choices[0]
        raw_content = choice.message.content or ""
        usage = response.usage
        prompt_tok = usage.prompt_tokens if usage else 0
        completion_tok = usage.completion_tokens if usage else 0

        return parse_investigation_response(
            raw=raw_content,
            model=cfg.model,
            prompt_tokens=prompt_tok,
            completion_tokens=completion_tok,
            duration_ms=duration_ms,
            trigger_reasons=reasons,
        )

    except Exception as exc:
        duration_ms = (time.perf_counter() - t0) * 1000
        return LLMInvestigationResult(
            triggered=True,
            trigger_reasons=reasons,
            root_cause_explanation="",
            causal_hypotheses=[],
            degradation_narrative="",
            observations=[],
            debugging_suggestions=[],
            confidence=0.0,
            suggested_signatures=[],
            model_used=cfg.model,
            prompt_tokens=0,
            completion_tokens=0,
            investigation_duration_ms=duration_ms,
            error=f"OpenAI API call failed: {exc}",
        )

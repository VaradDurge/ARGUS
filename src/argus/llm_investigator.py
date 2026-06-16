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

    # Always collect detailed evidence — even for always_investigate or clean runs.
    # The LLM needs specific pointers to reason about the execution.
    reasons: list[str] = []

    for event in record.steps:
        if event.status == "fail":
            fields = event.inspection.missing_fields if event.inspection else []
            tf_types = (
                [tf.failure_type for tf in event.inspection.tool_failures]
                if event.inspection
                else []
            )
            detail = f"silent failure at '{event.node_name}'"
            if fields:
                detail += f" (missing: {', '.join(fields)})"
            if tf_types:
                detail += f" (tool failures: {', '.join(tf_types)})"
            reasons.append(detail)
        elif event.status == "degraded_input":
            upstream = event.inspection.degraded_upstream_node if event.inspection else None
            degraded_fields = event.inspection.degraded_fields if event.inspection else []
            detail = f"degraded input at '{event.node_name}'"
            if upstream:
                detail += f" (from: {upstream})"
            if degraded_fields:
                detail += f" (fields: {', '.join(degraded_fields)})"
            reasons.append(detail)
        elif event.status == "crashed":
            exc_summary = (event.exception or "")[:120]
            reasons.append(f"crash at '{event.node_name}': {exc_summary}")
        elif event.status == "semantic_fail":
            signals = []
            if event.inspection and event.inspection.semantic_signals:
                signals = [
                    f"{s.sig_id} on {s.dotted_path}" for s in event.inspection.semantic_signals[:3]
                ]
            failed_validators = [
                v.validator_name for v in event.validator_results if not v.is_valid
            ]
            detail = f"semantic failure at '{event.node_name}'"
            if signals:
                detail += f" (signals: {', '.join(signals)})"
            if failed_validators:
                detail += f" (validators: {', '.join(failed_validators)})"
            reasons.append(detail)
        elif event.status == "pass" and event.inspection:
            insp = event.inspection
            # If the per-node semantic check passed, its LLM judge already
            # confirmed the output is valid — don't surface warning-level
            # tool failures as investigation triggers (they are false positives).
            sc_approved = (
                event.semantic_check is not None
                and event.semantic_check.passed
                and event.semantic_check.confidence >= 0.7
            )
            if insp.tool_failures and not sc_approved:
                tf_detail = ", ".join(
                    f"{tf.failure_type} on '{tf.field_name}'" for tf in insp.tool_failures[:3]
                )
                reasons.append(f"tool warning at '{event.node_name}': {tf_detail}")
            if insp.empty_fields:
                reasons.append(
                    f"empty fields at '{event.node_name}': {', '.join(insp.empty_fields)}"
                )

    if not reasons:
        reasons.append(f"run status: {record.overall_status} (no specific signals)")

    # Skip investigation only if the run is clean AND no failure signals were found.
    # If any node has semantic degradation, tool failures, etc., always investigate.
    has_real_signals = any(
        r.startswith(
            (
                "silent failure",
                "crash",
                "semantic failure",
                "degraded input",
                "tool warning",
                "empty fields",
            )
        )
        for r in reasons
    )
    if not cfg.always_investigate and record.overall_status == "clean" and not has_real_signals:
        return False, []

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
                    {
                        "type": tf.failure_type,
                        "field": tf.field_name,
                        "severity": tf.severity,
                        "evidence": tf.evidence[:80],
                    }
                    for tf in insp.tool_failures
                ]
            if insp.missing_fields:
                signals["missing_fields"] = insp.missing_fields
            if insp.empty_fields:
                signals["empty_fields"] = insp.empty_fields
            if insp.semantic_signals:
                signals["semantic_signals"] = [
                    {
                        "id": s.sig_id,
                        "category": s.category,
                        "severity": s.severity,
                        "path": s.dotted_path,
                        "evidence": s.evidence[:60],
                    }
                    for s in insp.semantic_signals
                ]
            if signals:
                summary["inspection"] = signals

        # Compact anomaly signals
        if event.anomaly_signals:
            summary["anomalies"] = [
                {
                    "id": a.anomaly_id,
                    "severity": a.severity,
                    "score": a.suspicion_score,
                    "reason": a.reason[:80],
                }
                for a in event.anomaly_signals
            ]

        # Compact validator results
        failed_validators = [v for v in event.validator_results if not v.is_valid]
        if failed_validators:
            summary["failed_validators"] = [
                {"name": v.validator_name, "message": v.message[:80]} for v in failed_validators
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
                {
                    "node": o.node_name,
                    "step": o.step_index,
                    "signals": list(o.signal_types),
                    "confidence": o.confidence,
                    "reason": o.reason,
                }
                for o in corr.degradation_origins
            ],
            "propagation_chains": [
                {
                    "type": c.chain_type,
                    "nodes": list(c.nodes),
                    "summary": c.summary,
                    "links": [
                        {
                            "from": lnk.source_node,
                            "to": lnk.target_node,
                            "signal": lnk.signal_type,
                            "confidence": lnk.confidence,
                            "evidence": lnk.evidence,
                        }
                        for lnk in c.links
                    ],
                }
                for c in corr.propagation_chains
            ],
            "timeline": [
                {
                    "step": t.step_index,
                    "node": t.node_name,
                    "event": t.event_type,
                    "label": t.label,
                }
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
  "root_cause_explanation": "<Cover ALL failing nodes. Name each node, field, reason.>",
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
  "debugging_suggestions": [
    {
      "node": "<which node to fix>",
      "what": "<one-line summary of the fix>",
      "why": "<why this prevents the failure>",
      "code_hint": "<pseudocode or concrete hint, e.g. 'if not sources: raise ValueError(...)'>"
    }
  ],
  "confidence": <0.0-1.0 overall confidence>,
  "suggested_signatures": []
}

Rules:
- Be precise and evidence-based. Reference specific nodes and signals.
- Rank hypotheses by confidence. Include 1-4 hypotheses.
- debugging_suggestions MUST be structured objects, not plain strings. Each suggestion \
  must name the exact node, describe a concrete fix with a code hint, and explain why \
  it prevents recurrence. Include as many suggestions as the pipeline needs — one per \
  distinct failure point. Do NOT pad with generic advice like "add logging" or \
  "investigate the API". Every suggestion must be a specific code-level change.
- Your confidence should reflect how certain you are, not how bad the degradation is.
- Do NOT speculate beyond what the evidence supports.
- Do NOT suggest changes to ARGUS internals or detection logic.
- If the correlator's causal summary conflicts with the node-level evidence, \
  trust the node-level evidence and explain the discrepancy.
- root_cause_explanation must cover ALL failing or degraded nodes, not just the most \
  severe one. If node B has semantic degradation and node C has a silent failure, explain \
  BOTH — do not skip lower-severity failures. Name each exact node, exact field, and \
  precise reason. No vague phrases like "degradation originated from". Be direct: \
  what broke, where, why — for every affected node.
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

    # Build a structured, directive prompt that forces the LLM to reason deeply
    status = briefing.get("overall_status", "unknown")
    node_count = briefing.get("node_count", 0)
    step_count = briefing.get("step_count", 0)
    topology_nodes = briefing.get("topology", {}).get("nodes", [])
    root_chain = briefing.get("deterministic_root_cause_chain", [])
    corr = briefing.get("correlation", {})
    causal_summary = corr.get("causal_summary", "")

    user_content = (
        f"## Pipeline Overview\n"
        f"Status: **{status}** | Nodes: {node_count} | Steps executed: {step_count}\n"
        f"Topology: {' -> '.join(topology_nodes)}\n"
    )
    if root_chain:
        user_content += f"Deterministic root cause chain: {' -> '.join(root_chain)}\n"
    if causal_summary:
        user_content += f"Correlator summary: {causal_summary}\n"

    user_content += (
        "\n## Signals Detected\n"
        "The following issues were flagged by deterministic analysis:\n"
        + "\n".join(f"- {r}" for r in trigger_reasons)
        + "\n\n## Your Task\n"
        "Analyze the full execution intelligence below. You MUST cover EVERY failing or "
        "degraded node — not just the most severe one. If multiple nodes have different "
        "failure types (e.g. semantic degradation in one node and silent failure in another), "
        "explain ALL of them in your root_cause_explanation, degradation_narrative, and "
        "debugging_suggestions. For each affected node, explain the SEMANTIC reason it "
        "failed — not just 'field X was empty' but WHY the upstream logic produced that "
        "empty field, what the node was trying to do, and how the failure propagated. "
        "Be specific about field names, values, and the causal chain. "
        "If the correlator's attribution seems wrong, say so.\n"
        "\n## Full Execution Intelligence\n" + json.dumps(briefing, indent=2, default=str)
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
        hypotheses.append(
            SemanticHypothesis(
                hypothesis=str(h.get("hypothesis", "")),
                confidence=float(h.get("confidence", 0.0)),
                supporting_evidence=tuple(str(e) for e in h.get("supporting_evidence", [])),
                category=str(h.get("category", "other")),
            )
        )
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
        sigs.append(
            SuggestedSignature(
                pattern=str(s.get("pattern", "")),
                match_strategy=str(s.get("match_strategy", "contains_ci")),
                proposed_category=str(s.get("proposed_category", "unknown")),
                severity=str(s.get("severity", "warning")),
                description=str(s.get("description", "")),
                evidence=tuple(str(e) for e in s.get("evidence", [])),
                confidence=confidence,
                reasoning=str(s.get("reasoning", "")),
            )
        )
    return sigs


def _extract_suggestions(data: dict[str, Any]) -> list[str]:
    """Extract debugging suggestions, handling both structured and plain formats."""
    raw = data.get("debugging_suggestions", [])
    suggestions: list[str] = []
    for s in raw:
        if isinstance(s, str):
            suggestions.append(s)
        elif isinstance(s, dict):
            node = s.get("node", "")
            what = s.get("what", "")
            why = s.get("why", "")
            code_hint = s.get("code_hint", "")
            parts = []
            if node:
                parts.append(f"[{node}]")
            if what:
                parts.append(what)
            if why:
                parts.append(f"— {why}")
            if code_hint:
                parts.append(f"\n    {code_hint}")
            suggestions.append(" ".join(parts) if parts else str(s))
    return suggestions


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
        debugging_suggestions=_extract_suggestions(data),
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

        load_dotenv(override=True)
    except ImportError:
        pass

    # Resolve API key — server env var always takes precedence (SaaS mode)
    api_key = os.environ.get("OPENAI_API_KEY") or cfg.api_key
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


# ── Comparative analysis ─────────────────────────────────────────────────────

_COMPARE_SYSTEM_PROMPT = """\
You are a comparative analysis engine for ARGUS, an agent pipeline monitoring system.

You receive compressed execution intelligence from TWO pipeline runs and must \
analyze their differences. Focus on actionable insights that help the developer \
understand what changed between runs and why.

Respond with a JSON object containing these fields:
{
  "structural_summary": "<1-2 sentences about structural differences>",
  "performance_comparison": "<timing/resource usage changes>",
  "failure_analysis": "<what failed, whether related, key diffs>",
  "root_cause_delta": "<what changed and why between runs>",
  "key_insights": ["<insight 1>", "<insight 2>", ...],
  "recommendation": "<what to do next>",
  "confidence": <0.0-1.0>
}

Be specific about node names, field names, and status transitions. \
If the runs have completely different pipeline structures, focus on \
structural comparison rather than per-node diffs.
"""


def compare_runs(
    record_a: RunRecord,
    record_b: RunRecord,
    model: str = "gpt-4o-mini",
    max_tokens: int = 2048,
) -> dict[str, Any]:
    """Generate comparative AI analysis between two runs.

    Returns a dict with the comparison result or an error key.
    """
    # Load .env if present
    try:
        from dotenv import load_dotenv

        load_dotenv(override=True)
    except ImportError:
        pass

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"error": "No OPENAI_API_KEY found in environment"}

    try:
        import openai  # type: ignore[import-untyped]
    except ImportError:
        return {"error": "openai package not installed (pip install openai)"}

    briefing_a = compress_intelligence(record_a)
    briefing_b = compress_intelligence(record_b)

    # Compute structural overlap
    nodes_a = set(record_a.graph_node_names)
    nodes_b = set(record_b.graph_node_names)
    shared = nodes_a & nodes_b
    only_a = nodes_a - nodes_b
    only_b = nodes_b - nodes_a
    union = nodes_a | nodes_b
    overlap = len(shared) / len(union) if union else 1.0

    user_content = (
        "## Run A\n"
        f"Status: **{record_a.overall_status}** | "
        f"Nodes: {len(record_a.graph_node_names)} | "
        f"Steps: {len(record_a.steps)} | "
        f"Duration: {record_a.duration_ms}ms\n"
        f"Topology: {' -> '.join(record_a.graph_node_names)}\n\n"
        "## Run B\n"
        f"Status: **{record_b.overall_status}** | "
        f"Nodes: {len(record_b.graph_node_names)} | "
        f"Steps: {len(record_b.steps)} | "
        f"Duration: {record_b.duration_ms}ms\n"
        f"Topology: {' -> '.join(record_b.graph_node_names)}\n\n"
        "## Structural Analysis\n"
        f"Node overlap: {overlap:.0%} | "
        f"Shared: {sorted(shared) if shared else 'none'} | "
        f"Only in A: {sorted(only_a) if only_a else 'none'} | "
        f"Only in B: {sorted(only_b) if only_b else 'none'}\n\n"
        f"Is replay: {record_b.parent_run_id == record_a.run_id}\n\n"
        "## Run A Intelligence\n"
        + json.dumps(briefing_a, indent=2, default=str)
        + "\n\n## Run B Intelligence\n"
        + json.dumps(briefing_b, indent=2, default=str)
    )

    messages = [
        {"role": "system", "content": _COMPARE_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    client = openai.OpenAI(api_key=api_key)
    t0 = time.perf_counter()
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            max_tokens=max_tokens,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        duration_ms = (time.perf_counter() - t0) * 1000

        raw = response.choices[0].message.content or ""
        usage = response.usage
        result = _parse_response(raw)
        result["model_used"] = model
        result["prompt_tokens"] = usage.prompt_tokens if usage else 0
        result["completion_tokens"] = usage.completion_tokens if usage else 0
        result["duration_ms"] = round(duration_ms)
        return result

    except Exception as exc:
        duration_ms = (time.perf_counter() - t0) * 1000
        return {"error": f"OpenAI API call failed: {exc}", "duration_ms": round(duration_ms)}

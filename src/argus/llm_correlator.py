"""LLM-assisted correlation augmentation for ARGUS.

Augments the deterministic correlator (correlator.py) with LLM-based
causal reasoning. The LLM sees all signals across nodes and the
deterministic correlator's output, then produces an enhanced causal
narrative and identifies cross-node connections the rule-based system
may have missed.

Uses gpt-4o by default. Skips the LLM call entirely when the
deterministic correlator is already confident or there's nothing to
analyze — keeping simple pipelines at zero cost.
"""

from __future__ import annotations

import json
import time

from argus.models import CorrelationReport, LLMCorrelationInsight, RunRecord

_SYSTEM_PROMPT = (
    "You are a causal analysis engine for ARGUS, a pipeline monitoring system. "
    "You receive:\n"
    "1. A deterministic correlation report (degradation origins, propagation "
    "chains, causal summary)\n"
    "2. Per-node signal summaries from a pipeline run\n\n"
    "Your job is to identify causal connections the rule-based correlator may "
    "have missed. Focus on SEMANTIC causation: why a node's degraded output "
    "caused downstream nodes to fail in ways pattern matching cannot detect.\n\n"
    "Respond with JSON:\n"
    "{\n"
    '  "enhanced_summary": "<2-4 sentence causal narrative>",\n'
    '  "cross_node_connections": ["<connection 1>", ...],\n'
    '  "confidence": <0.0-1.0>\n'
    "}\n\n"
    "Rules:\n"
    "- enhanced_summary should AUGMENT the deterministic summary, not repeat it\n"
    "- cross_node_connections should list semantic connections not captured by "
    "field-drop or placeholder propagation tracking\n"
    "- Focus on WHY degradation propagated, not just THAT it propagated\n"
    "- If the deterministic analysis is already comprehensive, say so and return "
    "an empty cross_node_connections list with high confidence\n"
    "- Never fabricate connections without evidence from the signals"
)

_MAX_VALUE_LEN = 300
_MAX_SIGNALS_PER_NODE = 5


def _should_skip(
    record: RunRecord,
    deterministic_report: CorrelationReport,
) -> bool:
    """Determine if the LLM call can be skipped (deterministic is sufficient)."""
    if record.overall_status == "clean":
        return True
    no_origins = not deterministic_report.degradation_origins
    no_chains = not deterministic_report.propagation_chains
    if no_origins and no_chains:
        return True
    # Single confident origin with ≤1 chain — deterministic is clear enough
    if (
        len(deterministic_report.degradation_origins) == 1
        and deterministic_report.degradation_origins[0].confidence >= 0.8
        and len(deterministic_report.propagation_chains) <= 1
    ):
        return True
    return False


def _build_compact_briefing(
    record: RunRecord,
    deterministic_report: CorrelationReport,
) -> str:
    """Build a compact briefing for the LLM (~2000 tokens)."""
    sections: list[str] = []

    # Topology
    sections.append(
        f"Pipeline: {len(record.graph_node_names)} nodes, status={record.overall_status}"
    )
    sections.append(f"Nodes: {', '.join(record.graph_node_names)}")

    # Deterministic correlation output
    sections.append(f"\nDeterministic summary: {deterministic_report.causal_summary}")

    if deterministic_report.degradation_origins:
        origins = []
        for o in deterministic_report.degradation_origins:
            origins.append(f"  - {o.node_name} (conf={o.confidence:.2f}): {o.reason}")
        sections.append("Origins:\n" + "\n".join(origins))

    if deterministic_report.propagation_chains:
        chains = []
        for c in deterministic_report.propagation_chains:
            chains.append(f"  - [{c.chain_type}] {' → '.join(c.nodes)}: {c.summary}")
        sections.append("Propagation chains:\n" + "\n".join(chains))

    # Per-node signal summaries (compact)
    sections.append("\nPer-node signals:")
    for event in record.steps:
        signals: list[str] = []
        signals.append(f"status={event.status}")
        if event.inspection:
            insp = event.inspection
            if insp.tool_failures:
                tf_summary = [
                    f"{tf.failure_type}({tf.field_name})"
                    for tf in insp.tool_failures[:_MAX_SIGNALS_PER_NODE]
                ]
                signals.append(f"tool_failures=[{', '.join(tf_summary)}]")
            if insp.missing_fields:
                signals.append(f"missing={insp.missing_fields}")
            if insp.semantic_signals:
                ss_summary = [
                    f"{ss.sig_id}({ss.dotted_path},conf={ss.confidence:.2f})"
                    for ss in insp.semantic_signals[:_MAX_SIGNALS_PER_NODE]
                ]
                signals.append(f"semantic=[{', '.join(ss_summary)}]")
        if event.anomaly_signals:
            a_summary = [
                f"{a.anomaly_id}(susp={a.suspicion_score:.2f})" for a in event.anomaly_signals[:3]
            ]
            signals.append(f"anomalies=[{', '.join(a_summary)}]")
        if event.exception:
            signals.append(f"exception={event.exception[:_MAX_VALUE_LEN]}")

        sections.append(f"  {event.node_name}: {', '.join(signals)}")

    return "\n".join(sections)


def augment_correlation(
    record: RunRecord,
    deterministic_report: CorrelationReport,
    model: str = "gpt-4o",
    max_tokens: int = 1500,
) -> LLMCorrelationInsight | None:
    """Augment deterministic correlation with LLM causal reasoning.

    Returns LLMCorrelationInsight, or None if the LLM call is skipped
    (deterministic analysis is sufficient). On error, returns result
    with the error field set.
    """
    if _should_skip(record, deterministic_report):
        return None

    from argus.llm_proxy import create_chat_completion, is_available  # noqa: PLC0415

    if not is_available():
        return None

    t0 = time.perf_counter()
    briefing = _build_compact_briefing(record, deterministic_report)

    try:
        result = create_chat_completion(
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": briefing},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
            response_format={"type": "json_object"},
            timeout=15.0,
        )
        elapsed = (time.perf_counter() - t0) * 1000

        if "error" in result:
            return LLMCorrelationInsight(
                enhanced_summary="",
                cross_node_connections=(),
                confidence=0.0,
                model=model,
                prompt_tokens=0,
                completion_tokens=0,
                duration_ms=round(elapsed, 2),
                error=result["error"],
            )

        choices = result.get("choices", [])
        raw = choices[0]["message"]["content"] if choices else "{}"
        parsed = json.loads(raw)
        usage = result.get("usage", {})

        return LLMCorrelationInsight(
            enhanced_summary=str(parsed.get("enhanced_summary", "")),
            cross_node_connections=tuple(str(c) for c in parsed.get("cross_node_connections", [])),
            confidence=float(parsed.get("confidence", 0.5)),
            model=model,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            duration_ms=round(elapsed, 2),
        )
    except Exception as exc:
        elapsed = (time.perf_counter() - t0) * 1000
        return LLMCorrelationInsight(
            enhanced_summary="",
            cross_node_connections=(),
            confidence=0.0,
            model=model,
            prompt_tokens=0,
            completion_tokens=0,
            duration_ms=round(elapsed, 2),
            error=str(exc),
        )

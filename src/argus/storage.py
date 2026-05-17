from __future__ import annotations

import dataclasses
import json
import os
from pathlib import Path
from typing import Any

from argus.models import (
    AnomalySignal,
    BehaviorConfig,
    CorrelationReport,
    DegradationOrigin,
    FieldMismatch,
    InspectionResult,
    LLMInvestigationResult,
    NodeEvent,
    PropagationChain,
    PropagationLink,
    ReplayImpact,
    RunRecord,
    SemanticHypothesis,
    SemanticSignal,
    SuggestedSignature,
    TimelineEvent,
    ToolFailure,
    ValidatorResult,
)

_ARGUS_DIR = ".argus"
_RUNS_DIR = "runs"


def _runs_path() -> Path:
    base = Path(os.getcwd()) / _ARGUS_DIR / _RUNS_DIR
    base.mkdir(parents=True, exist_ok=True)
    return base


def _to_json_serializable(obj: Any) -> Any:
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: _to_json_serializable(v) for k, v in dataclasses.asdict(obj).items()}
    if isinstance(obj, dict):
        return {k: _to_json_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_json_serializable(i) for i in obj]
    return str(obj)


def save_run(record: RunRecord) -> Path:
    """Write a completed RunRecord to .argus/runs/<run-id>.json atomically.

    If the user is logged in to ARGUS cloud, the run is also pushed
    to Supabase in a background thread (non-blocking).
    """
    path = _runs_path() / f"{record.run_id}.json"
    tmp = path.with_suffix(".tmp")
    data = _to_json_serializable(record)
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.rename(path)

    # Cloud sync — push synchronously so the thread isn't killed on process exit
    try:
        from argus.cloud import is_logged_in, push_run
        if is_logged_in():
            push_run(data)
    except Exception:
        pass  # cloud sync is best-effort

    return path


def load_run(run_id: str) -> RunRecord:
    """Load a RunRecord by run-id (or 8-char prefix).

    Searches the CWD-level .argus/runs/ first, then recurses into
    subdirectories so runs recorded from child folders are found.
    """
    runs_dir = _runs_path()
    try:
        path = _resolve_run_path(run_id, runs_dir)
        data = json.loads(path.read_text(encoding="utf-8"))
        return _deserialize_run(data)
    except FileNotFoundError:
        pass

    # Search all .argus/runs/ directories under CWD
    cwd = Path(os.getcwd())
    for sub_runs in cwd.rglob(".argus/runs"):
        if sub_runs == runs_dir or not sub_runs.is_dir():
            continue
        try:
            path = _resolve_run_path(run_id, sub_runs)
            data = json.loads(path.read_text(encoding="utf-8"))
            return _deserialize_run(data)
        except (FileNotFoundError, ValueError):
            continue

    raise FileNotFoundError(f"No run found for id '{run_id}' under {cwd}")


def _run_json_files_newest_first(runs_dir: Path) -> list[Path]:
    """Sort run JSON paths by real time order, not lexicographic run_id.

    run_id ends with random hex; two runs in the same second can order wrong
    if sorted by filename (e.g. crash run appearing \"newer\" than the next).
    """
    files = list(runs_dir.glob("*.json"))
    if not files:
        return []

    def sort_key(path: Path) -> tuple[str, float]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            started = data.get("started_at") or ""
        except Exception:
            started = ""
        try:
            mtime = path.stat().st_mtime
        except OSError:
            mtime = 0.0
        return (started, mtime)

    return sorted(files, key=sort_key, reverse=True)


def list_runs() -> list[dict[str, Any]]:
    """Return summary metadata for all runs, newest first."""
    runs_dir = _runs_path()
    summaries = []
    for f in _run_json_files_newest_first(runs_dir):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            summaries.append({
                "run_id": data.get("run_id", f.stem),
                "started_at": data.get("started_at", ""),
                "overall_status": data.get("overall_status", "unknown"),
                "duration_ms": data.get("duration_ms"),
                "step_count": len(data.get("steps", [])),
            })
        except Exception:
            continue
    return summaries


def last_run_id() -> str | None:
    runs_dir = _runs_path()
    files = _run_json_files_newest_first(runs_dir)
    if not files:
        return None
    data = json.loads(files[0].read_text(encoding="utf-8"))
    return data.get("run_id")


def _resolve_run_path(run_id: str, runs_dir: Path) -> Path:
    exact = runs_dir / f"{run_id}.json"
    if exact.exists():
        return exact
    # prefix match
    matches = [f for f in runs_dir.glob("*.json") if f.stem.startswith(run_id)]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        names = [f.stem for f in matches]
        raise ValueError(f"Ambiguous run-id prefix '{run_id}' matches: {names}")
    raise FileNotFoundError(f"No run found for id '{run_id}' in {runs_dir}")


def _deserialize_run(data: dict[str, Any]) -> RunRecord:
    steps = [_deserialize_event(s) for s in data.get("steps", [])]
    bc_data = data.get("behavior_config")
    behavior_config = BehaviorConfig(**bc_data) if bc_data else None
    corr_data = data.get("correlation")
    correlation = _deserialize_correlation(corr_data) if corr_data else None
    llm_inv_data = data.get("llm_investigation")
    llm_investigation = _deserialize_llm_investigation(llm_inv_data) if llm_inv_data else None
    return RunRecord(
        run_id=data["run_id"],
        argus_version=data.get("argus_version", "unknown"),
        started_at=data.get("started_at", ""),
        completed_at=data.get("completed_at"),
        duration_ms=data.get("duration_ms"),
        overall_status=data.get("overall_status", "unknown"),
        first_failure_step=data.get("first_failure_step"),
        root_cause_chain=data.get("root_cause_chain", []),
        graph_node_names=data.get("graph_node_names", []),
        graph_edge_map=data.get("graph_edge_map", {}),
        initial_state=data.get("initial_state", {}),
        steps=steps,
        parent_run_id=data.get("parent_run_id"),
        replay_from_step=data.get("replay_from_step"),
        is_cyclic=data.get("is_cyclic", False),
        app_factory_ref=data.get("app_factory_ref"),
        node_fn_refs=data.get("node_fn_refs"),
        subgraph_run_ids=data.get("subgraph_run_ids", []),
        interrupted=data.get("interrupted", False),
        interrupt_node=data.get("interrupt_node"),
        behavior_config=behavior_config,
        correlation=correlation,
        llm_investigation=llm_investigation,
    )


def _deserialize_correlation(data: dict[str, Any]) -> CorrelationReport:
    origins = [
        DegradationOrigin(
            node_name=o["node_name"],
            step_index=o["step_index"],
            signal_types=tuple(o.get("signal_types", [])),
            confidence=o["confidence"],
            reason=o["reason"],
        )
        for o in data.get("degradation_origins", [])
    ]
    chains = [
        PropagationChain(
            chain_type=c["chain_type"],
            nodes=tuple(c.get("nodes", [])),
            links=tuple(
                PropagationLink(
                    source_node=lnk["source_node"],
                    target_node=lnk["target_node"],
                    signal_type=lnk["signal_type"],
                    confidence=lnk["confidence"],
                    evidence=lnk["evidence"],
                )
                for lnk in c.get("links", [])
            ),
            summary=c["summary"],
        )
        for c in data.get("propagation_chains", [])
    ]
    timeline = [
        TimelineEvent(
            step_index=t["step_index"],
            node_name=t["node_name"],
            event_type=t["event_type"],
            label=t["label"],
            signal_summary=t["signal_summary"],
        )
        for t in data.get("timeline", [])
    ]
    ri_data = data.get("replay_impact")
    replay_impact: ReplayImpact | None = None
    if ri_data:
        replay_impact = ReplayImpact(
            improved_nodes=ri_data.get("improved_nodes", []),
            regressed_nodes=ri_data.get("regressed_nodes", []),
            key_fix_node=ri_data.get("key_fix_node"),
            downstream_improvement_count=ri_data.get("downstream_improvement_count", 0),
            summary=ri_data.get("summary", ""),
        )
    return CorrelationReport(
        run_id=data["run_id"],
        degradation_origins=origins,
        propagation_chains=chains,
        causal_summary=data.get("causal_summary", ""),
        timeline=timeline,
        replay_impact=replay_impact,
    )


def _deserialize_llm_investigation(data: dict[str, Any]) -> LLMInvestigationResult:
    hypotheses = [
        SemanticHypothesis(
            hypothesis=h["hypothesis"],
            confidence=h["confidence"],
            supporting_evidence=tuple(h.get("supporting_evidence", [])),
            category=h.get("category", "other"),
        )
        for h in data.get("causal_hypotheses", [])
    ]
    suggested_sigs = [
        SuggestedSignature(
            pattern=s["pattern"],
            match_strategy=s.get("match_strategy", "contains_ci"),
            proposed_category=s.get("proposed_category", "unknown"),
            severity=s.get("severity", "warning"),
            description=s.get("description", ""),
            evidence=tuple(s.get("evidence", [])),
            confidence=s.get("confidence", 0.0),
            reasoning=s.get("reasoning", ""),
        )
        for s in data.get("suggested_signatures", [])
    ]
    return LLMInvestigationResult(
        triggered=data.get("triggered", False),
        trigger_reasons=data.get("trigger_reasons", []),
        root_cause_explanation=data.get("root_cause_explanation", ""),
        causal_hypotheses=hypotheses,
        degradation_narrative=data.get("degradation_narrative", ""),
        observations=data.get("observations", []),
        debugging_suggestions=data.get("debugging_suggestions", []),
        confidence=data.get("confidence", 0.0),
        suggested_signatures=suggested_sigs,
        model_used=data.get("model_used", ""),
        prompt_tokens=data.get("prompt_tokens", 0),
        completion_tokens=data.get("completion_tokens", 0),
        investigation_duration_ms=data.get("investigation_duration_ms", 0.0),
        error=data.get("error"),
    )


def _deserialize_event(data: dict[str, Any]) -> NodeEvent:
    insp_data = data.get("inspection")
    inspection = None
    if insp_data:
        mismatches = [
            FieldMismatch(**m) for m in insp_data.get("type_mismatches", [])
        ]
        tool_failures = [
            ToolFailure(**tf) for tf in insp_data.get("tool_failures", [])
        ]
        semantic_signals = [
            SemanticSignal(
                sig_id=s["sig_id"],
                category=s["category"],
                severity=s["severity"],
                description=s["description"],
                field_path=tuple(s["field_path"]),
                evidence=s["evidence"],
            )
            for s in insp_data.get("semantic_signals", [])
        ]
        inspection = InspectionResult(
            is_silent_failure=insp_data.get("is_silent_failure", False),
            missing_fields=insp_data.get("missing_fields", []),
            empty_fields=insp_data.get("empty_fields", []),
            type_mismatches=mismatches,
            severity=insp_data.get("severity", "ok"),
            message=insp_data.get("message", ""),
            unannotated_successors=insp_data.get("unannotated_successors", []),
            suspicious_empty_keys=insp_data.get("suspicious_empty_keys", []),
            tool_failures=tool_failures,
            has_tool_failure=insp_data.get("has_tool_failure", False),
            semantic_signals=semantic_signals,
            degraded_fields=insp_data.get("degraded_fields", []),
            degraded_upstream_node=insp_data.get("degraded_upstream_node"),
        )
    validator_results = [
        ValidatorResult(**v) for v in data.get("validator_results", [])
    ]
    anomaly_signals = [
        AnomalySignal(**a) for a in data.get("anomaly_signals", [])
    ]
    return NodeEvent(
        step_index=data.get("step_index", 0),
        node_name=data.get("node_name", ""),
        status=data.get("status", "pass"),
        input_state=data.get("input_state", {}),
        output_dict=data.get("output_dict"),
        duration_ms=data.get("duration_ms", 0.0),
        timestamp_utc=data.get("timestamp_utc", ""),
        exception=data.get("exception"),
        inspection=inspection,
        attempt_index=data.get("attempt_index", 0),
        validator_results=validator_results,
        is_subgraph_entry=data.get("is_subgraph_entry", False),
        subgraph_run_id=data.get("subgraph_run_id"),
        behavior_type=data.get("behavior_type"),
        anomaly_signals=anomaly_signals,
    )

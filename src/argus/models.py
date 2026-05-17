from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ValidatorResult:
    validator_name: str   # e.g. "*:check_length" or "summarize:my_fn"
    is_valid: bool
    message: str


@dataclass
class FieldMismatch:
    field_name: str
    expected_type: str
    actual_type: str
    actual_value_repr: str


@dataclass
class ToolFailure:
    # "error_response" | "rate_limit" | "empty_result" | "error_in_data" | "partial_failure"
    failure_type: str
    field_name: str    # which key in the output dict triggered detection
    severity: str      # "critical" | "warning"
    evidence: str      # short human-readable description of what was found


@dataclass(frozen=True)
class SemanticSignal:
    """A semantic degradation signal emitted by the heuristic engine."""

    sig_id: str                   # e.g. "PH-001", "CM-003"
    category: str                 # e.g. "placeholder_outputs"
    severity: str                 # "critical" | "warning"
    description: str
    field_path: tuple[str, ...]   # e.g. ("result", "items", "[0]", "summary")
    evidence: str                 # ≤80 char snippet of the matched value

    @property
    def dotted_path(self) -> str:
        return ".".join(self.field_path)


@dataclass(frozen=True)
class AnomalySignal:
    """A behavioral anomaly signal emitted by the anomaly detector."""

    anomaly_id: str           # e.g. "BA-001"
    severity: str             # "critical" | "warning"
    suspicion_score: float    # 0.0–1.0
    reason: str               # human-readable explanation
    expected_behavior: str    # what was expected for the behavior type
    observed_behavior: str    # what was actually observed
    field_path: str           # dotted path in output, or "" for whole output


@dataclass
class BehaviorConfig:
    """Pipeline-level behavior configuration."""

    default_behavior_type: str | None = None
    node_behaviors: dict[str, str] = field(default_factory=dict)


@dataclass
class InspectionResult:
    is_silent_failure: bool
    missing_fields: list[str]
    empty_fields: list[str]
    type_mismatches: list[FieldMismatch]
    severity: str  # "critical" | "warning" | "info" | "ok"
    message: str
    unannotated_successors: list[str] = field(default_factory=list)
    suspicious_empty_keys: list[str] = field(default_factory=list)
    tool_failures: list[ToolFailure] = field(default_factory=list)
    has_tool_failure: bool = False  # True if any tool_failures with severity="critical"
    semantic_signals: list[SemanticSignal] = field(default_factory=list)
    # Upstream propagation: fields missing from input because an upstream node failed
    degraded_fields: list[str] = field(default_factory=list)
    degraded_upstream_node: str | None = None  # which upstream node caused it


@dataclass
class LLMCallInfo:
    model_name: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float | None = None


@dataclass
class LLMUsage:
    calls: list[LLMCallInfo] = field(default_factory=list)
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float | None = None


@dataclass
class NodeEvent:
    step_index: int
    node_name: str
    status: str  # "pass" | "fail" | "crashed" | "degraded_input" | "semantic_fail" | "interrupted"
    input_state: dict[str, Any]
    output_dict: dict[str, Any] | None
    duration_ms: float
    timestamp_utc: str
    exception: str | None = None
    inspection: InspectionResult | None = None
    attempt_index: int = 0  # how many times this node has run before this event (0-indexed)
    validator_results: list[ValidatorResult] = field(default_factory=list)
    is_subgraph_entry: bool = False   # True if this node is a compiled subgraph
    subgraph_run_id: str | None = None  # run_id of the child session for subgraph nodes
    llm_usage: LLMUsage | None = None
    behavior_type: str | None = None
    anomaly_signals: list[AnomalySignal] = field(default_factory=list)


@dataclass
class RunRecord:
    run_id: str
    argus_version: str
    started_at: str
    completed_at: str | None
    duration_ms: float | None
    overall_status: str  # "clean" | "silent_failure" | "crashed"
    first_failure_step: str | None
    root_cause_chain: list[str]
    graph_node_names: list[str]
    graph_edge_map: dict[str, list[str]]
    initial_state: dict[str, Any]
    steps: list[NodeEvent] = field(default_factory=list)
    parent_run_id: str | None = None
    replay_from_step: str | None = None
    is_cyclic: bool = False  # True if the graph contains back-edges
    subgraph_run_ids: list[str] = field(default_factory=list)  # child run ids
    app_factory_ref: str | None = None  # auto-captured "module:function" for replay
    node_fn_refs: dict[str, str] | None = None  # factory-free replay refs
    interrupted: bool = False        # True if a GraphInterrupt occurred
    interrupt_node: str | None = None  # node name where interrupt occurred
    total_llm_calls: int = 0
    total_tokens: int = 0
    total_cost_usd: float | None = None
    behavior_config: BehaviorConfig | None = None
    correlation: CorrelationReport | None = None
    llm_investigation: LLMInvestigationResult | None = None


# ── Correlation layer dataclasses ──────────────────────────────────────────────


@dataclass(frozen=True)
class PropagationLink:
    """A causal link between two nodes showing how degradation spread."""

    source_node: str
    target_node: str
    signal_type: str   # "field_drop" | "placeholder" | "anomaly_cascade" | "semantic_collapse"
    confidence: float  # 0.0–1.0
    evidence: str      # short human-readable description


@dataclass(frozen=True)
class DegradationOrigin:
    """The most likely starting point of degradation in the pipeline."""

    node_name: str
    step_index: int
    signal_types: tuple[str, ...]  # e.g. ("tool_failure", "missing_field")
    confidence: float              # 0.0–1.0
    reason: str                    # human-readable explanation


@dataclass(frozen=True)
class PropagationChain:
    """A sequence of nodes showing how degradation spread from an origin."""

    chain_type: str   # "tool_failure_cascade" | "semantic_collapse" | "field_drop_cascade"
                      # | "placeholder_propagation" | "anomaly_cascade" | "mixed_degradation"
    nodes: tuple[str, ...]
    links: tuple[PropagationLink, ...]
    summary: str  # developer-readable causal narrative


@dataclass(frozen=True)
class TimelineEvent:
    """A single event in the execution timeline with degradation markers."""

    step_index: int
    node_name: str
    event_type: str   # "node_ok" | "degradation_onset" | "propagation" | "crash"
    label: str        # short description for display
    signal_summary: str  # brief description of signals at this step


@dataclass
class ReplayImpact:
    """Comparison of a replay run against its original."""

    improved_nodes: list[str]
    regressed_nodes: list[str]
    key_fix_node: str | None          # node whose fix most impacted downstream
    downstream_improvement_count: int
    summary: str


@dataclass
class CorrelationReport:
    """Root-cause correlation analysis for a run."""

    run_id: str
    degradation_origins: list[DegradationOrigin]
    propagation_chains: list[PropagationChain]
    causal_summary: str       # 1–3 sentence developer-readable narrative
    timeline: list[TimelineEvent]
    replay_impact: ReplayImpact | None = None


# ── LLM Semantic Investigator dataclasses ─────────────────────────────────────


@dataclass(frozen=True)
class SemanticHypothesis:
    """A causal hypothesis generated by the LLM investigator."""

    hypothesis: str           # concise statement of what may have happened
    confidence: float         # 0.0–1.0 — LLM's self-assessed confidence
    supporting_evidence: tuple[str, ...]  # references to signals/nodes that support this
    category: str             # "retrieval_degradation" | "hallucination_onset" |
                              # "semantic_drift" | "reasoning_collapse" |
                              # "context_loss" | "tool_failure_cascade" | "other"


@dataclass(frozen=True)
class SuggestedSignature:
    """A new semantic degradation pattern suggested by the LLM for registry review."""

    pattern: str              # the string/regex pattern to match
    match_strategy: str       # "exact_ci" | "contains_ci" | "prefix_ci" | "regex"
    proposed_category: str    # e.g. "placeholder_outputs", "semantic_drift", etc.
    severity: str             # "critical" | "warning"
    description: str          # what this pattern detects
    evidence: tuple[str, ...]  # real examples from the run that triggered this suggestion
    confidence: float         # 0.0–1.0
    reasoning: str            # why the LLM thinks this is a recurring pattern


@dataclass
class LLMInvestigationResult:
    """Output of the selective LLM semantic investigator."""

    triggered: bool                          # whether investigation actually ran
    trigger_reasons: list[str]               # why investigation was triggered
    root_cause_explanation: str              # semantic explanation of the root cause
    causal_hypotheses: list[SemanticHypothesis]
    degradation_narrative: str               # developer-readable forensic narrative
    observations: list[str]                  # semantic observations about the execution
    debugging_suggestions: list[str]         # actionable next steps for the developer
    confidence: float                        # overall confidence in the analysis (0.0–1.0)
    suggested_signatures: list[SuggestedSignature]  # new patterns for registry review
    model_used: str                          # which LLM model was used
    prompt_tokens: int                       # tokens consumed
    completion_tokens: int
    investigation_duration_ms: float         # wall-clock time for LLM call
    error: str | None = None                 # if investigation failed, why


@dataclass
class LLMInvestigationConfig:
    """Configuration for the LLM semantic investigator."""

    enabled: bool = False
    model: str = "gpt-4o-mini"
    api_key: str | None = None               # if None, reads OPENAI_API_KEY env var
    max_tokens: int = 2048
    temperature: float = 0.2
    confidence_threshold: float = 0.6        # trigger if deterministic confidence < this
    max_origins_for_ambiguity: int = 2       # trigger if >= this many competing origins
    always_investigate: bool = False          # bypass trigger logic (for debugging)
    suggest_signatures: bool = True          # whether to ask LLM for new patterns

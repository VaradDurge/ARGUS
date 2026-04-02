"""State schemas for the 4-agent research pipeline.

PipelineState is the full graph state (all fields, all nodes).

The per-node input TypedDicts are what ARGUS uses for silent-failure
detection: it reads the first-parameter annotation of each node function
and checks whether the merged state satisfies that contract after the
predecessor node runs.

Pipeline:  research_agent → analysis_agent → validation_agent → report_agent
"""
from __future__ import annotations

from typing import TypedDict


# ── Full graph state ──────────────────────────────────────────────────────

class PipelineState(TypedDict):
    """Complete state carried through all 4 nodes."""

    # Seeded by caller
    topic: str

    # Produced by research_agent
    research_results: list[str]
    metadata: dict

    # Produced by analysis_agent
    analysis: str
    key_insights: list[str]
    confidence_score: float

    # Produced by validation_agent
    validated: bool
    issues: list[str]

    # Produced by report_agent
    final_report: str


# ── Per-node input annotations ─────────────────────────────────────────────
# ARGUS inspects the SUCCESSOR's annotation to know what it requires.
# If the predecessor's output leaves any required field missing in the
# merged state, ARGUS flags it as a silent failure.

class ResearchInput(TypedDict):
    """research_agent only needs the initial topic."""
    topic: str


class AnalysisInput(TypedDict):
    """analysis_agent requires the research output."""
    topic: str
    research_results: list[str]
    metadata: dict


class ValidationInput(TypedDict):
    """validation_agent requires the full analysis output.

    'topic' is included even though validation_agent doesn't use it directly —
    LangGraph filters each node's input to its annotation fields, so including
    'topic' here ensures it flows into the merged state that ARGUS uses when
    checking what report_agent (the successor) requires.

    'key_insights' is required — if analysis_agent silently drops it,
    ARGUS will catch the missing field here.
    """
    topic: str
    analysis: str
    key_insights: list[str]
    confidence_score: float


class ReportInput(TypedDict):
    """report_agent requires the validated analysis."""
    topic: str
    analysis: str
    key_insights: list[str]
    validated: bool

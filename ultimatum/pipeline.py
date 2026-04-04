"""
Pipeline factory for the Competitive Intelligence Pipeline.

build_pipeline() returns an ArgusSession pre-wired with all 15 agents,
the full edge map, and all semantic validators. Call it fresh for each
scenario so each run gets its own session and run_id.

Usage:
    session, agents = build_pipeline()
    run(session, agents, initial_state)
"""
from __future__ import annotations

from typing import Any, Callable

from argus import ArgusSession

from ultimatum.validators import VALIDATORS

# ── Edge topology ─────────────────────────────────────────────────────────────
#
# This is the directed graph of the pipeline. Pass it to session.set_edges()
# so ARGUS can:
#   1. Walk successors for structural transition checks
#   2. Detect cycles (quality_assessor → report_drafter back-edge)
#   3. Know the last node for auto-finalization (linear runs)
#
EDGE_MAP: dict[str, list[str]] = {
    "input_validator":    ["query_expander"],
    "query_expander":     ["web_searcher"],
    "web_searcher":       ["content_fetcher"],
    "content_fetcher":    ["language_screener"],
    "language_screener":  ["dedup_filter"],
    "dedup_filter":       ["relevance_scorer"],
    "relevance_scorer":   ["content_cleaner"],
    "content_cleaner":    ["summarizer"],
    "summarizer":         ["sentiment_analyzer"],
    "sentiment_analyzer": ["entity_extractor"],
    "entity_extractor":   ["insight_generator"],
    "insight_generator":  ["report_drafter"],
    "report_drafter":     ["quality_assessor"],
    # Back-edge: quality_assessor → report_drafter makes the graph cyclic
    "quality_assessor":   ["report_publisher", "report_drafter"],
    # report_publisher is terminal
}

# Ordered list of node names for linear (non-cyclic) runs
LINEAR_NODE_ORDER = [
    "input_validator",
    "query_expander",
    "web_searcher",
    "content_fetcher",
    "language_screener",
    "dedup_filter",
    "relevance_scorer",
    "content_cleaner",
    "summarizer",
    "sentiment_analyzer",
    "entity_extractor",
    "insight_generator",
    "report_drafter",
    "quality_assessor",
    "report_publisher",
]


def build_pipeline(
    overrides: dict[str, Callable] | None = None,
) -> tuple[ArgusSession, dict[str, Callable]]:
    """Build a fresh ArgusSession + wrapped agent dict.

    Args:
        overrides: optional {agent_name: fn} replacements for scenario testing.
                   e.g. {"web_searcher": web_searcher_broken}

    Returns:
        (session, wrapped_agents)
        session       — the ArgusSession (call session.finalize() for cyclic runs)
        wrapped_agents — {name: monitored_fn} ready to call
    """
    from ultimatum.agents import (
        content_cleaner,
        content_fetcher,
        dedup_filter,
        entity_extractor,
        input_validator,
        insight_generator,
        language_screener,
        query_expander,
        quality_assessor,
        relevance_scorer,
        report_drafter,
        report_publisher,
        sentiment_analyzer,
        summarizer,
        web_searcher,
    )

    agent_fns: dict[str, Callable] = {
        "input_validator":    input_validator,
        "query_expander":     query_expander,
        "web_searcher":       web_searcher,
        "content_fetcher":    content_fetcher,
        "language_screener":  language_screener,
        "dedup_filter":       dedup_filter,
        "relevance_scorer":   relevance_scorer,
        "content_cleaner":    content_cleaner,
        "summarizer":         summarizer,
        "sentiment_analyzer": sentiment_analyzer,
        "entity_extractor":   entity_extractor,
        "insight_generator":  insight_generator,
        "report_drafter":     report_drafter,
        "quality_assessor":   quality_assessor,
        "report_publisher":   report_publisher,
    }

    # Apply any scenario-specific overrides
    if overrides:
        for name, fn in overrides.items():
            agent_fns[name] = fn

    session = ArgusSession(validators=VALIDATORS)
    session.set_edges(EDGE_MAP)

    # instrument() wraps all 15 agents in one call
    wrapped = session.instrument(agents=agent_fns)

    return session, wrapped


def run_linear(
    session: ArgusSession,
    agents: dict[str, Callable],
    initial_state: dict[str, Any],
) -> dict[str, Any]:
    """Execute the pipeline linearly (no revision cycle).

    Runs each agent in order, merging outputs into the accumulated state.
    Calls session.finalize() at the end (required since this is a cyclic
    graph by edge definition — quality_assessor has a back-edge).
    """
    state = dict(initial_state)
    for name in LINEAR_NODE_ORDER:
        state = {**state, **agents[name](state)}
    session.finalize()
    return state


def run_with_cycle(
    session: ArgusSession,
    agents: dict[str, Callable],
    initial_state: dict[str, Any],
    max_revisions: int = 3,
) -> dict[str, Any]:
    """Execute the pipeline with the quality revision cycle.

    If quality_assessor.needs_revision is True, loops back to
    report_drafter (incrementing draft_version) until approved
    or max_revisions is reached. ARGUS records each iteration.
    """
    state = dict(initial_state)

    # Phases 1-12: linear
    linear_nodes = LINEAR_NODE_ORDER[:-3]   # up to insight_generator
    for name in linear_nodes:
        state = {**state, **agents[name](state)}

    # Phase 4-5: revision cycle
    state["draft_version"] = 1
    for attempt in range(1, max_revisions + 1):
        state["draft_version"] = attempt
        state = {**state, **agents["report_drafter"](state)}
        state = {**state, **agents["quality_assessor"](state)}
        if not state.get("needs_revision", False):
            break

    # Phase 5: publish (only if approved)
    if not state.get("needs_revision", False):
        state = {**state, **agents["report_publisher"](state)}

    session.finalize()
    return state

from __future__ import annotations

from test_workflow.state import (
    AnalysisInput,
    ReportInput,
    ResearchInput,
    ValidationInput,
)


def research_agent(state: ResearchInput) -> dict:
    topic = state["topic"]
    return {
        "research_results": [
            f"[Finding 1] {topic} has shown significant momentum in the past 5 years.",
            f"[Finding 2] Key technical challenges in {topic} include scalability and reliability.",
            f"[Finding 3] Recent peer-reviewed breakthroughs have accelerated {topic} adoption.",
            f"[Finding 4] Cross-industry investment in {topic} reached record levels last year.",
        ],
        "metadata": {
            "source_count": 4,
            "search_depth": "comprehensive",
            "topic": topic,
        },
    }


def analysis_agent_buggy(state: AnalysisInput) -> dict:
    """BUG: drops 'key_insights' from the output.

    ARGUS detects this as a silent failure because validation_agent's
    input annotation (ValidationInput) requires 'key_insights'.
    """
    topic = state["topic"]
    results = state["research_results"]
    return {
        "analysis": (
            f"Across {len(results)} research findings on '{topic}', the evidence "
            "points to strong adoption momentum."
        ),
        "confidence_score": 0.87,
        # BUG: 'key_insights' is missing
    }


def analysis_agent_fixed(state: AnalysisInput) -> dict:
    """Fixed version — returns all required fields including 'key_insights'."""
    topic = state["topic"]
    results = state["research_results"]
    return {
        "analysis": (
            f"Across {len(results)} research findings on '{topic}', the evidence "
            "points to strong adoption momentum with notable technical challenges "
            "around scalability."
        ),
        "key_insights": [
            f"'{topic}' is entering a rapid-growth phase driven by industry demand.",
            "Scalability and reliability remain the primary technical bottlenecks.",
            "Academic breakthroughs are shortening the research-to-deployment cycle.",
        ],
        "confidence_score": 0.87,
    }


def validation_agent(state: ValidationInput) -> dict:
    issues: list[str] = []
    if state.get("confidence_score", 0.0) < 0.5:
        issues.append("Low confidence score.")
    if not state.get("key_insights"):
        issues.append("No key insights provided.")
    return {"validated": len(issues) == 0, "issues": issues}


def report_agent(state: ReportInput) -> dict:
    topic = state["topic"]
    analysis = state.get("analysis", "(no analysis)")
    insights = state.get("key_insights") or []
    validated = state.get("validated", False)

    insights_block = (
        "\n".join(f"  • {i}" for i in insights)
        if insights
        else "  (none — analysis agent did not produce insights)"
    )
    report = (
        f"{'═' * 50}\n"
        f"  REPORT: {topic.upper()}  |  {'VALIDATED' if validated else 'NOT VALIDATED'}\n"
        f"{'═' * 50}\n\n"
        f"ANALYSIS\n{analysis}\n\n"
        f"KEY INSIGHTS\n{insights_block}\n"
    )
    return {"final_report": report}

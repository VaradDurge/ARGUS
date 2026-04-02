from __future__ import annotations

from langgraph.graph import StateGraph

from test_workflow.agents import (
    analysis_agent_buggy,
    analysis_agent_fixed,
    report_agent,
    research_agent,
    validation_agent,
)
from test_workflow.state import PipelineState


def _assemble(analysis_fn) -> StateGraph:
    graph = StateGraph(PipelineState)
    graph.add_node("research_agent", research_agent)
    graph.add_node("analysis_agent", analysis_fn)
    graph.add_node("validation_agent", validation_agent)
    graph.add_node("report_agent", report_agent)
    graph.add_edge("research_agent", "analysis_agent")
    graph.add_edge("analysis_agent", "validation_agent")
    graph.add_edge("validation_agent", "report_agent")
    graph.set_entry_point("research_agent")
    graph.set_finish_point("report_agent")
    return graph


def build_graph() -> StateGraph:
    """Buggy pipeline — analysis_agent drops 'key_insights'."""
    return _assemble(analysis_agent_fixed)


def build_graph_fixed() -> StateGraph:
    """Fixed pipeline — used as the app_factory for argus replay."""
    return _assemble(analysis_agent_fixed)

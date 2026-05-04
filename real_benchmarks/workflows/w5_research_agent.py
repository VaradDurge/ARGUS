"""
Workflow 5: Research Synthesis Agent
=====================================
Multi-agent pipeline that researches a topic and produces a synthesized report.

  query_planner → web_searcher → content_extractor → synthesizer → fact_checker

Failure injected: web_searcher returns error key + drops search_results.
  → content_extractor gets no pages to extract from (silent failure propagates)
  → synthesizer produces an empty/garbage report

Silent failure — no crash. Pipeline completes. Naive sees SUCCESS.
ARGUS flags the web_searcher output as a critical tool failure.
"""
from __future__ import annotations

import time
from typing import TypedDict

from langgraph.graph import StateGraph

NAME = "Research Synthesis Agent"
FAULT_TYPE = "silent_failure"
TRUE_FAULT_NODE = "web_searcher"
DESCRIPTION = "web_searcher returns error key + drops search_results — pipeline silently degrades"


# ── State ─────────────────────────────────────────────────────────────────────

class ResearchState(TypedDict):
    topic: str
    # query_planner
    search_queries: list[str]
    plan_metadata: dict
    # web_searcher
    search_results: list[dict]       # REQUIRED
    search_metadata: dict
    # content_extractor
    extracted_content: list[str]
    extraction_metadata: dict
    # synthesizer
    synthesis: str
    key_findings: list[str]
    # fact_checker
    fact_check_score: float
    flagged_claims: list[str]
    report_ready: bool


class QueryPlannerInput(TypedDict):
    topic: str


class WebSearcherInput(TypedDict):
    topic: str
    search_queries: list[str]


class ContentExtractorInput(TypedDict):
    topic: str
    search_queries: list[str]
    search_results: list[dict]       # REQUIRED


class SynthesizerInput(TypedDict):
    topic: str
    extracted_content: list[str]
    search_results: list[dict]


class FactCheckerInput(TypedDict):
    topic: str
    synthesis: str
    key_findings: list[str]
    extracted_content: list[str]


# ── Nodes ─────────────────────────────────────────────────────────────────────

def query_planner(state: QueryPlannerInput) -> dict:
    """Plans search queries for the research topic."""
    time.sleep(0.07)
    topic = state["topic"]
    queries = [
        f"{topic} overview",
        f"{topic} recent developments 2024",
        f"{topic} technical details",
    ]
    return {
        "search_queries": queries,
        "plan_metadata": {"topic": topic, "query_count": len(queries)},
    }


def web_searcher(state: WebSearcherInput) -> dict:
    """Healthy: fetches search results for all planned queries."""
    time.sleep(0.20)
    queries = state["search_queries"]
    results = []
    for i, q in enumerate(queries):
        results.append({
            "query": q,
            "url": f"https://example.com/article-{i+1}",
            "title": f"Article about {q[:40]}",
            "snippet": f"This article discusses {q} in detail, covering key aspects...",
            "relevance_score": 0.9 - i * 0.1,
        })
    return {
        "search_results": results,
        "search_metadata": {
            "queries_run": len(queries),
            "results_found": len(results),
            "latency_ms": 195,
        },
    }


def web_searcher_buggy(state: WebSearcherInput) -> dict:
    """BUGGY: search API is rate-limited / unavailable.

    Real scenario: third-party search API (Serper, Bing, etc.) returns
    a non-2xx response. The agent catches it, logs to metadata, returns
    without raising. No exception.

    ARGUS detects: critical tool failure (error key)
    Naive: no exception → reports searcher as "success"
    Downstream: content_extractor gets no pages, synthesizer produces empty report.
    """
    time.sleep(0.30)
    return {
        "error": "search_api_503: service unavailable, retry after 60s",
        "search_metadata": {
            "queries_run": 0,
            "results_found": 0,
            "latency_ms": 300,
            "http_status": 503,
        },
        # 'search_results' is ABSENT
    }


def content_extractor(state: ContentExtractorInput) -> dict:
    """Extracts and cleans content from search result pages."""
    time.sleep(0.16)
    results = state.get("search_results") or []
    extracted = []
    for r in results:
        q = r["query"][:30]
        content = (
            f"Full content from '{r['title']}': {r['snippet']} "
            f"[expanded with details about {q}]"
        )
        extracted.append(content)
    return {
        "extracted_content": extracted,
        "extraction_metadata": {
            "pages_processed": len(results),
            "pages_extracted": len(extracted),
        },
    }


def synthesizer(state: SynthesizerInput) -> dict:
    """Synthesizes extracted content into a structured research report."""
    time.sleep(0.25)
    content = state.get("extracted_content") or []
    topic = state["topic"]
    if not content:
        # No exception — just returns empty/degraded output (silently bad)
        return {
            "synthesis": f"Research on '{topic}': No sources available.",
            "key_findings": [],
        }
    findings = [f"Finding {i+1}: {c[:60]}..." for i, c in enumerate(content[:3])]
    synthesis = f"Research synthesis for '{topic}':\n\n" + "\n".join(f"• {f}" for f in findings)
    return {"synthesis": synthesis, "key_findings": findings}


def fact_checker(state: FactCheckerInput) -> dict:
    """Cross-checks key findings for factual consistency."""
    time.sleep(0.10)
    findings = state.get("key_findings") or []
    score = 0.85 if findings else 0.0   # 0.0 when no findings — silently bad
    flagged: list[str] = []
    if not findings:
        flagged.append("No findings to verify — research pipeline may have failed upstream")
    return {
        "fact_check_score": score,
        "flagged_claims": flagged,
        "report_ready": score >= 0.7 and bool(findings),
    }


# ── Graph builders ─────────────────────────────────────────────────────────────

def _assemble(searcher_fn) -> StateGraph:
    g = StateGraph(ResearchState)
    g.add_node("query_planner",      query_planner)
    g.add_node("web_searcher",       searcher_fn)
    g.add_node("content_extractor",  content_extractor)
    g.add_node("synthesizer",        synthesizer)
    g.add_node("fact_checker",       fact_checker)
    g.add_edge("query_planner",     "web_searcher")
    g.add_edge("web_searcher",      "content_extractor")
    g.add_edge("content_extractor", "synthesizer")
    g.add_edge("synthesizer",       "fact_checker")
    g.set_entry_point("query_planner")
    g.set_finish_point("fact_checker")
    return g


def build_clean() -> StateGraph:
    return _assemble(web_searcher)


def build_failure() -> StateGraph:
    return _assemble(web_searcher_buggy)


def initial_state() -> dict:
    return {"topic": "LangGraph multi-agent observability patterns"}

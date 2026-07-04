"""Realistic LangGraph pipeline that exercises common failure patterns.

This is a content research & review pipeline:
  fetch_sources → extract_content → summarize → review → publish

Each node simulates a real-world failure mode that an observability
tool should catch. The pipeline is built WITHOUT any awareness of ARGUS —
it's a standalone LangGraph graph that happens to contain bugs.
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from langgraph.graph import END, StateGraph  # noqa: I001

# ── State schema ────────────────────────────────────────────────────────────

class ResearchState(TypedDict, total=False):
    query: str
    sources: list[dict[str, Any]]
    raw_content: str
    summary: str
    review: dict[str, Any]
    publish_result: dict[str, Any]
    api_key: str          # sensitive — should never be persisted to disk
    auth_token: str       # sensitive
    messages: Annotated[list[str], operator.add]  # accumulates across nodes


# ── Node functions ──────────────────────────────────────────────────────────

def fetch_sources(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
    """Simulates an API search that returns structured results.

    Bug: returns {"success": false} — a boolean failure indicator
    that many tools miss because they only look for "error" keys.
    """
    _ = kwargs  # accept config forwarded by LangGraph 0.2+
    return {
        "sources": [],
        "success": False,         # ← boolean failure indicator
        "messages": ["fetch_sources: API returned 0 results"],
    }


def fetch_sources_clean(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
    """Clean version — returns real data."""
    return {
        "sources": [
            {"url": "https://example.com/paper1", "title": "Research on AI Agents"},
            {"url": "https://example.com/paper2", "title": "LLM Pipeline Monitoring"},
        ],
        "messages": ["fetch_sources: found 2 sources"],
    }


def extract_content(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
    """Simulates content extraction from sources.

    Bug: when sources are empty (upstream failure), it silently returns
    empty content instead of raising or flagging the problem.
    """
    sources = state.get("sources", [])
    if not sources:
        # Silent failure: returns empty string instead of erroring
        return {
            "raw_content": "",
            "messages": ["extract_content: no sources to extract from"],
        }

    # Normal path
    content = "\n\n".join(
        f"# {s['title']}\n\nThis paper discusses advancements in the field. "
        f"Key findings include improved monitoring & observability for AI pipelines. "
        f"The authors note that \"silent failures are the most dangerous class of bugs\" "
        f"in production agent systems."
        for s in sources
    )
    return {
        "raw_content": content,
        "messages": ["extract_content: extracted content from sources"],
    }


def summarize(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
    """Simulates an LLM summarization call.

    Bug: returns a refusal phrase ("I cannot") embedded in the summary,
    simulating an LLM that refused the task but the node still "succeeded".
    """
    raw = state.get("raw_content", "")
    if not raw:
        return {
            "summary": "N/A",   # ← null-like semantic value
            "messages": ["summarize: nothing to summarize"],
        }

    return {
        "summary": (
            "I cannot provide a summary of this content as it may contain "
            "copyrighted material. Please refer to the original sources."
        ),
        "messages": ["summarize: generated summary"],
    }


def summarize_clean(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
    """Clean version — returns a real summary."""
    return {
        "summary": (
            "Recent research highlights the critical need for observability in AI agent "
            "pipelines. Silent failures — where nodes return degraded output without "
            "raising exceptions — are identified as the most dangerous class of bugs in "
            "production systems. The papers propose structural inspection and semantic "
            "validation as complementary detection strategies."
        ),
        "messages": ["summarize: generated summary"],
    }


def review(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
    """Simulates a quality review step.

    Bug: returns {"failed": true} as a review verdict, plus an error
    message nested inside the review dict.
    """
    summary = state.get("summary", "")
    if not summary or summary in ("N/A", "n/a", ""):
        return {
            "review": {
                "failed": True,
                "error": "No summary to review",
                "score": 0,
            },
            "messages": ["review: failed — no summary provided"],
        }

    return {
        "review": {
            "failed": True,
            "error": "Summary contains refusal language",
            "score": 0.1,
        },
        "messages": ["review: flagged issues in summary"],
    }


def review_clean(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
    """Clean version — passes review."""
    return {
        "review": {
            "failed": False,
            "score": 0.92,
            "feedback": "Comprehensive summary with good coverage.",
        },
        "messages": ["review: approved"],
    }


def publish(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
    """Simulates publishing the final output.

    Bug: returns HTTP 503 in a status_code field, simulating a
    downstream service outage.
    """
    review_data = state.get("review", {})
    if review_data.get("failed"):
        return {
            "publish_result": {
                "ok": False,
                "reason": "Review did not pass",
            },
            "messages": ["publish: skipped — review failed"],
        }

    return {
        "publish_result": {
            "status_code": 503,
            "error_message": "Service temporarily unavailable",
        },
        "messages": ["publish: service outage"],
    }


def publish_clean(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
    """Clean version — publishes successfully."""
    return {
        "publish_result": {
            "ok": True,
            "url": "https://example.com/published/article-123",
        },
        "messages": ["publish: published successfully"],
    }


# ── Graph builders ──────────────────────────────────────────────────────────

def build_failing_pipeline() -> StateGraph:
    """Pipeline where every node has a realistic bug.

    - fetch_sources: returns success=False with empty sources
    - extract_content: silently returns empty content
    - summarize: returns an LLM refusal phrase
    - review: returns failed=True with nested error
    - publish: returns status_code=503
    """
    graph = StateGraph(ResearchState)
    graph.add_node("fetch_sources", fetch_sources)
    graph.add_node("extract_content", extract_content)
    graph.add_node("summarize", summarize)
    graph.add_node("review", review)
    graph.add_node("publish", publish)
    graph.set_entry_point("fetch_sources")
    graph.add_edge("fetch_sources", "extract_content")
    graph.add_edge("extract_content", "summarize")
    graph.add_edge("summarize", "review")
    graph.add_edge("review", "publish")
    graph.add_edge("publish", END)
    return graph


def build_clean_pipeline() -> StateGraph:
    """Pipeline where everything works — should produce zero failures.

    Used to verify there are no false positives. State contains:
    - Prose with quotes and ampersands (was triggering MP-006 / CM-005)
    - YAML-frontmatter-like strings
    - Markdown content
    """
    graph = StateGraph(ResearchState)
    graph.add_node("fetch_sources", fetch_sources_clean)
    graph.add_node("extract_content", extract_content)
    graph.add_node("summarize", summarize_clean)
    graph.add_node("review", review_clean)
    graph.add_node("publish", publish_clean)
    graph.set_entry_point("fetch_sources")
    graph.add_edge("fetch_sources", "extract_content")
    graph.add_edge("extract_content", "summarize")
    graph.add_edge("summarize", "review")
    graph.add_edge("review", "publish")
    graph.add_edge("publish", END)
    return graph


def build_sensitive_data_pipeline() -> StateGraph:
    """Pipeline that passes sensitive data through state.

    Used to verify that redaction and persist_state options work.
    """
    def inject_creds(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
        return {
            "api_key": "fake-key-FOR-TESTING-ONLY-12345",  # noqa: S105
            "auth_token": "Bearer fake.token.FOR-TESTING-ONLY",  # noqa: S105
            "messages": ["inject_creds: loaded credentials"],
        }

    def use_creds(state: ResearchState, **kwargs: Any) -> dict[str, Any]:
        # Simulates a node that uses credentials to call an API
        return {
            "raw_content": "Fetched securely using provided credentials.",
            "messages": ["use_creds: API call succeeded"],
        }

    graph = StateGraph(ResearchState)
    graph.add_node("inject_creds", inject_creds)
    graph.add_node("use_creds", use_creds)
    graph.set_entry_point("inject_creds")
    graph.add_edge("inject_creds", "use_creds")
    graph.add_edge("use_creds", END)
    return graph


# ── Standalone runner (no ARGUS) ────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("FAILING PIPELINE")
    print("=" * 60)
    graph = build_failing_pipeline()
    app = graph.compile()
    result = app.invoke({"query": "AI agent observability"})
    for msg in result.get("messages", []):
        print(f"  {msg}")
    print(f"\n  Final publish_result: {result.get('publish_result')}")

    print("\n" + "=" * 60)
    print("CLEAN PIPELINE")
    print("=" * 60)
    graph = build_clean_pipeline()
    app = graph.compile()
    result = app.invoke({"query": "AI agent observability"})
    for msg in result.get("messages", []):
        print(f"  {msg}")
    print(f"\n  Final publish_result: {result.get('publish_result')}")

    print("\n" + "=" * 60)
    print("SENSITIVE DATA PIPELINE")
    print("=" * 60)
    graph = build_sensitive_data_pipeline()
    app = graph.compile()
    result = app.invoke({"query": "test"})
    for msg in result.get("messages", []):
        print(f"  {msg}")
    print(f"  api_key in state: {'api_key' in result}")
    print(f"  auth_token in state: {'auth_token' in result}")

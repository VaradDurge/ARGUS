"""
Workflow 1: Customer Support Ticket Triage
==========================================
Based on the existing real_world_demo pipeline.

  ticket_parser → intent_classifier → knowledge_retriever → response_drafter → quality_reviewer

Failure injected: knowledge_retriever returns top-level error key + drops kb_articles.

Real scenario: vector store / knowledge base is unavailable. The agent
catches the connection error and returns a partial result with an error key.
No exception is raised — pipeline continues running silently degraded.

  - ARGUS detects: critical tool failure (error key at top level)
  - Naive monitor: no exception raised → reports retriever as "success"
"""
from __future__ import annotations

import time

from langgraph.graph import StateGraph
from real_world_demo.agents import (
    intent_classifier,
    quality_reviewer,
    response_drafter,
    ticket_parser,
)
from real_world_demo.state import (
    KnowledgeRetrieverInput,
    SupportPipelineState,
)

NAME = "Customer Support Triage"
FAULT_TYPE = "silent_failure"
TRUE_FAULT_NODE = "knowledge_retriever"
DESCRIPTION = "retriever returns error key + drops kb_articles — response_drafter gets no context"


def knowledge_retriever_healthy(state: KnowledgeRetrieverInput) -> dict:
    """Healthy retriever — fetches KB articles for the intent."""
    time.sleep(0.12)
    intent = state["intent"]
    kb = {
        "billing":   ["Refunds are processed within 5–7 business days.",
                      "For invoice disputes, email billing@company.com."],
        "technical": ["Clear cache and cookies, then restart the app.",
                      "For API errors, verify your key has the required scopes."],
        "refund":    ["Refund eligibility: within 30 days of purchase.",
                      "Submit a refund request at company.com/refund."],
        "general":   ["Support hours are Mon–Fri, 9 AM–6 PM EST."],
    }
    articles = kb.get(intent, kb["general"])
    return {
        "kb_articles": articles,
        "kb_metadata": {
            "query": f"intent:{intent}",
            "articles_found": len(articles),
            "latency_ms": 118,
        },
    }


def knowledge_retriever_buggy(state: KnowledgeRetrieverInput) -> dict:
    """BUGGY: knowledge base is unavailable — returns top-level error key, drops kb_articles.

    Real scenario: the KB vector store times out after 3 retries. The agent
    catches the TimeoutError, records it in the output dict, and returns
    without raising. Pipeline continues but response_drafter has no context.

    ARGUS detects: critical tool failure ('error' key at top level)
    Naive (LangSmith/Langfuse): no exception → marks node as successful ✗
    """
    time.sleep(0.50)   # simulate timeout before giving up
    return {
        "error": "kb_vector_store_unavailable: connection timeout after 3 retries",
        "kb_metadata": {
            "query": f"intent:{state['intent']}",
            "articles_found": 0,
            "latency_ms": 5000,
            "retry_count": 3,
        },
        # 'kb_articles' is ABSENT from this output
    }


def _assemble(retriever_fn) -> StateGraph:
    g = StateGraph(SupportPipelineState)
    g.add_node("ticket_parser",       ticket_parser)
    g.add_node("intent_classifier",   intent_classifier)
    g.add_node("knowledge_retriever", retriever_fn)
    g.add_node("response_drafter",    response_drafter)
    g.add_node("quality_reviewer",    quality_reviewer)
    g.add_edge("ticket_parser",       "intent_classifier")
    g.add_edge("intent_classifier",   "knowledge_retriever")
    g.add_edge("knowledge_retriever", "response_drafter")
    g.add_edge("response_drafter",    "quality_reviewer")
    g.set_entry_point("ticket_parser")
    g.set_finish_point("quality_reviewer")
    return g


def build_clean() -> StateGraph:
    return _assemble(knowledge_retriever_healthy)


def build_failure() -> StateGraph:
    return _assemble(knowledge_retriever_buggy)


def initial_state() -> dict:
    return {
        "raw_ticket": (
            "Hi, I was charged twice for my Pro Plan this month — "
            "invoice #INV-2024-8821 and #INV-2024-8843 both show $299. "
            "Please refund one of these charges ASAP."
        )
    }

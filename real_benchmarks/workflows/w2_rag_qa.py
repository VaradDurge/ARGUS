"""
Workflow 2: RAG Document Q&A Pipeline
======================================
Realistic retrieval-augmented generation pipeline.

  query_rewriter → retriever → answer_generator → citation_checker

Failure injected: retriever returns error key + drops retrieved_chunks.
  - ARGUS detects via: critical tool failure (error key) + missing required field
  - Naive monitor: no exception raised → reports CLEAN
"""
from __future__ import annotations

import time
from typing import TypedDict

from langgraph.graph import StateGraph

NAME = "RAG Q&A Pipeline"
FAULT_TYPE = "silent_failure"
TRUE_FAULT_NODE = "retriever"
DESCRIPTION = "retriever drops retrieved_chunks — answer_generator gets no context"


# ── State ─────────────────────────────────────────────────────────────────────

class RAGState(TypedDict):
    question: str
    # query_rewriter
    rewritten_query: str
    # retriever
    retrieved_chunks: list[str]       # REQUIRED — ARGUS flags if missing
    retrieval_metadata: dict
    # answer_generator
    answer: str
    source_count: int
    # citation_checker
    is_grounded: bool
    grounding_score: float


class QueryRewriterInput(TypedDict):
    question: str


class RetrieverInput(TypedDict):
    question: str
    rewritten_query: str


class AnswerGeneratorInput(TypedDict):
    question: str
    rewritten_query: str
    retrieved_chunks: list[str]   # REQUIRED
    retrieval_metadata: dict


class CitationCheckerInput(TypedDict):
    question: str
    answer: str
    retrieved_chunks: list[str]
    source_count: int


# ── Nodes ─────────────────────────────────────────────────────────────────────

def query_rewriter(state: QueryRewriterInput) -> dict:
    """Rewrites user question into an optimal retrieval query."""
    time.sleep(0.06)
    q = state["question"]
    rewritten = f"detailed explanation of: {q.lower().rstrip('?')}"
    return {"rewritten_query": rewritten}


def retriever(state: RetrieverInput) -> dict:
    """Healthy: fetches relevant document chunks from vector store."""
    time.sleep(0.15)
    query = state["rewritten_query"]
    chunks = [
        f"Chunk 1: Documentation excerpt relevant to '{query[:30]}...'",
        f"Chunk 2: Related API reference for '{query[:20]}...'",
        f"Chunk 3: Example usage demonstrating '{query[:25]}...'",
    ]
    return {
        "retrieved_chunks": chunks,
        "retrieval_metadata": {"query": query, "chunks_found": len(chunks), "latency_ms": 148},
    }


def retriever_buggy(state: RetrieverInput) -> dict:
    """BUGGY: vector DB unavailable — returns error key, drops retrieved_chunks.

    Real scenario: vector store times out, agent swallows the error
    internally and returns partial state. No exception raised.
    Pipeline continues running — but with no context for the answer generator.

    ARGUS detects:
      1. Critical tool failure: 'error' key with truthy value
      2. Missing required field: 'retrieved_chunks' absent from output
         (AnswerGeneratorInput requires it — not Optional)
    """
    time.sleep(0.45)   # slow timeout before giving up
    return {
        # triggers critical tool failure detection
        "error": "vector_db_connection_timeout",
        "retrieval_metadata": {
            "query": state["rewritten_query"],
            "chunks_found": 0,
            "latency_ms": 5000,
            "fallback": "cache_miss",
        },
        # 'retrieved_chunks' is completely absent
    }


def answer_generator(state: AnswerGeneratorInput) -> dict:
    """Generates grounded answer using retrieved context."""
    time.sleep(0.22)
    chunks = state.get("retrieved_chunks") or []
    question = state["question"]
    context = " ".join(chunks[:2]) if chunks else "No context available."
    answer = (
        f"Based on the retrieved documentation: {context[:100]}. "
        f"This answers your question about {question[:40]}."
    )
    return {"answer": answer, "source_count": len(chunks)}


def citation_checker(state: CitationCheckerInput) -> dict:
    """Verifies that the answer is grounded in retrieved sources."""
    time.sleep(0.08)
    answer = state.get("answer", "")
    chunks = state.get("retrieved_chunks") or []
    grounding_score = 0.0
    if chunks and any(c[:20] in answer for c in chunks):
        grounding_score = 0.85
    elif chunks:
        grounding_score = 0.55
    return {"is_grounded": grounding_score >= 0.5, "grounding_score": grounding_score}


# ── Graph builders ─────────────────────────────────────────────────────────────

def _assemble(retriever_fn) -> StateGraph:
    g = StateGraph(RAGState)
    g.add_node("query_rewriter",    query_rewriter)
    g.add_node("retriever",         retriever_fn)
    g.add_node("answer_generator",  answer_generator)
    g.add_node("citation_checker",  citation_checker)
    g.add_edge("query_rewriter",   "retriever")
    g.add_edge("retriever",        "answer_generator")
    g.add_edge("answer_generator", "citation_checker")
    g.set_entry_point("query_rewriter")
    g.set_finish_point("citation_checker")
    return g


def build_clean() -> StateGraph:
    return _assemble(retriever)


def build_failure() -> StateGraph:
    return _assemble(retriever_buggy)


def initial_state() -> dict:
    return {"question": "How do I configure webhook retries for failed deliveries?"}

"""
Clean run cases — 15 total.

All nodes execute successfully, return valid output, no validators fail.
Both ARGUS and naive should report CLEAN.

Used to measure false positive rate: ARGUS should flag 0 of these.
"""
from __future__ import annotations

from typing import Any

from benchmarks.cases.base import BenchmarkCase


def make_cases() -> list[BenchmarkCase]:
    cases: list[BenchmarkCase] = []

    # ── 2-node pipelines ──────────────────────────────────────────────────────

    def fetch_docs(state: dict[str, Any]) -> dict[str, Any]:
        return {"documents": ["doc1", "doc2", "doc3"], "count": 3}

    def summarize(state: dict[str, Any]) -> dict[str, Any]:
        docs = state.get("documents", [])
        return {"summary": f"Found {len(docs)} documents.", "doc_count": len(docs)}

    cases.append(BenchmarkCase(
        id="CL-01", fault_type="clean", true_fault_node=None,
        description="fetch documents → summarize (all pass)",
        nodes=["fetch", "summarize"], edges={"fetch": ["summarize"]},
        node_fns={"fetch": fetch_docs, "summarize": summarize},
        initial_state={"query": "AI agents"},
    ))

    def search(state: dict[str, Any]) -> dict[str, Any]:
        return {"results": [{"id": 1, "score": 0.95}, {"id": 2, "score": 0.87}]}

    def rank(state: dict[str, Any]) -> dict[str, Any]:
        results = state.get("results", [])
        return {"top_result": results[0] if results else None, "total": len(results)}

    cases.append(BenchmarkCase(
        id="CL-02", fault_type="clean", true_fault_node=None,
        description="search → rank results (all pass)",
        nodes=["search", "rank"], edges={"search": ["rank"]},
        node_fns={"search": search, "rank": rank},
        initial_state={"query": "benchmark"},
    ))

    # ── 3-node pipelines ──────────────────────────────────────────────────────

    def fetch_clean(state: dict[str, Any]) -> dict[str, Any]:
        return {"data": "raw content from api", "status_code": 200}

    def validate_clean(state: dict[str, Any]) -> dict[str, Any]:
        return {"validated": True, "data": state.get("data", "")}

    def process_clean(state: dict[str, Any]) -> dict[str, Any]:
        return {"result": state.get("data", "").upper(), "success": True}

    for cid in ["CL-03", "CL-04", "CL-05"]:
        cases.append(BenchmarkCase(
            id=cid, fault_type="clean", true_fault_node=None,
            description="fetch → validate → process (all pass, 200 OK)",
            nodes=["fetch", "validate", "process"],
            edges={"fetch": ["validate"], "validate": ["process"]},
            node_fns={"fetch": fetch_clean, "validate": validate_clean, "process": process_clean},
            initial_state={"query": "test"},
        ))

    def classify_clean(state: dict[str, Any]) -> dict[str, Any]:
        return {"label": "yes", "confidence": 0.92}

    def respond_clean(state: dict[str, Any]) -> dict[str, Any]:
        return {"response": f"Label: {state.get('label')}", "done": True}

    for cid in ["CL-06", "CL-07"]:
        cases.append(BenchmarkCase(
            id=cid, fault_type="clean", true_fault_node=None,
            description="fetch → classify → respond with valid label",
            nodes=["fetch", "classify", "respond"],
            edges={"fetch": ["classify"], "classify": ["respond"]},
            node_fns={
                "fetch": lambda s: {"text": "classify this"},
                "classify": classify_clean,
                "respond": respond_clean,
            },
            initial_state={"input": "test"},
            validators={"classify": lambda o: (o.get("label") in ["yes", "no"], "invalid label")},
        ))

    def embed(state: dict[str, Any]) -> dict[str, Any]:
        return {"embedding": [0.1, 0.2, 0.3], "model": "text-embedding-v1"}

    def store(state: dict[str, Any]) -> dict[str, Any]:
        emb = state.get("embedding", [])
        return {"stored": True, "dims": len(emb)}

    cases.append(BenchmarkCase(
        id="CL-08", fault_type="clean", true_fault_node=None,
        description="embed → store (numeric output, all pass)",
        nodes=["embed", "store"], edges={"embed": ["store"]},
        node_fns={"embed": embed, "store": store},
        initial_state={"text": "hello world"},
    ))

    def research(state: dict[str, Any]) -> dict[str, Any]:
        return {"findings": ["finding A", "finding B"], "sources": 3}

    def analyse(state: dict[str, Any]) -> dict[str, Any]:
        return {"analysis": "Research looks solid.", "confidence": 0.88}

    def publish(state: dict[str, Any]) -> dict[str, Any]:
        return {"article": state.get("analysis", ""), "published": True}

    cases.append(BenchmarkCase(
        id="CL-09", fault_type="clean", true_fault_node=None,
        description="research → analyse → publish (3 nodes, all pass)",
        nodes=["research", "analyse", "publish"],
        edges={"research": ["analyse"], "analyse": ["publish"]},
        node_fns={"research": research, "analyse": analyse, "publish": publish},
        initial_state={"topic": "AI safety"},
        validators={
            "analyse": lambda o: (
                0.0 <= o.get("confidence", -1) <= 1.0,
                "confidence out of range",
            ),
        },
    ))

    def ingest(state: dict[str, Any]) -> dict[str, Any]:
        return {"records": [1, 2, 3, 4, 5], "source": "db"}

    def transform(state: dict[str, Any]) -> dict[str, Any]:
        return {"transformed": [r * 2 for r in state.get("records", [])]}

    def load_out(state: dict[str, Any]) -> dict[str, Any]:
        return {"loaded": len(state.get("transformed", [])), "status": "ok"}

    cases.append(BenchmarkCase(
        id="CL-10", fault_type="clean", true_fault_node=None,
        description="ingest → transform → load (ETL pipeline, all pass)",
        nodes=["ingest", "transform", "load"],
        edges={"ingest": ["transform"], "transform": ["load"]},
        node_fns={"ingest": ingest, "transform": transform, "load": load_out},
        initial_state={"source": "warehouse"},
    ))

    def parse(state: dict[str, Any]) -> dict[str, Any]:
        return {"tokens": state.get("text", "").split(), "char_count": len(state.get("text", ""))}

    def score_clean(state: dict[str, Any]) -> dict[str, Any]:
        tokens = state.get("tokens", [])
        return {"score": min(len(tokens) / 10.0, 1.0), "token_count": len(tokens)}

    cases.append(BenchmarkCase(
        id="CL-11", fault_type="clean", true_fault_node=None,
        description="parse → score (NLP pipeline, all pass)",
        nodes=["parse", "score"],
        edges={"parse": ["score"]},
        node_fns={"parse": parse, "score": score_clean},
        initial_state={"text": "the quick brown fox jumps over the lazy dog"},
        validators={"score": lambda o: (0.0 <= o.get("score", -1) <= 1.0, "score out of range")},
    ))

    def detect(state: dict[str, Any]) -> dict[str, Any]:
        return {"entities": [{"text": "Anthropic", "type": "ORG"}], "entity_count": 1}

    def enrich(state: dict[str, Any]) -> dict[str, Any]:
        entities = state.get("entities", [])
        return {"enriched": [e["text"] for e in entities], "done": True}

    cases.append(BenchmarkCase(
        id="CL-12", fault_type="clean", true_fault_node=None,
        description="detect entities → enrich (NER pipeline, all pass)",
        nodes=["detect", "enrich"],
        edges={"detect": ["enrich"]},
        node_fns={"detect": detect, "enrich": enrich},
        initial_state={"text": "Anthropic builds AI systems."},
    ))

    def plan(state: dict[str, Any]) -> dict[str, Any]:
        return {"steps": ["step1", "step2", "step3"], "estimated_cost": 0.05}

    def execute(state: dict[str, Any]) -> dict[str, Any]:
        return {"executed_steps": state.get("steps", []), "success": True, "cost": 0.04}

    def verify(state: dict[str, Any]) -> dict[str, Any]:
        return {"verified": True, "match": state.get("success", False)}

    cases.append(BenchmarkCase(
        id="CL-13", fault_type="clean", true_fault_node=None,
        description="plan → execute → verify (agentic pipeline, all pass)",
        nodes=["plan", "execute", "verify"],
        edges={"plan": ["execute"], "execute": ["verify"]},
        node_fns={"plan": plan, "execute": execute, "verify": verify},
        initial_state={"goal": "summarize document"},
    ))

    def retrieve(state: dict[str, Any]) -> dict[str, Any]:
        return {"chunks": ["chunk A relevant", "chunk B relevant"], "retrieved": 2}

    def generate(state: dict[str, Any]) -> dict[str, Any]:
        chunks = state.get("chunks", [])
        return {
            "answer": f"Based on {len(chunks)} sources: answer here.",
            "citations": len(chunks),
        }

    cases.append(BenchmarkCase(
        id="CL-14", fault_type="clean", true_fault_node=None,
        description="retrieve → generate (RAG pipeline, all pass)",
        nodes=["retrieve", "generate"],
        edges={"retrieve": ["generate"]},
        node_fns={"retrieve": retrieve, "generate": generate},
        initial_state={"question": "What is ARGUS?"},
        validators={"generate": lambda o: (len(o.get("answer", "")) > 10, "answer too short")},
    ))

    def route(state: dict[str, Any]) -> dict[str, Any]:
        return {"destination": "handler_a", "payload": state.get("input", {})}

    def handle(state: dict[str, Any]) -> dict[str, Any]:
        return {"handled": True, "destination": state.get("destination")}

    cases.append(BenchmarkCase(
        id="CL-15", fault_type="clean", true_fault_node=None,
        description="route → handle (router pipeline, all pass)",
        nodes=["route", "handle"],
        edges={"route": ["handle"]},
        node_fns={"route": route, "handle": handle},
        initial_state={"input": {"type": "query", "text": "hello"}},
        validators={
            "route": lambda o: (
                o.get("destination") is not None,
                "destination must be set",
            ),
        },
    ))

    assert len(cases) == 15, f"Expected 15 clean cases, got {len(cases)}"
    return cases

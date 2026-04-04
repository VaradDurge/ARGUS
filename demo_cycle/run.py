"""ARGUS cycle/retry demo.

Graph topology:
    fetch_data → validate → [route] → process  (when valid)
                               ↓
                          fetch_data            (when invalid — back-edge = cycle)

validate fails on the first 2 calls (attempt 0, 1) and passes on attempt 2.
This demonstrates:
  - attempt_index incrementing across cycle iterations
  - is_cyclic=True in the saved run record
  - watcher.finalize() required for cyclic graphs

Usage:
    python -m demo_cycle.run
"""
from __future__ import annotations

import subprocess
import sys
from typing import TypedDict

from langgraph.graph import END, StateGraph

from argus import ArgusWatcher

# ── State ─────────────────────────────────────────────────────────────────────

class PipelineState(TypedDict):
    raw_input: str
    fetched_data: str
    validation_attempts: int
    valid: bool
    result: str


# ── Nodes ─────────────────────────────────────────────────────────────────────

def fetch_data(state: PipelineState) -> dict:
    attempts = state.get("validation_attempts", 0)
    return {
        "fetched_data": f"data-batch-{attempts}",
        "validation_attempts": attempts,
    }


def validate(state: PipelineState) -> dict:
    attempts = state.get("validation_attempts", 0) + 1
    # Simulate quality gate: passes only on the 3rd attempt
    is_valid = attempts >= 3
    print(f"  [validate] attempt {attempts}, valid={is_valid}")
    return {
        "validation_attempts": attempts,
        "valid": is_valid,
    }


def process(state: PipelineState) -> dict:
    return {"result": f"processed: {state['fetched_data']}"}


def route_after_validate(state: PipelineState) -> str:
    return "process" if state.get("valid") else "fetch_data"


# ── Graph builder ──────────────────────────────────────────────────────────────

def build_graph() -> StateGraph:
    g = StateGraph(PipelineState)
    g.add_node("fetch_data", fetch_data)
    g.add_node("validate", validate)
    g.add_node("process", process)

    g.set_entry_point("fetch_data")
    g.add_edge("fetch_data", "validate")
    g.add_conditional_edges("validate", route_after_validate, {
        "fetch_data": "fetch_data",
        "process": "process",
    })
    g.add_edge("process", END)
    return g


# ── Runner ────────────────────────────────────────────────────────────────────

def main() -> None:
    print("\n" + "═" * 60)
    print("  ARGUS — Cycle / Retry Demo")
    print("  fetch_data → validate → [cycle back or proceed]")
    print("  Graph has a back-edge: validate → fetch_data")
    print("═" * 60 + "\n")

    graph = build_graph()

    watcher = ArgusWatcher()
    watcher.watch(graph)

    app = graph.compile()

    try:
        result = app.invoke({"raw_input": "hello", "validation_attempts": 0})
        print(f"\n  Pipeline finished. Result: {result.get('result')}")
    except Exception as exc:
        print(f"\n  Pipeline raised: {type(exc).__name__}: {exc}")

    # REQUIRED for cyclic graphs — auto-finalize is disabled because there is
    # no reliable "last node" signal when back-edges are present.
    watcher.finalize()

    print()
    sys.stdout.flush()
    subprocess.run(["argus", "show", "last"])

    print("\n  Run `argus list` to see all saved runs.\n")


if __name__ == "__main__":
    main()

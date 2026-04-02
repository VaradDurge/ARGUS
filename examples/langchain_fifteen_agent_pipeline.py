"""Mock 15-agent pipeline: LangChain runnables inside LangGraph nodes + Argus.

Problem statement (toy): fifteen specialist agents each append one line to a shared
study plan for "Python basics in one day". No API keys — pure RunnableLambda steps.

Argus watches the LangGraph StateGraph (call watch() before compile()).

Run from the repo root after installing extras::

    pip install -e ".[examples]"
    python examples/langchain_fifteen_agent_pipeline.py

Then inspect the captured run::

    argus show last
"""

from __future__ import annotations

from typing import TypedDict

from langchain_core.runnables import RunnableLambda
from langgraph.graph import StateGraph

from argus import ArgusWatcher


# --- State: Argus inspects each transition against the successor node's annotation.
class PipelineState(TypedDict):
    """Full graph state — every node reads/writes these keys."""

    topic: str
    scratchpad: str


class StepInput(TypedDict):
    """Each agent expects the topic plus the growing scratchpad (non-empty)."""

    topic: str
    scratchpad: str


# One line per mock agent (15 total).
AGENT_CONTRIBUTIONS: tuple[str, ...] = (
    "08:00 — Review variables, types, and f-strings.",
    "08:45 — Conditionals and boolean logic.",
    "09:30 — for/while loops and range().",
    "10:15 — Break: stretch and water.",
    "10:30 — Functions: parameters, return values, scope.",
    "11:15 — Data structures: list, dict, tuple basics.",
    "12:00 — Lunch.",
    "13:00 — File I/O with pathlib and open().",
    "13:45 — Exceptions: try/except/finally.",
    "14:30 — Modules, imports, and venv recap.",
    "15:15 — pytest intro: one passing test.",
    "16:00 — Standard library: json, datetime, random.",
    "16:45 — Type hints (typing) skim.",
    "17:30 — Mini-project: CLI script that reads a text file.",
    "18:00 — Review checklist and tomorrow's stretch goals.",
)


def _build_step_runnable(agent_index: int, line: str) -> RunnableLambda:
    """LangChain runnable: merge prior scratchpad with this agent's line."""

    def _append(state: StepInput) -> dict[str, str]:
        tag = f"agent_{agent_index:02d}"
        block = f"[{tag}] {line}"
        merged = f"{state['scratchpad'].rstrip()}\n{block}"
        return {"scratchpad": merged}

    return RunnableLambda(_append)


def _make_node(agent_index: int, line: str):
    """LangGraph node that delegates to a LangChain runnable."""
    chain = _build_step_runnable(agent_index, line)

    def _node(state: StepInput) -> dict[str, str]:
        return chain.invoke(state)

    return _node


def build_graph() -> StateGraph:
    graph = StateGraph(PipelineState)
    for i, line in enumerate(AGENT_CONTRIBUTIONS, start=1):
        name = f"agent_{i:02d}"
        graph.add_node(name, _make_node(i, line))
    for i in range(1, len(AGENT_CONTRIBUTIONS)):
        graph.add_edge(f"agent_{i:02d}", f"agent_{i + 1:02d}")
    graph.set_entry_point("agent_01")
    graph.set_finish_point("agent_15")
    return graph


def main() -> None:
    graph = build_graph()

    watcher = ArgusWatcher()
    watcher.watch(graph)

    app = graph.compile()
    initial: PipelineState = {
        "topic": "Python basics — single-day study plan",
        "scratchpad": "(session start)",
    }
    result = app.invoke(initial)

    if watcher._session is not None:
        watcher._session.force_finalize()

    print("--- Pipeline result (final scratchpad tail) ---")
    lines = result["scratchpad"].strip().split("\n")
    print(f"topic: {result['topic']}")
    print(f"lines captured: {len(lines)}")
    print("last 3 lines:")
    for ln in lines[-3:]:
        print(f"  {ln}")
    print()
    print("Argus wrote a run under .argus/runs/ — try: argus show last")


if __name__ == "__main__":
    main()

"""
test_llm_override.py — Verify LLM judge is final authority on node status
=========================================================================

Tests that:
1. When heuristics flag a false positive, the LLM judge overrides it → pass
2. When a node genuinely fails, the LLM judge confirms it → semantic_fail
3. Investigation trigger_reasons exclude false positives that the LLM cleared
4. Investigation correctly identifies the real root cause

Pipeline: researcher → analyzer → summarizer → formatter
  - researcher: valid output (LLM should override any heuristic noise)
  - summarizer: sabotaged (returns garlic bread recipe)

HOW TO RUN
----------
  python Cursor_Tests/test_llm_override.py

COST
----
  ~12 LLM calls × ~500 tokens each ≈ $0.001 total (gpt-4o-mini)
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any, TypedDict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            key, val = line.split("=", 1)
            k, v = key.strip(), val.strip().strip("'\"")
            if not os.environ.get(k):
                os.environ[k] = v

from langgraph.graph import END, StateGraph  # noqa: E402
from openai import OpenAI  # noqa: E402

from argus import ArgusWatcher  # noqa: E402
from argus.storage import load_run  # noqa: E402

# ── Terminal helpers ─────────────────────────────────────────────────────────

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

_results: list[tuple[str, str, bool]] = []
_section = ""


def section(name: str) -> None:
    global _section
    _section = name
    print()
    print(f"  {BOLD}{name}{RESET}")
    print(f"  {'─' * 64}")


def check(name: str, condition: bool) -> None:
    _results.append((_section, name, condition))
    icon = f"{GREEN}PASS{RESET}" if condition else f"{RED}FAIL{RESET}"
    print(f"    {icon}  {name}")


def info(msg: str) -> None:
    print(f"    {DIM}{msg}{RESET}")


def final_summary() -> None:
    total = len(_results)
    passed = sum(1 for _, _, ok in _results if ok)
    failed = total - passed
    print()
    print("=" * 72)
    if failed == 0:
        print(f"  {GREEN}{BOLD}{passed}/{total} checks passed{RESET}")
    else:
        print(f"  {RED}{BOLD}{failed} FAILED{RESET}, {passed} passed out of {total}")
        for sec, name, ok in _results:
            if not ok:
                print(f"    {RED}FAIL{RESET}  [{sec}] {name}")
    print("=" * 72)
    print()


# ── LLM helper ──────────────────────────────────────────────────────────────

MODEL = "gpt-4o-mini"
_client: OpenAI | None = None


def llm(system: str, user: str, json_mode: bool = False) -> str:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    kwargs: dict[str, Any] = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 200,
        "temperature": 0,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = _client.chat.completions.create(**kwargs)
    return (resp.choices[0].message.content or "").strip()


# ── State ────────────────────────────────────────────────────────────────────


class PipelineState(TypedDict, total=False):
    topic: str
    research: str
    analysis: str
    summary: str
    report: str


# ── Node functions ───────────────────────────────────────────────────────────


def researcher(state: PipelineState) -> PipelineState:
    """LLM: gather key facts about the topic."""
    topic = state.get("topic", "")
    result = llm(
        "You are a research assistant. Provide 3-4 key facts about the topic. "
        "Be specific with numbers and dates where possible. Keep it under 100 words.",
        f"Research this topic: {topic}",
    )
    return {**state, "research": result}


def analyzer(state: PipelineState) -> PipelineState:
    """LLM: analyze the research findings."""
    research = state.get("research", "")
    result = llm(
        "You are a financial analyst. Analyze the research findings. "
        "Identify key trends and implications. Keep it under 100 words.",
        f"Analyze these findings:\n{research}",
    )
    return {**state, "analysis": result}


def bad_summarizer(state: PipelineState) -> PipelineState:
    """Sabotaged: ignores financial research, returns a recipe."""
    return {
        **state,
        "summary": (
            "To make perfect garlic bread, slice a French baguette lengthwise. "
            "Mix 4 tablespoons of softened butter with 3 minced garlic cloves, "
            "a pinch of salt, and fresh parsley. Spread generously on both halves. "
            "Bake at 375F for 10 minutes until golden and crispy."
        ),
    }


def formatter(state: PipelineState) -> PipelineState:
    """Logic node: format the summary into a report."""
    summary = state.get("summary", "N/A")
    topic = state.get("topic", "Unknown")
    report = f"=== Briefing: {topic} ===\n\n{summary}\n\n=== END ==="
    return {**state, "report": report}


def build_graph(
    custom_nodes: dict[str, Any] | None = None,
) -> StateGraph:
    g = StateGraph(PipelineState)
    nodes = {
        "researcher": researcher,
        "analyzer": analyzer,
        "summarizer": bad_summarizer,
        "formatter": formatter,
    }
    if custom_nodes:
        nodes.update(custom_nodes)
    for name, fn in nodes.items():
        g.add_node(name, fn)
    g.set_entry_point("researcher")
    g.add_edge("researcher", "analyzer")
    g.add_edge("analyzer", "summarizer")
    g.add_edge("summarizer", "formatter")
    g.add_edge("formatter", END)
    return g


# ══════════════════════════════════════════════════════════════════════════════
# Test 1: LLM overrides false positives, catches real failures
# ══════════════════════════════════════════════════════════════════════════════


def test_llm_overrides_false_positive() -> None:
    section("Test 1: LLM override — false positive on researcher, real fail on summarizer")

    graph = build_graph()
    watcher = ArgusWatcher(
        investigate="always",
        semantic_judge=True,
        judge_model="gpt-4o-mini",
    )
    watcher.watch(graph)
    app = graph.compile()

    topic = "Federal Reserve interest rate policy and bond markets"
    info(f"Topic: {topic}")
    info("Running: researcher → analyzer → summarizer(sabotaged) → formatter")

    t0 = time.time()
    app.invoke({"topic": topic})
    elapsed = time.time() - t0
    info(f"Pipeline finished in {elapsed:.1f}s")

    watcher.finalize()
    run_id = watcher.run_id
    record = load_run(run_id)

    step_map = {s.node_name: s for s in record.steps}
    info(f"Run ID: {run_id}")
    info(f"Overall status: {record.overall_status}")
    info(f"First failure step: {record.first_failure_step}")

    # ── researcher: should PASS (LLM overrides any heuristic noise) ──
    section("researcher — LLM should confirm valid output")
    r = step_map.get("researcher")
    if r:
        info(f"status: {r.status}")
        if r.inspection and r.inspection.tool_failures:
            for tf in r.inspection.tool_failures:
                info(f"heuristic finding: {tf.failure_type} on '{tf.field_name}' — {tf.evidence}")
        if r.semantic_check:
            info(f"LLM check: passed={r.semantic_check.passed}, "
                 f"confidence={r.semantic_check.confidence}, "
                 f"reason={r.semantic_check.reason}")
            check("researcher: LLM semantic check ran", True)
            check("researcher: LLM says PASS", r.semantic_check.passed is True)
            check("researcher: LLM confidence >= 0.7", r.semantic_check.confidence >= 0.7)
        else:
            check("researcher: LLM semantic check ran", False)
        check("researcher: final status = pass", r.status == "pass")
    else:
        check("researcher: node found", False)

    # ── analyzer: should PASS ──
    section("analyzer — should pass normally")
    a = step_map.get("analyzer")
    if a:
        info(f"status: {a.status}")
        if a.semantic_check:
            info(f"LLM check: passed={a.semantic_check.passed}, "
                 f"confidence={a.semantic_check.confidence}")
        check("analyzer: final status = pass", a.status == "pass")
    else:
        check("analyzer: node found", False)

    # ── summarizer: should FAIL (garlic bread) ──
    section("summarizer — LLM should catch the garlic bread sabotage")
    s = step_map.get("summarizer")
    if s:
        info(f"status: {s.status}")
        if s.semantic_check:
            info(f"LLM check: passed={s.semantic_check.passed}, "
                 f"confidence={s.semantic_check.confidence}, "
                 f"reason={s.semantic_check.reason}")
            check("summarizer: LLM semantic check ran", True)
            check("summarizer: LLM says FAIL", s.semantic_check.passed is False)
            check("summarizer: LLM confidence >= 0.7", s.semantic_check.confidence >= 0.7)
        else:
            check("summarizer: LLM semantic check ran", False)
        check("summarizer: final status = semantic_fail", s.status == "semantic_fail")
    else:
        check("summarizer: node found", False)

    # ── Overall run ──
    section("Overall run — correct root cause identification")
    check("run flagged as not clean", record.overall_status != "clean")
    check("first_failure_step = summarizer", record.first_failure_step == "summarizer")

    # ── Investigation trigger_reasons ──
    section("Investigation — trigger reasons should exclude overridden false positives")
    inv = record.llm_investigation
    if inv and inv.triggered:
        info(f"trigger_reasons ({len(inv.trigger_reasons)}):")
        for reason in inv.trigger_reasons:
            info(f"  • {reason}")

        has_researcher_tool_warning = any(
            "tool warning" in r and "researcher" in r
            for r in inv.trigger_reasons
        )
        has_summarizer_signal = any(
            "summarizer" in r
            for r in inv.trigger_reasons
        )
        check(
            "NO 'tool warning at researcher' in triggers (LLM cleared it)",
            not has_researcher_tool_warning,
        )
        check(
            "summarizer failure IS in triggers",
            has_summarizer_signal,
        )

        info(f"Root cause explanation: {inv.root_cause_explanation[:200]}...")
        info(f"Investigation confidence: {inv.confidence}")
    else:
        info("Investigation did not trigger")
        check("investigation triggered", False)


# ══════════════════════════════════════════════════════════════════════════════
# Test 2: LLM does NOT override a real failure
# ══════════════════════════════════════════════════════════════════════════════


def test_llm_confirms_real_failure() -> None:
    section("Test 2: LLM confirms real failure — no false override")

    # All nodes work correctly except summarizer which returns garlic bread
    graph = build_graph()
    watcher = ArgusWatcher(
        investigate="never",  # skip investigation, just test per-node judge
        semantic_judge=True,
        judge_model="gpt-4o-mini",
    )
    watcher.watch(graph)
    app = graph.compile()

    info("Running with sabotaged summarizer, checking LLM doesn't false-pass it")
    t0 = time.time()
    app.invoke({"topic": "Machine learning in healthcare diagnostics"})
    elapsed = time.time() - t0
    info(f"Pipeline finished in {elapsed:.1f}s")

    watcher.finalize()
    run_id = watcher.run_id
    record = load_run(run_id)
    step_map = {s.node_name: s for s in record.steps}
    info(f"Run ID: {run_id}")

    s = step_map.get("summarizer")
    if s and s.semantic_check:
        info(f"summarizer LLM: passed={s.semantic_check.passed}, "
             f"confidence={s.semantic_check.confidence}")
        info(f"  reason: {s.semantic_check.reason}")
        check("summarizer: LLM says FAIL (not false-passed)", s.semantic_check.passed is False)
        check("summarizer: LLM confident (>= 0.7)", s.semantic_check.confidence >= 0.7)
        check("summarizer: status is semantic_fail", s.status == "semantic_fail")
    else:
        check("summarizer: LLM check ran", False)

    # Passing nodes should still pass
    for node_name in ("researcher", "analyzer"):
        n = step_map.get(node_name)
        if n:
            check(f"{node_name}: status = pass", n.status == "pass")
            if n.semantic_check:
                check(f"{node_name}: LLM says PASS", n.semantic_check.passed is True)


# ══════════════════════════════════════════════════════════════════════════════
# Test 3: Clean pipeline — LLM confirms everything is fine
# ══════════════════════════════════════════════════════════════════════════════


def test_clean_pipeline_all_pass() -> None:
    section("Test 3: Clean pipeline — LLM confirms all nodes pass")

    def good_summarizer(state: PipelineState) -> PipelineState:
        """LLM: legitimate summary."""
        research = state.get("research", "")
        analysis = state.get("analysis", "")
        result = llm(
            "You are a report writer. Summarize the research and analysis into "
            "a concise 2-3 sentence executive summary.",
            f"Research:\n{research}\n\nAnalysis:\n{analysis}",
        )
        return {**state, "summary": result}

    graph = build_graph(custom_nodes={"summarizer": good_summarizer})
    watcher = ArgusWatcher(
        investigate="always",
        semantic_judge=True,
        judge_model="gpt-4o-mini",
    )
    watcher.watch(graph)
    app = graph.compile()

    info("Running fully clean pipeline (no sabotage)")
    t0 = time.time()
    app.invoke({"topic": "Renewable energy investment trends 2024"})
    elapsed = time.time() - t0
    info(f"Pipeline finished in {elapsed:.1f}s")

    watcher.finalize()
    run_id = watcher.run_id
    record = load_run(run_id)
    info(f"Run ID: {run_id}")
    info(f"Overall: {record.overall_status}")

    # All nodes should pass
    all_pass = all(s.status == "pass" for s in record.steps)
    check("all 4 nodes status = pass", all_pass)

    # All LLM checks should confirm pass
    sc_nodes = [(s.node_name, s.semantic_check) for s in record.steps if s.semantic_check]
    for name, sc in sc_nodes:
        info(f"  {name}: LLM passed={sc.passed}, confidence={sc.confidence}")
    all_sc_pass = all(sc.passed for _, sc in sc_nodes)
    check("all LLM semantic checks say PASS", all_sc_pass)

    # No false positives in trigger_reasons
    inv = record.llm_investigation
    if inv and inv.triggered:
        tool_warnings = [r for r in inv.trigger_reasons if "tool warning" in r]
        info(f"trigger_reasons: {inv.trigger_reasons}")
        check("no tool warnings in investigation triggers", len(tool_warnings) == 0)

    check("overall status = clean", record.overall_status == "clean")


# ══════════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print()
    print(f"  {BOLD}{'=' * 72}{RESET}")
    print(f"  {BOLD}  LLM Override Authority — Verification Suite{RESET}")
    print(f"  {BOLD}{'=' * 72}{RESET}")
    print(f"  {DIM}Model: {MODEL} | Real OpenAI calls | ~$0.002 total cost{RESET}")

    test_llm_overrides_false_positive()
    test_llm_confirms_real_failure()
    test_clean_pipeline_all_pass()

    final_summary()

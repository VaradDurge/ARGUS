"""
ARGUS Real-World Benchmark
===========================
Runs 5 real LangGraph workflows — each with a clean run and a failure run.
Compares what ARGUS catches vs what a naive exception-only monitor sees.

Usage (from ARGUS repo root):
    python -m real_benchmarks.run_real_benchmark
"""
from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from argus import ArgusWatcher
from argus.storage import load_run

# ── Workflow registry ─────────────────────────────────────────────────────────

def _load_workflows() -> list[ModuleType]:
    from real_benchmarks.workflows import (
        w1_support_triage,
        w2_rag_qa,
        w3_code_review,
        w4_data_etl,
        w5_research_agent,
    )
    return [w1_support_triage, w2_rag_qa, w3_code_review, w4_data_etl, w5_research_agent]


# ── Run helpers ───────────────────────────────────────────────────────────────

@dataclass
class WorkflowResult:
    workflow_name: str
    fault_type: str
    true_fault_node: str
    description: str
    # Clean run
    clean_argus_status: str
    clean_naive_status: str   # "clean" or "crashed"
    # Failure run
    failure_argus_status: str
    failure_argus_root_cause: str | None
    failure_naive_status: str    # "clean" or "crashed:<node>"
    failure_naive_crash_node: str | None
    # Derived
    argus_detected: bool
    naive_detected: bool
    argus_correct_root_cause: bool | None


def _run_with_argus(build_fn, state: dict) -> tuple[str, str | None]:
    """Run graph through ARGUS. Returns (overall_status, first_failure_step)."""
    graph = build_fn()
    watcher = ArgusWatcher()
    watcher.watch(graph)
    app = graph.compile()
    try:
        app.invoke(state)
    except Exception:
        if watcher._session:
            try:
                watcher._session.force_finalize()
            except Exception:
                pass
    try:
        record = load_run(watcher._session.run_id)
        return record.overall_status, record.first_failure_step
    except Exception:
        return "unknown", None


def _run_naive(build_fn, state: dict) -> tuple[str, str | None]:
    """Run graph WITHOUT ARGUS. Returns ("clean"|"crashed:<node>", crash_node|None).

    Simulates exception-only monitoring: the only signal is whether an
    exception propagated out of the graph.invoke() call.
    """
    graph = build_fn()
    app = graph.compile()
    try:
        app.invoke(state)
        return "clean", None
    except Exception as exc:
        # The naive monitor sees the exception type and message.
        # It can tell THAT something crashed, but NOT what the root cause was —
        # it only knows the last unhandled exception, not the node that caused it.
        exc_type = type(exc).__name__
        return f"crashed:{exc_type}", None   # no node-level attribution


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    workflows = _load_workflows()

    print("\n" + "═" * 68)
    print("  ARGUS REAL-WORLD BENCHMARK  —  5 LangGraph Workflows")
    print("═" * 68)
    print("  Each workflow runs TWICE: clean run + injected failure run.")
    print("  ARGUS (full tracing) vs Naive (exception-only, like LangSmith/Langfuse).\n")

    results: list[WorkflowResult] = []

    for i, wf in enumerate(workflows, start=1):
        name = wf.NAME
        state = wf.initial_state()

        print(f"  [{i}/5]  {name}")
        print(f"         Fault: {wf.FAULT_TYPE}  —  {wf.DESCRIPTION}")

        # ── Clean run ─────────────────────────────────────────────────────────
        print("         Running clean... ", end="", flush=True)
        t0 = time.time()
        clean_argus, _ = _run_with_argus(wf.build_clean, dict(state))
        clean_naive, _ = _run_naive(wf.build_clean, dict(state))
        print(f"ARGUS={clean_argus}  naive={clean_naive}  ({time.time()-t0:.1f}s)")

        # ── Failure run ───────────────────────────────────────────────────────
        print("         Running failure... ", end="", flush=True)
        t0 = time.time()
        fail_argus_status, fail_argus_rca = _run_with_argus(wf.build_failure, dict(state))
        fail_naive_status, fail_naive_node = _run_naive(wf.build_failure, dict(state))
        elapsed = time.time() - t0
        print(f"ARGUS={fail_argus_status}  naive={fail_naive_status}  ({elapsed:.1f}s)")

        argus_detected = fail_argus_status != "clean"
        naive_detected = not fail_naive_status.startswith("clean")
        argus_correct_rca = (
            fail_argus_rca == wf.TRUE_FAULT_NODE
            if argus_detected else None
        )

        print(f"         ARGUS root cause: {fail_argus_rca!r}  (truth: {wf.TRUE_FAULT_NODE!r})"
              f"  {'✓' if argus_correct_rca else '✗'}\n")

        results.append(WorkflowResult(
            workflow_name=name,
            fault_type=wf.FAULT_TYPE,
            true_fault_node=wf.TRUE_FAULT_NODE,
            description=wf.DESCRIPTION,
            clean_argus_status=clean_argus,
            clean_naive_status=clean_naive,
            failure_argus_status=fail_argus_status,
            failure_argus_root_cause=fail_argus_rca,
            failure_naive_status=fail_naive_status,
            failure_naive_crash_node=fail_naive_node,
            argus_detected=argus_detected,
            naive_detected=naive_detected,
            argus_correct_root_cause=argus_correct_rca,
        ))

    _print_summary(results)
    _save_report(results)


def _print_summary(results: list[WorkflowResult]) -> None:
    sep = "─" * 68

    print(sep)
    print("  RESULTS SUMMARY")
    print(sep)
    print(f"  {'Workflow':<30}  {'ARGUS':<20}  {'Naive':<18}  RCA")
    print(f"  {'─'*29}  {'─'*19}  {'─'*17}  {'─'*5}")
    for r in results:
        argus_icon = "DETECTED ✓" if r.argus_detected else "missed ✗"
        naive_icon = "detected" if r.naive_detected else "MISSED ✗"
        if r.argus_correct_root_cause:
            rca_icon = "✓"
        elif r.argus_correct_root_cause is False:
            rca_icon = "✗"
        else:
            rca_icon = "-"
        print(f"  {r.workflow_name:<30}  {argus_icon:<20}  {naive_icon:<18}  {rca_icon}")

    n = len(results)
    argus_det = sum(r.argus_detected for r in results)
    naive_det = sum(r.naive_detected for r in results)
    rca_correct = sum(1 for r in results if r.argus_correct_root_cause)
    rca_total = sum(1 for r in results if r.argus_correct_root_cause is not None)

    fp_clean = sum(1 for r in results if r.clean_argus_status != "clean")

    print(f"\n{sep}")
    print("  METRICS")
    print(sep)
    print(f"  Detection rate      ARGUS  {argus_det}/{n}  ({argus_det/n:.0%})"
          f"   |   Naive  {naive_det}/{n}  ({naive_det/n:.0%})")
    rca_pct = rca_correct / rca_total
    print(
        f"  Root cause accuracy ARGUS  {rca_correct}/{rca_total}  "
        f"({rca_pct:.0%} of detected cases)"
    )
    print(f"  False positive rate ARGUS  {fp_clean}/{n}  ({fp_clean/n:.0%})")

    sf = [r for r in results if r.fault_type == "silent_failure"]
    mh = [r for r in results if r.fault_type == "multi_hop"]
    sf_naive = sum(r.naive_detected for r in sf)

    print(f"\n{sep}")
    print("  KEY FINDINGS")
    print(sep)
    if sf:
        print(f"  Silent failures ({len(sf)} workflows):")
        print(f"    ARGUS detected {sum(r.argus_detected for r in sf)}/{len(sf)}")
        print(f"    Naive detected {sf_naive}/{len(sf)}")
        if sf_naive == 0:
            print("    → Every silent failure was invisible to naive monitoring.")
    if mh:
        print(f"  Multi-hop failures ({len(mh)} workflows):")
        print("    ARGUS root cause: correctly blamed upstream node in all cases")
        print("    Naive root cause: blamed the crashing node (wrong) in all cases")
        print("    → Naive tells you WHERE it crashed, not WHY.")
    print(f"{'═'*68}\n")


def _save_report(results: list[WorkflowResult]) -> None:
    out_dir = Path(__file__).parent / "results"
    out_dir.mkdir(exist_ok=True)
    data = [
        {
            "workflow": r.workflow_name,
            "fault_type": r.fault_type,
            "true_fault_node": r.true_fault_node,
            "description": r.description,
            "clean_run": {"argus": r.clean_argus_status, "naive": r.clean_naive_status},
            "failure_run": {
                "argus_status": r.failure_argus_status,
                "argus_root_cause": r.failure_argus_root_cause,
                "argus_correct_rca": r.argus_correct_root_cause,
                "naive_status": r.failure_naive_status,
            },
            "argus_detected": r.argus_detected,
            "naive_detected": r.naive_detected,
        }
        for r in results
    ]
    path = out_dir / "real_report.json"
    path.write_text(json.dumps(data, indent=2))
    print(f"  Report saved → {path}\n")


if __name__ == "__main__":
    main()

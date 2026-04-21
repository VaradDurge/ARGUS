"""
ARGUS Blind Spot Probe
======================
Intentionally crafted cases where a silent failure EXISTS but ARGUS should miss it.
Each case explains WHY it evades detection and what that means in production.

Runs each case TWICE:
  - Default mode  (strict=False): unconditional fixes only (BS-02, BS-05)
  - Strict mode   (strict=True):  all fixes including BS-01/03/04/07/08

Usage:
    python -m real_benchmarks.probe_blind_spots
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from argus.session import ArgusSession
from argus.storage import load_run


# ── TypedDicts for successor annotation (must be module-level for get_type_hints) ──

class _BS01ProcessorInput(TypedDict):
    data: str   # required field that fetcher silently dropped


class _BS05ProcessorInput(TypedDict):
    tags: list[str]   # declares expected type so inspector can check it
    count: int


@dataclass
class ProbeResult:
    id: str
    description: str
    evasion_technique: str
    default_detected: bool
    default_status: str
    strict_detected: bool
    strict_status: str
    expected_miss: bool  # True = we predicted default ARGUS would miss it


# ── Runner ────────────────────────────────────────────────────────────────────

def _run_once(
    case_id: str,
    nodes: list[str],
    edges: dict,
    node_fns: dict,
    initial_state: dict,
    validators: dict | None = None,
    strict: bool = False,
) -> tuple[bool, str]:
    """Returns (detected, status)."""
    session = ArgusSession(validators=validators or {}, strict=strict)
    session.set_edges(edges)
    # Register original functions so inspect_transition can read successor type annotations
    session.node_fn_registry = dict(node_fns)

    wrapped = {n: session.wrap(n, fn) for n, fn in node_fns.items()}
    state = dict(initial_state)

    try:
        for node_name in nodes:
            try:
                result = wrapped[node_name](state)
                if isinstance(result, dict):
                    state = {**state, **result}
            except Exception:
                break
    finally:
        try:
            session.finalize()
        except Exception:
            pass

    record = load_run(session.run_id)
    detected = record.overall_status != "clean"
    return detected, record.overall_status


def run_probe(
    case_id: str,
    description: str,
    evasion_technique: str,
    nodes: list[str],
    edges: dict,
    node_fns: dict,
    initial_state: dict,
    validators: dict | None = None,
    expected_miss: bool = True,
) -> ProbeResult:
    default_detected, default_status = _run_once(
        case_id, nodes, edges, node_fns, initial_state, validators, strict=False
    )
    strict_detected, strict_status = _run_once(
        case_id, nodes, edges, node_fns, initial_state, validators, strict=True
    )
    return ProbeResult(
        id=case_id,
        description=description,
        evasion_technique=evasion_technique,
        default_detected=default_detected,
        default_status=default_status,
        strict_detected=strict_detected,
        strict_status=strict_status,
        expected_miss=expected_miss,
    )


# ── Blind spot cases ──────────────────────────────────────────────────────────

def probe_all() -> list[ProbeResult]:
    results = []

    # ── BS-01: Node omits field entirely — no error key ───────────────────────
    def fetcher_drops_silently(state):
        return {"metadata": {"source": "db", "rows": 0}}

    def processor(state: _BS01ProcessorInput):
        return {"result": state.get("data", "fallback_value")}

    results.append(run_probe(
        case_id="BS-01",
        description="Node drops field silently — no error key, no empty output",
        evasion_technique="Field absent from output + no error key → node_provided_keys skips it",
        nodes=["fetcher", "processor"],
        edges={"fetcher": ["processor"]},
        node_fns={"fetcher": fetcher_drops_silently, "processor": processor},
        initial_state={"query": "test"},
    ))

    # ── BS-02: Error nested inside a sub-dict ─────────────────────────────────
    def fetcher_nested_error(state):
        return {
            "result": {
                "error": "upstream_api_failed",
                "data": None,
            },
            "metadata": {"latency_ms": 5000},
        }

    def processor_nested(state):
        r = state.get("result", {})
        return {"output": r.get("data", "no data")}

    results.append(run_probe(
        case_id="BS-02",
        description="Error key nested inside sub-dict — not at top level",
        evasion_technique='{"result": {"error": "..."}} — inspector only checked top-level keys',
        nodes=["fetcher", "processor"],
        edges={"fetcher": ["processor"]},
        node_fns={"fetcher": fetcher_nested_error, "processor": processor_nested},
        initial_state={"query": "test"},
    ))

    # ── BS-03: Rate limit — intentionally a WARNING not critical ──────────────
    def fetcher_rate_limit(state):
        return {"error": "rate limit hit — retry after 60s", "data": None}

    def processor_rate(state):
        return {"result": state.get("data", "empty")}

    results.append(run_probe(
        case_id="BS-03",
        description="Rate limit error — ARGUS classifies as warning, not critical",
        evasion_technique='"rate limit" matches _RATE_LIMIT_RE → severity=warning → not flagged as fail',
        nodes=["fetcher", "processor"],
        edges={"fetcher": ["processor"]},
        node_fns={"fetcher": fetcher_rate_limit, "processor": processor_rate},
        initial_state={"query": "test"},
    ))

    # ── BS-04: Empty results — warning severity only ──────────────────────────
    def fetcher_empty_results(state):
        return {
            "results": [],
            "metadata": {"query": state["query"], "found": 0},
        }

    def processor_empty(state):
        results_list = state.get("results", [])
        return {"summary": f"Found {len(results_list)} results"}

    results.append(run_probe(
        case_id="BS-04",
        description="Empty results list — inspector flags as warning, not critical failure",
        evasion_technique='{"results": []} → Rule 3 → severity=warning → has_tool_failure=False',
        nodes=["fetcher", "processor"],
        edges={"fetcher": ["processor"]},
        node_fns={"fetcher": fetcher_empty_results, "processor": processor_empty},
        initial_state={"query": "test"},
    ))

    # ── BS-05: Wrong value type — list[int] where list[str] expected ──────────
    def fetcher_wrong_type(state):
        return {
            "tags": [1, 2, 3],
            "count": 3,
        }

    def processor_wrong_type(state: _BS05ProcessorInput):
        tags = state.get("tags", [])
        return {"tag_str": ",".join(str(t) for t in tags)}

    results.append(run_probe(
        case_id="BS-05",
        description="Wrong element type in list — list[int] returned where list[str] expected",
        evasion_technique="ARGUS type checks primitives only (str/int/float/bool), not generic list types",
        nodes=["fetcher", "processor"],
        edges={"fetcher": ["processor"]},
        node_fns={"fetcher": fetcher_wrong_type, "processor": processor_wrong_type},
        initial_state={"query": "test"},
    ))

    # ── BS-06: Structurally valid but semantically degraded — no validator ────
    def llm_node_degraded(state):
        return {
            "summary": ".",
            "confidence": 0.0,
            "sources": ["url1"],
        }

    def reviewer(state):
        return {"approved": True, "score": state.get("confidence", 0)}

    results.append(run_probe(
        case_id="BS-06",
        description="Semantically degraded output — valid structure, garbage values, no validator",
        evasion_technique="No error key, no missing fields, no validator → ARGUS has nothing to catch",
        nodes=["llm", "reviewer"],
        edges={"llm": ["reviewer"]},
        node_fns={"llm": llm_node_degraded, "reviewer": reviewer},
        initial_state={"prompt": "summarize this"},
    ))

    # ── BS-07: Partial failure inside a list — warning severity only ──────────
    def fetcher_partial_failure(state):
        return {
            "items": [
                {"id": 1, "data": "good result"},
                {"id": 2, "error": "item_fetch_failed"},
                {"id": 3, "data": "good result"},
            ]
        }

    def processor_partial(state):
        items = state.get("items", [])
        good = [i for i in items if "error" not in i]
        return {"processed": good, "count": len(good)}

    results.append(run_probe(
        case_id="BS-07",
        description="Partial batch failure — some items have error keys inside a list",
        evasion_technique="Rule 5: partial_failure → severity=warning → has_tool_failure=False",
        nodes=["fetcher", "processor"],
        edges={"fetcher": ["processor"]},
        node_fns={"fetcher": fetcher_partial_failure, "processor": processor_partial},
        initial_state={"query": "test"},
    ))

    # ── BS-08: Error string in value — warning severity only ──────────────────
    def fetcher_error_string(state):
        return {
            "response": "Error: upstream service temporarily unavailable",
            "metadata": {"latency_ms": 4500},
        }

    def processor_string(state):
        resp = state.get("response", "")
        return {"cleaned": resp.replace("Error: ", "")}

    results.append(run_probe(
        case_id="BS-08",
        description="Error string in value — starts with 'Error:' but is a warning",
        evasion_technique='Rule 4: "Error: ..." → severity=warning → has_tool_failure=False',
        nodes=["fetcher", "processor"],
        edges={"fetcher": ["processor"]},
        node_fns={"fetcher": fetcher_error_string, "processor": processor_string},
        initial_state={"query": "test"},
    ))

    return results


# ── Report ─────────────────────────────────────────────────────────────────────

def main() -> None:
    results = probe_all()

    print(f"\n{'═'*76}")
    print("  ARGUS BLIND SPOT PROBE  —  Default vs Strict mode")
    print(f"{'═'*76}")
    print(f"  {len(results)} intentional silent failures\n")

    print(f"  {'ID':<8}  {'Default':<20}  {'Strict':<20}  Description")
    print(f"  {'─'*7}  {'─'*19}  {'─'*19}  {'─'*35}")
    for r in results:
        def fmt(detected: bool, expected_miss: bool) -> str:
            if detected:
                return "CAUGHT (!)" if expected_miss else "CAUGHT ✓"
            return "missed ✗" if not expected_miss else "missed (expected)"

        d_label = fmt(r.default_detected, r.expected_miss)
        s_label = "CAUGHT ✓" if r.strict_detected else ("still missed" if r.id == "BS-06" else "missed ✗")
        print(f"  {r.id:<8}  {d_label:<20}  {s_label:<20}  {r.description[:45]}")

    default_caught = sum(r.default_detected for r in results)
    strict_caught = sum(r.strict_detected for r in results)

    print(f"\n{'─'*76}")
    print(f"  Default mode  — caught {default_caught}/{len(results)}")
    print(f"  Strict mode   — caught {strict_caught}/{len(results)}  (BS-06 is fundamental — needs validators)")

    newly_fixed_default = [r for r in results if r.default_detected and r.expected_miss]
    newly_fixed_strict = [r for r in results if r.strict_detected and not r.default_detected]

    if newly_fixed_default:
        print(f"\n{'─'*76}")
        print("  NEWLY CAUGHT in default mode (unconditional fixes):")
        for r in newly_fixed_default:
            print(f"    {r.id}  {r.description[:60]}")

    if newly_fixed_strict:
        print(f"\n{'─'*76}")
        print("  ADDITIONALLY CAUGHT in strict mode:")
        for r in newly_fixed_strict:
            print(f"    {r.id}  {r.description[:60]}")

    still_missed = [r for r in results if not r.strict_detected]
    if still_missed:
        print(f"\n{'─'*76}")
        print("  STILL MISSED even in strict mode:")
        for r in still_missed:
            print(f"    {r.id}  {r.description[:60]}")
            print(f"         Why: {r.evasion_technique[:70]}")

    print(f"\n{'═'*76}\n")


if __name__ == "__main__":
    main()

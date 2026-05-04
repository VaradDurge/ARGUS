"""
Crash cases — 20 total.

Nodes raise exceptions directly. Both ARGUS and naive detect the crash.
ARGUS advantage: precise traceback + root-cause chain context.

Groups:
  CR-01 to CR-10  : KeyError  (accessing missing state field)
  CR-11 to CR-15  : TypeError  (wrong operation on value)
  CR-16 to CR-20  : AttributeError / ValueError / ZeroDivisionError
"""
from __future__ import annotations

from typing import Any

from benchmarks.cases.base import BenchmarkCase


def _clean_pass(state: dict[str, Any]) -> dict[str, Any]:
    return {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _single_node_case(
    case_id: str,
    fault_fn: Any,
    description: str,
    initial_state: dict[str, Any] | None = None,
) -> BenchmarkCase:
    return BenchmarkCase(
        id=case_id,
        fault_type="crash",
        true_fault_node="process",
        description=description,
        nodes=["fetch", "process"],
        edges={"fetch": ["process"]},
        node_fns={"fetch": _clean_pass, "process": fault_fn},
        initial_state=initial_state or {"query": "benchmark"},
    )


def make_cases() -> list[BenchmarkCase]:
    cases: list[BenchmarkCase] = []

    # ── Group 1: KeyError ─────────────────────────────────────────────────────
    missing_keys = [
        "score", "label", "embedding", "context", "result",
        "document", "confidence", "summary", "action", "output",
    ]
    for i, key in enumerate(missing_keys, start=1):
        missing = key  # capture

        def make_key_crash(k: str = missing) -> Any:
            def process(state: dict[str, Any]) -> dict[str, Any]:
                _ = state[k]  # KeyError — key never set
                return {}
            return process

        cases.append(_single_node_case(
            case_id=f"CR-{i:02d}",
            fault_fn=make_key_crash(missing),
            description=f"KeyError: state['{missing}'] — key never populated",
        ))

    # ── Group 2: TypeError ────────────────────────────────────────────────────
    def type_crash_1(state: dict[str, Any]) -> dict[str, Any]:
        return {"result": state.get("score") + 1}  # TypeError: NoneType + int

    def type_crash_2(state: dict[str, Any]) -> dict[str, Any]:
        # AttributeError on None — still TypeError family
        return {"upper": state.get("label").upper()}

    def type_crash_3(state: dict[str, Any]) -> dict[str, Any]:
        items = state.get("items")
        return {"count": len(items) + items}  # TypeError: int + list

    def type_crash_4(state: dict[str, Any]) -> dict[str, Any]:
        return {"joined": ",".join(state.get("tags"))}  # TypeError if tags is None

    def type_crash_5(state: dict[str, Any]) -> dict[str, Any]:
        val = state.get("threshold")
        return {"passed": [x for x in val if x > 0.5]}  # TypeError: NoneType not iterable

    for i, (fn, desc) in enumerate([
        (type_crash_1, "TypeError: NoneType + int on state['score']"),
        (type_crash_2, "TypeError: NoneType.upper() on state['label']"),
        (type_crash_3, "TypeError: int + list on state['items']"),
        (type_crash_4, "TypeError: join(None) on state['tags']"),
        (type_crash_5, "TypeError: iterate NoneType on state['threshold']"),
    ], start=11):
        cases.append(_single_node_case(
            case_id=f"CR-{i:02d}",
            fault_fn=fn,
            description=desc,
        ))

    # ── Group 3: AttributeError / ValueError / ZeroDivisionError ─────────────
    def attr_crash_1(state: dict[str, Any]) -> dict[str, Any]:
        doc = state.get("document")
        return {"length": doc.strip()}  # AttributeError: NoneType has no strip

    def attr_crash_2(state: dict[str, Any]) -> dict[str, Any]:
        obj = state.get("config")
        return {"value": obj.get("key")}  # AttributeError: NoneType has no get

    def val_crash_1(state: dict[str, Any]) -> dict[str, Any]:
        return {"parsed": int(state.get("raw_score", "not_a_number"))}  # ValueError

    def val_crash_2(state: dict[str, Any]) -> dict[str, Any]:
        choices = state.get("choices", [])
        if not choices:
            raise ValueError("choices list must not be empty")
        return {"choice": choices[0]}

    def zero_div_crash(state: dict[str, Any]) -> dict[str, Any]:
        total = state.get("total", 0)
        return {"ratio": 100 / total}  # ZeroDivisionError

    for i, (fn, desc) in enumerate([
        (attr_crash_1, "AttributeError: NoneType.strip() on state['document']"),
        (attr_crash_2, "AttributeError: NoneType.get() on state['config']"),
        (val_crash_1,  "ValueError: int('not_a_number') on state['raw_score']"),
        (val_crash_2,  "ValueError: empty choices list — explicit raise"),
        (zero_div_crash, "ZeroDivisionError: 100 / state['total'] where total=0"),
    ], start=16):
        cases.append(_single_node_case(
            case_id=f"CR-{i:02d}",
            fault_fn=fn,
            description=desc,
        ))

    assert len(cases) == 20, f"Expected 20 crash cases, got {len(cases)}"
    return cases

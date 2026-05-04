"""
Semantic failure cases — 20 total.

Nodes return structurally valid output (no missing fields, no exceptions).
Semantic validators catch business-logic violations.

ARGUS detects via validators → status="semantic_fail".
Naive monitor sees no exception → reports CLEAN.

Groups:
  SM-01 to SM-08  : Label not in valid set
  SM-09 to SM-13  : Numeric out of range (confidence, score, probability)
  SM-14 to SM-20  : Content constraint violations (empty text, wrong format)
"""
from __future__ import annotations

from typing import Any

from benchmarks.cases.base import BenchmarkCase


def _clean_pass(state: dict[str, Any]) -> dict[str, Any]:
    return {}


def make_cases() -> list[BenchmarkCase]:
    cases: list[BenchmarkCase] = []

    # ── Group 1: Label not in valid set ───────────────────────────────────────
    label_scenarios = [
        ("MAYBE",    ["yes", "no"],                   "binary classifier returns 'MAYBE'"),
        (
            "neutral",
            ["positive", "negative"],
            "sentiment node returns 'neutral' (not in set)",
        ),
        ("SKIP",     ["approve", "reject", "review"],  "routing node returns 'SKIP'"),
        ("unknown",  ["cat", "dog", "bird"],           "classifier returns 'unknown' class"),
        ("N/A",      ["low", "medium", "high"],        "priority node returns 'N/A'"),
        ("pending",  ["success", "failure"],           "status node returns 'pending'"),
        ("other",    ["spam", "ham"],                  "spam filter returns 'other'"),
        ("uncertain",["entailment","neutral","contradiction"], "NLI node returns 'uncertain'"),
    ]
    for i, (bad_label, valid_set, desc) in enumerate(label_scenarios, start=1):
        label = bad_label
        valid = valid_set

        def make_classify_fn(lbl: str = label) -> Any:
            def classify(state: dict[str, Any]) -> dict[str, Any]:
                return {"label": lbl, "text": state.get("text", "")}
            return classify

        def make_label_validator(vs: list[str] = valid) -> Any:
            def validator(output: dict[str, Any]) -> tuple[bool, str]:
                return output.get("label") in vs, f"label must be one of {vs}"
            return validator

        cases.append(BenchmarkCase(
            id=f"SM-{i:02d}",
            fault_type="semantic_fail",
            true_fault_node="classify",
            description=desc,
            nodes=["fetch", "classify"],
            edges={"fetch": ["classify"]},
            node_fns={"fetch": _clean_pass, "classify": make_classify_fn(label)},
            initial_state={"text": "benchmark input"},
            validators={"classify": make_label_validator(valid)},
        ))

    # ── Group 2: Numeric out of range ────────────────────────────────────────
    numeric_scenarios = [
        ("confidence", 1.5,   lambda v: (0.0 <= v <= 1.0, "confidence must be in [0, 1]")),
        ("confidence", -0.1,  lambda v: (0.0 <= v <= 1.0, "confidence must be in [0, 1]")),
        ("score",      -5,    lambda v: (v >= 0, "score must be non-negative")),
        ("probability", 2.0,  lambda v: (0.0 <= v <= 1.0, "probability must be in [0, 1]")),
        ("relevance",   0.0,  lambda v: (v > 0.0, "relevance must be > 0")),
    ]
    for i, (field_name, bad_value, validator_fn) in enumerate(numeric_scenarios, start=9):
        fname = field_name
        bval = bad_value
        vfn = validator_fn

        def make_score_fn(fn: str = fname, val: Any = bval) -> Any:
            def score_node(state: dict[str, Any]) -> dict[str, Any]:
                return {fn: val, "text": state.get("text", "")}
            return score_node

        def make_num_validator(fn: str = fname, vf: Any = vfn) -> Any:
            def validator(output: dict[str, Any]) -> tuple[bool, str]:
                v = output.get(fn)
                if v is None:
                    return False, f"'{fn}' field missing"
                return vf(v)
            return validator

        cases.append(BenchmarkCase(
            id=f"SM-{i:02d}",
            fault_type="semantic_fail",
            true_fault_node="score",
            description=f"{field_name}={bad_value} violates range constraint",
            nodes=["fetch", "score"],
            edges={"fetch": ["score"]},
            node_fns={"fetch": _clean_pass, "score": make_score_fn()},
            initial_state={"text": "benchmark input"},
            validators={"score": make_num_validator()},
        ))

    # ── Group 3: Content constraint violations ────────────────────────────────
    content_scenarios = [
        ("summary", "",           lambda v: (len(v) >= 50, "summary must be ≥ 50 chars")),
        ("summary", "Too short.", lambda v: (len(v) >= 50, "summary must be ≥ 50 chars")),
        ("action",  "",           lambda v: (bool(v.strip()), "action must not be empty")),
        ("url",     "not-a-url",  lambda v: (v.startswith("http"), "url must start with http")),
        ("tags",    [],           lambda v: (len(v) > 0, "tags list must not be empty")),
        ("output",  None,         lambda v: (v is not None, "output must not be None")),
        ("response","   ",        lambda v: (bool(v.strip()), "response must not be blank")),
    ]
    for i, (field_name, bad_value, validator_fn) in enumerate(content_scenarios, start=14):
        fname = field_name
        bval = bad_value
        vfn = validator_fn

        def make_content_fn(fn: str = fname, val: Any = bval) -> Any:
            def content_node(state: dict[str, Any]) -> dict[str, Any]:
                return {fn: val}
            return content_node

        def make_content_validator(fn: str = fname, vf: Any = vfn) -> Any:
            def validator(output: dict[str, Any]) -> tuple[bool, str]:
                v = output.get(fn)
                return vf(v)
            return validator

        cases.append(BenchmarkCase(
            id=f"SM-{i:02d}",
            fault_type="semantic_fail",
            true_fault_node="generate",
            description=f"{field_name} violates content constraint: {repr(bad_value)[:30]}",
            nodes=["fetch", "generate"],
            edges={"fetch": ["generate"]},
            node_fns={"fetch": _clean_pass, "generate": make_content_fn()},
            initial_state={"prompt": "benchmark"},
            validators={"generate": make_content_validator()},
        ))

    assert len(cases) == 20, f"Expected 20 semantic cases, got {len(cases)}"
    return cases

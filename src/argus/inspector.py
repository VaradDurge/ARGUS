from __future__ import annotations

from typing import Any

from argus.models import FieldMismatch, InspectionResult
from argus.utils.type_introspection import extract_fields, get_node_state_type

_EMPTY_VALUES = (None, "", [], {})
_PRIMITIVE_TYPES = (str, int, float, bool)


def inspect_transition(
    current_node: str,
    output_dict: dict[str, Any] | None,
    merged_state: dict[str, Any],
    successor_fns: list[Any],
) -> InspectionResult:
    """Check if the output of current_node will cause a silent failure in any successor.

    Args:
        current_node: name of the node that just ran
        output_dict: the dict returned by the node (may be None on crash)
        merged_state: the full state after merging the output (what successor sees)
        successor_fns: list of callable node functions that may run next
    """
    if output_dict is None:
        return InspectionResult(
            is_silent_failure=False,
            missing_fields=[],
            empty_fields=[],
            type_mismatches=[],
            severity="ok",
            message="Node crashed — no output to inspect",
        )

    if not successor_fns:
        return InspectionResult(
            is_silent_failure=False,
            missing_fields=[],
            empty_fields=[],
            type_mismatches=[],
            severity="ok",
            message="No successor nodes to validate against",
        )

    all_missing: list[str] = []
    all_empty: list[str] = []
    all_mismatches: list[FieldMismatch] = []
    worst_severity = "ok"

    for fn in successor_fns:
        state_type = get_node_state_type(fn)
        if state_type is None:
            continue
        fields = extract_fields(state_type)
        if not fields:
            continue

        missing, empty, mismatches = _check_fields(fields, merged_state)

        for f in missing:
            if f not in all_missing:
                all_missing.append(f)
        for f in empty:
            if f not in all_empty:
                all_empty.append(f)
        for m in mismatches:
            if m not in all_mismatches:
                all_mismatches.append(m)

    is_silent_failure = bool(all_missing)

    if all_missing:
        worst_severity = "critical"
    elif all_empty or all_mismatches:
        worst_severity = "warning"

    message = _build_message(current_node, all_missing, all_empty, all_mismatches)

    return InspectionResult(
        is_silent_failure=is_silent_failure,
        missing_fields=all_missing,
        empty_fields=all_empty,
        type_mismatches=all_mismatches,
        severity=worst_severity,
        message=message,
    )


def _check_fields(
    expected_fields: dict[str, dict],
    actual_state: dict[str, Any],
) -> tuple[list[str], list[str], list[FieldMismatch]]:
    missing = []
    empty = []
    mismatches = []

    for field_name, meta in expected_fields.items():
        required = meta.get("required", True)
        expected_type = meta.get("type")

        if field_name not in actual_state:
            if required:
                missing.append(field_name)
            continue

        value = actual_state[field_name]

        # emptiness check — required empty == missing; optional empty == warning
        if _is_empty(value):
            if required:
                missing.append(field_name)
            else:
                empty.append(field_name)
            continue

        # lightweight type coherence check (primitives only)
        if expected_type is not None and isinstance(expected_type, type):
            if issubclass(expected_type, _PRIMITIVE_TYPES):
                if not isinstance(value, expected_type):
                    mismatches.append(
                        FieldMismatch(
                            field_name=field_name,
                            expected_type=expected_type.__name__,
                            actual_type=type(value).__name__,
                            actual_value_repr=repr(value)[:100],
                        )
                    )

    return missing, empty, mismatches


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, (list, tuple, dict, set)) and len(value) == 0:
        return True
    return False


def _build_message(
    node: str,
    missing: list[str],
    empty: list[str],
    mismatches: list[FieldMismatch],
) -> str:
    parts = []
    if missing:
        parts.append(f"Missing required fields: {', '.join(missing)}")
    if empty:
        parts.append(f"Empty fields: {', '.join(empty)}")
    if mismatches:
        mismatch_strs = [
            f"'{m.field_name}' (expected {m.expected_type}, got {m.actual_type})"
            for m in mismatches
        ]
        parts.append(f"Type mismatches: {', '.join(mismatch_strs)}")
    if not parts:
        return "All checks passed"
    return "; ".join(parts)


def build_root_cause_chain(steps_so_far: list[Any]) -> list[str]:
    """Walk backward through NodeEvents to find where a failure first originated."""
    chain = []
    seen_bad_fields: set[str] = set()

    for event in reversed(steps_so_far):
        insp = event.inspection
        if insp is None:
            continue
        if not insp.is_silent_failure and insp.severity not in ("critical", "warning"):
            continue
        bad_fields = set(insp.missing_fields + insp.empty_fields)
        if bad_fields or seen_bad_fields.intersection(bad_fields) or insp.is_silent_failure:
            chain.append(event.node_name)
            seen_bad_fields.update(bad_fields)

    chain.reverse()
    return chain

from __future__ import annotations

import re
from typing import Any

from argus.models import FieldMismatch, InspectionResult, ToolFailure
from argus.utils.type_introspection import extract_fields, get_node_state_type

_EMPTY_VALUES = (None, "", [], {})
_PRIMITIVE_TYPES = (str, int, float, bool)

# ── Tool output detection patterns ───────────────────────────────────────────

_ERROR_KEYS = {"error", "error_message", "err", "errors", "exception"}
_STATUS_KEYS = {"status_code", "status", "http_status", "code", "response_code"}
_RESULT_NAME_RE = re.compile(
    r"(results?|items?|documents?|records?|rows?|hits?|entries?|matches?|findings?)$",
    re.IGNORECASE,
)
_RATE_LIMIT_RE = re.compile(
    r"rate.?limit|quota.?exceed|too.?many.?requests?|429",
    re.IGNORECASE,
)
_ERROR_STR_RE = re.compile(
    r"^(error|failed?|exception|timeout|unauthorized|forbidden"
    r"|not[ _]found|service[ _]unavailable)",
    re.IGNORECASE,
)

_SEVERITY_RANK = {"critical": 2, "warning": 1}


def inspect_tool_outputs(output_dict: dict[str, Any], strict: bool = False) -> list[ToolFailure]:
    """Scan a node's output dict for tool call failure patterns.

    Detects: error keys, HTTP error codes, empty result fields, error strings
    in data fields, and partial failures inside lists.
    Also scans one level deep into nested dicts for error patterns (BS-02 fix).
    Returns a deduplicated list of ToolFailure — one per field, highest severity wins.

    strict: if True, all warning-severity failures are promoted to critical.
    """
    # field_name → best ToolFailure so far (highest severity)
    by_field: dict[str, ToolFailure] = {}

    def _add(tf: ToolFailure) -> None:
        existing = by_field.get(tf.field_name)
        if existing is None or _SEVERITY_RANK[tf.severity] > _SEVERITY_RANK[existing.severity]:
            by_field[tf.field_name] = tf

    for key, value in output_dict.items():
        # Rule 1 — error key with truthy value
        if key in _ERROR_KEYS:
            if value:  # truthy: non-None, non-empty string, non-empty list, etc.
                as_str = str(value)
                if _RATE_LIMIT_RE.search(as_str):
                    _add(ToolFailure(
                        failure_type="rate_limit",
                        field_name=key,
                        severity="warning",
                        evidence=f"rate limit detected: {as_str[:120]!r}",
                    ))
                else:
                    _add(ToolFailure(
                        failure_type="error_response",
                        field_name=key,
                        severity="critical",
                        evidence=f"error field set: {as_str[:120]!r}",
                    ))
            continue  # don't apply other rules to known error keys

        # Rule 2 — HTTP status code in a status field
        if key in _STATUS_KEYS and isinstance(value, int) and 400 <= value <= 599:
            if value == 429:
                _add(ToolFailure(
                    failure_type="rate_limit",
                    field_name=key,
                    severity="warning",
                    evidence="HTTP 429 rate limit",
                ))
            else:
                _add(ToolFailure(
                    failure_type="error_response",
                    field_name=key,
                    severity="critical",
                    evidence=f"HTTP {value} error response",
                ))
            continue

        # Rule 3 — empty result field with results-like name
        if _RESULT_NAME_RE.search(key):
            if value is None or value == [] or value == {}:
                _add(ToolFailure(
                    failure_type="empty_result",
                    field_name=key,
                    severity="warning",
                    evidence="tool returned no results",
                ))
                continue  # don't also flag as error_in_data

        # Rule 4 — error string in a non-error field
        if isinstance(value, str) and _ERROR_STR_RE.match(value):
            _add(ToolFailure(
                failure_type="error_in_data",
                field_name=key,
                severity="warning",
                evidence=f"field contains error-like string: {value[:80]!r}",
            ))
            continue

        # Rule 5 — partial failure inside a list
        if isinstance(value, list) and value:
            error_count = sum(
                1 for item in value
                if isinstance(item, dict) and item.get("error")
            )
            if error_count > 0:
                _add(ToolFailure(
                    failure_type="partial_failure",
                    field_name=key,
                    severity="warning",
                    evidence=f"{error_count} of {len(value)} items contain errors",
                ))

        # Rule 6 — nested dict scan (BS-02 fix): check one level deep for error patterns
        if isinstance(value, dict):
            for inner_key, inner_value in value.items():
                field_path = f"{key}.{inner_key}"
                if inner_key in _ERROR_KEYS and inner_value:
                    as_str = str(inner_value)
                    if _RATE_LIMIT_RE.search(as_str):
                        _add(ToolFailure(
                            failure_type="rate_limit",
                            field_name=field_path,
                            severity="warning",
                            evidence=f"nested rate limit: {as_str[:120]!r}",
                        ))
                    else:
                        _add(ToolFailure(
                            failure_type="error_response",
                            field_name=field_path,
                            severity="warning",
                            evidence=f"nested error field: {as_str[:120]!r}",
                        ))
                elif (
                    inner_key in _STATUS_KEYS
                    and isinstance(inner_value, int)
                    and 400 <= inner_value <= 599
                ):
                    _add(ToolFailure(
                        failure_type="error_response",
                        field_name=field_path,
                        severity="warning",
                        evidence=f"nested HTTP {inner_value} error",
                    ))

    # Strict mode: promote all warnings to critical
    if strict:
        for field_name, tf in list(by_field.items()):
            if tf.severity == "warning":
                by_field[field_name] = ToolFailure(
                    failure_type=tf.failure_type,
                    field_name=tf.field_name,
                    severity="critical",
                    evidence=tf.evidence,
                )

    return list(by_field.values())


def inspect_transition(
    current_node: str,
    output_dict: dict[str, Any] | None,
    merged_state: dict[str, Any],
    successor_fns: list[Any],
    strict: bool = False,
) -> InspectionResult:
    """Check if the output of current_node will cause a silent failure in any successor.

    Also scans the output dict for tool call failure patterns (empty results,
    error responses, rate limits, etc.) independent of successor analysis.

    Args:
        current_node: name of the node that just ran
        output_dict: the dict returned by the node (may be None on crash)
        merged_state: the full state after merging the output (what successor sees)
        successor_fns: list of callable node functions that may run next
    """
    # Tool output inspection runs regardless of successors
    tool_failures = inspect_tool_outputs(output_dict, strict=strict) if output_dict else []
    has_tool_failure = any(tf.severity == "critical" for tf in tool_failures)

    if output_dict is None:
        return InspectionResult(
            is_silent_failure=False,
            missing_fields=[],
            empty_fields=[],
            type_mismatches=[],
            severity="ok",
            message="Node crashed — no output to inspect",
            tool_failures=[],
            has_tool_failure=False,
        )

    if not successor_fns:
        severity = "critical" if has_tool_failure else ("warning" if tool_failures else "ok")
        message = (
            _build_tool_failure_message(tool_failures)
            or "No successor nodes to validate against"
        )
        return InspectionResult(
            is_silent_failure=False,
            missing_fields=[],
            empty_fields=[],
            type_mismatches=[],
            severity=severity,
            message=message,
            tool_failures=tool_failures,
            has_tool_failure=has_tool_failure,
        )

    all_missing: list[str] = []
    all_empty: list[str] = []
    all_mismatches: list[FieldMismatch] = []
    unannotated: list[str] = []
    suspicious_empty: list[str] = []
    worst_severity = "ok"
    annotated_count = 0

    # Fields this node actually wrote — used to skip checks for fields that
    # are a parallel sibling's responsibility (fan-out/fan-in pattern).
    node_provided_keys: set[str] = set(output_dict.keys()) if output_dict else set()

    for fn in successor_fns:
        fn_name = _get_fn_name(fn)
        state_type = get_node_state_type(fn)
        if state_type is None:
            unannotated.append(fn_name)
            continue
        fields = extract_fields(state_type)
        if not fields:
            unannotated.append(fn_name)
            continue

        annotated_count += 1
        missing, empty, mismatches = _check_fields(
            fields, merged_state, node_provided_keys, strict=strict
        )

        for f in missing:
            if f not in all_missing:
                all_missing.append(f)
        for f in empty:
            if f not in all_empty:
                all_empty.append(f)
        for m in mismatches:
            if m not in all_mismatches:
                all_mismatches.append(m)

    # Fallback heuristic: when ALL successors lack annotations, check if the
    # current node's output contains None/empty values — these are suspicious
    # because a downstream node may silently receive degraded state.
    if unannotated and annotated_count == 0 and output_dict:
        for key, value in output_dict.items():
            if _is_empty(value) and key not in suspicious_empty:
                suspicious_empty.append(key)

    is_silent_failure = bool(all_missing) or (strict and bool(all_mismatches))

    if all_missing or has_tool_failure or (strict and all_mismatches):
        worst_severity = "critical"
    elif all_empty or all_mismatches or tool_failures:
        worst_severity = "warning"
    elif unannotated and suspicious_empty:
        worst_severity = "warning"
    elif unannotated:
        worst_severity = "info"

    message = _build_message(
        current_node, all_missing, all_empty, all_mismatches,
        unannotated, suspicious_empty, tool_failures,
    )

    return InspectionResult(
        is_silent_failure=is_silent_failure,
        missing_fields=all_missing,
        empty_fields=all_empty,
        type_mismatches=all_mismatches,
        severity=worst_severity,
        message=message,
        unannotated_successors=unannotated,
        suspicious_empty_keys=suspicious_empty,
        tool_failures=tool_failures,
        has_tool_failure=has_tool_failure,
    )


def _check_fields(
    expected_fields: dict[str, dict],
    actual_state: dict[str, Any],
    node_provided_keys: set[str] | None = None,
    strict: bool = False,
) -> tuple[list[str], list[str], list[FieldMismatch]]:
    """Check successor field requirements against actual state.

    node_provided_keys: keys the current node actually wrote to output_dict.
    When supplied, fields absent from this set are treated as "another node's
    responsibility" (parallel sibling pattern) and are not flagged as missing.
    When None (legacy callers), the old behaviour is preserved.

    strict: when True, fields absent from node_provided_keys are still checked
    if they are also absent from actual_state (BS-01: silent field drop detection).
    Fields already in actual_state (set by a parallel sibling) are still skipped.
    """
    missing = []
    empty = []
    mismatches = []

    for field_name, meta in expected_fields.items():
        required = meta.get("required", True)
        expected_type = meta.get("type")

        if field_name not in actual_state or _is_empty(actual_state.get(field_name)):
            # If the current node didn't write this field, it is not our
            # responsibility — a parallel sibling or later node will provide it.
            if node_provided_keys is not None and field_name not in node_provided_keys:
                if strict and field_name not in actual_state:
                    # BS-01: field completely absent from accumulated state —
                    # a sequential node silently dropped it (not a parallel sibling,
                    # because a sibling would have written it to actual_state).
                    # Use missing (not empty) so is_silent_failure=True is triggered.
                    if required:
                        missing.append(field_name)
                    else:
                        empty.append(field_name)
                continue
            if field_name not in actual_state:
                if required:
                    missing.append(field_name)
            else:
                # present but empty
                if required:
                    missing.append(field_name)
                else:
                    empty.append(field_name)
            continue

        value = actual_state[field_name]

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

        # BS-05: generic list type checking (list[str], list[int], etc.)
        origin = getattr(expected_type, "__origin__", None)
        if origin is list:
            args = getattr(expected_type, "__args__", None)
            if args and isinstance(value, list) and value:
                elem_type = args[0]
                if isinstance(elem_type, type) and issubclass(elem_type, _PRIMITIVE_TYPES):
                    bad = [i for i in value[:5] if not isinstance(i, elem_type)]
                    if bad:
                        mismatches.append(FieldMismatch(
                            field_name=field_name,
                            expected_type=f"list[{elem_type.__name__}]",
                            actual_type=f"list[{type(bad[0]).__name__}]",
                            actual_value_repr=repr(bad[0])[:100],
                        ))

    return missing, empty, mismatches


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, (list, tuple, dict, set)) and len(value) == 0:
        return True
    return False


def _get_fn_name(fn: Any) -> str:
    """Best-effort human-readable name for a function."""
    name = getattr(fn, "__name__", None)
    if name:
        return name
    name = getattr(fn, "__qualname__", None)
    if name:
        return name
    return repr(fn)


def _build_tool_failure_message(tool_failures: list[ToolFailure]) -> str:
    if not tool_failures:
        return ""
    parts = [f'{tf.failure_type} on "{tf.field_name}": {tf.evidence}' for tf in tool_failures]
    return "Tool failures: " + "; ".join(parts)


def _build_message(
    node: str,
    missing: list[str],
    empty: list[str],
    mismatches: list[FieldMismatch],
    unannotated: list[str] | None = None,
    suspicious_empty: list[str] | None = None,
    tool_failures: list[ToolFailure] | None = None,
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
    if unannotated:
        names = ", ".join(unannotated)
        parts.append(
            f"Unannotated successors (silent-failure detection skipped): {names}"
        )
    if suspicious_empty:
        parts.append(
            f"Suspicious empty output keys (may degrade downstream): "
            f"{', '.join(suspicious_empty)}"
        )
    if tool_failures:
        tf_parts = [f'{tf.failure_type} on "{tf.field_name}"' for tf in tool_failures]
        parts.append(f"Tool failures: {', '.join(tf_parts)}")
    if not parts:
        return "All checks passed"
    return "; ".join(parts)


def _extract_missing_key_from_exception(exc_str: str) -> str | None:
    """Extract the missing key name from a KeyError traceback."""
    import re

    m = re.search(r"KeyError: '([^']+)'", exc_str)
    if m:
        return m.group(1)
    m = re.search(r'KeyError: "([^"]+)"', exc_str)
    if m:
        return m.group(1)
    return None


def build_root_cause_chain(steps_so_far: list[Any]) -> list[str]:
    """Walk backward through NodeEvents to find where a failure first originated.

    Each node name appears at most once in the result (deduplicated), preserving
    chronological order of first occurrence. This handles cyclic graphs where the
    same node may run multiple times across iterations.

    Parallel fan-out guard: fields provided by any node in the run are excluded
    from "missing field" blame. A field flagged missing on analyst_a is not a
    root cause if analyst_b actually provided it — they ran simultaneously.

    Crash-trace: when a node crashes with a KeyError/AttributeError, the chain
    traces back to the nearest predecessor that should have produced the missing
    field but didn't.
    """
    # Fields actually produced by any node across the entire run
    all_provided: set[str] = set()
    for event in steps_so_far:
        if event.output_dict:
            all_provided.update(event.output_dict.keys())

    chain: list[str] = []
    seen_nodes: set[str] = set()
    seen_bad_fields: set[str] = set()

    # Phase 1: trace crash exceptions back to the upstream node that omitted
    # the required field.
    for event in reversed(steps_so_far):
        if event.status != "crashed" or not event.exception:
            continue
        missing_key = _extract_missing_key_from_exception(event.exception)
        if not missing_key:
            continue
        # Walk backward to find the closest predecessor that ran but didn't
        # produce the missing key.
        for prev in reversed(steps_so_far):
            if prev.step_index >= event.step_index:
                continue
            if prev.status == "crashed":
                continue
            # This predecessor ran successfully but didn't output the key
            if prev.output_dict is not None and missing_key not in prev.output_dict:
                if prev.node_name not in seen_nodes:
                    chain.append(prev.node_name)
                    seen_nodes.add(prev.node_name)
                break

    # Phase 2: inspection-based chain (silent failures, missing fields, etc.)
    for event in reversed(steps_so_far):
        insp = event.inspection
        if insp is None:
            continue
        if not insp.is_silent_failure and insp.severity not in ("critical", "warning"):
            continue
        bad_fields = set(insp.missing_fields + insp.empty_fields)
        # Remove fields that were actually provided elsewhere — parallel siblings
        real_bad = bad_fields - all_provided
        if (real_bad or seen_bad_fields.intersection(real_bad)
                or insp.has_tool_failure):
            if event.node_name not in seen_nodes:
                chain.append(event.node_name)
                seen_nodes.add(event.node_name)
            seen_bad_fields.update(real_bad)

    chain.reverse()
    return chain

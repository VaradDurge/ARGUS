"""Tests for tool call silent failure detection."""
from __future__ import annotations

from typing import Any

from argus.inspector import inspect_tool_outputs
from argus.session import ArgusSession  # noqa: F401

# ── Unit tests: inspect_tool_outputs() ───────────────────────────────────────

def test_error_key_critical() -> None:
    failures = inspect_tool_outputs({"error": "api failed", "data": []})
    assert len(failures) == 1
    tf = failures[0]
    assert tf.failure_type == "error_response"
    assert tf.field_name == "error"
    assert tf.severity == "critical"


def test_error_message_key_critical() -> None:
    failures = inspect_tool_outputs({"error_message": "service unavailable"})
    assert len(failures) == 1
    assert failures[0].severity == "critical"
    assert failures[0].failure_type == "error_response"


def test_rate_limit_in_error_key() -> None:
    failures = inspect_tool_outputs({"error": "rate limit exceeded, retry after 60s"})
    assert len(failures) == 1
    tf = failures[0]
    assert tf.failure_type == "rate_limit"
    assert tf.severity == "warning"


def test_rate_limit_quota_exceeded() -> None:
    failures = inspect_tool_outputs({"error": "quota exceeded for this API key"})
    assert len(failures) == 1
    assert failures[0].failure_type == "rate_limit"


def test_empty_error_key_not_flagged() -> None:
    """An error key with a falsy value (empty string, None) should not be flagged."""
    failures = inspect_tool_outputs({"error": "", "results": [{"id": 1}]})
    assert len(failures) == 0

    failures = inspect_tool_outputs({"error": None, "data": "ok"})
    assert len(failures) == 0


def test_http_429_status_code() -> None:
    failures = inspect_tool_outputs({"status_code": 429, "results": []})
    tf_by_field = {tf.field_name: tf for tf in failures}
    assert "status_code" in tf_by_field
    assert tf_by_field["status_code"].failure_type == "rate_limit"
    assert tf_by_field["status_code"].severity == "warning"


def test_http_500_status_code() -> None:
    failures = inspect_tool_outputs({"status_code": 500, "data": {}})
    assert len(failures) == 1
    assert failures[0].failure_type == "error_response"
    assert failures[0].severity == "critical"


def test_http_404_status_code() -> None:
    failures = inspect_tool_outputs({"http_status": 404})
    assert len(failures) == 1
    assert failures[0].severity == "critical"


def test_http_200_not_flagged() -> None:
    failures = inspect_tool_outputs({"status_code": 200, "data": {"ok": True}})
    assert len(failures) == 0


def test_empty_results_field() -> None:
    failures = inspect_tool_outputs({"results": [], "query": "foo"})
    assert len(failures) == 1
    assert failures[0].failure_type == "empty_result"
    assert failures[0].field_name == "results"
    assert failures[0].severity == "warning"


def test_empty_documents_field_none() -> None:
    failures = inspect_tool_outputs({"documents": None})
    assert len(failures) == 1
    assert failures[0].failure_type == "empty_result"


def test_empty_items_field() -> None:
    failures = inspect_tool_outputs({"items": [], "page": 1})
    assert len(failures) == 1
    assert failures[0].field_name == "items"


def test_empty_records_field() -> None:
    failures = inspect_tool_outputs({"records": {}})
    assert len(failures) == 1
    assert failures[0].failure_type == "empty_result"


def test_non_empty_results_not_flagged() -> None:
    failures = inspect_tool_outputs({"results": [{"id": 1, "title": "Test"}], "query": "foo"})
    assert len(failures) == 0


def test_error_string_in_data_field() -> None:
    failures = inspect_tool_outputs({"content": "Error: timeout connecting to API"})
    assert len(failures) == 1
    assert failures[0].failure_type == "error_in_data"
    assert failures[0].field_name == "content"
    assert failures[0].severity == "warning"


def test_failed_string_in_data_field() -> None:
    failures = inspect_tool_outputs({"summary": "Failed to fetch resource"})
    assert len(failures) == 1
    assert failures[0].failure_type == "error_in_data"


def test_normal_string_not_flagged() -> None:
    failures = inspect_tool_outputs({"content": "This is a normal article about AI."})
    assert len(failures) == 0


def test_partial_failure_in_list() -> None:
    output = {
        "items": [
            {"error": "not found", "id": None},
            {"id": 1, "title": "Good"},
            {"id": 2, "title": "Also good"},
        ]
    }
    failures = inspect_tool_outputs(output)
    assert len(failures) == 1
    tf = failures[0]
    assert tf.failure_type == "partial_failure"
    assert tf.field_name == "items"
    assert tf.severity == "warning"
    assert "1 of 3" in tf.evidence


def test_all_items_with_errors_partial_failure() -> None:
    output = {"results": [{"error": "timeout"}, {"error": "not found"}]}
    # "results" matches RESULT_NAME_RE but is non-empty, so partial_failure rule fires
    failures = inspect_tool_outputs(output)
    tf_by_type = {tf.failure_type: tf for tf in failures}
    assert "partial_failure" in tf_by_type


def test_clean_output_no_failures() -> None:
    output = {
        "results": [{"id": 1, "score": 0.9}, {"id": 2, "score": 0.8}],
        "query": "machine learning",
        "count": 2,
    }
    failures = inspect_tool_outputs(output)
    assert failures == []


def test_deduplication_highest_severity_wins() -> None:
    """If multiple rules match the same field, highest severity is kept."""
    # "errors" is an error key AND could match other patterns — critical should win
    failures = inspect_tool_outputs({"errors": "rate limit exceeded"})
    # rate_limit (warning) because _RATE_LIMIT_RE matches
    assert len(failures) == 1
    assert failures[0].failure_type == "rate_limit"


def test_multiple_failures_different_fields() -> None:
    output = {
        "error": "api failed",       # critical error_response
        "results": [],               # warning empty_result
        "status_code": 500,          # critical error_response
    }
    failures = inspect_tool_outputs(output)
    field_names = {tf.field_name for tf in failures}
    assert "error" in field_names
    assert "results" in field_names
    assert "status_code" in field_names
    assert len(failures) == 3


# ── Integration tests: ArgusSession ──────────────────────────────────────────

def _make_session() -> ArgusSession:
    session = ArgusSession()
    session.set_node_names(["tool_caller", "processor"])
    session.set_edges({"tool_caller": ["processor"], "processor": []})
    return session


def test_session_marks_node_fail_on_critical_tool_error() -> None:
    """A node returning {"error": "API down"} should be marked failed."""
    session = _make_session()

    def tool_caller(state: dict[str, Any]) -> dict[str, Any]:
        return {"error": "API down", "results": []}

    def processor(state: dict[str, Any]) -> dict[str, Any]:
        return {"processed": True}

    wrapped_caller = session.wrap("tool_caller", tool_caller)
    session.wrap("processor", processor)

    state: dict[str, Any] = {"query": "test"}
    state = wrapped_caller(state)

    caller_event = session._events[0]
    assert caller_event.status == "fail"
    assert caller_event.inspection is not None
    assert caller_event.inspection.has_tool_failure is True
    tool_failure_types = {tf.failure_type for tf in caller_event.inspection.tool_failures}
    assert "error_response" in tool_failure_types


def test_session_marks_overall_silent_failure() -> None:
    """overall_status should be silent_failure when a critical tool error occurs."""
    session = ArgusSession()
    session.set_node_names(["fetch"])
    session.set_edges({"fetch": []})

    def fetch(state: dict[str, Any]) -> dict[str, Any]:
        return {"error": "connection refused"}

    wrapped = session.wrap("fetch", fetch)
    wrapped({"query": "q"})
    session.finalize()

    assert session._events[0].status == "fail"


def test_session_warning_tool_failure_does_not_set_fail_status() -> None:
    """Warning-only tool failures (empty results) should not set status to 'fail'."""
    session = ArgusSession()
    session.set_node_names(["searcher"])
    session.set_edges({"searcher": []})

    def searcher(state: dict[str, Any]) -> dict[str, Any]:
        return {"results": [], "query": "nothing found"}

    wrapped = session.wrap("searcher", searcher)
    wrapped({"query": "nothing found"})
    session.finalize()

    event = session._events[0]
    # Warning-only: empty_result is severity="warning", not critical
    assert event.status == "pass"
    assert event.inspection is not None
    assert event.inspection.has_tool_failure is False
    assert len(event.inspection.tool_failures) == 1
    assert event.inspection.tool_failures[0].severity == "warning"


def test_session_rate_limit_is_warning_not_fail() -> None:
    """Rate limit (warning severity) should not set status to 'fail'."""
    session = ArgusSession()
    session.set_node_names(["api_node"])
    session.set_edges({"api_node": []})

    def api_node(state: dict[str, Any]) -> dict[str, Any]:
        return {"status_code": 429, "data": []}

    wrapped = session.wrap("api_node", api_node)
    wrapped({})
    session.finalize()

    event = session._events[0]
    assert event.status == "pass"
    assert event.inspection is not None
    assert event.inspection.tool_failures[0].failure_type == "rate_limit"


def test_session_http_500_is_critical_fail() -> None:
    """HTTP 500 in status_code should mark node as fail."""
    session = ArgusSession()
    session.set_node_names(["api_node"])
    session.set_edges({"api_node": []})

    def api_node(state: dict[str, Any]) -> dict[str, Any]:
        return {"status_code": 500, "data": None}

    wrapped = session.wrap("api_node", api_node)
    wrapped({})
    session.finalize()

    event = session._events[0]
    assert event.status == "fail"
    assert event.inspection.has_tool_failure is True

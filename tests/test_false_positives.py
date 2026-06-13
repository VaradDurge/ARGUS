"""False-positive regression suite.

Every pipeline here produces CORRECT output. ARGUS must report all nodes
as 'pass' and overall status as 'clean'. If any of these fail, it means
a detection rule is too aggressive and will hit real users.

No LLM calls — all nodes are deterministic. Runs in <1s.
"""

from __future__ import annotations

import pytest
from typing import TypedDict
from langgraph.graph import StateGraph

from argus import ArgusWatcher


# ── Helpers ──────────────────────────────────────────────────────────────────

def _run_pipeline(graph: StateGraph, initial_state: dict) -> tuple[str, dict[str, str]]:
    """Run a pipeline through ARGUS, return (overall_status, {node: status})."""
    watcher = ArgusWatcher(graph, semantic_judge=False)
    app = graph.compile()
    app.invoke(initial_state)
    # wait for auto-finalize
    if watcher._session and not watcher._session._completed:
        watcher.finalize()

    node_statuses = {}
    overall = "clean"
    if watcher._session:
        for ev in watcher._session._events:
            node_statuses[ev.node_name] = ev.status
            if ev.status != "pass":
                overall = ev.status
    return overall, node_statuses


def _assert_all_pass(overall: str, node_statuses: dict[str, str], pipeline_name: str):
    """Assert every node passed and overall is clean."""
    for node, status in node_statuses.items():
        assert status == "pass", (
            f"[{pipeline_name}] node '{node}' got status '{status}', expected 'pass'. "
            f"This is a false positive — the output was correct."
        )
    assert overall == "clean", (
        f"[{pipeline_name}] overall status '{overall}', expected 'clean'."
    )


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 1: Single-key output (most common LangGraph pattern)
# ═════════════════════════════════════════════════════════════════════════════

class SingleKeyState(TypedDict, total=False):
    raw_text: str
    parsed_items: list[dict]
    summary: str

def _parse(state: SingleKeyState) -> SingleKeyState:
    return {"parsed_items": [
        {"name": "item_a", "value": 42},
        {"name": "item_b", "value": 99},
    ]}

def _summarize_single(state: SingleKeyState) -> SingleKeyState:
    items = state.get("parsed_items", [])
    return {"summary": f"Found {len(items)} items with total value {sum(i['value'] for i in items)}."}

@pytest.mark.unit
def test_single_key_output():
    """Nodes returning a single key (partial state update) must not be flagged."""
    g = StateGraph(SingleKeyState)
    g.add_node("parse", _parse)
    g.add_node("summarize", _summarize_single)
    g.set_entry_point("parse")
    g.add_edge("parse", "summarize")
    g.set_finish_point("summarize")

    overall, statuses = _run_pipeline(g, {"raw_text": "some input data"})
    _assert_all_pass(overall, statuses, "single_key_output")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 2: Short string values (filenames, labels, statuses)
# ═════════════════════════════════════════════════════════════════════════════

class ShortStringsState(TypedDict, total=False):
    input_text: str
    classification: dict
    files: list[dict]

def _classify(state: ShortStringsState) -> ShortStringsState:
    return {"classification": {"label": "positive", "confidence": "high"}}

def _list_files(state: ShortStringsState) -> ShortStringsState:
    return {"files": [
        {"filename": "src/main.py", "language": "python", "status": "modified"},
        {"filename": "README.md", "language": "markdown", "status": "added"},
        {"filename": "tests/test_core.py", "language": "python", "status": "modified"},
    ]}

@pytest.mark.unit
def test_short_string_values():
    """Short strings like filenames, labels, statuses must not be flagged."""
    g = StateGraph(ShortStringsState)
    g.add_node("classify", _classify)
    g.add_node("list_files", _list_files)
    g.set_entry_point("classify")
    g.add_edge("classify", "list_files")
    g.set_finish_point("list_files")

    overall, statuses = _run_pipeline(g, {"input_text": "analyze this code"})
    _assert_all_pass(overall, statuses, "short_string_values")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 3: Large text input, small structured output
# ═════════════════════════════════════════════════════════════════════════════

class LargeInputState(TypedDict, total=False):
    document: str
    entities: list[dict]
    verdict: str

def _extract_entities(state: LargeInputState) -> LargeInputState:
    return {"entities": [
        {"name": "John", "type": "person"},
        {"name": "Acme Corp", "type": "organization"},
        {"name": "New York", "type": "location"},
    ]}

def _verdict(state: LargeInputState) -> LargeInputState:
    entities = state.get("entities", [])
    return {"verdict": f"Found {len(entities)} entities in document."}

@pytest.mark.unit
def test_large_input_small_output():
    """Large input with small structured output must not be flagged."""
    g = StateGraph(LargeInputState)
    g.add_node("extract", _extract_entities)
    g.add_node("verdict", _verdict)
    g.set_entry_point("extract")
    g.add_edge("extract", "verdict")
    g.set_finish_point("verdict")

    # Simulate a large document input
    large_doc = "This is a legal contract between John and Acme Corp in New York. " * 200
    overall, statuses = _run_pipeline(g, {"document": large_doc})
    _assert_all_pass(overall, statuses, "large_input_small_output")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 4: Fan-out / fan-in (parallel branches)
# ═════════════════════════════════════════════════════════════════════════════

class FanOutState(TypedDict, total=False):
    query: str
    web_results: list[str]
    db_results: list[str]
    merged: str

def _search_web(state: FanOutState) -> FanOutState:
    return {"web_results": ["result from google", "result from bing"]}

def _search_db(state: FanOutState) -> FanOutState:
    return {"db_results": ["row from postgres", "row from redis cache"]}

def _merge_results(state: FanOutState) -> FanOutState:
    web = state.get("web_results", [])
    db = state.get("db_results", [])
    return {"merged": f"Combined {len(web)} web + {len(db)} db results."}

@pytest.mark.unit
def test_fan_out_fan_in():
    """Parallel branches merging into one node must not be flagged."""
    g = StateGraph(FanOutState)
    g.add_node("search_web", _search_web)
    g.add_node("search_db", _search_db)
    g.add_node("merge", _merge_results)
    g.set_entry_point("search_web")
    g.add_edge("__start__", "search_db")
    g.add_edge("search_web", "merge")
    g.add_edge("search_db", "merge")
    g.set_finish_point("merge")

    overall, statuses = _run_pipeline(g, {"query": "find user data"})
    _assert_all_pass(overall, statuses, "fan_out_fan_in")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 5: Tool-like output keys (status, result, data, response)
# ═════════════════════════════════════════════════════════════════════════════

class ToolOutputState(TypedDict, total=False):
    request: str
    result: dict
    response: dict

def _call_api(state: ToolOutputState) -> ToolOutputState:
    return {"result": {
        "status": "success",
        "data": {"user_id": "usr_123", "name": "Alice", "email": "alice@example.com"},
        "metadata": {"latency_ms": 45, "cache_hit": False},
    }}

def _format_response(state: ToolOutputState) -> ToolOutputState:
    result = state.get("result", {})
    data = result.get("data", {})
    return {"response": {
        "message": f"User {data.get('name', 'unknown')} found",
        "status_code": 200,
    }}

@pytest.mark.unit
def test_tool_like_output_keys():
    """Outputs with keys like 'result', 'status', 'response' must not be flagged."""
    g = StateGraph(ToolOutputState)
    g.add_node("call_api", _call_api)
    g.add_node("format", _format_response)
    g.set_entry_point("call_api")
    g.add_edge("call_api", "format")
    g.set_finish_point("format")

    overall, statuses = _run_pipeline(g, {"request": "get user usr_123"})
    _assert_all_pass(overall, statuses, "tool_like_output_keys")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 6: Deeply nested output (multi-level JSON)
# ═════════════════════════════════════════════════════════════════════════════

class NestedState(TypedDict, total=False):
    input_data: str
    analysis: dict

def _deep_analysis(state: NestedState) -> NestedState:
    return {"analysis": {
        "sections": [
            {
                "title": "Introduction",
                "paragraphs": [
                    {"text": "This document covers the Q3 results.", "sentiment": "neutral"},
                    {"text": "Revenue exceeded expectations.", "sentiment": "positive"},
                ],
                "metadata": {"word_count": 42, "reading_time_min": 1},
            },
            {
                "title": "Financials",
                "paragraphs": [
                    {"text": "Operating margin improved by 3%.", "sentiment": "positive"},
                ],
                "metadata": {"word_count": 120, "reading_time_min": 3},
            },
        ],
        "overall_sentiment": "positive",
        "confidence": 0.87,
    }}

@pytest.mark.unit
def test_deeply_nested_output():
    """Multi-level nested JSON must not be flagged as malformed."""
    g = StateGraph(NestedState)
    g.add_node("analyze", _deep_analysis)
    g.set_entry_point("analyze")
    g.set_finish_point("analyze")

    overall, statuses = _run_pipeline(g, {"input_data": "Q3 earnings report"})
    _assert_all_pass(overall, statuses, "deeply_nested_output")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 7: Boolean/numeric-heavy output (no long strings)
# ═════════════════════════════════════════════════════════════════════════════

class NumericState(TypedDict, total=False):
    raw_metrics: list[float]
    stats: dict

def _compute_stats(state: NumericState) -> NumericState:
    metrics = state.get("raw_metrics", [])
    return {"stats": {
        "count": len(metrics),
        "mean": sum(metrics) / len(metrics) if metrics else 0,
        "min": min(metrics) if metrics else 0,
        "max": max(metrics) if metrics else 0,
        "above_threshold": sum(1 for m in metrics if m > 50),
        "healthy": all(m < 100 for m in metrics),
    }}

@pytest.mark.unit
def test_numeric_boolean_output():
    """Outputs with mostly numbers/booleans and no long strings must not be flagged."""
    g = StateGraph(NumericState)
    g.add_node("compute", _compute_stats)
    g.set_entry_point("compute")
    g.set_finish_point("compute")

    overall, statuses = _run_pipeline(g, {"raw_metrics": [12.5, 45.0, 78.3, 23.1, 91.0]})
    _assert_all_pass(overall, statuses, "numeric_boolean_output")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 8: Empty list as valid output (e.g., no risks found)
# ═════════════════════════════════════════════════════════════════════════════

class EmptyListState(TypedDict, total=False):
    code: str
    vulnerabilities: list[dict]
    report: dict

def _scan_code(state: EmptyListState) -> EmptyListState:
    # No vulnerabilities found — this is a GOOD result, not a failure
    return {"vulnerabilities": []}

def _build_report(state: EmptyListState) -> EmptyListState:
    vulns = state.get("vulnerabilities", [])
    return {"report": {
        "total_issues": len(vulns),
        "verdict": "clean" if not vulns else "issues_found",
        "scanned_lines": 150,
    }}

@pytest.mark.unit
def test_empty_list_valid_output():
    """An empty list (no vulnerabilities found) is valid and must not be flagged."""
    g = StateGraph(EmptyListState)
    g.add_node("scan", _scan_code)
    g.add_node("report", _build_report)
    g.set_entry_point("scan")
    g.add_edge("scan", "report")
    g.set_finish_point("report")

    overall, statuses = _run_pipeline(g, {"code": "def hello(): return 'world'"})
    _assert_all_pass(overall, statuses, "empty_list_valid_output")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 9: Long pipeline (7+ nodes, each returning 1 key)
# ═════════════════════════════════════════════════════════════════════════════

class LongPipelineState(TypedDict, total=False):
    input: str
    step1: str
    step2: str
    step3: str
    step4: str
    step5: str
    step6: str
    step7: str

def _make_step(n: int):
    def step(state):
        return {f"step{n}": f"Output from step {n}, processing: {state.get('input', '')[:30]}"}
    step.__name__ = f"step_{n}"
    step.__qualname__ = f"step_{n}"
    return step

@pytest.mark.unit
def test_long_linear_pipeline():
    """A 7-node linear pipeline with single-key outputs must not be flagged."""
    g = StateGraph(LongPipelineState)
    for i in range(1, 8):
        g.add_node(f"step_{i}", _make_step(i))

    g.set_entry_point("step_1")
    for i in range(1, 7):
        g.add_edge(f"step_{i}", f"step_{i+1}")
    g.set_finish_point("step_7")

    overall, statuses = _run_pipeline(g, {"input": "test data for long pipeline"})
    _assert_all_pass(overall, statuses, "long_linear_pipeline")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 10: Mixed types — string, list, dict, int, bool in one output
# ═════════════════════════════════════════════════════════════════════════════

class MixedState(TypedDict, total=False):
    query: str
    answer: dict

def _mixed_output(state: MixedState) -> MixedState:
    return {"answer": {
        "text": "The capital of France is Paris.",
        "sources": ["wikipedia", "britannica"],
        "confidence": 0.95,
        "is_factual": True,
        "token_count": 8,
        "metadata": {"model": "gpt-4o", "latency": 230},
    }}

@pytest.mark.unit
def test_mixed_type_output():
    """Output with mixed types (str, list, dict, int, bool) must not be flagged."""
    g = StateGraph(MixedState)
    g.add_node("answer", _mixed_output)
    g.set_entry_point("answer")
    g.set_finish_point("answer")

    overall, statuses = _run_pipeline(g, {"query": "What is the capital of France?"})
    _assert_all_pass(overall, statuses, "mixed_type_output")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 11: ChatBot message accumulation (most common LLM pattern)
# ═════════════════════════════════════════════════════════════════════════════

class ChatState(TypedDict, total=False):
    messages: list[dict]
    summary: str

def _respond(state: ChatState) -> ChatState:
    """Append an assistant reply to the messages list."""
    msgs = state.get("messages", [])
    last_user = msgs[-1]["content"] if msgs else ""
    return {"messages": msgs + [
        {"role": "assistant", "content": f"Here's my response to: {last_user[:50]}"}
    ]}

def _summarize_chat(state: ChatState) -> ChatState:
    msgs = state.get("messages", [])
    return {"summary": f"Conversation with {len(msgs)} messages processed."}

@pytest.mark.unit
def test_chatbot_message_accumulation():
    """ChatBot-style message list accumulation must not be flagged."""
    g = StateGraph(ChatState)
    g.add_node("respond", _respond)
    g.add_node("summarize", _summarize_chat)
    g.set_entry_point("respond")
    g.add_edge("respond", "summarize")
    g.set_finish_point("summarize")

    overall, statuses = _run_pipeline(g, {"messages": [
        {"role": "user", "content": "What's the weather in Tokyo?"},
    ]})
    _assert_all_pass(overall, statuses, "chatbot_message_accumulation")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 12: None as valid output value (e.g., "no error")
# ═════════════════════════════════════════════════════════════════════════════

class NoneFieldState(TypedDict, total=False):
    input_text: str
    result: dict

def _process_with_none(state: NoneFieldState) -> NoneFieldState:
    return {"result": {
        "data": "processed successfully",
        "error": None,
        "warning": None,
        "retry_after": None,
    }}

@pytest.mark.unit
def test_none_as_valid_output():
    """None values in output (meaning 'absent/no-error') must not be flagged."""
    g = StateGraph(NoneFieldState)
    g.add_node("process", _process_with_none)
    g.set_entry_point("process")
    g.set_finish_point("process")

    overall, statuses = _run_pipeline(g, {"input_text": "hello world"})
    _assert_all_pass(overall, statuses, "none_as_valid_output")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 13: Overwrite pattern — node returns same key it received
# ═════════════════════════════════════════════════════════════════════════════

class OverwriteState(TypedDict, total=False):
    text: str
    metadata: dict

def _clean_text(state: OverwriteState) -> OverwriteState:
    """Overwrites the same 'text' key with cleaned version."""
    raw = state.get("text", "")
    return {"text": raw.strip().lower().replace("  ", " ")}

def _add_metadata(state: OverwriteState) -> OverwriteState:
    text = state.get("text", "")
    return {"metadata": {"word_count": len(text.split()), "char_count": len(text)}}

@pytest.mark.unit
def test_overwrite_same_key():
    """Node that overwrites its input key (text → cleaned text) must not be flagged."""
    g = StateGraph(OverwriteState)
    g.add_node("clean", _clean_text)
    g.add_node("meta", _add_metadata)
    g.set_entry_point("clean")
    g.add_edge("clean", "meta")
    g.set_finish_point("meta")

    overall, statuses = _run_pipeline(g, {"text": "  Hello WORLD  this is   a Test  "})
    _assert_all_pass(overall, statuses, "overwrite_same_key")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 14: Conditional routing (node returns routing key)
# ═════════════════════════════════════════════════════════════════════════════

class RoutingState(TypedDict, total=False):
    query: str
    route: str
    answer: str

def _router(state: RoutingState) -> RoutingState:
    q = state.get("query", "").lower()
    if "weather" in q:
        return {"route": "weather"}
    return {"route": "general"}

def _handle_weather(state: RoutingState) -> RoutingState:
    return {"answer": "It's sunny, 25°C."}

def _handle_general(state: RoutingState) -> RoutingState:
    return {"answer": "I can help with general questions."}

def _pick_route(state: RoutingState) -> str:
    return state.get("route", "general")

@pytest.mark.unit
def test_conditional_routing():
    """Conditional edge routing with a short route key must not be flagged."""
    g = StateGraph(RoutingState)
    g.add_node("router", _router)
    g.add_node("weather", _handle_weather)
    g.add_node("general", _handle_general)
    g.set_entry_point("router")
    g.add_conditional_edges("router", _pick_route, {"weather": "weather", "general": "general"})
    g.set_finish_point("weather")
    g.set_finish_point("general")

    overall, statuses = _run_pipeline(g, {"query": "What's the weather today?"})
    _assert_all_pass(overall, statuses, "conditional_routing")


# ═════════════════════════════════════════════════════════════════════════════
# Pattern 15: Raw ArgusSession (non-LangGraph, framework-agnostic)
# ═════════════════════════════════════════════════════════════════════════════

from argus.session import ArgusSession

@pytest.mark.unit
def test_raw_argus_session():
    """ArgusSession used directly (no LangGraph) must work without false positives."""
    session = ArgusSession()

    # Simulate 3 nodes manually
    wrapped_fetch = session.wrap("fetch_data", lambda state: {
        "records": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]
    })
    wrapped_transform = session.wrap("transform", lambda state: {
        "names": ["Alice", "Bob"], "count": 2
    })
    wrapped_output = session.wrap("format_output", lambda state: {
        "response": "Found 2 users: Alice, Bob"
    })

    state: dict = {}
    state.update(wrapped_fetch(state))
    state.update(wrapped_transform(state))
    state.update(wrapped_output(state))
    session.finalize()

    for ev in session._events:
        assert ev.status == "pass", (
            f"[raw_session] node '{ev.node_name}' got status '{ev.status}', expected 'pass'. "
            f"This is a false positive."
        )
    # ArgusSession doesn't expose a .status property — check via events
    all_pass = all(ev.status == "pass" for ev in session._events)
    assert all_pass, "[raw_session] not all nodes passed — false positive detected."

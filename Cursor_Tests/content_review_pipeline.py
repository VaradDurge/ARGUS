"""
Content review pipeline — takes raw user-submitted content,
classifies it, checks for policy violations, rewrites if needed,
and produces a final moderation verdict.

Uses LangGraph for orchestration, OpenAI for LLM calls.
"""

from __future__ import annotations

import json
import os
from typing import Any, TypedDict

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv() -> bool:
        return False

from argus import ArgusWatcher
from langgraph.graph import END, StateGraph
from openai import OpenAI

load_dotenv()

MODEL = "gpt-4o-mini"


class ReviewState(TypedDict, total=False):
    content: str
    category: str
    flags: list[str]
    cleaned_content: str
    verdict: str
    reason: str


def _client() -> OpenAI:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=key)


def _chat(system: str, user: str, *, json_mode: bool = False) -> str:
    kwargs: dict[str, Any] = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 150,
        "temperature": 0,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = _client().chat.completions.create(**kwargs)
    return (resp.choices[0].message.content or "").strip()


# -- nodes --


def classify(state: ReviewState) -> ReviewState:
    """Classify the content into a category."""
    raw = _chat(
        'Classify the following text into one of: product_review, question, complaint, spam. '
        'Reply JSON: {"category": "..."}',
        state.get("content", ""),
        json_mode=True,
    )
    data = json.loads(raw)
    category = data.get("category", "unknown")
    return {**state, "category": category}


def flag_check(state: ReviewState) -> ReviewState:
    """Scan for policy violations."""
    raw = _chat(
        'Check the text for: profanity, personal_info, threats, spam_links. '
        'Reply JSON: {"flags": [...]} — empty list if clean.',
        state.get("content", ""),
        json_mode=True,
    )
    data = json.loads(raw)
    flags = data.get("flags", [])
    return {**state, "flags": flags}


def rewrite(state: ReviewState) -> ReviewState:
    """If flags were raised, rewrite the content to remove violations."""
    flags = state.get("flags", [])
    content = state.get("content", "")

    if not flags:
        return {**state, "cleaned_content": content}

    cleaned = _chat(
        "Rewrite the following text to remove any policy violations "
        "(profanity, personal info, threats, spam links). "
        "Keep the original meaning intact.",
        content,
    )

    # BUG: wrong key — downstream node expects "cleaned_content"
    return {**state, "cleaned_content": cleaned}

    # FIX: uncomment the line below and comment the line above
    #return {**state, "cleand_content": cleaned}


def verdict(state: ReviewState) -> ReviewState:
    """Produce a final moderation decision."""
    cleaned = state.get("cleaned_content", "")
    flags = state.get("flags", [])
    category = state.get("category", "unknown")

    prompt = (
        f"Category: {category}\n"
        f"Flags raised: {', '.join(flags) if flags else 'none'}\n"
        f"Content: {cleaned}\n\n"
        "Decide: approve, reject, or needs_human_review. "
        'Reply JSON: {"verdict": "...", "reason": "..."}'
    )

    raw = _chat(
        "You are a content moderation system. Be concise.",
        prompt,
        json_mode=True,
    )
    data = json.loads(raw)
    return {
        **state,
        "verdict": data.get("verdict", "needs_human_review"),
        "reason": data.get("reason", ""),
    }


# -- graph --


def build_graph() -> StateGraph:
    g = StateGraph(ReviewState)
    g.add_node("classify", classify)
    g.add_node("flag_check", flag_check)
    g.add_node("rewrite", rewrite)
    g.add_node("verdict", verdict)

    g.set_entry_point("classify")
    g.add_edge("classify", "flag_check")
    g.add_edge("flag_check", "rewrite")
    g.add_edge("rewrite", "verdict")
    g.add_edge("verdict", END)
    return g


if __name__ == "__main__":
    sample = (
        "This product is absolute garbage!! I want a refund NOW. "
        "Contact me at john.doe@gmail.com or I'm calling my lawyer."
    )

    print(f"Input: {sample}\n")

    graph = build_graph()
    watcher = ArgusWatcher()
    watcher.watch(graph)
    app = graph.compile()
    result: ReviewState = app.invoke({"content": sample})

    print(f"Category : {result.get('category')}")
    print(f"Flags    : {result.get('flags')}")
    print(f"Verdict  : {result.get('verdict')}")
    print(f"Reason   : {result.get('reason')}")

"""
Semantic validators for the Competitive Intelligence Pipeline.

Each validator is a callable: (output_dict) -> (bool, reason_str)
  True  = output is semantically correct
  False = output fails semantic check → node gets status "semantic_fail"

These are passed to ArgusSession(validators={...}) and represent
developer-defined correctness rules that go beyond structural type checks.
"""
from __future__ import annotations

from typing import Any

# Valid sentiment labels the pipeline accepts
VALID_SENTIMENTS = {"positive", "negative", "neutral"}

# Minimum summary length (characters) to be considered non-trivial
MIN_SUMMARY_LEN = 30

# Relevance score must be a float in [0.0, 1.0]
RELEVANCE_SCORE_MIN = 0.0
RELEVANCE_SCORE_MAX = 1.0

# Quality score threshold for report to be publishable
MIN_QUALITY_SCORE = 0.60


def validate_relevance_scorer(output: dict[str, Any]) -> tuple[bool, str]:
    """Every article must have a relevance_score in [0.0, 1.0]."""
    articles = output.get("articles", [])
    if not articles:
        return False, "relevance_scorer returned no articles"
    for i, article in enumerate(articles):
        score = article.get("relevance_score")
        if score is None:
            return False, f"article[{i}] missing relevance_score"
        if not isinstance(score, (int, float)):
            return False, f"article[{i}] relevance_score is not a number: {score!r}"
        if not (RELEVANCE_SCORE_MIN <= float(score) <= RELEVANCE_SCORE_MAX):
            return (
                False,
                f"article[{i}] relevance_score={score} out of range [0.0, 1.0]",
            )
    return True, "all relevance scores valid"


def validate_summarizer(output: dict[str, Any]) -> tuple[bool, str]:
    """Every article summary must be at least MIN_SUMMARY_LEN characters."""
    articles = output.get("articles", [])
    if not articles:
        return False, "summarizer returned no articles"
    for i, article in enumerate(articles):
        summary = article.get("summary", "")
        if len(summary) < MIN_SUMMARY_LEN:
            return (
                False,
                f"article[{i}] summary too short ({len(summary)} chars, min {MIN_SUMMARY_LEN})",
            )
    return True, "all summaries meet minimum length"


def validate_sentiment_analyzer(output: dict[str, Any]) -> tuple[bool, str]:
    """Every article must have a sentiment label from VALID_SENTIMENTS."""
    articles = output.get("articles", [])
    if not articles:
        return False, "sentiment_analyzer returned no articles"
    for i, article in enumerate(articles):
        sentiment = article.get("sentiment")
        if sentiment not in VALID_SENTIMENTS:
            return (
                False,
                f"article[{i}] sentiment={sentiment!r} not in {VALID_SENTIMENTS}",
            )
    return True, "all sentiment labels valid"


def validate_report_drafter(output: dict[str, Any]) -> tuple[bool, str]:
    """Report draft must be non-empty and at least 100 characters."""
    draft = output.get("report_draft", "")
    if not draft:
        return False, "report_drafter returned empty draft"
    if len(draft) < 100:
        return False, f"report draft too short ({len(draft)} chars, min 100)"
    return True, "report draft meets minimum length"


def validate_quality_assessor(output: dict[str, Any]) -> tuple[bool, str]:
    """Quality score must be a float in [0.0, 1.0]."""
    score = output.get("quality_score")
    if score is None:
        return False, "quality_assessor did not return a quality_score"
    if not isinstance(score, (int, float)):
        return False, f"quality_score is not a number: {score!r}"
    if not (0.0 <= float(score) <= 1.0):
        return False, f"quality_score={score} out of range [0.0, 1.0]"
    return True, f"quality_score={score:.2f} is valid"


def wildcard_validator(output: dict[str, Any]) -> tuple[bool, str]:
    """Applied to every node: output must not contain an 'error' key."""
    if "error" in output:
        return False, f"node set error field: {output['error']}"
    return True, "no error field"


# ── Validator registry (passed to ArgusSession) ───────────────────────────────

VALIDATORS: dict[str, Any] = {
    "*":                  wildcard_validator,
    "relevance_scorer":   validate_relevance_scorer,
    "summarizer":         validate_summarizer,
    "sentiment_analyzer": validate_sentiment_analyzer,
    "report_drafter":     validate_report_drafter,
    "quality_assessor":   validate_quality_assessor,
}

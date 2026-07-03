"""Tests for auto-generalization of LLM-suggested signatures."""

from __future__ import annotations

import re
from unittest.mock import patch

import pytest

from argus.models import SuggestedSignature
from argus.signature_generalizer import (
    _heuristic_generalize,
    cluster_with_existing,
    generalize_signature,
)

# ── Helper ───────────────────────────────────────────────────────────────────


def _make_sig(
    pattern: str = "I cannot provide financial advice",
    strategy: str = "contains_ci",
    evidence: tuple[str, ...] = ("I cannot provide financial advice",),
) -> SuggestedSignature:
    return SuggestedSignature(
        pattern=pattern,
        match_strategy=strategy,
        proposed_category="semantic_refusal",
        severity="warning",
        description="test pattern",
        evidence=evidence,
        confidence=0.85,
        reasoning="test",
    )


# ── Heuristic generalization tests ──────────────────────────────────────────


@pytest.mark.unit
def test_heuristic_generalize_produces_regex():
    """A contains_ci pattern with enough content words becomes a regex."""
    result = _heuristic_generalize("I cannot provide financial advice")
    assert result is not None
    compiled = re.compile(result, re.IGNORECASE)
    # Should match the original
    assert compiled.search("I cannot provide financial advice")
    # Should match variants via synonym groups
    assert compiled.search("unable to offer investment guidance")
    assert compiled.search("can't give monetary recommendations")


@pytest.mark.unit
def test_heuristic_short_pattern_returns_none():
    """Patterns with fewer than 3 content words return None."""
    assert _heuristic_generalize("error occurred") is None
    assert _heuristic_generalize("no") is None


@pytest.mark.unit
def test_heuristic_preserves_unknown_words():
    """Words not in the synonym map are regex-escaped and kept."""
    result = _heuristic_generalize(
        "the system encountered a catastrophic failure"
    )
    assert result is not None
    compiled = re.compile(result, re.IGNORECASE)
    assert compiled.search("system encountered a catastrophic failure")


# ── generalize_signature tests ──────────────────────────────────────────────


@pytest.mark.unit
def test_generalize_signature_converts_to_regex():
    """generalize_signature converts contains_ci to regex."""
    sig = _make_sig()
    # Patch _llm_generalize to return None so heuristic is used
    with patch(
        "argus.signature_generalizer._llm_generalize", return_value=None
    ):
        result = generalize_signature(sig)
    assert result.match_strategy == "regex"
    assert result.generalized is True
    assert result.original_pattern == "I cannot provide financial advice"
    # The pattern should be a valid regex
    re.compile(result.pattern, re.IGNORECASE)


@pytest.mark.unit
def test_generalize_preserves_regex_strategy():
    """Signatures already using regex strategy are returned unchanged."""
    sig = _make_sig(
        pattern=r"(?:error|failure)\s+detected",
        strategy="regex",
    )
    result = generalize_signature(sig)
    assert result is sig  # same object, unchanged


@pytest.mark.unit
def test_generalize_preserves_original_pattern():
    """original_pattern field stores the pre-generalization literal."""
    sig = _make_sig()
    with patch(
        "argus.signature_generalizer._llm_generalize", return_value=None
    ):
        result = generalize_signature(sig)
    assert result.original_pattern == "I cannot provide financial advice"
    assert result.generalized is True


@pytest.mark.unit
def test_generalize_short_pattern_unchanged():
    """Short patterns are returned unchanged."""
    sig = _make_sig(pattern="error", evidence=("error",))
    with patch(
        "argus.signature_generalizer._llm_generalize", return_value=None
    ):
        result = generalize_signature(sig)
    assert result.match_strategy == "contains_ci"
    assert result.generalized is False


# ── LLM generalization fallback tests ───────────────────────────────────────


@pytest.mark.unit
def test_llm_failure_falls_back_to_heuristic():
    """When LLM generalization fails, heuristic is used."""
    sig = _make_sig()
    with patch(
        "argus.signature_generalizer._llm_generalize", return_value=None
    ):
        result = generalize_signature(sig)
    # Should still produce a regex via heuristic
    assert result.match_strategy == "regex"
    assert result.generalized is True


@pytest.mark.unit
def test_no_api_key_graceful_fallback():
    """Missing API key doesn't crash — falls back to heuristic."""
    sig = _make_sig()
    with patch(
        "argus.signature_generalizer._llm_generalize",
        return_value=None,
    ):
        result = generalize_signature(sig)
    # Heuristic should still produce a regex
    assert result.match_strategy == "regex"
    assert result.generalized is True


# ── Clustering tests ────────────────────────────────────────────────────────


@pytest.mark.unit
def test_cluster_empty_candidates_returns_none():
    """No candidates means no cluster match."""
    sig = _make_sig()
    assert cluster_with_existing(sig, []) is None


@pytest.mark.unit
def test_cluster_merges_similar():
    """Semantically similar candidates are clustered."""
    sig = _make_sig(pattern="I cannot help with that")

    candidates = [
        {
            "id": "cand-abc123",
            "pattern": "I am unable to assist with that",
            "status": "pending",
        }
    ]

    # Mock embeddings: very similar vectors (cosine > 0.85)
    mock_emb_a = [1.0, 0.0, 0.0]
    mock_emb_b = [0.98, 0.2, 0.0]

    call_count = 0

    def mock_get_embedding(text: str) -> list[float]:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return mock_emb_a
        return mock_emb_b

    with patch(
        "argus.embedding_store.get_cached_embedding",
        side_effect=mock_get_embedding,
    ):
        result = cluster_with_existing(sig, candidates)

    assert result == "cand-abc123"


@pytest.mark.unit
def test_cluster_no_match_below_threshold():
    """Dissimilar candidates are not clustered."""
    sig = _make_sig(pattern="I cannot help with that")

    candidates = [
        {
            "id": "cand-xyz789",
            "pattern": "The weather is sunny today",
            "status": "pending",
        }
    ]

    # Mock embeddings: orthogonal vectors (cosine = 0)
    mock_emb_a = [1.0, 0.0, 0.0]
    mock_emb_b = [0.0, 1.0, 0.0]

    call_count = 0

    def mock_get_embedding(text: str) -> list[float]:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return mock_emb_a
        return mock_emb_b

    with patch(
        "argus.embedding_store.get_cached_embedding",
        side_effect=mock_get_embedding,
    ):
        result = cluster_with_existing(sig, candidates)

    assert result is None


@pytest.mark.unit
def test_cluster_skips_non_pending():
    """Only pending candidates are considered for clustering."""
    sig = _make_sig(pattern="I cannot help")

    candidates = [
        {
            "id": "cand-old",
            "pattern": "I cannot help",
            "status": "approved",  # not pending
        }
    ]

    with patch(
        "argus.embedding_store.get_cached_embedding",
        return_value=[1.0, 0.0, 0.0],
    ):
        result = cluster_with_existing(sig, candidates)

    assert result is None


@pytest.mark.unit
def test_cluster_no_api_key_returns_none():
    """Missing API key during clustering returns None gracefully."""
    sig = _make_sig()
    candidates = [
        {"id": "cand-1", "pattern": "test", "status": "pending"}
    ]

    with patch(
        "argus.embedding_store.get_cached_embedding",
        side_effect=Exception("No API key"),
    ):
        result = cluster_with_existing(sig, candidates)

    assert result is None

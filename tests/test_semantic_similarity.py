"""Tests for embedding-based semantic similarity matching."""

from __future__ import annotations

import math
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from argus.registry import _dispatch, scan_value

_has_openai_key = bool(os.environ.get("OPENAI_API_KEY"))

# ── Unit tests (no API calls) ───────────────────────────────────────────────


@pytest.mark.unit
def test_dispatch_returns_false_without_pattern_embedding():
    """_dispatch returns False for semantic_similarity sigs without precomputed embedding."""
    sig = {
        "id": "SS-TEST",
        "category": "semantic_refusal",
        "pattern": "test pattern",
        "match_strategy": "semantic_similarity",
        "severity": "warning",
        "description": "test",
        "metadata": {"similarity_threshold": 0.85},
    }
    # No _pattern_embedding set — should return (False, 0.0) gracefully
    matched, confidence = _dispatch(sig, "some text")
    assert matched is False
    assert confidence == 0.0


@pytest.mark.unit
def test_cosine_similarity_identical_vectors():
    """Identical vectors have cosine similarity of 1.0."""
    from argus.embedding_store import cosine_similarity

    vec = [1.0, 2.0, 3.0]
    assert cosine_similarity(vec, vec) == pytest.approx(1.0, abs=1e-6)


@pytest.mark.unit
def test_cosine_similarity_orthogonal_vectors():
    """Orthogonal vectors have cosine similarity of 0.0."""
    from argus.embedding_store import cosine_similarity

    a = [1.0, 0.0, 0.0]
    b = [0.0, 1.0, 0.0]
    assert cosine_similarity(a, b) == pytest.approx(0.0, abs=1e-6)


@pytest.mark.unit
def test_cosine_similarity_opposite_vectors():
    """Opposite vectors have cosine similarity of -1.0."""
    from argus.embedding_store import cosine_similarity

    a = [1.0, 0.0]
    b = [-1.0, 0.0]
    assert cosine_similarity(a, b) == pytest.approx(-1.0, abs=1e-6)


@pytest.mark.unit
def test_cosine_similarity_zero_vector():
    """Zero vector returns 0.0 similarity."""
    from argus.embedding_store import cosine_similarity

    a = [1.0, 2.0]
    b = [0.0, 0.0]
    assert cosine_similarity(a, b) == 0.0


@pytest.mark.unit
def test_cache_roundtrip():
    """Embedding can be stored and retrieved from SQLite cache."""
    from argus.embedding_store import EmbeddingCache

    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_cache.db"
        cache = EmbeddingCache(db_path)
        try:
            vec = [0.1, 0.2, 0.3, 0.4]
            cache.put("hello world", vec)
            result = cache.get("hello world")
            assert result is not None
            for a, b in zip(result, vec):
                assert a == pytest.approx(b, abs=1e-6)
        finally:
            cache.close()


@pytest.mark.unit
def test_cache_miss_returns_none():
    """Cache returns None for uncached text."""
    from argus.embedding_store import EmbeddingCache

    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_cache.db"
        cache = EmbeddingCache(db_path)
        try:
            assert cache.get("nonexistent text") is None
        finally:
            cache.close()


@pytest.mark.unit
def test_custom_threshold_per_signature():
    """Semantic similarity respects per-signature threshold from metadata."""
    sig = {
        "id": "SS-CUSTOM",
        "category": "semantic_refusal",
        "pattern": "test",
        "match_strategy": "semantic_similarity",
        "severity": "warning",
        "description": "test",
        "metadata": {"similarity_threshold": 0.95},
        "_pattern_embedding": [1.0, 0.0, 0.0],
    }

    # Vector with cosine ~0.95 to [1,0,0]
    norm = math.sqrt(0.95**2 + 0.31**2)
    mock_vec = [0.95 / norm, 0.31 / norm, 0.0]

    with patch("argus.embedding_store.get_cached_embedding", return_value=mock_vec):
        from argus.registry import _match_semantic_similarity

        sig["metadata"]["similarity_threshold"] = 0.99
        matched, score = _match_semantic_similarity(sig, "any text")
        assert matched is False

        sig["metadata"]["similarity_threshold"] = 0.80
        matched, score = _match_semantic_similarity(sig, "any text")
        assert matched is True
        assert score > 0.80


# ── Integration tests (require OpenAI API key) ──────────────────────────────


@pytest.mark.integration
@pytest.mark.skipif(not _has_openai_key, reason="OPENAI_API_KEY not set")
def test_semantic_match_above_threshold():
    """A paraphrase of a known pattern triggers a semantic match."""
    import argus.registry as reg

    reg._PATTERN_EMBEDDINGS_READY = False

    sig = {
        "id": "SS-INT-001",
        "category": "semantic_refusal",
        "pattern": "I'm sorry, but I cannot assist with that request",
        "match_strategy": "semantic_similarity",
        "severity": "critical",
        "description": "LLM refusal response",
        "source": "test",
        "metadata": {"similarity_threshold": 0.70},
    }

    matches = scan_value(
        "I apologize, but I'm not able to help with that particular request",
        registry=[sig],
    )
    assert len(matches) >= 1
    assert matches[0].sig_id == "SS-INT-001"
    assert "cosine=" in matches[0].evidence


@pytest.mark.integration
@pytest.mark.skipif(not _has_openai_key, reason="OPENAI_API_KEY not set")
def test_semantic_no_match_below_threshold():
    """Unrelated text does not trigger a semantic match."""
    import argus.registry as reg

    reg._PATTERN_EMBEDDINGS_READY = False

    sig = {
        "id": "SS-INT-002",
        "category": "semantic_refusal",
        "pattern": "I cannot provide financial advice",
        "match_strategy": "semantic_similarity",
        "severity": "warning",
        "description": "Financial disclaimer",
        "source": "test",
        "metadata": {"similarity_threshold": 0.75},
    }

    matches = scan_value(
        "The weather in Tokyo is sunny with a high of 28 degrees Celsius",
        registry=[sig],
    )
    assert len(matches) == 0


@pytest.mark.integration
@pytest.mark.skipif(not _has_openai_key, reason="OPENAI_API_KEY not set")
def test_scan_value_end_to_end_with_mixed_strategies():
    """scan_value works with a registry containing both lexical and semantic sigs."""
    import argus.registry as reg

    reg._PATTERN_EMBEDDINGS_READY = False

    registry = [
        {
            "id": "PH-TEST",
            "category": "placeholder_outputs",
            "pattern": "TODO",
            "match_strategy": "contains_ci",
            "severity": "warning",
            "description": "Placeholder TODO marker",
            "source": "test",
            "metadata": {},
        },
        {
            "id": "SS-TEST",
            "category": "semantic_refusal",
            "pattern": "I'm sorry, but I cannot help with that",
            "match_strategy": "semantic_similarity",
            "severity": "warning",
            "description": "LLM refusal",
            "source": "test",
            "metadata": {"similarity_threshold": 0.80},
        },
    ]

    matches = scan_value("TODO: implement this function", registry=registry)
    assert any(m.sig_id == "PH-TEST" for m in matches)
    assert not any(m.sig_id == "SS-TEST" for m in matches)

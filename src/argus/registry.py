from __future__ import annotations

import importlib.resources
import json
import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SignatureMatch:
    """A single registry signature hit on a field value."""

    sig_id: str
    category: str
    severity: str
    description: str
    evidence: str  # short snippet showing what matched


# ── Singleton registry load ───────────────────────────────────────────────────

def _load_registry() -> list[dict[str, Any]]:
    """Load signatures.json from the package data directory.

    Uses importlib.resources.files() for correct path resolution from both
    editable installs and built wheels. Regex patterns are pre-compiled at
    load time so they are not recompiled on every scan call.

    Also loads `.argus/custom_signatures.json` if it exists, appending
    user-approved learned patterns to the registry.
    """
    ref = importlib.resources.files("argus").joinpath("data/signatures.json")
    data: dict[str, Any] = json.loads(ref.read_text(encoding="utf-8"))
    sigs: list[dict[str, Any]] = data["signatures"]
    for sig in sigs:
        if sig["match_strategy"] == "regex":
            sig["_compiled"] = re.compile(sig["pattern"], re.IGNORECASE)

    # Append custom (learned, private) signatures if present
    from pathlib import Path  # noqa: PLC0415

    custom_path = Path(".argus/custom_signatures.json")
    if custom_path.exists():
        try:
            custom_data = json.loads(custom_path.read_text(encoding="utf-8"))
            for sig in custom_data.get("signatures", []):
                if sig.get("match_strategy") == "regex" and sig.get("pattern"):
                    sig["_compiled"] = re.compile(sig["pattern"], re.IGNORECASE)
                sigs.append(sig)
        except Exception:
            pass  # malformed file — skip silently

    # Append shared (community) signatures from Supabase if logged in.
    # Uses a cached local copy to avoid blocking on network calls.
    shared_cache = Path(".argus/shared_signatures_cache.json")
    if shared_cache.exists():
        try:
            shared_data = json.loads(
                shared_cache.read_text(encoding="utf-8"),
            )
            seen_patterns = {
                (s.get("pattern"), s.get("match_strategy")) for s in sigs
            }
            for sig in shared_data:
                key = (sig.get("pattern"), sig.get("match_strategy"))
                if key in seen_patterns:
                    continue  # skip duplicates
                if sig.get("match_strategy") == "regex" and sig.get("pattern"):
                    sig["_compiled"] = re.compile(
                        sig["pattern"], re.IGNORECASE,
                    )
                sigs.append(sig)
                seen_patterns.add(key)
        except Exception:
            pass

    return sigs


_REGISTRY: list[dict[str, Any]] = _load_registry()


def get_registry() -> list[dict[str, Any]]:
    """Return the cached flat list of signature dicts."""
    return _REGISTRY


def reload_registry() -> None:
    """Reload the registry from disk, picking up newly approved signatures."""
    global _REGISTRY  # noqa: PLW0603
    _REGISTRY = _load_registry()


def sync_shared_signatures() -> int:
    """Pull shared signatures from Supabase and cache locally.

    Returns the number of shared signatures cached. Runs synchronously
    — call from a background thread if needed.
    """
    from pathlib import Path  # noqa: PLC0415

    try:
        from argus.cloud import pull_shared_signatures  # noqa: PLC0415
        sigs = pull_shared_signatures()
    except Exception:
        return 0

    if not sigs:
        return 0

    cache_path = Path(".argus/shared_signatures_cache.json")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(sigs, indent=2), encoding="utf-8")
    reload_registry()
    return len(sigs)


# ── Matchers ──────────────────────────────────────────────────────────────────

def _match_exact_ci(pattern: str, value: str) -> bool:
    """True if the stripped, lowercased value equals the lowercased pattern."""
    return value.strip().lower() == pattern.lower()


def _match_contains_ci(pattern: str, value: str) -> bool:
    """True if pattern appears anywhere inside value (case-insensitive)."""
    return pattern.lower() in value.lower()


def _match_regex(sig: dict[str, Any], value: str) -> bool:
    """True if the pre-compiled regex matches anywhere in value."""
    compiled: re.Pattern[str] = sig["_compiled"]
    return bool(compiled.search(value))


def _match_prefix_ci(pattern: str, value: str) -> bool:
    """True if value starts with pattern (case-insensitive)."""
    return value.lower().startswith(pattern.lower())


_STOP_WORDS = frozenset({
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "it", "its",
    "this", "that", "these", "those", "i", "we", "you", "he", "she",
    "they", "them", "their", "my", "our", "your", "his", "her", "as",
    "if", "not", "no", "so", "up", "out", "about", "into", "than",
    "also", "which", "who", "what", "when", "where", "how", "all",
    "each", "every", "both", "more", "most", "other", "some", "such",
})


def _match_repetition(value: str, threshold: int = 3) -> bool:
    """True if non-trivial ngram repetition indicates filler content.

    Only counts bigrams and trigrams — unigrams are too noisy (common
    words like "the", "and", "stocks" always repeat in normal prose).

    Uses a length-scaled threshold: longer texts need proportionally more
    repetition to trigger, preventing false positives on substantive
    multi-paragraph content. The threshold scales as:
      effective_threshold = max(base, token_count // 25)

    This means a 200-word text needs 8+ repetitions of the same bigram,
    while a 30-word text still triggers at 3.
    """
    tokens = value.lower().split()

    # Short-string unigram check: 3–7 tokens where one non-stop token dominates
    # Catches "N/A N/A N/A N/A", "loading loading loading", etc.
    if 3 <= len(tokens) < 8:
        non_stop = [t for t in tokens if t not in _STOP_WORDS]
        if len(non_stop) >= 3:
            top_count = max(non_stop.count(t) for t in set(non_stop))
            if top_count / len(non_stop) >= 0.75:
                return True
        return False

    # Scale threshold with text length
    effective_threshold = max(threshold, len(tokens) // 25)

    counts: dict[str, int] = {}
    for n in (2, 3):  # bigrams and trigrams only
        for i in range(len(tokens) - n + 1):
            gram_tokens = tokens[i : i + n]
            # Skip ngrams composed entirely of stop words
            if all(t in _STOP_WORDS for t in gram_tokens):
                continue
            gram = " ".join(gram_tokens)
            counts[gram] = counts.get(gram, 0) + 1
    return max(counts.values(), default=0) >= effective_threshold


# Strategy dispatch — avoids if/elif chain; each entry is a callable that
# receives (sig, value) but exact_ci / contains_ci / prefix_ci only need
# (pattern, value), so we wrap them below.
def _dispatch(sig: dict[str, Any], value: str) -> bool:
    strategy = sig["match_strategy"]
    if strategy == "regex":
        return _match_regex(sig, value)
    if strategy == "repetition":
        return _match_repetition(value)
    pattern: str = sig["pattern"]
    if strategy == "exact_ci":
        return _match_exact_ci(pattern, value)
    if strategy == "contains_ci":
        return _match_contains_ci(pattern, value)
    if strategy == "prefix_ci":
        return _match_prefix_ci(pattern, value)
    return False


# ── Scanner ───────────────────────────────────────────────────────────────────

def scan_value(
    value: str,
    registry: list[dict[str, Any]] | None = None,
) -> list[SignatureMatch]:
    """Run all registry signatures against a single string value.

    Collects all warning-severity matches. Short-circuits after the first
    critical match to avoid noise — once a critical hit is found on a field,
    additional signals are redundant.

    Returns an empty list if no signatures match.
    """
    sigs = registry if registry is not None else _REGISTRY
    matches: list[SignatureMatch] = []
    for sig in sigs:
        if not _dispatch(sig, value):
            continue
        # Build a compact evidence snippet
        snippet = value[:80].replace("\n", "\\n")
        match = SignatureMatch(
            sig_id=sig["id"],
            category=sig["category"],
            severity=sig["severity"],
            description=sig["description"],
            evidence=repr(snippet) if len(snippet) < len(value) else repr(value[:80]),
        )
        if sig["severity"] == "critical":
            # Return immediately — critical hit dominates
            return [match]
        matches.append(match)
    return matches


def scan_output_dict(
    output_dict: dict[str, Any],
    registry: list[dict[str, Any]] | None = None,
) -> list[tuple[str, SignatureMatch]]:
    """Scan string-typed values in output_dict through the signature registry.

    Also scans string items inside list values, using "key[i]" field naming.
    Skips non-string, non-list values — dict values are handled by the existing
    Rule 6 nested-dict scan in inspector.py and are not re-scanned here.

    Returns a flat list of (field_name, SignatureMatch) pairs.
    """
    sigs = registry if registry is not None else _REGISTRY
    results: list[tuple[str, SignatureMatch]] = []

    for key, value in output_dict.items():
        if isinstance(value, str):
            for match in scan_value(value, sigs):
                results.append((key, match))
        elif isinstance(value, list):
            for i, item in enumerate(value):
                if isinstance(item, str):
                    for match in scan_value(item, sigs):
                        results.append((f"{key}[{i}]", match))

    return results

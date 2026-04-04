"""
State TypedDicts for the Competitive Intelligence Pipeline.

Each TypedDict defines what a specific agent expects to receive in the
accumulated state dict. ARGUS reads these annotations via type introspection
to detect missing/empty/mismatched fields before the next agent runs.

Required fields  → ARGUS raises silent_failure if absent
Optional fields  → ARGUS raises a warning if absent (won't block)
"""
from __future__ import annotations

from typing import Any, Optional
from typing import TypedDict


# ── Phase 1: Ingestion ────────────────────────────────────────────────────────

class InputValidatorState(TypedDict):
    """What input_validator receives — the raw user query."""
    raw_query: str


class QueryExpanderState(TypedDict):
    """What query_expander receives — validated query."""
    query: str
    validated: bool


class WebSearcherState(TypedDict):
    """What web_searcher receives — expanded queries to search."""
    query: str
    expanded_queries: list


# ── Phase 2: Content Acquisition ─────────────────────────────────────────────

class ContentFetcherState(TypedDict):
    """What content_fetcher receives.

    result_urls is REQUIRED. If web_searcher omits it, ARGUS catches
    the silent failure at the web_searcher → content_fetcher boundary.
    """
    query: str
    result_urls: list       # required — triggers silent failure if missing
    snippets: list          # required


class LanguageScreenerState(TypedDict):
    """What language_screener receives — raw fetched articles."""
    query: str
    articles: list          # required — list of {url, title, body, language}


class DedupFilterState(TypedDict):
    """What dedup_filter receives — language-screened articles."""
    query: str
    articles: list          # required
    screened_count: int     # required


# ── Phase 3: Analysis ─────────────────────────────────────────────────────────

class RelevanceScorerState(TypedDict):
    """What relevance_scorer receives — deduplicated articles."""
    query: str
    articles: list          # required
    dedup_count: int        # required


class ContentCleanerState(TypedDict):
    """What content_cleaner receives — articles with relevance scores."""
    query: str
    articles: list          # required — each article must have "relevance_score"
    scored_count: int       # required


class SummarizerState(TypedDict):
    """What summarizer receives — cleaned articles."""
    query: str
    articles: list          # required — each article must have "cleaned_body"
    cleaned_count: int      # required


class SentimentAnalyzerState(TypedDict):
    """What sentiment_analyzer receives — summarized articles."""
    query: str
    articles: list          # required — each article must have "summary"


class EntityExtractorState(TypedDict):
    """What entity_extractor receives — articles with sentiment."""
    query: str
    articles: list          # required — each article must have "sentiment"
    overall_sentiment: Optional[str]  # optional


# ── Phase 4: Synthesis ────────────────────────────────────────────────────────

class InsightGeneratorState(TypedDict):
    """What insight_generator receives — enriched articles with entities."""
    query: str
    articles: list          # required
    entities: dict          # required — {companies, people, dates}


class ReportDrafterState(TypedDict):
    """What report_drafter receives — insights ready for report."""
    query: str
    insights: list          # required
    entities: dict          # required
    draft_version: int      # required — incremented on each revision cycle


class QualityAssessorState(TypedDict):
    """What quality_assessor receives — a drafted report."""
    query: str
    report_draft: str       # required
    draft_version: int      # required


# ── Phase 5: Output ───────────────────────────────────────────────────────────

class ReportPublisherState(TypedDict):
    """What report_publisher receives — quality-approved report."""
    query: str
    report_draft: str       # required
    quality_score: float    # required
    draft_version: int      # required
    entities: dict          # required
    insights: list          # required


# ── Pipeline input ────────────────────────────────────────────────────────────

INITIAL_STATE: dict[str, Any] = {
    "raw_query": "OpenAI competitive landscape 2025",
}

"""
15-agent Competitive Intelligence Pipeline.

Simulates a real-world pipeline that takes a query, searches the web,
fetches and analyzes content, and produces a structured intelligence report.

All agents are pure Python functions. LLM/API calls are simulated with
realistic mock data. This keeps the demo runnable without API keys while
still exercising every ARGUS feature.

Agent map:
  Phase 1 — Ingestion       : input_validator, query_expander, web_searcher
  Phase 2 — Acquisition     : content_fetcher, language_screener, dedup_filter
  Phase 3 — Analysis        : relevance_scorer, content_cleaner, summarizer,
                               sentiment_analyzer, entity_extractor
  Phase 4 — Synthesis       : insight_generator, report_drafter, quality_assessor
  Phase 5 — Output          : report_publisher
"""
from __future__ import annotations

import random
import textwrap
import time
from typing import Any

from ultimatum.state import (
    ContentCleanerState,
    ContentFetcherState,
    DedupFilterState,
    EntityExtractorState,
    InputValidatorState,
    InsightGeneratorState,
    LanguageScreenerState,
    QualityAssessorState,
    QueryExpanderState,
    RelevanceScorerState,
    ReportDrafterState,
    ReportPublisherState,
    SentimentAnalyzerState,
    SummarizerState,
    WebSearcherState,
)

# ── Mock data ─────────────────────────────────────────────────────────────────

_MOCK_URLS = [
    "https://techcrunch.com/2025/openai-landscape",
    "https://bloomberg.com/2025/ai-competition",
    "https://reuters.com/technology/openai-rivals",
    "https://wsj.com/tech/ai-startups-2025",
    "https://ft.com/openai-funding-2025",
    "https://wired.com/ai-wars-2025",
]

_MOCK_BODIES = [
    (
        "OpenAI continues to lead in large language models while Anthropic, Google DeepMind, "
        "and Meta AI push competitive alternatives. The market has seen a 340% increase in "
        "enterprise AI adoption since GPT-4 launch. OpenAI revenue crossed $3.4B ARR in Q1 2025."
    ),
    (
        "Anthropic's Claude 3.5 series has captured significant market share from OpenAI in "
        "the enterprise segment. Safety-focused positioning resonates with regulated industries. "
        "Funding round of $2.75B closed at $18B valuation in March 2025."
    ),
    (
        "Google's Gemini Ultra now matches GPT-4o on most benchmarks. Integration with Google "
        "Workspace gives it an unmatched distribution advantage. 1.5M developers actively using "
        "Gemini API as of April 2025."
    ),
    (
        "Meta's Llama 3 open-source release disrupted the market by enabling self-hosted "
        "alternatives. Enterprise players now negotiate harder on pricing with OpenAI citing "
        "viable open-source alternatives."
    ),
    (
        "Mistral AI, Cohere, and AI21 Labs continue to carve out domain-specific niches. "
        "Specialized models for code, legal, and medical verticals outperform general models "
        "on domain benchmarks by 15-30%."
    ),
    (
        "OpenAI announced GPT-5 preview access for select enterprise customers. Early benchmarks "
        "show significant reasoning improvements. Pricing expected to remain flat due to "
        "competitive pressure from Anthropic and Google."
    ),
]

_MOCK_TITLES = [
    "OpenAI's Competitive Moat Is Shrinking",
    "Anthropic Closes $2.75B at $18B Valuation",
    "Google Gemini: The Quiet Threat to OpenAI",
    "How Meta's Llama Changed the AI Pricing Game",
    "Domain Specialists Are Beating Generalist LLMs",
    "GPT-5 Preview: First Impressions from Enterprise Pilots",
]

_MOCK_INSIGHTS = [
    "Market leadership is shifting from single-player dominance to multi-player competition",
    "Enterprise procurement increasingly uses open-source as a negotiating lever",
    "Safety positioning (Anthropic) and distribution moats (Google) are emerging as "
    "primary competitive differentiators vs OpenAI's first-mover advantage",
    "Pricing pressure will compress AI margins by an estimated 30-40% through 2026",
    "Domain-specific fine-tuned models are carving defensible niches general models cannot easily enter",
]


# ── Phase 1: Ingestion ────────────────────────────────────────────────────────

def input_validator(state: InputValidatorState) -> dict[str, Any]:
    """Validate and normalize the raw user query."""
    raw = state["raw_query"].strip()
    if not raw:
        raise ValueError("Query cannot be empty")
    return {
        "query": raw,
        "query_length": len(raw),
        "validated": True,
    }


def query_expander(state: QueryExpanderState) -> dict[str, Any]:
    """Expand the query into multiple search angles for broader coverage."""
    q = state["query"]
    expansions = [
        q,
        f"{q} market share 2025",
        f"{q} funding valuation",
        f"{q} product comparison",
        f"{q} enterprise adoption",
    ]
    return {"expanded_queries": expansions}


def web_searcher(state: WebSearcherState) -> dict[str, Any]:
    """Simulate a web search — returns result URLs and preview snippets."""
    n = min(len(state["expanded_queries"]), len(_MOCK_URLS))
    selected = random.sample(range(len(_MOCK_URLS)), k=n)
    result_urls = [_MOCK_URLS[i] for i in selected]
    snippets = [_MOCK_BODIES[i][:120] + "..." for i in selected]
    return {
        "result_urls": result_urls,
        "snippets": snippets,
        "search_result_count": len(result_urls),
    }


# ── Phase 2: Content Acquisition ──────────────────────────────────────────────

def content_fetcher(state: ContentFetcherState) -> dict[str, Any]:
    """Fetch full article content from each result URL."""
    urls = state["result_urls"]
    articles = []
    for url in urls:
        idx = _MOCK_URLS.index(url) if url in _MOCK_URLS else 0
        articles.append({
            "url": url,
            "title": _MOCK_TITLES[idx],
            "body": _MOCK_BODIES[idx],
            "language": "en",
            "fetch_status": 200,
        })
    return {"articles": articles, "fetched_count": len(articles)}


def language_screener(state: LanguageScreenerState) -> dict[str, Any]:
    """Filter articles to English-only content."""
    english = [a for a in state["articles"] if a.get("language") == "en"]
    return {
        "articles": english,
        "screened_count": len(english),
        "dropped_languages": len(state["articles"]) - len(english),
    }


def dedup_filter(state: DedupFilterState) -> dict[str, Any]:
    """Remove near-duplicate articles based on title similarity."""
    seen_titles: set[str] = set()
    unique = []
    for article in state["articles"]:
        key = article.get("title", "")[:40].lower()
        if key not in seen_titles:
            seen_titles.add(key)
            unique.append(article)
    return {
        "articles": unique,
        "dedup_count": len(unique),
        "duplicates_removed": len(state["articles"]) - len(unique),
    }


# ── Phase 3: Analysis ─────────────────────────────────────────────────────────

def relevance_scorer(state: RelevanceScorerState) -> dict[str, Any]:
    """Score each article's relevance to the query (0.0 – 1.0).

    Semantic validator checks scores are in [0.0, 1.0].
    The broken variant in run_semantic_fail.py returns scores > 1.0.
    """
    query_words = set(state["query"].lower().split())
    scored = []
    for article in state["articles"]:
        body_words = set(article.get("body", "").lower().split())
        overlap = len(query_words & body_words)
        score = min(1.0, round(overlap / max(len(query_words), 1) * 1.4, 3))
        scored.append({**article, "relevance_score": score})
    return {
        "articles": scored,
        "scored_count": len(scored),
        "avg_relevance": round(sum(a["relevance_score"] for a in scored) / max(len(scored), 1), 3),
    }


def content_cleaner(state: ContentCleanerState) -> dict[str, Any]:
    """Normalize and clean article text for downstream analysis."""
    cleaned = []
    for article in state["articles"]:
        body = article.get("body", "")
        # Normalize whitespace, strip trailing periods, lowercase sentences
        body_clean = " ".join(body.split())
        cleaned.append({**article, "cleaned_body": body_clean, "word_count": len(body_clean.split())})
    return {"articles": cleaned, "cleaned_count": len(cleaned)}


def summarizer(state: SummarizerState) -> dict[str, Any]:
    """Produce a concise summary for each article.

    Semantic validator checks summary length >= 30 characters.
    """
    summarized = []
    for article in state["articles"]:
        body = article.get("cleaned_body", article.get("body", ""))
        # Simulate summarization: take first 2 sentences (mock)
        sentences = body.replace(". ", ".|").split("|")
        summary = ". ".join(s.strip() for s in sentences[:2] if s.strip())
        if not summary:
            summary = body[:200]
        summarized.append({**article, "summary": summary})
    return {"articles": summarized, "summarized_count": len(summarized)}


def sentiment_analyzer(state: SentimentAnalyzerState) -> dict[str, Any]:
    """Classify each article's sentiment as positive/negative/neutral.

    Semantic validator checks labels are in {positive, negative, neutral}.
    The broken variant in run_semantic_fail.py returns 'mixed' (invalid).
    """
    _positive_words = {"lead", "growth", "revenue", "closed", "integration", "captures"}
    _negative_words = {"shrinking", "disrupt", "pressure", "compress", "declining"}

    tagged = []
    overall_scores = []
    for article in state["articles"]:
        words = set(article.get("summary", "").lower().split())
        pos = len(words & _positive_words)
        neg = len(words & _negative_words)
        if pos > neg:
            sentiment = "positive"
            score = 0.3 + random.uniform(0.2, 0.5)
        elif neg > pos:
            sentiment = "negative"
            score = -(0.3 + random.uniform(0.2, 0.5))
        else:
            sentiment = "neutral"
            score = random.uniform(-0.15, 0.15)
        overall_scores.append(score)
        tagged.append({**article, "sentiment": sentiment, "sentiment_score": round(score, 3)})

    avg_score = sum(overall_scores) / max(len(overall_scores), 1)
    if avg_score > 0.1:
        overall_sentiment = "positive"
    elif avg_score < -0.1:
        overall_sentiment = "negative"
    else:
        overall_sentiment = "neutral"

    return {
        "articles": tagged,
        "overall_sentiment": overall_sentiment,
        "sentiment_distribution": {
            "positive": sum(1 for a in tagged if a["sentiment"] == "positive"),
            "negative": sum(1 for a in tagged if a["sentiment"] == "negative"),
            "neutral":  sum(1 for a in tagged if a["sentiment"] == "neutral"),
        },
    }


def entity_extractor(state: EntityExtractorState) -> dict[str, Any]:
    """Extract named entities: companies, people, and dates across all articles."""
    _companies = {
        "openai", "anthropic", "google", "meta", "mistral", "cohere", "ai21"
    }
    _people = {"sam altman", "dario amodei", "sundar pichai", "mark zuckerberg"}
    _date_patterns = {"2025", "q1 2025", "q2 2025", "march 2025", "april 2025"}

    found_companies: set[str] = set()
    found_people: set[str] = set()
    found_dates: set[str] = set()

    for article in state["articles"]:
        text = (article.get("summary", "") + " " + article.get("body", "")).lower()
        found_companies.update(c for c in _companies if c in text)
        found_people.update(p for p in _people if p in text)
        found_dates.update(d for d in _date_patterns if d in text)

    entities = {
        "companies": sorted(found_companies),
        "people":    sorted(found_people),
        "dates":     sorted(found_dates),
    }
    return {
        "entities": entities,
        "entity_count": sum(len(v) for v in entities.values()),
    }


# ── Phase 4: Synthesis ────────────────────────────────────────────────────────

def insight_generator(state: InsightGeneratorState) -> dict[str, Any]:
    """Generate strategic insights by combining entities and article sentiments."""
    entities = state["entities"]
    articles = state["articles"]

    # Select insights based on what entities were found
    relevant = []
    companies = set(entities.get("companies", []))
    if "anthropic" in companies or "google" in companies:
        relevant.append(_MOCK_INSIGHTS[0])
        relevant.append(_MOCK_INSIGHTS[2])
    if "meta" in companies:
        relevant.append(_MOCK_INSIGHTS[1])
    if len(companies) > 3:
        relevant.append(_MOCK_INSIGHTS[3])
    relevant.append(_MOCK_INSIGHTS[4])

    # Deduplicate
    insights = list(dict.fromkeys(relevant))

    return {
        "insights": insights,
        "insight_count": len(insights),
    }


def report_drafter(state: ReportDrafterState) -> dict[str, Any]:
    """Synthesize all analysis into a structured intelligence report.

    In the human interrupt scenario, this node raises GraphInterrupt
    to pause for human editorial review before publishing.

    Semantic validator checks report length >= 100 characters.
    """
    version = state.get("draft_version", 1)
    insights = state.get("insights", [])
    entities = state.get("entities", {})
    query = state.get("query", "")

    companies_str = ", ".join(entities.get("companies", [])[:5]).title()
    insights_block = "\n".join(f"  • {ins}" for ins in insights)

    report = textwrap.dedent(f"""
        COMPETITIVE INTELLIGENCE REPORT (v{version})
        Query: {query}
        ════════════════════════════════════════

        KEY PLAYERS IDENTIFIED
        {companies_str}

        STRATEGIC INSIGHTS
        {insights_block}

        SENTIMENT OVERVIEW
        The overall market sentiment reflects an industry in active transition,
        with incumbent advantages being eroded by well-funded challengers.

        RECOMMENDATION
        Monitor Anthropic and Google Gemini adoption quarterly.
        Track open-source LLM enterprise adoption as a leading indicator
        of pricing power shifts affecting all closed-model providers.
    """).strip()

    return {
        "report_draft": report,
        "draft_version": version,
        "word_count": len(report.split()),
    }


def quality_assessor(state: QualityAssessorState) -> dict[str, Any]:
    """Assess the quality of the report draft on a 0.0 – 1.0 scale.

    This is the CYCLE node: if quality_score < 0.70, the pipeline loops
    back to report_drafter for a revision. ARGUS detects the back-edge
    in the edge map and sets is_cyclic=True on the session.

    Semantic validator checks score is in [0.0, 1.0].
    """
    draft = state.get("report_draft", "")
    version = state.get("draft_version", 1)

    # Quality improves with each revision (simulated)
    base_score = 0.55 + (version - 1) * 0.18
    word_bonus = min(0.15, len(draft.split()) / 500)
    quality_score = min(1.0, round(base_score + word_bonus, 3))

    needs_revision = quality_score < 0.70

    return {
        "quality_score": quality_score,
        "needs_revision": needs_revision,
        "quality_notes": (
            f"v{version} score {quality_score:.2f} — "
            + ("revision required" if needs_revision else "approved for publication")
        ),
    }


# ── Phase 5: Output ───────────────────────────────────────────────────────────

def report_publisher(state: ReportPublisherState) -> dict[str, Any]:
    """Format and publish the final intelligence report."""
    draft = state["report_draft"]
    score = state["quality_score"]
    version = state["draft_version"]
    entities = state["entities"]

    published_report = (
        f"{'═' * 60}\n"
        f"  PUBLISHED: Competitive Intelligence Report\n"
        f"  Quality Score : {score:.0%}\n"
        f"  Draft Version : v{version}\n"
        f"  Companies     : {', '.join(entities.get('companies', [])[:4]).title()}\n"
        f"{'═' * 60}\n\n"
        + draft
        + f"\n\n{'─' * 60}\n"
        f"  END OF REPORT\n"
        f"{'─' * 60}"
    )

    return {
        "published_report": published_report,
        "publish_status": "success",
        "character_count": len(published_report),
    }


# ── Broken variants (used by scenario scripts) ────────────────────────────────

def web_searcher_broken(state: WebSearcherState) -> dict[str, Any]:
    """Silent-fail variant: omits result_urls.

    content_fetcher requires result_urls (ContentFetcherState).
    ARGUS detects this missing required field at the
    web_searcher → content_fetcher boundary and marks
    web_searcher as status='fail' (silent_failure).
    """
    n = min(len(state["expanded_queries"]), len(_MOCK_URLS))
    selected = random.sample(range(len(_MOCK_URLS)), k=n)
    snippets = [_MOCK_BODIES[i][:120] + "..." for i in selected]
    return {
        # result_urls intentionally omitted → silent failure
        "snippets": snippets,
        "search_result_count": len(snippets),
    }


def relevance_scorer_broken(state: RelevanceScorerState) -> dict[str, Any]:
    """Semantic-fail variant: returns scores > 1.0.

    validate_relevance_scorer() checks score in [0.0, 1.0].
    ARGUS marks relevance_scorer as status='semantic_fail'.
    """
    scored = []
    for article in state["articles"]:
        score = round(random.uniform(1.2, 2.5), 3)   # intentionally out of range
        scored.append({**article, "relevance_score": score})
    return {
        "articles": scored,
        "scored_count": len(scored),
        "avg_relevance": round(sum(a["relevance_score"] for a in scored) / max(len(scored), 1), 3),
    }


def sentiment_analyzer_broken(state: SentimentAnalyzerState) -> dict[str, Any]:
    """Semantic-fail variant: returns invalid sentiment label 'mixed'.

    validate_sentiment_analyzer() checks label in {positive, negative, neutral}.
    ARGUS marks sentiment_analyzer as status='semantic_fail'.
    """
    tagged = []
    for article in state["articles"]:
        tagged.append({**article, "sentiment": "mixed", "sentiment_score": 0.0})
    return {
        "articles": tagged,
        "overall_sentiment": "mixed",
        "sentiment_distribution": {"mixed": len(tagged)},
    }


def report_drafter_with_interrupt(state: ReportDrafterState) -> dict[str, Any]:
    """Human-interrupt variant: raises GraphInterrupt for editorial approval.

    ARGUS catches GraphInterrupt, marks node as status='interrupted',
    saves a checkpoint to .argus/checkpoints/, and re-raises so the
    pipeline can be resumed later via watcher.resume().
    """
    # Import here to handle environments without langgraph installed
    try:
        from langgraph.errors import GraphInterrupt
    except ImportError:
        # Simulate GraphInterrupt for environments without LangGraph
        class GraphInterrupt(Exception):  # type: ignore[no-redef]
            pass
        import argus.session as _session_mod
        _session_mod._GraphInterrupt = GraphInterrupt  # type: ignore[attr-defined]

    raise GraphInterrupt(
        "Report requires human editorial review before publishing. "
        "Call watcher.resume(run_id, app) after approval."
    )

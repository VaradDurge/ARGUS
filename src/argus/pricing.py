"""Hardcoded LLM pricing table for automatic cost calculation."""
from __future__ import annotations

# (prompt_cost, completion_cost) per 1M tokens in USD
_MODEL_PRICING: dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    "gpt-4": (30.00, 60.00),
    "gpt-3.5-turbo": (0.50, 1.50),
    "o1": (15.00, 60.00),
    "o1-mini": (3.00, 12.00),
    "o3": (10.00, 40.00),
    "o3-mini": (1.10, 4.40),
    "o4-mini": (1.10, 4.40),
    # Anthropic
    "claude-opus-4": (15.00, 75.00),
    "claude-sonnet-4": (3.00, 15.00),
    "claude-3-opus": (15.00, 75.00),
    "claude-3-5-sonnet": (3.00, 15.00),
    "claude-3-5-haiku": (0.80, 4.00),
    "claude-3-haiku": (0.25, 1.25),
    # Google
    "gemini-2.0-flash": (0.10, 0.40),
    "gemini-2.5-flash": (0.15, 0.60),
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-1.5-pro": (1.25, 5.00),
    "gemini-1.5-flash": (0.075, 0.30),
    # Meta (via providers)
    "llama-3.1-70b": (0.35, 0.40),
    "llama-3.1-8b": (0.05, 0.08),
    # Mistral
    "mistral-large": (2.00, 6.00),
    "mistral-small": (0.20, 0.60),
}


def calculate_cost(
    model_name: str, prompt_tokens: int, completion_tokens: int,
) -> float | None:
    """Calculate cost in USD from model name and token counts.

    Uses substring matching against known models. Returns None if model
    is not recognized.
    """
    name = model_name.lower().strip()

    # Try exact match first, then substring
    for key, (prompt_rate, completion_rate) in _MODEL_PRICING.items():
        if key in name:
            cost = (prompt_tokens * prompt_rate + completion_tokens * completion_rate) / 1_000_000
            return round(cost, 6)

    return None

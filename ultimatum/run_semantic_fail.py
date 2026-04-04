"""
Scenario: SEMANTIC FAILURE (Validator)
=======================================
Tests: Semantic validators, semantic_fail status

Two broken agents are swapped in:

  1. relevance_scorer_broken  → returns scores in [1.2, 2.5] (out of range)
     Validator: validate_relevance_scorer checks score in [0.0, 1.0]
     → relevance_scorer gets status='semantic_fail'

  2. sentiment_analyzer_broken → returns label='mixed' (not in valid set)
     Validator: validate_sentiment_analyzer checks label in {positive, negative, neutral}
     → sentiment_analyzer gets status='semantic_fail'

Both failures are independent semantic issues, not structural ones.
The pipeline continues running after semantic fails (they don't raise exceptions).

RunRecord.overall_status = 'silent_failure' (semantic fails roll up to this)

After running:
    argus show last
"""
from __future__ import annotations

from rich.console import Console

from ultimatum.agents import relevance_scorer_broken, sentiment_analyzer_broken
from ultimatum.pipeline import build_pipeline, run_linear
from ultimatum.state import INITIAL_STATE

console = Console()


def main() -> None:
    console.rule("[bold magenta]SCENARIO: Semantic Failure[/bold magenta]")
    console.print(
        "[dim]relevance_scorer returns scores > 1.0[/dim]\n"
        "[dim]sentiment_analyzer returns label='mixed' (not in valid set)[/dim]\n"
        "[dim]Semantic validators catch both — pipeline runs to completion.[/dim]\n"
    )

    session, agents = build_pipeline(overrides={
        "relevance_scorer":   relevance_scorer_broken,
        "sentiment_analyzer": sentiment_analyzer_broken,
    })

    run_linear(session, agents, INITIAL_STATE)

    console.print(f"\n[bold]Run ID:[/bold] [cyan]{session.run_id}[/cyan]")
    console.print(
        "\n[dim]Run: [bold]argus show last[/bold] to see ⊗ semantic_fail nodes[/dim]"
    )


if __name__ == "__main__":
    main()

"""
Scenario: CYCLIC GRAPH (Revision Loop)
========================================
Tests: Cycle detection, attempt_index tracking, manual finalize

The edge map includes:
    quality_assessor → report_drafter   (back-edge — makes graph cyclic)
    quality_assessor → report_publisher (forward-edge — exit condition)

ARGUS detects the back-edge via iterative DFS and sets session._is_cyclic=True.
This disables auto-finalization — you MUST call session.finalize() explicitly.

Each time report_drafter and quality_assessor run again, their NodeEvents
get an incremented attempt_index (0, 1, 2...) so you can see iteration history.

quality_assessor logic:
  v1: quality_score = ~0.55+bonus  → needs_revision=True  → loops back
  v2: quality_score = ~0.73+bonus  → needs_revision=False → exits to publisher

RunRecord.is_cyclic = True

After running:
    argus show last   (notice report_drafter and quality_assessor appear twice)
"""
from __future__ import annotations

from rich.console import Console

from ultimatum.pipeline import build_pipeline, run_with_cycle
from ultimatum.state import INITIAL_STATE

console = Console()


def main() -> None:
    console.rule("[bold cyan]SCENARIO: Cyclic Graph (Revision Loop)[/bold cyan]")
    console.print(
        "[dim]quality_assessor → report_drafter back-edge creates a revision cycle.[/dim]\n"
        "[dim]ARGUS detects the cycle, tracks attempt_index per iteration.[/dim]\n"
        "[dim]Requires explicit session.finalize() — auto-finalize is disabled.[/dim]\n"
    )

    session, agents = build_pipeline()
    final_state = run_with_cycle(session, agents, INITIAL_STATE, max_revisions=3)

    console.print(f"\n[bold]Run ID:[/bold]      [cyan]{session.run_id}[/cyan]")
    console.print(f"[bold]Is cyclic:[/bold]   [cyan]{session._is_cyclic}[/cyan]")
    console.print(
        f"[bold]Draft version:[/bold] [cyan]{final_state.get('draft_version')}[/cyan]"
    )
    console.print(
        f"[bold]Quality score:[/bold] [cyan]{final_state.get('quality_score', 0):.0%}[/cyan]"
    )
    console.print(
        "\n[dim]Run: [bold]argus show last[/bold] — "
        "report_drafter and quality_assessor show attempt_index > 0[/dim]"
    )


if __name__ == "__main__":
    main()

"""
Scenario: CLEAN RUN
===================
Tests: State snapshot capture, persistent storage, CLI show/list

All 15 agents run successfully. Every node gets status='pass'.
RunRecord.overall_status = 'clean'.

After running:
    argus show last
    argus list
"""
from __future__ import annotations

from rich.console import Console

from ultimatum.pipeline import build_pipeline, run_linear
from ultimatum.state import INITIAL_STATE

console = Console()


def main() -> None:
    console.rule("[bold green]SCENARIO: Clean Run[/bold green]")
    console.print("[dim]All 15 agents run without errors.[/dim]\n")

    session, agents = build_pipeline()
    final_state = run_linear(session, agents, INITIAL_STATE)

    console.print(f"\n[bold]Run ID:[/bold] [cyan]{session.run_id}[/cyan]")
    console.print(f"[bold]Published report preview:[/bold]")
    preview = final_state.get("published_report", "")[:300]
    console.print(f"[dim]{preview}...[/dim]")
    console.print(
        "\n[dim]Run: [bold]argus show last[/bold] to inspect the full trace[/dim]"
    )


if __name__ == "__main__":
    main()

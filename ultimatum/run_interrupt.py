"""
Scenario: HUMAN INTERRUPT
==========================
Tests: Human interrupt detection, checkpoint persistence, resume tracking

report_drafter_with_interrupt raises GraphInterrupt instead of returning output.

ARGUS catches it:
  - Node gets status='interrupted' (not 'crashed')
  - RunRecord.interrupted = True
  - RunRecord.interrupt_node = 'report_drafter'
  - Checkpoint saved to .argus/checkpoints/<run_id>.json

The run is saved in a paused state. watcher.resume() would re-invoke
the pipeline from the checkpoint (requires a LangGraph app instance).

For non-LangGraph pipelines, the checkpoint file preserves the run_id
so you can identify which runs are pending human approval.

After running:
    argus show last   (look for ⏸ interrupted status)
"""
from __future__ import annotations

from rich.console import Console

from ultimatum.agents import report_drafter_with_interrupt
from ultimatum.pipeline import LINEAR_NODE_ORDER, build_pipeline
from ultimatum.state import INITIAL_STATE

console = Console()


def main() -> None:
    console.rule("[bold yellow]SCENARIO: Human Interrupt[/bold yellow]")
    console.print(
        "[dim]report_drafter raises GraphInterrupt for editorial approval.[/dim]\n"
        "[dim]ARGUS marks it 'interrupted', saves checkpoint, does NOT crash.[/dim]\n"
    )

    session, agents = build_pipeline(
        overrides={"report_drafter": report_drafter_with_interrupt}
    )

    state = dict(INITIAL_STATE)

    # Run up to and including report_drafter (which will interrupt)
    interrupted_at = None
    for name in LINEAR_NODE_ORDER:
        try:
            state = {**state, **agents[name](state)}
        except Exception as exc:
            # GraphInterrupt re-raised by ARGUS after recording
            interrupted_at = name
            console.print(f"[dim]Interrupt raised at '{name}': {exc}[/dim]")
            break

    session.finalize()

    console.print(f"\n[bold]Run ID:[/bold]       [cyan]{session.run_id}[/cyan]")
    console.print(f"[bold]Interrupted at:[/bold] [yellow]{interrupted_at}[/yellow]")
    console.print(
        "\n[dim]Run: [bold]argus show last[/bold] to see the ⏸ interrupted node[/dim]"
    )
    console.print(
        f"[dim]Checkpoint saved to: "
        f"[bold].argus/checkpoints/{session.run_id}.json[/bold][/dim]"
    )


if __name__ == "__main__":
    main()

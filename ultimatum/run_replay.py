"""
Scenario: REPLAY FROM FAILED STEP
====================================
Tests: ReplayEngine — reconstruct and re-run from a saved state snapshot

This script:
  1. Runs the silent-fail scenario (web_searcher omits result_urls)
  2. Saves the run_id of the failed run
  3. Fixes web_searcher (uses the correct version)
  4. Replays from 'web_searcher' using the original input state
     — nodes 1-2 (input_validator, query_expander) are NOT re-run
     — pipeline resumes from web_searcher with the captured input snapshot

The replay run saves as a new RunRecord with:
    parent_run_id   = original failed run_id
    replay_from_step = 'web_searcher'

After running:
    argus list      (two runs: original failed + replay)
    argus show last (replay run, linked to parent)
"""
from __future__ import annotations

import sys

from rich.console import Console

from ultimatum.agents import web_searcher_broken
from ultimatum.pipeline import LINEAR_NODE_ORDER, build_pipeline
from ultimatum.state import INITIAL_STATE

console = Console()


def _run_failing_pipeline() -> str:
    """Run the silent-fail scenario, return its run_id."""
    session, agents = build_pipeline(overrides={"web_searcher": web_searcher_broken})
    state = dict(INITIAL_STATE)
    for name in LINEAR_NODE_ORDER:
        try:
            state = {**state, **agents[name](state)}
        except (KeyError, TypeError):
            break
    session.finalize()
    return session.run_id


def _app_factory():
    """Returns an ArgusSession + wrapped agents for the replay engine.

    ReplayEngine calls this to get a fresh pipeline with correct agents.
    It expects a callable that returns something with a .nodes attribute
    (LangGraph) OR we use ArgusSession directly via the low-level API.

    Since this pipeline doesn't use LangGraph, we patch the replay
    to call our own run logic directly and return the run_id.
    """
    # For framework-agnostic pipelines, replay is done manually:
    # ReplayEngine provides the recovered state — we run from that node forward.
    pass


def main() -> None:
    console.rule("[bold blue]SCENARIO: Replay from Failed Step[/bold blue]")
    console.print(
        "[dim]Step 1: Run pipeline with broken web_searcher (silent failure)[/dim]\n"
        "[dim]Step 2: Fix web_searcher, replay from that step only[/dim]\n"
        "[dim]Step 3: Nodes before web_searcher are NOT re-run (state recovered)[/dim]\n"
    )

    # ── Step 1: produce a failed run ─────────────────────────────────────────
    console.print("[bold]Step 1[/bold] — Running failing pipeline...")
    failed_run_id = _run_failing_pipeline()
    console.print(f"  Failed run ID: [red]{failed_run_id}[/red]")

    # ── Step 2: manually replay from web_searcher using recovered state ──────
    console.print("\n[bold]Step 2[/bold] — Replaying from 'web_searcher'...")

    from argus.storage import load_run

    # Load the failed run to get the input state at web_searcher
    record = load_run(failed_run_id)
    step = next((e for e in record.steps if e.node_name == "web_searcher"), None)
    if step is None:
        console.print("[red]web_searcher step not found in failed run[/red]")
        sys.exit(1)

    recovered_state = dict(step.input_state)
    console.print(
        f"  Recovered state at 'web_searcher': "
        f"{list(recovered_state.keys())}"
    )

    # ── Step 3: run from web_searcher forward with fixed agents ──────────────
    console.print("\n[bold]Step 3[/bold] — Running fixed pipeline from web_searcher...")

    replay_session, replay_agents = build_pipeline()   # uses correct web_searcher
    replay_session.parent_run_id = failed_run_id
    replay_session.replay_from_step = "web_searcher"

    # Nodes before web_searcher already ran — start from web_searcher
    replay_from = "web_searcher"
    start_idx = LINEAR_NODE_ORDER.index(replay_from)
    state = dict(recovered_state)

    for name in LINEAR_NODE_ORDER[start_idx:]:
        state = {**state, **replay_agents[name](state)}

    replay_session.finalize()

    console.print(f"\n[bold]Original run:[/bold] [red]{failed_run_id}[/red]")
    console.print(f"[bold]Replay run:  [/bold] [green]{replay_session.run_id}[/green]")
    console.print(
        "\n[dim]Run: [bold]argus list[/bold] — two runs: failed + replay[/dim]"
    )
    console.print(
        "[dim]Run: [bold]argus show last[/bold] — replay run shows "
        "'replay of <original> from web_searcher'[/dim]"
    )


if __name__ == "__main__":
    main()

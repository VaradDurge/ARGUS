"""
Scenario: SILENT FAILURE (Structural)
======================================
Tests: Silent failure detection, root cause chain tracing

web_searcher_broken omits 'result_urls' from its output.
content_fetcher has type annotation: def content_fetcher(state: ContentFetcherState)
ContentFetcherState declares result_urls as a required field.

ARGUS reads ContentFetcherState from content_fetcher's type annotation,
sees result_urls is absent in the accumulated state, and immediately flags
web_searcher as status='fail' (silent_failure) — before content_fetcher runs.

RunRecord.overall_status  = 'silent_failure'
RunRecord.first_failure   = 'web_searcher'
RunRecord.root_cause_chain = ['web_searcher']

After running:
    argus show last
"""
from __future__ import annotations

from rich.console import Console

from ultimatum.agents import web_searcher_broken
from ultimatum.pipeline import build_pipeline
from ultimatum.state import INITIAL_STATE

console = Console()


def main() -> None:
    console.rule("[bold yellow]SCENARIO: Silent Failure[/bold yellow]")
    console.print(
        "[dim]web_searcher omits 'result_urls'.[/dim]\n"
        "[dim]ARGUS catches it at the web_searcher → content_fetcher boundary.[/dim]\n"
    )

    session, agents = build_pipeline(overrides={"web_searcher": web_searcher_broken})

    # Run node by node — stop as soon as ARGUS records a silent failure.
    # This mirrors what a real pipeline runner would do: check for failures
    # after each step and halt before a downstream crash obscures the root cause.
    from ultimatum.pipeline import LINEAR_NODE_ORDER
    state = dict(INITIAL_STATE)
    for name in LINEAR_NODE_ORDER:
        # Check BEFORE running this node if the previous node flagged a silent failure
        last = session._events[-1] if session._events else None
        if last and last.status == "fail":
            console.print(
                f"[dim]Silent failure on '{last.node_name}' — "
                f"halting before '{name}' runs.[/dim]"
            )
            break
        state = {**state, **agents[name](state)}
    session.finalize()

    console.print(f"\n[bold]Run ID:[/bold] [cyan]{session.run_id}[/cyan]")
    console.print(
        "\n[dim]Run: [bold]argus show last[/bold] to see the silent failure trace[/dim]"
    )
    console.print(
        "[dim]Then: [bold]argus replay " + session.run_id[:8] + " content_fetcher "
        "--app ultimatum.pipeline:build_pipeline[/bold] to replay from the fixed node[/dim]"
    )


if __name__ == "__main__":
    main()

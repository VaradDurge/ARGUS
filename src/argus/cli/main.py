from __future__ import annotations

from typing import Annotated, Optional

import typer

from argus.cli.cmd_replay import inspect_step, replay_run
from argus.cli.cmd_show import show_last, show_list, show_run

app = typer.Typer(
    name="argus",
    help="ARGUS — Agentic Realtime Guard and Unified Scope. Monitor LangGraph pipelines.",
    no_args_is_help=True,
)

show_app = typer.Typer(help="Show run details.", no_args_is_help=True)
app.add_typer(show_app, name="show")


@show_app.command("last")
def cmd_show_last() -> None:
    """Show the most recent run."""
    show_last()


@show_app.command("run")
def cmd_show_run(
    run_id: Annotated[str, typer.Argument(help="Run ID or 8-char prefix.")],
) -> None:
    """Show details for a specific run."""
    show_run(run_id)


@app.command("list")
def cmd_list() -> None:
    """List all recorded runs in reverse chronological order."""
    show_list()


@app.command("replay")
def cmd_replay(
    run_id: Annotated[str, typer.Argument(help="Run ID or 8-char prefix to replay.")],
    from_step: Annotated[str, typer.Argument(help="Node name to replay from.")],
    app: Annotated[
        Optional[str],
        typer.Option(help="'module.path:factory_fn' — zero-arg callable returning a StateGraph (before compile)."),
    ] = None,
) -> None:
    """Re-run a pipeline from a saved step using stored input state."""
    replay_run(run_id=run_id, from_step=from_step, app_module_str=app)


@app.command("inspect")
def cmd_inspect(
    run_id: Annotated[str, typer.Argument(help="Run ID or 8-char prefix.")],
    step: Annotated[str, typer.Option("--step", "-s", help="Node name to inspect.")],
) -> None:
    """Dump full input/output state snapshot for a specific step."""
    inspect_step(run_id=run_id, step_name=step)

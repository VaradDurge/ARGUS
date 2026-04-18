from __future__ import annotations

from typing import Annotated, Optional

import typer
from rich.console import Console
from rich.text import Text

from argus.cli.cmd_diff import diff_runs
from argus.cli.cmd_replay import inspect_step, replay_run
from argus.cli.cmd_show import show_last, show_list, show_run

app = typer.Typer(
    name="argus",
    no_args_is_help=False,
    add_completion=False,
    context_settings={"help_option_names": ["--help", "-h"]},
)

show_app = typer.Typer(help="Show run details.", no_args_is_help=True)
app.add_typer(show_app, name="show")

_console = Console()

_WORDMARK = [
    "┌─┐ ┬─┐ ┌─┐ ┬ ┬ ┌─┐",
    "├─┤ ├┬┘ │ ┬ │ │ └─┐",
    "┴ ┴ ┴└─ └─┘ └─┘ └─┘",
]

_COMMANDS = [
    ("list",    "list all recorded runs"),
    ("show",    "show details for a specific run"),
    ("replay",  "re-run a pipeline from a saved checkpoint"),
    ("inspect", "dump full state snapshot for a node"),
    ("diff",    "compare two runs node-by-node"),
]

_EXAMPLES = [
    ("argus list",                              "see every run, newest first"),
    ("argus show last",                         "inspect the most recent run"),
    ("argus show run <id>",                     "use full id or 8-char prefix"),
    ("argus replay <id> <node>",                "re-run from a saved node state"),
    ("argus replay <id> <node> --app mod:fn",   "replay with a live graph factory"),
    ("argus inspect <id> --step <node>",        "dump raw input/output for a node"),
    ("argus diff <id>",                         "diff a replay run against its original"),
    ("argus diff <id-a> <id-b>",               "diff any two runs"),
]


@app.callback(invoke_without_command=True)
def _banner(ctx: typer.Context) -> None:
    if ctx.invoked_subcommand is not None:
        return

    _console.print()

    tagline = "agentic realtime guard & unified scope"
    pad = " " * 4

    for i, line in enumerate(_WORDMARK):
        if i == 1:
            suffix = Text(f"{pad}{tagline}", style="dim")
        else:
            suffix = Text()
        _console.print(f"  {line}", style="bold", end="")
        _console.print(suffix)

    _console.print()
    _console.print("  [dim]─────────────────────────────────────────[/dim]")
    _console.print()

    name_w = max(len(cmd) for cmd, _ in _COMMANDS)
    for name, desc in _COMMANDS:
        row = Text()
        row.append(f"  {name:<{name_w}}  ", style="bold")
        row.append(desc, style="dim")
        _console.print(row)

    _console.print()
    _console.print("  [dim]─────────────────────────────────────────[/dim]")
    _console.print()
    _console.print("  [dim]examples[/dim]")
    _console.print()

    cmd_w = max(len(cmd) for cmd, _ in _EXAMPLES)
    for cmd, note in _EXAMPLES:
        row = Text()
        row.append(f"  {cmd:<{cmd_w}}  ", style="")
        row.append(f"# {note}", style="dim")
        _console.print(row)

    _console.print()
    hint = Text()
    hint.append("  argus ", style="dim")
    hint.append("<command>", style="italic dim")
    hint.append(" --help", style="dim")
    hint.append("  for all options", style="dim")
    _console.print(hint)
    _console.print()


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
        typer.Option(
            help="'module.path:factory_fn' — zero-arg callable returning a StateGraph.",
        ),
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


@app.command("diff")
def cmd_diff(
    run_id_a: Annotated[str, typer.Argument(help="Run ID, or a replay run ID to auto-diff against its original.")],
    run_id_b: Optional[str] = typer.Argument(default=None, help="Second run ID. Omit to auto-compare against parent."),
) -> None:
    """Compare two runs node-by-node: status, duration, and output field changes."""
    diff_runs(run_id_a, run_id_b)

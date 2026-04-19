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

_SETUP_LINES = [
    ("from argus import ArgusWatcher",     ""),
    ("watcher = ArgusWatcher()",           ""),
    ("watcher.watch(graph)",               "# graph = your StateGraph, before .compile()"),
    ("app = graph.compile()",              ""),
    ("app.invoke(initial_state)",          ""),
    ("watcher.finalize()",                 "# persists the run to .argus/runs/"),
]

_COMMANDS = [
    ("list",                              "list all recorded runs, newest first"),
    ("show last",                         "inspect the most recent run"),
    ("show run <id>",                     "inspect a specific run  (full id or 8-char prefix)"),
    ("replay <id> <node>",                "re-run from a saved node checkpoint"),
    ("replay <id> <node> --app mod:fn",   "replay with a live graph factory"),
    ("inspect <id> --step <node>",        "dump raw input / output state for a node"),
    ("diff <id>",                         "diff a replay run against its original"),
    ("diff <id-a> <id-b>",               "diff any two runs side-by-side"),
]

_WHEN_TO_USE = [
    ("list",     "after a run — get the run id for further commands"),
    ("show",     "understand what happened: statuses, warnings, root cause"),
    ("replay",   "re-run from a broken node after fixing the code"),
    ("inspect",  "read exact input/output JSON for a specific step"),
    ("diff",     "verify a fix actually changed behaviour between runs"),
]

_OPTIONS = [
    ("replay  --app  module.path:fn",  "str",  "zero-arg callable returning StateGraph or CompiledGraph"),
    ("inspect --step / -s  <node>",   "str",  "node name to inspect  (required)"),
    ("show run <id>",                  "str",  "full run id or 8-char prefix"),
    ("diff <id-a> <id-b>",            "str",  "two run ids; omit second to auto-diff vs original"),
]

_STATUSES = [
    ("[bold green]✓[/bold green]  pass",            "node completed, output looks healthy"),
    ("[bold yellow]⚠[/bold yellow]  silent failure", "node ran but returned empty / missing fields"),
    ("[bold magenta]⊗[/bold magenta]  semantic fail","validator rejected the output"),
    ("[bold red]✗[/bold red]  crashed",             "node raised an exception"),
    ("[bold yellow]⏸[/bold yellow]  interrupted",   "human-in-the-loop pause"),
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
    _console.print("  [dim]─────────────────────────────────────────────────────────[/dim]")
    _console.print()

    # ── Setup ──────────────────────────────────────────────────────────────
    _console.print("  [dim]setup[/dim]")
    _console.print()
    code_w = max(len(code) for code, _ in _SETUP_LINES)
    for code, comment in _SETUP_LINES:
        row = Text()
        row.append(f"    {code:<{code_w}}  ", style="")
        if comment:
            row.append(comment, style="dim")
        _console.print(row)

    _console.print()
    _console.print("  [dim]─────────────────────────────────────────────────────────[/dim]")
    _console.print()

    # ── Commands ────────────────────────────────────────────────────────────
    _console.print("  [dim]commands[/dim]")
    _console.print()
    cmd_w = max(len(cmd) for cmd, _ in _COMMANDS)
    for cmd, desc in _COMMANDS:
        row = Text()
        row.append(f"  argus {cmd:<{cmd_w}}  ", style="bold")
        row.append(desc, style="dim")
        _console.print(row)

    _console.print()
    _console.print("  [dim]─────────────────────────────────────────────────────────[/dim]")
    _console.print()

    # ── When to use ─────────────────────────────────────────────────────────
    _console.print("  [dim]when to use[/dim]")
    _console.print()
    wtu_w = max(len(cmd) for cmd, _ in _WHEN_TO_USE)
    for cmd, desc in _WHEN_TO_USE:
        row = Text()
        row.append(f"  {cmd:<{wtu_w}}  ", style="bold")
        row.append(desc, style="dim")
        _console.print(row)

    _console.print()
    _console.print("  [dim]─────────────────────────────────────────────────────────[/dim]")
    _console.print()

    # ── Options ─────────────────────────────────────────────────────────────
    _console.print("  [dim]options[/dim]")
    _console.print()
    opt_w  = max(len(opt)  for opt, _, _ in _OPTIONS)
    type_w = max(len(typ)  for _, typ, _ in _OPTIONS)
    for opt, typ, desc in _OPTIONS:
        row = Text()
        row.append(f"  {opt:<{opt_w}}  ", style="bold")
        row.append(f"[{typ}]  ", style="italic dim")
        row.append(desc, style="dim")
        _console.print(row)

    _console.print()
    _console.print("  [dim]─────────────────────────────────────────────────────────[/dim]")
    _console.print()

    # ── Node statuses ────────────────────────────────────────────────────────
    _console.print("  [dim]node statuses[/dim]")
    _console.print()
    for icon_label, desc in _STATUSES:
        row = Text.from_markup(f"  {icon_label:<26}  ")
        row.append(desc, style="dim")
        _console.print(row)

    _console.print()
    _console.print("  [dim]─────────────────────────────────────────────────────────[/dim]")
    _console.print()
    _console.print("  [dim]run  [bold]argus <command> --help[/bold]  for per-command flag details[/dim]")
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
    run_id_a: Annotated[
        str, typer.Argument(help="Run ID or replay run ID.")
    ],
    run_id_b: Optional[str] = typer.Argument(
        default=None, help="Second run ID. Omit for auto-diff."
    ),
) -> None:
    """Compare two runs node-by-node: status, duration, and output field changes."""
    diff_runs(run_id_a, run_id_b)

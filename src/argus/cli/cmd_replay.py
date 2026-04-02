from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Any, Callable

from rich.console import Console
from rich.rule import Rule
from rich.text import Text

from argus.replay import ReplayEngine
from argus.storage import load_run

console = Console()


def replay_run(run_id: str, from_step: str, app_module_str: str | None) -> None:
    try:
        record = load_run(run_id)
    except FileNotFoundError as e:
        console.print(f"[red]Error:[/red] {e}")
        return

    available = [e.node_name for e in record.steps]
    if from_step not in available:
        console.print(
            f"[red]Error:[/red] node '[bold]{from_step}[/bold]' not found.\n"
            f"Available: {', '.join(available)}"
        )
        return

    if app_module_str is None:
        console.print(
            f"\n  argus replay {run_id} {from_step} --app your_module:build_graph\n"
        )
        return

    factory = _import_factory(app_module_str)
    if factory is None:
        return

    # ── Header ────────────────────────────────────────────────────────────
    console.print()
    header = Text()
    header.append("argus replay", style="bold italic")
    header.append(f"  {run_id}", style="italic dim")
    header.append(f"  ↺  from  ", style="dim")
    header.append(from_step, style="bold")
    console.print(f"  {header}")
    console.print()
    console.print(Rule(style="dim"))
    console.print()

    # ── Run replay ────────────────────────────────────────────────────────
    from argus.storage import list_runs
    known_ids = {r["run_id"] for r in list_runs()}

    engine = ReplayEngine()
    try:
        engine.replay(run_id=run_id, from_node=from_step, app_factory=factory)
    except Exception as e:
        console.print(f"[red]Replay failed:[/red] {e}")
        return

    new_ids = {r["run_id"] for r in list_runs()} - known_ids
    if not new_ids:
        console.print("[yellow]Warning:[/yellow] Could not locate the new replay run.")
        return

    new_run_id = next(iter(new_ids))
    new_record = load_run(new_run_id)
    name_col   = max(len(s.node_name) for s in new_record.steps) + 2

    for step in new_record.steps:
        number = f"Node {step.step_index + 1}"
        pad    = " " * (name_col - len(step.node_name))
        dur    = f"[italic dim]{step.duration_ms:.0f} ms[/italic dim]"

        if step.status == "pass":
            name   = f"[bold]{step.node_name}[/bold]"
            icon   = "[bold green]✓[/bold green]"
            label  = "[bold green]pass[/bold green]"
        elif step.status == "fail":
            name   = f"[bold]{step.node_name}[/bold]"
            icon   = "[bold yellow]⚠[/bold yellow]"
            label  = "[bold yellow]silent failure[/bold yellow]"
        else:
            name   = f"[bold red]{step.node_name}[/bold red]"
            icon   = "[bold red]✗[/bold red]"
            label  = "[bold red]crashed[/bold red]"

        console.print(f"  [dim]{number}[/dim]  {name}{pad}{dur}   {icon}  {label}")
        console.print()

    console.print()
    console.print(Rule(style="dim"))

    if new_record.overall_status == "clean":
        result = Text()
        result.append("  ✓  clean  ", style="bold green")
        result.append(new_run_id, style="italic dim")
    else:
        result = Text()
        result.append(f"  ✗  {new_record.overall_status}  ", style="bold red")
        result.append(new_run_id, style="italic dim")

    console.print(result)
    console.print(f"  [italic dim]run  argus show last  for full details[/italic dim]")
    console.print()


def _import_factory(spec: str) -> Callable[[], Any] | None:
    if ":" not in spec:
        console.print(f"[red]Error:[/red] --app must be 'module:function'. Got: '{spec}'")
        return None

    module_path, fn_name = spec.rsplit(":", 1)
    cwd = str(Path.cwd())
    if cwd not in sys.path:
        sys.path.insert(0, cwd)

    try:
        module = importlib.import_module(module_path)
    except ImportError as e:
        console.print(f"[red]Error:[/red] Cannot import '{module_path}': {e}")
        return None

    fn = getattr(module, fn_name, None)
    if fn is None or not callable(fn):
        console.print(
            f"[red]Error:[/red] '{fn_name}' not found or not callable in '{module_path}'"
        )
        return None

    return fn


def inspect_step(run_id: str, step_name: str) -> None:
    import json
    try:
        record = load_run(run_id)
    except FileNotFoundError as e:
        console.print(f"[red]Error:[/red] {e}")
        return

    event = next((e for e in record.steps if e.node_name == step_name), None)
    if event is None:
        console.print(
            f"[red]Error:[/red] step '{step_name}' not found.\n"
            f"Available: {', '.join(e.node_name for e in record.steps)}"
        )
        return

    console.print(
        f"\n  [bold]{step_name}[/bold]  "
        f"[italic dim]#{event.step_index}  {event.status}[/italic dim]\n"
    )
    console.print("  [dim]── input ──[/dim]")
    console.print_json(json.dumps(event.input_state, default=str, indent=2))
    console.print("\n  [dim]── output ──[/dim]")
    if event.output_dict is not None:
        console.print_json(json.dumps(event.output_dict, default=str, indent=2))
    else:
        console.print("  [italic dim](no output — node crashed)[/italic dim]")
    if event.inspection and event.inspection.severity != "ok":
        console.print(f"\n  [dim]── inspection ──[/dim]")
        console.print(f"  [italic]{event.inspection.message}[/italic]")

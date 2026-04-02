from __future__ import annotations

from rich import box
from rich.console import Console
from rich.rule import Rule
from rich.table import Table
from rich.text import Text

from argus.models import NodeEvent, RunRecord
from argus.storage import last_run_id, list_runs, load_run

console = Console()

_STATUS_STYLE = {
    "clean":          "bold green",
    "silent_failure": "bold yellow",
    "crashed":        "bold red",
}


def show_last() -> None:
    run_id = last_run_id()
    if run_id is None:
        console.print("[dim]No runs found in .argus/runs/[/dim]")
        return
    show_run(run_id)


def show_run(run_id: str) -> None:
    try:
        record = load_run(run_id)
    except FileNotFoundError as e:
        console.print(f"[red]Error:[/red] {e}")
        return
    _print_run(record)


def show_list() -> None:
    runs = list_runs()
    if not runs:
        console.print("[dim]No runs found in .argus/runs/[/dim]")
        return

    table = Table(box=box.SIMPLE, show_header=True, header_style="bold", pad_edge=False)
    table.add_column("run id",   style="dim",     min_width=26)
    table.add_column("started",  min_width=18)
    table.add_column("status",   min_width=16)
    table.add_column("duration", justify="right", min_width=8)
    table.add_column("steps",    justify="right", min_width=5)

    for run in runs:
        style = _STATUS_STYLE.get(run["overall_status"], "dim")
        dur = f"{run['duration_ms']:.0f} ms" if run.get("duration_ms") else "—"
        table.add_row(
            run["run_id"],
            run["started_at"][:16].replace("T", "  "),
            f"[{style}]{run['overall_status']}[/{style}]",
            dur,
            str(run.get("step_count", "?")),
        )

    console.print()
    console.print(table)


def _print_run(record: RunRecord) -> None:
    dur     = f"{record.duration_ms:.0f} ms" if record.duration_ms is not None else "—"
    started = (record.started_at or "")[:16].replace("T", "  ")
    status_style = _STATUS_STYLE.get(record.overall_status, "dim")

    # ── Header ─────────────────────────────────────────────────────────────
    console.print()
    header = Text()
    header.append("argus", style="bold italic")
    header.append(f"  {record.run_id}  ·  {started}  ·  {dur}", style="italic dim")
    console.print(f"  {header}")

    status_line = Text()
    status_line.append("  status   ", style="dim")
    status_line.append(record.overall_status, style=status_style)
    console.print(status_line)

    if record.parent_run_id:
        console.print(
            f"  [italic dim]replay of[/italic dim]  [dim]{record.parent_run_id}[/dim]"
            f"  [italic dim]from[/italic dim]  [bold]{record.replay_from_step}[/bold]"
        )

    console.print()
    console.print(Rule(style="dim"))
    console.print()

    # ── Node list ──────────────────────────────────────────────────────────
    # Pre-compute name column width for alignment
    name_col = max(len(e.node_name) for e in record.steps) + 2

    for event in record.steps:
        _print_node(event, name_col, record)

    # ── Root cause ─────────────────────────────────────────────────────────
    if record.root_cause_chain:
        console.print()
        console.print(Rule(style="dim"))
        chain = "  →  ".join(record.root_cause_chain)
        rc = Text()
        rc.append("  root cause  ", style="italic dim")
        rc.append(chain, style="bold red")
        console.print(rc)

    console.print()


def _print_node(event: NodeEvent, name_col: int, record: RunRecord) -> None:
    insp   = event.inspection
    number = f"Node {event.step_index + 1}"
    # indent for └─ lines = "Node N  " + name padding to align under the name
    indent = " " * (len(number) + 2)

    # ── Status icon + label ────────────────────────────────────────────────
    if event.status == "pass":
        icon   = "[bold green]✓[/bold green]"
        label  = "[bold green]pass[/bold green]"
    elif event.status == "fail":
        icon   = "[bold yellow]⚠[/bold yellow]"
        label  = "[bold yellow]silent failure[/bold yellow]"
    else:
        icon   = "[bold red]✗[/bold red]"
        label  = "[bold red]crashed[/bold red]"

    # ── Node name (bold) + duration (italic dim) ───────────────────────────
    pad  = " " * (name_col - len(event.node_name))
    dur  = f"[italic dim]{event.duration_ms:.0f} ms[/italic dim]"
    name = f"[bold]{event.node_name}[/bold]"

    console.print(f"  [dim]{number}[/dim]  {name}{pad}{dur}   {icon}  {label}")

    # ── Detail lines ───────────────────────────────────────────────────────
    if event.status == "pass":
        return

    successor = _successor_name(event, record)
    is_downstream = (
        event.status == "fail"
        and record.first_failure_step is not None
        and event.node_name != record.first_failure_step
    )

    if event.exception:
        first_line = event.exception.splitlines()[0]
        console.print(
            f"  {indent}[dim]└─[/dim]  [italic]{first_line}[/italic]"
        )

    if insp:
        if insp.missing_fields:
            for field in insp.missing_fields:
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f'[italic]Field [bold]"{field}"[/bold] is missing[/italic]'
                )
            console.print(
                f"  {indent}[dim]└─[/dim]  "
                f"[italic dim]{successor} received bad state[/italic dim]"
            )
        elif insp.empty_fields:
            for field in insp.empty_fields:
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f'[italic]Field [bold]"{field}"[/bold] is empty[/italic]'
                )
            console.print(
                f"  {indent}[dim]└─[/dim]  "
                f"[italic dim]{successor} received bad state[/italic dim]"
            )
        elif insp.type_mismatches:
            for m in insp.type_mismatches:
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f'[italic]Field [bold]"{m.field_name}"[/bold] '
                    f"expected {m.expected_type}, got {m.actual_type}[/italic]"
                )

    if is_downstream and record.first_failure_step:
        console.print(
            f"  {indent}[dim]└─[/dim]  "
            f"[italic dim]Root cause: [/italic dim]"
            f"[bold red]{record.first_failure_step}[/bold red]"
        )

    console.print()


def _successor_name(event: NodeEvent, record: RunRecord) -> str:
    successors = record.graph_edge_map.get(event.node_name, [])
    return successors[0] if successors else "next node"

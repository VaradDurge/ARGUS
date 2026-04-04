from __future__ import annotations

import re
from collections import Counter

from rich import box
from rich.console import Console
from rich.panel import Panel
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
    "semantic_fail":  "bold magenta",
    "interrupted":    "bold yellow",
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


_STATUS_DOT = {
    "clean":          "[bold green]●[/bold green]",
    "silent_failure": "[bold yellow]●[/bold yellow]",
    "crashed":        "[bold red]●[/bold red]",
    "semantic_fail":  "[bold magenta]●[/bold magenta]",
    "interrupted":    "[bold yellow]⏸[/bold yellow]",
}


def show_list() -> None:
    runs = list_runs()
    if not runs:
        console.print()
        console.print("  [dim]no runs found[/dim]")
        console.print()
        return

    table = Table(box=box.MINIMAL, show_header=True, header_style="dim", pad_edge=False)
    table.add_column("run id",   style="dim",     min_width=26)
    table.add_column("started",  min_width=18)
    table.add_column("",         min_width=1,     justify="center")
    table.add_column("status",   min_width=14)
    table.add_column("duration", justify="right", min_width=8)
    table.add_column("steps",    justify="right", min_width=5)

    for run in runs:
        style = _STATUS_STYLE.get(run["overall_status"], "dim")
        dot   = _STATUS_DOT.get(run["overall_status"], "[dim]●[/dim]")
        dur   = f"{run['duration_ms']:.0f} ms" if run.get("duration_ms") else "—"
        table.add_row(
            run["run_id"],
            run["started_at"][:16].replace("T", "  "),
            dot,
            f"[{style}]{run['overall_status']}[/{style}]",
            dur,
            str(run.get("step_count", "?")),
        )

    n = len(runs)
    console.print()
    console.print(table)
    console.print(f"  [dim]{n} run{'s' if n != 1 else ''}[/dim]")
    console.print()


def _segment_events(
    events: list[NodeEvent],
) -> list[tuple[str, object]]:
    """Split events into normal segments and cycle groups.

    Returns a list of:
        ("normal", [NodeEvent, ...])
        ("cycle",  [[iter0_events], [iter1_events], ...])
    """
    counts = Counter(e.node_name for e in events)
    cyclic_names = {name for name, c in counts.items() if c > 1}

    if not cyclic_names:
        return [("normal", events)]

    # Find the contiguous index range that contains all cyclic events
    cycle_indices = [i for i, e in enumerate(events) if e.node_name in cyclic_names]
    cycle_start = cycle_indices[0]
    cycle_end = cycle_indices[-1] + 1

    segments: list[tuple[str, object]] = []
    if cycle_start > 0:
        segments.append(("normal", events[:cycle_start]))

    # Group cyclic block into iterations by attempt_index
    cycle_block = events[cycle_start:cycle_end]
    iterations: dict[int, list[NodeEvent]] = {}
    for e in cycle_block:
        iterations.setdefault(e.attempt_index, []).append(e)
    sorted_iters = [iterations[k] for k in sorted(iterations.keys())]
    segments.append(("cycle", sorted_iters))

    if cycle_end < len(events):
        segments.append(("normal", events[cycle_end:]))

    return segments


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

    dot = _STATUS_DOT.get(record.overall_status, "[dim]●[/dim]")
    status_line = Text()
    status_line.append("  status  ", style="dim")
    status_line.append_text(Text.from_markup(f"  {dot}  "))
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

    # ── Node list (with cycle grouping) ────────────────────────────────────
    name_col = max(len(e.node_name) for e in record.steps) + 2
    segments = _segment_events(record.steps)

    for seg_type, seg_data in segments:
        if seg_type == "normal":
            for event in seg_data:  # type: ignore[union-attr]
                _print_node(event, name_col, record)
        else:
            _print_cycle_group(seg_data, name_col, record)  # type: ignore[arg-type]

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


def _print_cycle_group(
    iterations: list[list[NodeEvent]],
    name_col: int,
    record: RunRecord,
) -> None:
    """Render a cycle group as a labelled box with per-iteration sections."""
    n_iters = len(iterations)
    # Node names in the cycle (from first iteration, in order)
    cycle_node_names = " → ".join(e.node_name for e in iterations[0])

    # Build inner content as a single string for Panel
    inner_lines: list[str] = []
    for idx, iter_events in enumerate(iterations):
        # Iteration header
        iter_label = f"[dim cyan]iteration {idx + 1}[/dim cyan]"
        if idx > 0:
            inner_lines.append(f"  [dim]{'─' * 48}[/dim]")
        inner_lines.append(f"  {iter_label}")
        inner_lines.append("")

        for event in iter_events:
            # Build the same compact line as _print_node but without outer indent
            status = event.status
            has_warnings = (
                status == "pass"
                and event.inspection is not None
                and (event.inspection.empty_fields or event.inspection.type_mismatches)
            )
            if status == "pass" and has_warnings:
                icon  = "[bold yellow]~[/bold yellow]"
                label = "[bold green]pass[/bold green] [dim yellow](warnings)[/dim yellow]"
            elif status == "pass":
                icon  = "[bold green]✓[/bold green]"
                label = "[bold green]pass[/bold green]"
            elif status == "fail":
                icon  = "[bold yellow]⚠[/bold yellow]"
                label = "[bold yellow]silent failure[/bold yellow]"
            elif status == "semantic_fail":
                icon  = "[bold magenta]⊗[/bold magenta]"
                label = "[bold magenta]semantic fail[/bold magenta]"
            elif status == "interrupted":
                icon  = "[bold yellow]⏸[/bold yellow]"
                label = "[bold yellow]interrupted[/bold yellow]"
            else:
                icon  = "[bold red]✗[/bold red]"
                label = "[bold red]crashed[/bold red]"

            pad = " " * (name_col - len(event.node_name))
            dur = f"[italic dim]{event.duration_ms:.0f} ms[/italic dim]"
            inner_lines.append(
                f"     [bold]{event.node_name}[/bold]{pad}  {dur}   {icon}  {label}"
            )
            # Validator results
            for vr in event.validator_results:
                vicon = (
                    "[dim green]✓[/dim green]"
                    if vr.is_valid
                    else "[bold magenta]⊗[/bold magenta]"
                )
                inner_lines.append(
                    f"       [dim]└─[/dim]  {vicon} [dim]{vr.validator_name}[/dim]"
                )
        inner_lines.append("")

    inner_text = "\n".join(inner_lines)
    title = (
        f"[bold cyan]↩ cycle[/bold cyan]  "
        f"[dim]{cycle_node_names}[/dim]  "
        f"[bold cyan]×{n_iters}[/bold cyan]"
    )
    panel = Panel(
        inner_text,
        title=title,
        title_align="left",
        border_style="cyan dim",
        padding=(0, 1),
    )
    console.print(panel)
    console.print()


def _print_node(event: NodeEvent, name_col: int, record: RunRecord) -> None:
    insp   = event.inspection
    number = str(event.step_index + 1)
    # indent for └─ lines aligns under the node name
    indent = " " * (len(number) + 2)

    # ── Status icon + label ────────────────────────────────────────────────
    has_warnings = (
        event.status == "pass"
        and insp is not None
        and (insp.empty_fields or insp.type_mismatches)
    )
    if event.status == "pass" and has_warnings:
        icon   = "[bold yellow]~[/bold yellow]"
        label  = "[bold green]pass[/bold green] [dim yellow](warnings)[/dim yellow]"
    elif event.status == "pass":
        icon   = "[bold green]✓[/bold green]"
        label  = "[bold green]pass[/bold green]"
    elif event.status == "fail":
        icon   = "[bold yellow]⚠[/bold yellow]"
        label  = "[bold yellow]silent failure[/bold yellow]"
    elif event.status == "semantic_fail":
        icon   = "[bold magenta]⊗[/bold magenta]"
        label  = "[bold magenta]semantic fail[/bold magenta]"
    elif event.status == "interrupted":
        icon   = "[bold yellow]⏸[/bold yellow]"
        label  = "[bold yellow]interrupted[/bold yellow]"
    else:
        icon   = "[bold red]✗[/bold red]"
        label  = "[bold red]crashed[/bold red]"

    # ── Node name (bold) + duration (italic dim) ───────────────────────────
    pad  = " " * (name_col - len(event.node_name))
    dur  = f"[italic dim]{event.duration_ms:.0f} ms[/italic dim]"
    name = f"[bold]{event.node_name}[/bold]"

    console.print(f"  [dim]{number:>2}[/dim]  {name}{pad}  {dur}   {icon}  {label}")

    # ── Detail lines ───────────────────────────────────────────────────────
    if event.status == "interrupted":
        console.print(
            f"  {indent}[dim]└─[/dim]  "
            "[italic dim]execution paused — awaiting human approval[/italic dim]"
        )
        console.print()
        return

    if event.status == "semantic_fail":
        for vr in event.validator_results:
            if not vr.is_valid:
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f"[bold magenta]{vr.validator_name}[/bold magenta]"
                    f"[italic]  {vr.message}[/italic]"
                )
        console.print()
        return

    if event.status == "pass" and not has_warnings:
        # Still show validator results if any (informational)
        passing = [vr for vr in event.validator_results if vr.is_valid]
        if passing and event.validator_results:
            for vr in passing:
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f"[dim green]✓ {vr.validator_name}[/dim green]"
                )
            console.print()
        return

    if event.status == "pass" and has_warnings:
        successor = _successor_name(event, record)
        if insp.empty_fields:
            for field in insp.empty_fields:
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f'[dim yellow]Field [bold]"{field}"[/bold] is empty[/dim yellow]'
                )
            console.print(
                f"  {indent}[dim]└─[/dim]  "
                f"[dim]{successor} may receive degraded state[/dim]"
            )
        if insp.type_mismatches:
            for m in insp.type_mismatches:
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f'[dim yellow]Field [bold]"{m.field_name}"[/bold] '
                    f"expected {m.expected_type}, got {m.actual_type}[/dim yellow]"
                )
        console.print()
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
        location = _extract_crash_location(event.exception)
        if location:
            console.print(
                f"  {indent}[dim]└─[/dim]  [italic dim]{location}[/italic dim]"
            )
        diagnosis = _diagnose_crash(event.exception, event.input_state or {})
        if diagnosis:
            console.print(
                f"  {indent}[dim]└─[/dim]  [italic dim]{diagnosis}[/italic dim]"
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


def _extract_crash_location(exc_str: str) -> str | None:
    """Extract the last user-code frame from a traceback string."""
    lines = exc_str.splitlines()
    last_file = None
    last_code = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("File ") and i + 1 < len(lines):
            last_file = stripped
            last_code = lines[i + 1].strip()
    if last_file and last_code:
        m = re.search(r'File ".*?([^/\\]+\.py)", line (\d+)', last_file)
        if m:
            return f"at {m.group(1)}:{m.group(2)}  →  {last_code}"
    return None


def _diagnose_crash(exc_str: str, input_state: dict) -> str | None:
    """Return a one-line human-readable diagnosis of the crash."""
    if "IndexError" in exc_str and "list index out of range" in exc_str:
        empty = [k for k, v in input_state.items() if isinstance(v, list) and len(v) == 0]
        if empty:
            return f"Input field '{empty[0]}' was an empty list — nothing to index into"
        return "Tried to index into an empty list"
    if "KeyError" in exc_str:
        m = re.search(r"KeyError: '?([^'\"\n]+)'?", exc_str)
        if m:
            return f"Field '{m.group(1).strip()}' was absent from the incoming state"
    if "AttributeError" in exc_str and "NoneType" in exc_str:
        return "A required field was None — upstream node returned null instead of an object"
    if "TypeError" in exc_str and "NoneType" in exc_str:
        return "Received None where a value was required — check upstream node's output"
    if "ValueError" in exc_str:
        return "Node rejected its input value — schema mismatch from upstream"
    return None

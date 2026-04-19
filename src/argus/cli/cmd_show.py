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


def _load_chain(leaf: RunRecord) -> list[RunRecord]:
    """Walk parent_run_id links from leaf up to root; return [root, ..., leaf]."""
    chain = [leaf]
    current = leaf
    while current.parent_run_id:
        try:
            parent = load_run(current.parent_run_id)
            chain.append(parent)
            current = parent
        except (FileNotFoundError, ValueError):
            break
    chain.reverse()
    return chain

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
    if record.parent_run_id:
        chain = _load_chain(record)
        _print_chain(chain)
    else:
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


_SENTINEL_NODES: frozenset[str] = frozenset({"__start__", "__end__", "START", "END"})


def _dag_layers(
    edge_map: dict[str, list[str]],
    node_names: list[str],
) -> list[list[str]]:
    """BFS layer computation for a DAG. Returns [[layer0_nodes], [layer1_nodes], ...]."""
    known = set(node_names)
    in_degree: dict[str, int] = {n: 0 for n in node_names}
    for src, dests in edge_map.items():
        if src not in known:
            continue
        for dst in dests:
            if dst in known:
                in_degree[dst] = in_degree.get(dst, 0) + 1

    remaining = dict(in_degree)
    queue = [n for n in node_names if in_degree.get(n, 0) == 0]
    layers: list[list[str]] = []
    visited: set[str] = set()

    name_order = {n: i for i, n in enumerate(node_names)}

    while queue:
        layers.append(list(queue))
        visited.update(queue)
        next_layer: list[str] = []
        for node in queue:
            for dst in edge_map.get(node, []):
                if dst not in known or dst in visited:
                    continue
                remaining[dst] -= 1
                if remaining[dst] == 0 and dst not in next_layer:
                    next_layer.append(dst)
        # Sort by declaration order so topology matches graph definition
        next_layer.sort(key=lambda n: name_order.get(n, len(node_names)))
        queue = next_layer

    return layers


def _topology_lines(
    edge_map: dict[str, list[str]],
    node_names: list[str],
) -> list[str]:
    """Return ASCII-art DAG lines. Sequential chains shown as A → B → C.
    Fan-out/fan-in groups shown as a bracket with the sequential tail on the
    middle row:

        ingest
        ├─ analyst_a ──┐
        ├─ analyst_b   │
        ├─ analyst_c  ─┤  aggregator → scorer → reporter
        ├─ analyst_d   │
        └─ analyst_e ──┘
    """
    nodes = [n for n in node_names if n not in _SENTINEL_NODES]
    clean_map: dict[str, list[str]] = {
        src: [d for d in dests if d not in _SENTINEL_NODES]
        for src, dests in edge_map.items()
        if src not in _SENTINEL_NODES
    }
    if not nodes:
        return []

    layers = _dag_layers(clean_map, nodes)
    if not layers:
        # No edges — show as a plain chain in declaration order
        return ["  " + " → ".join(nodes)]

    # Classify layers: collect parallel groups and absorb their sequential tails
    # so the tail appears inline on the middle row.
    items: list = []  # ("seq", node) | ("parallel", [nodes], [tail_nodes])
    i = 0
    while i < len(layers):
        layer = layers[i]
        if len(layer) == 1:
            items.append(("seq", layer[0]))
            i += 1
        else:
            tail: list[str] = []
            j = i + 1
            while j < len(layers) and len(layers[j]) == 1:
                tail.append(layers[j][0])
                j += 1
            items.append(("parallel", layer, tail))
            i = j

    result: list[str] = []
    seq_buf: list[str] = []

    def _flush() -> None:
        if seq_buf:
            result.append("  " + " → ".join(seq_buf))
            seq_buf.clear()

    for item in items:
        if item[0] == "seq":
            seq_buf.append(item[1])
            continue

        _flush()
        layer: list[str] = item[1]
        tail_nodes: list[str] = item[2]
        tail_str = " → ".join(tail_nodes)
        n = len(layer)
        mid = n // 2
        max_len = max(len(name) for name in layer)

        for k, node in enumerate(layer):
            # pad_w: extra width so the bracket column aligns for all names
            pad_w = max_len - len(node) + 1  # +1 guarantees min 1 char gap

            if k == 0:
                prefix  = "  ├─ "
                fill    = "─" * pad_w
                bracket = "─┐"
            elif k == n - 1:
                prefix  = "  └─ "
                fill    = "─" * pad_w
                bracket = "─┘"
            elif k == mid and tail_str:
                prefix  = "  ├─ "
                fill    = " " * pad_w
                bracket = "─┤  " + tail_str
            else:
                prefix  = "  ├─ "
                fill    = " " * pad_w
                bracket = " │"

            result.append(f"{prefix}{node}{fill}{bracket}")

    _flush()
    return result


def _find_parallel_groups(
    edge_map: dict[str, list[str]],
) -> dict[str, list[str]]:
    """Return {fan_in_node: [parallel_node, ...]} for nodes with 2+ incoming sources."""
    reverse: dict[str, list[str]] = {}
    for src, dests in edge_map.items():
        for dst in dests:
            reverse.setdefault(dst, []).append(src)
    return {dst: srcs for dst, srcs in reverse.items() if len(srcs) >= 2}


def _segment_events(
    events: list[NodeEvent],
    edge_map: dict[str, list[str]] | None = None,
) -> list[tuple[str, object]]:
    """Split events into normal, cycle, and parallel segments.

    Returns a list of:
        ("normal",   [NodeEvent, ...])
        ("cycle",    [[iter0_events], [iter1_events], ...])
        ("parallel", [NodeEvent, ...])
    """
    counts = Counter(e.node_name for e in events)
    cyclic_names = {name for name, c in counts.items() if c > 1}

    # Detect parallel fan-out members
    parallel_members: set[str] = set()
    if edge_map:
        groups = _find_parallel_groups(edge_map)
        parallel_members = {node for nodes in groups.values() for node in nodes}

    if not cyclic_names and not parallel_members:
        return [("normal", events)]

    # Cycle grouping takes priority (cyclic graphs with parallel branches are rare)
    if cyclic_names:
        cycle_indices = [i for i, e in enumerate(events) if e.node_name in cyclic_names]
        cycle_start = cycle_indices[0]
        cycle_end = cycle_indices[-1] + 1

        segments: list[tuple[str, object]] = []
        if cycle_start > 0:
            segments.append(("normal", events[:cycle_start]))

        cycle_block = events[cycle_start:cycle_end]
        iterations: dict[int, list[NodeEvent]] = {}
        for e in cycle_block:
            iterations.setdefault(e.attempt_index, []).append(e)
        sorted_iters = [iterations[k] for k in sorted(iterations.keys())]
        segments.append(("cycle", sorted_iters))

        if cycle_end < len(events):
            segments.append(("normal", events[cycle_end:]))
        return segments

    # Parallel segmentation: collect contiguous runs of parallel members
    segments = []
    normal_buf: list[NodeEvent] = []
    parallel_buf: list[NodeEvent] = []

    for event in events:
        if event.node_name in parallel_members:
            parallel_buf.append(event)
        else:
            if parallel_buf:
                if normal_buf:
                    segments.append(("normal", normal_buf))
                    normal_buf = []
                segments.append(("parallel", parallel_buf))
                parallel_buf = []
            normal_buf.append(event)

    if parallel_buf:
        if normal_buf:
            segments.append(("normal", normal_buf))
            normal_buf = []
        segments.append(("parallel", parallel_buf))
    if normal_buf:
        segments.append(("normal", normal_buf))

    return segments


def _print_chain(chain: list[RunRecord]) -> None:
    """Print a unified view of a multi-run interrupt chain."""
    root = chain[0]
    leaf = chain[-1]
    n_interrupts = len(chain) - 1

    started = (root.started_at or "")[:16].replace("T", "  ")
    status_style = _STATUS_STYLE.get(leaf.overall_status, "dim")

    console.print()
    header = Text()
    header.append("argus", style="bold italic")
    header.append(f"  {root.run_id}  ·  {started}", style="italic dim")
    console.print(f"  {header}")

    dot = _STATUS_DOT.get(leaf.overall_status, "[dim]●[/dim]")
    status_line = Text()
    status_line.append("  status  ", style="dim")
    status_line.append_text(Text.from_markup(f"  {dot}  "))
    status_line.append(leaf.overall_status, style=status_style)
    console.print(status_line)

    interrupt_label = f"{n_interrupts} human interrupt{'s' if n_interrupts > 1 else ''}"
    console.print(f"  [bold yellow]⏸[/bold yellow]  [italic dim]{interrupt_label}[/italic dim]")

    console.print()
    console.print(Rule(style="dim"))
    console.print()

    all_steps = [e for r in chain for e in r.steps]
    if not all_steps:
        return
    name_col = max(len(e.node_name) for e in all_steps) + 2

    # Merge edge maps from all runs so _successor_name works across segment boundaries
    combined_edge_map: dict[str, list[str]] = {}
    for r in chain:
        combined_edge_map.update(r.graph_edge_map)

    global_idx = 0
    for i, run in enumerate(chain):
        # Build a minimal record with the combined edge map for context lookups
        ctx = RunRecord(
            run_id=run.run_id,
            argus_version=run.argus_version,
            started_at=run.started_at,
            completed_at=run.completed_at,
            duration_ms=run.duration_ms,
            overall_status=run.overall_status,
            first_failure_step=run.first_failure_step,
            root_cause_chain=run.root_cause_chain,
            graph_node_names=run.graph_node_names,
            graph_edge_map=combined_edge_map,
            initial_state=run.initial_state,
            steps=run.steps,
        )

        segments = _segment_events(run.steps, edge_map=combined_edge_map)
        for seg_type, seg_data in segments:
            if seg_type == "normal":
                for event in seg_data:  # type: ignore[union-attr]
                    _print_node(event, name_col, ctx, display_index=global_idx)
                    global_idx += 1
            elif seg_type == "parallel":
                _print_parallel_group(seg_data, name_col)  # type: ignore[arg-type]
                global_idx += len(seg_data)  # type: ignore[arg-type]
            else:
                _print_cycle_group(seg_data, name_col, ctx)  # type: ignore[arg-type]
                for iter_events in seg_data:
                    global_idx += len(iter_events)

        # Interrupt separator between segments
        if i < len(chain) - 1:
            next_run = chain[i + 1]
            console.print(
                Rule(
                    f"[bold yellow]⏸  human interrupt[/bold yellow]"
                    f"  [dim]resumed  {next_run.run_id}[/dim]",
                    style="yellow dim",
                )
            )
            console.print()

    if leaf.root_cause_chain:
        console.print()
        console.print(Rule(style="dim"))
        chain_str = "  →  ".join(leaf.root_cause_chain)
        rc = Text()
        rc.append("  root cause  ", style="italic dim")
        rc.append(chain_str, style="bold red")
        console.print(rc)

    console.print()


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

    # ── Graph topology ─────────────────────────────────────────────────────
    topo = _topology_lines(record.graph_edge_map, record.graph_node_names)
    if topo and len(record.graph_node_names) > 1:
        console.print("  [dim]graph[/dim]")
        console.print()
        for line in topo:
            console.print(f"[dim]{line}[/dim]")
        console.print()
        console.print(Rule(style="dim"))
        console.print()

    # ── Node list (with cycle / parallel grouping) ─────────────────────────
    name_col = max(len(e.node_name) for e in record.steps) + 2
    segments = _segment_events(record.steps, edge_map=record.graph_edge_map)

    for seg_type, seg_data in segments:
        if seg_type == "normal":
            for event in seg_data:  # type: ignore[union-attr]
                _print_node(event, name_col, record)
        elif seg_type == "parallel":
            _print_parallel_group(seg_data, name_col)  # type: ignore[arg-type]
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
                and (
                    event.inspection.empty_fields
                    or event.inspection.type_mismatches
                    or (event.inspection.tool_failures and not event.inspection.has_tool_failure)
                )
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


def _print_parallel_group(
    events: list[NodeEvent],
    name_col: int,
) -> None:
    """Render a fan-out group as a blue panel showing nodes that ran in parallel."""
    node_names = " · ".join(e.node_name for e in events)
    inner_lines: list[str] = []

    for event in events:
        status = event.status
        has_warnings = (
            status == "pass"
            and event.inspection is not None
            and (
                event.inspection.empty_fields
                or event.inspection.type_mismatches
                or (event.inspection.tool_failures and not event.inspection.has_tool_failure)
            )
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
            f"  [bold]{event.node_name}[/bold]{pad}  {dur}   {icon}  {label}"
        )
        if event.exception:
            first_line = event.exception.splitlines()[0]
            inner_lines.append(f"     [dim]└─[/dim]  [italic]{first_line}[/italic]")
        for vr in event.validator_results:
            vicon = (
                "[dim green]✓[/dim green]"
                if vr.is_valid
                else "[bold magenta]⊗[/bold magenta]"
            )
            inner_lines.append(
                f"     [dim]└─[/dim]  {vicon} [dim]{vr.validator_name}[/dim]"
            )

    inner_text = "\n".join(inner_lines)
    title = (
        f"[bold blue]⟼ parallel[/bold blue]  "
        f"[dim]{node_names}[/dim]"
    )
    panel = Panel(
        inner_text,
        title=title,
        title_align="left",
        border_style="blue dim",
        padding=(0, 1),
    )
    console.print(panel)
    console.print()


def _print_node(
    event: NodeEvent, name_col: int, record: RunRecord, display_index: int | None = None
) -> None:
    insp   = event.inspection
    number = str((display_index if display_index is not None else event.step_index) + 1)
    # indent for └─ lines aligns under the node name
    indent = " " * (len(number) + 2)

    # ── Status icon + label ────────────────────────────────────────────────
    has_warnings = (
        event.status == "pass"
        and insp is not None
        and (
            insp.empty_fields
            or insp.type_mismatches
            or insp.unannotated_successors
            or insp.suspicious_empty_keys
            or (insp.tool_failures and not insp.has_tool_failure)
        )
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

    # ── Failure type tag — aligned to label column, one per row ────────────
    if event.status == "fail" and insp:
        dur_len = len(f"{event.duration_ms:.0f} ms")
        label_col = 14 + name_col + dur_len
        if insp.is_silent_failure:
            console.print(" " * label_col + "[yellow underline]context error[/yellow underline]")
        if insp.has_tool_failure:
            console.print(" " * label_col + "[yellow underline]tool failure[/yellow underline]")

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
                    f'[dim]Field [bold]"{field}"[/bold] is empty[/dim]'
                )
            console.print(
                f"  {indent}[dim]└─[/dim]  "
                f"[dim]{successor} may receive degraded state[/dim]"
            )
        if insp.type_mismatches:
            for m in insp.type_mismatches:
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f'[dim]Field [bold]"{m.field_name}"[/bold] '
                    f"expected {m.expected_type}, got {m.actual_type}[/dim]"
                )
        if insp.unannotated_successors:
            names = ", ".join(insp.unannotated_successors)
            console.print(
                f"  {indent}[dim]└─[/dim]  "
                f"[dim]silent-failure detection skipped — "
                f"add type hints to: {names}[/dim]"
            )
        if insp.suspicious_empty_keys:
            for key in insp.suspicious_empty_keys:
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f'[dim]Output key [bold]"{key}"[/bold] is '
                    f"empty (may degrade downstream)[/dim]"
                )
        if insp.tool_failures:
            for tf in insp.tool_failures:
                tf_icon = (
                    "[bold red]⚠[/bold red]"
                    if tf.severity == "critical"
                    else "[bold yellow]~[/bold yellow]"
                )
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f'{tf_icon} [dim]Tool {tf.failure_type}: '
                    f'field [bold]"{tf.field_name}"[/bold] — {tf.evidence}[/dim]'
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
        if insp.tool_failures:
            for tf in insp.tool_failures:
                tf_icon = (
                    "[bold red]⚠[/bold red]"
                    if tf.severity == "critical"
                    else "[bold yellow]~[/bold yellow]"
                )
                console.print(
                    f"  {indent}[dim]└─[/dim]  "
                    f'{tf_icon} [dim]Tool {tf.failure_type}: '
                    f'field [bold]"{tf.field_name}"[/bold] — {tf.evidence}[/dim]'
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

"""``argus locate`` — post-hoc source file resolution for a run."""

from __future__ import annotations

from rich.console import Console

from argus.source_locator import derive_node_fn_refs, locate_node_sources
from argus.storage import load_run, save_run

console = Console()


def locate_sources(run_id: str, *, save: bool = True) -> None:
    """Resolve source ``file:line`` for all nodes in a run."""
    record = load_run(run_id)
    resolved = locate_node_sources(record)

    if not resolved:
        console.print("  [yellow]No node sources could be resolved.[/yellow]")
        return

    max_name = max(len(n) for n in resolved) if resolved else 0
    for node, path in resolved.items():
        console.print(f"  {node:>{max_name}}  →  [cyan]{path}[/cyan]")

    if save:
        record.node_fn_paths = resolved
        # Also derive node_fn_refs for factory-free replay
        if not record.node_fn_refs:
            refs = derive_node_fn_refs(resolved)
            if refs:
                record.node_fn_refs = refs
        save_run(record)
        console.print(f"\n  [green]Saved to run {record.run_id}[/green]")

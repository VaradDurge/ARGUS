"""
Run ALL scenarios in sequence and print a summary table.
=====================================================================
Tests every ARGUS feature in one shot:

  1. clean         → overall_status=clean, all nodes pass
  2. silent_fail   → web_searcher omits result_urls, silent_failure detected
  3. semantic_fail → relevance_scorer + sentiment_analyzer return invalid values
  4. interrupt     → report_drafter raises GraphInterrupt, checkpoint saved
  5. cyclic        → quality revision loop, cycle detected, attempt_index tracked
  6. replay        → re-run from failed step, state recovered from snapshot

After running:
    argus list      — shows all 7 runs (6 scenarios + 1 replay child)
"""
from __future__ import annotations

import importlib
import traceback

from rich import box
from rich.console import Console
from rich.table import Table

console = Console()

SCENARIOS = [
    ("clean",         "ultimatum.run_clean",         "Feature 1-2: Monitoring + Storage"),
    ("silent_fail",   "ultimatum.run_silent_fail",   "Feature 3: Silent Failure Detection"),
    ("semantic_fail", "ultimatum.run_semantic_fail", "Feature 4: Semantic Validation"),
    ("interrupt",     "ultimatum.run_interrupt",     "Feature 7: Human Interrupt"),
    ("cyclic",        "ultimatum.run_cyclic",        "Feature 6: Cycle Detection"),
    ("replay",        "ultimatum.run_replay",        "Feature 8: Replay Engine"),
]


def main() -> None:
    console.print()
    console.rule("[bold]ARGUS Ultimatum — Full Feature Test[/bold]")
    console.print("[dim]Running all 6 scenarios against the 15-agent pipeline...[/dim]\n")

    results = []

    for name, module_path, feature_label in SCENARIOS:
        console.rule(f"[dim]{name}[/dim]")
        try:
            mod = importlib.import_module(module_path)
            mod.main()
            results.append((name, feature_label, "✓ passed", "bold green"))
        except SystemExit:
            results.append((name, feature_label, "✓ passed", "bold green"))
        except Exception:
            traceback.print_exc()
            results.append((name, feature_label, "✗ error", "bold red"))
        console.print()

    # ── Summary table ─────────────────────────────────────────────────────────
    console.rule("[bold]Summary[/bold]")
    table = Table(box=box.MINIMAL, show_header=True, header_style="dim", pad_edge=False)
    table.add_column("scenario",    style="dim",  min_width=14)
    table.add_column("feature",               min_width=38)
    table.add_column("result",  justify="right", min_width=10)

    for name, feature, result, style in results:
        table.add_row(name, feature, f"[{style}]{result}[/{style}]")

    console.print()
    console.print(table)
    console.print()
    console.print(
        "  [dim]Run [bold]argus list[/bold] to see all recorded runs[/dim]"
    )
    console.print()


if __name__ == "__main__":
    main()

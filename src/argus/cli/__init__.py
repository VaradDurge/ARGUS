from __future__ import annotations

from rich.console import Console
from rich.rule import Rule

_console = Console()


def print_footer() -> None:
    """Print the standard argus help footer after any command output."""
    _console.print(Rule(style="dim"))
    _console.print()
    _console.print(
        "  [dim]argus [bold]--help[/bold]  ·  full command reference & setup guide[/dim]"
    )
    _console.print()

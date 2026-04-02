from __future__ import annotations

from argus import ArgusWatcher
from argus.storage import last_run_id, load_run
from test_workflow.graph import build_graph

# ANSI — bold makes node names heavier than the surrounding terminal text,
# italic (supported in iTerm2, Windows Terminal, VS Code) separates metadata.
_RESET  = "\033[0m"
_BOLD   = "\033[1m"
_ITALIC = "\033[3m"
_DIM    = "\033[2m"
_GREEN  = "\033[32m"
_RED    = "\033[31m"


def main() -> None:
    graph = build_graph()
    watcher = ArgusWatcher()
    watcher.watch(graph)
    app = graph.compile()
    app.invoke({"topic": "quantum computing"})
    if watcher._session:
        watcher._session.force_finalize()

    record = load_run(last_run_id())
    col = max(len(s.node_name) for s in record.steps) + 6

    print()
    for step in record.steps:
        pad = " " * (col - len(step.node_name))
        name = f"{_BOLD}{step.node_name}{_RESET}"
        if step.status == "pass":
            result = f"{_GREEN}{_BOLD}✓  PASSED{_RESET}"
        else:
            result = f"{_RED}{_BOLD}✗  FAILED{_RESET}"
        print(f"  {name}{pad}{result}")

    print()
    if record.overall_status == "clean":
        status_str = f"{_GREEN}{_BOLD}{record.overall_status}{_RESET}"
    else:
        status_str = f"{_RED}{_BOLD}{record.overall_status}{_RESET}"

    print(f"  {_DIM}status{_RESET}   {status_str}")
    print(f"  {_DIM}{_ITALIC}run  argus show last  for full details{_RESET}")
    print()


if __name__ == "__main__":
    main()

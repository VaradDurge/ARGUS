# ARGUS — Agentic Realtime Guard and Unified Scope

Silent watcher for LangGraph multiagent pipelines. Detects silent failures, captures full state, and enables step-level replay — with just 2 lines of integration code.

## Installation

```bash
pip install argus-agents
```

## Quick Start

```python
from argus import ArgusWatcher

watcher = ArgusWatcher()
watcher.watch(graph)   # call before graph.compile()

app = graph.compile()
result = app.invoke(initial_state)
```

Then inspect results from the CLI:

```bash
argus show last
argus list
argus inspect <run-id> --step <node-name>
argus replay <run-id> --from-step <node> --app your_module:build_graph
```

## What It Does

- **Silent failure detection** — finds nodes that complete without exceptions but drop required fields or pass empty/mistyped data to the next node
- **Full state capture** — snapshots input and output state at every node transition
- **Step-level replay** — re-run a pipeline from any saved step using stored input state
- **Local-first** — no cloud, no API key; everything stored in `.argus/runs/` as JSON

## License

MIT

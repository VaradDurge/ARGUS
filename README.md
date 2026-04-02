# ARGUS

A monitoring library for LangGraph pipelines. Two lines to integrate — ARGUS captures node inputs/outputs, catches silent failures before they propagate, and lets you replay any run from the step it broke.

---

## 📕The problem

LangGraph pipelines fail silently. A node runs, returns an incomplete dict, and the next node either crashes on a missing key or produces garbage with no error. By the time you notice, the state has been overwritten and the original failure is gone.

ARGUS catches this at the boundary between nodes, before it cascades.

---

## Installation

```bash
pip install argus-agents
```

From source:

```bash
git clone https://github.com/VaradDurge/ARGUS.git
cd ARGUS
pip install -e ".[dev]"
```

Requires Python 3.9+ and LangGraph 0.2+.

---

## Usage

```python
from argus import ArgusWatcher
from langgraph.graph import StateGraph

graph = StateGraph(MyState)
graph.add_node("fetch", fetch_node)
graph.add_node("analyze", analyze_node)
graph.add_edge("fetch", "analyze")

watcher = ArgusWatcher()
watcher.watch(graph)  # before compile()

app = graph.compile()
result = app.invoke(initial_state)
```

No decorators, no changes to your node functions.

---

## How it works

ARGUS patches node functions at the graph level before `compile()`. After each node executes, it:

- Captures the full input and output state as a JSON snapshot
- Checks the output against what the next node's type annotation expects
- Flags missing required fields, empty fields, and primitive type mismatches
- Writes the run record to `.argus/runs/<run-id>.json`

Detection is driven by the successor node's type annotations. TypedDict and Pydantic both work.

---

## Features

**Silent failure detection👀** — if a node forgets to populate a field that the next node requires, ARGUS flags it right after that node runs:

```
overall_status: silent_failure
first_failure_step: fetch_agent
root_cause_chain: ['fetch_agent', 'analyze_agent']
```

**Per-node snapshots📸** — every run records input state, output dict, duration, timestamp, and full traceback on crash.

**Root cause chaining⛓️** — when multiple nodes fail in sequence, ARGUS walks the event chain back to where it started.

**Step-level replay▶️** — re-run from any saved step with the exact input state that was captured:

```bash
argus replay <run-id> analyze_agent --app my_module:build_graph
```

`build_graph` is a zero-argument function that returns an uncompiled `StateGraph`. ARGUS re-instruments it and saves the replay as a new run.

**Local storage** — runs are plain JSON under `.argus/runs/`. No database, no cloud.

---

## CLI

```bash
argus list                                            # all runs, newest first
argus show last                                       # most recent run
argus show run a1b2c3d4                               # by full or 8-char prefix ID
argus inspect a1b2c3d4 --step analyze_agent           # full snapshot for a node
argus replay a1b2c3d4 analyze_agent --app my_module:build_graph
```

---

## Example output

```
Run ID:  a1b2c3d4e5f6...
Status:  silent_failure
Started: 2026-04-02T10:23:11Z   Duration: 842ms

  Step  Node             Status   Duration
  ────  ───────────────  ───────  ────────
  0     research_agent   pass     210ms
  1     analysis_agent   fail     312ms    ← Missing: kb_articles
  2     validation_agent pass     —

Root cause chain: research_agent → analysis_agent
```

---

## License

MIT

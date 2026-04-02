# ARGUS

**Agentic Realtime Guard and Unified Scope**

A non-invasive monitoring library for LangGraph pipelines. Drop it in with two lines of code — ARGUS captures every node's input/output, detects silent failures before they propagate, and lets you replay any failed run from the exact step it broke.

---

## The Problem

LangGraph pipelines fail silently. A node runs, returns an incomplete dict, and the next node crashes on a missing key — or worse, produces garbage output with no error. By the time you notice, the state has been overwritten and the original failure is gone.

ARGUS catches this class of bug at the boundary between nodes, before it cascades.

---

## Installation

```bash
pip install argus-langgraph
```

Or from source:

```bash
git clone https://github.com/VaradDurge/ARGUS.git
cd ARGUS
pip install -e ".[dev]"
```

**Requirements:** Python 3.9+, LangGraph 0.2+

---

## Integration (2 lines)

```python
from argus import ArgusWatcher
from langgraph.graph import StateGraph

graph = StateGraph(MyState)
graph.add_node("fetch", fetch_node)
graph.add_node("analyze", analyze_node)
graph.add_edge("fetch", "analyze")

# --- add these two lines ---
watcher = ArgusWatcher()
watcher.watch(graph)           # call before compile()
# ---------------------------

app = graph.compile()
result = app.invoke(initial_state)   # runs normally; ARGUS captures everything
```

That's it. No decorators, no middleware, no changes to your node functions.

---

## How It Works

ARGUS wraps each node function at the graph level (not the function level), so your code stays untouched. After every node:

1. **Captures** the full input and output state as a JSON snapshot
2. **Inspects** the output against what the next node's type annotation expects
3. **Flags** missing required fields (`silent_failure`), empty fields, and primitive type mismatches
4. **Writes** a run record to `.argus/runs/<run-id>.json`

Detection is driven by the type annotations on successor node functions — TypedDict and Pydantic models both work out of the box. No extra configuration needed.

---

## Features

### Silent Failure Detection

If a node forgets to populate a field that the next node requires, ARGUS flags it immediately after that node runs — before the next node ever executes.

```
overall_status: silent_failure
first_failure_step: fetch_agent
root_cause_chain: ['fetch_agent', 'analyze_agent']
```

### Per-Node State Snapshots

Every run records:
- Input state entering each node
- Output dict returned by each node
- Execution duration in milliseconds
- UTC timestamp
- Full exception traceback (if crashed)
- Inspection result: missing fields, empty fields, type mismatches

### Crash Capture

Unhandled exceptions inside nodes are caught, recorded with a full traceback, and the run is finalized — so you can inspect what the state looked like right before the crash.

### Root Cause Chaining

When multiple nodes fail in sequence, ARGUS walks backward through the event chain to identify where the failure originated.

### Step-Level Replay

Re-run a pipeline from any saved step using the exact input state that was captured at that point:

```bash
argus replay <run-id> analyze_agent --app my_module:build_graph
```

`build_graph` should be a zero-argument function that returns an uncompiled `StateGraph`. ARGUS re-instruments it automatically and saves the replay as a new run.

### Local-First Storage

Runs are stored as plain JSON under `.argus/runs/`. No database, no cloud, no external dependencies beyond LangGraph itself.

---

## CLI

```bash
# List all recorded runs (reverse chronological)
argus list

# Show the most recent run
argus show last

# Show a specific run by full or 8-char prefix ID
argus show run a1b2c3d4

# Dump full input/output snapshot for a specific node
argus inspect a1b2c3d4 --step analyze_agent

# Replay a run from a specific node
argus replay a1b2c3d4 analyze_agent --app my_module:build_graph
```

---

## Example Output

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

## What ARGUS Does Not Do

- Does not modify your node functions
- Does not require changes to your state schema
- Does not send data outside your local machine
- Does not add latency beyond snapshot serialization (~microseconds per node)

---

## Next Release — `argus diff`

The next release introduces **argus diff**: compare a node's output across two runs side-by-side. See exactly which fields changed, what values shifted, and whether a fix introduced any regressions — useful when iterating on prompts or agent logic where output is non-deterministic.

---

## License

MIT

# ARGUS

**Node-level monitoring for LangGraph pipelines.** Catches silent failures between agents, traces root causes across the chain, validates semantic correctness, and replays any run from the exact node it broke — without re-running what already worked.

Works with LangGraph out of the box. Works with any Python pipeline (Prefect, Temporal, raw functions) via `ArgusSession`.

---

<img src="https://github.com/VaradDurge/ARGUS/blob/master/assets/ARGUS_ui.png" width="600"/>

---

## The problem

Multi-agent pipelines fail in ways that are invisible until it's too late.

A node runs, returns a dict with a missing field. No exception. The next node receives that state, can't find what it needs, returns an empty result. No exception. The node after that crashes on the empty result — and that's the error you see. By that point the original cause is two nodes upstream, the state has been overwritten, and you have no record of what any node actually produced.

ARGUS catches this **at the boundary between nodes**, the moment it happens, before it cascades.

---

## Install

```bash
pip install argus-agents
```

```bash
# from source
git clone https://github.com/VaradDurge/ARGUS.git
cd ARGUS
pip install -e ".[dev]"
```

Requires Python 3.9+ and LangGraph 0.2+ (optional — only needed for the LangGraph adapter).

---

## Quickstart

### LangGraph

```python
from argus import ArgusWatcher

watcher = ArgusWatcher()
watcher.watch(graph)       # call before graph.compile()
app = graph.compile()
result = app.invoke(state)
watcher.finalize()         # required for cyclic graphs; safe to call always
```

No changes to node functions. No decorators. Three lines.

`watch()` accepts both an uncompiled `StateGraph` and an already-compiled app — if you pass a compiled graph, ARGUS unwraps it internally.

### Any Python pipeline (Prefect, Temporal, raw functions)

```python
from argus import ArgusSession

session = ArgusSession(validators={
    "classify": lambda o: (o.get("label") in ["A","B","C"], "invalid label"),
    "*":        lambda o: ("error" not in o, f"error present: {o.get('error')}"),
})
session.set_edges({"fetch": ["validate"], "validate": ["process"]})

wrapped = session.instrument({
    "fetch":    fetch_fn,
    "validate": validate_fn,
    "process":  process_fn,
})

state = wrapped["fetch"](initial_state)
state = wrapped["validate"](state)
state = wrapped["process"](state)
session.finalize()
```

Or use the decorator at definition time:

```python
@session.node("fetch")
def fetch(state: MyState) -> dict:
    ...   # your agent code — untouched
```

---

## CLI

```bash
argus list                                             # all runs, newest first
argus show last                                        # most recent run
argus show run <id>                                    # by full id or 8-char prefix
argus replay <id> <node> --app my_module:build_graph   # re-run from a specific node
argus inspect <id> --step <node>                       # dump raw input/output for a node
argus diff <id>                                        # diff a replay against its original
argus diff <id-a> <id-b>                               # diff any two runs
```

Run `argus --help` for the full setup guide, when-to-use notes, and flag reference.

---

## What the output looks like

**Silent failure — root cause two nodes upstream:**

```
argus  20240405-abc12345  ·  2024-04-05 12:30  ·  1243 ms
status  ●  silent_failure

────────────────────────────────────────────────────────────

   1  fetch       43 ms    ✓  pass
   2  validate    12 ms    ⚠  silent failure
      └─  Field "score" is missing
      └─  process received bad state
   3  process    891 ms    ✗  crashed
      └─  KeyError: 'score'
      └─  at pipeline.py:47  →  result = state["score"] * weight
      └─  Field 'score' was absent from the incoming state

────────────────────────────────────────────────────────────
root cause   validate
```

**Parallel execution — fan-out nodes shown as a blue panel:**

```
argus  20240405-abc12345  ·  2024-04-05 14:10  ·  834 ms
status  ●  clean

────────────────────────────────────────────────────────────

  graph

    ingest
    ├─ analyst_a ──┐
    ├─ analyst_b   │
    ├─ analyst_c  ─┤  aggregator → scorer → reporter
    ├─ analyst_d   │
    └─ analyst_e ──┘

────────────────────────────────────────────────────────────

   1  ingest       91 ms    ✓  pass

╭─ ⟼ parallel  analyst_a · analyst_b · analyst_c · analyst_d · analyst_e ──╮
│  analyst_a   210 ms   ✓  pass                                              │
│  analyst_b   198 ms   ✓  pass                                              │
│  analyst_c   231 ms   ✓  pass                                              │
│  analyst_d   187 ms   ✓  pass                                              │
│  analyst_e   203 ms   ✓  pass                                              │
╰────────────────────────────────────────────────────────────────────────────╯

   7  aggregator   44 ms    ✓  pass
```

**Cyclic graphs — iterations grouped into a labelled box:**

```
╭─ ↩ cycle  validator → corrector × 3 ──────────────────────────╮
│   iteration 1                                                   │
│                                                                 │
│      validator   0 ms   ✓  pass                                 │
│      corrector   0 ms   ✓  pass                                 │
│                                                                 │
│   ─────────────────────────────────────────────────────────     │
│   iteration 2                                                   │
│   ...                                                           │
╰─────────────────────────────────────────────────────────────────╯
```

**Human interrupt chains — full trace stitched on resume:**

```
argus  20240405-abc12345  ·  2024-04-05 12:30
status    ●  clean
⏸  1 human interrupt

────────────────────────────────────────────────────────────

   1  brief_generator    0 ms   ✓  pass
   2  content_writer     0 ms   ✓  pass
   3  human_reviewer     0 ms   ⏸  interrupted
      └─  execution paused — awaiting human approval

──────── ⏸  human interrupt  resumed  20240405-xyz99999 ────

   4  content_reviser    0 ms   ✓  pass
   5  publisher          0 ms   ✓  pass
```

**Diff — comparing a replay against the original:**

```
argus diff  abc12345  →  def67890

────────────────────────────────────────────────────────────

   fetch       ✓ pass       →  ✓ pass       43 ms  →  41 ms
   validate    ⚠ fail       →  ✓ pass      (fixed)
     └─  summary: was "" (13 chars now)
   process     ✗ crashed    →  ✓ pass      (fixed)

────────────────────────────────────────────────────────────
2 nodes changed  ·  2 fixed
```

---

# In Depth

---

## The core problems in multi-agent development

1. **Silent failures** — A node returns `{}`, `None`, or a dict missing a required field. Python doesn't raise. Everything "runs." The failure surfaces 3 nodes later as a crash on an unrelated-looking `KeyError`.
2. **No post-hoc observability** — You have no record of what state each node received or produced. Debugging means re-running with `print()` inserted.
3. **Blame misattribution** — The node that crashes is not the node that caused the failure. You debug the wrong thing.
4. **Human interrupt gaps** — When a graph pauses for human approval, the paused state is lost. You can't resume cleanly or know which runs are waiting.
5. **Cyclic graph blind spots** — Graphs with feedback loops auto-finalize at the wrong time, cutting off half the run.
6. **Boilerplate at scale** — Wrapping 15 agents individually for logging, timing, and error capture is tedious and inconsistent.
7. **Semantic correctness invisible** — An LLM that returns `{"label": "UNKNOWN"}` when the pipeline expects `"positive"`, `"negative"`, or `"neutral"` is structurally correct. Structural checks pass. Downstream logic silently corrupts.
8. **Expensive reruns** — A 15-node pipeline fails at node 9. You fix the bug. You re-run nodes 1–8 again, burning API credits to get back to where you were.

---

## Feature 1: Zero-Intrusion Monitoring

`session.wrap(node_name, fn)` returns a monitored version of your function that is identical to the original from the caller's perspective. Your code is untouched.

```python
@session.node("fetch")
def fetch(state: MyState) -> dict:
    result = llm.invoke(state["query"])
    return {"response": result}
```

When `fetch(state)` is called, ARGUS:
1. Serializes the full input state to a snapshot
2. Starts a `perf_counter` timer
3. Runs your original function
4. Captures output, duration, timestamp
5. Runs all inspection and validation
6. Appends a `NodeEvent` to the session

Both sync and async functions are handled — the wrapper detects `asyncio.iscoroutinefunction()` and preserves async behavior.

**`instrument()` for bulk wrapping:**

```python
wrapped = session.instrument(
    agents={
        "fetch":    fetch_fn,
        "clean":    clean_fn,
        "classify": classify_fn,
    },
    edges={
        "fetch":  ["clean"],
        "clean":  ["classify"],
    },
)
```

---

## Feature 2: State Snapshot Capture

Every node execution stores a `NodeEvent`:

```
NodeEvent {
    step_index:    int          # execution order, 0-indexed
    node_name:     str
    input_state:   dict         # full state BEFORE the node ran
    output_dict:   dict | None  # full state AFTER (None if crashed)
    duration_ms:   float
    timestamp_utc: str          # ISO-8601 UTC
    exception:     str | None   # full traceback on crash
    attempt_index: int          # how many times this node ran before (cyclic graphs)
}
```

`safe_serialize` converts TypedDicts, Pydantic models, dataclasses, and LangChain objects to plain dicts. Fields larger than `max_field_size` (default 50,000 chars) are truncated with a marker.

---

## Feature 3: Silent Failure Detection

After every node completes, ARGUS inspects the transition to the next node using its type annotations.

1. Look up outbound edges for the current node
2. Get the function objects for each successor
3. Read the first parameter's type annotation
4. Introspect it — supports TypedDict, Pydantic v1/v2, dataclasses
5. For every expected field, check the actual merged state:
   - Field absent → `missing_fields` → status becomes `"fail"`
   - Field is `None`, `""`, `[]`, `{}` → `empty_fields` → warning
   - Field present but wrong type → `type_mismatches` → warning

No configuration — ARGUS reads your existing type annotations:

```python
class ValidateState(TypedDict):
    response: str
    score: float
    metadata: NotRequired[dict]
```

If `fetch` doesn't put `score` in its output, ARGUS flags it the moment `fetch` completes — before `validate` even runs.

---

## Feature 4: Semantic Validation

Structural checks catch missing fields. They don't catch wrong values. An LLM returning `{"label": "UNKNOWN"}` when only `"positive"`, `"negative"`, `"neutral"` are valid passes every structural check.

Validator lambdas let you define what correct means:

```python
validators = {
    "classify": lambda o: (o.get("label") in ["positive","negative","neutral"], "invalid label"),
    "summarize": lambda o: (len(o.get("summary","")) > 50, "summary too short"),
    "*":         lambda o: ("error" not in o, f"error field present: {o.get('error')}"),
}
```

`"*"` is a wildcard — runs on every node before the node-specific validator. If any validator returns `False`, status becomes `"semantic_fail"` — a distinct status from structural `"fail"`.

---

## Feature 5: Root Cause Chain Tracing

`build_root_cause_chain` walks events in reverse at finalization:

1. Walk events last to first
2. Track which bad fields (missing/empty) have been seen
3. If an earlier node produced the same bad fields a later node failed on → that earlier node is in the chain
4. Deduplicate (cyclic graphs where the same node ran multiple times)
5. Reverse to restore chronological order

CLI output:
```
root cause   fetch  →  validate  →  process
```

---

## Feature 6: Parallel Execution

Fan-out groups (multiple nodes receiving state from the same parent) run concurrently via `asyncio.gather`. ARGUS detects these from the edge map and groups them in the CLI output as a blue `⟼ parallel` panel.

The DAG topology is printed above the node list for any graph with more than one node:

```
  graph

    ingest
    ├─ analyst_a ──┐
    ├─ analyst_b   │
    ├─ analyst_c  ─┤  aggregator → scorer
    ├─ analyst_d   │
    └─ analyst_e ──┘
```

Sequential chains (A → B → C) are inlined on the middle row of fan-in groups to keep the layout compact.

---

## Feature 7: Cycle Detection

Iterative DFS with an explicit recursion stack (not Python's call stack — no recursion limit issues). Detects any back-edge. Runs once when `set_edges()` is called.

Auto-finalization logic:
```
should_finalize = (
    status in ("crashed", "interrupted")
    or (not is_cyclic and node_name == last_registered_node)
)
```

- Linear graph → auto-finalizes when the last node completes
- Cyclic graph → requires explicit `watcher.finalize()`
- Any graph → always finalizes immediately on crash or interrupt

`attempt_index` on `NodeEvent` tracks iteration count in cyclic graphs.

---

## Feature 8: Human Interrupt Handling

LangGraph's `GraphInterrupt` pauses execution mid-graph. ARGUS handles it in three layers:

**Detection:**
```python
if isinstance(exc, GraphInterrupt):
    on_node_end(..., is_interrupt=True)
    raise   # re-raise so LangGraph's checkpoint mechanism still works
```

**Persistence:**
```
CheckpointRecord {
    run_id:               str
    interrupted_at_node:  str
    checkpoint_state:     dict
    created_at:           str
    resumed:              bool
    resumed_at:           str | None
}
```

Saved atomically to `.argus/checkpoints/<run_id>.json` via write-to-tmp-then-rename.

**Resume:**
```python
watcher.resume(checkpoint_run_id, app, resume_input)
```

`argus show last` on a resumed run walks the full parent chain and stitches all segments into one view. Step numbers are continuous. Each interrupt adds a labeled separator with the resume run ID.

---

## Feature 9: Replay Engine

`ReplayEngine.replay()`:

1. Loads the original `RunRecord` from disk
2. Finds the `NodeEvent` for `from_node` — gets its `input_state`
3. Deserializes it back to the original state type
4. Calls `app_factory()` to get a fresh graph
5. If the factory returns a compiled app, unwraps it via `.graph` automatically
6. Attaches a new `ArgusWatcher`, sets `parent_run_id` and `replay_from_step`
7. Invokes from the recovered state — nodes before `from_node` are skipped entirely
8. Finalizes, returns the new `run_id`

```bash
argus replay a1b2c3d4 validate --app my_module:build_graph
```

`build_graph` must be a zero-argument callable. It can return either an uncompiled `StateGraph` or a compiled app — ARGUS handles both.

The replay `RunRecord` shows:
```
replay of  <original-run-id>  from  validate
```

Use `argus diff <replay-id>` to compare it against the original.

---

## Feature 10: Run Diff

`argus diff` compares two runs node-by-node: status changes, duration delta, and output field diffs.

```bash
argus diff <replay-id>          # auto-diffs against the parent run
argus diff <id-a> <id-b>        # diff any two runs
```

For each node it shows:
- Status before → after (with `fixed` / `regressed` labels)
- Duration delta
- Which output fields changed, were added, or went empty

Summary line at the end: `2 nodes changed  ·  2 fixed  ·  0 regressed`.

Frozen nodes (those that weren't re-executed in the replay) are shown dimmed.

---

## Feature 11: Persistent Run Storage

Every run saved atomically to `.argus/runs/<run_id>.json`.

```
RunRecord {
    run_id:              str
    argus_version:       str
    started_at:          str               # ISO-8601 UTC
    completed_at:        str | None
    duration_ms:         float | None
    overall_status:      str
    first_failure_step:  str | None
    root_cause_chain:    list[str]
    graph_node_names:    list[str]
    graph_edge_map:      dict[str, list[str]]
    initial_state:       dict
    steps:               list[NodeEvent]
    parent_run_id:       str | None        # set on replay runs
    replay_from_step:    str | None
    is_cyclic:           bool
    interrupted:         bool
    interrupt_node:      str | None
}
```

Run IDs support prefix matching — `argus show abc12` instead of the full UUID.

---

## Overall Status Taxonomy

| Status | Meaning |
|---|---|
| `clean` | All nodes passed structural and semantic checks |
| `crashed` | At least one node raised an unhandled exception |
| `silent_failure` | A node passed without crashing but produced invalid output |
| `semantic_fail` | A validator returned `False` for a node's output |
| `interrupted` | A `GraphInterrupt` occurred — pipeline paused for human input |

Priority: `crashed > interrupted > semantic_fail > silent_failure > clean`.

---

## CLI Status Icons

| Icon | Meaning |
|---|---|
| `✓` green | Pass — all checks clean |
| `~` yellow | Pass with warnings (empty or mismatched optional fields) |
| `⚠` yellow | Silent failure (missing required fields) |
| `⊗` magenta | Semantic fail (validator returned False) |
| `⏸` yellow | Interrupted (human approval pending) |
| `✗` red | Crashed |

---

## Crash Diagnosis

ARGUS pattern-matches exception strings to generate a one-liner alongside the raw traceback:

| Exception | Diagnosis |
|---|---|
| `KeyError: 'score'` | Field 'score' was absent from the incoming state |
| `AttributeError: 'NoneType'` | A required field was None — upstream node returned null instead of an object |
| `IndexError` + empty list in input | Input field 'items' was an empty list — nothing to index into |
| `TypeError: NoneType` | Received None where a value was required — check upstream node's output |
| `ValueError` | Node rejected its input value — schema mismatch from upstream |

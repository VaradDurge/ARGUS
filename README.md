# ARGUS

**Monitoring for multi-agent pipelines.** ARGUS catches silent failures between agents, traces root causes across the chain, validates semantic correctness, and lets you replay any run from the exact step it broke — without re-running what already worked.

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
# watcher.finalize()       # only needed for cyclic graphs
```

No changes to node functions. No decorators. Two lines.

### Any Python pipeline (Prefect, Temporal, raw functions)

```python
from argus import ArgusSession

session = ArgusSession(validators={
    "classify": lambda o: (o.get("label") in ["A","B","C"], "invalid label"),
    "*":        lambda o: ("error" not in o, f"error present: {o.get('error')}"),
})
session.set_edges({"fetch": ["validate"], "validate": ["process"]})

# wrap all agents at once
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

Or use the decorator style at definition time:

```python
@session.node("fetch")
def fetch(state: MyState) -> dict:
    ...   # your agent code — untouched
```

---

## CLI

```bash
argus list                                              # all runs, newest first
argus show last                                         # most recent run
argus show run <id>                                     # by full or 8-char prefix ID
argus replay <id> <node> --app my_module:build_graph    # re-run from a specific node
```

Example `argus show` output:

```
argus  argus-20240405-abc12345  ·  2024-04-05 12:30  ·  1243 ms
status  ●  silent_failure

────────────────────────────────────────────────────────────────────

   1  fetch      43 ms    ✓  pass
   2  validate   12 ms    ⚠  silent failure
      └─  Field "score" is missing
      └─  process received bad state
   3  process   891 ms    ✗  crashed
      └─  KeyError: 'score'
      └─  at pipeline.py:47  →  result = state["score"] * weight
      └─  Field 'score' was absent from the incoming state

────────────────────────────────────────────────────────────────────
root cause   validate
```

---

## License

MIT

---
---

# In Depth

Everything below is the full technical reference — how each feature works, what problem it solves, and how it's implemented.

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

**Problem:** Adding logging and timing to every agent function pollutes business logic. Not adding it means no visibility.

**Solution:** `session.wrap(node_name, fn)` returns a monitored version of your function that is identical to the original from the caller's perspective. Your code is untouched.

```python
@session.node("fetch")
def fetch(state: MyState) -> dict:
    result = llm.invoke(state["query"])   # your agent — unchanged
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

**`instrument()` for bulk wrapping (15 agents, one call):**

```python
wrapped = session.instrument(
    agents={
        "fetch":    fetch_fn,
        "clean":    clean_fn,
        "classify": classify_fn,
        # ... all 15
    },
    edges={
        "fetch":    ["clean"],
        "clean":    ["classify"],
        # ...
    },
)
state = wrapped["fetch"](state)
```

**`@session.node()` decorator (at definition time):**

```python
@session.node("fetch")
def fetch(state): ...
```

Both call `session.wrap()` under the hood — same monitoring, different ergonomics.

---

## Feature 2: State Snapshot Capture

**Problem:** When a failure occurs, there's no record of what any node received or produced. You can't inspect it post-hoc.

**Solution:** Every node execution stores a `NodeEvent` with:

```
NodeEvent {
    step_index:    int          # execution order, 0-indexed
    node_name:     str
    input_state:   dict         # full state BEFORE the node ran
    output_dict:   dict | None  # full state AFTER (None if crashed)
    duration_ms:   float        # wall-clock time in milliseconds
    timestamp_utc: str          # ISO-8601 UTC
    exception:     str | None   # full traceback on crash
    attempt_index: int          # times this node ran before (cyclic graphs)
}
```

`safe_serialize` converts any Python object — TypedDicts, Pydantic models, dataclasses, LangChain objects — to a plain dict. Fields larger than `max_field_size` (default 50,000 chars) are truncated with a marker.

The first `capture_state` call also stores `initial_state` on the session — the exact state the pipeline started with. The replay engine uses this to reconstruct any mid-pipeline state without re-running previous nodes.

---

## Feature 3: Silent Failure Detection (Structural)

**Problem:** Node A runs without error. Its output is missing `score` which Node B needs. Node B quietly produces garbage. Node C crashes on the garbage. You see Node C fail and debug Node C. The real bug is Node A.

**Solution:** After every node completes, ARGUS immediately inspects the transition to the **successor node** by reading its type annotations.

Mechanism:
1. Look up the edge map for the current node's outbound edges
2. Get the actual function objects for each successor
3. Read the **first parameter's type annotation** from the successor function signature
4. Introspect that type — supports TypedDict, Pydantic v1/v2, dataclasses
5. For every expected field, check the actual merged state:
   - Field absent → `missing_fields` → **critical** → `is_silent_failure = True`
   - Field is `None`, `""`, `[]`, `{}` → `empty_fields` → warning if optional, critical if required
   - Field present but wrong primitive type → `type_mismatches` → warning
6. If `is_silent_failure`, change node status from `"pass"` to `"fail"`

ARGUS reads **your type annotations** to know what each node expects. No configuration:

```python
def validate(state: ValidateState) -> dict: ...

class ValidateState(TypedDict):
    response: str                    # required
    score: float                     # required
    metadata: NotRequired[dict]      # optional
```

If `fetch` doesn't put `score` in its output, ARGUS flags it the moment `fetch` completes — before `validate` runs.

**Severity levels:**
- `"critical"` — missing required fields → status becomes `"fail"`
- `"warning"` — empty optional fields or type mismatches → status stays `"pass"` with `~` warning icon

---

## Feature 4: Semantic Validation

**Problem:** Structural checks catch missing fields. They don't catch semantically wrong values. An LLM returning `{"label": "UNKNOWN"}` when only `"positive"`, `"negative"`, `"neutral"` are valid is structurally correct. It passes every structural check and silently corrupts downstream logic.

**Solution:** Validator lambdas — you define what "correct" means:

```python
validators = {
    "classify": lambda o: (o.get("label") in ["positive","negative","neutral"], "invalid label"),
    "summarize": lambda o: (len(o.get("summary","")) > 50, "summary too short"),
    "score":     lambda o: (0.0 <= o.get("confidence", -1) <= 1.0, "confidence out of range"),
    "*":         lambda o: ("error" not in o, f"error field present: {o.get('error')}"),
}
```

`"*"` is a wildcard — runs on every node's output before the node-specific validator.

After every node completes, the wildcard validator runs first, then the node-specific one. Each returns a `ValidatorResult`:

```
ValidatorResult {
    validator_name: str    # e.g. "classify:check_label"
    is_valid:       bool
    message:        str    # your failure reason
}
```

If any validator returns `False`, status becomes `"semantic_fail"` — a distinct status from structural `"fail"`, so you know which kind of failure occurred.

The validator is pure Python — use embedding similarity, regex, JSON schema, numeric bounds, keyword presence, anything.

---

## Feature 5: Root Cause Chain Tracing

**Problem:** In a 10-node pipeline, nodes 7, 8, 9, 10 all show failures. The real cause is node 3. Without root cause tracing you debug symptoms.

**Solution:** `build_root_cause_chain` walks events in reverse at finalization:

1. Walk events from last to first
2. Track which "bad fields" (missing/empty) have been seen
3. If an earlier node produced the same bad fields that a later node failed on → that earlier node is in the chain
4. Deduplicate — each node appears at most once (handles cyclic graphs where the same node ran multiple times)
5. Reverse to restore chronological order

Result stored as `RunRecord.root_cause_chain: list[str]`.

CLI output:
```
root cause   fetch  →  validate  →  process
```

---

## Feature 6: Cycle Detection

**Problem:** Cyclic graphs (retry loops, self-correction loops) need different finalization. In a linear graph you finalize when the last node completes. In a cyclic graph the "last node" runs multiple times — finalizing after the first iteration cuts off the rest.

**Solution:** Iterative DFS with an explicit recursion stack (not Python's call stack — avoids recursion limits on large graphs). Detects any back-edge. Runs once when `set_edges()` is called.

Auto-finalization logic:
```
should_finalize = (
    status in ("crashed", "interrupted")
    or (not is_cyclic and node_name == last_registered_node)
)
```

- **Linear graph** → auto-finalizes when the last node completes
- **Cyclic graph** → never auto-finalizes on last-node; requires explicit `watcher.finalize()`
- **Any graph** → always finalizes immediately on crash or interrupt

`attempt_index` on `NodeEvent` tracks how many times a given node has run — in a cyclic graph you see `fetch[0]`, `fetch[1]`, `fetch[2]` as the loop iterates.

---

## Feature 7: Human Interrupt Handling

**Problem:** LangGraph's `GraphInterrupt` (human-in-the-loop approval) pauses execution mid-graph. Without special handling, ARGUS treats it as a crash. The paused state is lost. You can't resume cleanly or know which runs are waiting for approval.

**Solution:** Three-layer system:

**Layer 1 — Interrupt detection:**

```python
if isinstance(exc, GraphInterrupt):
    on_node_end(..., is_interrupt=True)
    raise   # re-raise so LangGraph's checkpoint mechanism still works
```

Node gets `status = "interrupted"`. Exception is re-raised so LangGraph handles its own checkpointing normally.

**Layer 2 — Checkpoint persistence:**

```
CheckpointRecord {
    run_id:               str
    interrupted_at_node:  str       # which node was mid-execution
    checkpoint_state:     dict      # full state at interrupt point
    created_at:           str
    resumed:              bool
    resumed_at:           str | None
}
```

Saved atomically to `.argus/checkpoints/<run_id>.json` via write-to-tmp-then-rename. Survives process crashes.

**Layer 3 — Resume tracking:**

```python
watcher.resume(checkpoint_run_id, app, resume_input)
```

Marks the checkpoint as resumed (sets `resumed=True` and `resumed_at` timestamp), re-invokes the app, finalizes. The `RunRecord` gets `interrupted=True` and `interrupt_node` set so you can query which runs are paused.

CLI shows interrupted nodes with `⏸` and "execution paused — awaiting human approval".

---

## Feature 8: Replay Engine

**Problem:** A 15-node pipeline fails at node 9. You fix the bug. You have to re-run nodes 1–8 again, burning LLM API credits, to test the fix.

**Solution:** `ReplayEngine.replay()`:

1. Loads the original `RunRecord` from disk
2. Finds the `NodeEvent` for `from_node` — gets its `input_state` (exact snapshot)
3. Deserializes it back to the original state type (TypedDict, Pydantic, dataclass)
4. Calls `app_factory()` to get a fresh uncompiled `StateGraph`
5. Attaches a new `ArgusWatcher` to the fresh graph
6. Sets `parent_run_id` and `replay_from_step` on the new session
7. Calls `app.invoke(recovered_state)` — pipeline runs from node 9 forward, skipping 1–8
8. Finalizes, returns the new `run_id`

```bash
argus replay a1b2c3d4 validate --app my_module:build_graph
```

`build_graph` must be a zero-argument function returning an **uncompiled** `StateGraph`. ARGUS patches nodes before `compile()` — returning an already-compiled app skips instrumentation.

The replay `RunRecord` shows:
```
replay of  <original-run-id>  from  validate
```

---

## Feature 9: Persistent Run Storage

**Problem:** Pipeline runs and their failure states are ephemeral. Next reproduction attempt may get different LLM outputs.

**Solution:** Every run is saved atomically to `.argus/runs/<run_id>.json`.

```
RunRecord {
    run_id:              str               # UUID-based, unique per run
    argus_version:       str
    started_at:          str               # ISO-8601 UTC
    completed_at:        str | None
    duration_ms:         float | None
    overall_status:      str               # "clean" | "crashed" | "silent_failure" | "interrupted"
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

Run IDs support **prefix matching** — `argus show abc12` instead of the full UUID.

---

## Feature 10: LangGraph Adapter

**Problem:** LangGraph users shouldn't need to know about `ArgusSession`, edge extraction, or node patching internals.

**Solution:** `ArgusWatcher` is a two-line adapter:

```python
watcher = ArgusWatcher(validators={"*": my_validator})
watcher.watch(graph)   # before compile()
```

`watch(graph)` automatically:
1. Validates the graph hasn't been compiled yet
2. Extracts node names from `graph.nodes`
3. Extracts edge topology from `graph.edges`, `graph.branches` (conditional edges, LangGraph ≥0.2), and `graph._conditional_edges` (legacy)
4. Creates an `ArgusSession` with everything registered
5. Patches every node function with its monitored wrapper

Handles both LangGraph ≤0.2 (plain callable nodes) and ≥0.2 (`StateNodeSpec` objects with `.runnable.func`).

---

## Overall Status Taxonomy

| Status | Meaning |
|---|---|
| `clean` | All nodes passed structural and semantic checks |
| `crashed` | At least one node raised an unhandled exception |
| `silent_failure` | At least one node passed without crashing but produced invalid output |
| `interrupted` | A `GraphInterrupt` occurred — pipeline paused for human input |

Priority: `crashed > interrupted > silent_failure > clean`.

---

## CLI Status Icons

| Icon | Meaning |
|---|---|
| `✓` green | Pass — all checks clean |
| `~` yellow | Pass with warnings (empty or mismatched fields) |
| `⚠` yellow | Silent failure (missing required fields) |
| `⊗` magenta | Semantic fail (validator returned False) |
| `⏸` yellow | Interrupted (human approval pending) |
| `✗` red | Crashed |

---

## Crash Diagnosis

ARGUS pattern-matches exception strings to generate a human-readable one-liner alongside the raw traceback:

| Exception | Diagnosis |
|---|---|
| `KeyError: 'score'` | Field 'score' was absent from the incoming state |
| `AttributeError: 'NoneType'` | A required field was None — upstream node returned null instead of an object |
| `IndexError` + empty list in input | Input field 'items' was an empty list — nothing to index into |
| `TypeError: NoneType` | Received None where a value was required — check upstream node's output |
| `ValueError` | Node rejected its input value — schema mismatch from upstream |

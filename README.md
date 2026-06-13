<div align="center">
  <img src="https://github.com/VaradDurge/ARGUS/blob/master/assets/Argus-NameTrans.png?raw=true" width="480"/><br/>
  <a href="https://arguslabs.in"><img src="https://img.shields.io/badge/website-arguslabs.in-6366f1" alt="Website"/></a>
  <a href="https://pypi.org/project/argus-agents/"><img src="https://img.shields.io/pypi/v/argus-agents" alt="PyPI version"/></a>
  <a href="https://pypi.org/project/argus-agents/"><img src="https://img.shields.io/badge/python-3.9%2B-blue" alt="Python 3.9+"/></a>
  <a href="https://github.com/VaradDurge/ARGUS/releases/tag/v0.5.0"><img src="https://img.shields.io/badge/status-beta-6366f1" alt="Beta"/></a>
</div>

---

**Production readiness platform for AI agent pipelines.**

Your LangGraph pipeline runs. No exception. But three nodes later something crashes with a `KeyError`. The node that crashed didn't cause it — some node upstream returned a dict with a missing field, and nothing caught it.

ARGUS sits between your nodes and catches silent failures, semantic degradation, and contract violations before they reach production.

<img src="https://github.com/VaradDurge/ARGUS/blob/master/assets/Argus_website.png?raw=true" width="700"/>

---

## Install

```bash
pip install argus-agents
```

## Setup — pick whichever fits your code

**Option A — pass graph to constructor (recommended):**
```python
from argus import ArgusWatcher

watcher = ArgusWatcher(graph)      # attaches monitoring automatically
app = graph.compile()
result = app.invoke(initial_state) # run auto-saves when the last node finishes
print(watcher.run_id)              # access the run ID directly
```

**Option B — separate watch call:**
```python
from argus import ArgusWatcher

watcher = ArgusWatcher()
watcher.watch(graph)       # before graph.compile()
app = graph.compile()
result = app.invoke(initial_state)
```

**Option C — after compile (new in v0.5.0):**
```python
from argus import ArgusWatcher

watcher = ArgusWatcher()
app = graph.compile(checkpointer=memory)
app = watcher.watch_compiled(app)   # works on already-compiled graphs
result = app.invoke(initial_state)
```

All three work. No changes to your node functions. Runs are saved automatically for linear and fan-out/fan-in graphs. Only cyclic graphs (with back-edges) need a manual `watcher.finalize()` call.

### ArgusWatcher parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `graph` | `StateGraph` | `None` | LangGraph graph to monitor. If passed, `watch()` is called automatically. |
| `max_field_size` | `int` | `50_000` | Max characters per field before truncation in stored outputs. |
| `validators` | `dict` | `None` | Per-node semantic validators. Use `"*"` as key to run on every node. Each validator is a `(bool, str)` callable. |
| `strict` | `bool` | `False` | Enable extra checks: nested error keys, rate-limit responses, empty lists, type mismatches. Recommended for CI/staging. |
| `investigate` | `bool \| str` | `True` | LLM root-cause investigation. `True` = on failure only, `"always"` = every node, `False` = off. |
| `redact_keys` | `set[str]` | `None` | Field names to redact from stored outputs (e.g. `{"password", "api_key"}`). |
| `persist_state` | `bool` | `True` | Save run records to `.argus/runs/`. Set `False` for ephemeral monitoring. |
| `record_http` | `bool` | `False` | Record all HTTP calls for deterministic replay. Saved to disk per run. |
| `semantic_judge` | `bool` | `False` | Enable LLM-powered quality judge on every node output. Requires `OPENAI_API_KEY`. |
| `judge_model` | `str` | `"gpt-4o"` | Model for the semantic judge and investigation. |

```python
# Example with multiple options
watcher = ArgusWatcher(
    graph,
    semantic_judge=True,
    judge_model="gpt-4o-mini",
    strict=True,
    record_http=True,
    redact_keys={"api_key", "token"},
    validators={
        "summarize": lambda o: (len(o.get("summary", "")) > 10, "Summary too short"),
    },
)
```

---

## What it catches

**Silent failures** — a node returns `{}` or drops a required field. No exception, pipeline keeps running. ARGUS compares each node's output against the next node's type annotations and flags it before the crash happens downstream.

**Semantic failures** — structure is fine but the value is wrong. Pass a validator:

```python
watcher = ArgusWatcher(graph, validators={
    "classify": lambda o: (o.get("label") in ["yes", "no"], "unexpected label"),
    "*":        lambda o: ("error" not in o, "error key present"),
})
```

`"*"` runs on every node.

**Crashes** — full traceback captured per node, with a one-line root cause:
```
└─  KeyError: 'score'
└─  at pipeline.py:47  →  result = state["score"] * weight
└─  Field 'score' was absent from the incoming state
```

**Strict mode** — additional patterns: nested error keys, rate limit responses, empty required lists, `list[int]` vs `list[str]` type mismatches. Use in staging/CI:

```python
watcher = ArgusWatcher(graph, strict=True)
```

---

## Output

```
argus  run-abc12345  ·  2024-04-05 12:30  ·  1243 ms
status  ●  silent_failure

   1  fetch       43 ms    ✓  pass
   2  validate    12 ms    ⚠  silent failure
      └─  Field "score" is missing
      └─  process received bad state
   3  process    891 ms    ✗  crashed
      └─  KeyError: 'score'
      └─  Field 'score' was absent from the incoming state

root cause   validate
```

Parallel nodes shown as a grouped panel. Cyclic graphs show each iteration separately. Human interrupt chains stitched into one trace on resume.

---

## Rerun

A 10-node pipeline fails at node 7. You fix the bug. Instead of re-running nodes 1–6 and burning API credits:

```bash
argus replay <run-id> node_7
```

ARGUS restores the exact state at node 7 from disk and runs from there. Upstream outputs stay frozen. Only node 7 onward re-executes with your fixed code.

From the web UI — hover any step, click `↺ Rerun From Here`. After rerun, the diff view opens automatically.

```bash
argus diff <rerun-id>    # compare rerun vs original
```

### What about external API calls?

By default, reruns call external APIs live (OpenAI, search tools, databases). Results may differ from the original run.

For **fully deterministic** reruns, record HTTP calls during the original run:

```python
watcher = ArgusWatcher(graph, record_http=True)
```

Every API response is saved to disk. During rerun, the recorded responses are served back — same data, zero extra cost, fully reproducible.

---

## Semantic Judge (LLM-powered)

Deterministic checks catch ~80% of production failures (missing fields, empty results, type mismatches, placeholder outputs). For the remaining 20% — subtle quality issues like wrong tone, unhelpful responses, or outdated information — enable the semantic judge:

```python
watcher = ArgusWatcher(graph, semantic_judge=True)
```

The LLM judge runs **after** deterministic checks on every node. It evaluates output quality, generates causal hypotheses, and suggests debugging steps.

```python
# With a specific model
watcher = ArgusWatcher(graph, semantic_judge=True, judge_model="gpt-4o")

# Combined with HTTP recording for deterministic + intelligent monitoring
watcher = ArgusWatcher(graph, semantic_judge=True, record_http=True)
```

Requires `OPENAI_API_KEY` in your environment. Uses GPT-4o by default.

**When to use:** complex multi-agent pipelines, customer-facing outputs, LLM-generated content where quality matters.

**When to skip:** simple pipelines, CI/CD speed runs, zero-cost monitoring.

---

## Adaptive Learning (v0.6)

ARGUS learns from your runs. When the semantic judge discovers a new failure pattern, it proposes a candidate signature. You review it in the **Approvals** page (`argus ui`) and choose:

- **Private** — adds to your local heuristic engine only
- **Shared** — pushes to the cloud so every ARGUS user benefits

The heuristic engine loads from three tiers: **bundled** (ships with ARGUS) → **private** (your local patterns) → **shared** (community-contributed, synced from cloud). All three are merged and deduplicated at startup.

```bash
argus ui          # open Approvals page to review candidates
argus login       # required for cloud sync
```

The semantic judge also overrides heuristic false positives. If a node failed *only* due to a heuristic pattern match (no structural issues, no validator failures), the LLM reviews context and can clear the flag.

---

## Diagnose setup issues

```bash
argus doctor
```

```
✓  python           Python 3.9.6
✓  langgraph        langgraph 0.6.11
✓  storage          312 runs stored, all healthy
✓  replay           all 7 node functions importable for rerun
✓  optional deps    openai (key set), dotenv
```

5 seconds to know if something is wrong — Python version, LangGraph compatibility, storage health, rerun readiness.

---

## CLI

```
argus list                          # all runs
argus show last                     # most recent run
argus show run <id>                 # by full id or 8-char prefix
argus replay <id> <node>            # re-run from a node
argus replay <id> <node> --only     # re-run just that one node
argus inspect <id> --step <node>    # raw input/output for a node
argus diff <id>                     # rerun vs original
argus diff <id-a> <id-b>            # any two runs
argus ui                            # open web dashboard
argus doctor                        # check your setup
argus login                         # sync runs to cloud
```

---

## Web UI

```bash
argus ui
```

Opens at `http://localhost:7842`. Serves runs from `.argus/runs/` in your current directory — no account needed.

Run detail, rerun tree, side-by-side diff, LLM cost per node, AI root cause investigation.

---

## Node statuses

| | |
|---|---|
| `✓` | pass |
| `~` | pass with warnings (empty optional fields) |
| `⚠` | silent failure (missing required fields) |
| `⊗` | semantic fail (validator returned False) |
| `⏸` | interrupted (human-in-the-loop pause) |
| `✗` | crashed |

---

## Without LangGraph

```python
from argus import ArgusSession

session = ArgusSession()
session.set_edges({"fetch": ["classify"], "classify": ["process"]})

fetch    = session.wrap("fetch",    fetch_fn)
classify = session.wrap("classify", classify_fn)
process  = session.wrap("process",  process_fn)

state = fetch(initial_state)
state = classify(state)
state = process(state)
session.finalize()
```

Works with Prefect, Temporal, or plain Python functions.

---

Requires Python 3.9+. LangGraph 0.2+ only needed for `ArgusWatcher`.

**v0.6.2** — [changelog](https://github.com/VaradDurge/ARGUS/releases/tag/v0.6.2)

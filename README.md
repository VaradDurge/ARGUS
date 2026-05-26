<div align="center">
  <img src="https://github.com/VaradDurge/ARGUS/blob/master/assets/Argus-NameTrans.png?raw=true" width="280"/>
</div>

<div align="center">
  <a href="https://pypi.org/project/argus-agents/"><img src="https://img.shields.io/pypi/v/argus-agents" alt="PyPI version"/></a>
  <a href="https://pypi.org/project/argus-agents/"><img src="https://img.shields.io/badge/python-3.9%2B-blue" alt="Python 3.9+"/></a>
  <a href="https://github.com/VaradDurge/ARGUS/releases/tag/v0.4.4"><img src="https://img.shields.io/badge/status-beta-6366f1" alt="Beta"/></a>
</div>

---

Your LangGraph pipeline runs. No exception. But three nodes later something crashes with a `KeyError`. The node that crashed didn't cause it — some node upstream returned a dict with a missing field, and nothing caught it.

ARGUS sits between your nodes and tells you exactly where it went wrong.

<img src="https://github.com/VaradDurge/ARGUS/blob/master/assets/Argus_website.png?raw=true" width="700"/>

---

## Install

```bash
pip install argus-agents
```

## Setup

```python
from argus import ArgusWatcher

watcher = ArgusWatcher()
watcher.watch(graph)       # before graph.compile()
app = graph.compile()
app.invoke(initial_state)
watcher.finalize()
```

No changes to your node functions.

---

## What it catches

**Silent failures** — a node returns `{}` or drops a required field. No exception, pipeline keeps running. ARGUS compares each node's output against the next node's type annotations and flags it before the crash happens downstream.

**Semantic failures** — structure is fine but the value is wrong. Pass a validator:

```python
watcher = ArgusWatcher(validators={
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
watcher = ArgusWatcher(strict=True)
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

## Replay

A 10-node pipeline fails at node 7. You fix the bug. Instead of re-running nodes 1–6 and burning API credits:

```bash
argus replay <run-id> node_7 --app my_module:build_graph
```

ARGUS restores the exact state at node 7 from disk and runs from there. `build_graph` is a zero-arg function that returns your graph — compiled or uncompiled, both work.

From the web UI — hover any step, click `↺ replay from here`. After replay, the diff view opens automatically.

```bash
argus diff <replay-id>    # compare replay vs original
```

---

## CLI

```
argus list                                            # all runs
argus show last                                       # most recent run
argus show run <id>                                   # by full id or 8-char prefix
argus replay <id> <node> --app my_module:build_graph  # re-run from a node
argus inspect <id> --step <node>                      # raw input/output for a node
argus diff <id>                                       # replay vs original
argus diff <id-a> <id-b>                              # any two runs
argus ui                                              # open web dashboard
argus login                                           # sync runs to cloud
```

---

## Web UI

```bash
argus ui
```

Opens at `http://localhost:7842`. Serves runs from `.argus/runs/` in your current directory — no account needed.

Run detail, replay tree, side-by-side diff, LLM cost per node, AI root cause investigation.

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

**v0.4.4** — [changelog](https://github.com/VaradDurge/ARGUS/releases/tag/v0.4.4)

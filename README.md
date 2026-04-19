# ARGUS

Your LangGraph pipeline runs. No exception. But three nodes later something crashes with a `KeyError`. The node that crashed didn't cause it — some node upstream returned a dict with a missing field, and nothing caught it.

ARGUS sits between your nodes and tells you exactly where it went wrong.

---

<img src="https://github.com/VaradDurge/ARGUS/blob/master/assets/ARGUS_ui.png" width="600"/>

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

That's it. No changes to your node functions.

---

## What it catches

**Silent failures** — a node returns `{}` or a dict missing a required field. No exception raised, pipeline keeps running. ARGUS compares each node's output against the next node's type annotations and flags it immediately.

**Semantic failures** — structure is fine but the value is wrong. Pass a validator:

```python
watcher = ArgusWatcher(validators={
    "classify": lambda o: (o.get("label") in ["yes", "no"], "unexpected label"),
    "*":        lambda o: ("error" not in o, "error key present in output"),
})
```

`"*"` runs on every node. If a validator returns `False`, that node is marked `semantic_fail`.

**Crashes** — full traceback captured per node, with a one-line diagnosis:
```
└─  KeyError: 'score'
└─  at pipeline.py:47  →  result = state["score"] * weight
└─  Field 'score' was absent from the incoming state
```

---

## CLI

```
argus list                                            # all runs
argus show last                                       # most recent run
argus show run <id>                                   # by full id or 8-char prefix
argus replay <id> <node> --app my_module:build_graph  # re-run from a broken node
argus inspect <id> --step <node>                      # raw input/output for a node
argus diff <id>                                       # diff replay vs original
argus diff <id-a> <id-b>                              # diff any two runs
```

`argus --help` has the full setup guide and flag reference.

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

ARGUS restores the exact state at node 7 from disk and runs from there. `build_graph` is a zero-arg function returning your graph — compiled or uncompiled, both work.

Then diff it:

```bash
argus diff <replay-id>
```

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

## Not just LangGraph

```python
from argus import ArgusSession

session = ArgusSession(validators={"classify": lambda o: (o.get("label"), "no label")})
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

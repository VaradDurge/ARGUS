<div align="center">
  <img src="https://github.com/VaradDurge/ARGUS/blob/master/assets/Argus-NameTrans.png?raw=true" width="480"/><br/>
  <a href="https://arguslabs.in"><img src="https://img.shields.io/badge/website-arguslabs.in-6366f1" alt="Website"/></a>
  <a href="https://pypi.org/project/argus-agents/"><img src="https://img.shields.io/pypi/v/argus-agents" alt="PyPI version"/></a>
  <a href="https://pypi.org/project/argus-agents/"><img src="https://img.shields.io/badge/python-3.9%2B-blue" alt="Python 3.9+"/></a>
  <a href="https://github.com/VaradDurge/ARGUS/releases"><img src="https://img.shields.io/badge/status-beta-6366f1" alt="Beta"/></a>
</div>

---

**Catch silent failures in AI agent pipelines before production.**

Your LangGraph pipeline runs fine — no exception. But three nodes later, something crashes with a `KeyError`. The real cause? A node upstream silently dropped a field. ARGUS catches this.

---

## Install

```bash
pip install argus-agents
```

## Quick Start

```python
from argus import ArgusWatcher

watcher = ArgusWatcher(graph)       # attach to your StateGraph
app = graph.compile()
result = app.invoke(initial_state)
watcher.finalize()                  # persist the run to .argus/runs/
```

ARGUS monitors every node, detects failures, and saves the run. No changes to your node functions.

> **Always call `watcher.finalize()`** after `app.invoke()`. Required for cyclic graphs, safe for all. Without it the run stays in memory and won't appear in `argus list` or the dashboard.

---

## What It Catches

| Problem | Example |
|---------|---------|
| **Silent failures** | Node returns `{}` or drops a required field — no exception, pipeline keeps running broken |
| **Semantic failures** | Output structure is fine but values are wrong (placeholders, refusals, degraded text) |
| **Loop stalls** | Agent retries 5 times producing identical output — stuck loop burning tokens |
| **Unnecessary retries** | Loop produces correct answer on attempt 2, but validator forces 3 more iterations |
| **Crash root cause** | Traces `KeyError` at node 5 back to the upstream node that actually dropped the field |
| **Contract violations** | Output types don't match the next node's expected input schema |

---

## Detection Layers

Runs in order, each more expensive — only fires when needed:

1. **Heuristics** — 150+ failure signatures (placeholders, empty results, error keys, semantic degradation). Zero cost.
2. **Validators** — custom per-node business-logic constraints. Deterministic.
3. **Anomaly detector** — statistical checks for output size anomalies, timing outliers. Deterministic.
4. **Correlator** — traces failure propagation across nodes. Points at the *origin*, not the crash site.
5. **LLM semantic judge** — evidence-aware final ruling. Receives all signals from layers 1–4 before deciding. Cannot override validator failures or critical anomalies.
6. **LLM investigator** — root cause explanations and debugging suggestions. Only on ambiguous failures.
7. **Loop analyzer** — LLM analysis for looped nodes: summarizes iterations, detects stalls, flags wasted retries.

---

## Loop-Aware Inspection

Pipelines with loops (LLM -> compiler -> if fail, retry) get special treatment:

- Earlier iterations that self-corrected are marked `retried` (not counted as failures)
- Only the **final iteration** determines pass/fail
- LLM analyzes every loop: what went wrong, what changed between attempts, whether retries were necessary
- Dashboard shows iteration badges, collapse/expand, and natural-language loop summaries

---

## Replay

Fix a bug, re-run from the failing node. Skip upstream nodes entirely:

```bash
argus replay <run-id> node_7          # re-run from node_7 onward
argus replay <run-id> node_7 --only   # just that one node
argus diff <rerun-id>                 # compare vs original
```

External API calls (OpenAI, etc.) are recorded by default — replays are free and deterministic.

---

## Semantic Judge

For subtle quality issues that pattern matching can't catch:

```python
watcher = ArgusWatcher(graph, semantic_judge=True)  # enabled by default
```

LLM evaluates output quality on every node. Catches wrong tone, unhelpful responses, outdated info. Requires `OPENAI_API_KEY`.

The judge receives **all prior evidence** — validator failures, anomaly signals, inspection results — so it rules with full context, not just input/output. Every decision includes an audit trail:

```json
{
  "pass": false,
  "reason": "Validator correctly identified missing resolution_ticket",
  "confidence": 0.85,
  "evidence_considered": ["validator:payment_check", "anomaly:BA-003"],
  "overridden_signals": []
}
```

- `evidence_considered` — which prior signals the LLM weighed
- `overridden_signals` — which signals the LLM disagreed with (passed despite the flag)

---

## Custom Validators

```python
watcher = ArgusWatcher(graph, validators={
    "classify": lambda o: (o.get("label") in ["yes", "no"], "unexpected label"),
    "*":        lambda o: ("error" not in o, "error key present"),  # runs on every node
})
```

---

## CLI

```
argus list                           # all recorded runs
argus show last                      # most recent run
argus show <id>                      # inspect a specific run
argus inspect <id> --step <node>     # dump raw input/output for a node
argus replay <id> <node>             # re-run from a node
argus diff <id-a> <id-b>             # compare two runs
argus ui                             # web dashboard
argus doctor                         # check setup health
argus login                          # sign in for cloud sync
argus logout                         # clear stored credentials
argus whoami                         # show current login status
argus update                         # check for newer release
```

---

## Web Dashboard

```bash
argus ui    # opens at localhost:7842
```

Shows all runs, node-level detail, AI analysis, replay diffs, loop iteration badges, and comparison views. No account needed for local use.

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

Works with any framework — Prefect, Temporal, plain Python.

---

## Requirements

- Python 3.9+
- LangGraph 0.2+ (only for `ArgusWatcher`)
- `OPENAI_API_KEY` in env for semantic features (optional — all heuristic detection works without it)

---

**v0.8.5** — [changelog](https://github.com/VaradDurge/ARGUS/releases)

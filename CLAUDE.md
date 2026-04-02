# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## NOTE: ALWAYS REMEMBER
Never add a "co-authored by claude" while pushing or in CI/CD operation. It should always look like no AI assisted coding was used.

## Commands

```bash
# Install (editable + dev deps)
pip install -e ".[dev]"

# Run all tests
pytest tests/ -v

# Run a single test file
pytest tests/test_inspector.py -v

# Run with coverage
pytest --cov=src --cov-report=term-missing

# Lint
ruff check src/ tests/

# Type check
mypy src/argus

# CLI (after install)
argus list
argus show last
argus show run <run-id>
argus inspect <run-id> --step <node-name>
argus replay <run-id> --from-step <node> --app your_module:build_graph
```

## Architecture

ARGUS is a non-invasive LangGraph monitoring library. Integration is two lines: `watcher.watch(graph)` before `graph.compile()`.

### Core data flow

1. **`ArgusWatcher.watch(graph)`** — calls `patch_graph()` to wrap every node function with a monitoring wrapper, and stores a `RunSession`
2. **`patcher.py`** — replaces node functions (handling both LangGraph 0.2+ `StateNodeSpec` objects and legacy plain callables; supports sync and async) with wrappers that call `session.on_node_end()` after each node executes
3. **`watcher.RunSession.on_node_end()`** — captures input/output snapshots, calls `inspector.inspect_transition()` to detect silent failures, and calls `_finalize()` when the last node runs or a crash occurs
4. **`inspector.py`** — for each successor node, uses type introspection (`utils/type_introspection.py`) to extract the expected state fields from the node function's type annotation, then checks the current state for missing required fields, empty fields, and primitive type mismatches
5. **`_finalize()`** — builds a `RunRecord` and writes it atomically to `.argus/runs/<run-id>.json` via `storage.py`

### Key design decisions

- **Silent failure detection** works by inspecting the type annotation of successor node functions (TypedDict or Pydantic models). Missing required fields → `status="fail"`, `overall_status="silent_failure"`. Only primitive type checks are performed to avoid false positives.
- **Replay** (`replay.py` + `cli/cmd_replay.py`) loads a saved step's `input_state`, deserializes it, then calls a user-provided zero-argument `app_factory` to get a fresh graph, attaches a new `ArgusWatcher`, and invokes from that state. The factory should return a `StateGraph` (not compiled) for proper re-instrumentation.
- **Storage** is local-only: `.argus/runs/` under the current working directory. Run IDs support 8-char prefix matching.
- **`utils/type_introspection.py`** — handles TypedDict and Pydantic models; `get_node_state_type()` reads the first parameter annotation of the node function.
- **`models.py`** — all data structures are plain `@dataclass`; `FieldMismatch`, `InspectionResult`, `NodeEvent`, `RunRecord`.

### Module map

```
src/argus/
├── __init__.py          # exports ArgusWatcher
├── watcher.py           # ArgusWatcher + RunSession (orchestration)
├── patcher.py           # graph node patching, edge map extraction
├── inspector.py         # silent failure detection logic
├── replay.py            # ReplayEngine
├── storage.py           # save/load/list runs (.argus/runs/)
├── models.py            # dataclasses: RunRecord, NodeEvent, InspectionResult, FieldMismatch
├── cli/
│   ├── main.py          # Typer app; commands: list, show, inspect, replay
│   ├── cmd_show.py      # show_last, show_list, show_run (rich output)
│   └── cmd_replay.py    # replay_run, inspect_step
└── utils/
    ├── ids.py           # generate_run_id
    ├── serializer.py    # safe_serialize / safe_deserialize (JSON-safe snapshots)
    └── type_introspection.py  # extract_fields, get_node_state_type
```

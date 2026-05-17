# Changelog

## 0.4.0 (beta) — 2026-05-17

- LLM token/cost tracking: auto-extracts usage from node outputs, shows cost per node and total in the UI
- Redesigned web dashboard: new sidebar, topbar, run detail layout, compare view
- Replay from subdirectories: runs recorded from child folders are now found and replayable from project root
- "Report the Dev" page in the UI for bug reports and feature requests
- Changelog page in the UI with full version timeline
- Guide page with setup and usage walkthrough
- Restored and expanded test suite (10 smoke tests)
- Fixed all ruff lint errors

## 0.3.10

- Replay system wired into web UI: click "replay from here" on any node
- Factory-free replay: auto-imports node functions from stored refs, no `--app` flag needed
- Polling-based replay status in UI with progress indicators

## 0.3.9

- CLI-only auth via `argus login` (removed Google login from web UI)

## 0.3.8

- Evaluation builder UI (placeholder)
- Rebuilt dashboard

## 0.3.7

- Auto-login in UI from CLI credentials
- Stitch interrupted runs in `argus show`

## 0.3.5

- Google login and Supabase cloud storage
- Background sync of runs to cloud

## 0.3.4

- Dashboard enhancements
- `argus login` for cloud features

## 0.3.3

- Web dashboard via `argus ui` (static Next.js, no Node required at runtime)

## 0.3.2

- Strict mode for inspector
- Nested error scan in tool outputs
- Generic list type checking

## 0.3.1

- Replay uses frozen node outputs instead of live LLM calls
- Improved error messages and label consistency

## 0.3.0

- Parallel and async node execution support

## 0.2.2

- Run differentiator: `argus diff <run-a> <run-b>`

## 0.2.1

- Tool call silent failure detection

## 0.1.0 (MVP)

- Core monitoring: `ArgusWatcher` for LangGraph, `ArgusSession` for any framework
- Silent failure detection: missing fields, type mismatches, empty outputs
- Semantic signature registry for placeholder/degraded LLM outputs
- Root cause analysis chain
- CLI: `argus show`, `argus replay`
- Local storage in `.argus/runs/`

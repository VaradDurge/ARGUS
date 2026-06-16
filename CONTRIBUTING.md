# Contributing to ARGUS

Thanks for your interest in contributing. ARGUS is a production readiness platform for AI agent pipelines — there's a lot of surface area and we welcome help across the board.

## Areas Where Contribution Is Needed

### Framework Adapters

ARGUS currently has a first-class adapter for **LangGraph** only. The framework-agnostic core (`ArgusSession`) supports any pipeline via manual `wrap()` calls, but dedicated adapters would make onboarding seamless for other frameworks:

- **CrewAI** — auto-instrument crew tasks and agent handoffs
- **AutoGen** — wrap multi-agent conversations and tool calls
- **LlamaIndex** — monitor query pipelines and retrieval nodes
- **Haystack** — instrument pipeline components
- **DSPy** — track module executions and optimizer runs
- **SmolAgents** — wrap tool-calling agent steps

Each adapter should follow the `ArgusWatcher` pattern — thin wrapper over `ArgusSession` that auto-patches the framework's execution model.

### Detection Signatures

The semantic signature registry (`src/argus/data/signatures.json`) ships with 61 patterns across 6 categories. More real-world patterns are needed:

- **LLM refusal variants** — new refusal phrasings from Claude, Gemini, Llama, Mistral
- **Hallucination markers** — confident-sounding but fabricated outputs
- **Rate limit responses** — provider-specific throttling patterns (Anthropic, Cohere, etc.)
- **Multilingual placeholders** — non-English placeholder/filler text detection
- **Tool call failures** — patterns from function calling that look like success but aren't

To add signatures, edit `src/argus/data/signatures.json` and include a fixture run that demonstrates the detection.

### Exporters & Integrations

ARGUS currently has no export integrations. These would be high-impact contributions:

- **OpenTelemetry** — emit spans/traces compatible with OTel collectors
- **Datadog / New Relic** — push run metrics as custom events
- **Prometheus** — expose a `/metrics` endpoint for scraping
- **Slack / Discord / PagerDuty** — alerting on pipeline failures
- **Webhooks** — generic POST on run completion with configurable payloads

### Web UI — Planned Pages

Several pages in the dashboard are stubbed but not yet implemented (marked "soon" in the sidebar):

- **Traces** — distributed tracing view across pipeline runs
- **Evaluation** — benchmark pipelines against golden datasets
- **Graphs** — visualize pipeline topology and evolution over time
- **Alerts** — configurable alert rules (failure rate thresholds, latency spikes)
- **Datasets** — manage test datasets for regression testing
- **Settings** — UI for configuration (currently CLI-only)
- **Logs Comparison** — side-by-side log diff in the Compare view

### Unit Tests

The test suite is currently integration/smoke-style. Dedicated unit tests are needed for core modules:

- `inspector.py` — detection rules, root cause chain building
- `anomaly_detector.py` — behavioral anomaly detection
- `correlator.py` — cross-node correlation analysis
- `replay.py` — state restoration and selective rerun
- `semantic_checker.py` — LLM judge coherence checks
- `registry.py` — signature matching strategies
- `http_recorder.py` — HTTP record/playback for deterministic reruns
- `heuristic_engine.py` — pattern matching and candidate promotion
- `cloud.py` — Supabase sync logic

### Documentation

- **Framework-specific guides** — step-by-step setup for CrewAI, AutoGen, etc.
- **CI/CD integration examples** — GitHub Actions, GitLab CI, Jenkins
- **Advanced usage** — custom validators, semantic judge configuration, HTTP recording workflows

---

## Ways to Contribute

- **Fixture runs** — real agent output dicts that expose failure classes ARGUS should detect
- **Bug reports** — open an issue with a minimal reproduction
- **Detection improvements** — PRs against `src/argus/inspector.py` or `src/argus/registry.py`
- **New adapters** — framework integrations under `src/argus/`
- **UI pages** — React components under `website/`

## Adding Fixture Runs

Fixtures are the fastest way to contribute. No need to write tests — just drop your run output dicts.

1. Find or create the right subdirectory under `fixtures/` (e.g. `fixtures/unverified_completion/runs/`)
2. Add your JSON file(s) — see `fixtures/README.md` for the expected format
3. Open a PR with a short description of the run setup and what the agent did/didn't do

## Development Setup

```bash
pip install -e ".[dev]"
pytest tests/
```

## Running Tests

```bash
pytest tests/ -v
pytest tests/test_smoke.py::test_name -v      # single test
pytest --cov=src --cov-report=term-missing     # with coverage
```

## Code Style

```bash
ruff check src/     # lint
ruff format src/    # format
mypy src/argus      # type check
```

## Opening Issues

For bug reports, include:
- ARGUS version (`pip show argus-agents`)
- A minimal run output dict that reproduces the issue
- What ARGUS reported vs what you expected

## Pull Requests

- Keep PRs focused — one fix or feature per PR
- For new detection logic, include a fixture run that the old code misses and the new code catches
- Don't add co-author attribution in commits

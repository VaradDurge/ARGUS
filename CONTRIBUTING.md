# Contributing to ARGUS

## Ways to Contribute

- **Fixture runs** — real agent output dicts that expose failure classes ARGUS should detect
- **Bug reports** — open an issue with a minimal reproduction
- **Detection improvements** — PRs against `src/argus/inspector.py` or `src/argus/registry.py`

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
- ARGUS version (`pip show argus-agent`)
- A minimal run output dict that reproduces the issue
- What ARGUS reported vs what you expected

## Pull Requests

- Keep PRs focused — one fix or feature per PR
- For new detection logic, include a fixture run that the old code misses and the new code catches
- Don't add co-author attribution in commits

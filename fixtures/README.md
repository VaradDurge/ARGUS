# ARGUS Test Fixtures

This directory contains real-world run outputs used to stress-test ARGUS detection.

## Structure

```
fixtures/
└── unverified_completion/     # Agents that prepare valid payloads but can't prove completion
    ├── fixture_spec.md        # What this failure class looks like and what ARGUS should catch
    └── runs/                  # Raw run output dicts (one JSON per agent run)
```

## Fixture Format

Each fixture is a JSON file representing the output dict from a single agent node (or a full run).
At minimum it should contain:

```json
{
  "agent_id": "agent-1",
  "task": "short description of what the agent was asked to do",
  "output": {
    "...": "the actual output dict the agent produced"
  },
  "claimed_status": "completed | submitted | etc.",
  "system_receipt": null,
  "notes": "what happened — e.g. payload was valid but /submit never returned a receipt"
}
```

The key field is `system_receipt` — `null` means the proof came from the agent itself, not the target system.
That's the `unverified_completion` boundary ARGUS is designed to catch.

## Adding a Fixture

1. Drop your JSON files in the appropriate subdirectory
2. Add a short note in `fixture_spec.md` describing the run setup
3. Open a PR — no need to add tests yourself, we'll wire them up

## Failure Classes

| Directory | Failure Class | What It Tests |
|-----------|--------------|---------------|
| `unverified_completion/` | State transition without verifiable proof | Self-reported vs system-returned receipt |

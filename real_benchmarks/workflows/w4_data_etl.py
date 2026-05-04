"""
Workflow 4: Data ETL Pipeline
==============================
Ingests records from an external source, validates, transforms, and loads.

  data_fetcher → schema_validator → transformer → loader

Failure injected: data_fetcher returns error key + None records.
  → transformer crashes calling len(None).

Multi-hop: root cause is data_fetcher, crash surfaces at transformer.
  - ARGUS: first_failure_step = "data_fetcher" ✓
  - Naive: sees crash at "transformer", blames wrong node ✗
"""
from __future__ import annotations

import time
from typing import Optional, TypedDict

from langgraph.graph import StateGraph

NAME = "Data ETL Pipeline"
FAULT_TYPE = "multi_hop"
TRUE_FAULT_NODE = "data_fetcher"
DESCRIPTION = "data_fetcher returns error key + None records → transformer crashes"


# ── State ─────────────────────────────────────────────────────────────────────

class ETLState(TypedDict):
    source_config: dict
    # data_fetcher
    raw_records: list[dict]      # REQUIRED
    fetch_metadata: dict
    # schema_validator
    validated_records: list[dict]
    validation_errors: list[str]
    # transformer
    transformed_records: list[dict]
    transform_stats: dict
    # loader
    rows_loaded: int
    load_status: str


class DataFetcherInput(TypedDict):
    source_config: dict


class SchemaValidatorInput(TypedDict):
    source_config: dict
    raw_records: list[dict]       # REQUIRED


class TransformerInput(TypedDict):
    source_config: dict
    # from data_fetcher; LangGraph needs this declared to pass it through
    raw_records: list[dict]
    validated_records: list[dict]
    validation_errors: Optional[list[str]]  # can be empty [] — not a failure


class LoaderInput(TypedDict):
    source_config: dict
    transformed_records: list[dict]
    transform_stats: dict


# ── Nodes ─────────────────────────────────────────────────────────────────────

_SAMPLE_RECORDS = [
    {
        "id": 1,
        "user_id": "u_001",
        "event": "purchase",
        "amount": 49.99,
        "ts": "2024-03-15T10:00:00Z",
    },
    {
        "id": 2,
        "user_id": "u_002",
        "event": "signup",
        "amount": 0.0,
        "ts": "2024-03-15T10:01:00Z",
    },
    {
        "id": 3,
        "user_id": "u_001",
        "event": "purchase",
        "amount": 129.0,
        "ts": "2024-03-15T10:05:00Z",
    },
    {
        "id": 4,
        "user_id": "u_003",
        "event": "refund",
        "amount": -49.99,
        "ts": "2024-03-15T10:10:00Z",
    },
    {
        "id": 5,
        "user_id": "u_002",
        "event": "purchase",
        "amount": 19.0,
        "ts": "2024-03-15T10:15:00Z",
    },
]


def data_fetcher(state: DataFetcherInput) -> dict:
    """Healthy: fetches records from the configured source."""
    time.sleep(0.12)
    config = state["source_config"]
    table = config.get("table", "events")
    records = _SAMPLE_RECORDS[:config.get("limit", 5)]
    return {
        "raw_records": records,
        "fetch_metadata": {"table": table, "rows_fetched": len(records), "latency_ms": 118},
    }


def data_fetcher_buggy(state: DataFetcherInput) -> dict:
    """BUGGY: database connection fails — returns error key, raw_records is None.

    Real scenario: source DB is unreachable. Agent catches the connection error,
    logs it to the metadata dict, and returns without raising. No exception.
    Pipeline continues — transformer crashes calling len(None).

    ARGUS detects: critical tool failure (error key) + missing required TypedDict field
    Naive: no exception here → reports fetcher as "success"
    """
    time.sleep(0.60)
    return {
        "error": "database_connection_refused: host=prod-db-01 port=5432 timeout=30s",
        "fetch_metadata": {
            "table": state["source_config"].get("table", "events"),
            "rows_fetched": 0,
            "latency_ms": 30000,
            "retry_count": 3,
        },
        # 'raw_records' is ABSENT — transformer will crash
    }


def schema_validator(state: SchemaValidatorInput) -> dict:
    """Validates records against expected schema."""
    time.sleep(0.07)
    records = state.get("raw_records") or []
    required_fields = {"id", "user_id", "event", "amount", "ts"}
    errors = []
    valid = []
    for rec in records:
        missing = required_fields - set(rec.keys())
        if missing:
            errors.append(f"record {rec.get('id','?')}: missing {missing}")
        else:
            valid.append(rec)
    return {"validated_records": valid, "validation_errors": errors}


def transformer(state: TransformerInput) -> dict:
    """Transforms records: normalize amounts, parse timestamps, enrich fields.

    Crashes if raw_records is None (len(None) → TypeError).
    """
    time.sleep(0.09)
    records = state["validated_records"]
    raw = state["raw_records"]

    # Will crash with TypeError if raw_records is None
    total_raw = len(raw)

    transformed = []
    for rec in records:
        transformed.append({
            **rec,
            "amount_cents": int(rec["amount"] * 100),
            "event_type": rec["event"].upper(),
            "processed": True,
        })
    return {
        "transformed_records": transformed,
        "transform_stats": {
            "input_rows": total_raw,
            "output_rows": len(transformed),
            "drop_rate": round(1 - len(transformed) / max(total_raw, 1), 3),
        },
    }


def loader(state: LoaderInput) -> dict:
    """Loads transformed records into destination."""
    time.sleep(0.08)
    records = state.get("transformed_records", [])
    return {"rows_loaded": len(records), "load_status": "success" if records else "empty"}


# ── Graph builders ─────────────────────────────────────────────────────────────

def _assemble(fetcher_fn) -> StateGraph:
    g = StateGraph(ETLState)
    g.add_node("data_fetcher",      fetcher_fn)
    g.add_node("schema_validator",  schema_validator)
    g.add_node("transformer",       transformer)
    g.add_node("loader",            loader)
    g.add_edge("data_fetcher",     "schema_validator")
    g.add_edge("schema_validator", "transformer")
    g.add_edge("transformer",      "loader")
    g.set_entry_point("data_fetcher")
    g.set_finish_point("loader")
    return g


def build_clean() -> StateGraph:
    return _assemble(data_fetcher)


def build_failure() -> StateGraph:
    return _assemble(data_fetcher_buggy)


def initial_state() -> dict:
    return {"source_config": {"table": "user_events", "limit": 5, "env": "production"}}

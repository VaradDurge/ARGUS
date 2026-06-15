"""Feedback storage for LLM override events.

When the LLM judge overrides an anomaly detector or heuristic failure,
the event is recorded here for user review. Users can confirm (agree)
or reject (disagree) the override, and optionally share their verdict
with the community via Supabase.

Stored in `.argus/feedback.json`.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_FEEDBACK_PATH = Path(".argus/feedback.json")


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_feedback() -> dict[str, Any]:
    try:
        return json.loads(_FEEDBACK_PATH.read_text())
    except Exception:
        return {"pending": [], "resolved": []}


def save_feedback(data: dict[str, Any]) -> None:
    _ensure_parent(_FEEDBACK_PATH)
    _FEEDBACK_PATH.write_text(json.dumps(data, indent=2))


def record_override(
    run_id: str,
    node_name: str,
    override_type: str,
    anomaly_ids: list[str],
    anomaly_reasons: list[str],
    llm_reason: str,
    llm_confidence: float,
    behavior_type: str,
    output_shape: dict[str, Any],
    auto_approve_threshold: float = 0.0,
) -> str:
    """Record an LLM override event for user review.

    Args:
        run_id: The run where the override occurred.
        node_name: The node that was overridden.
        override_type: "anomaly_override" or "heuristic_override".
        anomaly_ids: List of anomaly IDs (e.g. ["BA-005"]).
        anomaly_reasons: Human-readable reasons from the detector.
        llm_reason: The LLM's reason for overriding.
        llm_confidence: The LLM's confidence score.
        behavior_type: The inferred behavior type.
        output_shape: Privacy-safe shape info (key count, depth, etc.).
        auto_approve_threshold: If > 0 and llm_confidence >= threshold, the override
            is auto-resolved as "agree" (confirmed false positive) without user review.

    Returns:
        The feedback event ID.
    """
    data = load_feedback()
    now = datetime.now(timezone.utc).isoformat()
    event_id = f"fb-{uuid.uuid4().hex[:8]}"

    # Dedup: if same node+anomaly combo already pending, merge
    for entry in data["pending"]:
        if (
            entry["node_name"] == node_name
            and set(entry["anomaly_ids"]) == set(anomaly_ids)
        ):
            entry["times_seen"] = entry.get("times_seen", 1) + 1
            entry["last_seen"] = now
            if run_id not in entry.get("source_run_ids", []):
                entry.setdefault("source_run_ids", []).append(run_id)
            save_feedback(data)
            return entry["id"]

    auto_approved = (
        auto_approve_threshold > 0.0 and llm_confidence >= auto_approve_threshold
    )

    event = {
        "id": event_id,
        "override_type": override_type,
        "node_name": node_name,
        "anomaly_ids": anomaly_ids,
        "anomaly_reasons": anomaly_reasons,
        "llm_reason": llm_reason,
        "llm_confidence": llm_confidence,
        "behavior_type": behavior_type,
        "output_shape": output_shape,
        "source_run_ids": [run_id],
        "times_seen": 1,
        "first_seen": now,
        "last_seen": now,
        "status": "pending",
    }

    if auto_approved:
        event["status"] = "agree"
        event["resolved_at"] = now
        event["auto_approved"] = True
        data["resolved"].append(event)
    else:
        data["pending"].append(event)

    save_feedback(data)
    return event_id


def resolve_feedback(
    event_id: str,
    verdict: str,
    share: bool = False,
) -> dict[str, Any] | None:
    """Mark a feedback event as resolved.

    Args:
        event_id: The feedback event ID.
        verdict: "agree" (LLM was right) or "disagree" (anomaly detector was right).
        share: Whether to push the verdict to Supabase.

    Returns:
        The resolved event, or None if not found.
    """
    data = load_feedback()
    event = None
    for i, e in enumerate(data["pending"]):
        if e["id"] == event_id:
            event = data["pending"].pop(i)
            break
    if event is None:
        return None

    now = datetime.now(timezone.utc).isoformat()
    event["status"] = verdict
    event["resolved_at"] = now
    data["resolved"].append(event)
    save_feedback(data)

    if share:
        try:
            _push_feedback_to_cloud(event)
        except Exception:
            pass

    return event


def dismiss_feedback(event_id: str) -> bool:
    """Remove a feedback event without recording a verdict."""
    data = load_feedback()
    for i, e in enumerate(data["pending"]):
        if e["id"] == event_id:
            data["pending"].pop(i)
            save_feedback(data)
            return True
    return False


def _push_feedback_to_cloud(event: dict[str, Any]) -> bool:
    """Push anonymized feedback to Supabase for community learning."""
    try:
        from argus.cloud import _get_valid_credentials, _supabase_request  # noqa: PLC0415

        creds = _get_valid_credentials()
        if creds is None:
            return False

        # Only send privacy-safe shape data, never actual content
        payload = {
            "override_type": event["override_type"],
            "anomaly_ids": event["anomaly_ids"],
            "behavior_type": event["behavior_type"],
            "output_shape": event["output_shape"],
            "verdict": event["status"],
            "llm_confidence": event["llm_confidence"],
            "times_seen": event.get("times_seen", 1),
            "resolved_at": event.get("resolved_at"),
        }

        _supabase_request(
            "POST",
            "/rest/v1/feedback",
            json_body=payload,
            token=creds.access_token,
        )
        return True
    except Exception:
        return False

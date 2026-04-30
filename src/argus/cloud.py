"""Supabase REST client for ARGUS cloud sync.

Uses only stdlib (urllib) to avoid adding dependencies.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# ── Public Supabase config (safe to embed — RLS protects data) ───────────
SUPABASE_URL = "https://isnphpbckxfjsxllryrg.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzbnBocGJja3hmanN4bGxyeXJnIiwi"
    "cm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MDcxNjQsImV4cCI6MjA5Mjk4MzE2NH0."
    "nfaMxbDL9E8gyvV7k2r6F8PQhAcxdZ4QVlkVWloJ88Q"
)

_CREDENTIALS_DIR = Path.home() / ".argus"
_CREDENTIALS_FILE = _CREDENTIALS_DIR / "credentials.json"


# ── Credentials ──────────────────────────────────────────────────────────

@dataclass
class Credentials:
    access_token: str
    refresh_token: str
    user_id: str
    email: str
    expires_at: float  # unix timestamp


def save_credentials(creds: Credentials) -> None:
    _CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
    _CREDENTIALS_FILE.write_text(
        json.dumps({
            "access_token": creds.access_token,
            "refresh_token": creds.refresh_token,
            "user_id": creds.user_id,
            "email": creds.email,
            "expires_at": creds.expires_at,
        }, indent=2),
        encoding="utf-8",
    )


def load_credentials() -> Credentials | None:
    if not _CREDENTIALS_FILE.exists():
        return None
    try:
        data = json.loads(_CREDENTIALS_FILE.read_text(encoding="utf-8"))
        return Credentials(**data)
    except Exception:
        return None


def clear_credentials() -> None:
    if _CREDENTIALS_FILE.exists():
        _CREDENTIALS_FILE.unlink()


def is_logged_in() -> bool:
    creds = load_credentials()
    return creds is not None


# ── Token refresh ────────────────────────────────────────────────────────

def _refresh_if_needed(creds: Credentials) -> Credentials:
    """Refresh the access token if it expires within 60 seconds."""
    if time.time() < creds.expires_at - 60:
        return creds

    try:
        body = json.dumps({"refresh_token": creds.refresh_token}).encode()
        req = urllib.request.Request(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
            data=body,
            headers={
                "Content-Type": "application/json",
                "apikey": SUPABASE_ANON_KEY,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        creds = Credentials(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            user_id=data["user"]["id"],
            email=data["user"].get("email", creds.email),
            expires_at=time.time() + data.get("expires_in", 3600),
        )
        save_credentials(creds)
        return creds
    except Exception:
        return creds


def _get_valid_credentials() -> Credentials | None:
    creds = load_credentials()
    if creds is None:
        return None
    return _refresh_if_needed(creds)


# ── REST helpers ─────────────────────────────────────────────────────────

def _supabase_request(
    method: str,
    path: str,
    *,
    body: dict[str, Any] | None = None,
    access_token: str,
    extra_headers: dict[str, str] | None = None,
) -> Any:
    """Make an authenticated request to the Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read()
        if not raw:
            return None
        return json.loads(raw)


# ── Public API ───────────────────────────────────────────────────────────

def push_run(run_data: dict[str, Any]) -> bool:
    """Push a run record to Supabase. Returns True on success."""
    creds = _get_valid_credentials()
    if creds is None:
        return False

    row = {
        "user_id": creds.user_id,
        "run_id": run_data["run_id"],
        "data": run_data,
        "overall_status": run_data.get("overall_status"),
        "started_at": run_data.get("started_at"),
        "duration_ms": (
            int(run_data["duration_ms"]) if run_data.get("duration_ms") is not None else None
        ),
        "step_count": len(run_data.get("steps", [])),
        "first_failure_step": run_data.get("first_failure_step"),
        "argus_version": run_data.get("argus_version"),
        "parent_run_id": run_data.get("parent_run_id"),
    }

    try:
        _supabase_request(
            "POST",
            "runs",
            body=row,
            access_token=creds.access_token,
            extra_headers={
                "Prefer": "resolution=merge-duplicates",
            },
        )
        return True
    except Exception:
        return False


def push_run_async(run_data: dict[str, Any]) -> None:
    """Push a run in a background thread (fire-and-forget)."""
    thread = threading.Thread(target=push_run, args=(run_data,), daemon=True)
    thread.start()

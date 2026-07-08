"""Route all LLM calls through the ARGUS proxy (Supabase Edge Function).

All calls go through the proxy using the ARGUS-provided key. Users never
need their own OpenAI key. The user must be logged in via `argus login`.

This module exposes a single function: `create_chat_completion()` which
mirrors the OpenAI chat completions API shape.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from argus.cloud import SUPABASE_URL, _get_valid_credentials

_PROXY_URL = f"{SUPABASE_URL}/functions/v1/llm-proxy"


def _has_own_key() -> bool:
    """Deprecated — always returns False. All calls go through the proxy."""
    return False


def _call_proxy(
    *,
    model: str,
    messages: list[dict[str, str]],
    max_tokens: int = 2000,
    temperature: float = 0.3,
    response_format: dict[str, str] | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Call the ARGUS LLM proxy edge function."""
    creds = _get_valid_credentials()
    if creds is None:
        return {"error": "Not logged in. Run: argus login"}

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if response_format:
        payload["response_format"] = response_format

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        _PROXY_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {creds.access_token}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read())
            return {"error": body.get("error", f"Proxy HTTP {exc.code}")}
        except Exception:
            return {"error": f"Proxy HTTP {exc.code}"}
    except Exception as exc:
        return {"error": f"Proxy error: {exc}"}


def create_chat_completion(
    *,
    model: str,
    messages: list[dict[str, str]],
    max_tokens: int = 2000,
    temperature: float = 0.3,
    response_format: dict[str, str] | None = None,
    api_key: str | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Create a chat completion via the ARGUS proxy.

    All LLM calls are routed through the Supabase Edge Function proxy
    which uses the ARGUS-provided OpenAI key. Users never need their own key.
    Requires the user to be logged in via `argus login`.

    Returns the raw OpenAI response dict on success, or {"error": "..."} on
    failure.  Callers should check for the "error" key.
    """
    return _call_proxy(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        response_format=response_format,
        timeout=timeout,
    )


def is_available() -> bool:
    """Return True if LLM calls can be made (user is logged in)."""
    creds = _get_valid_credentials()
    return creds is not None

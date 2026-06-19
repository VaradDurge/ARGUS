"""Route LLM calls through the ARGUS proxy when the user has no own OpenAI key.

If the user has OPENAI_API_KEY set, calls go directly to OpenAI (no proxy).
If not, but the user is logged in via `argus login`, calls route through the
Supabase Edge Function which uses the ARGUS-provided key.

This module exposes a single function: `create_chat_completion()` which
mirrors the OpenAI chat completions API shape.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from argus.cloud import SUPABASE_URL, _get_valid_credentials

_PROXY_URL = f"{SUPABASE_URL}/functions/v1/llm-proxy"


def _has_own_key() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


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
    """Create a chat completion via direct OpenAI or the ARGUS proxy.

    Returns the raw OpenAI response dict on success, or {"error": "..."} on
    failure.  Callers should check for the "error" key.
    """
    key = api_key or os.environ.get("OPENAI_API_KEY")

    # Path 1: user has their own key — call OpenAI directly
    if key:
        try:
            import openai  # type: ignore[import-untyped]
        except ImportError:
            return {"error": "openai package not installed (pip install openai)"}

        client = openai.OpenAI(api_key=key, timeout=timeout)
        response = client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            max_tokens=max_tokens,
            temperature=temperature,
            **({"response_format": response_format} if response_format else {}),
        )
        # Convert to dict to match proxy response shape
        return response.model_dump()

    # Path 2: no own key — try the proxy (requires argus login)
    return _call_proxy(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        response_format=response_format,
        timeout=timeout,
    )


def is_available() -> bool:
    """Return True if LLM calls can be made (own key OR logged in)."""
    if _has_own_key():
        return True
    creds = _get_valid_credentials()
    return creds is not None

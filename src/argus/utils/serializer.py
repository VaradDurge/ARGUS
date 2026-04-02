from __future__ import annotations

import dataclasses
from typing import Any

_MAX_FIELD_SIZE = 50_000  # bytes — fields larger than this are truncated


def safe_serialize(obj: Any, max_field_size: int = _MAX_FIELD_SIZE) -> dict[str, Any]:
    """Safely serialize an arbitrary state object to a JSON-compatible dict.

    Never raises. Unserializable fields are replaced with a marker dict.
    """
    raw = _to_dict(obj)
    if not isinstance(raw, dict):
        return {"__argus_value__": _safe_field(raw, max_field_size)}
    return {k: _safe_field(v, max_field_size) for k, v in raw.items()}


def _to_dict(obj: Any) -> Any:
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, dict):
        return obj
    # Pydantic v2
    if hasattr(obj, "model_dump") and callable(obj.model_dump):
        try:
            return obj.model_dump()
        except Exception:
            pass
    # Pydantic v1
    if hasattr(obj, "dict") and callable(obj.dict):
        try:
            return obj.dict()
        except Exception:
            pass
    # dataclass
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        try:
            return dataclasses.asdict(obj)
        except Exception:
            pass
    # TypedDict is just a plain dict at runtime
    if isinstance(obj, dict):
        return obj
    # list/tuple
    if isinstance(obj, (list, tuple)):
        return [_to_dict(item) for item in obj]
    # fallback
    return obj


def _safe_field(value: Any, max_size: int) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        if len(value.encode()) > max_size:
            return {"__argus_truncated__": True, "type": "str", "preview": value[:200]}
        return value
    if isinstance(value, (list, tuple)):
        result = []
        total = 0
        for item in value:
            serialized = _safe_field(item, max_size)
            total += len(str(serialized))
            if total > max_size:
                result.append({"__argus_truncated__": True, "remaining": len(value) - len(result)})
                break
            result.append(serialized)
        return result
    if isinstance(value, dict):
        return {k: _safe_field(v, max_size) for k, v in value.items()}
    # try converting first
    converted = _to_dict(value)
    if isinstance(converted, dict):
        return {k: _safe_field(v, max_size) for k, v in converted.items()}
    if isinstance(converted, (list, tuple)):
        return _safe_field(converted, max_size)
    if isinstance(converted, (bool, int, float, str)):
        return _safe_field(converted, max_size)
    # unserializable
    try:
        repr_str = repr(value)[:200]
    except Exception:
        repr_str = "<repr failed>"
    return {
        "__argus_unserializable__": True,
        "type": type(value).__name__,
        "repr": repr_str,
    }


def safe_deserialize(snapshot: dict[str, Any], type_hint: type | None) -> Any:
    """Reconstruct a state object from a serialized snapshot.

    For TypedDict: returns plain dict (TypedDict is just a dict at runtime).
    For Pydantic: calls model_validate.
    Falls back to plain dict if type_hint is None or unknown.
    """
    if type_hint is None:
        return snapshot

    # Pydantic v2
    if hasattr(type_hint, "model_validate"):
        try:
            return type_hint.model_validate(snapshot)
        except Exception:
            return snapshot

    # Pydantic v1
    if hasattr(type_hint, "parse_obj"):
        try:
            return type_hint.parse_obj(snapshot)
        except Exception:
            return snapshot

    # TypedDict / dataclass / plain dict — return as-is
    return snapshot

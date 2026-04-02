from __future__ import annotations

import inspect
import typing
from typing import Any, get_type_hints

# typing.Required / NotRequired were added in Python 3.11
_TYPING_REQUIRED = getattr(typing, "Required", None)
_TYPING_NOT_REQUIRED = getattr(typing, "NotRequired", None)


def extract_fields(state_type: type) -> dict[str, dict[str, Any]]:
    """Return {field_name: {"type": ..., "required": bool}} for a state type.

    Supports TypedDict, Pydantic v1/v2, dataclasses. Returns empty dict on failure.
    """
    if state_type is None:
        return {}

    # Pydantic v2
    if hasattr(state_type, "model_fields"):
        result = {}
        for name, field_info in state_type.model_fields.items():
            result[name] = {
                "type": field_info.annotation,
                "required": field_info.is_required(),
            }
        return result

    # Pydantic v1
    if hasattr(state_type, "__fields__"):
        result = {}
        for name, field_obj in state_type.__fields__.items():
            result[name] = {
                "type": field_obj.outer_type_,
                "required": field_obj.required,
            }
        return result

    # TypedDict (has __annotations__ and __required_keys__)
    if _is_typeddict(state_type):
        try:
            hints = get_type_hints(state_type, include_extras=True)
        except Exception:
            hints = getattr(state_type, "__annotations__", {})
        required_keys = getattr(state_type, "__required_keys__", set(hints.keys()))
        result = {}
        for name, type_hint in hints.items():
            is_required = name in required_keys
            # Handle NotRequired[X] annotation
            origin = getattr(type_hint, "__origin__", None)
            if _TYPING_REQUIRED is not None and origin is _TYPING_REQUIRED:
                is_required = True
                type_hint = type_hint.__args__[0]
            elif _TYPING_NOT_REQUIRED is not None and origin is _TYPING_NOT_REQUIRED:
                is_required = False
                type_hint = type_hint.__args__[0]
            # Handle Optional[X] → not required
            elif _is_optional(type_hint):
                is_required = False
            result[name] = {"type": type_hint, "required": is_required}
        return result

    # dataclass
    import dataclasses
    if dataclasses.is_dataclass(state_type) and isinstance(state_type, type):
        result = {}
        for f in dataclasses.fields(state_type):
            has_default = (
                f.default is not dataclasses.MISSING
                or f.default_factory is not dataclasses.MISSING  # type: ignore[misc]
            )
            result[f.name] = {"type": f.type, "required": not has_default}
        return result

    return {}


def get_node_state_type(fn: Any) -> type | None:
    """Extract the state type from a node function's first parameter annotation."""
    try:
        hints = get_type_hints(fn)
    except Exception:
        hints = {}

    try:
        params = list(inspect.signature(fn).parameters.keys())
    except Exception:
        return None

    if not params:
        return None

    first_param = params[0]
    return hints.get(first_param)


def _is_typeddict(cls: Any) -> bool:
    return (
        isinstance(cls, type)
        and issubclass(cls, dict)
        and hasattr(cls, "__annotations__")
        and hasattr(cls, "__total__")
    )


def _is_optional(type_hint: Any) -> bool:
    origin = getattr(type_hint, "__origin__", None)
    if origin is typing.Union:
        args = type_hint.__args__
        return type(None) in args
    return False

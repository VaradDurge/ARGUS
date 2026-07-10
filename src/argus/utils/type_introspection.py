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
    """Extract the state type from a node function's first parameter annotation.

    Handles ``functools.partial`` by unwrapping to the underlying function
    and resolving which parameter is the first *unbound* one (i.e. the state
    parameter that LangGraph will pass at call time).
    """
    import functools

    # Unwrap functools.partial to reach the real function and track bound args
    bound_positional_count = 0
    bound_keyword_names: set[str] = set()
    unwrapped = fn
    while isinstance(unwrapped, functools.partial):
        bound_positional_count += len(unwrapped.args)
        bound_keyword_names.update(unwrapped.keywords.keys())
        unwrapped = unwrapped.func

    try:
        hints = get_type_hints(unwrapped)
    except Exception:
        hints = {}

    try:
        params = list(inspect.signature(unwrapped).parameters.keys())
    except Exception:
        return None

    if not params:
        return None

    # Skip parameters that were already bound by partial()
    unbound_params = params[bound_positional_count:]
    unbound_params = [p for p in unbound_params if p not in bound_keyword_names]

    if not unbound_params:
        return None

    first_param = unbound_params[0]
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


def extract_reducer_fields(graph: Any) -> dict[str, Any]:
    """Return ``{field_name: reducer_fn}`` for state fields that have reducers.

    Checks two sources so all LangGraph reducer patterns are covered:

    1. ``Annotated[type, reducer_fn]`` on the StateGraph's TypedDict schema
       (covers ``operator.add``, ``add_messages``, custom callables).
    2. Channel-based reducers (``BinaryOperatorAggregate``) on the graph object
       (covers the lower-level dict-schema API).

    Returns an empty dict when no reducers are detected.
    """
    reducers: dict[str, Any] = {}

    # --- Source 1: Annotated type hints on the state schema ---
    state_type = getattr(graph, "schema", None) or getattr(graph, "_schema", None)
    if state_type is not None and isinstance(state_type, type):
        try:
            hints = get_type_hints(state_type, include_extras=True)
        except Exception:
            hints = {}
        for name, hint in hints.items():
            origin = getattr(hint, "__origin__", None)
            if origin is typing.Annotated:
                args = typing.get_args(hint)
                # args[0] is the base type, args[1:] are metadata — first
                # callable after the base type is the reducer function.
                for arg in args[1:]:
                    if callable(arg):
                        reducers[name] = arg
                        break

    # --- Source 2: Channel objects (BinaryOperatorAggregate) ---
    channels = getattr(graph, "channels", None) or getattr(graph, "_channels", None)
    if channels and isinstance(channels, dict):
        for name, ch in channels.items():
            if name in reducers:
                continue  # Annotated source already found it
            # langgraph.channels.BinaryOperatorAggregate stores the reducer
            # as .operator; other channel types may expose it differently.
            op = getattr(ch, "operator", None)
            if op is not None and callable(op):
                reducers[name] = op

    return reducers

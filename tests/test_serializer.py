"""Tests for argus.utils.serializer — safe_serialize."""
from __future__ import annotations

import dataclasses
from typing import TypedDict

from argus.utils.serializer import safe_serialize


def test_plain_dict() -> None:
    result = safe_serialize({"a": 1, "b": "hello"})
    assert result == {"a": 1, "b": "hello"}


def test_none_value() -> None:
    result = safe_serialize({"x": None})
    assert result == {"x": None}


def test_nested_dict() -> None:
    result = safe_serialize({"outer": {"inner": 42}})
    assert result["outer"]["inner"] == 42


def test_list_value() -> None:
    result = safe_serialize({"docs": ["a", "b", "c"]})
    assert result["docs"] == ["a", "b", "c"]


def test_primitives_preserved() -> None:
    result = safe_serialize({"i": 1, "f": 3.14, "b": True, "s": "text"})
    assert result["i"] == 1
    assert result["f"] == 3.14
    assert result["b"] is True
    assert result["s"] == "text"


class _SampleTypedDict(TypedDict):
    name: str
    score: int


def test_typed_dict() -> None:
    obj: _SampleTypedDict = {"name": "test", "score": 99}
    result = safe_serialize(obj)
    assert result["name"] == "test"
    assert result["score"] == 99


@dataclasses.dataclass
class _SampleDataclass:
    x: int
    y: str


def test_dataclass() -> None:
    obj = _SampleDataclass(x=5, y="hello")
    result = safe_serialize(obj)
    assert result["x"] == 5
    assert result["y"] == "hello"


def test_unserializable_field_gets_marker() -> None:
    class _Unpicklable:
        pass

    result = safe_serialize({"obj": _Unpicklable()})
    marker = result["obj"]
    assert isinstance(marker, dict)
    assert marker.get("__argus_unserializable__") is True
    assert marker["type"] == "_Unpicklable"


def test_large_string_truncated() -> None:
    big = "x" * 100_000
    result = safe_serialize({"text": big}, max_field_size=1000)
    marker = result["text"]
    assert isinstance(marker, dict)
    assert marker.get("__argus_truncated__") is True
    assert marker["type"] == "str"


def test_large_list_truncated() -> None:
    big_list = list(range(10_000))
    result = safe_serialize({"items": big_list}, max_field_size=100)
    items = result["items"]
    assert isinstance(items, list)
    # last element should be the truncation marker
    assert any(
        isinstance(el, dict) and el.get("__argus_truncated__") for el in items
    )


def test_non_dict_input_wrapped() -> None:
    result = safe_serialize("just a string")
    assert "__argus_value__" in result
    assert result["__argus_value__"] == "just a string"


def test_empty_dict() -> None:
    result = safe_serialize({})
    assert result == {}

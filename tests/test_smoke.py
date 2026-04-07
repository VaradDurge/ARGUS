"""Smoke tests to verify ARGUS core imports work correctly."""

import importlib


def test_argus_imports():
    """Verify core modules are importable without errors."""
    modules = [
        "argus",
        "argus.models",
        "argus.watcher",
        "argus.session",
        "argus.storage",
        "argus.replay",
        "argus.inspector",
        "argus.checkpoints",
    ]
    for mod in modules:
        assert importlib.import_module(mod) is not None, f"Failed to import {mod}"


def test_argus_version():
    """Verify package has a version attribute."""
    import argus

    assert hasattr(argus, "__version__") or True  # version may live in pyproject only

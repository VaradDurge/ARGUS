"""ARGUS — Agentic Realtime Guard and Unified Scope.

Silent watcher for LangGraph multiagent pipelines.
Detects silent failures, captures full state, enables step-level replay.

Usage:
    from argus import ArgusWatcher

    watcher = ArgusWatcher()
    watcher.watch(graph)        # before graph.compile()

    app = graph.compile()
    result = app.invoke(state)
"""

__version__ = "0.1.0"

from argus.watcher import ArgusWatcher

__all__ = ["ArgusWatcher", "__version__"]

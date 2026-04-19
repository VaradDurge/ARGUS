"""ARGUS — Agentic Realtime Guard and Unified Scope.

Monitors multi-agent pipelines for silent failures, semantic errors,
and handoff contract violations. Framework-agnostic core with a
first-class LangGraph adapter.

LangGraph usage:
    from argus import ArgusWatcher

    watcher = ArgusWatcher(validators={
        "my_node": lambda out: (out.get("score", 0) > 0.5, "Score too low"),
    })
    watcher.watch(graph)        # before graph.compile()
    app = graph.compile()
    result = app.invoke(state)

Framework-agnostic usage (Prefect, Temporal, raw Python, etc.):
    from argus import ArgusSession

    session = ArgusSession(validators={"validate": lambda o: (o.get("ok"), "not ok")})
    session.set_edges({"fetch": ["validate"], "validate": ["process"]})

    fetch    = session.wrap("fetch",    fetch_fn)
    validate = session.wrap("validate", validate_fn)
    process  = session.wrap("process",  process_fn)

    state = fetch(initial_state)
    state = validate(state)
    state = process(state)
    session.finalize()
"""

__version__ = "0.3.0"

from argus.session import ArgusSession
from argus.watcher import ArgusWatcher

__all__ = ["ArgusWatcher", "ArgusSession", "__version__"]

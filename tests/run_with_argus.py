"""Run the test pipelines with ARGUS wired in — standard 2-line integration."""
from test_langgraph_pipeline import (
    build_clean_pipeline,
    build_failing_pipeline,
    build_sensitive_data_pipeline,
)

from argus import ArgusWatcher

print("=" * 60)
print("RUN 1: FAILING PIPELINE")
print("=" * 60)
graph = build_failing_pipeline()
watcher = ArgusWatcher(investigate="always")
watcher.watch(graph)
app = graph.compile()
app.invoke({"query": "AI agent observability"})
watcher.finalize()
print("Done — check 'argus show last' or 'argus ui'\n")

print("=" * 60)
print("RUN 2: CLEAN PIPELINE (expect zero failures)")
print("=" * 60)
graph = build_clean_pipeline()
watcher = ArgusWatcher(investigate="always")
watcher.watch(graph)
app = graph.compile()
app.invoke({"query": "AI agent observability"})
watcher.finalize()
print("Done\n")

print("=" * 60)
print("RUN 3: SENSITIVE DATA (with redact_keys)")
print("=" * 60)
graph = build_sensitive_data_pipeline()
watcher = ArgusWatcher(investigate="always", redact_keys=["api_key", "auth_token"])
watcher.watch(graph)
app = graph.compile()
app.invoke({"query": "test"})
watcher.finalize()
print("Done\n")

print("=" * 60)
print("RUN 4: SENSITIVE DATA (with persist_state=False)")
print("=" * 60)
graph = build_sensitive_data_pipeline()
watcher = ArgusWatcher(investigate="always", persist_state=False)
watcher.watch(graph)
app = graph.compile()
app.invoke({"query": "test"})
watcher.finalize()
print("Done\n")

print("Now run:  argus list")
print("Then:     argus ui")

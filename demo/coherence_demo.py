"""
Demo: trigger all 4 VAR-7 input-output coherence checks.
Run from the repo root:
    python demo/coherence_demo.py
Then view the run:
    argus show <run-id>          # printed at end
    argus ui                     # full dashboard
"""
from argus.session import ArgusSession
from argus.storage import load_run

long_text = (
    "The market outlook is very bullish with strong momentum "
    "and positive indicators across all sectors. " * 3
)


def run_pipeline():
    session = ArgusSession()
    session.set_node_names(
        ["selective_attn", "echo_node", "contradiction", "ctx_overflow"]
    )

    # Rule 13 — selective attention: input 5 items, output 2
    w1 = session.wrap("selective_attn", lambda s: {"items": s["items"][:2]})

    # Rule 14 — input echo: return the input text verbatim
    w2 = session.wrap("echo_node", lambda s: {"result": s["text"]})

    # Rule 15 — contradiction: input bullish, output bearish
    w3 = session.wrap(
        "contradiction",
        lambda s: {"recommendation": "bearish sell — downtrend confirmed"},
    )

    # Rule 16 — context overflow: input > 100K chars
    w4 = session.wrap("ctx_overflow", lambda s: {"summary": "ok"})

    w1({"items": [1, 2, 3, 4, 5]})
    w2({"text": long_text})
    w3({"signal": "bullish uptrend — strong buy signal"})
    w4({"body": "x" * 110_000})

    session.finalize()
    return session.run_id


if __name__ == "__main__":
    run_id = run_pipeline()
    record = load_run(run_id)

    print(f"\nRun ID: {run_id}\n")
    for step in record.steps:
        failures = step.inspection.tool_failures if step.inspection else []
        print(f"  [{step.node_name}]")
        if failures:
            for f in failures:
                print(f"    ⚠  {f.failure_type}: {f.evidence}")
        else:
            print("    ✓  clean")

    print(f"\nTo view in UI:  argus ui")
    print(f"To inspect:     argus show {run_id}")

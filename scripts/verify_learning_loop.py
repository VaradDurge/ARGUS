"""Verify the ARGUS adaptive learning loop end-to-end.

Simulates the full pipeline:
  1. Seed a fake candidate (as if the LLM investigator found a new pattern)
  2. Show pending candidates
  3. Wait for human approval/rejection
  4. If approved → verify it lands in custom_signatures.json
  5. Verify the registry picks it up for future detection
  6. Run a scan with the new pattern to prove it works
  7. Clean up

Usage:
    python scripts/verify_learning_loop.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure src/ is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from argus.candidate_store import (
    add_candidate,
    approve_candidate,
    load_candidates,
    load_custom_signatures,
    reject_candidate,
)
from argus.models import SuggestedSignature
from argus.registry import reload_registry, scan_value


def _header(msg: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {msg}")
    print(f"{'=' * 60}")


def _show_candidates(data: dict) -> None:
    candidates = data.get("candidates", [])
    if not candidates:
        print("  (no pending candidates)")
        return
    for c in candidates:
        print(f"  [{c['id']}] pattern={c['pattern']!r}")
        print(f"         strategy={c['match_strategy']}, "
              f"category={c['proposed_category']}, "
              f"severity={c['severity']}")
        print(f"         confidence={c.get('confidence', '?')}, "
              f"times_seen={c.get('times_seen', 1)}")
        print(f"         reason: {c.get('reasoning', 'n/a')}")
        print()


def main() -> None:
    _header("STEP 1: Simulate LLM investigator finding a new failure pattern")

    fake_sig = SuggestedSignature(
        pattern="I cannot help with that request",
        match_strategy="contains_ci",
        proposed_category="refusal_leak",
        severity="warning",
        description="LLM refusal leaking into pipeline output",
        evidence=(
            "Node 'summarizer' output contained refusal text",
            "Expected a summary, got a refusal",
        ),
        confidence=0.85,
        reasoning="The LLM refused the summarization task but the pipeline "
                  "did not detect it as a failure — output was passed downstream.",
    )

    cand_id = add_candidate(fake_sig, run_id="test-run-001", node_name="summarizer")

    if cand_id is None:
        print("  Pattern already exists (in registry, custom, or rejected). "
              "Skipping — the dedup system works correctly.")
        print("  To re-run: delete .argus/candidates.json and "
              ".argus/custom_signatures.json first.")
        return

    print(f"  Candidate created: {cand_id}")

    # ── Step 2: Show what's pending ──
    _header("STEP 2: Current pending candidates")
    data = load_candidates()
    _show_candidates(data)

    # ── Step 3: Human decision ──
    _header("STEP 3: Human approval gate")
    print(f"  Candidate: {cand_id}")
    print("  Pattern:   'I cannot help with that request'")
    print("  Strategy:  contains_ci")
    print("  Category:  refusal_leak")
    print()

    while True:
        choice = input("  Approve or Reject? [a/r]: ").strip().lower()
        if choice in ("a", "r"):
            break
        print("  Please enter 'a' to approve or 'r' to reject.")

    if choice == "r":
        _header("STEP 4: Rejecting candidate")
        reject_candidate(cand_id)
        data = load_candidates()
        print("  Rejected. Pattern added to rejected_patterns list.")
        print(f"  Rejected patterns: {data.get('rejected_patterns', [])}")
        print("\n  If the LLM suggests this pattern again, it will be "
              "auto-skipped.")

        _header("STEP 5: Verify re-adding is blocked")
        retry_id = add_candidate(fake_sig, run_id="test-run-002")
        if retry_id is None:
            print("  Correctly blocked — rejected patterns are remembered.")
        else:
            print(f"  BUG: should have been blocked but got {retry_id}")

        # Clean up
        _cleanup_rejected(fake_sig.pattern)
        print("\n  Cleaned up test data.")
        return

    # ── Approved path ──
    _header("STEP 4: Approving candidate → custom_signatures.json")
    new_sig = approve_candidate(cand_id)
    if new_sig is None:
        print("  ERROR: approve returned None")
        return
    print(f"  Approved as: {new_sig['id']}")
    print("  Written to: .argus/custom_signatures.json")

    custom = load_custom_signatures()
    print(f"  Total custom signatures: {len(custom.get('signatures', []))}")
    print(f"  Latest: {custom['signatures'][-1]}")

    # ── Step 5: Reload registry ──
    _header("STEP 5: Reload registry and verify pattern is active")
    reload_registry()
    print("  Registry reloaded.")

    # ── Step 6: Test detection ──
    _header("STEP 6: Scan a test string with the new pattern")
    test_output = "I cannot help with that request. Please try a different query."
    matches = scan_value(test_output)
    if matches:
        print("  DETECTED! The learned pattern caught the failure:")
        for m in matches:
            print(f"    - [{m.sig_id}] {m.category}: {m.description}")
    else:
        print("  No match — something is wrong with the registry integration.")

    # Also test a clean string
    clean = "Here is your summary of the quarterly earnings report."
    clean_matches = scan_value(clean)
    print(f"\n  Clean string scan: {len(clean_matches)} matches (expected 0)")

    # ── Cleanup ──
    _header("STEP 7: Cleanup")
    _cleanup_approved(new_sig["id"])
    reload_registry()
    print("  Removed test signature from custom_signatures.json.")
    print("  Registry reloaded to clean state.")

    verify_matches = scan_value(test_output)
    print(f"  Post-cleanup scan: {len(verify_matches)} matches from learned "
          f"pattern (expected 0)")


def _cleanup_rejected(pattern: str) -> None:
    """Remove test pattern from rejected list."""
    from argus.candidate_store import load_candidates, save_candidates
    data = load_candidates()
    rejected = data.get("rejected_patterns", [])
    if pattern in rejected:
        rejected.remove(pattern)
        save_candidates(data)


def _cleanup_approved(sig_id: str) -> None:
    """Remove test signature from custom_signatures.json."""
    from argus.candidate_store import delete_custom_signature
    delete_custom_signature(sig_id)


if __name__ == "__main__":
    main()

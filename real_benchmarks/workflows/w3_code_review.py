"""
Workflow 3: Automated Code Review Pipeline
==========================================
Multi-agent pipeline that reviews a pull request diff.

  diff_parser → security_scanner → style_checker → review_generator

Failure injected: security_scanner returns error key + drops security_findings.
  → review_generator crashes trying to format None findings list.

Multi-hop: root cause is security_scanner (silent failure),
           crash surfaces at review_generator.
  - ARGUS: first_failure_step = "security_scanner" ✓
  - Naive: sees crash at "review_generator", blames wrong node ✗
"""
from __future__ import annotations

import time
from typing import TypedDict

from langgraph.graph import StateGraph

NAME = "Code Review Agent"
FAULT_TYPE = "multi_hop"
TRUE_FAULT_NODE = "security_scanner"
DESCRIPTION = "scanner returns error key → review_generator crashes on None findings"


# ── State ─────────────────────────────────────────────────────────────────────

class CodeReviewState(TypedDict):
    pr_diff: str
    # diff_parser
    parsed_changes: dict
    file_count: int
    lines_added: int
    lines_removed: int
    # security_scanner
    security_findings: list[dict]   # REQUIRED
    scan_metadata: dict
    # style_checker
    style_issues: list[str]
    style_score: float
    # review_generator
    review_summary: str
    severity: str
    approved: bool


class DiffParserInput(TypedDict):
    pr_diff: str


class SecurityScannerInput(TypedDict):
    pr_diff: str
    parsed_changes: dict
    file_count: int


class StyleCheckerInput(TypedDict):
    pr_diff: str
    parsed_changes: dict
    security_findings: list[dict]    # REQUIRED


class ReviewGeneratorInput(TypedDict):
    parsed_changes: dict
    security_findings: list[dict]    # REQUIRED — crashes if None
    style_issues: list[str]
    style_score: float
    lines_added: int


# ── Nodes ─────────────────────────────────────────────────────────────────────

def diff_parser(state: DiffParserInput) -> dict:
    """Parses raw PR diff into structured change metadata."""
    time.sleep(0.04)
    diff = state["pr_diff"]
    lines = diff.splitlines()
    added = sum(
        1 for line in lines if line.startswith("+") and not line.startswith("+++")
    )
    removed = sum(
        1 for line in lines if line.startswith("-") and not line.startswith("---")
    )
    files = {line[6:] for line in lines if line.startswith("+++ b/")}
    return {
        "parsed_changes": {"files": list(files), "has_sql": "SELECT" in diff or "INSERT" in diff},
        "file_count": len(files) or 1,
        "lines_added": added,
        "lines_removed": removed,
    }


def security_scanner(state: SecurityScannerInput) -> dict:
    """Healthy: scans diff for security issues (hardcoded secrets, SQL injection, etc.)."""
    time.sleep(0.18)
    diff = state["pr_diff"]
    findings = []
    if any(kw in diff for kw in ["password", "secret", "api_key", "token"]):
        findings.append({"type": "hardcoded_secret", "severity": "critical", "line": 12})
    if "SELECT" in diff and "+" in diff:
        findings.append({"type": "potential_sql_injection", "severity": "high", "line": 27})
    return {
        "security_findings": findings,
        "scan_metadata": {"rules_checked": 42, "scan_ms": 181, "findings_count": len(findings)},
    }


def security_scanner_buggy(state: SecurityScannerInput) -> dict:
    """BUGGY: SAST tool API unavailable — returns error key, drops security_findings.

    Real scenario: external security scanning service times out.
    Agent catches the exception internally, logs a warning, returns partial output.
    Pipeline continues — review_generator crashes because it assumes findings is a list.

    ARGUS detects: critical tool failure (error key) + missing required field
    Naive: no exception here → reports scanner as "success"
    """
    time.sleep(0.55)   # simulate timeout
    return {
        "error": "sast_api_unavailable: connection refused after 3 retries",
        "scan_metadata": {
            "rules_checked": 0,
            "scan_ms": 5500,
            "fallback": "skipped",
        },
        # 'security_findings' is ABSENT → review_generator will crash
    }


def style_checker(state: StyleCheckerInput) -> dict:
    """Checks code style — works fine even if security_findings is missing (uses .get)."""
    time.sleep(0.09)
    diff = state["pr_diff"]
    issues = []
    if len([line for line in diff.splitlines() if len(line) > 120]):
        issues.append("Lines exceeding 120 characters found")
    if "TODO" in diff:
        issues.append("TODO comments should be tracked in issues, not code")
    score = max(0.0, 1.0 - len(issues) * 0.15)
    return {"style_issues": issues, "style_score": round(score, 2)}


def review_generator(state: ReviewGeneratorInput) -> dict:
    """Generates structured code review from all scan results.

    Assumes security_findings is always a list. Crashes if it's None/absent.
    This is the 'crash' end of the multi-hop chain.
    """
    time.sleep(0.14)
    findings = state["security_findings"]   # AttributeError/TypeError if None
    style = state.get("style_issues", [])

    # Will crash with TypeError if findings is None
    critical = [f for f in findings if f.get("severity") == "critical"]
    high = [f for f in findings if f.get("severity") == "high"]

    severity = "low"
    if critical:
        severity = "critical"
    elif high:
        severity = "high"
    elif style:
        severity = "medium"

    lines = state.get("lines_added", 0)
    summary = (
        f"Reviewed {lines} added lines. "
        f"Security: {len(findings)} findings ({len(critical)} critical). "
        f"Style: {len(style)} issues."
    )
    return {
        "review_summary": summary,
        "severity": severity,
        "approved": severity not in ("critical", "high"),
    }


# ── Graph builders ─────────────────────────────────────────────────────────────

def _assemble(scanner_fn) -> StateGraph:
    g = StateGraph(CodeReviewState)
    g.add_node("diff_parser",       diff_parser)
    g.add_node("security_scanner",  scanner_fn)
    g.add_node("style_checker",     style_checker)
    g.add_node("review_generator",  review_generator)
    g.add_edge("diff_parser",      "security_scanner")
    g.add_edge("security_scanner", "style_checker")
    g.add_edge("style_checker",    "review_generator")
    g.set_entry_point("diff_parser")
    g.set_finish_point("review_generator")
    return g


def build_clean() -> StateGraph:
    return _assemble(security_scanner)


def build_failure() -> StateGraph:
    return _assemble(security_scanner_buggy)


def initial_state() -> dict:
    return {"pr_diff": """\
--- a/auth/login.py
+++ b/auth/login.py
@@ -10,6 +10,12 @@
+    api_key = "sk-prod-abc123secret"
+    password = "admin123"
+    query = "SELECT * FROM users WHERE id=" + user_id
+    # TODO: remove hardcoded credentials before merge
+    result = db.execute(query)
+    return result
"""}

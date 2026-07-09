"""Tests for the source_locator module."""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from argus.replay import _strip_line_number
from argus.source_locator import (
    _ast_parse_builder_files,
    _enrich_existing_paths,
    _follow_import,
    _grep_for_function,
    locate_node_sources,
)


# ── Fixtures ───────────────────────────────────────────────────────


@pytest.fixture()
def project_dir(tmp_path: Path) -> Path:
    """Create a mock LangGraph project structure."""
    # Node definitions
    nodes_dir = tmp_path / "src" / "nodes"
    nodes_dir.mkdir(parents=True)

    (nodes_dir / "__init__.py").write_text("")

    (nodes_dir / "summarize.py").write_text(
        textwrap.dedent("""\
        def summarize(state):
            \"\"\"Summarize the document.\"\"\"
            return {"summary": "done"}
        """)
    )

    (nodes_dir / "classify.py").write_text(
        textwrap.dedent("""\
        async def classify(state):
            \"\"\"Classify the document.\"\"\"
            return {"category": "A"}
        """)
    )

    # Builder file with graph.add_node() calls
    (tmp_path / "pipeline.py").write_text(
        textwrap.dedent("""\
        from langgraph.graph import StateGraph
        from src.nodes.summarize import summarize
        from src.nodes.classify import classify

        def build_graph():
            graph = StateGraph(dict)
            graph.add_node("summarize", summarize)
            graph.add_node("classify", classify)
            graph.add_edge("summarize", "classify")
            return graph
        """)
    )

    return tmp_path


# ── _strip_line_number ─────────────────────────────────────────────


@pytest.mark.unit
class TestStripLineNumber:
    def test_with_line_number(self) -> None:
        assert _strip_line_number("src/foo.py:42") == "src/foo.py"

    def test_without_line_number(self) -> None:
        assert _strip_line_number("src/foo.py") == "src/foo.py"

    def test_windows_path(self) -> None:
        assert _strip_line_number("src\\foo.py:10") == "src\\foo.py"

    def test_empty_string(self) -> None:
        assert _strip_line_number("") == ""

    def test_colon_in_path_not_line(self) -> None:
        assert _strip_line_number("C:\\Users\\foo.py") == "C:\\Users\\foo.py"


# ── _grep_for_function ─────────────────────────────────────────────


@pytest.mark.unit
class TestGrepForFunction:
    def test_finds_sync_function(self, project_dir: Path) -> None:
        hits = _grep_for_function("summarize", project_dir)
        assert len(hits) >= 1
        paths = [h[0] for h in hits]
        assert any("summarize.py" in p for p in paths)

    def test_finds_async_function(self, project_dir: Path) -> None:
        hits = _grep_for_function("classify", project_dir)
        assert len(hits) >= 1
        paths = [h[0] for h in hits]
        assert any("classify.py" in p for p in paths)

    def test_no_match(self, project_dir: Path) -> None:
        hits = _grep_for_function("nonexistent_function", project_dir)
        assert len(hits) == 0


# ── _ast_parse_builder_files ───────────────────────────────────────


@pytest.mark.unit
class TestAstParseBuilderFiles:
    def test_finds_add_node_calls(self, project_dir: Path) -> None:
        result = _ast_parse_builder_files(["summarize", "classify"], project_dir)
        assert "summarize" in result
        assert "classify" in result
        # The builder file should be identified
        assert result["summarize"][0] == "pipeline.py"
        assert result["summarize"][1] == "summarize"

    def test_ignores_unknown_nodes(self, project_dir: Path) -> None:
        result = _ast_parse_builder_files(["unknown_node"], project_dir)
        assert "unknown_node" not in result


# ── _follow_import ─────────────────────────────────────────────────


@pytest.mark.unit
class TestFollowImport:
    def test_follows_import(self, project_dir: Path) -> None:
        result = _follow_import("pipeline.py", "summarize", project_dir)
        assert result is not None
        path, line = result
        assert "summarize.py" in path
        assert line == 1  # def summarize(state): is line 1

    def test_follows_async_import(self, project_dir: Path) -> None:
        result = _follow_import("pipeline.py", "classify", project_dir)
        assert result is not None
        path, line = result
        assert "classify.py" in path
        assert line == 1


# ── _enrich_existing_paths ─────────────────────────────────────────


@pytest.mark.unit
class TestEnrichExistingPaths:
    def test_adds_line_number(self, project_dir: Path) -> None:
        paths = {"summarize": "src/nodes/summarize.py"}
        refs = {"summarize": "src.nodes.summarize:summarize"}
        result = _enrich_existing_paths(paths, refs, project_dir)
        assert ":" in result["summarize"]
        assert result["summarize"].endswith(":1")

    def test_preserves_existing_line_number(self, project_dir: Path) -> None:
        paths = {"summarize": "src/nodes/summarize.py:1"}
        result = _enrich_existing_paths(paths, {}, project_dir)
        assert result["summarize"] == "src/nodes/summarize.py:1"


# ── locate_node_sources (integration) ──────────────────────────────


@pytest.mark.unit
class TestLocateNodeSources:
    def test_full_pipeline(self, project_dir: Path) -> None:
        """Test the full resolution pipeline without LLM."""
        from argus.models import RunRecord

        record = RunRecord(
            run_id="test-001",
            argus_version="0.8.0",
            started_at="2026-01-01T00:00:00",
            completed_at="2026-01-01T00:01:00",
            duration_ms=60000,
            overall_status="clean",
            first_failure_step=None,
            root_cause_chain=[],
            graph_node_names=["summarize", "classify"],
            graph_edge_map={"summarize": ["classify"]},
            initial_state={},
            steps=[],
            parent_run_id=None,
            replay_from_step=None,
            is_cyclic=False,
        )

        result = locate_node_sources(record, project_root=project_dir, use_llm=False)
        assert "summarize" in result
        assert "classify" in result
        # Each should have file:line format
        for path in result.values():
            assert ":" in path
            file_part, line_part = path.rsplit(":", 1)
            assert line_part.isdigit()

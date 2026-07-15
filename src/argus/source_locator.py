"""Post-hoc source file resolution for pipeline nodes.

When a run record lacks ``node_fn_refs`` (old runs) or has paths without line
numbers, this module resolves source locations using a layered pipeline:

1. Enrich existing paths with line numbers via AST
2. Grep for function definitions matching node names
3. AST-parse builder files for ``graph.add_node("name", fn)`` calls
4. Follow imports to the actual definition site
5. LLM fallback for ambiguous/unresolved nodes
"""

from __future__ import annotations

import ast
import json
import logging
import os
import re
from pathlib import Path

from argus.models import RunRecord

log = logging.getLogger(__name__)

_EXCLUDE_DIRS = {
    ".venv",
    "venv",
    "__pycache__",
    ".argus",
    "node_modules",
    ".git",
    "site-packages",
    ".tox",
    ".mypy_cache",
    ".ruff_cache",
}


# ── Public API ──────────────────────────────────────────────────────


def locate_node_sources(
    run_record: RunRecord,
    project_root: Path | None = None,
    use_llm: bool = True,
) -> dict[str, str]:
    """Resolve source ``file:line`` for each node in the run.

    Returns ``{node_name: "path/to/file.py:42"}`` dict.

    Resolution pipeline (tried in order):
    1. Enrich existing ``node_fn_paths`` / ``node_fn_refs`` with line numbers
    2. Grep for ``def node_name(`` across project Python files
    3. AST-parse builder files for ``graph.add_node("name", fn)`` mappings
    4. LLM fallback for remaining unresolved nodes
    """
    root = project_root or Path.cwd()
    node_names = run_record.graph_node_names or []
    if not node_names:
        return {}

    resolved: dict[str, str] = {}

    # Step 1: enrich existing paths
    if run_record.node_fn_paths or run_record.node_fn_refs:
        enriched = _enrich_existing_paths(
            node_fn_paths=run_record.node_fn_paths or {},
            node_fn_refs=run_record.node_fn_refs or {},
            project_root=root,
        )
        resolved.update(enriched)

    unresolved = [n for n in node_names if n not in resolved]
    if not unresolved:
        return resolved

    # Step 2: grep for function definitions
    for name in list(unresolved):
        hits = _grep_for_function(name, root)
        if len(hits) == 1:
            path, line = hits[0]
            resolved[name] = f"{path}:{line}"
            unresolved.remove(name)
        elif len(hits) > 1:
            # Multiple candidates — try AST builder scan to disambiguate
            pass

    if not unresolved:
        return resolved

    # Step 3: AST-parse builder files for graph.add_node() calls
    builder_map = _ast_parse_builder_files(unresolved, root)
    for name in list(unresolved):
        if name in builder_map:
            module_file, fn_name = builder_map[name]
            location = _follow_import(module_file, fn_name, root)
            if location:
                path, line = location
                resolved[name] = f"{path}:{line}"
                unresolved.remove(name)

    if not unresolved:
        return resolved

    # Step 4: LLM fallback
    if use_llm and unresolved:
        llm_results = _llm_resolve_unresolved(
            unresolved=unresolved,
            resolved_so_far=resolved,
            node_names=node_names,
            edge_map=run_record.graph_edge_map or {},
            project_root=root,
        )
        resolved.update(llm_results)

    return resolved


def derive_node_fn_refs(
    node_fn_paths: dict[str, str],
    project_root: Path | None = None,
) -> dict[str, str]:
    """Derive ``node_fn_refs`` from resolved ``node_fn_paths``.

    For each ``"path/to/file.py:42"`` entry, parse the file to find the
    function name at that line and build a ``"module:qualname"`` reference.
    """
    root = project_root or Path.cwd()
    refs: dict[str, str] = {}
    for node_name, path_line in node_fn_paths.items():
        parts = path_line.rsplit(":", 1)
        if len(parts) != 2 or not parts[1].isdigit():
            continue
        file_path, line_no = parts[0], int(parts[1])
        abs_path = root / file_path
        if not abs_path.exists():
            continue
        try:
            tree = ast.parse(abs_path.read_text(encoding="utf-8"), filename=str(abs_path))
        except SyntaxError:
            continue
        fn_name = _find_function_at_line(tree, line_no)
        if fn_name:
            module = file_path.removesuffix(".py").replace(os.sep, ".")
            refs[node_name] = f"{module}:{fn_name}"
    return refs


# ── Step 1: Enrich existing paths ──────────────────────────────────


def _enrich_existing_paths(
    node_fn_paths: dict[str, str],
    node_fn_refs: dict[str, str],
    project_root: Path,
) -> dict[str, str]:
    """Add line numbers to existing paths that lack them."""
    result: dict[str, str] = {}

    for name, path_str in node_fn_paths.items():
        # Already has line number?
        if ":" in path_str and path_str.rsplit(":", 1)[1].isdigit():
            result[name] = path_str
            continue

        # Try to find line number via AST
        abs_path = project_root / path_str
        if not abs_path.exists():
            result[name] = path_str
            continue

        # Extract qualname from node_fn_refs if available
        qualname = None
        if name in node_fn_refs:
            ref = node_fn_refs[name]
            if ":" in ref:
                qualname = ref.rsplit(":", 1)[1]

        target_name = qualname.split(".")[-1] if qualname else name
        line = _find_function_line(abs_path, target_name)
        if line is not None:
            result[name] = f"{path_str}:{line}"
        else:
            result[name] = path_str

    return result


# ── Step 2: Grep for function definitions ──────────────────────────


def _grep_for_function(
    name: str,
    project_root: Path,
) -> list[tuple[str, int]]:
    """Search Python files for ``def name(`` or ``async def name(``.

    Returns list of ``(relative_path, line_number)`` candidates.
    """
    pattern = re.compile(rf"^(?:async\s+)?def\s+{re.escape(name)}\s*\(", re.MULTILINE)
    hits: list[tuple[str, int]] = []

    for py_file in _iter_python_files(project_root):
        try:
            text = py_file.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for match in pattern.finditer(text):
            line_no = text[: match.start()].count("\n") + 1
            rel = os.path.relpath(py_file, project_root)
            hits.append((rel, line_no))

    return hits


# ── Step 3: AST-parse builder files ────────────────────────────────


def _ast_parse_builder_files(
    node_names: list[str],
    project_root: Path,
) -> dict[str, tuple[str, str]]:
    """Scan Python files for ``graph.add_node("name", fn)`` calls.

    Returns ``{node_name: (builder_file_relpath, fn_identifier)}`` for nodes
    whose add_node call is found.
    """
    target_set = set(node_names)
    results: dict[str, tuple[str, str]] = {}

    for py_file in _iter_python_files(project_root):
        try:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))
        except (OSError, UnicodeDecodeError, SyntaxError):
            continue

        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if not _is_add_node_call(node):
                continue
            if len(node.args) < 2:
                continue

            # First arg: node name string
            name_arg = node.args[0]
            if not isinstance(name_arg, ast.Constant) or not isinstance(name_arg.value, str):
                continue
            node_name = name_arg.value
            if node_name not in target_set:
                continue

            # Second arg: function reference
            fn_arg = node.args[1]
            fn_identifier = _extract_identifier(fn_arg)
            if fn_identifier:
                rel = os.path.relpath(py_file, project_root)
                results[node_name] = (rel, fn_identifier)

    return results


def _is_add_node_call(node: ast.Call) -> bool:
    """Check if a Call node is ``*.add_node(...)``."""
    func = node.func
    if isinstance(func, ast.Attribute) and func.attr == "add_node":
        return True
    return False


def _extract_identifier(node: ast.expr) -> str | None:
    """Extract a function identifier from an AST expression.

    Handles: ``fn_name``, ``module.fn_name``, ``module.sub.fn_name``.
    """
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parts = []
        current: ast.expr = node
        while isinstance(current, ast.Attribute):
            parts.append(current.attr)
            current = current.value
        if isinstance(current, ast.Name):
            parts.append(current.id)
            return ".".join(reversed(parts))
    return None


# ── Step 3b: Follow imports ────────────────────────────────────────


def _follow_import(
    builder_file: str,
    fn_identifier: str,
    project_root: Path,
) -> tuple[str, int] | None:
    """Resolve a function identifier to its definition site.

    Given a builder file and a function identifier (e.g. ``summarize_fn``
    or ``nodes.summarize.run``), find where the function is actually defined.
    """
    abs_builder = project_root / builder_file
    if not abs_builder.exists():
        return None

    try:
        source = abs_builder.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(abs_builder))
    except (OSError, SyntaxError):
        return None

    # Simple identifier — look for import in the builder file
    simple_name = fn_identifier.split(".")[-1]
    base_name = fn_identifier.split(".")[0] if "." in fn_identifier else fn_identifier

    for node in ast.walk(tree):
        # from module import fn_name
        if isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                actual_name = alias.asname or alias.name
                if actual_name == base_name:
                    # Resolve the module to a file
                    target_file = _module_to_file(node.module, project_root)
                    if target_file:
                        target_fn = alias.name if not alias.asname else alias.name
                        if "." in fn_identifier:
                            # e.g. SomeClass.method — look for the nested attr
                            target_fn = fn_identifier.split(".", 1)[1]
                        line = _find_function_line(target_file, target_fn.split(".")[-1])
                        if line is not None:
                            rel = os.path.relpath(target_file, project_root)
                            return (rel, line)

        # import module  (then used as module.fn)
        if isinstance(node, ast.Import):
            for alias in node.names:
                actual_name = alias.asname or alias.name
                if actual_name == base_name and "." in fn_identifier:
                    remainder = fn_identifier[len(base_name) + 1 :]
                    target_file = _module_to_file(alias.name, project_root)
                    if target_file:
                        line = _find_function_line(target_file, remainder.split(".")[-1])
                        if line is not None:
                            rel = os.path.relpath(target_file, project_root)
                            return (rel, line)

    # Maybe the function is defined in the builder file itself
    line = _find_function_line(abs_builder, simple_name)
    if line is not None:
        return (builder_file, line)

    return None


# ── Step 4: LLM fallback ──────────────────────────────────────────


def _llm_resolve_unresolved(
    unresolved: list[str],
    resolved_so_far: dict[str, str],
    node_names: list[str],
    edge_map: dict[str, list[str]],
    project_root: Path,
) -> dict[str, str]:
    """Use LLM to resolve remaining unresolved nodes."""
    try:
        from argus.llm_proxy import create_chat_completion, is_available
    except ImportError:
        return {}

    if not is_available():
        log.debug("LLM proxy not available — skipping LLM source resolution")
        return {}

    # Collect relevant Python files for context
    py_files = [os.path.relpath(f, project_root) for f in _iter_python_files(project_root)]
    # Limit to reasonable context size
    py_files = py_files[:200]

    # Build grep context: partial matches for unresolved nodes
    grep_context: dict[str, list[str]] = {}
    for name in unresolved:
        hits = _grep_for_function(name, project_root)
        if hits:
            grep_context[name] = [f"{p}:{ln}" for p, ln in hits]

    prompt = _build_llm_prompt(
        unresolved=unresolved,
        node_names=node_names,
        edge_map=edge_map,
        py_files=py_files,
        grep_context=grep_context,
        resolved_so_far=resolved_so_far,
    )

    resp = create_chat_completion(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a code analysis assistant. You help locate Python "
                    "function definitions in a project. Respond ONLY with valid "
                    "JSON — no markdown fences, no explanation."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        max_tokens=1000,
        temperature=0.0,
        response_format={"type": "json_object"},
    )

    if "error" in resp:
        log.warning("LLM source resolution failed: %s", resp["error"])
        return {}

    try:
        content = resp["choices"][0]["message"]["content"]
        data = json.loads(content)
        results: dict[str, str] = {}
        for name in unresolved:
            if name in data and isinstance(data[name], str):
                val = data[name]
                # Validate the file exists
                file_part = val.rsplit(":", 1)[0] if ":" in val else val
                if (project_root / file_part).exists():
                    results[name] = val
        return results
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        log.warning("Failed to parse LLM response: %s", exc)
        return {}


def _build_llm_prompt(
    unresolved: list[str],
    node_names: list[str],
    edge_map: dict[str, list[str]],
    py_files: list[str],
    grep_context: dict[str, list[str]],
    resolved_so_far: dict[str, str],
) -> str:
    """Build the prompt for LLM-based source resolution."""
    parts = [
        "I need to find the Python source files where these LangGraph pipeline "
        "node functions are defined.",
        "",
        f"Unresolved nodes: {unresolved}",
        f"All pipeline nodes: {node_names}",
        f"Edge map: {json.dumps(edge_map)}",
        "",
        "Already resolved:",
    ]
    for name, path in resolved_so_far.items():
        parts.append(f"  {name} → {path}")

    if grep_context:
        parts.append("")
        parts.append("Partial grep matches:")
        for name, hits in grep_context.items():
            parts.append(f"  {name}: {hits}")

    parts.append("")
    parts.append("Available Python files in project:")
    for f in py_files:
        parts.append(f"  {f}")

    parts.append("")
    parts.append(
        "Return a JSON object mapping each unresolved node name to its "
        '"file_path:line_number" (e.g. {"summarize": "src/nodes/summarize.py:42"}). '
        "If you cannot determine the location, omit the node from the response."
    )
    return "\n".join(parts)


# ── Helpers ────────────────────────────────────────────────────────


def _iter_python_files(root: Path) -> list[Path]:
    """Yield all ``.py`` files under *root*, skipping excluded directories."""
    results: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune excluded directories in-place
        dirnames[:] = [d for d in dirnames if d not in _EXCLUDE_DIRS and not d.startswith(".")]
        for fname in filenames:
            if fname.endswith(".py"):
                results.append(Path(dirpath) / fname)
    return results


def _find_function_line(file_path: Path, fn_name: str) -> int | None:
    """Find the line number of a function definition in a file."""
    try:
        tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
    except (OSError, SyntaxError):
        return None
    return _find_function_at_line_by_name(tree, fn_name)


def _find_function_at_line_by_name(tree: ast.Module, fn_name: str) -> int | None:
    """Walk AST to find a FunctionDef/AsyncFunctionDef matching *fn_name*."""
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name == fn_name:
                return node.lineno
    return None


def _find_function_at_line(tree: ast.Module, target_line: int) -> str | None:
    """Find the function name at or nearest to *target_line*."""
    best: tuple[int, str] | None = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.lineno == target_line:
                return node.name
            if best is None or abs(node.lineno - target_line) < abs(best[0] - target_line):
                best = (node.lineno, node.name)
    # Only return if within 3 lines (decorator offset)
    if best and abs(best[0] - target_line) <= 3:
        return best[1]
    return None


def _module_to_file(module_name: str, project_root: Path) -> Path | None:
    """Convert a dotted module name to a file path under *project_root*."""
    parts = module_name.split(".")
    # Try as a direct .py file
    candidate = project_root / Path(*parts).with_suffix(".py")
    if candidate.exists():
        return candidate
    # Try as a package (__init__.py)
    candidate = project_root / Path(*parts) / "__init__.py"
    if candidate.exists():
        return candidate
    return None

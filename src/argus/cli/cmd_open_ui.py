from __future__ import annotations

import importlib
import json
import mimetypes
import socket
import sys
import threading
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from rich.console import Console

_console = Console()
_UI_PORT = 7842
_UI_URL = f"http://localhost:{_UI_PORT}"
_DIST_DIR = Path(__file__).parent.parent / "ui_dist"

# ── Replay job registry ────────────────────────────────────────────────────
_replay_jobs: dict[str, dict] = {}
_replay_lock = threading.Lock()


def _get_cli_auth() -> dict | None:
    """Return CLI credentials for auto-login in the local UI, refreshing if needed."""
    try:
        from argus.cloud import _get_valid_credentials  # noqa: PLC0415
        creds = _get_valid_credentials()
        if creds is None:
            return None
        return {
            "access_token": creds.access_token,
            "refresh_token": creds.refresh_token,
            "email": creds.email,
        }
    except Exception:
        return None


def _port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", _UI_PORT)) == 0


def _content_type(suffix: str) -> str:
    ct, _ = mimetypes.guess_type(f"file{suffix}")
    return ct or "application/octet-stream"


_CONFIG_PATH = Path(".") / ".argus" / "config.json"
def _aliases_path(project_dir: Path) -> Path:
    return project_dir / ".argus" / "aliases.json"


def _load_aliases(project_dir: Path) -> dict[str, str]:
    """Read {run_id: alias} map from .argus/aliases.json."""
    try:
        return json.loads(_aliases_path(project_dir).read_text())
    except Exception:
        return {}


def _save_aliases(aliases: dict[str, str], project_dir: Path) -> None:
    p = _aliases_path(project_dir)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(aliases, indent=2))


def _load_config_app_factory() -> str | None:
    """Read default app factory from .argus/config.json in CWD."""
    try:
        data = json.loads(_CONFIG_PATH.read_text())
        return data.get("app") or None
    except Exception:
        return None


def _save_config_app_factory(app: str) -> None:
    """Write app factory to .argus/config.json."""
    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        existing = json.loads(_CONFIG_PATH.read_text())
    except Exception:
        existing = {}
    existing["app"] = app
    _CONFIG_PATH.write_text(json.dumps(existing, indent=2))


def _import_factory_for_ui(spec: str):
    """Import the app factory callable from a 'module:fn' spec. Raises on failure."""
    if ":" not in spec:
        raise ValueError(f"app must be 'module:function', got: '{spec}'")
    module_path, fn_name = spec.rsplit(":", 1)
    cwd = str(Path.cwd())
    if cwd not in sys.path:
        sys.path.insert(0, cwd)
    try:
        module = importlib.import_module(module_path)
    except ImportError as e:
        raise ImportError(f"Cannot import '{module_path}': {e}") from e
    fn = getattr(module, fn_name, None)
    if fn is None or not callable(fn):
        raise ValueError(f"'{fn_name}' not found or not callable in '{module_path}'")
    return fn


def _run_replay_worker(
    job_id: str, run_id: str, from_node: str, app_module_str: str | None,
    mode: str = "full",
) -> None:
    """Background thread: runs ReplayEngine and updates _replay_jobs on completion."""
    from argus.replay import ReplayEngine  # noqa: PLC0415
    try:
        engine = ReplayEngine()
        if mode == "node":
            new_run_id = engine.replay_node(run_id=run_id, node_name=from_node)
        else:
            factory = _import_factory_for_ui(app_module_str) if app_module_str else None
            new_run_id = engine.replay(
                run_id=run_id, from_node=from_node, app_factory=factory,
            )
        with _replay_lock:
            _replay_jobs[job_id] = {"status": "done", "run_id": new_run_id, "error": None}
    except Exception as exc:
        with _replay_lock:
            _replay_jobs[job_id] = {"status": "error", "run_id": None, "error": str(exc)}


def _all_run_files(project_dir: Path) -> list[Path]:
    """Collect all *.json run files from every .argus/runs/ directory under project_dir."""
    files: list[Path] = []
    for runs_path in project_dir.rglob(".argus/runs"):
        if runs_path.is_dir():
            files.extend(runs_path.glob("*.json"))
    return files


def _all_log_dirs(project_dir: Path) -> list[Path]:
    return [p for p in project_dir.rglob(".argus/logs") if p.is_dir()]


def _make_handler(
    runs_dir: Path, logs_dir: Path,
    app_module_str: str | None, project_dir: Path | None = None,
) -> type:
    _project_dir = project_dir or runs_dir.parent.parent

    class ArgusHandler(BaseHTTPRequestHandler):
        def log_message(self, *args: object) -> None:  # suppress access logs
            pass

        def handle_one_request(self) -> None:
            try:
                super().handle_one_request()
            except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                self.close_connection = True

        def _send_json(self, data: object, status: int = 200) -> None:
            body = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_text(self, text: str, status: int = 200) -> None:
            body = text.encode()
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_file(self, path: Path) -> None:
            if not path.exists():
                self.send_response(404)
                self.end_headers()
                return
            body = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", _content_type(path.suffix))
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _list_runs(self) -> None:
            all_files = _all_run_files(_project_dir)
            if not all_files:
                self._send_json([])
                return
            aliases = _load_aliases(_project_dir)
            seen: set[str] = set()
            summaries = []
            for f in all_files:
                try:
                    run = json.loads(f.read_text())
                    rid = run["run_id"]
                    if rid in seen:
                        continue
                    seen.add(rid)
                    summaries.append({
                        "run_id": rid,
                        "overall_status": run["overall_status"],
                        "started_at": run["started_at"],
                        "duration_ms": run.get("duration_ms"),
                        "step_count": len(run.get("steps", [])),
                        "first_failure_step": run.get("first_failure_step"),
                        "graph_node_names": run.get("graph_node_names", []),
                        "argus_version": run.get("argus_version", ""),
                        "parent_run_id": run.get("parent_run_id"),
                        "replay_from_step": run.get("replay_from_step"),
                        "alias": aliases.get(rid),
                    })
                except Exception:
                    pass
            summaries.sort(key=lambda r: r["started_at"], reverse=True)
            self._send_json(summaries)

        def _get_run(self, run_id: str) -> None:
            for f in _all_run_files(_project_dir):
                if f.stem == run_id or f.stem.startswith(run_id):
                    try:
                        self._send_json(json.loads(f.read_text()))
                        return
                    except Exception:
                        pass
            self._send_json({"error": "not found"}, 404)

        def _get_run_children(self, run_id: str) -> None:
            from argus.storage import list_replay_children  # noqa: PLC0415
            children = list_replay_children(run_id)
            # Also scan all project run files for cloud-synced children
            for f in _all_run_files(_project_dir):
                try:
                    data = json.loads(f.read_text())
                    if data.get("parent_run_id") == run_id:
                        rid = data.get("run_id", f.stem)
                        if not any(c["run_id"] == rid for c in children):
                            children.append({
                                "run_id": rid,
                                "started_at": data.get("started_at", ""),
                                "overall_status": data.get("overall_status", "unknown"),
                                "duration_ms": data.get("duration_ms"),
                                "step_count": len(data.get("steps", [])),
                                "replay_from_step": data.get("replay_from_step"),
                                "parent_run_id": run_id,
                            })
                except Exception:
                    continue
            children.sort(key=lambda r: r.get("started_at", ""))
            self._send_json(children)

        def _get_run_tree(self, run_id: str) -> None:
            from argus.storage import build_replay_tree  # noqa: PLC0415
            tree = build_replay_tree(run_id)
            self._send_json(tree)

        def _get_log(self, run_id: str) -> None:
            for log_dir in _all_log_dirs(_project_dir):
                for f in log_dir.glob("*.log"):
                    if f.stem == run_id or f.stem.startswith(run_id):
                        try:
                            self._send_text(f.read_text().strip())
                            return
                        except Exception:
                            pass
            self.send_response(404)
            self.end_headers()

        def _compare(self, a: str, b: str) -> None:
            def read_run(run_id: str) -> object:
                for f in _all_run_files(_project_dir):
                    if f.stem == run_id or f.stem.startswith(run_id):
                        try:
                            return json.loads(f.read_text())
                        except Exception:
                            pass
                return None
            self._send_json({"a": read_run(a), "b": read_run(b)})

        def _serve_static(self, path: str) -> None:
            dist = _DIST_DIR
            path = unquote(path)  # decode %5B[%5D] → [...] etc.

            # Root
            if path in ("", "/"):
                self._send_file(dist / "index.html")
                return

            # Try exact file first (JS, CSS, images, etc.)
            candidate = dist / path.lstrip("/")
            if candidate.is_file():
                self._send_file(candidate)
                return

            # Try path/index.html (Next.js trailing-slash pages)
            index = candidate / "index.html"
            if index.is_file():
                self._send_file(index)
                return

            # SPA fallback for /runs/<any-id> → serve the placeholder shell
            if path.startswith("/runs/"):
                placeholder = dist / "runs" / "_" / "index.html"
                if placeholder.is_file():
                    self._send_file(placeholder)
                    return

            self.send_response(404)
            self.end_headers()

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/")

            if path == "/api/auth":
                auth = _get_cli_auth()
                if auth:
                    self._send_json(auth)
                else:
                    self._send_json({"error": "not logged in"}, 401)
            elif path == "/api/runs":
                self._list_runs()
            elif path.startswith("/api/runs/") and path.endswith("/children"):
                rid = path[len("/api/runs/"):-len("/children")]
                self._get_run_children(rid)
            elif path.startswith("/api/runs/") and path.endswith("/tree"):
                rid = path[len("/api/runs/"):-len("/tree")]
                self._get_run_tree(rid)
            elif path.startswith("/api/runs/"):
                self._get_run(path[len("/api/runs/"):])
            elif path.startswith("/api/logs/"):
                self._get_log(path[len("/api/logs/"):])
            elif path == "/api/compare":
                qs = parse_qs(parsed.query)
                a = qs.get("a", [""])[0]
                b = qs.get("b", [""])[0]
                self._compare(a, b)
            elif path == "/api/config":
                self._send_json({"app": app_module_str or _load_config_app_factory() or ""})
            elif path == "/api/candidates":
                from argus.candidate_store import load_candidates  # noqa: PLC0415
                data = load_candidates()
                self._send_json({
                    "candidates": data.get("candidates", []),
                    "rejected_count": len(data.get("rejected_patterns", [])),
                })
            elif path == "/api/custom-signatures":
                from argus.candidate_store import load_custom_signatures  # noqa: PLC0415
                data = load_custom_signatures()
                self._send_json(data.get("signatures", []))
            elif path == "/api/shared-signatures":
                from argus.cloud import pull_shared_signatures  # noqa: PLC0415
                sigs = pull_shared_signatures()
                self._send_json(sigs)
            elif path == "/api/shared-signatures/sync":
                from argus.registry import sync_shared_signatures  # noqa: PLC0415
                count = sync_shared_signatures()
                self._send_json({"synced": count})
            elif path.startswith("/api/replay/status/"):
                job_id = path[len("/api/replay/status/"):]
                with _replay_lock:
                    job = _replay_jobs.get(job_id)
                if job is None:
                    self._send_json({"error": "unknown job"}, 404)
                else:
                    resp: dict = {"status": job["status"]}
                    if job.get("run_id"):
                        resp["run_id"] = job["run_id"]
                    if job.get("error"):
                        resp["message"] = job["error"]
                    self._send_json(resp)
            else:
                self._serve_static(parsed.path)

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/")

            if path == "/api/config":
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                try:
                    data = json.loads(body)
                except Exception:
                    self._send_json({"error": "invalid JSON"}, 400)
                    return
                new_app = (data.get("app") or "").strip()
                if not new_app:
                    self._send_json({"error": "app is required"}, 400)
                    return
                _save_config_app_factory(new_app)
                self._send_json({"app": new_app})
            elif path == "/api/compare-analysis":
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                try:
                    data = json.loads(body)
                except Exception:
                    self._send_json({"error": "invalid JSON"}, 400)
                    return

                id_a = (data.get("a") or "").strip()
                id_b = (data.get("b") or "").strip()
                if not id_a or not id_b:
                    self._send_json({"error": "a and b run IDs are required"}, 400)
                    return

                from argus.storage import load_run as _load_run  # noqa: PLC0415
                try:
                    rec_a = _load_run(id_a)
                except (FileNotFoundError, ValueError):
                    self._send_json({"error": f"run '{id_a}' not found"}, 404)
                    return
                try:
                    rec_b = _load_run(id_b)
                except (FileNotFoundError, ValueError):
                    self._send_json({"error": f"run '{id_b}' not found"}, 404)
                    return

                try:
                    from argus.llm_investigator import compare_runs  # noqa: PLC0415
                    result = compare_runs(rec_a, rec_b)
                    self._send_json(result)
                except Exception as exc:
                    self._send_json({"error": str(exc)}, 500)
            elif path == "/api/replay":
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                try:
                    data = json.loads(body)
                except Exception:
                    self._send_json({"error": "invalid JSON"}, 400)
                    return

                run_id = (data.get("run_id") or "").strip()
                from_step = (data.get("from_step") or "").strip()
                replay_mode = (data.get("mode") or "full").strip()

                if not run_id or not from_step:
                    self._send_json({"error": "run_id and from_step are required"}, 400)
                    return

                # Load the run to check existence and stored node refs
                from argus.storage import load_run as _load_run  # noqa: PLC0415
                try:
                    run_record = _load_run(run_id)
                except (FileNotFoundError, ValueError):
                    self._send_json({"error": "run not found"}, 404)
                    return

                # Single-node replay only needs node_fn_refs
                effective_app: str | None = None
                if replay_mode == "node":
                    if not run_record.node_fn_refs or from_step not in run_record.node_fn_refs:
                        self._send_json({
                            "error": "no_node_ref",
                            "message": f"No stored function ref for '{from_step}'. Re-record with latest argus.",  # noqa: E501
                        }, 422)
                        return
                else:
                    # Full replay: check factory requirements
                    has_node_refs = bool(run_record.node_fn_refs)
                    if not has_node_refs:
                        effective_app = (
                            app_module_str
                            or _load_config_app_factory()
                            or run_record.app_factory_ref
                        )
                        if not effective_app:
                            self._send_json({
                                "error": "no_app_factory",
                                "message": "Set your app factory in the UI or run argus ui --app module:fn",  # noqa: E501
                            }, 422)
                            return

                job_id = str(uuid.uuid4())
                with _replay_lock:
                    _replay_jobs[job_id] = {"status": "running", "run_id": None, "error": None}

                t = threading.Thread(
                    target=_run_replay_worker,
                    args=(job_id, run_id, from_step, effective_app, replay_mode),
                    daemon=True,
                )
                t.start()

                self._send_json({"job_id": job_id}, 202)
            elif path.startswith("/api/candidates/") and path.endswith("/approve-shared"):
                cand_id = path[len("/api/candidates/"):-len("/approve-shared")]
                from argus.candidate_store import approve_candidate_shared  # noqa: PLC0415
                from argus.registry import reload_registry, sync_shared_signatures  # noqa: PLC0415
                result = approve_candidate_shared(cand_id)
                if result is None:
                    self._send_json({"error": "candidate not found or not logged in"}, 400)
                else:
                    sync_shared_signatures()
                    reload_registry()
                    self._send_json(result)
            elif path.startswith("/api/candidates/") and path.endswith("/approve"):
                cand_id = path[len("/api/candidates/"):-len("/approve")]
                from argus.candidate_store import approve_candidate  # noqa: PLC0415
                from argus.registry import reload_registry  # noqa: PLC0415
                result = approve_candidate(cand_id)
                if result is None:
                    self._send_json({"error": "candidate not found"}, 404)
                else:
                    reload_registry()
                    self._send_json(result)
            elif path.startswith("/api/candidates/") and path.endswith("/reject"):
                cand_id = path[len("/api/candidates/"):-len("/reject")]
                from argus.candidate_store import reject_candidate  # noqa: PLC0415
                if reject_candidate(cand_id):
                    self._send_json({"ok": True})
                else:
                    self._send_json({"error": "candidate not found"}, 404)
            else:
                self._send_json({"error": "not found"}, 404)

        def do_PUT(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/")

            if path.startswith("/api/runs/") and path.endswith("/alias"):
                rid = path[len("/api/runs/"):-len("/alias")]
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                try:
                    data = json.loads(body)
                except Exception:
                    self._send_json({"error": "invalid JSON"}, 400)
                    return
                alias = (data.get("alias") or "").strip()
                if not alias:
                    self._send_json({"error": "alias is required"}, 400)
                    return
                aliases = _load_aliases(_project_dir)
                aliases[rid] = alias
                _save_aliases(aliases, _project_dir)
                self._send_json({"run_id": rid, "alias": alias})
            else:
                self._send_json({"error": "not found"}, 404)

        def do_DELETE(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/")

            if path.startswith("/api/runs/") and path.endswith("/alias"):
                rid = path[len("/api/runs/"):-len("/alias")]
                aliases = _load_aliases(_project_dir)
                aliases.pop(rid, None)
                _save_aliases(aliases, _project_dir)
                self._send_json({"run_id": rid, "alias": None})
            elif path.startswith("/api/custom-signatures/"):
                sig_id = path[len("/api/custom-signatures/"):]
                from argus.candidate_store import delete_custom_signature  # noqa: PLC0415
                from argus.registry import reload_registry  # noqa: PLC0415
                if delete_custom_signature(sig_id):
                    reload_registry()
                    self._send_json({"ok": True})
                else:
                    self._send_json({"error": "not found"}, 404)
            elif path.startswith("/api/runs/"):
                rid = path[len("/api/runs/"):]
                deleted = False
                for f in _all_run_files(_project_dir):
                    if f.stem == rid or f.stem.startswith(rid):
                        f.unlink()
                        deleted = True
                        break
                if deleted:
                    # Also remove alias if one exists
                    aliases = _load_aliases(_project_dir)
                    if rid in aliases:
                        aliases.pop(rid)
                        _save_aliases(aliases, _project_dir)
                    self._send_json({"ok": True})
                else:
                    self._send_json({"error": "not found"}, 404)
            else:
                self._send_json({"error": "not found"}, 404)

    return ArgusHandler


def open_ui(app_module_str: str | None = None) -> None:
    if not _DIST_DIR.is_dir():
        _console.print(
            "[red]Error:[/red] UI assets not found.\n"
            "Run [bold]scripts/build_ui.sh[/bold] to build them."
        )
        raise SystemExit(1)

    if _port_in_use():
        _console.print(f"Argus UI already running at [bold]{_UI_URL}[/bold]")
        webbrowser.open(_UI_URL)
        return

    # Resolve factory: --app flag → .argus/config.json → None
    effective = app_module_str or _load_config_app_factory()

    project_dir = Path(".").resolve()
    runs_dir = project_dir / ".argus" / "runs"
    logs_dir = project_dir / ".argus" / "logs"

    handler = _make_handler(runs_dir, logs_dir, effective, project_dir)
    server = ThreadingHTTPServer(("localhost", _UI_PORT), handler)

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    _console.print(f"Argus UI running at [bold]{_UI_URL}[/bold]")
    _console.print(f"  [dim]serving runs from[/dim] {runs_dir}")
    _console.print("  [dim]replay[/dim] [bold]auto-detect[/bold] [dim](zero-config)[/dim]")
    webbrowser.open(_UI_URL)

    # Keep the process alive while the server runs
    try:
        thread.join()
    except KeyboardInterrupt:
        server.shutdown()

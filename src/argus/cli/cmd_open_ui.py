from __future__ import annotations

import json
import mimetypes
import socket
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from rich.console import Console

_console = Console()
_UI_PORT = 7842
_UI_URL = f"http://localhost:{_UI_PORT}"
_DIST_DIR = Path(__file__).parent.parent / "ui_dist"


def _port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", _UI_PORT)) == 0


def _content_type(suffix: str) -> str:
    ct, _ = mimetypes.guess_type(f"file{suffix}")
    return ct or "application/octet-stream"


def _make_handler(runs_dir: Path, logs_dir: Path) -> type:
    class ArgusHandler(BaseHTTPRequestHandler):
        def log_message(self, *args: object) -> None:  # suppress access logs
            pass

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
            if not runs_dir.exists():
                self._send_json([])
                return
            summaries = []
            for f in runs_dir.glob("*.json"):
                try:
                    run = json.loads(f.read_text())
                    summaries.append({
                        "run_id": run["run_id"],
                        "overall_status": run["overall_status"],
                        "started_at": run["started_at"],
                        "duration_ms": run.get("duration_ms"),
                        "step_count": len(run.get("steps", [])),
                        "first_failure_step": run.get("first_failure_step"),
                        "graph_node_names": run.get("graph_node_names", []),
                        "argus_version": run.get("argus_version", ""),
                        "parent_run_id": run.get("parent_run_id"),
                    })
                except Exception:
                    pass
            summaries.sort(key=lambda r: r["started_at"], reverse=True)
            self._send_json(summaries)

        def _get_run(self, run_id: str) -> None:
            if not runs_dir.exists():
                self._send_json({"error": "not found"}, 404)
                return
            for f in runs_dir.glob("*.json"):
                if f.stem == run_id or f.stem.startswith(run_id):
                    try:
                        self._send_json(json.loads(f.read_text()))
                        return
                    except Exception:
                        pass
            self._send_json({"error": "not found"}, 404)

        def _get_log(self, run_id: str) -> None:
            if not logs_dir.exists():
                self.send_response(404)
                self.end_headers()
                return
            for f in logs_dir.glob("*.log"):
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
                if not runs_dir.exists():
                    return None
                for f in runs_dir.glob("*.json"):
                    if f.stem == run_id or f.stem.startswith(run_id):
                        try:
                            return json.loads(f.read_text())
                        except Exception:
                            pass
                return None
            self._send_json({"a": read_run(a), "b": read_run(b)})

        def _serve_static(self, path: str) -> None:
            dist = _DIST_DIR

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

            if path == "/api/runs":
                self._list_runs()
            elif path.startswith("/api/runs/"):
                self._get_run(path[len("/api/runs/"):])
            elif path.startswith("/api/logs/"):
                self._get_log(path[len("/api/logs/"):])
            elif path == "/api/compare":
                qs = parse_qs(parsed.query)
                a = qs.get("a", [""])[0]
                b = qs.get("b", [""])[0]
                self._compare(a, b)
            else:
                self._serve_static(parsed.path)

    return ArgusHandler


def open_ui() -> None:
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

    project_dir = Path(".").resolve()
    runs_dir = project_dir / ".argus" / "runs"
    logs_dir = project_dir / ".argus" / "logs"

    handler = _make_handler(runs_dir, logs_dir)
    server = HTTPServer(("localhost", _UI_PORT), handler)

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    _console.print(f"Argus UI running at [bold]{_UI_URL}[/bold]")
    _console.print(f"  [dim]serving runs from[/dim] {runs_dir}")
    webbrowser.open(_UI_URL)

    # Keep the process alive while the server runs
    try:
        thread.join()
    except KeyboardInterrupt:
        server.shutdown()

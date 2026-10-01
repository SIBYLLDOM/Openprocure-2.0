"""Shared Flask-dashboard engine: run buttons + daily-schedule editor for a set of
scripts. Each concrete app (gem_app, diagno_app, endo_app) imports create_app()
and supplies its own SCRIPTS map, title, port, and default schedules.
"""
import json
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path

IS_WINDOWS = sys.platform.startswith("win")

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from flask import Flask, jsonify, render_template, request

SCRAPER_DIR = Path(__file__).resolve().parent.parent
VENV_PYTHON = SCRAPER_DIR / "venv" / "Scripts" / "python.exe"
PYTHON = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable

# Public subdomains for the top tab bar shared across all 3 dashboards.
TABS = [
    {"key": "gem_app",    "label": "Gem",    "url": "http://gemtenders.openprocure.ai/"},
    {"key": "endo_app",   "label": "Endo",   "url": "http://endoopentenders.openprocure.ai/"},
    {"key": "diagno_app", "label": "Diagno", "url": "http://diagnoopentenders.openprocure.ai/"},
]


def create_app(app_id: str, title: str, scripts: dict, default_schedules: dict):
    """
    app_id: short slug, used for this app's own logs/ and schedules.json subfolder
    title: display title in the UI
    scripts: {key: (script_filename, [extra_cli_args])}
    default_schedules: {key: {"time": "HH:MM", "enabled": bool}} seeded on first run
    """
    app_dir = Path(__file__).resolve().parent / app_id
    schedules_file = app_dir / "schedules.json"
    hidden_file = app_dir / "hidden.json"
    logs_dir = app_dir / "logs"

    app = Flask(__name__, template_folder=str(Path(__file__).resolve().parent / "templates_shared"))

    jobs = {}
    jobs_lock = threading.Lock()
    scheduler = BackgroundScheduler()

    def _load_schedules():
        if schedules_file.exists():
            return json.loads(schedules_file.read_text(encoding="utf-8"))
        schedules_file.parent.mkdir(parents=True, exist_ok=True)
        schedules_file.write_text(json.dumps(default_schedules, indent=2), encoding="utf-8")
        return dict(default_schedules)

    def _save_schedules(schedules):
        schedules_file.write_text(json.dumps(schedules, indent=2), encoding="utf-8")

    def _load_hidden() -> set:
        if hidden_file.exists():
            return set(json.loads(hidden_file.read_text(encoding="utf-8")))
        return set()

    def _save_hidden(hidden: set):
        hidden_file.parent.mkdir(parents=True, exist_ok=True)
        hidden_file.write_text(json.dumps(sorted(hidden), indent=2), encoding="utf-8")

    def _visible_keys() -> list:
        hidden = _load_hidden()
        return sorted(k for k in scripts if k not in hidden)

    def _resolve_job(key: str):
        """Returns (cmd_list, cwd) for a script entry.

        Entries are either the plain (filename, extra_args) tuple — a script
        living in SCRAPER_DIR, run with the shared scrapper venv — or a dict
        {"script": path, "args": [...], "cwd": dir, "python": interpreter}
        for scripts that live elsewhere (e.g. another project's venv).
        """
        entry = scripts[key]
        if isinstance(entry, dict):
            script_path = Path(entry["script"])
            extra_args = entry.get("args", [])
            cwd = Path(entry["cwd"]) if entry.get("cwd") else script_path.parent
            python = entry.get("python", PYTHON)
        else:
            script, extra_args = entry
            script_path = SCRAPER_DIR / script
            cwd = SCRAPER_DIR
            python = PYTHON
        return [python, str(script_path), *extra_args], str(cwd)

    def _run_job(key: str):
        cmd, cwd = _resolve_job(key)
        log_path = logs_dir / f"{key}.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, "w", encoding="utf-8", errors="replace") as log_file:
            log_file.write(f"Started: {datetime.now().isoformat()}\n\n")
            log_file.flush()
            process = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
            )
            with jobs_lock:
                jobs[key]["pid"] = process.pid
                jobs[key]["process"] = process
            return_code = process.wait()
            log_file.write(f"\nFinished: {datetime.now().isoformat()} (exit code {return_code})\n")
        with jobs_lock:
            jobs[key]["running"] = False
            jobs[key]["return_code"] = return_code
            jobs[key]["process"] = None

    def _start_job(key: str) -> bool:
        with jobs_lock:
            existing = jobs.get(key)
            if existing and existing.get("running"):
                return False
            jobs[key] = {
                "running": True, "pid": None, "process": None,
                "return_code": None, "started": datetime.now().isoformat(),
            }
        threading.Thread(target=_run_job, args=(key,), daemon=True).start()
        return True

    def _stop_job(key: str) -> bool:
        with jobs_lock:
            job = jobs.get(key)
            if not job or not job.get("running") or not job.get("pid"):
                return False
            pid = job["pid"]
        try:
            if IS_WINDOWS:
                # /T kills the whole process tree (script + any browser children it spawned).
                subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
            else:
                job["process"].kill()
        except Exception:
            pass
        return True

    def _job_id(key: str, time_str: str) -> str:
        return f"scheduled-{key}-{time_str}"

    def _times_for(cfg: dict) -> list:
        # accepts either the old single-"time" shape or the new "times" list
        if "times" in cfg:
            return cfg["times"]
        if cfg.get("time"):
            return [cfg["time"]]
        return []

    def _apply_schedule(key: str, cfg: dict):
        for job in scheduler.get_jobs():
            if job.id.startswith(f"scheduled-{key}-"):
                scheduler.remove_job(job.id)
        if not cfg.get("enabled"):
            return
        for time_str in _times_for(cfg):
            hour, minute = time_str.split(":")
            scheduler.add_job(
                _start_job, trigger=CronTrigger(hour=int(hour), minute=int(minute)),
                args=[key], id=_job_id(key, time_str), replace_existing=True,
            )

    def _init_schedules():
        for key, cfg in _load_schedules().items():
            if key in scripts:
                _apply_schedule(key, cfg)

    @app.route("/")
    def index():
        return render_template(
            "index.html", scripts=_visible_keys(), title=title,
            # Each subdomain is a separate, access-controlled dashboard — only show
            # this app's own tab, no cross-links to the other two.
            tabs=[t for t in TABS if t["key"] == app_id], active_tab=app_id,
        )

    @app.route("/scripts")
    def list_scripts():
        return jsonify({"scripts": _visible_keys()})

    @app.route("/run/<key>", methods=["POST"])
    def run_script(key):
        if key not in scripts:
            return jsonify({"error": "unknown script"}), 404
        if not _start_job(key):
            return jsonify({"error": f"{key} is already running"}), 409
        return jsonify({"status": "started", "key": key})

    @app.route("/stop/<key>", methods=["POST"])
    def stop_script(key):
        if key not in scripts:
            return jsonify({"error": "unknown script"}), 404
        if not _stop_job(key):
            return jsonify({"error": f"{key} is not running"}), 409
        return jsonify({"status": "stopped", "key": key})

    @app.route("/delete/<key>", methods=["POST"])
    def delete_script(key):
        if key not in scripts:
            return jsonify({"error": "unknown script"}), 404
        # "Delete" hides the card and turns its schedule off — the underlying
        # script stays runnable via the API, it's just removed from view.
        schedules = _load_schedules()
        if key in schedules:
            schedules[key]["enabled"] = False
            _save_schedules(schedules)
            _apply_schedule(key, schedules[key])
        hidden = _load_hidden()
        hidden.add(key)
        _save_hidden(hidden)
        return jsonify({"status": "deleted", "key": key})

    @app.route("/status")
    def status():
        with jobs_lock:
            return jsonify({
                k: {field: v for field, v in job.items() if field != "process"}
                for k, job in jobs.items()
            })

    @app.route("/log/<key>")
    def log(key):
        if key not in scripts:
            return jsonify({"error": "unknown script"}), 404
        log_path = logs_dir / f"{key}.log"
        if not log_path.exists():
            return jsonify({"log": ""})
        # Long-running scrapers can produce multi-MB logs; only ever ship the
        # tail to the browser so polling doesn't re-transfer/re-render the
        # whole file every tick and freeze the tab.
        max_bytes = 50_000
        size = log_path.stat().st_size
        with open(log_path, "rb") as f:
            if size > max_bytes:
                f.seek(size - max_bytes)
            data = f.read()
        text = data.decode("utf-8", errors="replace")
        if size > max_bytes:
            text = "... (truncated, showing tail) ...\n" + text
        return jsonify({"log": text})

    @app.route("/schedule", methods=["GET"])
    def get_schedules():
        schedules = _load_schedules()
        next_runs = {}
        for key, cfg in schedules.items():
            times = [job.next_run_time for job in scheduler.get_jobs()
                     if job.id.startswith(f"scheduled-{key}-") and job.next_run_time]
            next_runs[key] = min(times).isoformat() if times else None
        return jsonify({"schedules": schedules, "next_runs": next_runs})

    @app.route("/schedule/<key>", methods=["POST"])
    def set_schedule(key):
        if key not in scripts:
            return jsonify({"error": "unknown script"}), 404
        data = request.get_json(force=True)
        times = data.get("times")
        if times is None:
            times = [data["time"]] if data.get("time") else []
        enabled = bool(data.get("enabled", True))
        if enabled:
            if not times:
                return jsonify({"error": "at least one time is required"}), 400
            for time_str in times:
                try:
                    hour, minute = time_str.split(":")
                    assert 0 <= int(hour) <= 23 and 0 <= int(minute) <= 59
                except (ValueError, AssertionError, AttributeError):
                    return jsonify({"error": f"invalid time '{time_str}', must be HH:MM (24h)"}), 400
        schedules = _load_schedules()
        schedules[key] = {"times": times, "enabled": enabled}
        _save_schedules(schedules)
        _apply_schedule(key, schedules[key])
        return jsonify({"status": "ok", "key": key, "schedule": schedules[key]})

    _init_schedules()
    app.extensions = getattr(app, "extensions", {})
    app.extensions["scheduler"] = scheduler
    return app

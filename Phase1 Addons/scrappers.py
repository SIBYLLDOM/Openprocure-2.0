from flask import Flask, render_template, jsonify, request
import subprocess
import threading
import os
import sys
import time
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import atexit

app = Flask(__name__)

# ─────────────────────────────────────────────
# SCRAPER CONFIGURATION
# ─────────────────────────────────────────────

GEM_SCRAPERS = [
    {
        "id": "gem_diagno_perfect",
        "dept": "Diagno",
        "type": "Perfect",
        "file_name": "run_diagno_perfect_category.py",
        "file_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\run_diagno_perfect_category.py",
        "venv_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\venv",
    },
    {
        "id": "gem_diagno_keyword",
        "dept": "Diagno",
        "type": "Keyword",
        "file_name": "run_diagno.py",
        "file_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\run_diagno.py",
        "venv_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\venv",
    },
    {
        "id": "gem_diagno_part_two",
        "dept": "Diagno",
        "type": "Keyword",
        "file_name": "run_diagno_part_two.py",
        "file_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\run_diagno_part_two.py",
        "venv_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\venv",
    },
    {
        "id": "gem_analyser",
        "dept": "Diagno",
        "type": "Keyword",
        "file_name": "run_analyser.py",
        "file_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\run_analyser.py",
        "venv_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\venv",
    },
    {
        "id": "gem_endo_perfect",
        "dept": "Endo",
        "type": "Perfect",
        "file_name": "run_endo_perfect_category.py",
        "file_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\run_endo_perfect_category.py",
        "venv_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\venv",
    },
    {
        "id": "gem_endo_keyword",
        "dept": "Endo",
        "type": "Keyword",
        "file_name": "run_endo.py",
        "file_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\run_endo.py",
        "venv_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\venv",
    },
    {
        "id": "gem_endo_part_two",
        "dept": "Endo",
        "type": "Keyword",
        "file_name": "run_endo_part_two.py",
        "file_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\run_endo_part_two.py",
        "venv_path": r"C:\Users\Administrator\Desktop\FinalScrapper\scrapper\venv",
    },
]

OPEN_TENDER_SCRAPERS = [
    {"id": "ot_ap", "state": "Andhra Pradesh", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_ar", "state": "Arunachal Pradesh", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_as", "state": "Assam", "file_name": "assam_scrapper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\assam_scrapper.py",
     "download_file": "ass_file.py",
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_br", "state": "Bihar", "file_name": "bihar_scraper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\bihar_scraper.py",
     "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_cg", "state": "Chhattisgarh", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_ga", "state": "Goa", "file_name": "goa_scraper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\goa_scraper.py",
     "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_gj", "state": "Gujarat", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_hr", "state": "Haryana", "file_name": "haryana_scrapper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\haryana_scrapper.py",
     "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_hp", "state": "Himachal Pradesh", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_jk", "state": "Jammu & Kashmir", "file_name": "jammundkashmir_scraper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\jammundkashmir_scraper.py",
     "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_jh", "state": "Jharkhand", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_ka", "state": "Karnataka", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_kl", "state": "Kerala", "file_name": "kerala_scrapper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\kerala_scrapper.py",
     "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_mp", "state": "Madhya Pradesh", "file_name": "madhyapradesh_scrapper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\madhyapradesh_scrapper.py",
     "download_file": "mp_file.py",
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_mh", "state": "Maharashtra", "file_name": "maharastra_scraper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\maharastra_scraper.py",
     "download_file": "maha_file.py",
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_mn", "state": "Manipur", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_ml", "state": "Meghalaya", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_mz", "state": "Mizoram", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_nl", "state": "Nagaland", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_od", "state": "Odisha", "file_name": "odisha_scraper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\odisha_scraper.py",
     "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_pb", "state": "Punjab", "file_name": "punjab_scrapper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\punjab_scrapper.py",
     "download_file": "pb_file.py",
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_rj", "state": "Rajasthan", "file_name": "rajasthan_scraper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\rajasthan_scraper.py",
     "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_sk", "state": "Sikkim", "file_name": None, "file_path": None, "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_tn", "state": "Tamil Nadu", "file_name": "tamilnadu_scrapper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\tamilnadu_scrapper.py",
     "download_file": "tn_file.py",
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_tl", "state": "Telangana", "file_name": None, "file_path": None, "download_file": "tr_file.py",
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_tr", "state": "Tripura", "file_name": "tripura_scrapper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\tripura_scrapper.py",
     "download_file": None,
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_up", "state": "Uttar Pradesh", "file_name": "uttarprad_scrapper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\uttarprad_scrapper.py",
     "download_file": "up_file.py",
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_uk", "state": "Uttarakhand", "file_name": "uttarkhand_scrapper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\uttarkhand_scrapper.py",
     "download_file": "uk_file.py",
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},

    {"id": "ot_wb", "state": "West Bengal", "file_name": "westbengal_scrapper.py",
     "file_path": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\westbengal_scrapper.py",
     "download_file": "wb_file.py",
     "venv": r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv"},
]

# ─────────────────────────────────────────────
# HELPER — resolve python executable from venv
# ─────────────────────────────────────────────

def get_python_exe(venv_path):
    """Return the python executable path for a given venv folder."""
    if sys.platform == "win32":
        base = venv_path if venv_path.endswith("venv") else os.path.join(venv_path, "venv")
        return os.path.join(base, "Scripts", "python.exe")
    else:
        base = venv_path if venv_path.endswith("venv") else os.path.join(venv_path, "venv")
        return os.path.join(base, "bin", "python")


# ─────────────────────────────────────────────
# IN-MEMORY JOB STORE
# ─────────────────────────────────────────────
jobs = {}  # job_id -> { status, output, started_at, ended_at, scraper_id }


def run_script(job_id, file_path, venv_path):
    """Run a Python script using its venv's python.exe directly — no shell activation needed."""
    jobs[job_id]["status"] = "running"
    jobs[job_id]["started_at"] = datetime.now().isoformat()

    script_dir = os.path.dirname(file_path)
    script_name = os.path.basename(file_path)
    parent_dir = os.path.dirname(script_dir)   # e.g. FinalScrapper\ or Captcha Convertor\
    python_exe = get_python_exe(venv_path)

    try:
        # Verify python exe exists before attempting to run
        if not os.path.exists(python_exe):
            raise FileNotFoundError(f"Python executable not found at: {python_exe}")

        # Inject script dir + parent dir into PYTHONPATH so cross-directory
        # imports like `from scrapper_to_db import ...` resolve correctly,
        # exactly as they do when running manually from the terminal.
        env = os.environ.copy()
        env["PYTHONPATH"] = (
            script_dir
            + os.pathsep
            + parent_dir
            + os.pathsep
            + env.get("PYTHONPATH", "")
        )

        proc = subprocess.Popen(
            [python_exe, script_name],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            cwd=script_dir,  # sets working directory — equivalent to cd /d
            env=env,         # patched environment with correct PYTHONPATH
        )

        output_lines = []
        for line in proc.stdout:
            output_lines.append(line)
            jobs[job_id]["output"] = "".join(output_lines)

        proc.wait()
        jobs[job_id]["return_code"] = proc.returncode
        jobs[job_id]["status"] = "success" if proc.returncode == 0 else "failed"

    except Exception as e:
        jobs[job_id]["output"] = f"ERROR: {str(e)}"
        jobs[job_id]["status"] = "failed"

    jobs[job_id]["ended_at"] = datetime.now().isoformat()


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html",
                           gem_scrapers=GEM_SCRAPERS,
                           open_tender_scrapers=OPEN_TENDER_SCRAPERS)


@app.route("/api/scrapers/gem")
def api_gem():
    return jsonify(GEM_SCRAPERS)


@app.route("/api/scrapers/open_tenders")
def api_open_tenders():
    return jsonify(OPEN_TENDER_SCRAPERS)


@app.route("/api/run", methods=["POST"])
def api_run():
    data = request.json
    scraper_id = data.get("scraper_id")
    scraper_type = data.get("type")  # "gem" or "open_tender"

    scraper = None
    if scraper_type == "gem":
        scraper = next((s for s in GEM_SCRAPERS if s["id"] == scraper_id), None)
        file_path = scraper["file_path"] if scraper else None
        venv_path = scraper["venv_path"] if scraper else None
    else:
        scraper = next((s for s in OPEN_TENDER_SCRAPERS if s["id"] == scraper_id), None)
        file_path = scraper["file_path"] if scraper else None
        venv_path = scraper["venv"] if scraper else None

    if not scraper:
        return jsonify({"error": "Scraper not found"}), 404
    if not file_path:
        return jsonify({"error": "No script configured for this scraper"}), 400

    job_id = f"{scraper_id}_{int(time.time() * 1000)}"
    jobs[job_id] = {
        "job_id": job_id,
        "scraper_id": scraper_id,
        "status": "queued",
        "output": "",
        "started_at": None,
        "ended_at": None,
    }

    t = threading.Thread(target=run_script, args=(job_id, file_path, venv_path), daemon=True)
    t.start()

    return jsonify({"job_id": job_id, "status": "queued"})


@app.route("/api/run/all", methods=["POST"])
def api_run_all():
    data = request.json
    scraper_type = data.get("type")  # "gem" or "open_tender"
    scrapers = GEM_SCRAPERS if scraper_type == "gem" else OPEN_TENDER_SCRAPERS
    launched = []

    for scraper in scrapers:
        fp = scraper.get("file_path")
        venv = scraper.get("venv_path") or scraper.get("venv")
        if not fp:
            continue
        job_id = f"{scraper['id']}_{int(time.time() * 1000)}"
        jobs[job_id] = {
            "job_id": job_id,
            "scraper_id": scraper["id"],
            "status": "queued",
            "output": "",
            "started_at": None,
            "ended_at": None,
        }
        t = threading.Thread(target=run_script, args=(job_id, fp, venv), daemon=True)
        t.start()
        launched.append(job_id)
        time.sleep(0.05)  # slight stagger

    return jsonify({"launched": launched})


@app.route("/api/job/<job_id>")
def api_job_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/api/jobs")
def api_jobs():
    return jsonify(list(jobs.values()))


# ─────────────────────────────────────────────
# SCHEDULER — Run all GEM scrapers 4x daily
# ─────────────────────────────────────────────

def scheduled_run_all_gem():
    """Triggered by scheduler — launches all GEM scrapers."""
    print(f"[SCHEDULER] Triggered at {datetime.now().isoformat()} — launching all GEM scrapers")
    launched = []

    for scraper in GEM_SCRAPERS:
        fp = scraper.get("file_path")
        venv = scraper.get("venv_path")
        if not fp:
            continue
        job_id = f"{scraper['id']}_{int(time.time() * 1000)}"
        jobs[job_id] = {
            "job_id": job_id,
            "scraper_id": scraper["id"],
            "status": "queued",
            "output": "",
            "started_at": None,
            "ended_at": None,
        }
        t = threading.Thread(target=run_script, args=(job_id, fp, venv), daemon=True)
        t.start()
        launched.append(job_id)
        time.sleep(0.05)

    print(f"[SCHEDULER] Launched {len(launched)} jobs: {launched}")


# Start the scheduler
scheduler = BackgroundScheduler(timezone="Asia/Kolkata")  # IST
scheduler.add_job(scheduled_run_all_gem, CronTrigger(hour=1,  minute=53))
scheduler.add_job(scheduled_run_all_gem, CronTrigger(hour=12, minute=0))
scheduler.add_job(scheduled_run_all_gem, CronTrigger(hour=15, minute=0))
scheduler.add_job(scheduled_run_all_gem, CronTrigger(hour=21, minute=0))
scheduler.start()

# Shut down cleanly when Flask exits
atexit.register(lambda: scheduler.shutdown())


if __name__ == "__main__":
    app.run(debug=True, port=5051)
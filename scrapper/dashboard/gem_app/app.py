import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import create_app

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
ADDONS_SCRAPER_DIR = REPO_ROOT / "Phase1 Addons" / "OPEN SCRAPPER" / "scrapper"
ADDONS_PYTHON = REPO_ROOT / "Phase1 Addons" / "OPEN SCRAPPER" / "venv" / "Scripts" / "python.exe"

# key -> (script filename, extra CLI args) — the 9-step GeM pipeline, in run order
SCRIPTS = {
    "perfect_category": ("run_perfect_category.py", []),
    "gem_open_category": ("run_gem_open_category.py", []),
    "cppp_states_open_category": ("run_cppp_states_open_category.py", []),
    "cppp_gem_open_category": ("run_cppp_gem_open_category.py", []),
    "cppp_central_open_category": ("run_cppp_central_open_category.py", []),
    "ra_scrapper": ("ra_scrapper.py", []),
    # Scripts living in "Phase1 Addons/OPEN SCRAPPER/scrapper" — their own venv/cwd.
    "cppp_gem_scraper": {
        "script": str(ADDONS_SCRAPER_DIR / "cppp_gem_scraper.py"),
        "cwd": str(ADDONS_SCRAPER_DIR),
        "python": str(ADDONS_PYTHON),
    },
    "cppp_state_organ_open_scrapper": {
        "script": str(ADDONS_SCRAPER_DIR / "cppp_state_organ_open_scrapper.py"),
        "cwd": str(ADDONS_SCRAPER_DIR),
        "python": str(ADDONS_PYTHON),
    },
    "cppp_states_scraper": {
        "script": str(ADDONS_SCRAPER_DIR / "cppp_states_scraper.py"),
        "cwd": str(ADDONS_SCRAPER_DIR),
        "python": str(ADDONS_PYTHON),
    },
}

# 2:00 AM start, 3-minute stagger through the GeM pipeline in run order:
# perfect_category -> gem_open_category -> cppp_states_open_category ->
# cppp_gem_open_category -> cppp_central_open_category -> ra_scrapper ->
# cppp_gem_scraper -> cppp_state_organ_open_scrapper -> cppp_states_scraper
DEFAULT_SCHEDULES = {
    "perfect_category":               {"times": ["02:00"], "enabled": True},
    "gem_open_category":               {"times": ["02:03"], "enabled": True},
    "cppp_states_open_category":       {"times": ["02:06"], "enabled": True},
    "cppp_gem_open_category":          {"times": ["02:09"], "enabled": True},
    "cppp_central_open_category":      {"times": ["02:12"], "enabled": True},
    "ra_scrapper":                     {"times": ["02:15"], "enabled": True},
    "cppp_gem_scraper":                {"times": ["02:18"], "enabled": True},
    "cppp_state_organ_open_scrapper":  {"times": ["02:21"], "enabled": True},
    "cppp_states_scraper":             {"times": ["02:24"], "enabled": True},
}

app = create_app("gem_app", "GeM Tenders Dashboard", SCRIPTS, DEFAULT_SCHEDULES)

if __name__ == "__main__":
    scheduler = app.extensions["scheduler"]
    scheduler.start()
    try:
        app.run(host="0.0.0.0", port=7001, debug=False)
    finally:
        scheduler.shutdown(wait=False)

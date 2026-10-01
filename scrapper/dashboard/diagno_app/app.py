import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import create_app

# CPPP (eprocure.gov.in) — Diagno department only, via --dept diagno filter
SCRIPTS = {
    "cppp_open_diagno": ("run_cppp_gem_open_category.py", ["--dept", "diagno"]),
}

DEFAULT_SCHEDULES = {}

app = create_app("diagno_app", "Open Diagno Dept (CPPP) Dashboard", SCRIPTS, DEFAULT_SCHEDULES)

if __name__ == "__main__":
    scheduler = app.extensions["scheduler"]
    scheduler.start()
    try:
        app.run(host="0.0.0.0", port=7002, debug=False)
    finally:
        scheduler.shutdown(wait=False)

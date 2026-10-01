"""
Quick API health check — run this anytime to verify all 4 endpoints.
Usage:  python test_api.py
"""
import requests
import json
import csv
from pathlib import Path
from datetime import datetime

BASE = "http://127.0.0.1:5050"
PASS = "[PASS]"
FAIL = "[FAIL]"

# Unique names per run so add-category always inserts a fresh entry
RUN_ID = datetime.now().strftime("%H%M%S")
TEST_ENDO_CAT   = f"API-TEST-ENDO-{RUN_ID}"
TEST_DIAGNO_CAT = f"API-TEST-DIAGNO-{RUN_ID}"

results = []

def check(label, method, url, body=None, expect_added=None):
    try:
        if method == "GET":
            r = requests.get(url, timeout=5)
        else:
            r = requests.post(url, json=body, timeout=5)

        data = r.json()
        ok   = data.get("success") is True

        # Extra check: if we expect added=True, verify it
        if ok and expect_added is not None:
            ok = data.get("added") == expect_added

        status = PASS if ok else FAIL
        detail = ""

        if data.get("success"):
            if "total" in data:
                detail = f"total={data['total']}"
            if "added" in data:
                detail += f"  added={data['added']}"
                if data.get("new_entry"):
                    detail += f"  -> si_no={data['new_entry']['si_no']}  name='{data['new_entry']['category_name']}'"
            if not ok and expect_added is not None:
                detail += f"  (expected added={expect_added})"

        print(f"  {status}  {label}")
        if detail:
            print(f"         {detail}")
        results.append(ok)

    except requests.exceptions.ConnectionError:
        print(f"  {FAIL}  {label}  -- server not running on {BASE}")
        results.append(False)
    except Exception as e:
        print(f"  {FAIL}  {label}  -- {e}")
        results.append(False)


def cleanup_test_entries():
    """Remove the test entries from both CSVs after the test run."""
    BASE_PATH = Path(__file__).resolve().parent.parent
    paths = {
        "endo":   BASE_PATH / "GEM-CONTRACTS-EXTRACTOR ENDO"   / "data" / "Datasets" / "categories.csv",
        "diagno": BASE_PATH / "GEM-CONTRACTS-EXTRACTOR DIAGNO" / "data" / "Datasets" / "categories.csv",
    }
    test_names = {TEST_ENDO_CAT.lower(), TEST_DIAGNO_CAT.lower()}

    for dept, path in paths.items():
        if not path.exists():
            continue
        rows = []
        for enc in ("cp1252", "utf-8", "latin-1"):
            try:
                with open(path, newline="", encoding=enc) as f:
                    rows = [r for r in csv.DictReader(f)]
                break
            except UnicodeDecodeError:
                continue

        cleaned = [r for r in rows if r["category_name"].strip().lower() not in test_names]
        removed = len(rows) - len(cleaned)

        if removed:
            with open(path, "w", newline="", encoding="cp1252") as f:
                writer = csv.DictWriter(f, fieldnames=["si_no", "category_name"])
                writer.writeheader()
                writer.writerows(cleaned)
            print(f"  [CLEANUP] Removed {removed} test entry from {dept} CSV")


print()
print("=" * 60)
print("  GEM Contracts API -- Health Check")
print(f"  Server : {BASE}")
print(f"  Run ID : {RUN_ID}")
print("=" * 60)
print()

# 1. GET endo categories
check(
    "GET  /api/endo-view-category",
    "GET",
    f"{BASE}/api/endo-view-category"
)

# 2. GET diagno categories
check(
    "GET  /api/diagno-view-category",
    "GET",
    f"{BASE}/api/diagno-view-category"
)

# 3. POST endo add category  (must return added=True with fresh name)
check(
    "POST /api/endo-add-category",
    "POST",
    f"{BASE}/api/endo-add-category",
    body={"category_name": TEST_ENDO_CAT},
    expect_added=True
)

# 4. POST diagno add category (must return added=True with fresh name)
check(
    "POST /api/diagno-add-category",
    "POST",
    f"{BASE}/api/diagno-add-category",
    body={"category_name": TEST_DIAGNO_CAT},
    expect_added=True
)

# 5. Root index
check(
    "GET  /  (root index)",
    "GET",
    f"{BASE}/"
)

print()
total  = len(results)
passed = sum(results)
print("=" * 60)
if passed == total:
    print(f"  ALL {total}/{total} ENDPOINTS PASSED - OK")
else:
    print(f"  {passed}/{total} passed -- check details above")
print("=" * 60)

# Clean up test entries so CSVs stay tidy
print()
cleanup_test_entries()
print()

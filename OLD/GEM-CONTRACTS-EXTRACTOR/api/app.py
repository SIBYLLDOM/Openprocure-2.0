    """
GEM Contracts — Unified API
============================
Serves both ENDO and DIAGNO systems through a single Flask server.

URL-style routes (no body needed):
  GET  /api/endo-view-category          → ENDO categories list
  GET  /api/diagno-view-category        → DIAGNO categories list
  GET  /api/endo-contracts              → ENDO contracts from DB
  GET  /api/diagno-contracts            → DIAGNO contracts from DB
  GET  /api/health                      → health check

Unified body-style routes (dept in request body):
  POST /api/view-categories             → { "dept": "endo"|"diagno" }
  POST /api/contracts                   → { "dept": "endo"|"diagno", "limit", "offset" }
  POST /api/contracts/by-category       → { "dept", "category_name", "limit", "offset" }
  POST /api/stats                       → { "dept": "endo"|"diagno" }
"""

from flask import Flask, jsonify, request, abort
from flask_cors import CORS
from pathlib import Path
import csv
import mysql.connector
from mysql.connector import Error

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Paths to each project's Datasets folder
# ---------------------------------------------------------------------------
BASE = Path(__file__).resolve().parent.parent   # …/GEM-CONTRACTS-EXTRACTOR ENDO

DEPT_CSV = {
    "endo":   BASE / "GEM-CONTRACTS-EXTRACTOR ENDO"   / "data" / "Datasets" / "categories.csv",
    "diagno": BASE / "GEM-CONTRACTS-EXTRACTOR DIAGNO" / "data" / "Datasets" / "categories.csv",
}

# ---------------------------------------------------------------------------
# Database config  (shared DB — same as both scrapers)
# ---------------------------------------------------------------------------
DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "",
    "database": "tender_automation_with_ai",
}

VALID_DEPTS = {"endo", "diagno"}

# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def _get_dept_from_body() -> str:
    """Extract and validate 'dept' from JSON request body."""
    body = request.get_json(silent=True) or {}
    dept = str(body.get("dept", "")).strip().lower()
    if dept not in VALID_DEPTS:
        abort(400, description=f"'dept' must be one of {sorted(VALID_DEPTS)}. Got: '{dept}'")
    return dept


def _db_connection():
    """Return a fresh MySQL connection."""
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except Error as e:
        abort(503, description=f"Database connection failed: {e}")


def _read_categories(dept: str) -> list:
    """Read categories from the dept-specific CSV file."""
    csv_path = DEPT_CSV[dept]

    if not csv_path.exists():
        abort(404, description=f"categories.csv not found for dept='{dept}' at {csv_path}")

    rows = []
    for enc in ("cp1252", "utf-8", "latin-1"):
        try:
            with open(csv_path, newline="", encoding=enc) as f:
                reader = csv.DictReader(f)
                for row in reader:
                    name = row.get("category_name", "").strip()
                    if name:
                        rows.append({
                            "si_no":         int(row.get("si_no", 0)),
                            "category_name": name,
                        })
            return rows
        except UnicodeDecodeError:
            continue

    abort(500, description=f"Could not decode categories.csv for dept='{dept}'")


def _fetch_contracts(dept: str, limit: int = 100, offset: int = 0) -> dict:
    """Fetch paginated contracts for a dept from DB."""
    conn = _db_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM old_contracts WHERE dept = %s",
            (dept,)
        )
        total = cur.fetchone()["cnt"]

        cur.execute(
            """
            SELECT id, category_name, contract_no, bid_no,
                   product, brand, model,
                   ordered_quantity, price, total_value,
                   buyer_dept_org, organization_name, buyer_designation,
                   state, buyer_department, office_zone,
                   buying_mode, contract_date, order_status,
                   download_link, seller_id, seller_name,
                   seller_email, unit_price, dept,
                   created_at
            FROM old_contracts
            WHERE dept = %s
            ORDER BY id DESC
            LIMIT %s OFFSET %s
            """,
            (dept, limit, offset),
        )
        contracts = cur.fetchall()
        for c in contracts:
            if c.get("created_at"):
                c["created_at"] = str(c["created_at"])
    finally:
        cur.close()
        conn.close()

    return {"total": total, "contracts": contracts}


def _add_category(dept: str, category_name: str) -> dict:
    """
    Append a new category to the dept's categories.csv.
    Skips duplicates (case-insensitive).
    Returns a result dict with added=True/False and the updated list.
    """
    csv_path = DEPT_CSV[dept]

    # Ensure the Datasets directory exists
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    category_name = category_name.strip()
    if not category_name:
        abort(400, description="'category_name' must not be empty.")

    # Read existing rows
    existing = _read_categories(dept) if csv_path.exists() else []

    # Duplicate check (case-insensitive)
    existing_names = {r["category_name"].lower() for r in existing}
    if category_name.lower() in existing_names:
        return {
            "added": False,
            "reason": f"'{category_name}' already exists in {dept} categories.",
            "total": len(existing),
            "categories": existing,
        }

    # Assign next si_no
    next_si = (max((r["si_no"] for r in existing), default=0) + 1)
    new_row  = {"si_no": next_si, "category_name": category_name}

    # Append to CSV (cp1252 to match Windows-saved files)
    file_exists = csv_path.exists()
    with open(csv_path, "a", newline="", encoding="cp1252") as f:
        writer = csv.DictWriter(f, fieldnames=["si_no", "category_name"])
        if not file_exists:
            writer.writeheader()
        writer.writerow(new_row)

    updated = existing + [new_row]
    return {
        "added": True,
        "new_entry": new_row,
        "total": len(updated),
        "categories": updated,
    }


def _delete_category(dept: str, category_name: str) -> dict:
    """
    Remove a category from the dept's categories.csv by name (case-insensitive).
    Re-numbers si_no sequentially after deletion.
    Returns a result dict with deleted=True/False and the updated list.
    """
    csv_path = DEPT_CSV[dept]

    if not csv_path.exists():
        abort(404, description=f"categories.csv not found for dept='{dept}'.")

    category_name = category_name.strip()
    if not category_name:
        abort(400, description="'category_name' must not be empty.")

    # Read existing rows
    existing = _read_categories(dept)

    # Find matching row (case-insensitive)
    target = category_name.lower()
    kept    = [r for r in existing if r["category_name"].lower() != target]
    removed = len(existing) - len(kept)

    if removed == 0:
        return {
            "deleted": False,
            "reason":  f"'{category_name}' not found in {dept} categories.",
            "total":   len(existing),
            "categories": existing,
        }

    # Re-number si_no from 1
    for idx, row in enumerate(kept, start=1):
        row["si_no"] = idx

    # Rewrite entire CSV
    with open(csv_path, "w", newline="", encoding="cp1252") as f:
        writer = csv.DictWriter(f, fieldnames=["si_no", "category_name"])
        writer.writeheader()
        writer.writerows(kept)

    return {
        "deleted":          True,
        "deleted_name":     category_name,
        "removed_count":    removed,
        "total":            len(kept),
        "categories":       kept,
    }


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(500)
@app.errorhandler(503)
def _handle_error(e):
    return jsonify(success=False, error=str(e.description)), e.code


# ===========================================================================
# URL-STYLE ROUTES  (dept embedded in the URL — no body required)
# ===========================================================================

# ------------------------------------------------------------------
# GET /api/endo-view-category
# ------------------------------------------------------------------
@app.route("/api/endo-view-category", methods=["GET"])
def endo_view_category():
    """Returns the list of ENDO categories from its categories.csv."""
    categories = _read_categories("endo")
    return jsonify(
        success=True,
        dept="endo",
        total=len(categories),
        categories=categories,
    )


# ------------------------------------------------------------------
# GET /api/diagno-view-category
# ------------------------------------------------------------------
@app.route("/api/diagno-view-category", methods=["GET"])
def diagno_view_category():
    """Returns the list of DIAGNO categories from its categories.csv."""
    categories = _read_categories("diagno")
    return jsonify(
        success=True,
        dept="diagno",
        total=len(categories),
        categories=categories,
    )


# ------------------------------------------------------------------
# POST /api/endo-add-category
# ------------------------------------------------------------------
@app.route("/api/endo-add-category", methods=["POST"])
def endo_add_category():
    """
    Adds a new category to the ENDO categories.csv.

    Body: { "category_name": "Laparoscopic Instruments" }

    Response (added):
    {
        "success": true, "dept": "endo", "added": true,
        "new_entry": { "si_no": 19, "category_name": "Laparoscopic Instruments" },
        "total": 19,
        "categories": [ ... ]
    }
    Response (duplicate):
    {
        "success": true, "dept": "endo", "added": false,
        "reason": "'...' already exists in endo categories."
    }
    """
    body = request.get_json(silent=True) or {}
    category_name = str(body.get("category_name", "")).strip()
    if not category_name:
        abort(400, description="'category_name' is required in the request body.")

    result = _add_category("endo", category_name)
    return jsonify(success=True, dept="endo", **result)


# ------------------------------------------------------------------
# POST /api/diagno-add-category
# ------------------------------------------------------------------
@app.route("/api/diagno-add-category", methods=["POST"])
def diagno_add_category():
    """
    Adds a new category to the DIAGNO categories.csv.

    Body: { "category_name": "Endoscopy Cameras" }
    """
    body = request.get_json(silent=True) or {}
    category_name = str(body.get("category_name", "")).strip()
    if not category_name:
        abort(400, description="'category_name' is required in the request body.")

    result = _add_category("diagno", category_name)
    return jsonify(success=True, dept="diagno", **result)


# ------------------------------------------------------------------
# DELETE /api/endo-delete-category
# ------------------------------------------------------------------
@app.route("/api/endo-delete-category", methods=["DELETE", "POST"])
def endo_delete_category():
    """
    Removes a category from the ENDO categories.csv.
    Supports both DELETE and POST methods for easier testing.

    Body: { "category_name": "Surgical Sutures" }

    Response (deleted):
    {
        "success": true, "dept": "endo", "deleted": true,
        "deleted_name": "Surgical Sutures",
        "removed_count": 1,
        "total": 17,
        "categories": [ ... ]
    }
    Response (not found):
    {
        "success": true, "dept": "endo", "deleted": false,
        "reason": "'...' not found in endo categories."
    }
    """
    body = request.get_json(silent=True) or {}
    category_name = str(body.get("category_name", "")).strip()
    if not category_name:
        abort(400, description="'category_name' is required in the request body.")

    result = _delete_category("endo", category_name)
    return jsonify(success=True, dept="endo", **result)


# ------------------------------------------------------------------
# DELETE /api/diagno-delete-category
# ------------------------------------------------------------------
@app.route("/api/diagno-delete-category", methods=["DELETE", "POST"])
def diagno_delete_category():
    """
    Removes a category from the DIAGNO categories.csv.
    Supports both DELETE and POST methods for easier testing.

    Body: { "category_name": "Electrolyte Analyzer" }
    """
    body = request.get_json(silent=True) or {}
    category_name = str(body.get("category_name", "")).strip()
    if not category_name:
        abort(400, description="'category_name' is required in the request body.")

    result = _delete_category("diagno", category_name)
    return jsonify(success=True, dept="diagno", **result)


# ------------------------------------------------------------------
# DELETE /api/delete-category  (unified body-style)
# ------------------------------------------------------------------
@app.route("/api/delete-category", methods=["DELETE", "POST"])
def delete_category():
    """
    Unified body-style delete.
    Body: { "dept": "endo"|"diagno", "category_name": "Category To Remove" }
    """
    dept = _get_dept_from_body()
    body = request.get_json(silent=True) or {}
    category_name = str(body.get("category_name", "")).strip()
    if not category_name:
        abort(400, description="'category_name' is required in the request body.")

    result = _delete_category(dept, category_name)
    return jsonify(success=True, dept=dept, **result)


# ------------------------------------------------------------------
# GET /api/endo-contracts
# ------------------------------------------------------------------
@app.route("/api/endo-contracts", methods=["GET"])
def endo_contracts():
    """Returns ENDO contracts from old_contracts table (paginated via ?limit=&offset=)."""
    limit  = min(int(request.args.get("limit",  100)), 1000)
    offset = max(int(request.args.get("offset", 0)),   0)
    data   = _fetch_contracts("endo", limit, offset)
    return jsonify(
        success=True,
        dept="endo",
        total=data["total"],
        limit=limit,
        offset=offset,
        contracts=data["contracts"],
    )


# ------------------------------------------------------------------
# GET /api/diagno-contracts
# ------------------------------------------------------------------
@app.route("/api/diagno-contracts", methods=["GET"])
def diagno_contracts():
    """Returns DIAGNO contracts from old_contracts table (paginated via ?limit=&offset=)."""
    limit  = min(int(request.args.get("limit",  100)), 1000)
    offset = max(int(request.args.get("offset", 0)),   0)
    data   = _fetch_contracts("diagno", limit, offset)
    return jsonify(
        success=True,
        dept="diagno",
        total=data["total"],
        limit=limit,
        offset=offset,
        contracts=data["contracts"],
    )


# ===========================================================================
# BODY-STYLE ROUTES  (dept in JSON body — flexible / unified)
# ===========================================================================

# ------------------------------------------------------------------
# POST /api/view-categories
# ------------------------------------------------------------------
@app.route("/api/view-categories", methods=["POST"])
def view_categories():
    """
    Body: { "dept": "endo" | "diagno" }
    Returns category list from that dept's categories.csv.
    """
    dept = _get_dept_from_body()
    categories = _read_categories(dept)
    return jsonify(
        success=True,
        dept=dept,
        total=len(categories),
        categories=categories,
    )


# ------------------------------------------------------------------
# POST /api/add-category
# ------------------------------------------------------------------
@app.route("/api/add-category", methods=["POST"])
def add_category():
    """
    Unified body-style route.
    Body: { "dept": "endo"|"diagno", "category_name": "New Category Name" }
    Adds the category to the matching dept's categories.csv.
    """
    dept = _get_dept_from_body()
    body = request.get_json(silent=True) or {}
    category_name = str(body.get("category_name", "")).strip()
    if not category_name:
        abort(400, description="'category_name' is required in the request body.")

    result = _add_category(dept, category_name)
    return jsonify(success=True, dept=dept, **result)


# ------------------------------------------------------------------
# POST /api/contracts
# ------------------------------------------------------------------
@app.route("/api/contracts", methods=["POST"])
def get_contracts():
    """
    Body: { "dept": "endo"|"diagno", "limit": 100, "offset": 0 }
    Returns paginated contracts from old_contracts.
    """
    dept   = _get_dept_from_body()
    body   = request.get_json(silent=True) or {}
    limit  = min(int(body.get("limit",  100)), 1000)
    offset = max(int(body.get("offset", 0)),   0)
    data   = _fetch_contracts(dept, limit, offset)
    return jsonify(
        success=True,
        dept=dept,
        total=data["total"],
        limit=limit,
        offset=offset,
        contracts=data["contracts"],
    )


# ------------------------------------------------------------------
# POST /api/contracts/by-category
# ------------------------------------------------------------------
@app.route("/api/contracts/by-category", methods=["POST"])
def contracts_by_category():
    """
    Body: { "dept": "diagno", "category_name": "Surgical Sutures", "limit": 100, "offset": 0 }
    Returns contracts filtered by dept AND category_name.
    """
    dept     = _get_dept_from_body()
    body     = request.get_json(silent=True) or {}
    category = str(body.get("category_name", "")).strip()
    limit    = min(int(body.get("limit",  100)), 1000)
    offset   = max(int(body.get("offset", 0)),   0)

    if not category:
        abort(400, description="'category_name' is required in the request body.")

    conn = _db_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM old_contracts WHERE dept=%s AND category_name=%s",
            (dept, category),
        )
        total = cur.fetchone()["cnt"]

        cur.execute(
            """
            SELECT id, category_name, contract_no, bid_no,
                   product, brand, model,
                   ordered_quantity, price, total_value,
                   buyer_dept_org, organization_name, buyer_designation,
                   state, buyer_department, office_zone,
                   buying_mode, contract_date, order_status,
                   download_link, seller_id, seller_name,
                   seller_email, unit_price, dept,
                   created_at
            FROM old_contracts
            WHERE dept = %s AND category_name = %s
            ORDER BY id DESC
            LIMIT %s OFFSET %s
            """,
            (dept, category, limit, offset),
        )
        contracts = cur.fetchall()
        for c in contracts:
            if c.get("created_at"):
                c["created_at"] = str(c["created_at"])
    finally:
        cur.close()
        conn.close()

    return jsonify(
        success=True,
        dept=dept,
        category_name=category,
        total=total,
        limit=limit,
        offset=offset,
        contracts=contracts,
    )


# ------------------------------------------------------------------
# POST /api/stats
# ------------------------------------------------------------------
@app.route("/api/stats", methods=["POST"])
def stats():
    """
    Body: { "dept": "endo" | "diagno" }
    Returns total contracts, CSV categories, and DB categories for the dept.
    """
    dept      = _get_dept_from_body()
    csv_count = len(_read_categories(dept))

    conn = _db_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM old_contracts WHERE dept=%s", (dept,)
        )
        total_contracts = cur.fetchone()["cnt"]

        cur.execute(
            "SELECT COUNT(DISTINCT category_name) AS cnt FROM old_contracts WHERE dept=%s",
            (dept,)
        )
        cats_in_db = cur.fetchone()["cnt"]
    finally:
        cur.close()
        conn.close()

    return jsonify(
        success=True,
        dept=dept,
        total_contracts=total_contracts,
        categories_in_csv=csv_count,
        categories_in_db=cats_in_db,
    )


# ------------------------------------------------------------------
# GET /  — API index / welcome
# ------------------------------------------------------------------
@app.route("/", methods=["GET"])
def index():
    return jsonify(
        success=True,
        message="GEM Contracts Unified API 🚀",
        base_url="http://localhost:5050",
        endpoints={
            "url_style_GET": {
                "endo_categories":   "GET  /api/endo-view-category",
                "diagno_categories": "GET  /api/diagno-view-category",
                "endo_contracts":    "GET  /api/endo-contracts?limit=100&offset=0",
                "diagno_contracts":  "GET  /api/diagno-contracts?limit=100&offset=0",
                "health":            "GET  /api/health",
            },
            "body_style_POST": {
                "view_categories":    'POST /api/view-categories          body: {"dept":"endo"|"diagno"}',
                "add_category":       'POST /api/add-category             body: {"dept":"endo"|"diagno", "category_name":"New Cat"}',
                "contracts":          'POST /api/contracts                body: {"dept":"endo"|"diagno","limit":100,"offset":0}',
                "contracts_by_cat":   'POST /api/contracts/by-category    body: {"dept":"endo","category_name":"Surgical Sutures"}',
                "stats":              'POST /api/stats                    body: {"dept":"endo"|"diagno"}',
            },
        },
    )


# ------------------------------------------------------------------
# GET /api/health
# ------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify(success=True, message="GEM Contracts API is running 🚀")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("  GEM Contracts Unified API  —  http://localhost:5050")
    print("=" * 60)
    print()
    print("  URL-style (no body needed):")
    print("    GET  /api/endo-view-category")
    print("    GET  /api/diagno-view-category")
    print("    GET  /api/endo-contracts")
    print("    GET  /api/diagno-contracts")
    print()
    print("  Body-style (send dept in JSON body):")
    print("    POST /api/view-categories")
    print("    POST /api/contracts")
    print("    POST /api/contracts/by-category")
    print("    POST /api/stats")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5050, debug=True)

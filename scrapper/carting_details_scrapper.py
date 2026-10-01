#!/usr/bin/env python3
"""
carting_details_scrapper.py — GeM "View Contracts" (gem.gov.in/view_contracts) scraper.

Flow — runs several browsers in parallel, all working through endo_cat.json
keywords (dept = "endo" only):

For each keyword, in each browser:
  1. Open https://gem.gov.in/view_contracts and wait for it to load.
  2. Type the category keyword into the category select2 box and pick the
     matching suggestion.
  3. Set the Contract Date (From/To) filter to the last 1 week.
  4. Solve the search CAPTCHA and click Search.
  5. Scroll to load every contract row for that keyword (page keeps lazy-loading
     more rows on scroll), and for each row:
       a. Click the Contract No. to open the popup, solve the popup CAPTCHA,
          submit, and download the contract PDF.
       b. Extract the PDF text and pass it to Ollama to pull out the carting
          sheet fields (hospital, seller, brand, qty, price, etc.).
       c. Save the row (contract no + keyword + dept + extracted fields) to MySQL.
       d. Delete the downloaded PDF immediately — nothing is kept on disk.
  6. Move on to the next keyword and repeat.
"""

import base64
import io
import json
import re
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from collections import Counter, defaultdict

import cv2
import numpy as np
import openpyxl
import pdfplumber
import pytesseract
import mysql.connector
from PIL import Image, ImageOps, ImageFilter
from playwright.sync_api import sync_playwright

# ---------------------------
# CONFIG
# ---------------------------
VIEW_CONTRACTS_URL   = "https://gem.gov.in/view_contracts"
SCRIPT_DIR            = Path(__file__).resolve().parent
TMP_DIR               = SCRIPT_DIR / "TEMP_PDF"
DAYS_BACK             = 7
MAX_CAPTCHA_ATTEMPTS  = 6
MAX_ROW_CAPTCHA_ATTEMPTS = 6
SCROLL_STABLE_ROUNDS  = 2

# State -> Zonal Head, sourced from the "Sheet1" pivot in Gem Carting.xlsx
# (Zonal Head / Hospital State breakdown). A couple of extra aliases/states
# seen only in the raw "Carting" sheet (not in the Sheet1 pivot) are folded in
# as fallbacks so lookups don't come back empty for those states.
STATE_TO_ZONAL_HEAD = {
    "bihar": "Ajeet Srivastava",
    "rajasthan": "Ajeet Srivastava",
    "uttar pradesh": "Ajeet Srivastava",
    "uttarakhand": "Ajeet Srivastava",
    "delhi": "Deepak Kumar Agrawal",
    "orissa": "Joyabrata Poddar",
    "odisha": "Joyabrata Poddar",
    "tripura": "Joyabrata Poddar",
    "chandigarh": "Kapil Arora",
    "haryana": "Kapil Arora",
    "himachal pradesh": "Kapil Arora",
    "jammu and kashmir": "Kapil Arora",
    "punjab": "Kapil Arora",
    "chhattisgarh": "Mangesh Chandurkar",
    "goa": "Mangesh Chandurkar",
    "gujarat": "Mangesh Chandurkar",
    "madhya pradesh": "Mangesh Chandurkar",
    "maharashtra": "Mangesh Chandurkar",
    "assam": "Manojendra Das",
    "manipur": "Manojendra Das",
    "meghalaya": "Manojendra Das",
    "west bengal": "Manojendra Das",
    "andaman & nicobar": "Manojendra Das",
    "andhra pradesh": "Yellesh M",
    "karnataka": "Yellesh M",
    "kerala": "Yellesh M",
    "tamil nadu": "Yellesh M",
    "telangana": "Yellesh M",
    "puducherry": "Yellesh M",
    "pondicherry": "Yellesh M",
    "jharkhand": "Yugeshwar",
}

# Common alternate spellings for state names as they appear on GeM listing/PDF pages.
STATE_NAME_ALIASES = {
    "nct of delhi": "delhi",
    "new delhi": "delhi",
    "j&k": "jammu and kashmir",
    "j & k": "jammu and kashmir",
    "orrisa": "orissa",
}


def get_zonal_head(state: str) -> str:
    if not state:
        return ""
    key = re.sub(r"\s+", " ", state).strip().lower()
    key = re.sub(r"^\(.*?\)\s*", "", key)  # strip leading "(Noida) " style prefixes
    key = STATE_NAME_ALIASES.get(key, key)
    return STATE_TO_ZONAL_HEAD.get(key, "")


# Fields to check, in priority order, when looking for the state that determines zonal_head.
# Buyer-side fields come first (that's what the Sheet1 pivot mapping is keyed on); seller-side
# fields and free-text org/location fields are fallbacks for rows where buyer state extraction
# came back empty (row scrape missed it, or the PDF didn't have a clean "state" field).
ZONAL_HEAD_CANDIDATE_FIELDS = [
    "state", "hospital_state", "buyer_department", "office_zone",
    "hospital_location", "buyer_dept_org", "organization_name",
    "seller_state", "seller_location", "seller_details",
]


def resolve_zonal_head(record: dict) -> str:
    """Tries each candidate field for an exact/alias state match first; if none of them hit,
    falls back to scanning all candidate fields' combined text for any known state name as a
    substring (catches states embedded in a longer address/org string)."""
    for field in ZONAL_HEAD_CANDIDATE_FIELDS:
        head = get_zonal_head(record.get(field) or "")
        if head:
            return head

    combined = " ".join(str(record.get(f) or "") for f in ZONAL_HEAD_CANDIDATE_FIELDS).lower()
    for state_key, head in STATE_TO_ZONAL_HEAD.items():
        if state_key in combined:
            return head

    return ""


# ---------------------------
# SELLER -> DB/COMPANY + MERIL DB LOOKUP (from the "Carting" sheet)
# ---------------------------
GEM_CARTING_XLSX = SCRIPT_DIR / "Gem Carting.xlsx"


def _normalize_seller_key(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "")).strip().lower()


def load_seller_reference_maps():
    """Reads the 'Carting' sheet of Gem Carting.xlsx and builds Seller Details ->
    (DB/COMPANY, Meril DB) lookups. Some sellers have inconsistent manual entries
    across rows, so each seller's value is decided by majority vote."""
    db_company_votes = defaultdict(Counter)
    meril_db_votes = defaultdict(Counter)

    if not GEM_CARTING_XLSX.exists():
        print(f"[WARN] {GEM_CARTING_XLSX} not found — db_company/meril_db lookups will be empty.")
        return {}, {}

    wb = openpyxl.load_workbook(str(GEM_CARTING_XLSX), data_only=True, read_only=True)
    try:
        ws = wb["Carting"]
        rows_iter = ws.iter_rows(values_only=True)
        headers = list(next(rows_iter))
        idx = {h: i for i, h in enumerate(headers)}
        seller_col = idx.get("Seller Details")
        db_company_col = idx.get("DB/COMPANY")
        meril_db_col = idx.get("Meril DB")

        for row in rows_iter:
            seller = row[seller_col] if seller_col is not None else None
            if not seller:
                continue
            key = _normalize_seller_key(str(seller))

            db_company = row[db_company_col] if db_company_col is not None else None
            if db_company:
                normalized = "COMPANY" if str(db_company).strip().upper() == "COMPANY" else str(db_company).strip()
                db_company_votes[key][normalized] += 1

            meril_db = row[meril_db_col] if meril_db_col is not None else None
            if meril_db:
                meril_db_votes[key][str(meril_db).strip().upper()] += 1
    finally:
        wb.close()

    db_company_map = {k: c.most_common(1)[0][0] for k, c in db_company_votes.items()}
    meril_db_map = {k: c.most_common(1)[0][0] for k, c in meril_db_votes.items()}
    print(f"[INIT] Loaded seller reference maps: {len(db_company_map)} sellers.")
    return db_company_map, meril_db_map


DB_COMPANY_MAP, MERIL_DB_MAP = load_seller_reference_maps()
KNOWN_SELLER_KEYS = sorted(set(DB_COMPANY_MAP) | set(MERIL_DB_MAP), key=len, reverse=True)

DEFAULT_DB_COMPANY = "Company"
DEFAULT_MERIL_DB = "NO"


def _find_seller_key(normalized: str) -> str:
    """Exact match first; otherwise fall back to a substring match (either direction)
    against the sheet's known sellers, since PDF-extracted seller names sometimes carry
    extra suffixes/prefixes (Pvt Ltd, punctuation, etc.) that don't match verbatim."""
    if not normalized:
        return ""
    if normalized in DB_COMPANY_MAP or normalized in MERIL_DB_MAP:
        return normalized
    for key in KNOWN_SELLER_KEYS:
        if len(key) < 4:
            continue  # avoid trivial/short-string false-positive matches
        if key in normalized or normalized in key:
            return key
    return ""


def get_db_company(seller_details: str) -> str:
    key = _find_seller_key(_normalize_seller_key(seller_details))
    return DB_COMPANY_MAP.get(key, DEFAULT_DB_COMPANY)


def get_meril_db(seller_details: str) -> str:
    key = _find_seller_key(_normalize_seller_key(seller_details))
    return MERIL_DB_MAP.get(key, DEFAULT_MERIL_DB)


DEPT_CONFIG = {
    "diagno": SCRIPT_DIR / "diagno_cat.json",
    "endo":   SCRIPT_DIR / "endo_cat.json",
}

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
ALLOWED = "abcdefghijklmnopqrstuvwxyz0123456789"

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

OLLAMA_URL   = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL = "gpt-oss:120b-cloud"

CARTING_SYSTEM_PROMPT = """You extract structured data from a GeM (Government e-Marketplace) \
contract PDF's raw text. Return ONLY a single JSON object (no markdown, no commentary) with \
exactly these keys:

{
  "bid_no": "",
  "contract_date": "",
  "hospital_name": "",
  "hospital_location": "",
  "hospital_state": "",
  "seller_details": "",
  "seller_location": "",
  "seller_state": "",
  "seller_contact_no": "",
  "decode": "",
  "brand_name": "",
  "company_name": "",
  "total_value": ""
}

Field meaning:
- bid_no: the Bid Number referenced in the contract (if any), not the contract number.
- hospital_name / hospital_location / hospital_state: the Buyer / Consignee organisation and its address.
- seller_details: the seller/OEM company's name as printed for the seller.
- seller_location / seller_state: the seller's registered address city/state.
- seller_contact_no: seller phone number if present.
- decode: the item/product code (sometimes labelled Model No, Catalogue No, or product code).
- brand_name: the brand of the product ordered.
- company_name: the manufacturer name if different from seller_details, else same as seller_details.
- total_value: total contract value (number only).

If a field cannot be found in the text, return it as an empty string. Do not invent data."""


# ---------------------------
# CAPTCHA SOLVER (tesseract ensemble, ported from GEM-CONTRACTS-EXTRACTOR)
# ---------------------------


# ---------------------------
# CAPTCHA SOLVER (tesseract ensemble, ported from GEM-CONTRACTS-EXTRACTOR)
# ---------------------------
def _generate_variants(img: Image.Image):
    variants = []
    gray = img.convert("L")
    variants.append(gray)
    variants.append(ImageOps.autocontrast(gray, cutoff=1))
    variants.append(gray.filter(ImageFilter.SHARPEN))
    arr = np.array(gray)
    th = cv2.adaptiveThreshold(arr, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 31, 5)
    variants.append(Image.fromarray(th))
    variants.append(ImageOps.invert(gray))
    return variants


def _ocr_pass(img, psm):
    cfg = f"--psm {psm} --oem 3 -c tessedit_char_whitelist={ALLOWED}"
    txt = pytesseract.image_to_string(img, config=cfg)
    return "".join(c for c in txt.lower() if c in ALLOWED)


def _smart_vote(results):
    if not results:
        return ""
    length_scores = Counter(len(r) for r in results if 4 <= len(r) <= 6)
    if not length_scores:
        return ""
    target_len = length_scores.most_common(1)[0][0]
    filtered = [r for r in results if len(r) == target_len]
    final = ""
    for i in range(target_len):
        chars = [r[i] for r in filtered if i < len(r)]
        if chars:
            final += Counter(chars).most_common(1)[0][0]
    return final


def ensemble_solve(img_pil):
    if not isinstance(img_pil, Image.Image):
        img_pil = Image.open(io.BytesIO(img_pil))
    img_pil = img_pil.resize((img_pil.width * 3, img_pil.height * 3), Image.Resampling.LANCZOS)

    results = []
    for variant in _generate_variants(img_pil):
        for psm in [6, 7, 8, 10, 13]:
            try:
                txt = _ocr_pass(variant, psm)
                if 4 <= len(txt) <= 6:
                    results.append(txt)
            except Exception:
                pass

    final = _smart_vote(results)
    confidence = min(0.95, 0.4 + 0.1 * len(results))
    return final, confidence


# ---------------------------
# CATEGORY KEYWORDS
# ---------------------------
# Only run categories whose name contains this substring (case-insensitive) — e.g. all
# the GeM suture variants ("Surgical Sutures", "Sutures (V2)", "Sutures (V3)",
# "Sutures-Rev 1", ...). Set to None/"" to run every category in DEPT_CONFIG[dept] again.
CATEGORY_FILTER = "suture"


def load_categories(dept: str):
    category_file = DEPT_CONFIG[dept]
    if not category_file.exists():
        raise FileNotFoundError(f"Category file not found: {category_file}")
    with open(category_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    categories = [item["item_category"] for item in data]
    if CATEGORY_FILTER:
        categories = [c for c in categories if CATEGORY_FILTER.lower() in c.lower()]
    return categories


# ---------------------------
# PAGE ACTIONS
# ---------------------------
def open_view_contracts(page):
    print("[NAV] Opening view_contracts ...")
    page.goto(VIEW_CONTRACTS_URL, timeout=60000)
    page.wait_for_selector("#select2-buyer_category-container", timeout=60000)
    page.wait_for_timeout(2000)
    print("[NAV] Page loaded.")


def select_category(page, category):
    print(f"[CATEGORY] Selecting '{category}' ...")
    page.click("#select2-buyer_category-container")
    search = page.wait_for_selector("input.select2-search__field", state="visible", timeout=10000)
    search.fill(category)
    page.wait_for_timeout(1500)

    options = page.locator("li.select2-results__option:not(.select2-results__message)")
    count = options.count()
    for i in range(count):
        if options.nth(i).inner_text().strip().lower() == category.lower():
            options.nth(i).click()
            print(f"[CATEGORY] ✅ Selected '{category}'")
            return True

    print(f"[CATEGORY] ❌ No exact match found for '{category}'")
    return False


def set_last_week_date_filter(page):
    to_date = datetime.today()
    from_date = to_date - timedelta(days=DAYS_BACK)

    page.evaluate(
        """
        (d) => {
            document.querySelector('#from_date_contract_search1').value = d.from;
            document.querySelector('#to_date_contract_search1').value = d.to;
        }
        """,
        {"from": from_date.strftime("%d-%m-%Y"), "to": to_date.strftime("%d-%m-%Y")},
    )
    print(f"[DATE] Set range {from_date.strftime('%d-%m-%Y')} → {to_date.strftime('%d-%m-%Y')}")


def refresh_captcha(page, img_selector="#captchaimg1", reload_js=None):
    """Reloads the captcha image and waits for a new one to load.

    If reload_js is given (e.g. "loadCap('0')" for the row-popup captcha, whose
    refresh link is <a onclick="javascript:loadCap('0');">), call that JS function
    directly — reliable regardless of how many refresh icons exist in the DOM.
    Otherwise fall back to clicking the refresh icon nearest the captcha image in
    document order (there can be TWO refresh icons in the DOM at once — the main
    search form's and the row-popup's — both matching img[src=".../refresh.png"],
    so a blind .first can click the wrong, stale one).
    """
    old_src = page.locator(img_selector).get_attribute("src")

    if reload_js:
        try:
            page.evaluate(f"javascript:{reload_js}")
        except Exception:
            pass
    else:
        refresh_icon = page.locator(img_selector).locator(
            "xpath=following::img[contains(@src,'refresh.png')][1]"
        )
        try:
            refresh_icon.click(timeout=3000)
        except Exception:
            # Fallback: no refresh icon found after it in the DOM — try the closest match overall.
            try:
                page.locator('img[src="/resources/images/refresh.png"]').last.click(timeout=3000)
            except Exception:
                return

    for _ in range(20):
        page.wait_for_timeout(200)
        new_src = page.locator(img_selector).get_attribute("src")
        if new_src and new_src != old_src:
            return


def solve_captcha_and_search(page):
    for attempt in range(1, MAX_CAPTCHA_ATTEMPTS + 1):
        src = page.locator("#captchaimg1").get_attribute("src")
        img_bytes = src.split(",", 1)[1]
        img = Image.open(io.BytesIO(base64.b64decode(img_bytes)))

        text, conf = ensemble_solve(img)
        print(f"[CAPTCHA] Attempt {attempt}/{MAX_CAPTCHA_ATTEMPTS} → '{text}' (conf={conf:.2f})")

        if not text or conf < 0.55:
            refresh_captcha(page, "#captchaimg1")
            continue

        page.fill("#captcha_code1", text)
        page.click("#searchlocation1")
        page.wait_for_timeout(4000)

        error_el = page.locator("#pcaptcha_code1")
        if error_el.is_visible():
            err_text = error_el.inner_text().strip()
            if "Please enter correct Confirmation Code" in err_text or "Enter captcha code" in err_text:
                print(f"[CAPTCHA] ❌ Rejected: {err_text}")
                refresh_captcha(page, "#captchaimg1")
                continue

        print("[CAPTCHA] ✅ Search submitted.")
        return True

    print("[CAPTCHA] ❌ Failed after max attempts.")
    return False


def wait_for_results(page):
    print("[RESULTS] Waiting for contracts to load ...")
    page.wait_for_timeout(4000)
    page.wait_for_load_state("networkidle", timeout=30000)
    print("[RESULTS] ✅ Results loaded.")


# ---------------------------
# DATABASE
# ---------------------------
def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


# Columns that must exist on carting_details, beyond the base id/contract_no/dept/created_at
# set created by CREATE TABLE. Used both for the initial CREATE and to patch tables that
# were created by an earlier version of this script (before these columns existed).
CARTING_COLUMNS = {
    "bid_no": "VARCHAR(100) DEFAULT NULL",
    "category": "VARCHAR(255) DEFAULT NULL",
    "zonal_head": "VARCHAR(100) DEFAULT NULL",
    # scraped straight off the results-grid row (span.ajxtag_* elements)
    "product": "TEXT",
    "brand": "VARCHAR(255) DEFAULT NULL",
    "model": "VARCHAR(255) DEFAULT NULL",
    "ordered_quantity": "VARCHAR(50) DEFAULT NULL",
    "unit_price": "VARCHAR(50) DEFAULT NULL",
    "total_value": "VARCHAR(50) DEFAULT NULL",
    "buyer_dept_org": "TEXT",
    "organization_name": "TEXT",
    "buyer_designation": "TEXT",
    "state": "VARCHAR(100) DEFAULT NULL",
    "buyer_department": "TEXT",
    "office_zone": "TEXT",
    "buying_mode": "VARCHAR(100) DEFAULT NULL",
    "contract_date": "VARCHAR(50) DEFAULT NULL",
    "order_status": "VARCHAR(100) DEFAULT NULL",
    # extracted from the downloaded contract PDF via Ollama
    "hospital_name": "TEXT",
    "hospital_location": "VARCHAR(255) DEFAULT NULL",
    "hospital_state": "VARCHAR(100) DEFAULT NULL",
    "seller_details": "TEXT",
    "seller_location": "VARCHAR(255) DEFAULT NULL",
    "seller_state": "VARCHAR(100) DEFAULT NULL",
    "seller_contact_no": "VARCHAR(50) DEFAULT NULL",
    "decode_code": "VARCHAR(255) DEFAULT NULL",
    "brand_name": "VARCHAR(255) DEFAULT NULL",
    "company_name": "VARCHAR(255) DEFAULT NULL",
    "meril_or_others": "VARCHAR(20) DEFAULT NULL",
    # looked up from Gem Carting.xlsx by seller_details (see load_seller_reference_maps)
    "db_company": "VARCHAR(20) DEFAULT NULL",
    "meril_db": "VARCHAR(20) DEFAULT NULL",
}


def ensure_table(conn):
    cur = conn.cursor()
    column_defs = ",\n        ".join(f"{name} {ddl}" for name, ddl in CARTING_COLUMNS.items())
    cur.execute(f"""
    CREATE TABLE IF NOT EXISTS carting_details (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        contract_no  VARCHAR(100) NOT NULL,
        dept         VARCHAR(20)  NOT NULL,
        {column_defs},
        created_at   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_contract_no (contract_no)
    )
    """)
    conn.commit()

    # Patch any pre-existing table (created by an older version of this script)
    # that is missing columns added since.
    cur.execute("""
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'carting_details'
    """, (DB_CONFIG["database"],))
    existing = {row[0] for row in cur.fetchall()}

    # --- One-off migration: drop the old dead "ordered_qty"/"unit_price" (Ollama-only,
    # never actually populated) and rename the row-scraped "price" column to "unit_price". ---
    if "unit_price" in existing and "price" in existing:
        # Legacy dead "unit_price" column would collide with the rename below — drop it first.
        try:
            print("[DB] Dropping unused legacy column carting_details.unit_price ...")
            cur.execute("ALTER TABLE carting_details DROP COLUMN unit_price")
            conn.commit()
            existing.discard("unit_price")
        except mysql.connector.errors.DatabaseError as e:
            if getattr(e, "errno", None) != 1091:  # "can't DROP; check that column exists"
                raise
            conn.rollback()

    if "price" in existing and "unit_price" not in existing:
        try:
            print("[DB] Renaming carting_details.price -> unit_price ...")
            cur.execute("ALTER TABLE carting_details CHANGE COLUMN price unit_price VARCHAR(50) DEFAULT NULL")
            conn.commit()
            existing.discard("price")
            existing.add("unit_price")
        except mysql.connector.errors.DatabaseError as e:
            if getattr(e, "errno", None) not in (1054, 1060):
                raise
            conn.rollback()

    if "ordered_qty" in existing:
        try:
            print("[DB] Dropping unused legacy column carting_details.ordered_qty ...")
            cur.execute("ALTER TABLE carting_details DROP COLUMN ordered_qty")
            conn.commit()
            existing.discard("ordered_qty")
        except mysql.connector.errors.DatabaseError as e:
            if getattr(e, "errno", None) != 1091:
                raise
            conn.rollback()
    # --- end one-off migration ---

    missing = {name: ddl for name, ddl in CARTING_COLUMNS.items() if name not in existing}
    for name, ddl in missing.items():
        try:
            print(f"[DB] Adding missing column carting_details.{name} ...")
            cur.execute(f"ALTER TABLE carting_details ADD COLUMN {name} {ddl}")
            conn.commit()
        except mysql.connector.errors.DatabaseError as e:
            # Two workers (diagno/endo) may race to add the same column — ignore "duplicate column".
            if getattr(e, "errno", None) != 1060:
                raise
            conn.rollback()

    cur.close()


# contracts has no unique constraint on contract_no (and already contains duplicate
# contract_no rows from the older GEM-CONTRACTS-EXTRACTOR pipeline), so this is a plain
# INSERT — re-running the scraper over the same contracts will add duplicate rows, same
# as that legacy pipeline already does.
SAVE_SQL = """
INSERT INTO contracts
(contract_no, bid_no, category_name, zonal_head, dept,
 product, brand, model, ordered_quantity, unit_price, price, total_value,
 buyer_dept_org, organization_name, buyer_designation, state, buyer_department,
 office_zone, buying_mode, contract_date, order_status,
 hospital_name, hospital_location, hospital_state, seller_name, seller_location,
 seller_state, seller_contact_no, decode_code, brand_name, company_name, meril_or_others,
 db_company, meril_db)
VALUES (%s,%s,%s,%s,%s, %s,%s,%s,%s,%s,%s,%s, %s,%s,%s,%s,%s, %s,%s,%s,%s,
        %s,%s,%s,%s,%s, %s,%s,%s,%s,%s,%s, %s,%s)
"""


def save_carting_details(conn, record, dept: str):
    cur = conn.cursor()
    total_value = record.get("total_value")
    cur.execute(SAVE_SQL, (
        record["contract_no"], record.get("bid_no"), record.get("category"),
        record.get("zonal_head"), dept,
        record.get("product"), record.get("brand"), record.get("model"),
        record.get("ordered_quantity"), record.get("unit_price"), total_value, total_value,
        record.get("buyer_dept_org"), record.get("organization_name"), record.get("buyer_designation"),
        record.get("state"), record.get("buyer_department"), record.get("office_zone"),
        record.get("buying_mode"), record.get("contract_date"), record.get("order_status"),
        record.get("hospital_name"), record.get("hospital_location"), record.get("hospital_state"),
        record.get("seller_details"), record.get("seller_location"), record.get("seller_state"),
        record.get("seller_contact_no"), record.get("decode"), record.get("brand_name"),
        record.get("company_name"), record.get("meril_or_others"),
        record.get("db_company"), record.get("meril_db"),
    ))
    conn.commit()
    cur.close()
    print(f"[{dept}] [DB] ✅ Saved {record['contract_no']}")


# ---------------------------
# PDF TEXT EXTRACTION
# ---------------------------
def extract_pdf_text(pdf_path: Path) -> str:
    text_parts = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            if t.strip():
                text_parts.append(t)
    return "\n".join(text_parts)


# ---------------------------
# OLLAMA EXTRACTION
# ---------------------------
def _ollama_call(messages: list) -> str:
    payload = json.dumps({
        "model": OLLAMA_MODEL, "messages": messages,
        "stream": False, "options": {"temperature": 0},
    }).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL, data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("message", {}).get("content", "").strip()


def _parse_json(raw: str):
    if not raw:
        return None
    for pattern in [r"```json\s*(.*?)\s*```", r"```\s*(.*?)\s*```"]:
        m = re.search(pattern, raw, re.DOTALL)
        if m:
            raw = m.group(1).strip()
            break
    else:
        sb, eb = raw.find("{"), raw.rfind("}")
        if sb != -1 and eb != -1:
            raw = raw[sb: eb + 1]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def ask_ollama_for_carting_fields(contract_no: str, contract_text: str) -> dict:
    messages = [
        {"role": "system", "content": CARTING_SYSTEM_PROMPT},
        {"role": "user", "content": f"Contract No: {contract_no}\n\nContract text:\n{contract_text[:12000]}"},
    ]
    for attempt in range(1, 4):
        try:
            raw = _ollama_call(messages)
            result = _parse_json(raw)
            if isinstance(result, dict):
                return result
            print(f"[OLLAMA] Bad JSON (attempt {attempt}): {raw[:150] if raw else '<empty>'}")
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"[OLLAMA] Unreachable (attempt {attempt}): {e}")
        except Exception as e:
            print(f"[OLLAMA] Attempt {attempt}/3 failed: {e}")
        time.sleep(5)
    return {}


# ---------------------------
# POPUP CAPTCHA + PDF DOWNLOAD
# ---------------------------
def solve_popup_captcha(page) -> bool:
    for attempt in range(1, MAX_ROW_CAPTCHA_ATTEMPTS + 1):
        src = page.locator("#captchaimg").get_attribute("src")
        img = Image.open(io.BytesIO(base64.b64decode(src.split(",", 1)[1])))

        text, conf = ensemble_solve(img)
        print(f"    [ROW CAPTCHA] Attempt {attempt}/{MAX_ROW_CAPTCHA_ATTEMPTS} → '{text}' (conf={conf:.2f})")

        if not text or conf < 0.55:
            refresh_captcha(page, "#captchaimg", reload_js="loadCap('0')")
            continue

        page.fill("#captcha_code", text)
        page.click("#modelsbt")
        page.wait_for_timeout(2500)

        error_el = page.locator("#pcaptcha_code")
        if error_el.is_visible() and error_el.inner_text().strip():
            print(f"    [ROW CAPTCHA] ❌ Rejected: {error_el.inner_text().strip()}")
            refresh_captcha(page, "#captchaimg", reload_js="loadCap('0')")
            continue

        return True

    return False


def close_popup(page):
    for selector in ['.modal.show .close', '.modal.show [data-dismiss="modal"]', 'button.close']:
        try:
            el = page.locator(selector).first
            if el.is_visible(timeout=500):
                el.click()
                page.wait_for_timeout(500)
                return
        except Exception:
            pass
    try:
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
    except Exception:
        pass


def scrape_visible_rows(page, dept: str) -> dict:
    """Extracts row data currently rendered in the results grid, keyed by contract_no.

    GeM repeats each span type N times per row (items x3, buyers x3, modes x4,
    values x2), so the field for row i sits at a fixed offset — same layout as
    GEM-CONTRACTS-EXTRACTOR's ContractsController._extract_and_save_current_rows.
    """
    bids = page.locator("span.ajxtag_order_number")
    count = bids.count()
    if count == 0:
        return {}

    items = page.locator("span.ajxtag_item_title")
    qtys = page.locator("span.ajxtag_quantity")
    values = page.locator("span.ajxtag_totalvalue")
    buyers = page.locator("span.ajxtag_buyer_dept_org")
    modes = page.locator("span.ajxtag_buying_mode")
    dates = page.locator("span.ajxtag_contract_date")
    status = page.locator("span.ajxtag_order_status")
    dates_count = dates.count()

    rows = {}
    for i in range(count):
        try:
            contract_no = bids.nth(i).inner_text().strip()
            if not contract_no or contract_no in rows:
                continue

            buying_mode = modes.nth(i * 4 + 3).inner_text().strip()
            date_idx = i * 2 + 1 if ("Bid" in buying_mode or "RA" in buying_mode) else i
            contract_date = dates.nth(date_idx).inner_text().strip() if date_idx < dates_count else ""

            rows[contract_no] = {
                "product": items.nth(i * 3).inner_text().strip(),
                "brand": items.nth(i * 3 + 1).inner_text().strip(),
                "model": items.nth(i * 3 + 2).inner_text().strip(),
                "ordered_quantity": qtys.nth(i).inner_text().strip(),
                "unit_price": values.nth(i * 2 + 1).inner_text().strip(),
                "total_value": values.nth(i * 2).inner_text().strip(),
                "buyer_dept_org": buyers.nth(i * 3).inner_text().strip(),
                "organization_name": buyers.nth(i * 3 + 1).inner_text().strip(),
                "buyer_designation": buyers.nth(i * 3 + 2).inner_text().strip(),
                "state": modes.nth(i * 4).inner_text().strip(),
                "buyer_department": modes.nth(i * 4 + 1).inner_text().strip(),
                "office_zone": modes.nth(i * 4 + 2).inner_text().strip(),
                "buying_mode": buying_mode,
                "contract_date": contract_date,
                "order_status": status.nth(i).inner_text().strip(),
            }
        except Exception as e:
            print(f"  [{dept}] [ROW SCRAPE] ⚠️  Row {i + 1} failed: {e}")

    return rows


# Selectors tried, in order, to find the popup's actual download control. #dwnbtn is the
# original id we were given; the others are fallbacks in case the markup has since changed
# (e.g. a plain <button>/<a> labelled "Download" instead of that exact id).
DOWNLOAD_BUTTON_SELECTORS = [
    "#dwnbtn",
    "a#dwnbtn",
    "a:has-text('Download')",
    "button:has-text('Download')",
    ".btn:has-text('Download')",
]


def _find_download_button(page):
    for selector in DOWNLOAD_BUTTON_SELECTORS:
        try:
            el = page.locator(selector).first
            if el.is_visible(timeout=1000):
                return el, selector
        except Exception:
            continue
    return None, None


def wait_for_download_button(page, contract_no: str, dept: str, timeout_ms: int = 30000):
    deadline = time.time() + (timeout_ms / 1000)
    while time.time() < deadline:
        el, selector = _find_download_button(page)
        if el:
            return el
        page.wait_for_timeout(500)

    # Not found — dump whatever popup/modal is currently visible so the exact
    # markup can be inspected and the selector list above updated.
    try:
        html = page.evaluate("""
            () => {
                const modal = document.querySelector('.modal.show, .modal[style*="display: block"], .modal.in');
                return modal ? modal.outerHTML.slice(0, 2000) : document.body.innerHTML.slice(0, 500);
            }
        """)
        print(f"  [{dept}] [CONTRACT] 🔍 Popup HTML for {contract_no} (no download button found):\n{html}")
    except Exception:
        pass
    return None


def download_contract_pdf(page, contract_no: str, dept: str):
    print(f"  [{dept}] [CONTRACT] Opening {contract_no} ...")
    row_span = page.locator(f"span.ajxtag_order_number:text-is('{contract_no}')").first
    row_span.click()

    try:
        page.wait_for_selector("#captchaimg", state="visible", timeout=10000)
    except Exception:
        print(f"  [{dept}] [CONTRACT] ❌ Popup captcha never appeared for {contract_no}")
        close_popup(page)
        return None

    if not solve_popup_captcha(page):
        print(f"  [{dept}] [CONTRACT] ❌ Could not solve popup captcha for {contract_no}")
        close_popup(page)
        return None

    download_el = wait_for_download_button(page, contract_no, dept, timeout_ms=30000)
    if not download_el:
        # One retry: some captcha submits are slow to bind the button — resubmit and wait again.
        try:
            page.click("#modelsbt", timeout=2000)
        except Exception:
            pass
        download_el = wait_for_download_button(page, contract_no, dept, timeout_ms=15000)

    if not download_el:
        print(f"  [{dept}] [CONTRACT] ❌ Download button never appeared for {contract_no}")
        close_popup(page)
        return None

    dept_tmp_dir = TMP_DIR / dept
    dept_tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = dept_tmp_dir / f"{contract_no}.pdf"
    try:
        with page.expect_download(timeout=30000) as dl_info:
            download_el.click()
        download = dl_info.value
        download.save_as(str(tmp_path))
    except Exception as e:
        print(f"  [{dept}] [CONTRACT] ❌ Download failed for {contract_no}: {e}")
        close_popup(page)
        return None

    close_popup(page)
    return tmp_path


def process_contract_row(page, conn, category: str, contract_no: str, dept: str, row_data: dict):
    pdf_path = download_contract_pdf(page, contract_no, dept)
    if not pdf_path:
        return

    try:
        text = extract_pdf_text(pdf_path)
        fields = ask_ollama_for_carting_fields(contract_no, text)
    finally:
        # never keep the PDF around, success or failure
        try:
            pdf_path.unlink(missing_ok=True)
        except Exception:
            pass

    # Row data (scraped straight from the results grid) is authoritative;
    # only fall back to the Ollama/PDF-derived value when the row didn't have it.
    record = dict(row_data)
    for key, value in (fields or {}).items():
        if not record.get(key):
            record[key] = value

    record["contract_no"] = contract_no
    record["category"] = category

    company_name = (record.get("company_name") or "").strip()
    brand_name = (record.get("brand_name") or record.get("brand") or "").strip()
    record["meril_or_others"] = "Meril" if ("meril" in company_name.lower() or "meril" in brand_name.lower()) else "Others"

    record["zonal_head"] = resolve_zonal_head(record)

    seller_details = record.get("seller_details") or ""
    record["db_company"] = get_db_company(seller_details)
    record["meril_db"] = get_meril_db(seller_details)

    save_carting_details(conn, record, dept)


def scroll_to_bottom(page):
    """Presses PageDown repeatedly until the page stops moving — i.e. we've hit
    whatever is currently rendered at the bottom (more may still lazy-load after)."""
    last_y = -1
    while True:
        curr_y = page.evaluate("window.scrollY")
        if curr_y == last_y:
            return
        last_y = curr_y
        page.keyboard.press("PageDown")
        page.wait_for_timeout(300)


def is_loading_indicator_visible(page) -> bool:
    """GeM shows a <div>Loading...</div> while it lazy-loads the next batch of rows."""
    return page.evaluate("""
        () => {
            const divs = Array.from(document.querySelectorAll('div'));
            const loadingDiv = divs.find(div => div.textContent.trim() === 'Loading...');
            if (!loadingDiv) return false;
            const style = window.getComputedStyle(loadingDiv);
            return style.display !== 'none' && style.visibility !== 'hidden';
        }
    """)


def wait_for_next_batch(page):
    """After scrolling to the bottom, wait for the 'Loading...' indicator (if shown)
    to finish before treating the newly rendered rows as final."""
    if is_loading_indicator_visible(page):
        print("    [SCROLL] ⏳ 'Loading...' indicator visible — waiting for next batch ...")
        for _ in range(60):  # up to ~30s
            page.wait_for_timeout(500)
            if not is_loading_indicator_visible(page):
                break
    else:
        page.wait_for_timeout(1500)  # give lazy rendering a moment even with no visible spinner


def scroll_and_process_category(page, conn, category: str, dept: str, processed: set):
    """Scroll-to-bottom / wait-for-'Loading...' / scrape / process loop for one category,
    run entirely on the one page that has that search's results loaded (Playwright's sync
    API is single-thread-owned, and GeM's row popup only exists on the page that actually
    ran the search — so this can't be split across worker tabs; see run_category_worker)."""
    print(f"[{dept}] [SCROLL] Loading & processing all rows for '{category}' ...")
    stable_rounds = 0
    last_count = 0

    while stable_rounds < SCROLL_STABLE_ROUNDS:
        # 1. Scroll all the way down to whatever is currently rendered.
        scroll_to_bottom(page)

        # 2. If the portal is fetching the next batch, wait for the "Loading..." spinner
        #    to disappear before we treat the current DOM as the final set for this pass.
        wait_for_next_batch(page)

        # 3. Scrape every row visible now and process anything we haven't already handled.
        row_data_map = scrape_visible_rows(page, dept)
        count = len(row_data_map)

        for contract_no, row_data in row_data_map.items():
            if contract_no in processed:
                continue
            processed.add(contract_no)
            try:
                process_contract_row(page, conn, category, contract_no, dept, row_data)
            except Exception as e:
                print(f"  [{dept}] [CONTRACT] ⚠️  Unhandled error on {contract_no}: {e}")

        # 4. Once scrolling further and waiting stops producing new rows, the
        #    grid has no more "Loading..." left to do — that's the last row.
        if count == last_count:
            stable_rounds += 1
        else:
            stable_rounds = 0
        last_count = count

    print(f"[{dept}] [SCROLL] ✅ Done with '{category}' — {len(processed)} contracts processed so far.")


# ---------------------------
# WORKERS — multiple independent browsers per department, each handling a slice of categories
# ---------------------------
# Each of these runs the FULL pipeline (open -> select category -> date filter -> captcha ->
# search -> scroll -> per-row popup/captcha/download/Ollama/DB) end-to-end on its own tab.
# This is the actual unit of parallelism: Playwright's sync API only allows a page/browser to
# be driven from the thread that created it, and GeM's contract popup only exists on the page
# that ran that specific search — so real concurrency has to be "N independent browser windows
# working through different categories," not "N worker tabs sharing one search results page."
CATEGORY_WORKERS_PER_DEPT = 3


def run_category_worker(dept: str, categories: list, worker_id: int):
    tag = f"{dept}#{worker_id}"
    conn = get_db_connection()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False, args=["--start-maximized"])
            context = browser.new_context(viewport=None, accept_downloads=True)
            page = context.new_page()

            for category in categories:
                open_view_contracts(page)
                if not select_category(page, category):
                    continue
                set_last_week_date_filter(page)
                if not solve_captcha_and_search(page):
                    continue
                wait_for_results(page)

                processed = set()
                scroll_and_process_category(page, conn, category, dept, processed)

            browser.close()
    finally:
        conn.close()

    print(f"  [{tag}] Category worker finished ({len(categories)} categories).")


def run_dept_worker(dept: str):
    categories = load_categories(dept)
    print(f"[{dept}] [INIT] Loaded {len(categories)} categories.")

    # Writing into the existing `contracts` table now (see save_carting_details) —
    # no ensure_table() call, since that table already exists with its own schema
    # and isn't owned by this script.

    # Split the category list round-robin across N independent browser windows.
    slices = [categories[i::CATEGORY_WORKERS_PER_DEPT] for i in range(CATEGORY_WORKERS_PER_DEPT)]
    workers = [
        threading.Thread(
            target=run_category_worker,
            args=(dept, slice_, i),
            name=f"{dept}-category-worker-{i}",
        )
        for i, slice_ in enumerate(slices) if slice_
    ]
    for w in workers:
        w.start()
    for w in workers:
        w.join()

    print(f"[{dept}] [DONE] Worker finished.")


# ---------------------------
# MAIN — endo dept only, launches CATEGORY_WORKERS_PER_DEPT browser windows in parallel
# ---------------------------
def main():
    run_dept_worker("endo")
    print("[MAIN] Endo worker finished.")


if __name__ == "__main__":
    main()

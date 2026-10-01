"""
karnataka_scrapper.py
======================
Karnataka Public Procurement Portal (KPPP) Scraper
https://kppp.karnataka.gov.in/#/portal/portal-home

Flow:
  1. Open portal home page
  2. Wait 3 seconds for page load
  3. Switch language to English
  4. Wait 3 seconds for page load
  5. Click "Live Tenders" card
  6. Wait 3 seconds for redirect to the live tenders listing page
  7. Solve the captcha gate (Ollama vision), retrying / refreshing as needed
  8. Scrape the "Goods" tenders table (20 rows/page):
       - For each row, ask Ollama whether it's relevant to Meril Diagno
       - Relevant rows are upserted into MySQL (open_tender_details) and
         written to row_data_karnataka.csv; irrelevant ones are logged/CSV'd
         but not inserted
       - Click "next" page and repeat until the next button is disabled

Usage:
    python karnataka_scrapper.py
"""

import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

import mysql.connector
from playwright.sync_api import sync_playwright

# ── Captcha solver import (kar_captcha_solver.py lives in captcha_solver/) ──────
CAPTCHA_SOLVER_DIR = Path(r"C:\Users\Administrator\Desktop\participated_tenders\captcha_solver")
sys.path.insert(0, str(CAPTCHA_SOLVER_DIR))
from kar_captcha_solver import solve_with_ollama  # noqa: E402

# ── Configuration ──────────────────────────────────────────────────────────────
BASE_URL = "https://kppp.karnataka.gov.in/#/portal/portal-home"
STATE_NAME = "Karnataka"
CAPTCHA_SCREENSHOT_PATH = CAPTCHA_SOLVER_DIR / "kar_live_captcha.png"
OUTPUT_FILE = "row_data_karnataka.csv"

CSV_HEADERS = [
    "division", "s_no", "organisation_name", "location", "tender_refno", "tender_title",
    "type", "estimated_value", "nit_published_date", "bid_closure_date",
    "filter_status", "filter_reason",
]

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

BROWSER_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disk-cache-size=0",
    "--aggressive-cache-discard",
    "--disable-application-cache",
    "--disable-blink-features=AutomationControlled",
]


def log(msg: str):
    """Print timestamped log message. Falls back to ASCII-safe output if the
    console encoding can't represent a character (e.g. Kannada text)."""
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"  [{ts}] {msg}"
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", errors="replace").decode("ascii"), flush=True)


# ══════════════════════════════════════════════════════════════════════════════
# RELEVANCY FILTER (Ollama LLM) — same approach as cppp_states_diagno_scraper.py
# ══════════════════════════════════════════════════════════════════════════════

OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL    = "gpt-oss:120b-cloud"

_SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
_PARENT_DIR   = os.path.dirname(_SCRIPT_DIR)  # .../OPEN SCRAPPER/scrapper


def _load_diagno_categories() -> str:
    path = os.path.join(_PARENT_DIR, "diagno_product_category.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            cats = json.load(f)
        return "\n".join(f"  • {c}" for c in cats)
    except Exception as e:
        log(f"[WARN] Could not load diagno_product_category.json: {e}")
        return "  (category list unavailable)"


_DIAGNO_CATEGORIES = _load_diagno_categories()

MERIL_DIAGNO_PRODUCTS = f"""
Meril Diagno sells ONLY these In-Vitro Diagnostic products:

ANALYZERS:
  Hematology   : CelQuant Edge (3-Part, 60T/hr), CelQuant 3i (3-Part),
                 CelQuant 5 Plus (5-Part differential, 60T/hr, with/without autoloader)
  Biochemistry : CliniQuant Micro (Semi-Auto, 6 wavelengths, 100 channels),
                 CliniQuant PRO (Fully Auto discrete),
                 AutoQuant 100 (120T/hr), AutoQuant 200 (240T/hr),
                 AutoQuant 400 (400T/hr), AutoQuant 800, AutoQuant 1200
  Immunoassay  : Merilyzer LumiQuant (e-CLIA, 86T/hr),
                 Merilyzer FloQuant (Fluorescence Immunoassay, portable)
  HbA1c / HPLC : GluQuant A1c (HPLC, 24 samples/hr, IFCC/NGSP certified)
  Other        : ELISA Plate Reader (semi-auto), ELISA Plate Washer,
                 Electrolyte Analyzer (ISE), Specific Protein Analyzer,
                 Coagulation Analyzer (ClotQuant 2/4)

RAPID / ELISA KITS:
  HIV     : HIV Rapid (4th Gen, Flow Through)
  HCV     : MERISCREEN HCV Rapid (Flow Through, 10/50 Tests), HCV ELISA (3rd & 4th Gen)
  HBsAg   : HBsAg ELISA (96 Well, Quantitative)
  Dengue  : Dengue NS1 ELISA (46 Wells or 96 Wells), Dengue IgG ELISA, Dengue IgM ELISA
  Malaria : Malaria PAN ELISA — pLDH (96 Tests or 30 Tests)
  TFT     : TSH ELISA, T3 ELISA, T4 ELISA
  Other   : Sickle Cell Test Kit, Sickle Cell Reagents

REAGENTS:
  Hematology  : CelQuant 3/3i/5+ Reagents (Diluent, Lyse reagents, Controls)
  Biochemistry: AQ 100/200/400 reagents — Amylase, ALT, AST, Bilirubin, Creatinine,
                Glucose, Urea, Uric Acid, Cholesterol, Triglycerides, CRP, LDH, etc.
  Immunoassay : FloQuant reagents — Vitamin D, Ferritin, TSH, T3, T4, FT3, FT4,
                Anti-CCP, CK-MB, Total IgE, RF, ASO, HbA1c, D-Dimer
  Coagulation : PT/INR and APTT reagents (ClotQuant)
  HbA1c       : GluQuant A1c reagent kit (HPLC based)

SYSTEM PACKS:
  AQ 100 System Pack, AQ 200 System Pack, AQ 400 System Pack
  (bundled reagent kits for AutoQuant biochemistry analyzers)

PRODUCT CATEGORIES (tender must match at least one of these to be relevant):
{_DIAGNO_CATEGORIES}

Meril does NOT sell:
  X-ray / MRI / CT / Ultrasound machines, ventilators, oxygen concentrators,
  general pharmaceuticals, hospital furniture, civil/construction/infrastructure work,
  IT/software, uniforms, stationery, food items, gloves, masks, swabs,
  industrial chemicals, or any non-IVD medical products.
"""

FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd (Diagno Division).

Your ONLY job: decide whether a government tender is worth pursuing — does it ask
for products that Meril Diagno actually sells?

{MERIL_DIAGNO_PRODUCTS}

DECISION RULES:
1. If the title clearly mentions ANY of our products above → "Yes".
2. If the tender is from a hospital / lab / health dept AND the title is vague
   ("medical consumables", "lab equipment", "hospital supplies", "diagnostic items") → "Doubt".
3. If you are unsure whether it matches → "Doubt".
4. Return "No" ONLY when you are 100% certain it has nothing to do with
   diagnostic analyzers, reagents, rapid test kits, or IVD.

CRITICAL: "Yes" and "Doubt" both proceed to review — use "Doubt" freely.
          Only "No" drops the tender entirely.
          A missed relevant tender is a business loss.

Return ONLY valid JSON — no text outside the JSON.

Format:
{{
  "decision": "Yes" | "Doubt" | "No",
  "reason": "<one sentence: what the tender is for and why>",
  "category": "<most likely Meril product, e.g. Hematology Analyzer / HbA1c Reagent / Dengue ELISA, or null>"
}}"""


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


def _ollama_call(messages: list) -> str:
    payload = json.dumps({
        "model": OLLAMA_MODEL, "messages": messages,
        "stream": False, "options": {"temperature": 0},
    }).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_CHAT_URL, data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("message", {}).get("content", "").strip()


def _build_filter_message(row: dict) -> str:
    lines = [
        "Please evaluate whether this tender is relevant for Meril Life Sciences:",
        "",
        f"Tender Reference : {row['tender_refno']}",
        f"Organisation     : {row['organisation_name']}",
        f"Location         : {row['location']}",
        f"Title            : {row['tender_title']}",
        f"Type             : {row['type']}",
        f"Estimated Value  : {row['estimated_value']}",
        "",
        "Return ONLY the JSON decision object as specified in the system prompt.",
    ]
    return "\n".join(lines)


def _ask_llm(row: dict) -> dict:
    messages = [
        {"role": "system", "content": FILTER_SYSTEM_PROMPT},
        {"role": "user",   "content": _build_filter_message(row)},
    ]
    for attempt in range(1, 4):
        try:
            raw = _ollama_call(messages)
            if not raw:
                log(f"    [FILTER/LLM] Empty response (attempt {attempt}) — waiting...")
                time.sleep(10 * attempt)
                continue
            result = _parse_json(raw)
            if result and isinstance(result, dict) and "decision" in result:
                return result
            log(f"    [FILTER/LLM] Bad JSON (attempt {attempt}): {raw[:120]}")
            time.sleep(3)
        except urllib.error.URLError as e:
            log(f"    [FILTER/LLM] Ollama unreachable (attempt {attempt}): {e}")
            time.sleep(10)
        except Exception as e:
            log(f"    [FILTER/LLM] Attempt {attempt}/3 failed: {e}")
            time.sleep(5)
    log("    [FILTER/LLM] All attempts failed — defaulting to Doubt (safe)")
    return {"decision": "Doubt", "reason": "LLM unavailable — marked relevant for safety."}


def filter_tender(row: dict) -> tuple:
    """Returns (status, reason). status: 'proceed_futher' | 'no'"""
    combined_lower = f"{row['tender_title']} {row['organisation_name']}".lower()

    elec_signals = [
        "rdss", "substation", "33/11 kv", "11/33 kv", "33 kv", "11 kv",
        "mv line", "lt line", "ht line", "power distribution", "electricity supply",
        "distribution transformer", "power transformer", "feeder pillar",
        "bijli corporation", "vidyut vitran", "electricity board",
    ]
    matched_elec = next((s for s in elec_signals if s in combined_lower), None)
    if matched_elec:
        reason = f"Hard-reject: electrical/power-infra signal '{matched_elec}' — not a Meril product."
        log(f"    [FILTER] HARD-REJECT (elec: {matched_elec})")
        return "no", reason

    log(f"    [FILTER] -> Ollama: {row['tender_title'][:80]}")
    result = _ask_llm(row)

    decision = result.get("decision", "Doubt").strip()
    reason   = result.get("reason", "No reason provided.")
    cat_tag  = result.get("category")
    if cat_tag:
        reason = f"{reason}  [Category: {cat_tag}]"

    if decision == "No":
        log(f"    [FILTER] SKIP (LLM: No) — {reason}")
        return "no", reason
    else:
        log(f"    [FILTER] RELEVANT (LLM: {decision}) — {reason}")
        return "proceed_futher", reason


# ── Database ───────────────────────────────────────────────────────────────────
def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


def upsert_tender(conn, record):
    cursor = conn.cursor()
    sql = """
        INSERT INTO open_tender_details
            (state, organisation_name, e_published_date, closing_date,
             opening_date, tender_title, tender_refno, tender_id,
             organisation_chain, tender_details, file_link,
             relevency_checker, relevancy_reason, suggested_product, dept)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            organisation_name  = VALUES(organisation_name),
            e_published_date   = VALUES(e_published_date),
            closing_date       = VALUES(closing_date),
            tender_title       = VALUES(tender_title),
            organisation_chain = VALUES(organisation_chain),
            tender_details     = VALUES(tender_details),
            relevency_checker  = VALUES(relevency_checker),
            relevancy_reason   = VALUES(relevancy_reason),
            dept               = VALUES(dept),
            updated_at         = CURRENT_TIMESTAMP
    """
    try:
        cursor.execute(sql, (
            record.get("state"), record.get("organisation_name"),
            record.get("e_published_date"), record.get("closing_date"),
            record.get("opening_date"), record.get("tender_title"),
            record.get("tender_refno"), record.get("tender_id"),
            record.get("organisation_chain"), record.get("tender_details"),
            record.get("file_link"), record.get("relevency_checker", "not_processed"),
            record.get("relevancy_reason"), record.get("suggested_product"),
            record.get("dept"),
        ))
        conn.commit()
    except Exception as e:
        log(f"    [DB ERROR] {e} | Ref: {record.get('tender_refno')}")
        conn.rollback()
    finally:
        cursor.close()


# ── CSV ────────────────────────────────────────────────────────────────────────
def init_csv(output_file: str):
    if not os.path.exists(output_file):
        with open(output_file, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(CSV_HEADERS)
        log(f"[INIT] Created {output_file}")


def append_csv(output_file: str, rows: list):
    with open(output_file, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)


# ── Tender table scraping (shared across Goods / Works / Services tabs) ────────
DIVISIONS = ["Goods", "Works", "Services"]  # tab label -> table id (lowercased)


def switch_division_tab(page, division: str):
    """Click the Goods/Works/Services tab and wait for its table to render."""
    tab = page.locator("ul#nav-bar-tab a.nav-link", has_text=division)
    tab.wait_for(state="visible", timeout=15000)
    tab.click()
    time.sleep(3)
    table_id = division.lower()
    page.wait_for_selector(f"table#{table_id}", timeout=25000)


# Column header label -> our field name. The Works table inserts extra
# columns ("Sub Category", "Tender Type") that Goods/Services don't have, so
# rows must be read by header label, not fixed position.
HEADER_FIELD_MAP = {
    "s.no":                              "s_no",
    "procuring entity":                  "organisation_name",
    "location":                          "location",
    "tender number":                     "tender_refno",
    "tender name":                       "tender_title",
    "type":                              "type",
    "estimated value":                   "estimated_value",
    "nit published date":                "nit_published_date",
    "last date & time for bid closure":  "bid_closure_date",
    "sub category":                      "sub_category",
    "tender type":                       "tender_type",
}


def get_column_map(page, table_id: str) -> dict:
    """Map our field names to column index using the table's own header
    row, so extra columns (e.g. Works' 'Sub Category'/'Tender Type') don't
    shift the other fields."""
    headers = page.locator(f"table#{table_id} thead th")
    col_map = {}
    for i in range(headers.count()):
        label = headers.nth(i).inner_text().strip().lower().replace("\n", " ")
        label = " ".join(label.split())
        field = HEADER_FIELD_MAP.get(label)
        if field:
            col_map[field] = i
    return col_map


def scrape_tender_row(row, col_map: dict) -> dict:
    tds = row.locator("td")
    data = {}
    for field, idx in col_map.items():
        data[field] = tds.nth(idx).inner_text().strip()
    # Fields every division's table has; default to "" if somehow missing
    for required in ("s_no", "organisation_name", "location", "tender_refno",
                     "tender_title", "type", "estimated_value",
                     "nit_published_date", "bid_closure_date"):
        data.setdefault(required, "")
    return data


def go_to_next_tender_page(page, division: str) -> bool:
    """Click the pagination-next control for the given division's table.
    Returns False (and does not click) once the control is disabled —
    i.e. last page."""
    pagination_id = f"pagination{division.lower()}"
    next_li = page.locator(f"pagination#{pagination_id} li.pagination-next")
    if next_li.count() == 0:
        return False
    classes = next_li.first.get_attribute("class") or ""
    if "disabled" in classes:
        return False
    next_li.first.locator("a").first.click()
    time.sleep(3)
    return True


def scrape_all_pages_for_division(page, conn, division: str) -> list:
    """Iterate every page of the given division's (Goods/Works/Services)
    tenders table, filtering each tender via Ollama and inserting relevant
    ones into the DB, until the 'next' pagination control is disabled
    (last page)."""
    table_id = division.lower()
    all_rows = []
    page_num = 1
    saved, skipped = 0, 0
    col_map = get_column_map(page, table_id)

    while True:
        page.wait_for_selector(f"table#{table_id} tbody tr", timeout=25000)
        rows_loc = page.locator(f"table#{table_id} tbody tr")
        row_count = rows_loc.count()
        log(f"[{division.upper()} PAGE {page_num}] {row_count} tenders found")

        row_data = [scrape_tender_row(rows_loc.nth(i), col_map) for i in range(row_count)]
        for data in row_data:
            data["division"] = division

        for data in row_data:
            try:
                f_status, f_reason = filter_tender(data)

                all_rows.append([
                    division, data["s_no"], data["organisation_name"], data["location"],
                    data["tender_refno"], data["tender_title"], data["type"],
                    data["estimated_value"], data["nit_published_date"],
                    data["bid_closure_date"], f_status, f_reason,
                ])

                if f_status == "no":
                    skipped += 1
                    continue

                if conn:
                    record = {
                        "state":              STATE_NAME,
                        "organisation_name":  data["organisation_name"],
                        "e_published_date":   data["nit_published_date"],
                        "closing_date":       data["bid_closure_date"],
                        "opening_date":       None,
                        "tender_title":       data["tender_title"],
                        "tender_refno":       data["tender_refno"],
                        "tender_id":          f"{data['tender_refno']}_{division}",
                        "organisation_chain": f"{data['organisation_name']} ({data['location']})",
                        "tender_details":     json.dumps(data, ensure_ascii=False),
                        "file_link":          None,
                        "relevency_checker":  f_status,
                        "relevancy_reason":   f_reason,
                        "dept":               "diagno",
                    }
                    upsert_tender(conn, record)
                saved += 1

            except Exception as e:
                log(f"    [SKIP] {data.get('tender_refno', '?')}: {e}")

        log(f"[{division.upper()} PAGE {page_num}] done (saved={saved} skipped={skipped})")

        if not go_to_next_tender_page(page, division):
            log(f"[PAGINATION] '{division}' Next button disabled — reached the last page.")
            break
        page_num += 1

    return all_rows


def scrape_all_divisions(page, conn) -> list:
    """Scrape Goods, then Works, then Services — switching tabs between
    each and paginating each division's table to the end."""
    all_rows = []
    for division in DIVISIONS:
        log(f"[DIVISION] Switching to '{division}' tab...")
        switch_division_tab(page, division)
        rows = scrape_all_pages_for_division(page, conn, division)
        all_rows.extend(rows)
        log(f"[DIVISION] '{division}' complete: {len(rows)} tenders processed.")
    return all_rows


def run(playwright):
    """Main scraper runner."""
    init_csv(OUTPUT_FILE)
    conn = None
    try:
        conn = get_db_connection()
        log("MySQL connected.")
    except Exception as e:
        log(f"[DB ERROR] {e} — CSV only")

    browser = playwright.chromium.launch(
        headless=False,
        args=BROWSER_ARGS,
    )

    context = browser.new_context(
        viewport={"width": 1280, "height": 900},
        locale="en-US",
        ignore_https_errors=True,
        java_script_enabled=True,
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
    )

    page = context.new_page()
    page.set_default_timeout(60000)

    def handle_dialog(dialog):
        log(f"[Dialog] {dialog.type!r}: {dialog.message[:120]!r}")
        dialog.accept()

    page.on("dialog", handle_dialog)

    try:
        # Step 1: Open site
        log("[STEP 1] Opening site: " + BASE_URL)
        page.goto(BASE_URL, timeout=60000, wait_until="domcontentloaded")

        # Step 2: Wait 3 seconds for page load
        log("[STEP 2] Waiting 3 seconds for page load...")
        time.sleep(3)

        # Step 3: Switch language to English
        log("[STEP 3] Switching language to English...")
        english_toggle = page.locator("div.language.language-ka").filter(has_text="English")
        english_toggle.wait_for(state="visible", timeout=15000)
        english_toggle.click()
        log("[STEP 3] Clicked English language toggle")

        # Step 4: Wait 3 seconds for page load
        log("[STEP 4] Waiting 3 seconds for page load...")
        time.sleep(3)

        # Step 5: Click "Live Tenders" card
        log("[STEP 5] Clicking 'Live Tenders' card...")
        live_tenders_card = page.locator("span.cardTitle").filter(has_text="Live Tenders")
        live_tenders_card.wait_for(state="visible", timeout=15000)
        live_tenders_card.click()
        log("[STEP 5] Clicked 'Live Tenders' card")

        # Step 6: Wait 3 seconds for redirect
        log("[STEP 6] Waiting 3 seconds for redirect to live tenders page...")
        time.sleep(3)

        log(f"[STEP 6] Current URL: {page.url}")
        log("[INFO] Reached the live tenders listing page.")

        # Steps 7-10: Solve the captcha. One attempt per captcha — if the
        # site rejects it, refresh the page for a brand new captcha and try
        # again, repeating until it's solved (capped as a safety net).
        max_rounds = 50  # safety cap: 50 fresh captchas before giving up
        solved = False
        round_num = 0

        while not solved and round_num < max_rounds:
            round_num += 1

            if round_num > 1:
                log(f"[STEP 7] Round {round_num}: refreshing page for a new captcha...")
                page.reload(wait_until="domcontentloaded")
                time.sleep(3)

            captcha_canvas = page.locator("canvas#captcahCanvas")
            captcha_input = page.locator("div.captcha-actions input[type='text']")
            check_button = page.locator("div.captcha-actions input[type='button'][value='Check']")
            error_msg = page.locator("text=Please Enter correct Captcha")

            log(f"[STEP 7] Round {round_num}: screenshotting captcha canvas...")
            captcha_canvas.wait_for(state="visible", timeout=15000)
            captcha_canvas.screenshot(path=str(CAPTCHA_SCREENSHOT_PATH))

            log("[STEP 8] Solving captcha with Ollama...")
            try:
                captcha_text = solve_with_ollama(CAPTCHA_SCREENSHOT_PATH)
            except Exception as ollama_err:
                log(f"[STEP 8] Ollama request failed ({ollama_err}) — treating as a "
                    f"failed attempt, refreshing for a new captcha...")
                captcha_text = ""

            # Delete the screenshot immediately - it must never persist on disk
            try:
                CAPTCHA_SCREENSHOT_PATH.unlink(missing_ok=True)
            except Exception as cleanup_err:
                log(f"[WARN] Could not delete captcha screenshot: {cleanup_err}")

            if not captcha_text:
                time.sleep(3)  # brief backoff before the next fresh captcha
                continue

            log(f"[STEP 8] Captcha solved as: '{captcha_text}'")

            log("[STEP 9] Typing captcha text into input field...")
            captcha_input.wait_for(state="visible", timeout=15000)
            captcha_input.fill(captcha_text)

            log("[STEP 10] Clicking 'Check' button...")
            check_button.wait_for(state="visible", timeout=15000)
            check_button.click()

            log("[INFO] Waiting for captcha validation...")
            time.sleep(3)

            if error_msg.count() > 0 and error_msg.first.is_visible():
                log(f"[STEP 10] Captcha rejected ('{captcha_text}' was wrong). "
                    f"Refreshing for a new captcha...")
                continue

            log(f"[STEP 10] Captcha accepted: '{captcha_text}'")
            solved = True

        if not solved:
            log(f"[WARN] Captcha not solved after {max_rounds} fresh captchas.")
            raise RuntimeError("Could not pass captcha gate")

        # Step 11: Scrape Goods, then Works, then Services (all pages each)
        log("[STEP 11] Scraping Goods / Works / Services tenders (all pages)...")
        rows = scrape_all_divisions(page, conn)
        if rows:
            append_csv(OUTPUT_FILE, rows)
        log(f"[DONE] Total tenders processed across all divisions: {len(rows)}")

        log("[INFO] Browser will remain open. Press Enter to close...")
        try:
            input()
        except EOFError:
            pass

    except Exception as e:
        log(f"[ERROR] {str(e)[:200]}")
        log("[INFO] Browser will remain open. Press Enter to close...")
        try:
            input()
        except EOFError:
            pass

    finally:
        # Safety net: make sure no captcha screenshot is ever left on disk
        try:
            CAPTCHA_SCREENSHOT_PATH.unlink(missing_ok=True)
        except Exception:
            pass

        if conn:
            try:
                conn.close()
            except Exception:
                pass

        try:
            context.close()
            browser.close()
        except Exception:
            pass


# ── Entry point ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)

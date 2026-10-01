#!/usr/bin/env python3
"""
cppp_state_organ_open_scrapper.py — CPPP State + Organisation Active Tenders Scraper

Unlike the keyword-based scrapers, this one drives the "Active Tenders" search
form purely via the State + Organisation dropdowns (no keyword typed):

Flow per (state, organisation) pair:
  1. Open the search page
  2. Select State (triggers an AJAX call that populates the Organisation dropdown)
  3. Wait 3-5s for the Organisation dropdown to populate
  4. Select Organisation
  5. Wait ~3s
  6. Solve captcha (via Ollama vision model screenshot OCR) → Search
  7. Capture results table
  8. Click each tender detail link
  9. Follow to NICGEP page for deep extraction + document downloads
  10. Send {Title + Work Description + Tender Documents} to Ollama → mark relevant
  11. Move to next tender / next page / next (state, organisation) pair
  12. Insert into the same `open_tender_details` table used by the other CPPP scrapers
"""

import os
import re
import csv
import base64
import json
import time
import signal
import sys
import zipfile
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import mysql.connector

# ── Configuration ──────────────────────────────────────────────────────────────
SCRAPER_NAME = "cppp_state_organ_open"
STATES_URL   = "https://eprocure.gov.in/cppp/latestactivetendersnew/mmpdata"

# Master list of every (state, organisation) pair to scrape, one row per pair.
STATE_ORG_CSV = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "all_states_organisations_master.csv"
)

# Tracks which pairs have already been completed, so a stopped/crashed run
# can be re-launched and pick up where it left off instead of starting over.
PROGRESS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "cppp_state_organ_open_progress.json"
)

OUTPUT_FILE = "row_data_cppp_state_organ_open.csv"

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

BROWSER_ARGS = [
    "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-extensions", "--disable-background-networking",
    "--disk-cache-size=0", "--aggressive-cache-discard",
    "--disable-application-cache",
    "--disable-blink-features=AutomationControlled",
]

CSV_HEADERS = [
    "state", "organisation", "s_no", "e_published_date", "closing_date",
    "opening_date", "tender_title", "tender_refno", "tender_id", "state_name",
    "filter_status", "filter_reason",
]

# ── Globals ────────────────────────────────────────────────────────────────────
_EXIT  = False
_stats = {
    "records_saved": 0, "records_skipped": 0,
    "current_item": "—", "items_done": 0, "total_items": 0,
}

# ══════════════════════════════════════════════════════════════════════════════
# RELEVANCY FILTER  (Ollama LLM)
# ══════════════════════════════════════════════════════════════════════════════

OLLAMA_URL   = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL = "gpt-oss:120b-cloud"

_SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(_SCRIPT_DIR, "tender_documents")

MERIL_ALL_PRODUCTS = """
Meril Life Sciences sells products from TWO divisions:

════════════════════════════════
DIVISION 1 — ENDO (Endosurgery)
════════════════════════════════

SUTURES:
  Absorbable     : Chromic Catgut, Plain Catgut, Polyglactin 910 (Vicryl),
                   Polyglycolic Acid (PGA), Poliglecaprone (Monocryl), Polydioxanone (PDS)
  Non-Absorbable : Polypropylene (Prolene), Polyamide (Nylon/Ethilon),
                   Polyester, Silk, Steel Wire

SURGICAL MESHES:
  Flat PP Mesh       : Filaprop / Aspiron (sizes 6x11cm to 30x30cm, 100 gsm, pore 1.0x1.2mm)
  3D Anatomical PP   : Filaprop 3D (M/L/XL, Left/Right variants, pore 1.0x1.5mm)
  Composite Mesh     : Absomesh (PP + Polyglecaprone, partially absorbable, 88 gsm)
  Polyester 3D       : Mericron Mesh (sizes 6x11cm to 30x30cm)
  PE+PU Anatomical   : Contacto Mesh (11x15cm, 12x16cm, 15x15cm)

MESH FIXATION (Tack Systems):
  Profound A : Absorbable PGLA tacks (15 or 30 tacks per device)
  Profound N : Non-absorbable Titanium tacks (15 or 30 tacks)
  i-Tack N   : Powered tacker, Titanium, push-button, tack counter (15/30 tacks)
  i-Tack A   : Powered tacker, PGLA absorbable (15/30 tacks), 5mm diameter, 36cm cannula

OTHER SURGICAL PRODUCTS:
  Surgical Staplers & Cartridges : Linear, Circular, Endo Staplers; Staple Reloads
  Laparoscopic Clips & Applicators : Clip applicators, Ligaclip, Hem-o-lok
  Trocars & Cannulas : 5mm, 10mm, 12mm
  Energy Devices     : Ultrasonic / Laser vessel sealers (harmonic, ligasure type)
  IUDs / IUCDs       : Intrauterine Devices — Copper & Hormonal types
  Surgical Glue      : Tissue Adhesive / Cyanoacrylate glue / Wound closure
  Biosurgicals       : Haemostatic agents, fibrin sealants, surgical sealants
  Surgical Kits      : CABG kit, Hernia kit, Gynaecology kit
  Skin Staplers      : Skin closure / Skin stapler devices
  Tourniquet         : Clutch tourniquet (L/M/XL sizes)

════════════════════════════════
DIVISION 2 — DIAGNO (Diagnostics / IVD)
════════════════════════════════

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

════════════════════════════════
Meril does NOT sell:
  Waterproofing mesh, geo-textile, shade net, construction mesh, road/dam/irrigation mesh,
  civil/construction/infrastructure work, X-ray / MRI / CT / Ultrasound machines,
  ventilators, oxygen concentrators, general pharmaceuticals, hospital furniture,
  IT/software, uniforms, stationery, food items, gloves, masks, swabs,
  industrial chemicals, or any non-medical products.
  NOTE: "mesh" in a construction/civil/waterproofing context is NOT our product.
"""

FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd.

Your ONLY job: decide whether a government tender is worth pursuing — does it ask
for products that Meril sells, and if so, which division?

{MERIL_ALL_PRODUCTS}

DECISION RULES:
1. If the title / work description clearly mentions Endo OR surgical products (sutures, mesh, stapler, trocar, IUD, clip, sealant) → "Yes", dept "Endo".
2. If it clearly mentions Diagno / IVD products (hematology analyzer, biochemistry reagent, ELISA kit, HbA1c, rapid test) → "Yes", dept "Diagno".
3. If it mentions BOTH Endo and Diagno products (e.g., "medical consumables for OT and lab") → "Yes", dept "Both".
4. If the tender is from a hospital / lab / surgical dept AND the title is vague ("surgical consumables", "OT supplies", "lab equipment", "medical consumables") → "Doubt".
5. If you are unsure whether it matches either division → "Doubt", dept "Unknown".
6. "mesh" or "stapler" in a CONSTRUCTION / CIVIL / IRRIGATION / WATERPROOFING context → "No".
7. Return "No" ONLY when you are 100% certain the tender has nothing to do with any Meril product.

CRITICAL: "Yes" and "Doubt" both proceed to review — use "Doubt" freely.
          Only "No" drops the tender entirely.
          A missed relevant tender is a business loss.

Return ONLY valid JSON — no text outside the JSON.

Format:
{{
  "decision": "Yes" | "Doubt" | "No",
  "reason": "<one sentence: what the tender is for and why>",
  "dept": "Endo" | "Diagno" | "Both" | "Unknown" | null,
  "category": "<most likely Meril product, e.g. Suture / Hematology Analyzer / Dengue ELISA, or null>"
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
        OLLAMA_URL, data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("message", {}).get("content", "").strip()


def _build_filter_message(title: str, org: str, state: str, refno: str,
                          tid: str, details: dict, doc_urls: list,
                          search_label: str) -> str:
    lines = [
        f'This tender was found via: {search_label}',
        "Please evaluate whether it is relevant for Meril Life Sciences:",
        "",
        f"Tender Reference : {refno or tid or 'N/A'}",
        f"Organisation     : {org}",
        f"State            : {state}",
        f"Title            : {title}",
    ]
    work_desc = details.get("Work Description", "").strip()
    if work_desc:
        lines += ["", f"Work Description : {work_desc[:600]}"]
    if doc_urls:
        lines += ["", "Tender Documents :"]
        for url in doc_urls[:5]:
            lines.append(f"  - {url}")
    useful_keys = [
        "Product Category", "Product Sub-Category", "Tender Category",
        "Tender Type", "Form Of Contract",
        "Organisation Name", "Organisation Type",
        "No. of Covers", "Payment Mode",
    ]
    detail_lines = []
    for k in useful_keys:
        v = details.get(k)
        if v and str(v).strip() and k != "Work Description":
            detail_lines.append(f"  {k}: {str(v).strip()[:300]}")
    if detail_lines:
        lines += ["", "Other Fields:"]
        lines += detail_lines
    lines += ["", "Return ONLY the JSON decision object as specified in the system prompt."]
    return "\n".join(lines)


def _ask_llm(title: str, org: str, state: str, refno: str, tid: str,
             details: dict, doc_urls: list, search_label: str) -> dict:
    messages = [
        {"role": "system", "content": FILTER_SYSTEM_PROMPT},
        {"role": "user",   "content": _build_filter_message(
            title, org, state, refno, tid, details, doc_urls, search_label)},
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


def filter_tender(title: str, org: str, state: str, refno: str, tid: str,
                  details: dict, doc_urls: list,
                  search_label: str) -> tuple[str, str, str | None]:
    """
    Returns (status, reason, llm_dept).
    status : 'proceed_futher' | 'no'
    llm_dept: 'Endo'|'Diagno'|'Both'|'Unknown'|None
    """
    combined_lower = f"{title} {org}".lower()
    detail_text = " ".join(
        str(v) for k, v in details.items()
        if k in ("Product Category", "Product Sub-Category", "Work Description",
                 "Tender Category", "Tender Type") and v
    )
    combined_lower += f" {detail_text}".lower()

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
        return "no", reason, None

    log(f"    [FILTER] → Ollama ({search_label})")
    result = _ask_llm(title, org, state, refno, tid, details, doc_urls, search_label)

    decision = result.get("decision", "Doubt").strip()
    reason   = result.get("reason", "No reason provided.")
    dept_tag = result.get("dept")
    cat_tag  = result.get("category")
    if dept_tag or cat_tag:
        parts = []
        if dept_tag: parts.append(f"Dept: {dept_tag}")
        if cat_tag:  parts.append(f"Category: {cat_tag}")
        reason = f"{reason}  [{', '.join(parts)}]"

    if decision == "No":
        log(f"    [FILTER] SKIP (LLM: No) — {reason}")
        return "no", reason, dept_tag
    else:
        log(f"    [FILTER] RELEVANT (LLM: {decision}) — {reason}")
        return "proceed_futher", reason, dept_tag


# ── Logging ────────────────────────────────────────────────────────────────────
def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── Database ───────────────────────────────────────────────────────────────────

NICGEP_FIELD_MAP = {
    "withdrawal_allowed":                    "Withdrawal Allowed",
    "tender_type":                           "Tender Type",
    "form_of_contract":                      "Form Of Contract",
    "tender_category":                       "Tender Category",
    "no_of_covers":                          "No. of Covers",
    "general_technical_evaluation_allowed":  "General Technical Evaluation Allowed",
    "itemwise_technical_evaluation_allowed": "ItemWise Technical Evaluation Allowed",
    "payment_mode":                          "Payment Mode",
    "multi_currency_allowed_boq":            "Is Multi Currency Allowed For BOQ",
    "multi_currency_allowed_fee":            "Is Multi Currency Allowed For Fee",
    "two_stage_bidding_allowed":              "Allow Two Stage Bidding",
    "emd_amount":                            "EMD Amount in ₹",
    "work_item_title":                       "Title",
    "work_description":                     "Work Description",
    "nda_pre_qualification":                 "NDA/Pre Qualification",
    "independent_external_monitor_remarks":  "Independent External Monitor/Remarks",
    "tender_value":                          "Tender Value in ₹",
    "product_category":                      "Product Category",
    "sub_category":                          "Sub category",
    "contract_type":                         "Contract Type",
    "bid_validity_days":                     "Bid Validity(Days)",
    "period_of_work_days":                   "Period Of Work(Days)",
    "location":                              "Location",
    "pincode":                               "Pincode",
    "pre_bid_meeting_place":                 "Pre Bid Meeting Place",
    "pre_bid_meeting_address":               "Pre Bid Meeting Address",
    "pre_bid_meeting_date":                  "Pre Bid Meeting Date",
    "bid_opening_place":                     "Bid Opening Place",
    "nda_tender_allowed":                    "Should Allow NDA Tender",
    "preferential_bidder_allowed":           "Allow Preferential Bidder",
    "nicgep_published_date":                 "Published Date",
    "bid_opening_date":                      "Bid Opening Date",
    "doc_download_start_date":               "Document Download / Sale Start Date",
    "doc_download_end_date":                 "Document Download / Sale End Date",
    "clarification_start_date":              "Clarification Start Date",
    "clarification_end_date":                "Clarification End Date",
    "bid_submission_start_date":             "Bid Submission Start Date",
    "bid_submission_end_date":               "Bid Submission End Date",
}


def extract_nicgep_fields(details: dict) -> dict:
    return {col: details.get(label) for col, label in NICGEP_FIELD_MAP.items()}


def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


def upsert_tender(conn, record):
    cursor = conn.cursor()
    nicgep_cols = list(NICGEP_FIELD_MAP.keys())
    sql = f"""
        INSERT INTO open_tender_details
            (state, organisation_name, e_published_date, closing_date,
             opening_date, tender_title, tender_refno, tender_id,
             organisation_chain, tender_details, file_link, tender_page_link,
             tender_site_link,
             relevency_checker, relevancy_reason, suggested_product, dept,
             downloaded_documents, searched_keyword, found_date, corrigendum,
             {", ".join(nicgep_cols)})
        VALUES ({", ".join(["%s"] * (21 + len(nicgep_cols)))})
        ON DUPLICATE KEY UPDATE
            state = VALUES(state), organisation_name = VALUES(organisation_name),
            e_published_date = VALUES(e_published_date),
            closing_date = VALUES(closing_date),
            opening_date = VALUES(opening_date),
            tender_title = VALUES(tender_title),
            tender_refno = VALUES(tender_refno),
            organisation_chain = VALUES(organisation_chain),
            tender_details = VALUES(tender_details),
            file_link = VALUES(file_link), tender_page_link = VALUES(tender_page_link),
            tender_site_link = VALUES(tender_site_link),
            dept = VALUES(dept),
            downloaded_documents = VALUES(downloaded_documents),
            searched_keyword = VALUES(searched_keyword),
            corrigendum = VALUES(corrigendum),
            {", ".join(f"{c} = VALUES({c})" for c in nicgep_cols)},
            updated_at = CURRENT_TIMESTAMP
    """
    try:
        cursor.execute(sql, (
            record.get("state"), record.get("organisation_name"),
            record.get("e_published_date"), record.get("closing_date"),
            record.get("opening_date"), record.get("tender_title"),
            record.get("tender_refno"), record.get("tender_id"),
            record.get("organisation_chain"), record.get("tender_details"),
            record.get("file_link"), record.get("tender_page_link"),
            record.get("tender_site_link"),
            record.get("relevency_checker", "not_processed"),
            record.get("relevancy_reason"), record.get("suggested_product"),
            record.get("dept"),
            record.get("downloaded_documents"),
            record.get("searched_keyword"), record.get("found_date"),
            record.get("corrigendum"),
            *[record.get(c) for c in nicgep_cols],
        ))
        conn.commit()
        _stats["records_saved"] += 1
    except Exception as e:
        log(f"[DB ERROR] {e} | ID: {record.get('tender_id')}")
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


def load_state_org_list(csv_path: str) -> list:
    """Load every {state, org} pair from the master CSV (State Name, Organisation Name)."""
    pairs = []
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            if len(row) < 2:
                continue
            state, org = row[0].strip(), row[1].strip()
            if state and org:
                pairs.append({"state": state, "org": org})
    return pairs


def load_progress() -> set:
    """Set of 'state||org' keys already completed in a previous run."""
    if not os.path.exists(PROGRESS_FILE):
        return set()
    try:
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            return set(json.load(f))
    except Exception:
        return set()


def mark_progress(done: set, state: str, org: str):
    done.add(f"{state}||{org}")
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted(done), f, ensure_ascii=False, indent=2)


# ── Captcha ────────────────────────────────────────────────────────────────────
def solve_captcha_with_ollama(image_bytes: bytes) -> str:
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    payload = json.dumps({
        "model": "gemma4:31b-cloud",
        "prompt": "This is a CAPTCHA image. Read the characters exactly as they appear, ignoring any noise, dots, or background distortions. Reply with only the captcha characters, nothing else.",
        "images": [image_b64],
        "stream": False
    }).encode("utf-8")

    url = "http://127.0.0.1:11434/api/generate"
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            ans = data.get("response", "").strip()
            ans = re.sub(r'[^a-zA-Z0-9]', '', ans)
            return ans
    except Exception as e:
        log(f"[CAPTCHA ERROR] Ollama request failed: {e}")
        return ""


def read_captcha_answer(page) -> str:
    try:
        img = page.locator('img[data-drupal-selector="edit-captcha-image"]')
        img.wait_for(state="visible", timeout=10000)
        image_bytes = img.screenshot()
        answer = solve_captcha_with_ollama(image_bytes)
        log(f"[CAPTCHA] Answer: '{answer}'")
        return answer
    except Exception as e:
        log(f"[CAPTCHA] Read failed: {e}")
        return ""


def fill_captcha(page) -> bool:
    answer = read_captcha_answer(page)
    if not answer:
        log("[CAPTCHA] No answer")
        return False
    try:
        field = page.locator("input#edit-captcha-response")
        field.wait_for(state="visible", timeout=5000)
        field.fill("")
        field.fill(answer)
        return True
    except Exception as e:
        log(f"[CAPTCHA] Fill error: {e}")
        return False


def _click_submit_button(page) -> bool:
    """Click the Submit control on the tender-detail captcha gate
    (<input data-drupal-selector="edit-save" id="edit-save" type="submit"
    value="Submit">), falling back to any visible submit-type control, then
    to pressing Enter in the captcha response field."""
    candidates = [
        "input#edit-save",
        '[data-drupal-selector="edit-save"]',
        'input[type="submit"]',
        'button[type="submit"]',
    ]
    for sel in candidates:
        btn = page.locator(sel)
        if btn.count() > 0:
            try:
                btn.first.click(timeout=3000)
                return True
            except Exception:
                continue
    try:
        page.locator("input#edit-captcha-response").press("Enter")
        return True
    except Exception:
        return False


def solve_detail_page_captcha_if_present(page, max_retries: int = 3) -> bool:
    """
    Opening a tender's CPPP detail page (the 'tendersfullview/<token>' link
    from the results table) can now land on an intermediate captcha gate
    (form#tenderfullview-tenders, action .../tendersfullviewmmp/...) before
    showing the real detail content (div#tfullview). Same captcha widget as
    the search page (img[data-drupal-selector="edit-captcha-image"] /
    input#edit-captcha-response) — solve it the same way (Ollama vision),
    fill the response field, and click Submit. Returns True if there was no
    such gate, or it was solved and accepted; False if it could not be
    solved/accepted after retries.
    """
    img = page.locator('img[data-drupal-selector="edit-captcha-image"]')
    try:
        img.wait_for(state="visible", timeout=5000)
    except PlaywrightTimeoutError:
        return True  # no second captcha on this page — nothing to do

    for attempt in range(1, max_retries + 1):
        if not fill_captcha(page):
            log(f"  [CAPTCHA-2] Read/fill failed (attempt {attempt}/{max_retries})")
            time.sleep(2)
            continue
        log(f"  [CAPTCHA-2] Solved (attempt {attempt}/{max_retries})")

        _click_submit_button(page)
        time.sleep(3)

        content = page.content().lower()
        if ("the answer you entered for the captcha was not correct" in content
                or "wrong" in content or "invalid captcha" in content):
            log(f"  [CAPTCHA-2] Rejected by server (attempt {attempt}/{max_retries})")
            if img.count() > 0:
                continue
            return False
        return True

    log("  [CAPTCHA-2] Failed after maximum retries.")
    return False


# ── Title cell parser ──────────────────────────────────────────────────────────
def parse_title_cell(td) -> tuple:
    a_el = td.locator("a").first
    if a_el.count() == 0:
        return td.inner_text().strip(), "", "", ""
    title     = a_el.inner_text().strip()
    href      = a_el.get_attribute("href") or ""
    full_text = td.inner_text().strip()
    trailing  = full_text[len(title):].strip().lstrip("/")
    m = re.search(r'(\d{4}_[A-Za-z0-9]+_\d+_\d+)\s*$', trailing)
    if m:
        tender_id = m.group(1)
        refno     = trailing[:m.start()].strip().strip("/").strip()
    else:
        parts     = trailing.rsplit("/", 1)
        tender_id = parts[-1].strip() if parts else trailing
        refno     = parts[0].strip("/").strip() if len(parts) > 1 else ""
    return title, refno, tender_id, href


# ── CPPP detail page ───────────────────────────────────────────────────────────
def scrape_cppp_detail(page) -> dict:
    details = {}
    try:
        page.wait_for_selector("div#tfullview", timeout=15000)
        for table in page.locator("div#tfullview table").all():
            for row in table.locator("tr").all():
                tds = row.locator("td").all()
                n   = len(tds)
                if n == 3:
                    label = tds[0].inner_text().strip().replace(":", "")
                    val_div = tds[2].locator("div.event-dtl")
                    value   = val_div.first.inner_text().strip() if val_div.count() > 0 else tds[2].inner_text().strip()
                    if label:
                        details[label] = value
                elif n == 6:
                    for li, vi in [(0, 2), (3, 5)]:
                        label = tds[li].inner_text().strip().replace(":", "")
                        if label:
                            details[label] = tds[vi].inner_text().strip()
        doc_urls = []
        for lnk in page.locator("div#tfullview a[href]").all():
            href = (lnk.get_attribute("href") or "").strip()
            if href.startswith("http") and "eprocure.gov.in/cppp" not in href:
                doc_urls.append(href)
        details["_doc_urls"] = doc_urls
    except Exception as e:
        log(f"[DETAIL ERROR] {e}")
    return details


# ── NICGEP detail page ─────────────────────────────────────────────────────────
def scrape_nicgep_detail(page) -> dict:
    data = {}
    try:
        for tr in page.locator("tr").all():
            tds = tr.locator("td").all()
            for i in range(len(tds) - 1):
                c = tds[i].get_attribute("class") or ""
                if "td_caption" in c:
                    label = tds[i].inner_text().strip().replace(":", "")
                    if not label: continue
                    for j in range(i+1, len(tds)):
                        nc = tds[j].get_attribute("class") or ""
                        if "td_field" in nc:
                            val = tds[j].inner_text().strip()
                            data[label] = val
                            break

        doc_links = []
        for a in page.locator("a[href*='component=%24DirectLink']").all():
            text = a.inner_text().strip()
            if text and (".pdf" in text.lower() or ".xls" in text.lower() or ".rar" in text.lower() or ".zip" in text.lower()):
                href = a.get_attribute("href")
                if href:
                    doc_links.append(urllib.parse.urljoin(page.url, href))
        if doc_links:
            data["_nicgep_doc_urls"] = doc_links

    except Exception as e:
        log(f"[NICGEP SCRAPE ERROR] {e}")
    return data


# ── NICGEP document downloads ──────────────────────────────────────────────────
def _extract_href(page, selector_type: str, selector_value: str, index: int = 0):
    soup = BeautifulSoup(page.content(), "html.parser")
    matches = []
    for a in soup.find_all("a", href=True):
        if selector_type == "href_contains" and selector_value in a["href"]:
            matches.append(a["href"])
        elif selector_type == "text_contains" and selector_value.lower() in a.get_text(strip=True).lower():
            matches.append(a["href"])
    return matches[index] if index < len(matches) else None


def _download_via_link(page, selector_type: str, selector_value: str,
                        save_dir: str, filename_hint: str, index: int = 0,
                        retries: int = 3):
    os.makedirs(save_dir, exist_ok=True)

    def _try_download(action, timeout=15000):
        try:
            with page.expect_download(timeout=timeout) as dl_info:
                try:
                    action()
                except Exception:
                    pass
            download = dl_info.value
            path = os.path.join(save_dir, download.suggested_filename or filename_hint)
            download.save_as(path)
            log(f"      [DOWNLOAD] Saved: {path}")
            return path
        except PlaywrightTimeoutError:
            return None

    def _goto_extracted_link():
        href = _extract_href(page, selector_type, selector_value, index)
        if not href:
            log(f"      [DOWNLOAD] Link not found on page ({selector_type}={selector_value})")
            return None
        abs_url = urllib.parse.urljoin(page.url, href)
        return _try_download(lambda: page.goto(abs_url, referer=page.url, timeout=20000))

    path = _goto_extracted_link()
    if path:
        return path

    if page.locator("#captchaImage").count() == 0:
        log("      [DOWNLOAD] No download and no captcha appeared — giving up")
        return None
    log("      [DOWNLOAD CAPTCHA] Captcha page detected, solving...")

    for attempt in range(1, retries + 1):
        img_src = page.locator("#captchaImage").get_attribute("src") or ""
        if not img_src.startswith("data:image"):
            log("      [DOWNLOAD CAPTCHA] #captchaImage has no data: src — giving up")
            return None
        image_bytes = base64.b64decode(img_src.split(",", 1)[1])
        answer = solve_captcha_with_ollama(image_bytes)
        if not answer:
            log("      [DOWNLOAD CAPTCHA] No answer from Ollama")
            return None
        log(f"      [DOWNLOAD CAPTCHA] Attempt {attempt}/{retries}, answer: '{answer}'")
        page.locator("#captchaText").fill(answer)

        path = _try_download(lambda: page.locator("#Submit").click(), timeout=8000)
        if path:
            return path

        if page.locator("#captchaImage").count() == 0:
            log("      [DOWNLOAD CAPTCHA] Accepted — extracting link from returned page...")
            path = _goto_extracted_link()
            if path:
                return path
            log("      [DOWNLOAD CAPTCHA] Link not found/failed after acceptance")
            return None

        log(f"      [DOWNLOAD CAPTCHA] Attempt {attempt}/{retries} rejected, refreshing...")
        if attempt < retries:
            try:
                page.locator("#captcha").click()
                page.wait_for_timeout(1000)
            except Exception:
                return None
    return None


def download_nit_documents(page, nicgep_url: str, tender_id: str) -> list:
    results = []
    save_dir = os.path.join(DOWNLOAD_DIR, tender_id)

    filenames = []
    for a in page.locator("a[href*='component=docDownoad']").all():
        text = a.inner_text().strip()
        filenames.append(text or f"nit_document_{len(filenames) + 1}.pdf")

    for i, filename_hint in enumerate(filenames):
        if i > 0:
            page.goto(nicgep_url, timeout=20000, wait_until="domcontentloaded")
        log(f"      [DOWNLOAD] NIT document: {filename_hint}")
        path = _download_via_link(page, "text_contains", filename_hint, save_dir, filename_hint)
        log(f"      [DOWNLOAD] NIT document {filename_hint}: {'OK -> ' + path if path else 'FAILED'}")
        results.append({
            "type": "nit", "file_name": filename_hint,
            "local_path": path, "status": "downloaded" if path else "failed",
        })
    return results


def _extract_zip(zip_path: str) -> list:
    extract_dir = os.path.dirname(zip_path)
    try:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(extract_dir)
            names = [n for n in zf.namelist() if not n.endswith("/")]
        os.remove(zip_path)
        return [os.path.join(extract_dir, name) for name in names]
    except zipfile.BadZipFile as e:
        log(f"      [DOWNLOAD] Zip extraction failed for {zip_path}: {e}")
        return []


def download_work_item_zip(page, tender_id: str):
    zip_anchor = page.locator("a:has-text('Download as zip')").first
    if zip_anchor.count() == 0:
        return None
    save_dir = os.path.join(DOWNLOAD_DIR, tender_id)
    filename_hint = f"{tender_id}_work_item_documents.zip"
    log("      [DOWNLOAD] Work Item Documents (zip)")
    path = _download_via_link(page, "text_contains", "Download as zip", save_dir, filename_hint)
    log(f"      [DOWNLOAD] Work Item zip: {'OK -> ' + path if path else 'FAILED'}")

    extracted_files = []
    if path:
        extracted_files = _extract_zip(path)
        log(f"      [DOWNLOAD] Extracted {len(extracted_files)} file(s), zip removed")

    return {
        "type": "work_item_zip", "file_name": filename_hint,
        "local_path": None if extracted_files else path,
        "status": "downloaded" if (extracted_files or path) else "failed",
        "extracted_files": extracted_files,
    }


# ── NICGEP corrigendum documents ───────────────────────────────────────────────
def scrape_corrigendum_documents(page, url: str, tender_id: str) -> list:
    docs = []
    corr_page = None
    try:
        corr_page = page.context.new_page()
        corr_page.goto(url, referer=page.url, timeout=20000, wait_until="domcontentloaded")
        table = corr_page.locator("table#corrDoctable")
        if table.count() == 0:
            return docs
        for row in table.first.locator("tr").all():
            row_class = row.get_attribute("class") or ""
            if "td_caption" in row_class:
                continue
            tds = row.locator("td").all()
            if len(tds) < 6:
                continue
            doc_entry = {
                "corr_no":          tds[0].inner_text().strip(),
                "title":            tds[1].inner_text().strip(),
                "description":      tds[2].inner_text().strip(),
                "published_date":   tds[3].inner_text().strip(),
                "document_size_kb": tds[5].inner_text().strip(),
            }
            link = tds[4].locator("a[href]").first
            doc_name = link.inner_text().strip() if link.count() > 0 else None
            doc_entry["document_name"] = doc_name
            local_path = None
            if doc_name:
                save_dir = os.path.join(DOWNLOAD_DIR, tender_id)
                log(f"      [DOWNLOAD] Corrigendum document: {doc_name}")
                local_path = _download_via_link(corr_page, "text_contains", doc_name, save_dir, doc_name)
                log(f"      [DOWNLOAD] Corrigendum document {doc_name}: {'OK -> ' + local_path if local_path else 'FAILED'}")
            doc_entry["local_path"] = local_path
            docs.append(doc_entry)
    except Exception as e:
        log(f"      [CORRIGENDUM ERROR] {e}")
    finally:
        if corr_page:
            try:
                corr_page.close()
            except Exception:
                pass
    return docs


def scrape_corrigendums(page, tender_id: str) -> list:
    results = []
    table = page.locator("table#corrigendumDocumenttable")
    if table.count() == 0:
        return results
    for row in table.first.locator("tr").all():
        row_class = row.get_attribute("class") or ""
        if "list_header" in row_class:
            continue
        tds = row.locator("td").all()
        if len(tds) < 4:
            continue
        sno = tds[0].inner_text().strip()
        title = tds[1].inner_text().strip()
        ctype = tds[2].inner_text().strip()
        view_link = tds[3].locator("a[title='View Corrigendum History']").first
        if view_link.count() == 0:
            continue
        href = view_link.get_attribute("href")
        if not href:
            continue
        abs_url = urllib.parse.urljoin(page.url, href)
        log(f"      [CORRIGENDUM] {sno}. {title} ({ctype})")
        results.append({
            "corr_no": sno, "title": title, "type": ctype,
            "documents": scrape_corrigendum_documents(page, abs_url, tender_id),
        })
    return results


# ── Pagination ─────────────────────────────────────────────────────────────────
def get_total_count(page) -> int:
    try:
        for el in page.locator("div[style*='font-size']").all():
            text = el.inner_text().strip()
            if "total tenders" in text.lower():
                m = re.search(r'(\d+)', text)
                if m:
                    return int(m.group(1))
    except Exception:
        pass
    return 0


def go_to_next_page(page) -> bool:
    try:
        for btn in page.locator("div.pagination a.paginate_button").all():
            if "next" in btn.inner_text().strip().lower() and btn.is_visible():
                btn.click()
                page.wait_for_selector("table#table.list_table", timeout=25000)
                time.sleep(1.5)
                return True
    except Exception as e:
        log(f"  [PAGINATION] {e}")
    return False


def open_detail_and_scrape(page, href: str, tender_id: str) -> tuple:
    if not href:
        return {}, False, False
    try:
        url = "https://eprocure.gov.in" + href if href.startswith("/") else href
        detail_page = page.context.new_page()
        detail_page.goto(url, referer=page.url, timeout=20000, wait_until="domcontentloaded")

        if not solve_detail_page_captcha_if_present(detail_page):
            log(f"      [DETAIL ERROR] Detail-page captcha not solved for {url}")
            detail_page.close()
            return {}, False, False

        content = detail_page.content()
        if "Invalid Url" in content:
            log(f"      [DETAIL ERROR] Server returned 'Invalid Url' for {url}")
            detail_page.close()
            return {}, False, False

        details = scrape_cppp_detail(detail_page)

        nicgep_link = None
        tdd_link = detail_page.locator("#tenderDetailDivTd a[href]").first
        if tdd_link.count() > 0:
            h = (tdd_link.get_attribute("href") or "").strip()
            if h:
                nicgep_link = urllib.parse.urljoin(detail_page.url, h)

        if not nicgep_link:
            for lnk in detail_page.locator("a[title='View More Details']").all():
                h = lnk.get_attribute("href")
                if h:
                    nicgep_link = urllib.parse.urljoin(detail_page.url, h)
                    break

        if nicgep_link:
            details["_tender_site_link"] = nicgep_link
            log(f"      [NICGEP] Opening original tender page for deep extraction...")
            try:
                detail_page.goto(nicgep_link, referer=detail_page.url, timeout=20000, wait_until="domcontentloaded")
                nicgep_details = scrape_nicgep_detail(detail_page)
                details.update(nicgep_details)

                downloaded = download_nit_documents(detail_page, nicgep_link, tender_id)
                zip_result = download_work_item_zip(detail_page, tender_id)
                if zip_result:
                    downloaded.append(zip_result)

                failed_nit = [d for d in downloaded if d["type"] == "nit" and d["status"] == "failed"]
                if failed_nit:
                    log(f"      [DOWNLOAD] Retrying {len(failed_nit)} failed NIT document(s) after zip...")
                    detail_page.goto(nicgep_link, referer=detail_page.url, timeout=20000, wait_until="domcontentloaded")
                    retry_results = download_nit_documents(detail_page, nicgep_link, tender_id)
                    retry_by_name = {r["file_name"]: r for r in retry_results}
                    downloaded = [
                        retry_by_name.get(d["file_name"], d) if d["type"] == "nit" else d
                        for d in downloaded
                    ]

                if downloaded:
                    details["_downloaded_documents"] = downloaded

                detail_page.goto(nicgep_link, referer=detail_page.url, timeout=20000, wait_until="domcontentloaded")
                corrigendums = scrape_corrigendums(detail_page, tender_id)
                if corrigendums:
                    details["_corrigendum"] = corrigendums
            except Exception as e:
                log(f"      [NICGEP ERROR] {e}")

        detail_page.close()
        return details, True, True
    except Exception as e:
        log(f"      [DETAIL ERROR] {e}")
        try:
            detail_page.close()
        except Exception:
            pass
        return {}, False, False


# ── Scrape results ─────────────────────────────────────────────────────────────
def scrape_results(page, state: str, org: str, conn) -> list:
    all_rows, page_num = [], 1
    search_label = f"State: {state} | Organisation: {org}"
    log(f"  Total tenders: {get_total_count(page)}")
    while True:
        try:
            page.wait_for_selector("table#table.list_table", timeout=25000)
        except PlaywrightTimeoutError:
            break

        row_data_temp = []
        all_rows_loc  = page.locator("table#table.list_table tbody tr")
        for idx in range(all_rows_loc.count()):
            row = all_rows_loc.nth(idx)
            tds = row.locator("td")
            if tds.count() < 6:
                continue
            s_no = tds.nth(0).inner_text().strip()
            if not s_no:
                continue
            title, refno, tid, href = parse_title_cell(tds.nth(4))
            if not tid:
                continue
            row_data_temp.append({
                "idx": idx, "s_no": s_no,
                "e_pub":    tds.nth(1).inner_text().strip(),
                "closing":  tds.nth(2).inner_text().strip(),
                "opening":  tds.nth(3).inner_text().strip(),
                "title": title, "refno": refno, "tid": tid,
                "href": href,
                "state_name": tds.nth(5).inner_text().strip(),
            })

        log(f"  Page {page_num}: {len(row_data_temp)} tenders")
        page_count = 0

        for data in row_data_temp:
            try:
                details, _new_tab, ok = open_detail_and_scrape(page, data.get("href"), data["tid"])
                if not ok:
                    continue

                org_name = details.get("Organisation Name", "").strip() or org
                doc_urls = details.pop("_doc_urls", [])
                nicgep_doc_urls = details.pop("_nicgep_doc_urls", [])
                doc_urls += [u for u in nicgep_doc_urls if u not in doc_urls]
                downloaded_documents = details.pop("_downloaded_documents", [])
                corrigendum = details.pop("_corrigendum", [])
                tender_site_link = details.pop("_tender_site_link", None)

                f_status, f_reason, llm_dept = filter_tender(
                    title=data["title"], org=org_name,
                    state=data["state_name"],
                    refno=data["refno"], tid=data["tid"],
                    details=details, doc_urls=doc_urls,
                    search_label=search_label,
                )

                effective_dept = (llm_dept or "Unknown").lower()

                all_rows.append([
                    state, org, data["s_no"], data["e_pub"], data["closing"],
                    data["opening"], data["title"], data["refno"], data["tid"],
                    data["state_name"], f_status, f_reason,
                ])

                if f_status == "no":
                    _stats["records_skipped"] += 1
                    page_count += 1
                    continue

                if conn:
                    record = {
                        "state":              data["state_name"],
                        "organisation_name":  org_name,
                        "e_published_date":   data["e_pub"],
                        "closing_date":       data["closing"],
                        "opening_date":       data["opening"],
                        "tender_title":       data["title"],
                        "tender_refno":       data["refno"],
                        "tender_id":          data["tid"],
                        "organisation_chain": f"{org_name} ({data['state_name']})",
                        "tender_details":     json.dumps(details, ensure_ascii=False),
                        "file_link":          json.dumps(
                            [{"url": u, "type": "tender_document"} for u in doc_urls]
                        ) if doc_urls else None,
                        "tender_page_link":   "https://eprocure.gov.in" + data.get("href", "") if str(data.get("href", "")).startswith("/") else data.get("href"),
                        "tender_site_link":   tender_site_link,
                        "relevency_checker":  f_status,
                        "relevancy_reason":   f_reason,
                        "dept":               effective_dept,
                        "downloaded_documents": json.dumps(downloaded_documents, ensure_ascii=False) if downloaded_documents else None,
                        "corrigendum":        json.dumps(corrigendum, ensure_ascii=False) if corrigendum else None,
                        "searched_keyword":   search_label,
                        "found_date":         datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    }
                    record.update(extract_nicgep_fields(details))
                    upsert_tender(conn, record)
                page_count += 1

            except Exception as e:
                log(f"    [SKIP] {data.get('tid', '?')}: {e}")
                try:
                    page.go_back()
                    page.wait_for_selector("table#table.list_table", timeout=10000)
                except Exception:
                    pass

        log(f"  Page {page_num}: {page_count}/{len(row_data_temp)} processed  "
            f"(saved={_stats['records_saved']} skipped={_stats['records_skipped']})")

        if not go_to_next_page(page):
            break
        page_num += 1
        time.sleep(2)

    return all_rows


# ── Select state + organisation ────────────────────────────────────────────────
def _select_state(page, state: str) -> bool:
    state_select = page.locator("select#tendercategory")
    try:
        state_select.wait_for(state="visible", timeout=10000)
        state_select.select_option(value=state)
        return True
    except Exception as e:
        log(f"  [STATE] Failed to select '{state}': {e}")
        return False


def _select_organisation(page, org: str, timeout_ms: int = 15000) -> bool:
    org_select = page.locator("select#organisationname")
    try:
        org_select.wait_for(state="visible", timeout=10000)
        # The organisation dropdown is populated asynchronously after the
        # state is chosen — wait for the specific option to be attached
        # before selecting it.
        org_select.locator(f'option[value="{org}"]').wait_for(state="attached", timeout=timeout_ms)
        org_select.select_option(value=org)
        return True
    except Exception as e:
        log(f"  [ORG] Failed to select '{org}': {e}")
        return False


# ── Search one (state, organisation) pair ──────────────────────────────────────
def search_state_org(page, state: str, org: str, conn) -> list:
    log(f"\n===== State: '{state}' | Organisation: '{org}' =====")

    max_retries = 5
    content = ""
    for attempt in range(1, max_retries + 1):
        page.goto(STATES_URL, timeout=60000, wait_until="domcontentloaded")
        time.sleep(2)

        if not _select_state(page, state):
            return []
        if attempt == 1:
            log(f"  [STEP 1] State selected: '{state}'")

        # Wait 3-5s for the Organisation dropdown to be populated via AJAX
        time.sleep(4)

        if not _select_organisation(page, org):
            return []
        if attempt == 1:
            log(f"  [STEP 2] Organisation selected: '{org}'")
        else:
            log(f"  [STEP 2] Organisation selected: '{org}' (Retry {attempt})")

        # Wait ~3s before touching the captcha / search controls
        time.sleep(3)

        if not fill_captcha(page):
            log("  [STEP 3] Captcha failed — skipping")
            return []
        if attempt == 1:
            log("  [STEP 3] Captcha solved")
        else:
            log(f"  [STEP 3] Captcha solved (Retry {attempt})")

        search_btn = page.locator("input#btnSearch")
        search_btn.wait_for(state="visible", timeout=10000)
        search_btn.click()
        time.sleep(3)

        content = page.content().lower()
        if "the answer you entered for the captcha was not correct" in content or "wrong" in content or "invalid captcha" in content:
            log(f"  [WARN] Captcha rejected by server (Attempt {attempt}/{max_retries}). Retrying...")
            continue

        break
    else:
        log("  [ERROR] Failed to solve captcha after maximum retries.")
        return []

    if any(x in content for x in ["no tenders found", "no record found", "total tenders : 0"]):
        log("  No tenders found for this state/organisation")
        return []

    try:
        page.wait_for_selector("table#table.list_table", timeout=10000)
    except PlaywrightTimeoutError:
        log("  [WARN] Results table not found")
        return []

    rows = scrape_results(page, state, org, conn)
    log(f"  '{state} | {org}' complete: {len(rows)} records")
    return rows


# ── Main ───────────────────────────────────────────────────────────────────────
def run(playwright):
    init_csv(OUTPUT_FILE)
    conn = None
    try:
        conn = get_db_connection()
        log("MySQL connected.")
    except Exception as e:
        log(f"[DB ERROR] {e} — CSV only")

    browser = playwright.chromium.launch(headless=False, args=BROWSER_ARGS)
    context = browser.new_context(
        viewport={"width": 1280, "height": 900}, locale="en-US",
        ignore_https_errors=True, java_script_enabled=True,
        accept_downloads=True,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    )
    page = context.new_page()
    page.set_default_timeout(60000)
    page.on("dialog", lambda d: (log(f"[Dialog] {d.message[:80]}"), d.accept()))

    state_org_list = load_state_org_list(STATE_ORG_CSV)
    done_pairs = set()
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump([], f)  # reset progress on every launch so we always start from row 1
    log(f"[INIT] Loaded {len(state_org_list)} (state, org) pairs from {STATE_ORG_CSV}")
    if state_org_list:
        log(f"[INIT] Progress reset — starting from row 1: "
            f"{state_org_list[0]['state']} | {state_org_list[0]['org']}")

    _stats["total_items"] = len(state_org_list)
    _stats["items_done"]  = len(done_pairs)

    total_records = 0
    try:
        for pair in state_org_list:
            if _EXIT:
                break
            state, org = pair["state"], pair["org"]
            pair_key = f"{state}||{org}"
            if pair_key in done_pairs:
                continue
            _stats["current_item"] = f"{state} | {org}"
            rows = search_state_org(page, state, org, conn)
            if rows:
                append_csv(OUTPUT_FILE, rows)
                total_records += len(rows)
            mark_progress(done_pairs, state, org)
            _stats["items_done"] += 1
        log(f"\n[DONE] Total scraped: {total_records}  "
            f"DB-saved: {_stats['records_saved']}  "
            f"Filtered-out: {_stats['records_skipped']}")
    except Exception as e:
        log(f"[FATAL] {e}")
    finally:
        _stats["current_item"] = "—"
        if conn:
            try: conn.close()
            except Exception: pass
        try:
            context.close()
            browser.close()
        except Exception: pass


# ── ENTRY POINT ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    def _handle_signal(*_):
        global _EXIT
        _EXIT = True
        print(f"\n[{SCRAPER_NAME}] Signal received — stopping", flush=True)

    signal.signal(signal.SIGINT,  _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    log(f"=== {SCRAPER_NAME} starting ===")
    try:
        with sync_playwright() as playwright:
            run(playwright)
    except Exception as e:
        log(f"[ERROR] {e}")
    log(f"=== {SCRAPER_NAME} done | records saved: {_stats['records_saved']} ===")

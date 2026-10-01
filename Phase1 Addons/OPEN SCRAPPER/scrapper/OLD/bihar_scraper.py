"""
bihar_scraper.py
=================
Bihar e-Procurement Portal (EPSV2Web) — Full Tender Listing Scraper
https://eproc2.bihar.gov.in/EPSV2Web/openarea/tenderListingPage.action#latestTenders

Same two-pass Meril Endo/Diagno relevance pipeline as gujarat_scraper.py,
adapted to Bihar's Angular in-page preview MODAL (not a new tab, not a
details page navigation — clicking the eye icon populates and shows
div#myModalprev in place).

Flow:
  1. Open site, wait for page load
  2. Process rows of the Latest Tenders table (table#myTablebyrTl) one by
     one. Bihar lazy-loads more rows via a "More..." link rather than real
     pagination — instead of front-loading everything up front, "More..."
     is clicked ON DEMAND only when the loop reaches the end of what's
     currently in the DOM, so filtering/downloading starts immediately
     on the first batch instead of waiting through 20+ "Load More" clicks.
  3. For each row:
       a. Read the FULL tender description from the row's `title`
          attribute (the visible cell text is CSS-truncated to one line)
       b. PASS 1 — Ask Ollama: is this relevant to Meril Endo / Meril Diagno?
            - Hard-reject on obvious civil/electrical-infra keywords first
            - "No"    -> skip entirely (no modal, no downloads, no DB insert)
            - "Yes"   -> proceed straight to details/download
            - "Doubt" -> proceed to preview modal, but do NOT download yet
       c. Click the eye icon (button[ng-click*='previewTender']) -> the
          Angular preview modal (div#myModalprev) opens in place. Scrape:
            - Full modal text (General Information, Date Schedule, Payment,
              Description, Terms & Conditions, BOQ, etc.)
            - Every key/value pair out of its tables, mapped onto the exact
              fields the portal's tender detail page expects
       d. PASS 2 (only for "Doubt" verdicts) — download every attachment
          first (every `i.fa-download` icon in the modal — Attachments
          table, Terms & Conditions RFP, BOQ file), extract real PDF/Excel
          content, then send the details text + document excerpts to
          Ollama for a final, confident Yes/No decision.
            - "No"  -> discard, delete downloaded files, no DB insert
            - "Yes" -> keep the downloaded files
       e. If still relevant after both passes: documents are already
          downloaded to tender_documents/bihar_<tender_id>/; close the modal
       f. Upsert relevant rows into MySQL (open_tender_details) — with
          disambiguated tender_refno, correctly-formatted closing_date, and
          structured tender_details/downloaded_documents JSON the frontend
          renders directly — and write every row (relevant or not) to
          row_data_bihar.csv for audit

Usage:
    python bihar_scraper.py
"""

import csv
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
import urllib.parse
from datetime import datetime

import mysql.connector
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# Windows consoles often default to a legacy codepage (cp1252) that can't
# encode characters like non-breaking hyphens or arrows that show up in
# scraped tender text/LLM output. A crash here happens mid-print, AFTER the
# relevance decision but BEFORE the DB save — silently losing a confirmed
# result. Force UTF-8 with a safe fallback so printing never aborts the run.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ── Configuration ──────────────────────────────────────────────────────────────
BASE_URL = "https://eproc2.bihar.gov.in/EPSV2Web/openarea/tenderListingPage.action#latestTenders"
STATE_NAME = "Bihar"
OUTPUT_FILE = "row_data_bihar.csv"

_SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(_SCRIPT_DIR, "tender_documents")

CSV_HEADERS = [
    "s_no", "tender_id", "tender_refno", "department", "tender_title",
    "end_date", "documents", "dept", "filter_status", "filter_reason",
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
    """Print timestamped log message."""
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"  [{ts}] {msg}"
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", errors="replace").decode("ascii"), flush=True)


# ══════════════════════════════════════════════════════════════════════════════
# RELEVANCY FILTER (Ollama LLM) — Meril Endo + Meril Diagno
# ══════════════════════════════════════════════════════════════════════════════

OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL    = "gpt-oss:120b-cloud"

MERIL_ENDO_PRODUCTS = """
Meril Endo sells ONLY these Surgical / Endosurgery products:

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
"""

MERIL_DIAGNO_PRODUCTS = """
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
"""

MERIL_NOT_SOLD = """
Meril does NOT sell:
  X-ray / MRI / CT / Ultrasound machines, ventilators, oxygen concentrators,
  general pharmaceuticals, hospital furniture, civil/construction/infrastructure work,
  road/building/bridge/water-supply/irrigation works, electrical/power-infra works,
  IT/software/computer equipment, uniforms, stationery, food items, gloves, masks, swabs,
  industrial chemicals, waterproofing/geo-textile/construction mesh,
  or any non-IVD, non-surgical medical products.
  NOTE: "mesh" or "stapler" in a CONSTRUCTION / CIVIL / IRRIGATION / WATERPROOFING
  context is NOT our product.
"""

FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd
(covering both the Endo/Surgical Division and the Diagno/IVD Division).

Your ONLY job: decide whether a government tender is worth pursuing — does its
DESCRIPTION suggest it asks for products that Meril Endo or Meril Diagno
actually sell? You are given the tender's description text (from the listing
row), so judge from that alone.

{MERIL_ENDO_PRODUCTS}
{MERIL_DIAGNO_PRODUCTS}
{MERIL_NOT_SOLD}

DECISION RULES:
1. If the description clearly mentions ANY Endo or Diagno product above -> "Yes",
   and set "dept" to "Endo" or "Diagno" accordingly.
2. If the description EXPLICITLY signals a medical/surgical/hospital/lab/
   diagnostic context (contains a word like: hospital, medical, surgical, OT /
   operation theatre, ICU, clinic, pathology, lab, laboratory, diagnostic,
   blood bank, dialysis, PHC, CHC) BUT the exact product is still vague
   ("medical consumables", "hospital supplies", "lab equipment",
   "surgical items") -> "Doubt", with your best guess at "dept".
3. GENERIC / ADMINISTRATIVE descriptions with NO medical/surgical/diagnostic
   word at all -> "No". This includes things like road/building/bridge
   construction, drainage/sewage/water-supply works, electrical/substation/
   transformer work, IT equipment purchases, computer services, housekeeping,
   security services, furniture, printing, empanelment of consultants,
   solar/rooftop installations — even if the issuing department happens to
   be a hospital or medical institute in name only.
4. If truly unsure after applying rules 1-3 -> "Doubt", but do not use this to
   rescue descriptions that fail rule 3.
5. Return "No" whenever the description has nothing to do with surgical/
   endosurgery products or IVD diagnostic products.

CRITICAL: "Yes" and "Doubt" both proceed to review — use "Doubt" only when
          there is an actual medical/surgical/diagnostic signal in the text.
          Do NOT mark generic supply/administrative/civil-infra descriptions as
          "Doubt" just because they *could* theoretically include anything —
          that produces too many false positives. Only "No" drops the tender
          entirely, but a purely generic description with zero medical signal
          should confidently be "No".

Return ONLY valid JSON — no text outside the JSON.

Format:
{{
  "decision": "Yes" | "Doubt" | "No",
  "reason": "<one sentence: what the tender is likely for and why>",
  "dept": "Endo" | "Diagno" | "Unknown" | null,
  "category": "<most likely Meril product, e.g. Hernia Mesh / HbA1c Analyzer, or null>"
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


def _build_filter_message(tender_description: str) -> str:
    return (
        "Please evaluate whether this tender is relevant for Meril Life Sciences,\n"
        "using the description below:\n\n"
        f"Description : {tender_description}\n\n"
        "Return ONLY the JSON decision object as specified in the system prompt."
    )


def _ask_llm(tender_description: str) -> dict:
    messages = [
        {"role": "system", "content": FILTER_SYSTEM_PROMPT},
        {"role": "user",   "content": _build_filter_message(tender_description)},
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
    return {"decision": "Doubt", "reason": "LLM unavailable — marked relevant for safety.", "dept": "Unknown"}


def filter_tender(tender_description: str) -> tuple:
    """Returns (status, reason, dept, decision). status: 'proceed_futher' | 'no'
    decision is the raw LLM verdict: 'Yes' | 'Doubt' | 'No' (hard-reject also
    reports as 'No')."""
    desc_lower = tender_description.lower()

    elec_signals = [
        "rdss", "substation", "33/11 kv", "11/33 kv", "33 kv", "11 kv", "220 kv",
        "66kv", "6.6 kv", "400 kv", "132 kv", "mv line", "lt line", "ht line",
        "power distribution", "electricity supply", "distribution transformer",
        "power transformer", "feeder pillar", "switchgear", "switch yard",
        "solar rooftop", "high mast",
    ]
    civil_signals = [
        "road construction", "pcc road", "cc road", "cc pavement", "resurfacing",
        "bridge construction", "building construction", "drainage", "sewage",
        "water supply", "irrigation", "canal", "hume pipe", "nala", "footpath",
        "compost plant", "toilet block", "boundary wall", "compound wall",
        "renovation", "plaster work", "flooring work", "furniture",
    ]
    admin_signals = [
        "it related equipment", "computer service", "desktop computer",
        "printer", "empanelment of consultant", "housekeeping", "security services",
        "stationery", "outsourcing", "consultancy services for preparation",
    ]
    matched = next((s for s in elec_signals + civil_signals + admin_signals if s in desc_lower), None)
    if matched:
        reason = f"Hard-reject: civil/electrical/administrative signal '{matched}' — not a Meril product."
        log(f"    [FILTER] HARD-REJECT (signal: {matched})")
        return "no", reason, None, "No"

    log(f"    [FILTER] -> Ollama: {tender_description[:80]}")
    result = _ask_llm(tender_description)

    decision = result.get("decision", "Doubt").strip()
    reason   = result.get("reason", "No reason provided.")
    dept_tag = result.get("dept")
    cat_tag  = result.get("category")
    if cat_tag:
        reason = f"{reason}  [Category: {cat_tag}]"

    if decision == "No":
        log(f"    [FILTER] SKIP (LLM: No) — {reason}")
        return "no", reason, dept_tag, decision
    else:
        log(f"    [FILTER] RELEVANT (LLM: {decision}, dept: {dept_tag}) — {reason}")
        return "proceed_futher", reason, dept_tag, decision


# ══════════════════════════════════════════════════════════════════════════════
# Second-pass confirmation for "Doubt" verdicts — sends the modal details text
# and actual downloaded document content to Ollama for a final Yes/No call.
# ══════════════════════════════════════════════════════════════════════════════

CONFIRM_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd
(covering both the Endo/Surgical Division and the Diagno/IVD Division).

A tender description was FLAGGED AS "Doubt" on a first pass. You are now
given the tender's FULL DETAILS PAGE TEXT and the ACTUAL CONTENT EXCERPTS of
its downloaded tender documents (extracted from the PDF/Excel files) to make
a FINAL, CONFIDENT decision.

{MERIL_ENDO_PRODUCTS}
{MERIL_DIAGNO_PRODUCTS}
{MERIL_NOT_SOLD}

DECISION RULES:
1. Excel/spreadsheet documents (e.g. BOQ files) are often split into MULTIPLE
   SHEETS (each marked "[Sheet: <name>]" in the excerpt). Read EVERY sheet
   section given, not just the first one.
2. If ANY line item across the details text or ANY document/sheet excerpt
   matches a real Meril Endo or Meril Diagno product/category above -> "Yes",
   even if OTHER items/sheets in the same tender are irrelevant. A tender
   requesting a mixed basket of items only needs ONE matching product line
   to be worth pursuing.
3. Only answer "No" if you have checked every sheet/section given and found
   NO line item anywhere that matches a real Meril product.
4. You must give a FINAL binary answer now — do NOT respond "Doubt" this
   time. Use every piece of evidence given (details text, document names,
   ALL document/sheet content excerpts) to decide confidently.

Return ONLY valid JSON — no text outside the JSON.

Format:
{{
  "decision": "Yes" | "No",
  "reason": "<one sentence: what the tender is actually for and why>",
  "dept": "Endo" | "Diagno" | "Unknown" | null,
  "category": "<most likely Meril product, or null>"
}}"""


def _build_confirm_message(tender_description: str, details_text: str, doc_excerpts: list) -> str:
    lines = [
        "This tender was marked 'Doubt' on the first pass. Please make a",
        "final Yes/No call using the additional evidence below, which includes",
        "the actual downloaded document content where extraction succeeded.",
        "",
        f"Description      : {tender_description}",
    ]
    if doc_excerpts:
        lines += ["", "Downloaded Documents :"]
        for d in doc_excerpts[:10]:
            lines.append(f"  - {d['document_name']}")
            excerpt = d.get("excerpt") or ""
            if excerpt:
                lines.append(f"    Content excerpt:\n{excerpt[:4000]}")
    if details_text:
        lines += ["", f"Details Page Text (excerpt) : {details_text[:3000]}"]
    lines += ["", "Return ONLY the JSON decision object as specified in the system prompt."]
    return "\n".join(lines)


def _ask_llm_confirm(tender_description: str, details_text: str, doc_excerpts: list) -> dict:
    messages = [
        {"role": "system", "content": CONFIRM_SYSTEM_PROMPT},
        {"role": "user",   "content": _build_confirm_message(tender_description, details_text, doc_excerpts)},
    ]
    for attempt in range(1, 4):
        try:
            raw = _ollama_call(messages)
            if not raw:
                log(f"    [CONFIRM/LLM] Empty response (attempt {attempt}) — waiting...")
                time.sleep(10 * attempt)
                continue
            result = _parse_json(raw)
            if result and isinstance(result, dict) and "decision" in result:
                return result
            log(f"    [CONFIRM/LLM] Bad JSON (attempt {attempt}): {raw[:120]}")
            time.sleep(3)
        except urllib.error.URLError as e:
            log(f"    [CONFIRM/LLM] Ollama unreachable (attempt {attempt}): {e}")
            time.sleep(10)
        except Exception as e:
            log(f"    [CONFIRM/LLM] Attempt {attempt}/3 failed: {e}")
            time.sleep(5)
    log("    [CONFIRM/LLM] All attempts failed — defaulting to No (safe: needs a confident Yes to proceed)")
    return {"decision": "No", "reason": "LLM unavailable for confirmation pass.", "dept": None}


def confirm_doubtful_tender(tender_description: str, details_text: str, doc_excerpts: list) -> tuple:
    """Second-pass check for a 'Doubt' verdict, using the actual downloaded
    document content. Returns (status, reason, dept). status: 'proceed_futher' | 'no'."""
    log(f"    [CONFIRM] Doubt tender -> asking Ollama with details+"
        f"{len(doc_excerpts)} downloaded document(s)...")
    result = _ask_llm_confirm(tender_description, details_text, doc_excerpts)

    decision = result.get("decision", "No").strip()
    reason   = result.get("reason", "No reason provided.")
    dept_tag = result.get("dept")
    cat_tag  = result.get("category")
    if cat_tag:
        reason = f"{reason}  [Category: {cat_tag}]"

    if decision == "Yes":
        log(f"    [CONFIRM] CONFIRMED RELEVANT (dept: {dept_tag}) — {reason}")
        return "proceed_futher", f"[2nd-pass CONFIRMED] {reason}", dept_tag
    else:
        log(f"    [CONFIRM] CONFIRMED IRRELEVANT — {reason}")
        return "no", f"[2nd-pass REJECTED] {reason}", dept_tag


# ══════════════════════════════════════════════════════════════════════════════
# Database
# ══════════════════════════════════════════════════════════════════════════════

def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


def make_db_refno(tender_refno: str, tender_id: str) -> str:
    """Bihar's 'Reference No.' can be shared across multiple distinct
    tenders in the same batch (e.g. an NIT covering many separate work
    items). But open_tender_details.tender_refno is the table's UNIQUE key
    — shared with many other scrapers, so not something this scraper can
    change. Disambiguate by embedding the tender_id, which IS unique per
    tender, so every tender gets its own row regardless of shared refnos."""
    refno = (tender_refno or "").strip()
    tid = (tender_id or "").strip()
    if not refno:
        return f"BIHAR-TID-{tid}"
    return f"{refno} [TID:{tid}]"


def _trunc(v, n):
    """Safely fit a scraped value into a fixed-width varchar column —
    without this, a long value raises a truncation error and the whole
    upsert silently fails via the except/rollback below."""
    if not v:
        return None
    s = str(v)
    return s[:n] if len(s) > n else s


def extra_columns_from_structured(structured: dict) -> dict:
    """Maps the flat frontend-key dict (see build_frontend_tender_details)
    onto open_tender_details' dedicated columns — work_description,
    contract_type, emd_amount, bid_submission_start/end_date, etc.

    These are SEPARATE REAL COLUMNS, not the tender_details JSON blob. The
    frontend happens to read tender_details JSON directly so it always
    showed correct values, but anything that queries these columns instead
    (reports, exports, other pages) was seeing them as NULL for every
    Bihar tender — upsert_tender() only ever wrote the JSON blob and never
    touched these columns at all (same bug found and fixed for Gujarat)."""
    g = structured.get
    return {
        "work_description":        g("Work Description"),
        "tender_category":         _trunc(g("Tender Category"), 100),
        "product_category":        _trunc(g("Product Category"), 255),
        "form_of_contract":        _trunc(g("Form Of Contract"), 100),
        "contract_type":           _trunc(g("Contract Type"), 100),
        "tender_type":             _trunc(g("Tender Type"), 100),
        "emd_amount":              _trunc(g("EMD Amount in ₹"), 50),
        "tender_value":            _trunc(g("Tender Value in ₹"), 50),
        "bid_validity_days":       _trunc(g("Bid Validity(Days)"), 20),
        "period_of_work_days":     _trunc(g("Period Of Work(Days)"), 20),
        "bid_submission_start_date": _trunc(g("Bid Submission Start Date"), 50),
        "bid_submission_end_date":   _trunc(g("Bid Submission End Date"), 50),
        "bid_opening_date":        _trunc(g("Bid Opening Date"), 50),
        "opening_date":            _trunc(g("Bid Opening Date"), 100),
        "pre_bid_meeting_date":    _trunc(g("Pre Bid Meeting Date"), 50),
        "pre_bid_meeting_place":   _trunc(g("Pre Bid Meeting Place"), 255),
        "location":                _trunc(g("Location"), 255),
        "payment_mode":            _trunc(g("Payment Mode"), 50),
    }


def upsert_tender(conn, record):
    cursor = conn.cursor()
    extra = extra_columns_from_structured(record.get("structured_details") or {})
    extra_cols = list(extra.keys())
    extra_placeholders = ", ".join(["%s"] * len(extra_cols))
    extra_col_list = ", ".join(extra_cols)
    extra_update = ", ".join(f"{c} = VALUES({c})" for c in extra_cols)

    sql = f"""
        INSERT INTO open_tender_details
            (state, organisation_name, closing_date,
             tender_title, tender_refno, tender_id,
             organisation_chain, tender_details, file_link,
             downloaded_documents,
             relevency_checker, relevancy_reason, suggested_product, dept,
             {extra_col_list})
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
             {extra_placeholders})
        ON DUPLICATE KEY UPDATE
            organisation_name    = VALUES(organisation_name),
            closing_date         = VALUES(closing_date),
            tender_title         = VALUES(tender_title),
            organisation_chain   = VALUES(organisation_chain),
            tender_details       = VALUES(tender_details),
            file_link            = VALUES(file_link),
            downloaded_documents = VALUES(downloaded_documents),
            relevency_checker    = VALUES(relevency_checker),
            relevancy_reason     = VALUES(relevancy_reason),
            suggested_product    = VALUES(suggested_product),
            dept                 = VALUES(dept),
            {extra_update},
            updated_at           = CURRENT_TIMESTAMP
    """
    try:
        cursor.execute(sql, (
            record.get("state"), record.get("organisation_name"),
            record.get("closing_date"), record.get("tender_title"),
            record.get("tender_refno"), record.get("tender_id"),
            record.get("organisation_chain"), record.get("tender_details"),
            record.get("file_link"), record.get("downloaded_documents"),
            record.get("relevency_checker", "not_processed"),
            record.get("relevancy_reason"), record.get("suggested_product"),
            record.get("dept"),
            *[extra[c] for c in extra_cols],
        ))
        conn.commit()
    except Exception as e:
        log(f"    [DB ERROR] {e} | Ref: {record.get('tender_refno')}")
        conn.rollback()
    finally:
        cursor.close()


def build_documents_json(documents: list) -> tuple:
    """Builds the (file_link, downloaded_documents) JSON strings for the DB
    in the shape the frontend (TenderDetails.jsx) expects:
      - downloaded_documents: [{type, file_name, local_path, url, status}]
      - file_link: [{file_path, file_name}]  (only successfully downloaded ones)
    Returns (file_link_json, downloaded_documents_json), either None if
    there are no documents."""
    if not documents:
        return None, None

    downloaded_documents_json = json.dumps([
        {
            "type": "tender_document",
            "file_name": d["document_name"],
            "local_path": d.get("local_path"),
            "url": d.get("url"),
            "status": d.get("status"),
        }
        for d in documents
    ], ensure_ascii=False)

    file_link_json = json.dumps([
        {"file_path": d["local_path"], "file_name": d["document_name"]}
        for d in documents if d.get("local_path")
    ], ensure_ascii=False)

    return file_link_json, downloaded_documents_json


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


# ══════════════════════════════════════════════════════════════════════════════
# Listing row parsing + "More..." lazy-load pagination
# ══════════════════════════════════════════════════════════════════════════════

def click_more_once(page) -> bool:
    """Bihar's 'Latest Tenders' table lazy-loads via a client-side
    'More...' link (ng-click="clickForMoreTender()") rather than real
    pagination. Clicks it ONE batch at a time — called on demand from the
    processing loop as it reaches the end of what's currently loaded,
    rather than front-loading all ~500+ tenders before any filtering
    starts. Returns True if a new batch was loaded, False if there's
    nothing left to load."""
    more_link = page.locator("a:has-text('More...')")
    if more_link.count() == 0:
        return False
    try:
        if not more_link.first.is_visible():
            return False
        # Defensive: a leftover open modal blocks every click on the page.
        # This should never happen now that close_preview_modal() force-hides
        # a stuck modal, but don't let it turn into a silent 60s hang if it does.
        modal = page.locator("div#myModalprev")
        if modal.count() > 0 and modal.is_visible():
            log("    [LOAD MORE] Modal still open — closing it before clicking 'More...'")
            close_preview_modal(page, modal)
        before = page.locator("table#myTablebyrTl tbody tr td.frelips").count()
        more_link.first.click(timeout=10000)
        time.sleep(2)
        after = page.locator("table#myTablebyrTl tbody tr td.frelips").count()
        log(f"    [LOAD MORE] {before} -> {after} tenders loaded")
        return after > before
    except Exception as e:
        log(f"    [LOAD MORE] stopped: {e}")
        return False


def parse_listing_row(row) -> dict:
    """Extract fields from a 'Latest Tenders' row. The visible description
    cell is CSS-truncated to one line, so the FULL text is read from its
    `title` attribute instead."""
    tds = row.locator("td")
    if tds.count() < 7:
        return {}

    tender_id = tds.nth(1).inner_text().strip()
    desc_cell = tds.nth(2)
    full_title = (desc_cell.get_attribute("title") or "").strip()
    if not full_title:
        full_title = desc_cell.inner_text().strip()
    tender_refno = tds.nth(3).inner_text().strip()
    department = tds.nth(4).inner_text().strip()
    end_date = tds.nth(5).inner_text().strip()

    return {
        "tender_id":      tender_id,
        "tender_title":   full_title,
        "tender_refno":   tender_refno,
        "department":     department,
        "end_date":       end_date,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Preview modal (in-page, not a new tab) + document downloads
# ══════════════════════════════════════════════════════════════════════════════

def open_preview_modal(page, row):
    """Click the eye icon for this row -> the Angular preview modal
    (div#myModalprev) opens in place. Returns the modal locator, or None."""
    eye_btn = row.locator("button[ng-click*='previewTender']")
    if eye_btn.count() == 0:
        return None
    try:
        eye_btn.first.scroll_into_view_if_needed(timeout=5000)
    except Exception:
        pass
    eye_btn.first.click()

    modal = page.locator("div#myModalprev")
    try:
        modal.wait_for(state="visible", timeout=20000)
    except PlaywrightTimeoutError:
        return None
    time.sleep(1.5)  # let the AJAX-populated content settle
    return modal


def close_preview_modal(page, modal):
    """Closes the preview modal. A modal left open blocks every subsequent
    click on the page (including 'More...'), which previously caused a
    60s+ hang at the end of a run — so this always force-hides the modal
    via JS as a last resort if the normal close button/Escape didn't
    actually take effect, instead of trusting either to have worked."""
    if modal is None:
        return
    try:
        close_btn = modal.locator("button.close").first
        if close_btn.count() > 0:
            close_btn.click()
        else:
            page.keyboard.press("Escape")
        modal.wait_for(state="hidden", timeout=8000)
    except Exception:
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass

    # Safety net: if it's still visible after the above, force it closed —
    # a stuck-open modal silently blocks every future interaction on the page.
    try:
        if modal.is_visible():
            log("    [MODAL] Still open after close attempt — forcing it closed via JS.")
            page.evaluate("""
                () => {
                    const m = document.querySelector('#myModalprev');
                    if (m) { m.style.display = 'none'; m.classList.remove('in'); m.setAttribute('aria-hidden', 'true'); }
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                }
            """)
    except Exception as e:
        log(f"    [MODAL] Force-close failed: {e}")

    time.sleep(0.5)


def get_modal_text(modal) -> str:
    try:
        return modal.inner_text()[:6000]
    except Exception:
        return ""


def scrape_bihar_key_value_pairs(modal) -> dict:
    """Generic key/value extraction: every <table> row's cells are paired
    sequentially as label,value,label,value,... This correctly captures the
    General Information / Date Schedule / Pre-bid style tables (which
    render as 2 label-value pairs per row) without needing per-field
    selectors. Data-grid tables (Payment, Attachments, BOQ) produce some
    noise this way, but that's harmless — only known labels are read back
    out via build_frontend_tender_details()."""
    raw = {}
    tables = modal.locator("table")
    try:
        table_count = tables.count()
    except Exception:
        return raw

    for t in range(table_count):
        rows = tables.nth(t).locator("tr")
        for r in range(rows.count()):
            cells = rows.nth(r).locator("td, th")
            texts = []
            for c in range(cells.count()):
                txt = re.sub(r'\s+', ' ', cells.nth(c).inner_text().replace('\xa0', ' ')).strip()
                texts.append(txt)
            i = 0
            while i + 1 < len(texts):
                label, value = texts[i], texts[i + 1]
                if label and value and label not in raw:
                    raw[label] = value
                i += 2
    return raw


def scrape_bihar_payment_details(modal) -> dict:
    """The Payment table is a genuine data grid (Payment Type | Amount |
    Payment Mode | ...), not a label/value table, so it needs its own
    parser: {payment_type: amount}, e.g. {'EMD': '60000',
    'Tender Processing Fee': '1180'}."""
    payment = {}
    heading = modal.locator("div:text-is('Payment')")
    if heading.count() == 0:
        return payment
    table = heading.first.locator("xpath=following-sibling::table[1]")
    if table.count() == 0:
        return payment
    rows = table.first.locator("tr")
    payment_modes = []
    for r in range(1, rows.count()):  # skip header row
        cells = rows.nth(r).locator("td")
        if cells.count() < 2:
            continue
        ptype = cells.nth(0).inner_text().strip()
        amount = cells.nth(1).inner_text().strip()
        if ptype and amount:
            payment[ptype] = amount
        # Column 2 (Payment Mode, e.g. "Internet Payment Gateway(IPG),Challan|
        # Bank Guarantee") — captured here so build_frontend_tender_details()
        # can set a CLEAN "Payment Mode" value. Without this, the generic
        # scrape_bihar_key_value_pairs() table scraper mis-pairs this same
        # table's HEADER row cells (Payment Type/Amount/Payment Mode/
        # Payment Currency) into garbage like "Payment Mode": "Payment
        # Currency", which would otherwise silently leak straight into the
        # frontend field via `details = dict(raw_kv)`.
        if cells.count() >= 3:
            mode = cells.nth(2).inner_text().strip()
            if mode and mode not in payment_modes:
                payment_modes.append(mode)
    if payment_modes:
        payment["_payment_mode"] = " / ".join(payment_modes)
    return payment


def build_frontend_tender_details(raw_kv: dict, payment: dict, listing_data: dict) -> dict:
    """Maps Bihar's scraped label/value pairs onto the EXACT flat key names
    TenderDetails.jsx's `val()` lookups expect (see the 'OPEN TENDER
    FAST-PATH' block in Frontend/src/pages/Tenders/TenderDetails.jsx)."""

    def g(*labels):
        for lbl in labels:
            v = raw_kv.get(lbl)
            if v:
                return v
        return None

    details = dict(raw_kv)  # keep every raw label too, for reference/debugging

    # The generic 2-column table scraper (scrape_bihar_key_value_pairs)
    # mis-pairs the Payment table's own HEADER ROW cells (Payment Type /
    # Amount / Payment Mode / Payment Currency) into a garbage entry —
    # literally details["Payment Mode"] = "Payment Currency" — because it
    # has no way to know that specific table is a data grid, not a
    # label/value table. Overwrite it with the real value from the
    # dedicated Payment table parser instead of leaving that garbage in.
    if payment.get("_payment_mode"):
        details["Payment Mode"] = payment["_payment_mode"]
    elif "Payment Mode" in details:
        del details["Payment Mode"]

    details["Organisation Name"] = listing_data.get("department") or g("Tender Creator")
    org_hierarchy = g("Organization Hierarchy")
    if org_hierarchy:
        details["Organisation Chain"] = org_hierarchy

    if g("Procurement Category"):
        details["Tender Category"] = g("Procurement Category")
    if g("Tender Type"):
        details["Contract Type"] = g("Tender Type")
        details["Form Of Contract"] = g("Tender Type")

    work_desc = g("Detailed Description", "Description")
    if work_desc:
        details["Work Description"] = work_desc

    bid_validity = g("Offer Validity(In Days)")
    if bid_validity:
        details["Bid Validity(Days)"] = re.sub(r'\s*Days?\s*$', '', bid_validity.strip(), flags=re.IGNORECASE)

    bid_sub_start = g("Bid Submission Start Date")
    if bid_sub_start:
        details["Bid Submission Start Date"] = bid_sub_start
    bid_sub_end = g("Bid Submission Due Date")
    if bid_sub_end:
        details["Bid Submission End Date"] = bid_sub_end
    bid_open = g("Bid Open Date")
    if bid_open:
        details["Bid Opening Date"] = bid_open

    pre_bid_start = g("Pre-Bid Meeting Start Date")
    if pre_bid_start:
        details["Pre Bid Meeting Date"] = pre_bid_start
    pre_bid_venue = g("Venue Details")
    if pre_bid_venue:
        details["Pre Bid Meeting Place"] = pre_bid_venue

    emd = payment.get("EMD")
    if emd:
        details["EMD Amount in ₹"] = emd
    tender_fee = payment.get("Tender Processing Fee")
    if tender_fee:
        details["Tender Fee in ₹"] = tender_fee
        details["Processing Fee in ₹"] = tender_fee

    # Bihar doesn't expose distinct "Withdrawal Allowed" / "EMD Payable To" /
    # "NDA/Pre Qualification" fields the way NIC/GePNIC state portals do —
    # those stay N/A on the frontend since there's genuinely no source data.

    return details


def list_bihar_download_icons(modal) -> list:
    """Lists (without downloading) every download icon in the modal —
    Attachments table, Terms & Conditions RFP attachment, BOQ attachment.

    IMPORTANT: every one of these sections is rendered TWICE — once in a
    visible `table.tabular-print-show`, and once in a byte-for-byte
    duplicate `table.tabular-print-hidden` (style="display: none") used
    only for the browser's print layout. A plain `i.fa-download` selector
    picks up icons from BOTH copies; the hidden ones can never scroll into
    view or be clicked, which is exactly what produced the earlier
    'element is not visible' / generic 'Label'/'Clause No.' download
    failures. Scoping to `table.tabular-print-show` only fixes this."""
    icons = modal.locator("table.tabular-print-show i.fa-download")
    try:
        count = icons.count()
    except Exception:
        return []

    listed = []
    for i in range(count):
        icon = icons.nth(i)
        # The real filename lives in a sibling <span class="ng-binding">
        # within the same <td> as the download icon (e.g. "RFP..pdf",
        # "nit..pdf") — read it directly instead of guessing from row text.
        name_hint = f"attachment_{i + 1}"
        try:
            td = icon.locator("xpath=ancestor::td[1]")
            if td.count() > 0:
                span = td.first.locator("span.ng-binding").first
                if span.count() > 0:
                    txt = span.inner_text().strip()
                    if txt:
                        name_hint = txt[:150]
        except Exception:
            pass
        listed.append({"index": i, "name_hint": name_hint})
    return listed


def download_bihar_documents(modal, tender_id: str, icon_list: list) -> list:
    """Clicks each download icon one by one and saves the file to
    tender_documents/bihar_<tender_id>/."""
    results = []
    if not icon_list:
        return results

    save_dir = os.path.join(DOWNLOAD_DIR, f"bihar_{tender_id}")
    icons = modal.locator("table.tabular-print-show i.fa-download")

    for entry in icon_list:
        i = entry["index"]
        name_hint = entry["name_hint"]

        os.makedirs(save_dir, exist_ok=True)
        local_path = None
        try:
            icon = icons.nth(i)
            icon.scroll_into_view_if_needed(timeout=5000)
            page = icon.page
            with page.expect_download(timeout=15000) as dl_info:
                icon.click()
            download = dl_info.value
            fname = download.suggested_filename or name_hint
            local_path = os.path.join(save_dir, fname)
            download.save_as(local_path)
            log(f"      [DOWNLOAD] Saved: {local_path}")
        except Exception as e:
            log(f"      [DOWNLOAD] Failed for '{name_hint}': {e}")

        results.append({
            "document_name": os.path.basename(local_path) if local_path else name_hint,
            "url": None,
            "local_path": local_path,
            "status": "downloaded" if local_path else "failed",
        })

    return results


def extract_document_text(local_path: str, max_chars: int = 4000) -> str:
    """Best-effort text extraction from a downloaded document, so the
    'Doubt' confirmation pass can judge actual document content (not just
    the file name). Returns '' if extraction isn't possible.

    For Excel files: every sheet gets its own fair share of the character
    budget (see gujarat_scraper.py's identical rationale) so a genuinely
    relevant sheet doesn't get starved out by an irrelevant one earlier in
    the tab order."""
    if not local_path or not os.path.exists(local_path):
        return ""
    ext = os.path.splitext(local_path)[1].lower()
    try:
        if ext == ".pdf":
            import pdfplumber
            text_parts = []
            with pdfplumber.open(local_path) as pdf:
                for page in pdf.pages[:8]:
                    t = page.extract_text() or ""
                    if t:
                        text_parts.append(t)
                    if sum(len(p) for p in text_parts) >= max_chars:
                        break
            return "\n".join(text_parts)[:max_chars]
        elif ext in (".xlsx", ".xls"):
            import openpyxl
            wb = openpyxl.load_workbook(local_path, read_only=True, data_only=True)
            try:
                sheets = wb.worksheets
                if not sheets:
                    return ""
                per_sheet_budget = max(300, max_chars // len(sheets))
                sheet_parts = []
                for ws in sheets:
                    rows_text = []
                    used = 0
                    for row in ws.iter_rows(max_row=60, values_only=True):
                        cells = [str(c) for c in row if c is not None]
                        if not cells:
                            continue
                        line = " | ".join(cells)
                        rows_text.append(line)
                        used += len(line)
                        if used >= per_sheet_budget:
                            break
                    if rows_text:
                        sheet_parts.append(f"[Sheet: {ws.title}]\n" + "\n".join(rows_text))
                return "\n\n".join(sheet_parts)[:max_chars]
            finally:
                wb.close()
    except Exception as e:
        log(f"      [EXTRACT] Could not extract text from {os.path.basename(local_path)}: {e}")
    return ""


def _cleanup_tender_documents(tender_id: str):
    """Remove downloaded files for a tender that turned out to be irrelevant
    after the 2nd-pass confirmation — we only keep documents for confirmed
    relevant tenders. Retries briefly since a just-read Excel/PDF file can
    still hold a Windows file-lock for a moment after extraction."""
    save_dir = os.path.join(DOWNLOAD_DIR, f"bihar_{tender_id}")
    if not os.path.isdir(save_dir):
        return
    for attempt in range(3):
        try:
            shutil.rmtree(save_dir)
            log(f"      [CLEANUP] Removed downloaded documents for rejected Tender Id {tender_id}")
            return
        except Exception as e:
            if attempt == 2:
                log(f"      [CLEANUP] Could not remove {save_dir}: {e}")
            else:
                time.sleep(1)


def process_tender_details(page, row, listing_data: dict,
                            need_confirmation: bool, current_reason: str,
                            current_dept) -> dict:
    """Opens the preview modal once, downloads every attachment (needed
    either way — for a "Yes" verdict to keep, or for a "Doubt" verdict to
    read their actual content for confirmation), scrapes the structured
    key/value fields into the flat shape TenderDetails.jsx expects, then —
    for "Doubt" verdicts only — sends the details text + downloaded document
    content excerpts to Ollama for a final decision. If confirmed
    irrelevant, the downloaded files are deleted. Always closes the modal.

    Returns:
        {
          "final_status": "proceed_futher" | "no",
          "reason": str,
          "dept": str | None,
          "documents": [...],          # only populated if final_status == "proceed_futher"
          "details_text": str,
          "structured_details": dict,  # flat, frontend-key-mapped tender metadata
        }
    """
    tender_id = listing_data["tender_id"]
    tender_title = listing_data["tender_title"]
    modal = None
    try:
        modal = open_preview_modal(page, row)
        if modal is None:
            return {"final_status": "no", "reason": "Could not open preview modal.",
                     "dept": current_dept, "documents": [], "details_text": "",
                     "structured_details": {}}

        details_text = get_modal_text(modal)
        raw_kv = scrape_bihar_key_value_pairs(modal)
        payment = scrape_bihar_payment_details(modal)
        structured_details = build_frontend_tender_details(raw_kv, payment, listing_data)
        icon_list = list_bihar_download_icons(modal)

        # Always download — a "Yes" verdict needs the files kept, and a
        # "Doubt" verdict needs the actual content to confirm with Ollama.
        documents = download_bihar_documents(modal, tender_id, icon_list)

        final_status = "proceed_futher"
        reason = current_reason
        dept = current_dept

        if need_confirmation:
            doc_excerpts = []
            for d in documents:
                excerpt = extract_document_text(d.get("local_path"))
                log(f"      [EXTRACT] '{d['document_name']}' -> {len(excerpt)} char(s) extracted"
                    + ("" if excerpt else " (EMPTY — extraction failed or unsupported file type)"))
                doc_excerpts.append({"document_name": d["document_name"], "excerpt": excerpt})

            final_status, reason, confirmed_dept = confirm_doubtful_tender(
                tender_title, details_text, doc_excerpts
            )
            dept = confirmed_dept or current_dept

            if final_status == "no":
                _cleanup_tender_documents(tender_id)
                documents = []

        return {
            "final_status": final_status,
            "reason": reason,
            "dept": dept,
            "documents": documents,
            "details_text": details_text,
            "structured_details": structured_details,
        }
    except Exception as e:
        log(f"    [DETAILS ERROR] {e}")
        return {"final_status": "no", "reason": f"Details page error: {e}",
                 "dept": current_dept, "documents": [], "details_text": "",
                 "structured_details": {}}
    finally:
        close_preview_modal(page, modal)


def format_closing_date_for_db(raw: str) -> str:
    """Bihar shows dates in two different formats — the listing's 'End
    Date' column ('2026-08-13 13:00', ISO-ish) and the modal's 'Bid
    Submission Due Date' ('13-08-2026 01:00 PM', numeric-month 12h). The
    backend's open-tenders listing filters on
    STR_TO_DATE(closing_date, '%d-%M-%Y %h:%i %p') — the same
    'DD-Mon-YYYY hh:mm AM/PM' format every other scraper writes. Storing
    either raw Bihar format makes STR_TO_DATE return NULL, which silently
    drops the tender from every "closing in the future" listing query."""
    if not raw:
        return raw
    raw = raw.strip()
    for fmt in ("%d-%m-%Y %I:%M %p", "%Y-%m-%d %H:%M"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.strftime("%d-%b-%Y %I:%M %p")
        except ValueError:
            continue
    return raw


# ══════════════════════════════════════════════════════════════════════════════
# Main scraping loop
# ══════════════════════════════════════════════════════════════════════════════

def scrape_all_tenders(page, conn, stop_after_first_relevant: bool = False) -> list:
    all_rows = []
    saved, skipped = 0, 0

    rows_loc = page.locator("table#myTablebyrTl tbody tr")
    row_count = rows_loc.count()
    log(f"[TENDERS] {row_count} row(s) loaded so far — will click 'More...' as needed")

    i = 0
    while True:
        if i >= row_count:
            # Reached the end of what's currently loaded — pull in the next
            # batch on demand instead of front-loading everything up front.
            if not click_more_once(page):
                log("[LOAD MORE] No more tenders to load — reached the end of the list.")
                break
            rows_loc = page.locator("table#myTablebyrTl tbody tr")
            row_count = rows_loc.count()
            log(f"[TENDERS] {row_count} row(s) loaded so far")
            continue

        row = rows_loc.nth(i)
        try:
            row.scroll_into_view_if_needed(timeout=5000)
        except Exception:
            pass
        try:
            listing_data = parse_listing_row(row)
            if not listing_data.get("tender_id"):
                continue

            title = listing_data["tender_title"]

            # PASS 1: filter on the listing description, before opening anything
            f_status, f_reason, dept_tag, decision = filter_tender(title)

            if f_status == "no":
                skipped += 1
                all_rows.append([
                    i + 1, listing_data["tender_id"], listing_data["tender_refno"],
                    listing_data["department"], title, listing_data["end_date"],
                    "", dept_tag or "", f_status, f_reason,
                ])
                continue

            # PASS 1 says Yes/Doubt -> open the preview modal. For "Doubt"
            # verdicts, run a 2nd-pass confirmation using the details text +
            # downloaded document content BEFORE keeping anything.
            need_confirmation = (decision == "Doubt")
            log(f"    [{i+1}/{row_count}] Opening preview for Tender Id "
                f"{listing_data['tender_id']} — {title[:70]} "
                f"(verdict: {decision}{', confirming...' if need_confirmation else ''})")

            result = process_tender_details(
                page, row, listing_data,
                need_confirmation, f_reason, dept_tag,
            )
            f_status = result["final_status"]
            f_reason = result["reason"]
            dept_tag = result["dept"]
            documents = result["documents"]

            if f_status == "no":
                skipped += 1
                all_rows.append([
                    i + 1, listing_data["tender_id"], listing_data["tender_refno"],
                    listing_data["department"], title, listing_data["end_date"],
                    "", dept_tag or "", f_status, f_reason,
                ])
                # Re-locate rows after modal open/close touched the DOM
                rows_loc = page.locator("table#myTablebyrTl tbody tr")
                continue

            doc_names = "; ".join(d["document_name"] for d in documents)
            combined = result["structured_details"]

            all_rows.append([
                i + 1, listing_data["tender_id"], listing_data["tender_refno"],
                listing_data["department"], title, listing_data["end_date"],
                doc_names, dept_tag or "", f_status, f_reason,
            ])

            if conn:
                file_link_json, downloaded_documents_json = build_documents_json(documents)
                closing_date_raw = combined.get("Bid Submission End Date") or listing_data["end_date"]
                record = {
                    "state":                STATE_NAME,
                    "organisation_name":    listing_data["department"],
                    "closing_date":         format_closing_date_for_db(closing_date_raw),
                    "tender_title":         title,
                    "tender_refno":         make_db_refno(listing_data["tender_refno"], listing_data["tender_id"]),
                    "tender_id":            listing_data["tender_id"],
                    "organisation_chain":   combined.get("Organisation Chain") or listing_data["department"],
                    "tender_details":       json.dumps(combined, ensure_ascii=False),
                    "structured_details":   combined,
                    "file_link":            file_link_json,
                    "downloaded_documents": downloaded_documents_json,
                    "relevency_checker":    f_status,
                    "relevancy_reason":     f_reason,
                    "suggested_product":    None,
                    "dept":                 (dept_tag or "Unknown").lower(),
                }
                upsert_tender(conn, record)
            saved += 1

            downloaded = [d["local_path"] for d in documents if d.get("local_path")]
            print("\n" + "=" * 78)
            print("RELEVANT TENDER SAVED")
            print("=" * 78)
            print(f"  Tender Reference No: {listing_data['tender_refno']}")
            print(f"  Tender Id          : {listing_data['tender_id']}")
            print(f"  Title              : {title}")
            print(f"  Department         : {listing_data['department']}")
            print(f"  End Date           : {listing_data['end_date']}")
            print(f"  Dept (LLM)         : {dept_tag}")
            print(f"  Filter Reason      : {f_reason}")
            print(f"  Documents Saved ({len(downloaded)}):")
            for p in downloaded:
                print(f"      - {p}")
            print("=" * 78 + "\n")

            log(f"[SAVED] Tender Id {listing_data['tender_id']} — dept: {dept_tag}, "
                f"{len(downloaded)} document(s) downloaded.")

            if stop_after_first_relevant:
                log(f"[STOP] First relevant tender found — Tender Id "
                    f"{listing_data['tender_id']}. Halting as requested.")
                return all_rows

            # Re-locate rows after modal open/close touched the DOM
            rows_loc = page.locator("table#myTablebyrTl tbody tr")
            row_count = rows_loc.count()

        except Exception as e:
            log(f"    [SKIP] row {i+1}: {e}")
        finally:
            i += 1

    log(f"[DONE] Processed {saved + skipped} tender(s) (saved={saved} skipped={skipped})")
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
        accept_downloads=True,
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
        # Bihar's Angular app occasionally aborts the initial navigation
        # (hash-routing triggers a mid-load redirect that Playwright reports
        # as "frame was detached") — retry a couple of times before giving up.
        for attempt in range(1, 4):
            try:
                page.goto(BASE_URL, timeout=60000, wait_until="domcontentloaded")
                break
            except Exception as e:
                log(f"[STEP 1] Navigation attempt {attempt}/3 failed: {e}")
                if attempt == 3:
                    raise
                time.sleep(3)

        # Step 2: Wait for page load (Angular app bootstrap + first AJAX load)
        log("[STEP 2] Waiting for page load...")
        time.sleep(6)

        # Step 3: Scrape every tender (loads all via 'More...' first)
        log("[STEP 3] Scraping Latest Tenders (all rows)...")
        rows = scrape_all_tenders(page, conn, stop_after_first_relevant=True)
        if rows:
            append_csv(OUTPUT_FILE, rows)
        log(f"[DONE] Total tenders processed: {len(rows)}")

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

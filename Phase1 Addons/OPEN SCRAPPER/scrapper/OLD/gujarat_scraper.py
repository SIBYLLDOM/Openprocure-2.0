"""
gujarat_scraper.py
===================
nProcure (Gujarat) eProcurement Portal — Full Tender Listing Scraper
https://tender.nprocure.com/

Processes EVERY tender across EVERY page (does not stop after the first
relevant hit) — same per-tender pipeline as gujarat_single_tender_scraper.py,
just run continuously against the full listing instead of one looked-up ID.

Flow:
  1. Open site, wait for page load, scroll to render the 50-row tender table
  2. For each row on the page:
       a. Read ONLY the tender title from the listing row
       b. PASS 1 — Ask Ollama: is this relevant to Meril Endo / Meril Diagno?
            - Hard-reject on obvious civil/electrical-infra keywords first
            - "No"    -> skip entirely (no details tab, no downloads, no DB insert)
            - "Yes"   -> proceed straight to details/download
            - "Doubt" -> proceed to details tab, but do NOT download yet
       c. Click "Name Of Work" -> tender details open in a NEW TAB; scrape
          the details text, the structured Amount/Other/Calendar Details
          sections (mapped to the exact fields the portal's tender detail
          page expects), and list (not yet download) the Tender Documents.
       d. PASS 2 (only for "Doubt" verdicts) — send the details text + the
          actual downloaded document content (PDF/Excel text extraction) to
          Ollama for a final, confident Yes/No decision.
            - "No"  -> discard, delete downloaded files, no DB insert
            - "Yes" -> keep the downloaded files
       e. If still relevant after both passes: documents are already
          downloaded to tender_documents/<tender_id>/; close the tab
       f. Upsert relevant rows into MySQL (open_tender_details) — with
          disambiguated tender_refno (nProcure notice numbers are shared
          across multiple distinct tenders), correctly-formatted
          closing_date, and structured tender_details/downloaded_documents
          JSON the frontend renders directly — and write every row
          (relevant or not) to row_data_gujarat.csv for audit
  3. Click pagination "Next" and repeat until the Next button is disabled
     (class contains "disabled"), across every page in the listing

Usage:
    python gujarat_scraper.py
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
BASE_URL = "https://tender.nprocure.com/"
STATE_NAME = "Gujarat"
OUTPUT_FILE = "row_data_gujarat.csv"

_SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(_SCRIPT_DIR, "tender_documents")

CSV_HEADERS = [
    "s_no", "tender_id", "tender_refno", "organisation_name", "tender_title",
    "estimated_value", "bid_closure_date", "documents", "dept",
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
    """Print timestamped log message."""
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"  [{ts}] {msg}"
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", errors="replace").decode("ascii"), flush=True)


# ══════════════════════════════════════════════════════════════════════════════
# RELEVANCY FILTER (Ollama LLM) — Meril Endo + Meril Diagno, title-only
# ══════════════════════════════════════════════════════════════════════════════

OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL    = "gpt-oss:120b-cloud"

_PARENT_DIR = os.path.dirname(_SCRIPT_DIR)  # .../OPEN SCRAPPER/scrapper


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

DIAGNO PRODUCT CATEGORIES (tender must match at least one of these to be relevant):
{_DIAGNO_CATEGORIES}
"""

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

MERIL_NOT_SOLD = """
Meril does NOT sell:
  X-ray / MRI / CT / Ultrasound machines, ventilators, oxygen concentrators,
  general pharmaceuticals, hospital furniture, civil/construction/infrastructure work,
  road/building/bridge/water-supply/irrigation works, electrical/power-infra works,
  IT/software, uniforms, stationery, food items, gloves, masks, swabs,
  industrial chemicals, waterproofing/geo-textile/construction mesh,
  or any non-IVD, non-surgical medical products.
  NOTE: "mesh" or "stapler" in a CONSTRUCTION / CIVIL / IRRIGATION / WATERPROOFING
  context is NOT our product.
"""

FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd
(covering both the Endo/Surgical Division and the Diagno/IVD Division).

Your ONLY job: decide whether a government tender is worth pursuing — does its
TITLE suggest it asks for products that Meril Endo or Meril Diagno actually sell?
You are given ONLY the tender title, so judge from that alone.

{MERIL_ENDO_PRODUCTS}
{MERIL_DIAGNO_PRODUCTS}
{MERIL_NOT_SOLD}

DECISION RULES:
1. If the title clearly mentions ANY Endo or Diagno product above -> "Yes",
   and set "dept" to "Endo" or "Diagno" accordingly.
2. If the title EXPLICITLY signals a medical/surgical/hospital/lab/diagnostic
   context (contains a word like: hospital, medical, surgical, OT / operation
   theatre, ICU, clinic, pathology, lab, laboratory, diagnostic, blood bank,
   dialysis, PHC, CHC, GMERS, civil hospital) BUT the exact product is still
   vague ("medical consumables", "hospital supplies", "lab equipment",
   "surgical items") -> "Doubt", with your best guess at "dept".
3. GENERIC / ADMINISTRATIVE titles with NO medical/surgical/diagnostic word
   at all -> "No". This includes things like "petty supply", "rate contract",
   "general store items", "AMC", "annual maintenance", "misc goods",
   "stationery", "printing", "housekeeping", "security services",
   "furniture", "civil work", "electrical work", "IT/software" — even if the
   issuing organisation happens to be a hospital or medical institute. The
   organisation name is NOT given to you and must NOT be assumed; judge the
   title text alone.
4. If truly unsure after applying rules 1-3 -> "Doubt", but do not use this to
   rescue titles that fail rule 3.
5. Return "No" whenever the title has nothing to do with surgical/endosurgery
   products or IVD diagnostic products.

CRITICAL: "Yes" and "Doubt" both proceed to review — use "Doubt" only when
          there is an actual medical/surgical/diagnostic signal in the title.
          Do NOT mark generic supply/administrative/rate-contract titles as
          "Doubt" just because they *could* theoretically include anything —
          that produces too many false positives. Only "No" drops the tender
          entirely, but a purely generic title with zero medical signal
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


def _build_filter_message(tender_title: str) -> str:
    return (
        "Please evaluate whether this tender is relevant for Meril Life Sciences,\n"
        "using ONLY the title below:\n\n"
        f"Title : {tender_title}\n\n"
        "Return ONLY the JSON decision object as specified in the system prompt."
    )


def _ask_llm(tender_title: str) -> dict:
    messages = [
        {"role": "system", "content": FILTER_SYSTEM_PROMPT},
        {"role": "user",   "content": _build_filter_message(tender_title)},
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


def filter_tender(tender_title: str) -> tuple:
    """Returns (status, reason, dept, decision). status: 'proceed_futher' | 'no'
    decision is the raw LLM verdict: 'Yes' | 'Doubt' | 'No' (hard-reject also
    reports as 'No')."""
    title_lower = tender_title.lower()

    elec_signals = [
        "rdss", "substation", "33/11 kv", "11/33 kv", "33 kv", "11 kv",
        "mv line", "lt line", "ht line", "power distribution", "electricity supply",
        "distribution transformer", "power transformer", "feeder pillar",
        "bijli corporation", "vidyut vitran", "electricity board",
    ]
    civil_signals = [
        "road resurfacing", "road work", "bridge construction", "building construction",
        "water supply pipeline", "drainage work", "irrigation canal", "cc road",
        "asphalt", "paver block",
    ]
    matched = next((s for s in elec_signals + civil_signals if s in title_lower), None)
    if matched:
        reason = f"Hard-reject: civil/electrical-infra signal '{matched}' — not a Meril product."
        log(f"    [FILTER] HARD-REJECT (signal: {matched})")
        return "no", reason, None, "No"

    log(f"    [FILTER] -> Ollama: {tender_title[:80]}")
    result = _ask_llm(tender_title)

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
# Second-pass confirmation for "Doubt" verdicts — sends the details page text
# and document names to Ollama for a final Yes/No call.
# ══════════════════════════════════════════════════════════════════════════════

CONFIRM_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd
(covering both the Endo/Surgical Division and the Diagno/IVD Division).

A tender title was FLAGGED AS "Doubt" on a first pass (title alone was
ambiguous). You are now given the tender's DETAILS PAGE TEXT and the ACTUAL
CONTENT EXCERPTS of its downloaded tender documents (extracted from the PDF/
Excel files) to make a FINAL, CONFIDENT decision.

{MERIL_ENDO_PRODUCTS}
{MERIL_DIAGNO_PRODUCTS}
{MERIL_NOT_SOLD}

DECISION RULES:
1. Excel/spreadsheet documents are often split into MULTIPLE SHEETS (each
   marked "[Sheet: <name>]" in the excerpt below), e.g. one sheet of
   biochemistry/hematology reagents, another of generic miscellaneous
   consumables (lancets, tubes, etc). Read EVERY sheet section given, not
   just the first one — a single irrelevant sheet does NOT make the whole
   tender irrelevant if ANOTHER sheet/line-item lists a real Meril product.
2. If ANY line item across the details text or ANY document/sheet excerpt
   matches a real Meril Endo or Meril Diagno product/category above (e.g. a
   named reagent like Albumin, Calcium, Glucose, Cholesterol, HbA1c,
   Triglycerides, CRP, Bilirubin, Urea, Uric Acid, ALT/AST/SGOT/SGPT,
   Amylase, LDH — these ARE Meril Diagno biochemistry/HbA1c reagent
   categories — or a surgical item matching Meril Endo's range) -> "Yes",
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


def _build_confirm_message(tender_title: str, details_text: str, doc_excerpts: list) -> str:
    lines = [
        "This tender was marked 'Doubt' on the title-only pass. Please make a",
        "final Yes/No call using the additional evidence below, which includes",
        "the actual downloaded document content where extraction succeeded.",
        "",
        f"Title            : {tender_title}",
    ]
    if doc_excerpts:
        lines += ["", "Downloaded Documents :"]
        for d in doc_excerpts[:10]:
            lines.append(f"  - {d['document_name']}")
            excerpt = d.get("excerpt") or ""
            if excerpt:
                lines.append(f"    Content excerpt:\n{excerpt[:4000]}")
    if details_text:
        lines += ["", f"Details Page Text (excerpt) : {details_text[:2000]}"]
    lines += ["", "Return ONLY the JSON decision object as specified in the system prompt."]
    return "\n".join(lines)


def _ask_llm_confirm(tender_title: str, details_text: str, doc_excerpts: list) -> dict:
    messages = [
        {"role": "system", "content": CONFIRM_SYSTEM_PROMPT},
        {"role": "user",   "content": _build_confirm_message(tender_title, details_text, doc_excerpts)},
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


def confirm_doubtful_tender(tender_title: str, details_text: str, doc_excerpts: list) -> tuple:
    """Second-pass check for a 'Doubt' verdict, using the actual downloaded
    document content. Returns (status, reason, dept). status: 'proceed_futher' | 'no'."""
    log(f"    [CONFIRM] Doubt tender -> asking Ollama with details+"
        f"{len(doc_excerpts)} downloaded document(s)...")
    result = _ask_llm_confirm(tender_title, details_text, doc_excerpts)

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
    """nProcure's 'Tender Notice No' is a batch notice number shared by
    MULTIPLE distinct tenders (e.g. several separate tenders posted by the
    same hospital under one annual notice like "01/2026-2027"). But
    open_tender_details.tender_refno is the table's UNIQUE key — shared
    with many other scrapers, so not something this scraper can change.
    Storing the raw notice number as-is would let two different tenders
    silently collide on that unique key and overwrite each other (this
    happened in testing: tender 332935 clobbered tender 332936's row).
    Disambiguate by embedding the tender_id, which IS unique per tender,
    so every tender gets its own row regardless of shared notice numbers."""
    refno = (tender_refno or "").strip()
    tid = (tender_id or "").strip()
    if not refno:
        return f"TID-{tid}"
    return f"{refno} [TID:{tid}]"


def _trunc(v, n):
    """Safely fit a scraped value into a fixed-width varchar column —
    without this, a long value (e.g. Period Of Work coming back as 'As per
    tender Document Attached' into a varchar(20)) raises a truncation error
    and the whole upsert silently fails via the except/rollback below."""
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
    Gujarat tender, since the original upsert_tender() only ever wrote the
    JSON blob and never touched these columns at all."""
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
        "pre_bid_meeting_date":    _trunc(g("Pre Bid Meeting Date"), 50),
        "pre_bid_meeting_place":   _trunc(g("Pre Bid Meeting Place"), 255),
        "location":                _trunc(g("Location"), 255),
        "opening_date":            _trunc(g("Bid Opening Date"), 100),
        # "Published Date" on the frontend reads openTenderMeta.startDate,
        # which comes straight from this DB column (e_published_date), NOT
        # from the tender_details JSON — so it must be written here too,
        # unlike every other field above which the frontend reads from JSON.
        "e_published_date":        _trunc(g("Published Date"), 100),
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


def format_closing_date_for_db(raw: str) -> str:
    """nProcure renders closing dates as 'DD-MM-YYYY HH:MM:SS' (24h), but the
    backend's open-tenders listing filters on
    STR_TO_DATE(closing_date, '%d-%M-%Y %h:%i %p') — the same
    'DD-Mon-YYYY hh:mm AM/PM' format every other scraper writes (e.g.
    '13-Jul-2026 05:00 PM'). Storing the raw nProcure format makes
    STR_TO_DATE return NULL, which silently drops the tender from every
    "closing in the future" listing query — it never crashes, it just never
    shows up. Reformat here so relevant tenders are actually visible."""
    if not raw:
        return raw
    try:
        dt = datetime.strptime(raw.strip(), "%d-%m-%Y %H:%M:%S")
        return dt.strftime("%d-%b-%Y %I:%M %p")
    except ValueError:
        return raw


# ══════════════════════════════════════════════════════════════════════════════
# Listing row parsing
# ══════════════════════════════════════════════════════════════════════════════

def parse_listing_row(row) -> dict:
    """Extract fields from a listing <tr> using the td2 text blob, matching
    the structure shown in the sample row markup (tender id, name of work,
    estimated value, submission date)."""
    tds = row.locator("td")
    td_count = tds.count()

    tender_refno = tds.nth(0).inner_text().strip() if td_count > 0 else ""
    td2_text = tds.nth(1).inner_text().strip() if td_count > 1 else ""

    tid_match = re.search(r'Tender Id\s*:\s*(\d+)', td2_text)
    tender_id = tid_match.group(1) if tid_match else ""

    # "Name Of Work :" runs up to the next known label (Corrigendum / Estimated
    # Contract Value / Last Date) rather than a newline — the markup often
    # renders these inline without a line break.
    work_match = re.search(
        r'Name Of Work\s*:(.*?)(?=Corrigendum\s*:|Estimated Contract Value\s*:|'
        r'Last Date\s*&\s*Time For Submission\s*:|$)',
        td2_text, re.DOTALL,
    )
    tender_title = work_match.group(1).strip() if work_match else ""

    value_match = re.search(r'Estimated Contract Value\s*:\s*([\d,.]+)', td2_text)
    estimated_value = value_match.group(1) if value_match else ""

    date_match = re.search(r'Last Date\s*&\s*Time For Submission\s*:\s*(.*)', td2_text)
    bid_closure_date = date_match.group(1).strip() if date_match else ""

    # Organisation name is the text before the first "Tender Id :" marker
    # (the markup embeds "Tender Id :NNNNN" right after the org name on the
    # same line, with no separator).
    org_match = re.match(r'^(.*?)Tender Id\s*:\s*\d+', td2_text, re.DOTALL)
    org = org_match.group(1).strip() if org_match else (
        td2_text.splitlines()[0].strip() if td2_text.splitlines() else ""
    )

    return {
        "tender_refno":      tender_refno,
        "tender_id":         tender_id,
        "organisation_name": org,
        "tender_title":      tender_title,
        "estimated_value":   estimated_value,
        "bid_closure_date":  bid_closure_date,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Tender details page (opens in a new tab) + document downloads
# ══════════════════════════════════════════════════════════════════════════════

def _direct_download(tab, href: str, save_dir: str, filename_hint: str) -> str | None:
    """Fallback: fetch the document via the browser context's own request
    API (reuses session cookies) instead of relying on a click -> download
    event, which some browsers/servers don't fire for same-tab navigations."""
    try:
        abs_url = urllib.parse.urljoin(tab.url, href)
        resp = tab.context.request.get(abs_url)
        if not resp.ok:
            log(f"      [DOWNLOAD] Direct request failed: HTTP {resp.status}")
            return None
        os.makedirs(save_dir, exist_ok=True)
        fname = filename_hint if os.path.splitext(filename_hint)[1] else f"{filename_hint}.pdf"
        fname = re.sub(r'[\\/:*?"<>|]', "_", fname)
        local_path = os.path.join(save_dir, fname)
        with open(local_path, "wb") as f:
            f.write(resp.body())
        log(f"      [DOWNLOAD] Saved via direct request: {local_path}")
        return local_path
    except Exception as e:
        log(f"      [DOWNLOAD] Direct request also failed: {e}")
        return None


def open_details_tab(context, row):
    """Click the 'Name Of Work' link for this row -> returns the new tab
    (caller is responsible for closing it via close_details_tab)."""
    work_link = row.locator("a#tenderInProgress").filter(has_text="Name Of Work")
    if work_link.count() == 0:
        work_link = row.locator("a:has-text('Name Of Work')")
    if work_link.count() == 0:
        return None

    with context.expect_page(timeout=15000) as new_tab_info:
        work_link.first.click()
    tab = new_tab_info.value
    tab.wait_for_load_state("domcontentloaded", timeout=30000)
    time.sleep(2)

    # Scroll to the bottom so any lazy-rendered content (incl. the
    # Tender Documents section) is present in the DOM.
    try:
        tab.mouse.wheel(0, 3000)
        time.sleep(1)
        tab.mouse.wheel(0, 3000)
        time.sleep(1)
    except Exception:
        pass

    return tab


def close_details_tab(tab):
    if tab is None:
        return
    try:
        close_btn = tab.locator("button:has-text('Close')")
        if close_btn.count() > 0:
            close_btn.first.click()
            time.sleep(1)
    except Exception:
        pass
    try:
        if not tab.is_closed():
            tab.close()
    except Exception:
        pass


def get_details_text(tab) -> str:
    try:
        tab.wait_for_selector("body", timeout=15000)
    except PlaywrightTimeoutError:
        pass
    try:
        return tab.inner_text("body")[:3000]
    except Exception:
        return ""


def scrape_key_value_sections(tab) -> dict:
    """Scrape every simple 2-column (label, value) table on the details page
    into a flat {raw_label: value} dict. The nProcure details page renders
    "Tender ID / BOQ", "Calender Details", "Amount Details" and "Other
    Details" as plain label/value tables — this captures all of them
    generically. Multi-column tables (Tender Stages, Forms, Documents) are
    skipped since every row there has 3+ cells, not 2."""
    raw = {}
    sections = tab.locator("section")
    try:
        count = sections.count()
    except Exception:
        return raw

    for i in range(count):
        sec = sections.nth(i)
        tables = sec.locator("table")
        for t in range(tables.count()):
            trows = tables.nth(t).locator("tr")
            for r in range(trows.count()):
                cells = trows.nth(r).locator("td, th")
                if cells.count() != 2:
                    continue
                # nProcure renders some labels with non-breaking spaces
                # (\xa0) instead of regular spaces (e.g. "Bidding Processing
                # Fee\xa0(\xa0OFFLINE)") and inconsistent internal spacing —
                # normalize both so exact-key lookups in
                # build_frontend_tender_details() actually match.
                label = re.sub(r'\s+', ' ', cells.nth(0).inner_text().replace('\xa0', ' ')).strip()
                value = re.sub(r'\s+', ' ', cells.nth(1).inner_text().replace('\xa0', ' ')).strip()
                if label and value and label not in raw:
                    raw[label] = value
    return raw


def _extract_amount(raw_value: str) -> str:
    """Pulls the leading numeric amount out of strings like
    '25,000 INR. (Twenty Five Thousand )' -> '25,000'."""
    if not raw_value:
        return ""
    m = re.match(r'^\s*([\d,]+(?:\.\d+)?)', raw_value)
    return m.group(1) if m else ""


def build_frontend_tender_details(raw_kv: dict, listing_data: dict) -> dict:
    """Maps nProcure's raw scraped label/value pairs onto the EXACT flat key
    names TenderDetails.jsx's `val()` lookups expect (see the 'OPEN TENDER
    FAST-PATH' block in Frontend/src/pages/Tenders/TenderDetails.jsx) so the
    Work Description / Payment Mode / Processing Fee / EMD Payable To / Bid
    Submission dates etc. sections render real data instead of N/A. Also
    keeps the raw nProcure labels alongside (harmless — val() only reads the
    specific keys it asks for) so nothing scraped is thrown away."""

    def g(*labels):
        for lbl in labels:
            v = raw_kv.get(lbl)
            if v:
                return v
        return None

    def g_re(pattern):
        """Regex-based fallback for labels whose exact punctuation/spacing
        varies between departments (e.g. some render 'INR( OFFLINE)' with
        no space before the parenthesis, others 'INR ( OFFLINE)' with one —
        an exact-string lookup silently drops the value on whichever
        variant it wasn't written for, exactly like it did for tender
        329493's EMD amount)."""
        rx = re.compile(pattern, re.IGNORECASE)
        for k, v in raw_kv.items():
            if v and rx.search(k):
                return v
        return None

    details = dict(raw_kv)  # keep every raw label too, for reference/debugging

    org_name = g("Organization Name")
    if org_name:
        details["Organisation Name"] = org_name

    location = g("Location")
    if location:
        details["Location"] = location

    department = g("Department")
    sub_department = g("Sub Department")
    if department or sub_department:
        details["Organisation Chain"] = " / ".join(p for p in (department, sub_department) if p)

    if g("Tender Category"):
        details["Tender Category"] = g("Tender Category")
    if g("Product Category"):
        details["Product Category"] = g("Product Category")
    if g("Form of Contract"):
        details["Form Of Contract"] = g("Form of Contract")
        details["Contract Type"] = g("Form of Contract")
    if g("Tender Type"):
        details["Tender Type"] = g("Tender Type")

    work_desc = g("Description of Material/Name of Work", "Tender title/Name Of Project")
    if work_desc:
        details["Work Description"] = work_desc

    period = g("Period of Completion/Delivery Period")
    if period:
        details["Period Of Work(Days)"] = period.strip()

    bid_validity = g("Bid validity")
    if bid_validity:
        details["Bid Validity(Days)"] = re.sub(r'\s*Days?\s*$', '', bid_validity.strip(), flags=re.IGNORECASE)

    bid_sub_start = g("Bid Submission Start Date")
    if bid_sub_start:
        details["Bid Submission Start Date"] = bid_sub_start
        # nProcure doesn't publish a distinct "Bid Opening Date" field for
        # Gujarat tenders (confirmed by scraping every label on the page —
        # only "Bid Opening Authority" exists, never a date/time) — per
        # instruction, treat the Bid Submission Start Date as the opening
        # date instead of leaving this permanently N/A.
        details["Bid Opening Date"] = bid_sub_start
    bid_sub_end = g("Bid Submission Closing Date")
    if bid_sub_end:
        details["Bid Submission End Date"] = bid_sub_end

    pre_bid = g("Pre-Bid Meeting")
    if pre_bid and pre_bid.lower() not in ("no meeting", "n/a"):
        details["Pre Bid Meeting Date"] = pre_bid

    processing_fee_raw = g_re(r'Bidding Processing Fee\s*\(\s*OFFLINE\s*\)')
    if processing_fee_raw:
        amt = _extract_amount(processing_fee_raw)
        if amt:
            details["Tender Fee in ₹"] = amt
            details["Processing Fee in ₹"] = amt
    if g("Bidding Processing Fee Payable to"):
        details["Tender Fee Payable To"] = g("Bidding Processing Fee Payable to")

    emd_raw = g_re(r'Bid Security\s*/\s*EMD\s*/\s*Proposal Security INR\s*\(\s*OFFLINE\s*\)')
    if emd_raw:
        amt = _extract_amount(emd_raw)
        if amt:
            details["EMD Amount in ₹"] = amt
    emd_payable_to = g("Bid Security/EMD/Proposal Security INR Payable to")
    if emd_payable_to:
        details["EMD Payable To"] = emd_payable_to
    emd_payable_at = g("Bid Security/EMD/Proposal Security INR Payable at")
    if emd_payable_at:
        details["EMD Payable At"] = emd_payable_at

    # nProcure has no dedicated "Payment Mode" field, but the fee/EMD labels
    # themselves carry an "(OFFLINE)" marker (e.g. "...INR( OFFLINE)") —
    # that IS the payment mode (physical DD/challan, not an online
    # gateway), so infer it from there instead of leaving this N/A when the
    # site is already telling us the answer.
    if processing_fee_raw or emd_raw:
        details["Payment Mode"] = "Offline"

    # "Withdrawal Allowed" / "NDA/Pre Qualification" (unlike Payment Mode)
    # genuinely have no source data anywhere on nProcure's page — confirmed
    # by scraping every label present — so these stay N/A on the frontend.

    bid_doc_download_start = g("Bid Document Download Start Date")
    if bid_doc_download_start:
        details["Published Date"] = bid_doc_download_start

    # Fall back to the listing page's estimated value only if it's a real
    # (non-zero) figure — nProcure often shows "0.00" meaning "refer document".
    est_value = (listing_data.get("estimated_value") or "").strip()
    if est_value and est_value not in ("0", "0.00", "0.0"):
        details["Tender Value in ₹"] = est_value

    return details


def list_tender_documents(tab) -> list:
    """List (without downloading) every 'Tender Documents' link on the
    details page: [{document_name, href, index}, ...].

    Matched directly on the distinctive /common/download href pattern
    instead of the surrounding table structure — the table can render
    slowly / behind lazy content, but the anchor tags are reliably present
    once the section has loaded, and this keeps the selector working even
    if the page markup around the table shifts."""
    try:
        tab.wait_for_selector("a[href*='/common/download']", timeout=15000)
    except PlaywrightTimeoutError:
        log("      [DOCS] No document download links found on details page.")
        return []

    links = tab.locator("a[href*='/common/download']")
    count = links.count()
    log(f"      [DOCS] Found {count} document link(s) on details page")

    listed = []
    for i in range(count):
        link = links.nth(i)
        href = link.get_attribute("href") or ""
        name = link.inner_text().strip()
        if not name:
            m = re.search(r'[?&]name=([^&]+)', href)
            name = urllib.parse.unquote(m.group(1)) if m else f"document_{i + 1}"
        listed.append({"document_name": name, "href": href, "index": i})
    return listed


def download_documents_list(tab, tender_id: str, doc_list: list) -> list:
    """Download each entry from list_tender_documents() into
    tender_documents/<tender_id>/, clicking each document link one by one."""
    results = []
    if not doc_list:
        return results

    save_dir = os.path.join(DOWNLOAD_DIR, str(tender_id))
    links = tab.locator("a[href*='/common/download']")

    for entry in doc_list:
        doc_name = entry["document_name"]
        href = entry["href"]
        i = entry["index"]

        os.makedirs(save_dir, exist_ok=True)
        local_path = None
        try:
            link = links.nth(i)
            link.scroll_into_view_if_needed(timeout=5000)
            with tab.expect_download(timeout=15000) as dl_info:
                link.click()
            download = dl_info.value
            local_path = os.path.join(save_dir, download.suggested_filename or doc_name)
            download.save_as(local_path)
            log(f"      [DOWNLOAD] Saved: {local_path}")
        except Exception as e:
            log(f"      [DOWNLOAD] Click->download failed for '{doc_name}': {e} — trying direct fetch...")
            if href:
                local_path = _direct_download(tab, href, save_dir, doc_name)

        results.append({
            "document_name": doc_name,
            "url": href,
            "local_path": local_path,
            "status": "downloaded" if local_path else "failed",
        })

    return results


def extract_document_text(local_path: str, max_chars: int = 4000) -> str:
    """Best-effort text extraction from a downloaded document, so the
    'Doubt' confirmation pass can judge actual document content (not just
    the file name). Returns '' if extraction isn't possible.

    For Excel files in particular: a workbook can have several sheets (e.g.
    "Liquid Reagents" / "Powder Reagents" / "System Packs" / "Miscellaneous")
    and the genuinely relevant catalogue can be on ANY of them, in any tab
    order. A budget that reads sheets first-to-last and stops once max_chars
    is hit can burn its entire budget on one irrelevant sheet (e.g. a
    "Miscellaneous" tab of generic lancets/tubes) before ever reaching the
    real reagent catalogue on another tab. So every sheet gets its own fair
    share of the character budget, and the sheet name is included so the
    LLM can see which section each excerpt came from."""
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


def _cleanup_tender_documents(tender_id: str):
    """Remove downloaded files for a tender that turned out to be irrelevant
    after the 2nd-pass confirmation — we only keep documents for confirmed
    relevant tenders. Retries briefly since a just-read Excel/PDF file can
    still hold a Windows file-lock for a moment after extraction."""
    save_dir = os.path.join(DOWNLOAD_DIR, str(tender_id))
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


def process_tender_details(context, row, listing_data: dict,
                            need_confirmation: bool, current_reason: str,
                            current_dept) -> dict:
    """Opens the details tab once, downloads every listed document (needed
    either way — for a "Yes" verdict to keep, or for a "Doubt" verdict to
    read their actual content for confirmation), scrapes the structured
    key/value sections (Amount Details, Other Details, Calendar Details,
    etc.) into the flat shape TenderDetails.jsx expects, then — for "Doubt"
    verdicts only — sends the details text + downloaded document content
    excerpts to Ollama for a final decision. If confirmed irrelevant, the
    downloaded files are deleted. Always closes the tab.

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
    tab = None
    try:
        tab = open_details_tab(context, row)
        if tab is None:
            return {"final_status": "no", "reason": "Could not open details tab.",
                     "dept": current_dept, "documents": [], "details_text": "",
                     "structured_details": {}}

        details_text = get_details_text(tab)
        raw_kv = scrape_key_value_sections(tab)
        structured_details = build_frontend_tender_details(raw_kv, listing_data)
        doc_list = list_tender_documents(tab)

        # Always download — a "Yes" verdict needs the files kept, and a
        # "Doubt" verdict needs the actual content to confirm with Ollama.
        documents = download_documents_list(tab, tender_id, doc_list)

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
        close_details_tab(tab)


# ══════════════════════════════════════════════════════════════════════════════
# Listing pagination
# ══════════════════════════════════════════════════════════════════════════════

def go_to_next_page(page) -> bool:
    """Click the DataTables 'Next' pagination control. Returns False once
    the control's <li> has class 'disabled' (last page)."""
    next_li = page.locator("li#DataTables_Table_0_next")
    if next_li.count() == 0:
        return False
    classes = next_li.first.get_attribute("class") or ""
    if "disabled" in classes:
        return False
    next_li.first.locator("a").first.click()
    time.sleep(3)
    try:
        page.wait_for_selector("#DataTables_Table_0_processing", state="visible", timeout=3000)
        page.wait_for_selector("#DataTables_Table_0_processing", state="hidden", timeout=15000)
    except Exception:
        time.sleep(2)
    return True


# ══════════════════════════════════════════════════════════════════════════════
# Main scraping loop
# ══════════════════════════════════════════════════════════════════════════════

def scrape_all_pages(page, context, conn, stop_after_first_relevant: bool = False) -> list:
    all_rows = []
    page_num = 1
    saved, skipped = 0, 0

    while True:
        page.wait_for_selector("table tbody tr", timeout=25000)
        rows_loc = page.locator("table tbody tr")
        row_count = rows_loc.count()
        log(f"[PAGE {page_num}] {row_count} tenders found")

        for i in range(row_count):
            row = rows_loc.nth(i)
            try:
                listing_data = parse_listing_row(row)
                if not listing_data.get("tender_id"):
                    continue

                title = listing_data["tender_title"]

                # Step 1: filter on TITLE ONLY, before opening anything
                f_status, f_reason, dept_tag, decision = filter_tender(title)

                if f_status == "no":
                    skipped += 1
                    all_rows.append([
                        i + 1, listing_data["tender_id"], listing_data["tender_refno"],
                        listing_data["organisation_name"], title,
                        listing_data["estimated_value"], listing_data["bid_closure_date"],
                        "", dept_tag or "", f_status, f_reason,
                    ])
                    continue

                # Step 2: title-pass says Yes/Doubt -> open details tab.
                # For "Doubt" verdicts, run a 2nd-pass confirmation using the
                # details text + document names BEFORE downloading anything.
                need_confirmation = (decision == "Doubt")
                log(f"    [{i+1}/{row_count}] Opening details for Tender Id "
                    f"{listing_data['tender_id']} — {title[:70]} "
                    f"(title verdict: {decision}{', confirming...' if need_confirmation else ''})")

                result = process_tender_details(
                    context, row, listing_data,
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
                        listing_data["organisation_name"], title,
                        listing_data["estimated_value"], listing_data["bid_closure_date"],
                        "", dept_tag or "", f_status, f_reason,
                    ])
                    # Re-locate rows after tab open/close touched the DOM
                    rows_loc = page.locator("table tbody tr")
                    continue

                doc_names = "; ".join(d["document_name"] for d in documents)
                combined = result["structured_details"]

                all_rows.append([
                    i + 1, listing_data["tender_id"], listing_data["tender_refno"],
                    listing_data["organisation_name"], title,
                    listing_data["estimated_value"], listing_data["bid_closure_date"],
                    doc_names, dept_tag or "", f_status, f_reason,
                ])

                if conn:
                    file_link_json, downloaded_documents_json = build_documents_json(documents)
                    record = {
                        "state":                STATE_NAME,
                        "organisation_name":    listing_data["organisation_name"],
                        "closing_date":         format_closing_date_for_db(listing_data["bid_closure_date"]),
                        "tender_title":         title,
                        "tender_refno":         make_db_refno(listing_data["tender_refno"], listing_data["tender_id"]),
                        "tender_id":            listing_data["tender_id"],
                        "organisation_chain":   listing_data["organisation_name"],
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
                print(f"  Tender Notice No   : {listing_data['tender_refno']}")
                print(f"  Tender Id          : {listing_data['tender_id']}")
                print(f"  Name Of Work       : {title}")
                print(f"  Organisation       : {listing_data['organisation_name']}")
                print(f"  Estimated Value    : {listing_data['estimated_value']}")
                print(f"  Bid Closure Date   : {listing_data['bid_closure_date']}")
                print(f"  Dept (LLM)         : {dept_tag}")
                print(f"  Filter Reason      : {f_reason}")
                print(f"  Documents Saved ({len(downloaded)}):")
                for p in downloaded:
                    print(f"      - {p}")
                print("=" * 78 + "\n")

                log(f"[SAVED] Tender Notice No: {listing_data['tender_refno']} "
                    f"(Tender Id {listing_data['tender_id']}) — dept: {dept_tag}, "
                    f"{len(downloaded)} document(s) downloaded.")

                if stop_after_first_relevant:
                    log("[STOP] stop_after_first_relevant=True — halting after first relevant tender.")
                    return all_rows

                # Re-locate rows_loc after tab close in case DOM was touched
                rows_loc = page.locator("table tbody tr")

            except Exception as e:
                log(f"    [SKIP] row {i+1}: {e}")

        log(f"[PAGE {page_num}] done (saved={saved} skipped={skipped})")

        if not go_to_next_page(page):
            log("[PAGINATION] 'Next' button disabled — reached the last page.")
            break
        page_num += 1

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
        page.goto(BASE_URL, timeout=60000, wait_until="domcontentloaded")

        # Step 2: Wait for page load
        log("[STEP 2] Waiting for page load...")
        time.sleep(3)

        # Step 3: Scroll down so the tender rows (50/page) render
        log("[STEP 3] Scrolling to load tender rows...")
        page.mouse.wheel(0, 2000)
        time.sleep(2)

        # Step 4: Scrape every tender across every page, filtering/confirming/
        # downloading/saving each one in turn.
        log("[STEP 4] Scraping tender listing (all tenders, all pages)...")
        rows = scrape_all_pages(page, context, conn, stop_after_first_relevant=False)
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

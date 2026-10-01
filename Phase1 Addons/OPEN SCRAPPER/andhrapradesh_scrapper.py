"""
andhrapradesh_scrapper.py
=========================
Andhra Pradesh eProcurement Portal Search Scraper
https://tender.apeprocurement.gov.in/

Flow (full-listing page-by-page walk, NOT per-keyword search):
  Searching per keyword (endo.csv/diagno.csv, ~555 keywords) means opening
  the site and re-running the whole listing scan once per keyword — slow,
  and every keyword sees only the results IT specifically matched. Instead:

  1. Open the portal ONCE, close splash screen, click lower navigation,
     submit the search form with an EMPTY keyword field — this returns
     the FULL unfiltered "Current Tenders" listing (~1,900+ tenders across
     ~190 pages of 10 rows each, table#pagetable13, same as a keyword
     search but unrestricted).
  2. Walk every page, oldest-loaded-first, via the DataTables "Next" button
     (go_to_next_page_ap) until it's disabled (last page).
  3. For each row on each page:
       a. Cross-check the title against every endo.csv/diagno.csv keyword
          (whole-word match, not substring — see keyword_match()).
       b. Hard-reject on obvious civil/electrical/admin keyword signals —
          skips Ollama entirely, and is NOT reachable by a keyword hint.
       c. Otherwise, ask Ollama whether the listing (Name of Work + Tender
          Category) is relevant to Meril Endo/Diagno products — a keyword
          hit (if any) is passed in as CONTEXT, not used to blindly
          override the verdict. (A blind override was tried first and
          produced real false positives in production — "mosquito mesh"
          and "chain link mesh fencing" both matched keyword "mesh" and
          got saved as relevant. Ollama can tell those apart from surgical
          mesh from context; a bare keyword list can't.)
       d. LLM says "No" -> skip entirely, no details popup opened, nothing
          stored. "Yes"/"Doubt" -> open the "View Tender Details" popup,
          scrape its full content, click through to "Tender Documents" ->
          "Bulk DownLoad", extract the (possibly nested) ZIP, and upsert
          into open_tender_details with relevency_checker/relevancy_reason/
          dept/downloaded_documents set so the tender and its files
          actually show up in the app.
  4. Save every row (relevant or not) to CSV for audit.
  5. Browser stays open until user manually closes it.

Usage:
    python andhrapradesh_scrapper.py
"""

import os
import re
import csv
import json
import time
import shutil
import zipfile
import urllib.error
import urllib.request
import mysql.connector
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ── Configuration ──────────────────────────────────────────────────────────────
BASE_URL = "https://tender.apeprocurement.gov.in"
TARGET_URL = BASE_URL
KEYWORDS_FILE = "keywords.csv"
OUTPUT_FILE = "row_data_andhrapradesh.csv"
STATE_NAME = "Andhra Pradesh"

_SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(_SCRIPT_DIR, "tender_documents")

# ── Database Config ─────────────────────────────────────────────────────────────
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

CSV_HEADERS = [
    "department", "keyword", "department_name", "tender_id", "tender_notice_number",
    "tender_category", "name_of_work", "estimated_value",
    "start_date_time", "closing_date_time", "filter_status", "filter_reason",
]


# ══════════════════════════════════════════════════════════════════════════════
# RELEVANCY FILTER (Ollama LLM) — Meril Endo + Meril Diagno
# Same criteria/prompt as bihar_scraper.py, so a tender judged "relevant" means
# the same thing across every state scraper in this project.
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
actually sell? You are given the tender's Name of Work and Tender Category
from the search-results listing, so judge from that alone.

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

CRITICAL: both "Yes" and "Doubt" are treated as relevant by the caller — use
          "Doubt" only when there is an actual medical/surgical/diagnostic
          signal in the text. Do NOT mark generic supply/administrative/
          civil-infra descriptions as "Doubt" just because they *could*
          theoretically include anything. Only "No" drops the tender entirely.

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


def _build_filter_message(tender_description: str, keyword_hint: str = None) -> str:
    hint_block = ""
    if keyword_hint:
        hint_block = (
            f"\nNote: this listing's title also contains the word/phrase "
            f"'{keyword_hint}', which appears in Meril's own product keyword "
            f"list — but judge from ACTUAL CONTEXT, not the word alone. "
            f"Common false positives: 'mosquito mesh' or 'chain link mesh "
            f"fencing' both contain 'mesh' but are NOT Meril's surgical "
            f"mesh; a construction 'tack'/'stack' is not our tack fixation "
            f"system. Only treat the keyword as meaningful if the tender is "
            f"genuinely about a matching medical/surgical/diagnostic product.\n"
        )
    return (
        "Please evaluate whether this tender is relevant for Meril Life Sciences,\n"
        "using the description below:\n\n"
        f"Description : {tender_description}\n"
        f"{hint_block}\n"
        "Return ONLY the JSON decision object as specified in the system prompt."
    )


def _ask_llm(tender_description: str, keyword_hint: str = None) -> dict:
    messages = [
        {"role": "system", "content": FILTER_SYSTEM_PROMPT},
        {"role": "user",   "content": _build_filter_message(tender_description, keyword_hint)},
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


def filter_tender(tender_description: str, keyword_hint: str = None) -> tuple:
    """Returns (status, reason, dept, hard_reject). status: 'proceed_futher'
    | 'no'. hard_reject is True only for the keyword hard-reject path.

    keyword_hint (if given, from the endo/diagno product-keyword cross-check)
    is passed INTO the Ollama prompt as context, not used to override the
    verdict directly — a blind keyword-match override was tried and
    produced real false positives in production ('mosquito mesh' and
    'chain link mesh fencing' both matched the keyword 'mesh' and got
    saved as relevant tenders). The LLM can tell 'mosquito mesh' isn't
    surgical mesh; a bare keyword list can't."""
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
        return "no", reason, None, True

    log(f"    [FILTER] -> Ollama: {tender_description[:80]}"
        f"{f' (keyword hint: {keyword_hint!r})' if keyword_hint else ''}")
    result = _ask_llm(tender_description, keyword_hint)

    decision = result.get("decision", "Doubt").strip()
    reason   = result.get("reason", "No reason provided.")
    dept_tag = result.get("dept")
    cat_tag  = result.get("category")
    if cat_tag:
        reason = f"{reason}  [Category: {cat_tag}]"

    if decision == "No":
        log(f"    [FILTER] SKIP (LLM: No) — {reason}")
        return "no", reason, dept_tag, False
    else:
        log(f"    [FILTER] RELEVANT (LLM: {decision}, dept: {dept_tag}) — {reason}")
        return "proceed_futher", reason, dept_tag, False


def load_keyword_lookup(keywords_dir: str) -> list:
    """Loads endo.csv + diagno.csv into one flat [(keyword_lower, dept), ...]
    list for a fast substring cross-check against each listing's title,
    independent of the LLM. Keywords under 4 chars are skipped — short
    tokens ("ph", "kit") produce noisy substring false-positives inside
    unrelated titles."""
    lookup = []
    for fname, dept in (("endo.csv", "Endo"), ("diagno.csv", "Diagno")):
        for kw in load_keywords(os.path.join(keywords_dir, fname)):
            if len(kw) >= 4:
                lookup.append((kw.lower(), dept))
    return lookup


def keyword_match(text: str, lookup: list):
    """Returns (matched_keyword, dept) for the first keyword found as a
    WHOLE-WORD match in text, or (None, None) if nothing matches.

    MUST be word-boundary matching, not plain substring containment — a
    naive `kw in text_lower` check produced real false positives in
    production: 'mesh' matched inside 'Ra-MESH Hospital' (a person's name)
    and 'Weld-MESH' (construction wire mesh), 'tack'/'tacker' matched
    inside 'stacking'/'contractor', each one overriding a correct LLM/
    hard-reject 'No' into a saved 'proceed_futher' tender. Multi-word
    keywords (e.g. 'surgical mesh') still work fine as a phrase boundary
    check via \\b...\\b around the whole keyword.
    """
    text_lower = text.lower()
    for kw, dept in lookup:
        if re.search(r'\b' + re.escape(kw) + r'\b', text_lower):
            return kw, dept
    return None, None


def log(msg: str):
    """Print timestamped log message."""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"  [{ts}] {msg}")


def get_db_connection():
    """Get MySQL database connection."""
    return mysql.connector.connect(**DB_CONFIG)


def upsert_tender(conn, record):
    """Insert or update tender record in database. Only called for tenders
    that PASSED the Ollama relevance filter — relevency_checker is always
    'proceed_futher' here so the app's tender listings (which filter on
    that column) actually pick these up."""
    cursor = conn.cursor()
    sql = """
        INSERT INTO open_tender_details
            (state, dept, organisation_name, e_published_date, closing_date,
             opening_date, tender_title, tender_refno, tender_id,
             organisation_chain, tender_details, FILE_LINK, downloaded_documents,
             relevency_checker, relevancy_reason)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            dept                 = VALUES(dept),
            organisation_name    = VALUES(organisation_name),
            e_published_date     = VALUES(e_published_date),
            closing_date         = VALUES(closing_date),
            opening_date         = VALUES(opening_date),
            tender_title         = VALUES(tender_title),
            tender_refno         = VALUES(tender_refno),
            organisation_chain   = VALUES(organisation_chain),
            tender_details       = VALUES(tender_details),
            FILE_LINK            = VALUES(FILE_LINK),
            downloaded_documents = VALUES(downloaded_documents),
            relevency_checker    = VALUES(relevency_checker),
            relevancy_reason     = VALUES(relevancy_reason),
            updated_at           = CURRENT_TIMESTAMP
    """
    cursor.execute(sql, (
        record["state"],
        record.get("department"),
        record["organisation_name"],
        record["e_published_date"],
        record["closing_date"],
        record["opening_date"],
        record["tender_title"],
        record["tender_refno"],
        record["tender_id"],
        record["organisation_chain"],
        record.get("tender_details"),
        record.get("file_link"),
        record.get("downloaded_documents"),
        record.get("relevency_checker", "proceed_futher"),
        record.get("relevancy_reason"),
    ))
    conn.commit()
    cursor.close()


def load_keywords(csv_file: str):
    """Load keywords from CSV file. Returns list of keywords."""
    keywords = []
    if not os.path.exists(csv_file):
        log(f"[WARN] Keywords file not found: {csv_file}")
        return keywords
    
    try:
        with open(csv_file, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                for item in row:
                    keyword = item.strip()
                    if keyword:
                        keywords.append(keyword)
    except Exception as e:
        log(f"[ERROR] Failed to load keywords: {e}")
    
    return keywords

def init_csv_output(output_file: str):
    """Initialize CSV file with headers if it doesn't exist."""
    if not os.path.exists(output_file):
        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(CSV_HEADERS)
        log(f"[INIT] Created output file: {output_file}")


def append_to_csv(output_file: str, rows: list):
    """Append rows to CSV file."""
    with open(output_file, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)


def extract_zip_recursive(zip_path: str, dest_dir: str) -> list:
    """Extracts zip_path into dest_dir. AP's bulk download is a ZIP
    containing another ZIP (confirmed: DocumentsList.zip -> 'TENDER
    DOCUMENTS <name>.zip' -> actual docx/xlsx/doc files) — extracts one
    level deep repeatedly until nothing left is a zip. Flattens everything
    into dest_dir and skips Office temp/lock files (~$...), which are not
    real documents. Returns the list of final real file paths."""
    try:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(dest_dir)
    except Exception as e:
        log(f"      [EXTRACT] Failed to open {os.path.basename(zip_path)}: {e}")
        return []

    # Walk dest_dir: recurse into any nested zip, flatten real files into
    # dest_dir, delete zip files (outer + inner) once their contents are out.
    final_files = []
    changed = True
    while changed:
        changed = False
        for root, _dirs, files in os.walk(dest_dir):
            for fname in files:
                fpath = os.path.join(root, fname)
                if fname.lower().endswith(".zip"):
                    try:
                        with zipfile.ZipFile(fpath) as z:
                            z.extractall(dest_dir)
                        os.remove(fpath)
                        changed = True
                    except Exception as e:
                        log(f"      [EXTRACT] Failed to open nested zip {fname}: {e}")

    for root, _dirs, files in os.walk(dest_dir):
        for fname in files:
            if fname.startswith("~$"):
                # Office temp/lock file artifact, not a real document.
                try:
                    os.remove(os.path.join(root, fname))
                except Exception:
                    pass
                continue
            if fname.lower().endswith(".zip"):
                continue
            final_files.append(os.path.join(root, fname))

    return final_files


def download_tender_documents(details_page, tender_id: str) -> list:
    """From an already-open tender details tab: click 'Tender Documents' nav
    (fnviewTenderDocuments), then 'Bulk DownLoad' (fnBulkDownload), capture
    the resulting ZIP, and extract it into
    tender_documents/andhrapradesh_<tender_id>/. Returns a list of
    {"document_name", "local_path", "status"} dicts — same shape every other
    state scraper in this project uses for downloaded_documents."""
    save_dir = os.path.join(DOWNLOAD_DIR, f"andhrapradesh_{tender_id}")

    nav_btn = details_page.locator("div.navBtn:has-text('Tender Documents')")
    if nav_btn.count() == 0:
        log(f"      [DOCS] No 'Tender Documents' nav button for {tender_id}.")
        return []

    try:
        nav_btn.first.click()
        details_page.wait_for_load_state("networkidle", timeout=15000)
        time.sleep(1.5)
    except Exception as e:
        log(f"      [DOCS] Failed to open Tender Documents tab: {str(e)[:80]}")
        return []

    bulk_btn = details_page.locator("input#btnBulkDownLoad")
    if bulk_btn.count() == 0 or not bulk_btn.is_visible():
        log(f"      [DOCS] No 'Bulk DownLoad' button for {tender_id} — no documents to fetch.")
        return []

    os.makedirs(save_dir, exist_ok=True)
    zip_path = os.path.join(save_dir, "DocumentsList.zip")
    try:
        with details_page.expect_download(timeout=30000) as dl_info:
            bulk_btn.click()
        download = dl_info.value
        download.save_as(zip_path)
        log(f"      [DOCS] Downloaded bulk zip for {tender_id} "
            f"({os.path.getsize(zip_path)} bytes)")
    except Exception as e:
        log(f"      [DOCS] Bulk download failed for {tender_id}: {str(e)[:80]}")
        return []

    extracted = extract_zip_recursive(zip_path, save_dir)
    if os.path.exists(zip_path):
        try:
            os.remove(zip_path)  # keep only the real documents
        except Exception:
            pass

    if not extracted:
        log(f"      [DOCS] Zip extracted but no real documents found for {tender_id}.")
        return []

    log(f"      [DOCS] Extracted {len(extracted)} document(s) for {tender_id}")
    return [
        {"document_name": os.path.basename(p), "local_path": p, "status": "downloaded"}
        for p in extracted
    ]


def build_documents_json(documents: list) -> tuple:
    """Builds (file_link_json, downloaded_documents_json) in the exact shape
    every other state scraper in this project writes — see
    bihar_scraper.py's identical helper. downloaded_documents is what the
    product-suggestion pipeline (NewSystem/main_server.js
    /open-tender/upload) actually reads; FILE_LINK alone is not enough."""
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


def scrape_tender_details_popup(view_icon, context, tender_id: str):
    """
    Click on View Tender Details icon and scrape popup details as JSON.
    Scrolls down slowly to load all content and scrapes entire page, then
    downloads the tender's bulk document ZIP before closing the tab.
    Returns (detail_data, documents) — detail_data is a dict or None,
    documents is a list (possibly empty) of downloaded-document dicts.
    """
    detail_data = {}
    documents = []
    popup_page = None

    try:
        # Check if view icon exists
        if view_icon.count() == 0:
            return None, []

        # Click and wait for popup
        with context.expect_page() as new_page_info:
            view_icon.click()
        popup_page = new_page_info.value

        # Wait for popup to load
        popup_page.wait_for_load_state("networkidle", timeout=10000)
        time.sleep(2)

        # Scroll down slowly to load all content
        log(f"    [POPUP] Scrolling to load all content...")
        previous_height = 0
        max_scrolls = 20  # Prevent infinite loop
        scroll_count = 0

        while scroll_count < max_scrolls:
            # Get current page height
            current_height = popup_page.evaluate("document.body.scrollHeight")

            # Scroll to bottom
            popup_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(1)  # Wait for content to load

            # Check if we've reached the end
            if current_height == previous_height:
                break

            previous_height = current_height
            scroll_count += 1

        # Scroll back to top to ensure all content is accessible
        popup_page.evaluate("window.scrollTo(0, 0)")
        time.sleep(1)

        # Scrape all content from the popup page
        detail_data = {}

        try:
            # Try to scrape table data first (structured data)
            table_rows = popup_page.locator("table tr").all()
            for row in table_rows:
                tds = row.locator("td").all()
                if len(tds) >= 2:
                    for i in range(0, len(tds) - 1, 2):
                        label = tds[i].inner_text().strip()
                        value = tds[i+1].inner_text().strip()
                        if label and value:
                            label = re.sub(r'\s+', ' ', label).strip()
                            detail_data[label] = value

            # Also scrape all text content as fallback
            # Get all visible text from the page
            page_text = popup_page.inner_text("body")
            if page_text and not detail_data:
                # If no table data found, store full page text
                detail_data["full_page_content"] = page_text

            log(f"    [POPUP] Scraped {len(detail_data)} fields from popup")

        except Exception as e:
            log(f"    [POPUP SCRAPE ERROR] {str(e)[:80]}")

        # Download documents (Tender Documents nav -> Bulk DownLoad) BEFORE
        # closing the tab — both buttons live inside this same tab.
        try:
            documents = download_tender_documents(popup_page, tender_id)
        except Exception as e:
            log(f"    [DOCS ERROR] {str(e)[:80]}")

        # Close popup
        popup_page.close()
        time.sleep(1)

        return (detail_data if detail_data else None), documents

    except Exception as e:
        log(f"    [POPUP ERROR] {str(e)[:80]}")
        # Ensure popup is closed even if error occurred
        try:
            if popup_page:
                popup_page.close()
        except:
            pass
        return None, documents


def go_to_next_page_ap(page):
    """Navigate to next page for Andhra Pradesh DataTables pagination."""
    try:
        # Scroll down to make Next button visible
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1)
        
        next_button = page.locator("a#pagetable13_next").first 
        if next_button.count() > 0:
            # Check if disabled (last page)
            class_attr = next_button.get_attribute("class") or ""
            if "disabled" in class_attr:
                log("  -> Next button is disabled (last page reached).")
                return False
            next_button.click()
            log("  -> Clicked Next button, waiting for page to load...")
            time.sleep(3)
            return True
    except Exception as e:
        log(f"  -> Error clicking Next: {str(e)[:80]}")
        pass
    return False


def scrape_full_listing(page, conn, context, keyword_lookup: list, start_page: int = 1):
    """
    Walks the FULL unfiltered "Current Tenders" listing (table#pagetable13),
    page by page via the DataTables "Next" button, until the last page.
    Every row is judged individually — a keyword-list substring hit OR an
    Ollama "Yes"/"Doubt" makes it relevant; only fully-rejected rows are
    skipped. Returns list of rows to be written to CSV (relevant or not).
    """
    all_rows = []
    page_num = start_page
    saved, skipped = 0, 0

    while True:
        try:
            # Wait for results table
            page.wait_for_selector("table#pagetable13", timeout=25000)
        except PlaywrightTimeoutError:
            log(f"  -> No results table found on page {page_num} (0 results or end).")
            break

        # Get all rows from the table (skip header)
        rows = page.locator("table#pagetable13 tbody tr").all()
        page_count = 0

        for row in rows:
            tds = row.locator("td").all()
            if len(tds) < 9:
                continue

            # Andhra Pradesh table structure:
            # 0: Department Name
            # 1: Tender ID
            # 2: Tender Notice Number
            # 3: Tender Category
            # 4: Name of Work
            # 5: Estimated Contract Value
            # 6: Start Date & Time
            # 7: Closing Date & Time
            # 8: Action

            department_name = tds[0].inner_text().strip()
            tender_id = tds[1].inner_text().strip()
            tender_notice_number = tds[2].inner_text().strip()
            tender_category = tds[3].inner_text().strip()
            name_of_work = tds[4].inner_text().strip()
            estimated_value = tds[5].inner_text().strip()
            start_date_time = tds[6].inner_text().strip()
            closing_date_time = tds[7].inner_text().strip()

            # Cross-check against the endo/diagno keyword lists FIRST — a hit
            # is passed to Ollama as CONTEXT (not used to blindly override
            # its verdict). A blind override was tried and produced real
            # false positives in production: 'mosquito mesh' and 'chain
            # link mesh fencing' both matched keyword 'mesh' and got saved
            # as relevant. Ollama can tell those apart from surgical mesh;
            # a bare keyword list can't — so it stays informational only.
            kw_hit, kw_dept = keyword_match(name_of_work, keyword_lookup)

            # PASS 1 — ask Ollama whether this listing looks relevant to
            # Meril BEFORE opening the details popup. Only relevant tenders
            # get their details scraped and stored — everything else is just
            # logged to CSV for audit and left alone (no popup, no DB write).
            # Hard-rejects (civil/electrical/admin signals) skip Ollama
            # entirely and are never reachable by a keyword hint either.
            tender_description = f"{name_of_work} (Category: {tender_category})"
            f_status, f_reason, dept_tag, hard_reject = filter_tender(tender_description, kw_hit)

            if kw_hit:
                f_reason = f"[Keyword cross-check: '{kw_hit}'] {f_reason}"
                if f_status == "proceed_futher":
                    dept_tag = dept_tag or kw_dept

            all_rows.append([
                dept_tag or "", kw_hit or "", department_name, tender_id, tender_notice_number,
                tender_category, name_of_work, estimated_value,
                start_date_time, closing_date_time, f_status, f_reason,
            ])

            if f_status == "no":
                skipped += 1
                page_count += 1
                continue

            # Click on View Tender Details icon in Action column (last td)
            action_td = tds[8]
            view_icon = action_td.locator("img[title='View Tender Details']").first

            # Scrape tender details + download documents from the popup
            detail_json = None
            documents = []
            if view_icon.count() > 0:
                log(f"    [DETAIL] Opening tender details popup for {tender_id}...")
                try:
                    detail_data, documents = scrape_tender_details_popup(view_icon, context, tender_id)
                    if detail_data:
                        detail_json = json.dumps(detail_data, ensure_ascii=False)
                        log(f"    [DETAIL] Scraped {len(detail_data)} fields for {tender_id}")
                    else:
                        log(f"    [DETAIL] No details found for {tender_id}")
                except Exception as de:
                    log(f"    [DETAIL] Error scraping details for {tender_id}: {str(de)[:80]}")

            file_link_json, downloaded_documents_json = build_documents_json(documents)

            # Insert into database immediately
            # Map to standard fields:
            # - organisation_name, organisation_chain = department_name
            # - tender_title = name_of_work
            # - tender_refno = tender_notice_number
            # - tender_id = tender_id
            # - e_published_date = start_date_time
            # - opening_date = start_date_time
            # - closing_date = closing_date_time
            try:
                upsert_tender(conn, {
                    "state": STATE_NAME,
                    "department": (dept_tag or "Unknown"),
                    "organisation_name": department_name,
                    "e_published_date": start_date_time,
                    "closing_date": closing_date_time,
                    "opening_date": start_date_time,
                    "tender_title": name_of_work,
                    "tender_refno": tender_notice_number,
                    "tender_id": tender_id,
                    "organisation_chain": department_name,
                    "tender_details": detail_json,
                    "file_link": file_link_json,
                    "downloaded_documents": downloaded_documents_json,
                    "relevency_checker": f_status,
                    "relevancy_reason": f_reason,
                })
                saved += 1
                log(f"    [SAVED] Tender Id {tender_id} — dept: {dept_tag or 'Unknown'}, "
                    f"{len(documents)} document(s)")
            except Exception as db_err:
                log(f"    [DB ERROR] {tender_id}: {str(db_err)[:80]}")
            page_count += 1

        log(f"  -> Page {page_num}: scraped {page_count} rows (saved={saved} skipped={skipped} so far).")

        # Persist rows to CSV incrementally, page by page — a ~190-page run
        # is long enough that losing everything to a crash near the end
        # would be a real cost, unlike a short per-keyword run.
        if all_rows:
            append_to_csv(OUTPUT_FILE, all_rows)
            all_rows = []

        # A page with fewer than 10 rows is either DataTables' genuine last
        # page (1,941 rows / 10 per page ends in a partial page) or an
        # anomaly — either way there's nothing more to gain from "Next".
        if page_count < 10:
            log(f"  -> Less than 10 rows on this page — reached the end of the listing.")
            break

        # Try to go to next page
        log(f"  -> Checking for Next button...")
        if not go_to_next_page_ap(page):
            log(f"  -> No more pages to scrape.")
            break
        page_num += 1

    log(f"[DONE] Full listing scan complete — saved={saved} skipped={skipped}")
    return all_rows


def browse_full_listing(page, conn, context, keyword_lookup: list) -> int:
    """Opens the site ONCE, submits the search form with an EMPTY keyword
    (returns the full unfiltered 'Current Tenders' listing), then walks
    every page via scrape_full_listing. Returns total rows scraped."""
    log(f"[STEP 1] Opening site: {TARGET_URL}")
    page.goto(TARGET_URL, timeout=60000, wait_until="domcontentloaded")
    time.sleep(3)

    log(f"[STEP 2] Closing splash screen...")
    try:
        splash = page.locator("div#splash")
        if splash.count() > 0 and splash.is_visible():
            # A normal simulated click often lands on the splash's own
            # full-bleed background image instead of the small "X" div
            # sitting on top of it (same pointer-interception this site
            # produced elsewhere) — call the page's own closeSplash() JS
            # function directly instead of trusting a mouse click to land.
            try:
                page.evaluate("closeSplash()")
                log(f"[STEP 2] Called closeSplash() directly")
            except Exception as e:
                log(f"[STEP 2] closeSplash() call failed: {str(e)[:80]}")
            time.sleep(1)

            # Still visible? Force-click with force=True (skips Playwright's
            # actionability/interception check), then force-hide via style
            # as a last resort so a stuck splash can never block everything
            # after it (same safety-net pattern as bihar_scraper.py's modal).
            if splash.is_visible():
                try:
                    page.locator("div.sp-close-btn").click(force=True, timeout=5000)
                    time.sleep(1)
                except Exception as e:
                    log(f"[STEP 2] force click failed: {str(e)[:80]}")
            if splash.is_visible():
                log(f"[STEP 2] Splash still visible — forcing it hidden via style.")
                page.evaluate("""
                    () => {
                        const s = document.querySelector('#splash');
                        if (s) s.style.display = 'none';
                    }
                """)
            log(f"[STEP 2] Splash screen closed.")
    except Exception as e:
        log(f"[STEP 2] Splash screen handling: {str(e)[:80]}")

    log(f"[STEP 3] Looking for lower navigation element...")
    try:
        lower_nav = page.locator("div.lower")
        if lower_nav.count() > 0:
            lower_nav.first.click()
            log(f"[STEP 3] Clicked lower navigation element")
            time.sleep(2)
    except Exception as e:
        log(f"[STEP 3] Lower navigation handling: {str(e)[:80]}")

    log(f"[STEP 4] Locating search input (left EMPTY — full listing, not a keyword search)...")
    try:
        search_input = page.locator("input#nTenderID")
        search_input.wait_for(state="visible", timeout=10000)
    except Exception as e:
        log(f"[STEP 4] ERROR: Search input not found - {str(e)[:80]}")
        return 0

    log(f"[STEP 5] Clicking Search button (empty query -> full listing)...")
    try:
        search_button = page.locator("input#searchTender").first
        search_button.wait_for(state="visible", timeout=10000)
        search_button.click()
        log(f"[STEP 5] Clicked Search button")
    except Exception as e:
        log(f"[STEP 5] ERROR: Search button not found - {str(e)[:80]}")
        return 0

    log(f"[STEP 6] Waiting for results...")
    time.sleep(3)

    page_content = page.content()
    if "no records found" in page_content.lower() or "no data available" in page_content.lower():
        log(f"[STEP 7] No tenders found at all. Aborting.")
        return 0

    log(f"[STEP 7] Walking the full listing, page by page...")
    remaining_rows = scrape_full_listing(page, conn, context, keyword_lookup)

    # scrape_full_listing already flushes CSV rows page-by-page; this only
    # catches whatever's left from a final partial page.
    if remaining_rows:
        append_to_csv(OUTPUT_FILE, remaining_rows)

    return 1


def run(playwright):
    """Main scraper runner."""
    # Initialize output CSV
    init_csv_output(OUTPUT_FILE)
    
    # Connect to database
    conn = get_db_connection()
    log("Connected to MySQL.")
    
    # Headless — a visible Chromium window on this Windows Server machine
    # only actually repaints while connected via an ACTIVE interactive RDP
    # session with the window on-screen; otherwise it shows a stale/frozen
    # frame (confirmed: terminal logs show real pagination/scraping
    # happening while the window visually looks stuck). No CAPTCHA or
    # manual step in this flow, so nothing is lost by not watching it —
    # follow progress via the terminal log instead.
    browser = playwright.chromium.launch(
        headless=True,
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
    
    # Auto-dismiss any JS dialogs
    def handle_dialog(dialog):
        log(f"[Dialog] {dialog.type!r}: {dialog.message[:120]!r}")
        dialog.accept()
    
    page.on("dialog", handle_dialog)
    
    try:
        # Keyword lists live under scrapper/, not next to this script — used
        # as a cross-check signal per row, not for searching anymore.
        _keywords_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scrapper")
        keyword_lookup = load_keyword_lookup(_keywords_dir)
        log(f"[INIT] Loaded {len(keyword_lookup)} keyword(s) for cross-check "
            f"from {_keywords_dir} (endo.csv + diagno.csv)")

        browse_full_listing(page, conn, context, keyword_lookup)

        log("[INFO] Browser will remain open. Press Enter to close...")
        input()
        
    except Exception as e:
        log(f"[ERROR] {str(e)[:200]}")
        log("[INFO] Browser will remain open. Press Enter to close...")
        input()
    
    finally:
        # Close database connection
        try:
            conn.close()
            log("Database connection closed.")
        except Exception:
            pass
        
        # Close browser only when user presses Enter
        try:
            context.close()
        except Exception:
            pass
        try:
            browser.close()
        except Exception:
            pass


# ── Entry point ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)

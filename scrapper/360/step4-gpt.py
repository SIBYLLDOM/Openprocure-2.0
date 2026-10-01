"""
step4-gpt.py — 360 Division (Infection Prevention) variant.

Same Step 4/5 machinery as TenderSystem/NewSystem/step4-gpt.py (Endo/Diagno):
classify each tender line item into a Meril department + type, pick the
matching product catalog file, then batch product-match + deviation-analyze.
Only the SYSTEM_PROMPT taxonomy and the PRODUCT_FILES/CATEGORY_TO_FOLDER
routing tables differ — swapped here for the 360 catalog under ./products/,
built by split_360_products.py from keyword/360_keywords.json.

Runtime helpers (file upload, batching, retry, main()) are intentionally
identical to the Endo/Diagno file — only pasted here rather than imported so
this stays a standalone drop-in, matching how the three existing copies of
step4-gpt.py are already independent siblings rather than a shared module.
"""

import os
import json
import re
import time
from openai import OpenAI, RateLimitError
from dotenv import load_dotenv

def get_client():
    load_dotenv(override=True)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError(" OPENAI_API_KEY not found.")
    return OpenAI(api_key=api_key)

client = get_client()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(BASE_DIR, "PDF")
DOWNLOADS_DIR = os.path.join(BASE_DIR, "DOWNLOADS")
OUTPUT_DIR = os.path.join(BASE_DIR, "OUTPUT")
os.makedirs(OUTPUT_DIR, exist_ok=True)

MODEL_NAME = "gpt-4.1-nano"
MAX_PRODUCTS = 50
BATCH_SIZE = 10
PDF_BATCH_SIZE = 2


# ── STEP 4 — DEPT/TYPE CLASSIFICATION TAXONOMY ──────────────────────────────
#
# Aliasing note: tender line items frequently use phrasing that doesn't match
# a Meril type name verbatim (e.g. "Patient Gown", "Surgical Gowns Conforming
# to IS 17334 Level 1/2/3", "Medical Caps Conforming to IS 17629"). These are
# NOT separate products — they all route to the corresponding type below
# (IS 17334 Level 1/2/3 -> Surgical Gown; IS 16289 -> Surgical Mask; IS 17629
# -> Surgical Cap). The ALIAS RULES section makes this explicit for the LLM
# instead of relying on it to infer the standard-number mapping unprompted.
SYSTEM_PROMPT = """You are a Tender Evaluation Specialist at Meril Life Sciences Pvt Ltd (360° Infection Prevention Solutions Division).
Your task is to determine whether the attached tender documents are relevant to Meril's 360 Division product portfolio.
You are given:
* Bid Document (Complete Tender Details)
* ATC (Additional Terms and Conditions added by Buyer) - CRITICAL SOURCE FOR TECHNICAL SPECIFICATIONS
* Technical Specifications

CRITICAL: The ATC files contain the GOLDEN SPECIFICATIONS that are the PRIMARY source of truth.
You MUST:
1. Carefully review ALL ATC files for technical specifications
2. Extract EVERY technical requirement mentioned (dimensions, materials, performance specs, certifications, etc.)
3. If ATC specs differ from bid document, ATC takes precedence
4. Include ALL extracted specifications in the "technical_specifications" field

Company Product Categories

IMPORTANT RULES FOR JSON OUTPUT FIELDS:
- "item_main_category" MUST be EXACTLY one of these 6 values only:
    apparel.json | drapes.json | disinfection.json | hand_hygiene.json | skin_prep.json | accessories.json
- "type" MUST be copied EXACTLY as listed below — same spelling, same spaces, same capitalisation.
- Do NOT put anything else in these fields.

Department: 360 (Infection Prevention):

  → item_main_category = "apparel.json"
    Types: Surgical Gown, Surgical Cap, Surgical Mask, Surgery-Specific Kit

  → item_main_category = "drapes.json"
    Types: Orthopedic Surgical Drape, Cardiology / Angiography Surgical Drape,
           ENT / Eye / Dental Surgical Drape, Gynecology Surgical Drape,
           Surgical Drape Sheet, Upcoming Drapes, Incise Drape

  → item_main_category = "disinfection.json"
    Types: Surface and Equipment Disinfectant, Upcoming Disinfectant Range

  → item_main_category = "hand_hygiene.json"
    Types: Alcohol Based Hand Rub, Antiseptic Surgical Hand Scrub, Upcoming CHG Antiseptic Solution

  → item_main_category = "skin_prep.json"
    Types: Surgical Skin Preparation Solution, Povidone Iodine Antiseptic, Upcoming Skin Antiseptic

  → item_main_category = "accessories.json"
    Types: Surgical Clipper and Blades

ALIAS RULES — tender wording that does NOT match a type name verbatim but
IS the same product family. Apply these before falling back to "No match":
  - "Patient Gown", "Surgical Gowns Conforming to IS 17334" (any Level 1/2/3)
      -> type = "Surgical Gown"  (item_main_category = "apparel.json")
  - "Surgical Drapes Conforming to IS 17334"
      -> type = "Surgical Drape Sheet"  (item_main_category = "drapes.json"),
         unless the drape is clearly procedure-specific (orthopedic, angiography,
         ENT/eye/dental, gynecology) — then use that specific drape type instead.
  - "Surgical Face Masks Conforming to IS 16289"
      -> type = "Surgical Mask"  (item_main_category = "apparel.json")
  - "Medical Caps Conforming to IS 17629"
      -> type = "Surgical Cap"  (item_main_category = "apparel.json")
  - Generic "hand sanitizer" / "hand rub" -> type = "Alcohol Based Hand Rub"
  - Generic "surgical scrub solution" / "antiseptic solution" with no CHG% stated
      -> type = "Antiseptic Surgical Hand Scrub" if for hands/body,
         or "Surgical Skin Preparation Solution" if for pre-op skin prep

Decision Rules
1. Check if ANY tender item clearly matches the product categories above (directly or via an alias rule).
2. If no clear match, return:
[
  {
    "relevant": "No",
    "reason": "<one sentence explaining what the tender is about and why it does not match Meril's 360 Division categories>"
  }
]

3. If relevant, return structured JSON WITH EXTRACTED TECHNICAL SPECIFICATIONS.

CRITICAL RULE FOR MULTI-SPECIFICATION ITEMS:
If a single tender item (e.g. "Surgical Drapes") contains MULTIPLE distinct sub-specifications
(e.g. Fenestrated Drape, Utility Drape, Femoral Angiography Drape), treat EACH sub-specification
as a SEPARATE item entry in the JSON. Each sub-item must have:
- A unique key corresponding EXACTLY to the item number in the original bid document (e.g., if it's
  the 6th item listed in the bid, use "item_6", NOT "item_4", even if you skipped items 4 and 5
  because they were irrelevant).
- Its own "dept", "item_main_category", and "type"
- The "tender_item_name" field with the FULL original tender item name/description
- EXTRACTED TECHNICAL SPECIFICATIONS from ATC/bid documents

If relevant, return:
[
  {
    "relevant": "Yes"
  },
  {
    "no_of_items": <total number of item entries, including all sub-items>
  },
  {
    "item_<N>": "<specific tender item or sub-item name, where N is the original item number in the bid document>",
    "item_category": "<extract the exact text for 'Item Category' explicitly stated at the top of the first page of the bid document>",
    "tender_item_name": "<full original tender item name/description>",
    "dept": "360",
    "item_main_category": "<apparel.json / drapes.json / disinfection.json / hand_hygiene.json / skin_prep.json / accessories.json>",
    "type": "<exact matched category name>",
    "technical_specifications": {
      "<spec_name_1>": "<extracted requirement from ATC/bid>",
      "<spec_name_2>": "<extracted requirement from ATC/bid>",
      "...": "..."
    }
  }
]

CRITICAL: Extract ALL technical specifications mentioned in ATC/bid documents including:
- Fabric/material composition, GSM, layers (for apparel/drapes)
- Active ingredient %, IS/ISO/ASTM/AAMI certification level (for disinfectants/antiseptics/apparel)
- Dimensions, sizes, pack sizes
- Sterilization method, shelf life
- Standards and certifications (IS 17334, IS 16289, IS 17629, ISO 11135, AAMI PB70, etc.)
- Warranty and service requirements
- Any other technical parameters

If multiple items/sub-items exist, add further objects keeping their ORIGINAL document numbers.

Strict Output Rules
* Output ONLY valid JSON.
* No explanation.
* No comments.
* No extra text.
* Match only if clearly relevant.
* Use exact category names.
* Extract ALL technical specifications from ATC files."""


BATCH_MATCH_DEVIATION_PROMPT = """You are a Product Matching & Compliance Analyst at Meril Life Sciences Pvt Ltd (360° Infection Prevention Solutions Division).

You will receive a BATCH of tender items. For EACH item you must:
1. Pick the SINGLE best matching product from the provided product list.
2. Run a full deviation analysis comparing tender technical specifications vs product specs.

────────────────────────────────────────────────────────
PRODUCT MATCHING RULES:
- Return exactly ONE product per tender item — the closest match.
- Choose based on material/fabric, active ingredient %, size/pack size, and type.
- If no strong match, return closest available with low relevancy_score.
- Include the COMPLETE product_specs object from the product JSON.

DEVIATION ANALYSIS RULES (for each spec in tender):
- "Complied"      : Product meets or exceeds tender requirement.
- "Deviation"     : Product exists but does not meet requirement — explain the gap.
- "Not Specified" : Spec not available in product database.
- Analyze ALL tender specifications — be thorough.

────────────────────────────────────────────────────────
OUTPUT FORMAT — return a JSON object keyed by item_key:

{
  "<item_key>": {
    "item_category": "<item_category from tender item>",
    "tender_item_name": "<tender_item_name>",
    "selected_file": "<product file used>",
    "product_code": "<exact product code>",
    "product_name": "<product name>",
    "product_specs": <complete product specification object>,
    "relevancy_score": <float 0.0–1.0>,
    "deviation_table": [
      {
        "specification": "<spec name from tender>",
        "tender_requirement": "<exact requirement>",
        "product_offered": "<value from product specs, or 'Not specified'>",
        "status": "Complied | Deviation | Not Specified",
        "reason": "<detailed explanation>",
        "remarks": "<additional notes or empty string>"
      }
    ]
  }
}

────────────────────────────────────────────────────────
STRICT RULES:
- Output ONLY valid JSON. No explanation. No extra text. No markdown fences.
- Every item in the batch MUST have an entry in the output.
- deviation_table must be an array (can be empty [] if no technical_specifications provided).
- Be accurate and thorough."""


# ── STEP 5a — CATALOG ROUTING ────────────────────────────────────────────────
PRODUCT_FILES = {
    "apparel": [
        "./products/apparel/Surgical_Gown.json",
        "./products/apparel/Surgical_Cap.json",
        "./products/apparel/Surgical_Mask.json",
        "./products/apparel/Surgery_Specific_Kit.json",
    ],
    "drapes": [
        "./products/drapes/Orthopedic_Surgical_Drape.json",
        "./products/drapes/Cardiology_Angiography_Surgical_Drape.json",
        "./products/drapes/ENT_Eye_Dental_Surgical_Drape.json",
        "./products/drapes/Gynecology_Surgical_Drape.json",
        "./products/drapes/Surgical_Drape_Sheet.json",
        "./products/drapes/Upcoming_Drapes.json",
        "./products/drapes/Incise_Drape.json",
    ],
    "disinfection": [
        "./products/disinfection/Surface_and_Equipment_Disinfectant.json",
        "./products/disinfection/Upcoming_Disinfectant_Range.json",
    ],
    "hand_hygiene": [
        "./products/hand_hygiene/Alcohol_Based_Hand_Rub.json",
        "./products/hand_hygiene/Antiseptic_Surgical_Hand_Scrub.json",
        "./products/hand_hygiene/Upcoming_CHG_Antiseptic_Solution.json",
    ],
    "skin_prep": [
        "./products/skin_prep/Surgical_Skin_Preparation_Solution.json",
        "./products/skin_prep/Povidone_Iodine_Antiseptic.json",
        "./products/skin_prep/Upcoming_Skin_Antiseptic.json",
    ],
    "accessories": [
        "./products/accessories/Surgical_Clipper_and_Blades.json",
    ],
}

CATEGORY_TO_FOLDER = {
    "apparel.json":     "apparel",
    "drapes.json":       "drapes",
    "disinfection.json": "disinfection",
    "hand_hygiene.json": "hand_hygiene",
    "skin_prep.json":    "skin_prep",
    "accessories.json":  "accessories",
}


# ── Deterministic classification sanity-check ───────────────────────────────
# Observed live: gpt-4.1-nano classified "Surgical Face Masks Conforming To
# IS 16289" as item_main_category="disinfection.json" / type="Surface and
# Equipment Disinfectant" — directly contradicting the explicit ALIAS RULES
# in SYSTEM_PROMPT (IS 16289 -> Surgical Mask / apparel.json). Since GPT
# calls run at temperature=0, an identical wrong input reliably reproduces
# the identical wrong output on retry — this isn't fixable by re-running.
# Ordered, most-specific-first keyword rules override an LLM classification
# that clearly contradicts what the tender item text says it is. Mirrors the
# hard-reject keyword pattern already used in cppp360_states_endo_scraper.py.
_CLASSIFICATION_OVERRIDE_RULES = [
    (("surgical mask", "face mask"),                          "apparel.json",      "Surgical Mask"),
    (("bouffant cap", "surgical cap", "medical cap"),          "apparel.json",      "Surgical Cap"),
    (("patient gown", "surgical gown", "isolation gown",
      "reinforced gown", "is 17334"),                          "apparel.json",      "Surgical Gown"),
    (("incise drape",),                                        "drapes.json",       "Incise Drape"),
    (("hip drape", "hip-u drape", "knee drape", "knee-o drape",
      "extremity drape", "orthopedic drape", "orthopaedic drape"), "drapes.json",    "Orthopedic Surgical Drape"),
    (("angiography drape", "angio drape", "femoral drape"),    "drapes.json",       "Cardiology / Angiography Surgical Drape"),
    (("dental drape", "eye drape", "ophthalmic drape", "ent drape"), "drapes.json", "ENT / Eye / Dental Surgical Drape"),
    (("c-section drape", "cesarean", "gynecology drape"),      "drapes.json",       "Gynecology Surgical Drape"),
    (("drape",),                                                "drapes.json",       "Surgical Drape Sheet"),
    (("surgical clipper", "clipper blade", "neuro blade",
      "universal blade"),                                      "accessories.json",  "Surgical Clipper and Blades"),
    (("povidone iodine", "pvp-i"),                              "skin_prep.json",    "Povidone Iodine Antiseptic"),
    (("skin prep", "skin preparation"),                         "skin_prep.json",    "Surgical Skin Preparation Solution"),
    (("hand rub", "hand sanitizer", "alcohol rub"),             "hand_hygiene.json", "Alcohol Based Hand Rub"),
    (("hand scrub",),                                           "hand_hygiene.json", "Antiseptic Surgical Hand Scrub"),
    (("glutaraldehyde", "ortho-phthalaldehyde", " opa ",
      "high level disinfect"),                                  "disinfection.json", "Upcoming Disinfectant Range"),
    (("disinfect",),                                            "disinfection.json", "Surface and Equipment Disinfectant"),
    (("surgery specific kit", "procedure kit", "surgical kit"), "apparel.json",      "Surgery-Specific Kit"),
]


def sanity_check_item_classification(item_key, item_obj):
    """
    Overrides item_obj's item_main_category/type in place when the tender
    item text unambiguously contradicts what the LLM assigned. Returns True
    if an override was applied (for logging).
    """
    text = f"{item_obj.get(item_key, '')} {item_obj.get('tender_item_name', '')}".lower()
    for keywords, correct_category, correct_type in _CLASSIFICATION_OVERRIDE_RULES:
        if any(kw in text for kw in keywords):
            current = (item_obj.get("item_main_category"), item_obj.get("type"))
            if current != (correct_category, correct_type):
                print(
                    f"       [SANITY CHECK] {item_key}: LLM said "
                    f"{current} but item text matched {keywords[0]!r} — "
                    f"overriding to ({correct_category}, {correct_type})"
                )
                item_obj["item_main_category"] = correct_category
                item_obj["type"] = correct_type
                return True
            return False
    return False


# ── everything below is unchanged runtime machinery, ported verbatim from ──
# ── TenderSystem/NewSystem/step4-gpt.py (Endo/Diagno) ───────────────────────

def find_bid_document():
    files = [f for f in os.listdir(PDF_DIR) if f.endswith(".pdf")]
    if not files:
        return None
    files.sort(key=lambda f: os.path.getmtime(os.path.join(PDF_DIR, f)), reverse=True)
    return os.path.join(PDF_DIR, files[0])


def find_atc_files():
    if not os.path.exists(DOWNLOADS_DIR):
        return []
    return [
        os.path.join(DOWNLOADS_DIR, f)
        for f in os.listdir(DOWNLOADS_DIR)
        if os.path.isfile(os.path.join(DOWNLOADS_DIR, f))
        and os.path.getsize(os.path.join(DOWNLOADS_DIR, f)) > 500
    ]


def upload_file_to_openai(filepath, mime_type="application/pdf"):
    filename = os.path.basename(filepath)
    print(f"      Uploading: {filename}")
    with open(filepath, "rb") as f:
        response = client.files.create(
            file=(filename, f, mime_type), purpose="assistants"
        )
    print(f"      Uploaded: {filename} → ID: {response.id}")
    return response


def cleanup_openai_files(file_ids):
    for file_id in file_ids:
        try:
            client.files.delete(file_id)
            print(f"       Deleted OpenAI file: {file_id}")
        except Exception as e:
            print(f"       Failed to delete {file_id}: {e}")


SUPPORTED_PDF_EXTS = {".pdf"}
TEXT_EXTRACTABLE_EXTS = {".xlsx", ".xls", ".csv", ".txt", ".json", ".docx"}


def extract_text_from_file(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    filename = os.path.basename(filepath)

    try:
        if ext in (".xlsx", ".xls"):
            import openpyxl

            wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
            lines = []
            for sheet in wb.worksheets:
                lines.append(f"[Sheet: {sheet.title}]")
                for row in sheet.iter_rows(values_only=True):
                    if any(cell is not None for cell in row):
                        lines.append(
                            "\t".join("" if c is None else str(c) for c in row)
                        )
            wb.close()
            text = "\n".join(lines)
            print(f"      Extracted {len(lines)} rows from xlsx: {filename}")
            return text

        elif ext == ".csv":
            import csv

            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.reader(f)
                lines = ["\t".join(row) for row in reader]
            text = "\n".join(lines)
            print(f"      Extracted {len(lines)} rows from csv: {filename}")
            return text

        elif ext == ".docx":
            import docx
            doc = docx.Document(filepath)
            lines = []
            for para in doc.paragraphs:
                if para.text.strip():
                    lines.append(para.text)
            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        if cell.text.strip():
                            lines.append(cell.text)
            text = "\n".join(lines)
            print(f"      Extracted {len(lines)} paragraphs/rows from docx: {filename}")
            return text

        elif ext in (".txt", ".json"):
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
            print(f"      Read text file: {filename} ({len(text)} chars)")
            return text

    except Exception as e:
        print(f"       Could not extract text from {filename}: {e}")

    return None


def gpt_pick_product_file(
    item_key, item_name, tender_item_name, dept, category_type, available_files
):
    files_list = "\n".join(f"  - {f}" for f in available_files)

    user_text = f"""You are helping match a tender item to the correct Meril product file.

Tender Item:
  Key              : {item_key}
  Specific Name    : {item_name}
  Full Tender Name : {tender_item_name}
  Department       : {dept}
  Category Type    : {category_type}

Available product files:
{files_list}

Pick the single most relevant file for this tender item.
Return ONLY valid JSON:
{{
  "selected_file": "<exact file path from the list above>",
  "reason": "<one line explanation>"
}}

No explanation outside JSON. No extra text."""

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a Product File Selector at Meril Life Sciences. "
                    "Pick the single most relevant product JSON file for the given tender item. "
                    "Output ONLY valid JSON."
                ),
            },
            {"role": "user", "content": user_text},
        ],
        temperature=0,
    )

    raw = response.choices[0].message.content.strip()
    clean = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        result = json.loads(clean)
        selected = result.get("selected_file", "")
        reason = result.get("reason", "")
        print(f"      GPT selected: {selected}")
        print(f"      Reason: {reason}")
        return selected
    except Exception as e:
        print(f"       File selection parse error: {e} | Raw: {raw}")
        return None


def load_products_from_file(file_path):
    abs_path = os.path.normpath(os.path.join(BASE_DIR, file_path.lstrip("./")))

    if not os.path.exists(abs_path):
        print(f"       File not found: {abs_path}")
        return None

    with open(abs_path, "r", encoding="utf-8") as f:
        products = json.load(f)

    count = len(products) if isinstance(products, list) else 1
    print(f"      Loaded {count} product(s) from {file_path}")
    return products


def extract_specs_from_batch(bid_file, atc_pdf_batch, atc_text_blocks):
    batch_file_ids = []
    try:
        for atc_path in atc_pdf_batch:
            atc_file = upload_file_to_openai(atc_path)
            batch_file_ids.append(atc_file.id)

        doc_list = f"1. Bid Document\n"
        idx = 2
        for atc_path in atc_pdf_batch:
            doc_list += f"{idx}. ATC File (PDF): {os.path.basename(atc_path)}\n"
            idx += 1
        for fname, _ in atc_text_blocks:
            doc_list += f"{idx}. ATC File (text-extracted): {fname}\n"
            idx += 1

        content = [
            {
                "type": "text",
                "text": (
                    "I have attached the following documents for specification extraction:\n"
                    + doc_list
                    + "\n CRITICAL INSTRUCTIONS:\n"
                    + "- Extract ALL technical specifications from the ATC files\n"
                    + "- Return ONLY a JSON object with the extracted specifications\n"
                    + "- Format: {\"specifications\": {\"spec_name\": \"spec_value\", ...}}\n"
                    + "- Include dimensions, materials, performance specs, certifications, etc."
                ),
            },
            {"type": "file", "file": {"file_id": bid_file.id}},
        ]

        for atc_path in atc_pdf_batch:
            atc_id = batch_file_ids[atc_pdf_batch.index(atc_path)]
            content.append({"type": "file", "file": {"file_id": atc_id}})

        for fname, text in atc_text_blocks:
            if len(text) > 80_000:
                text = text[:80_000] + "\n... [truncated]"
            content.append(
                {
                    "type": "text",
                    "text": f"\n--- ATC FILE (text-extracted): {fname} ---\n{text}\n--- END OF {fname} ---",
                }
            )

        print(f"      Extracting specs from batch of {len(atc_pdf_batch)} PDF(s)...")
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": "You are a Technical Specification Extractor. Extract all technical specifications from ATC files. Output ONLY valid JSON.",
                },
                {"role": "user", "content": content},
            ],
            temperature=0,
            timeout=120,
        )

        raw_output = response.choices[0].message.content.strip()
        clean = re.sub(r"```(?:json)?|```", "", raw_output).strip()
        result = json.loads(clean)
        print(f"      Extracted specs from batch")
        return result.get("specifications", {})

    except Exception as e:
        print(f"       Batch extraction failed: {e}")
        return {}
    finally:
        for file_id in batch_file_ids:
            try:
                client.files.delete(file_id)
            except Exception:
                pass


def evaluate_tender(bid_doc_path, atc_paths):
    uploaded_file_ids = []

    try:
        print("\n Uploading files to OpenAI...")
        bid_file = upload_file_to_openai(bid_doc_path)
        uploaded_file_ids.append(bid_file.id)

        atc_pdf_paths = []
        atc_text_blocks = []

        for atc_path in atc_paths:
            ext = os.path.splitext(atc_path)[1].lower()
            if ext in SUPPORTED_PDF_EXTS:
                atc_pdf_paths.append(atc_path)
            elif ext in TEXT_EXTRACTABLE_EXTS:
                text = extract_text_from_file(atc_path)
                if text:
                    atc_text_blocks.append((os.path.basename(atc_path), text))
                else:
                    print(
                        f"       Skipping unreadable file: {os.path.basename(atc_path)}"
                    )
            else:
                print(
                    f"       Unsupported file type, skipping: {os.path.basename(atc_path)}"
                )

        print(f"\n Processing {len(atc_pdf_paths)} ATC PDF(s) in batches of {PDF_BATCH_SIZE - 1}...")
        all_specifications = {}

        for i in range(0, len(atc_pdf_paths), PDF_BATCH_SIZE - 1):
            batch = atc_pdf_paths[i : i + (PDF_BATCH_SIZE - 1)]
            print(f"      Batch {i // (PDF_BATCH_SIZE - 1) + 1}: {len(batch)} PDF(s)")
            batch_specs = extract_specs_from_batch(bid_file, batch, atc_text_blocks)
            all_specifications.update(batch_specs)
            time.sleep(2)

        print(f"      Extracted {len(all_specifications)} total specifications from all batches")

        print("\n Sending to GPT for final evaluation with combined specifications...")

        specs_text = json.dumps(all_specifications, indent=2, ensure_ascii=False)

        content = [
            {
                "type": "text",
                "text": (
                    f"I have extracted the following technical specifications from all ATC files:\n\n"
                    f"{specs_text}\n\n"
                    f" CRITICAL INSTRUCTIONS:\n"
                    f"- These are the GOLDEN TECHNICAL SPECIFICATIONS from all ATC files\n"
                    f"- Use these specifications to evaluate the tender\n"
                    f"- Include these in the 'technical_specifications' field of your response\n"
                    f"- ATC specifications take precedence over bid document if they differ\n"
                    f"\nPlease evaluate this tender and return the JSON response with these specifications."
                ),
            },
            {"type": "file", "file": {"file_id": bid_file.id}},
        ]

        for fname, text in atc_text_blocks:
            if len(text) > 80_000:
                text = text[:80_000] + "\n... [truncated]"
            content.append(
                {
                    "type": "text",
                    "text": f"\n--- ATC FILE (text-extracted): {fname} ---\n{text}\n--- END OF {fname} ---",
                }
            )

        for attempt in range(1, 4):
            try:
                print(f"      GPT evaluation attempt {attempt}/3 (timeout: 120s)...")
                response = client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": content},
                    ],
                    temperature=0,
                    timeout=120,
                )
                break
            except RateLimitError as e:
                wait = 15 * attempt
                print(f"      Rate limit hit. Waiting {wait}s... ({e})")
                time.sleep(wait)
            except Exception as e:
                print(f"       Attempt {attempt} failed: {type(e).__name__}: {e}")
                if attempt < 3:
                    print(f"      Retrying in 10s...")
                    time.sleep(10)
                else:
                    print("      All 3 attempts failed for GPT evaluation.")
                    raise
        else:
            raise RuntimeError("GPT evaluation failed after 3 attempts (rate limit).")

        raw_output = response.choices[0].message.content.strip()
        print(f"\n Raw GPT Response:\n{raw_output}")
        return raw_output

    finally:
        if uploaded_file_ids:
            print("\n Cleaning up uploaded files...")
            cleanup_openai_files(uploaded_file_ids)


def _resolve_product_file_for_item(item_key, item_obj):
    json_file = item_obj.get("item_main_category")
    folder_key = CATEGORY_TO_FOLDER.get(json_file)
    if not folder_key:
        print(f"       Unknown item_main_category for {item_key}: {json_file}")
        return None, None

    available_files = PRODUCT_FILES.get(folder_key, [])
    if not available_files:
        print(f"       No product files found for folder: {folder_key}")
        return None, None

    selected_file = gpt_pick_product_file(
        item_key,
        item_obj.get(item_key, ""),
        item_obj.get("tender_item_name", ""),
        item_obj.get("dept", ""),
        item_obj.get("type", ""),
        available_files,
    )

    if not selected_file or selected_file not in available_files:
        print(f"       Invalid file selection for {item_key}, falling back to first.")
        selected_file = available_files[0]

    products = load_products_from_file(selected_file)

    if products and isinstance(products, list) and len(products) > MAX_PRODUCTS:
        print(f"       Truncating to {MAX_PRODUCTS} products (was {len(products)})")
        products = products[:MAX_PRODUCTS]

    return selected_file, products


def process_items_batch(batch):
    if not batch:
        return {}

    shared_products = {}
    batch_items_payload = {}

    for item_key, item_obj, selected_file, products in batch:
        if selected_file not in shared_products:
            shared_products[selected_file] = products

        batch_items_payload[item_key] = {
            "item_name": item_obj.get(item_key, ""),
            "item_category": item_obj.get("item_category", ""),
            "tender_item_name": item_obj.get("tender_item_name", ""),
            "dept": item_obj.get("dept", ""),
            "item_main_category": item_obj.get("item_main_category", ""),
            "type": item_obj.get("type", ""),
            "technical_specifications": item_obj.get("technical_specifications", {}),
            "product_file": selected_file,
        }

    batch_json_str = json.dumps(batch_items_payload, indent=2, ensure_ascii=False)
    products_json_str = json.dumps(shared_products, indent=2, ensure_ascii=False)

    print(
        f"      Payload: {len(batch)} items | {len(shared_products)} unique product file(s)"
    )

    user_text = f"""Process the following BATCH of tender items.
For EACH item: (1) pick the best matching product from its product_file, (2) run deviation analysis.

SHARED PRODUCT LISTS (keyed by file path):
{products_json_str}

TENDER ITEMS BATCH:
{batch_json_str}

Each item's "product_file" key tells you which product list to use from SHARED PRODUCT LISTS.
Follow your system prompt exactly. Return a JSON object keyed by item_key."""

    print(f"\n      Batch GPT call — {len(batch)} item(s) (timeout: 180s)...")

    response = None
    for attempt in range(1, 4):
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": BATCH_MATCH_DEVIATION_PROMPT},
                    {"role": "user", "content": user_text},
                ],
                temperature=0,
                timeout=180,
            )
            break
        except RateLimitError as e:
            wait = 15 * attempt
            print(f"      Rate limit (attempt {attempt}/3). Waiting {wait}s... ({e})")
            time.sleep(wait)
        except Exception as e:
            print(f"       Attempt {attempt}/3 failed: {type(e).__name__}: {e}")
            if attempt < 3:
                print(f"      Retrying in 10s...")
                time.sleep(10)
            else:
                print("      All retry attempts exhausted for batch call.")
                return {}

    if response is None:
        print("      No response received (rate limit retries exhausted).")
        return {}

    raw = response.choices[0].message.content.strip()
    print(f"      Batch response (first 500 chars):\n{raw[:500]}...")

    clean = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        result = json.loads(clean)
        if isinstance(result, dict):
            return result
        print(f"       Expected dict, got {type(result)}")
        return {}
    except Exception as e:
        print(f"       Batch parse error: {e}")
        print(f"     Raw: {raw[:500]}...")
        return {}


def process_all_items(item_entries):
    all_suggestions = []
    all_deviations = {}

    resolved = []

    for item_obj in item_entries:
        item_key = next((k for k in item_obj if k.startswith("item_")), None)
        if not item_key:
            continue
        sanity_check_item_classification(item_key, item_obj)
        print(f"\n Resolving product file for {item_key}: {item_obj.get(item_key)}")
        selected_file, products = _resolve_product_file_for_item(item_key, item_obj)
        if selected_file and products:
            resolved.append((item_key, item_obj, selected_file, products))
        else:
            print(f"     Skipping {item_key} — could not resolve product file.")

    if not resolved:
        return all_suggestions, all_deviations

    total = len(resolved)
    batches = [resolved[i : i + BATCH_SIZE] for i in range(0, total, BATCH_SIZE)]
    print(
        f"\n Processing {total} item(s) in {len(batches)} batch(es) of up to {BATCH_SIZE}..."
    )

    for batch_num, batch in enumerate(batches, 1):
        print(f"\n{'='*60}")
        print(f" Batch {batch_num}/{len(batches)} — {len(batch)} item(s)")
        print(f"{'='*60}")

        batch_results = process_items_batch(batch)

        for item_key, item_obj, selected_file, _ in batch:
            item_result = batch_results.get(item_key)
            if not item_result:
                print(f"     No result returned for {item_key}")
                continue

            suggestion = {
                "item": item_key,
                "item_category": item_result.get(
                    "item_category", item_obj.get("item_category", "")
                ),
                "tender_item_name": item_result.get(
                    "tender_item_name", item_obj.get("tender_item_name", "")
                ),
                "selected_file": item_result.get("selected_file", selected_file),
                "product_code": item_result.get("product_code", ""),
                "product_name": item_result.get("product_name", ""),
                "product_specs": item_result.get("product_specs", {}),
                "relevancy_score": item_result.get("relevancy_score", 0.0),
            }
            all_suggestions.append(suggestion)

            deviation_table = item_result.get("deviation_table", [])
            if deviation_table:
                all_deviations[item_key] = deviation_table
                complied = sum(
                    1 for d in deviation_table if d.get("status") == "Complied"
                )
                deviated = sum(
                    1 for d in deviation_table if d.get("status") == "Deviation"
                )
                not_specified = sum(
                    1 for d in deviation_table if d.get("status") == "Not Specified"
                )
                print(
                    f"    {item_key} — Complied: {complied} | Deviated: {deviated} | Not Specified: {not_specified}"
                )
            else:
                print(f"     {item_key} — No deviation table returned")

    return all_suggestions, all_deviations


def suggest_products_for_item(item_key, item_obj):
    selected_file, products = _resolve_product_file_for_item(item_key, item_obj)
    if not selected_file or not products:
        return []

    batch_results = process_items_batch([(item_key, item_obj, selected_file, products)])
    item_result = batch_results.get(item_key)
    if not item_result:
        return []

    return [
        {
            "item": item_key,
            "item_category": item_result.get("item_category", ""),
            "tender_item_name": item_result.get("tender_item_name", ""),
            "selected_file": item_result.get("selected_file", selected_file),
            "product_code": item_result.get("product_code", ""),
            "product_name": item_result.get("product_name", ""),
            "product_specs": item_result.get("product_specs", {}),
            "relevancy_score": item_result.get("relevancy_score", 0.0),
        }
    ]


def analyze_deviations(item_key, tender_specs, product_specs):
    dummy_item_obj = {
        item_key: item_key,
        "technical_specifications": tender_specs,
        "item_main_category": "",
    }
    batch_results = process_items_batch(
        [(item_key, dummy_item_obj, "legacy_call", [{"specs": product_specs}])]
    )
    item_result = batch_results.get(item_key, {})
    return item_result.get("deviation_table", [])


def parse_json_response(raw_output):
    clean = re.sub(r"```(?:json)?|```", "", raw_output).strip()
    try:
        parsed = json.loads(clean)
    except json.JSONDecodeError as e:
        print(f"       JSON parse error: {e}")
        return {"raw_response": raw_output}

    if isinstance(parsed, list):
        return parsed

    # Some completions collapse the required
    # [{relevant}, {no_of_items}, {item_1: ...}, ...] array into one flat
    # object with every key merged together instead (observed with
    # MODEL_NAME on single-item tenders). Normalize the common single-item
    # case back into the expected array shape rather than discarding an
    # otherwise perfectly usable "relevant: Yes" answer as unparseable.
    if isinstance(parsed, dict) and "relevant" in parsed:
        if parsed.get("relevant") != "Yes":
            return [{"relevant": parsed.get("relevant"), "reason": parsed.get("reason", "")}]

        item_keys = [k for k in parsed if re.match(r"^item_\d+$", k)]
        if len(item_keys) <= 1:
            no_of_items = parsed.get("no_of_items", 1 if item_keys else 0)
            item_entry = {k: v for k, v in parsed.items() if k not in ("relevant", "no_of_items")}
            result = [{"relevant": "Yes"}, {"no_of_items": no_of_items}]
            if item_entry:
                result.append(item_entry)
            print("       Normalized flat single-item GPT response into expected array shape.")
            return result
        # Multiple item_N keys flattened into one object with no way to
        # tell which sub-fields (item_category/type/technical_specifications)
        # belong to which item — can't safely reconstruct, surface as-is.
        print("       Flat response has multiple items — cannot safely normalize.")

    return parsed


def save_json(data, filename):
    out_path = os.path.join(OUTPUT_DIR, filename)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f" Saved: {out_path}")
    return out_path


def main():
    print(" Step 4 — 360 Division Tender Evaluation with Batched Deviation Analysis")
    print("=" * 60)

    bid_doc_path = find_bid_document()
    if not bid_doc_path:
        print(" No bid document found in PDF/ folder.")
        return

    bid_name = os.path.splitext(os.path.basename(bid_doc_path))[0]
    print(f" Bid Document : {os.path.basename(bid_doc_path)}")

    atc_paths = find_atc_files()
    if atc_paths:
        print(f" ATC Files    : {len(atc_paths)} file(s) found")
        for p in atc_paths:
            print(f"   - {os.path.basename(p)}")
    else:
        print(" ATC Files    : None found (proceeding with bid doc only)")

    raw_evaluation = evaluate_tender(bid_doc_path, atc_paths)
    evaluation = parse_json_response(raw_evaluation)

    safe_bid = re.sub(r"[^A-Za-z0-9_-]", "_", bid_name)
    save_json(evaluation, f"{safe_bid}_evaluation.json")

    print("\n" + "=" * 60)
    print(" Evaluation Result:")
    print(json.dumps(evaluation, indent=2))
    print("=" * 60)

    if not isinstance(evaluation, list) or len(evaluation) == 0:
        print(" Could not parse evaluation result.")
        return

    if evaluation[0].get("relevant") != "Yes":
        reason = evaluation[0].get("reason", "No reason provided.")
        print(f" NOT RELEVANT — {reason}")
        return

    no_items = evaluation[1].get("no_of_items", 0) if len(evaluation) > 1 else 0
    print(f" RELEVANT — {no_items} matching item(s) found")

    print("\n" + "=" * 60)
    print(" Step 4b — Batched Product Matching & Deviation Analysis")
    print(f"   Batch size: {BATCH_SIZE} items per GPT call")
    print("=" * 60)

    item_entries = evaluation[2:]
    all_suggestions, all_deviations = process_all_items(item_entries)

    if all_suggestions:
        save_json(all_suggestions, f"{safe_bid}_product_suggestions.json")
        print("\n" + "=" * 60)
        print(f" Product Suggestions ({len(all_suggestions)} total):")
        print(json.dumps(all_suggestions, indent=2))
        print("=" * 60)
    else:
        print("\n  No product suggestions generated.")

    if all_deviations:
        save_json(all_deviations, f"{safe_bid}_deviation_analysis.json")
        print("\n" + "=" * 60)
        total_specs = sum(len(v) for v in all_deviations.values())
        print(f" Deviation Analysis ({total_specs} total specifications):")
        print(json.dumps(all_deviations, indent=2))
        print("=" * 60)
    else:
        print("\n  No deviation analysis generated.")


if __name__ == "__main__":
    main()

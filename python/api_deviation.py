from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os
import sys
import importlib.util
import json
import mysql.connector
import asyncio
from concurrent.futures import ThreadPoolExecutor

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai"
}

app = FastAPI(title="Deviation Table API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request Models ────────────────────────────────────────────────────────────

class DownloadRequest(BaseModel):
    bid_number: str
    detail_url: str


class DeviationRequest(BaseModel):
    bid_number: str
    detail_url: Optional[str] = None
    product_code: str
    product_name: str
    product_specs: dict


# ── Module Loader ─────────────────────────────────────────────────────────────

def load_module(name, filename):
    path = os.path.join(BASE_DIR, filename)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# ── Helper Functions ───────────────────────────────────────────────────────────

def cleanup_files():
    """Delete all files in PDF/ and DOWNLOADS/."""
    for folder in ["PDF", "DOWNLOADS"]:
        folder_path = os.path.join(BASE_DIR, folder)
        if not os.path.exists(folder_path):
            continue
        for filename in os.listdir(folder_path):
            filepath = os.path.join(folder_path, filename)
            try:
                if os.path.isfile(filepath):
                    os.remove(filepath)
            except Exception:
                pass


def parse_deviation_result(raw_output, parse_json_fn=None):
    """
    Safely parse the LLM output into a dict.
    Handles three cases:
      1. parse_json_fn already returned a dict  → use directly
      2. parse_json_fn returned a string        → json.loads it
      3. parse_json_fn unavailable / failed     → json.loads raw_output
    Raises HTTPException(500) if nothing works.
    """
    if parse_json_fn is not None:
        try:
            cleaned = parse_json_fn(raw_output)
            if isinstance(cleaned, dict):
                return cleaned
            if isinstance(cleaned, str):
                return json.loads(cleaned)
        except Exception:
            pass

    # Direct parse of the raw string
    try:
        text = raw_output.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse LLM response as JSON: {e}\n\nRaw output (first 500 chars):\n{raw_output[:500]}"
        )


def normalize_to_keyed_format(deviation_result: dict, product_code: str) -> dict:
    """
    Normalise LLM output into { "item_<code>": [ rows ] } format.

    LLM returns one of:
      A) Already keyed:  { "item_1": [...], ... }
      B) Flat:           { "deviation_table": [...] }
    """
    # Case A: already keyed (all values are lists, no "deviation_table" key)
    if (
        "deviation_table" not in deviation_result
        and deviation_result
        and all(isinstance(v, list) for v in deviation_result.values())
    ):
        return deviation_result

    # Case B: flat { "deviation_table": [...] }
    flat_rows = deviation_result.get("deviation_table", [])
    if not isinstance(flat_rows, list):
        flat_rows = []

    safe_code = (
        product_code.replace("/", "_").replace(" ", "_").strip("_")
        if product_code else "1"
    )
    item_key = f"item_{safe_code}"
    return {item_key: flat_rows}


def merge_keyed_deviations(existing_json, new_keyed: dict) -> dict:
    """
    Merge new item keys into existing deviation_tables, preserving other items.
    """
    existing = {}
    if existing_json:
        try:
            parsed = (
                json.loads(existing_json)
                if isinstance(existing_json, str)
                else existing_json
            )
            if isinstance(parsed, dict):
                existing = {k: v for k, v in parsed.items() if isinstance(v, list)}
        except Exception:
            pass
    existing.update(new_keyed)
    return existing


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "message": "Deviation Table API",
        "version": "1.0.0",
        "endpoints": {
            "/download-documents": "Download bid document, ATC, and technical specs",
            "/recreate-deviation": "Recreate deviation table based on selected product"
        }
    }


@app.post("/download-documents")
def download_documents(request: DownloadRequest, background_tasks: BackgroundTasks):
    """
    Download bid document, ATC files, and extract technical specifications.
    """
    try:
        cleanup_files()

        step2 = load_module("step2_pdf_download", "step2-pdf_download.py")
        step3 = load_module("step3_links", "step3-links.py")

        print(f"\n📌 Downloading PDF for bid: {request.bid_number}")
        pdf_path = step2.download_pdf_via_browser(request.detail_url, request.bid_number)

        if not pdf_path:
            raise HTTPException(status_code=500, detail="Failed to download PDF")

        print(f"\n📌 Extracting links and downloading ATC files...")
        step3.main(specific_pdf=pdf_path)

        catalogue_specs_path = os.path.join(BASE_DIR, "catalogue_specs.json")
        catalogue_specs = {}
        if os.path.exists(catalogue_specs_path):
            with open(catalogue_specs_path, "r", encoding="utf-8") as f:
                catalogue_specs = json.load(f)

        pdf_dir = os.path.join(BASE_DIR, "PDF")
        downloads_dir = os.path.join(BASE_DIR, "DOWNLOADS")

        pdf_files = list(os.listdir(pdf_dir)) if os.path.exists(pdf_dir) else []
        atc_files = list(os.listdir(downloads_dir)) if os.path.exists(downloads_dir) else []

        return {
            "status": "success",
            "bid_number": request.bid_number,
            "pdf_path": pdf_path,
            "pdf_files": pdf_files,
            "atc_files": atc_files,
            "catalogue_specs": catalogue_specs,
            "message": "Documents downloaded successfully"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/recreate-deviation")
def recreate_deviation(request: DeviationRequest):
    """
    Download documents, send to Ollama with custom prompt, recreate deviation table,
    and save to DB in the { item_<code>: [ rows ] } format expected by the frontend.
    """
    try:
        cleanup_files()

        # ── Resolve detail_url ────────────────────────────────────────────────
        detail_url = request.detail_url
        if not detail_url:
            conn = mysql.connector.connect(**DB_CONFIG)
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                "SELECT detail_url FROM gem_tenders WHERE bid_number = %s",
                (request.bid_number,)
            )
            result = cursor.fetchone()
            cursor.close()
            conn.close()
            if result:
                detail_url = result.get("detail_url")
            else:
                raise HTTPException(status_code=404, detail="Tender not found in database")

        # ── Load step modules ─────────────────────────────────────────────────
        step2 = load_module("step2_pdf_download", "step2-pdf_download.py")
        step3 = load_module("step3_links", "step3-links.py")

        # ── Step 1: Download PDF ──────────────────────────────────────────────
        print(f"\n📌 Downloading PDF for bid: {request.bid_number}")
        pdf_path = step2.download_pdf_via_browser(detail_url, request.bid_number)

        if not pdf_path:
            raise HTTPException(status_code=500, detail="Failed to download PDF")

        # ── Step 2: Extract links + download ATC files ────────────────────────
        print(f"\n📌 Extracting links and downloading ATC files...")
        step3.main(specific_pdf=pdf_path)

        # ── Step 3: Extract text ──────────────────────────────────────────────
        step4 = load_module("step4_gpt", "step4-gpt-api.py")

        bid_text = step4.extract_text_from_file(pdf_path)
        if not bid_text:
            raise HTTPException(status_code=500, detail="Could not extract text from PDF")

        atc_paths = step4.find_atc_files()
        all_atc_text = []
        for atc_path in atc_paths:
            text = step4.extract_text_from_file(atc_path)
            if text:
                all_atc_text.append((os.path.basename(atc_path), text))

        # ── Step 4: Load catalogue specs ──────────────────────────────────────
        catalogue_specs_path = os.path.join(BASE_DIR, "catalogue_specs.json")
        catalogue_specs_text = ""
        if os.path.exists(catalogue_specs_path):
            with open(catalogue_specs_path, "r", encoding="utf-8") as f:
                catalogue_specs = json.load(f)
            catalogue_specs_text = json.dumps(catalogue_specs, indent=2)

        # ── Step 5: Build prompt ──────────────────────────────────────────────
        product_details = json.dumps(request.product_specs, indent=2)

        user_prompt = f"""i want to create a deviation table in json format

My product:
{product_details}

Tender details (I have uploaded in PDF, JSON and TXT format below):

--- BID DOCUMENT (PDF) ---
{bid_text[:10000]}

--- ATC FILES ---
"""
        for name, text in all_atc_text:
            user_prompt += f"\n--- {name} ---\n{text[:5000]}\n"

        if catalogue_specs_text:
            user_prompt += f"\n--- CATALOGUE SPECS (JSON) ---\n{catalogue_specs_text}\n"

        user_prompt += """

Return ONLY a JSON deviation table with this format:
{
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

STRICT RULES:
- Output ONLY valid JSON. No explanation. No extra text. No markdown fences.
- Be accurate and thorough in analyzing all specifications.
"""

        # ── Step 6: Call Ollama ───────────────────────────────────────────────
        from openai import OpenAI
        client = OpenAI(
            base_url="http://127.0.0.1:11434/v1",
            api_key="ollama",
            timeout=600.0
        )

        print("\n🤖 Sending to Ollama for deviation table generation...")
        response = client.chat.completions.create(
            model="gpt-oss:20b-cloud",
            messages=[
                {"role": "system", "content": "You are a Deviation Analysis Specialist. Return ONLY valid JSON."},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0,
            extra_body={"num_ctx": 131072}
        )

        raw_output = response.choices[0].message.content.strip()
        print(f"📝 Raw LLM output length: {len(raw_output)} chars")

        # ── Step 7: Parse LLM response ────────────────────────────────────────
        parse_fn = getattr(step4, "parse_json_response", None)
        deviation_result = parse_deviation_result(raw_output, parse_fn)

        # ── Step 8: Normalise to { "item_<code>": [ rows ] } ─────────────────
        new_keyed = normalize_to_keyed_format(deviation_result, request.product_code)
        print(f"📦 Normalised keys: {list(new_keyed.keys())}")

        # ── Step 9: Read existing row from DB ────────────────────────────────
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)

        # Debug: Print MySQL server info
        cursor.execute("SELECT @@hostname as host, @@port as port, DATABASE() as current_db")
        server_info = cursor.fetchone()
        print(f"🔗 Connected to MySQL: host={server_info['host']}, port={server_info['port']}, db={server_info['current_db']}")

        cursor.execute(
            "SELECT bid_no, deviation_tables FROM tender_processing_results WHERE bid_no = %s",
            (request.bid_number,)
        )
        existing_row = cursor.fetchone()
        cursor.close()

        # ── DIAGNOSE: print what the DB actually has ──────────────────────────
        if existing_row is None:
            # Show nearby rows to spot format differences
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                "SELECT bid_no FROM tender_processing_results ORDER BY id DESC LIMIT 10"
            )
            sample = [r["bid_no"] for r in cursor.fetchall()]
            cursor.close()
            conn.close()
            print(f"⚠️  bid_no='{request.bid_number}' NOT FOUND in tender_processing_results")
            print(f"📋 Last 10 bid_no values in table: {sample}")
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Row not found for bid_no='{request.bid_number}'. "
                    f"Sample bid_no values in DB: {sample}"
                )
            )

        print(f"✅ DB row found — bid_no='{existing_row['bid_no']}'")
        existing_json = existing_row.get("deviation_tables")
        current_size = "NULL" if existing_json is None else f"{len(str(existing_json))} chars"
        print(f"📄 Current deviation_tables in DB: {current_size}")

        # ── Step 10: Merge and save ───────────────────────────────────────────
        merged = merge_keyed_deviations(existing_json, new_keyed)
        merged_json = json.dumps(merged, ensure_ascii=False)
        print(f"💾 Writing {len(merged_json)} chars | keys: {list(merged.keys())}")

        cursor = conn.cursor()
        cursor.execute(
            "UPDATE tender_processing_results SET deviation_tables = %s WHERE bid_no = %s",
            (merged_json, request.bid_number)
        )
        rows_affected = cursor.rowcount

        # Explicit commit with error checking
        try:
            conn.commit()
            print(f"✅ Transaction committed successfully")
        except Exception as commit_err:
            print(f"❌ Commit failed: {commit_err}")
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Commit failed: {commit_err}")

        cursor.close()

        print(f"🔢 UPDATE rows affected: {rows_affected}")

        # Verify the write actually landed with fresh connection
        conn.close()
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT deviation_tables, LENGTH(deviation_tables) AS col_len FROM tender_processing_results WHERE bid_no = %s",
            (request.bid_number,)
        )
        verify = cursor.fetchone()
        cursor.close()
        conn.close()

        if verify:
            written_len = verify.get("col_len")
            actual_value = verify.get("deviation_tables")
            print(f"✅ Post-write column length: {written_len} chars")
            print(f"📄 Actual value (first 200 chars): {str(actual_value)[:200] if actual_value else 'NULL'}")
        else:
            print(f"⚠️  Verification query returned no result!")

        if rows_affected == 0:
            print("⚠️  UPDATE matched 0 rows — this should not happen at this point.")

        total_specs = sum(len(rows) for rows in merged.values())

        return {
            "status": "success",
            "bid_number": request.bid_number,
            "product_code": request.product_code,
            "product_name": request.product_name,
            "deviation_table": merged,
            "total_specifications": total_specs,
            "message": "Deviation table recreated and updated in database"
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=6010)
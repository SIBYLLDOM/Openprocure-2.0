from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
import os
import sys
import importlib.util
import json
import mysql.connector

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai"
}

app = FastAPI(title="Deviation Table API", version="1.0.0")


# ── Request Models ────────────────────────────────────────────────────────────

class DownloadRequest(BaseModel):
    bid_number: str
    detail_url: str


class DeviationRequest(BaseModel):
    bid_number: str
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
async def download_documents(request: DownloadRequest, background_tasks: BackgroundTasks):
    """
    Download bid document, ATC files, and extract technical specifications.
    """
    try:
        # Cleanup before starting
        cleanup_files()
        
        # Load modules
        step2 = load_module("step2_pdf_download", "step2-pdf_download.py")
        step3 = load_module("step3_links", "step3-links.py")
        
        # Step 1: Download PDF
        print(f"\n📌 Downloading PDF for bid: {request.bid_number}")
        pdf_path = step2.download_pdf_via_browser(request.detail_url, request.bid_number)
        
        if not pdf_path:
            raise HTTPException(status_code=500, detail="Failed to download PDF")
        
        # Step 2: Extract links and download ATC files
        print(f"\n📌 Extracting links and downloading ATC files...")
        step3.main(specific_pdf=pdf_path)
        
        # Step 3: Load catalogue specs if available
        catalogue_specs_path = os.path.join(BASE_DIR, "catalogue_specs.json")
        catalogue_specs = {}
        if os.path.exists(catalogue_specs_path):
            with open(catalogue_specs_path, "r", encoding="utf-8") as f:
                catalogue_specs = json.load(f)
        
        # Get list of downloaded files
        pdf_files = []
        atc_files = []
        
        pdf_dir = os.path.join(BASE_DIR, "PDF")
        downloads_dir = os.path.join(BASE_DIR, "DOWNLOADS")
        
        if os.path.exists(pdf_dir):
            for f in os.listdir(pdf_dir):
                pdf_files.append(f)
        
        if os.path.exists(downloads_dir):
            for f in os.listdir(downloads_dir):
                atc_files.append(f)
        
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
async def recreate_deviation(request: DeviationRequest):
    """
    Recreate deviation table based on selected product.
    Compares tender technical specifications against product specifications.
    """
    try:
        # Load step4 module
        step4 = load_module("step4_gpt", "step4-gpt-api.py")
        
        # Load product data to get full specs
        # Find which category file contains this product
        product_categories = ["endo.json", "rapid_elisa.json", "system_packs.json", "reagents.json", "analyser.json"]
        product_data_dir = os.path.join(BASE_DIR, "product_data")
        
        product_file = None
        full_product_specs = request.product_specs
        
        # Try to find the product in category files
        for category in product_categories:
            category_path = os.path.join(product_data_dir, category)
            if os.path.exists(category_path):
                with open(category_path, "r", encoding="utf-8") as f:
                    products = json.load(f)
                    for prod in products:
                        if prod.get("product_code") == request.product_code:
                            full_product_specs = prod
                            product_file = category
                            break
                    if product_file:
                        break
        
        # Load tender technical specs from database
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT relevancy_check, suggested_products FROM tender_processing_results WHERE bid_no = %s",
            (request.bid_number,)
        )
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not result:
            raise HTTPException(status_code=404, detail="Tender not found in database")
        
        relevancy_check = result.get("relevancy_check")
        suggested_products = result.get("suggested_products")
        
        # Extract technical specifications from relevancy check
        tender_specs = {}
        if relevancy_check and isinstance(relevancy_check, list):
            for item in relevancy_check:
                if isinstance(item, dict) and "technical_specifications" in item:
                    tender_specs.update(item.get("technical_specifications", {}))
        
        # Generate deviation table
        deviation_table = []
        
        for spec_name, tender_requirement in tender_specs.items():
            product_value = full_product_specs.get(spec_name, "Not specified")
            
            # Determine status
            if product_value == "Not specified":
                status = "Not Specified"
                reason = "Specification not available in product database"
            elif str(product_value).lower() in str(tender_requirement).lower() or str(tender_requirement).lower() in str(product_value).lower():
                status = "Complied"
                reason = "Product meets tender requirement"
            else:
                status = "Deviation"
                reason = f"Product value '{product_value}' does not match tender requirement '{tender_requirement}'"
            
            deviation_table.append({
                "specification": spec_name,
                "tender_requirement": tender_requirement,
                "product_offered": product_value,
                "status": status,
                "reason": reason,
                "remarks": ""
            })
        
        return {
            "status": "success",
            "bid_number": request.bid_number,
            "product_code": request.product_code,
            "product_name": request.product_name,
            "product_file": product_file,
            "deviation_table": deviation_table,
            "total_specifications": len(deviation_table)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=6010)

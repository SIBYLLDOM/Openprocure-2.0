#!/usr/bin/env python3
"""One-off: run the railway document downloader for exactly one tender
(row_id=11208, tender_id=107187687, refno=82263410) instead of its normal
whole-org backfill loop, then also update the portal's doc_prep_sessions
table so the file is immediately usable in Doc Prep, same as if it had been
uploaded through the UI's "Upload Bid Document" button.
"""
import os
import re
import shutil
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright
import mysql.connector

import run_cppp_railway_document_downloader as dl

ROW = {"row_id": 11208, "tender_id": "107187687", "tender_refno": "82263410", "tender_title": "Absorbable Hemostat"}

DOC_PREP_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "backend", "uploads", "doc-prep"
)


def main():
    conn = dl.get_db_connection()
    dl.log("MySQL connected.")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False, args=dl.BROWSER_ARGS)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900}, locale="en-US",
            ignore_https_errors=True, accept_downloads=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        context.on("dialog", lambda d: (dl.log(f"[Dialog] {d.message[:80]}"), d.accept()))
        try:
            dl.process_row(context, conn, ROW, 1, 1)
        finally:
            try:
                context.close()
                browser.close()
            except Exception:
                pass

    # Read back what was saved and, if it succeeded, copy the file into the
    # backend's doc-prep uploads folder + register a doc_prep_sessions row.
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT downloaded_documents FROM open_tender_details WHERE row_id = %s", (ROW["row_id"],))
    row = cur.fetchone()
    cur.close()
    dl.log(f"[RESULT] downloaded_documents = {row['downloaded_documents']}")

    import json
    docs = json.loads(row["downloaded_documents"] or "[]")
    doc = docs[0] if docs else None
    if not doc or doc.get("status") != "downloaded":
        dl.log("[FAIL] No successful download to register with Doc Prep.")
        conn.close()
        return

    src_path = doc["local_path"]
    safe = re.sub(r'[^A-Za-z0-9_\-]', '_', ROW["tender_id"])
    dest_dir = os.path.join(DOC_PREP_DIR, safe)
    os.makedirs(dest_dir, exist_ok=True)
    ext = os.path.splitext(src_path)[1] or ".pdf"
    dest_path = os.path.join(dest_dir, f"{int(datetime.now().timestamp() * 1000)}{ext}")
    shutil.copy2(src_path, dest_path)
    dl.log(f"[COPY] {src_path} -> {dest_path}")

    cur = conn.cursor()
    cur.execute(
        """INSERT INTO doc_prep_sessions (bid_no, bid_doc_path, status)
           VALUES (%s, %s, 'idle')
           ON DUPLICATE KEY UPDATE bid_doc_path = VALUES(bid_doc_path), status = 'idle',
             processing_log = NULL, extracted_files = NULL""",
        (ROW["tender_id"], dest_path)
    )
    conn.commit()
    cur.close()
    conn.close()
    dl.log(f"[DONE] doc_prep_sessions registered for bid_no={ROW['tender_id']}, bid_doc_path={dest_path}")


if __name__ == "__main__":
    main()

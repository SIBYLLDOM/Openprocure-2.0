#!/usr/bin/env python3
"""Second attempt for tender 107187687 — the base64-decoded direct-URL shortcut
got an 81-byte "Request Rejected / 404" page from ireps.gov.in (bot/referer
protection on the pdfdocs endpoint), so this time force the actual click-through
path: click a.tndr_redirect in a real browser tab, let it navigate, and pull
whatever the browser actually receives (validating it's really a PDF before
trusting it) instead of decoding+requesting the URL out of session context.
"""
import os
import re
import json
from datetime import datetime

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import mysql.connector

import run_cppp_railway_document_downloader as dl

ROW = {"row_id": 11208, "tender_id": "107187687", "tender_refno": "82263410"}
SAVE_DIR = os.path.join(dl.DOWNLOAD_DIR, "107187687")
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

        downloaded_path = None

        def handle_download(download):
            nonlocal downloaded_path
            os.makedirs(SAVE_DIR, exist_ok=True)
            dest = os.path.join(SAVE_DIR, download.suggested_filename or "document.pdf")
            download.save_as(dest)
            downloaded_path = dest
            dl.log(f"  [BROWSER DOWNLOAD EVENT] Saved: {dest}")

        context.on("download", handle_download)

        page = context.new_page()
        try:
            if not dl.search_by_refno(page, ROW["tender_refno"]):
                dl.log("[FAIL] search_by_refno failed")
                return
            detail_page = dl.open_detail_page(context, page, ROW["tender_refno"], ROW["tender_id"])
            if not detail_page:
                dl.log("[FAIL] open_detail_page failed")
                return

            link = detail_page.locator("a.tndr_redirect").first
            if link.count() == 0:
                dl.log("[FAIL] No a.tndr_redirect link on detail page")
                return

            dl.log("  [CLICK] Clicking tndr_redirect link for real navigation...")
            new_page = None
            try:
                with context.expect_page(timeout=8000) as new_page_info:
                    link.click()
                new_page = new_page_info.value
                new_page.wait_for_load_state("networkidle", timeout=20000)
            except PlaywrightTimeoutError:
                dl.log("  [CLICK] No new tab opened, checking same page / download event...")
                try:
                    detail_page.wait_for_load_state("networkidle", timeout=15000)
                except PlaywrightTimeoutError:
                    pass
                new_page = detail_page

            import time
            time.sleep(3)  # let a possible download event land

            if downloaded_path and os.path.getsize(downloaded_path) > 2000:
                dl.log(f"[SUCCESS via download event] {downloaded_path} ({os.path.getsize(downloaded_path)} bytes)")
                register(conn, downloaded_path)
                return

            if new_page:
                final_url = new_page.url
                dl.log(f"  [LANDED] {final_url}")
                # If the browser navigated straight to the PDF, its response body IS the PDF.
                try:
                    resp = context.request.get(final_url, timeout=20000)
                    body = resp.body()
                    dl.log(f"  [FETCH landed URL] status={resp.status} bytes={len(body)} content-type={resp.headers.get('content-type')}")
                    if body[:4] == b'%PDF' or (resp.headers.get('content-type','').lower().startswith('application/pdf')):
                        os.makedirs(SAVE_DIR, exist_ok=True)
                        dest = os.path.join(SAVE_DIR, "viewNitPdf_5554092.pdf")
                        with open(dest, "wb") as f:
                            f.write(body)
                        dl.log(f"[SUCCESS via landed-URL fetch] {dest} ({len(body)} bytes)")
                        register(conn, dest)
                        return
                    else:
                        dl.log(f"  [NOT A PDF] first bytes: {body[:120]!r}")
                except Exception as e:
                    dl.log(f"  [FETCH ERROR] {e}")

            dl.log("[FAIL] Could not obtain a real PDF through click-through either.")
        finally:
            try:
                context.close()
                browser.close()
            except Exception:
                pass
            conn.close()


def register(conn, path):
    safe = re.sub(r'[^A-Za-z0-9_\-]', '_', ROW["tender_id"])
    dest_dir = os.path.join(DOC_PREP_DIR, safe)
    os.makedirs(dest_dir, exist_ok=True)
    import shutil
    ext = os.path.splitext(path)[1] or ".pdf"
    dest_path = os.path.join(dest_dir, f"{int(datetime.now().timestamp() * 1000)}{ext}")
    shutil.copy2(path, dest_path)
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO doc_prep_sessions (bid_no, bid_doc_path, status)
           VALUES (%s, %s, 'idle')
           ON DUPLICATE KEY UPDATE bid_doc_path = VALUES(bid_doc_path), status = 'idle',
             processing_log = NULL, extracted_files = NULL""",
        (ROW["tender_id"], dest_path)
    )
    cur.execute(
        "UPDATE open_tender_details SET downloaded_documents = %s WHERE row_id = %s",
        (json.dumps([{"status": "downloaded", "local_path": dest_path, "type": "tender_document"}]), ROW["row_id"])
    )
    conn.commit()
    cur.close()
    dl.log(f"[REGISTERED] bid_doc_path={dest_path}")


if __name__ == "__main__":
    main()

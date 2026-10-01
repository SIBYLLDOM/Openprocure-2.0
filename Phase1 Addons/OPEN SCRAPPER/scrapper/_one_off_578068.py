import sys, json
import backfill_missing_documents as bf
from playwright.sync_api import sync_playwright

DB_TENDER_ID = "2026_GMCK_578068_1"     # id stored in our DB (stale)
LIVE_TENDER_ID = "2026_GMCK_599915_1"   # current id per the source portal
REFNO = "MBS HOSPITAL KOTA NITNO4-2026-27"
SITE = "https://eproc.rajasthan.gov.in/nicgep/app"

conn = bf.mysql.connector.connect(**bf.DB_CONFIG)
cur = conn.cursor(dictionary=True)
cur.execute("SELECT tender_id, tender_refno, tender_title, tender_details FROM open_tender_details WHERE tender_id=%s", (DB_TENDER_ID,))
row = cur.fetchone()
cur.close()
row["tender_site_link"] = SITE
row["_existing_details"] = row.get("tender_details") or {}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=bf.BROWSER_ARGS)
    context = browser.new_context(
        viewport={"width": 1280, "height": 900}, locale="en-US",
        ignore_https_errors=True, java_script_enabled=True, accept_downloads=True,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    )
    page = context.new_page()
    page.set_default_timeout(60000)

    opened = bf.find_and_open_tender(page, SITE, LIVE_TENDER_ID, REFNO)
    print("opened:", opened, "url:", page.url)
    if not opened:
        # dump what rows were actually found for inspection
        rows = page.locator("table#table.list_table tr")
        for i in range(min(rows.count(), 30)):
            tds = page.locator("table#table.list_table tr").nth(i).locator("td")
            if tds.count() >= 5:
                print(i, repr(bf._parse_row_tender_id(tds.nth(4))))
    else:
        if not bf.solve_generic_captcha(page, max_attempts=20):
            print("CAPTCHA FAILED")
        else:
            try:
                page.wait_for_selector("div#tfullview, table#table.list_table", timeout=15000)
            except Exception:
                pass
            nicgep_url = page.url
            details = bf.scrape_nicgep_detail(page)
            doc_urls = details.pop("_nicgep_doc_urls", [])
            save_dir = __import__("os").path.join(bf.DOWNLOAD_DIR, DB_TENDER_ID)
            downloaded = bf.download_nit_documents(page, nicgep_url, save_dir)
            zip_result = bf.download_work_item_zip(page, save_dir, DB_TENDER_ID)
            if zip_result: downloaded.append(zip_result)
            corrigendum = bf.scrape_corrigendums(page, save_dir)
            print("downloaded:", json.dumps(downloaded, ensure_ascii=False)[:2000])
            print("doc_urls:", doc_urls)
            print("corrigendum:", json.dumps(corrigendum, ensure_ascii=False)[:1000])

            update = {}
            if downloaded: update["downloaded_documents"] = json.dumps(downloaded, ensure_ascii=False)
            if doc_urls: update["file_link"] = json.dumps([{"url": u, "type": "tender_document"} for u in doc_urls], ensure_ascii=False)
            if corrigendum: update["corrigendum"] = json.dumps(corrigendum, ensure_ascii=False)
            update["tender_site_link"] = nicgep_url
            if details:
                merged = row.get("_existing_details") or {}
                if isinstance(merged, str):
                    merged = json.loads(merged) if merged.strip() else {}
                merged.update(details)
                update["tender_details"] = json.dumps(merged, ensure_ascii=False)
            if downloaded or corrigendum:
                bf.update_row(conn, DB_TENDER_ID, update)
                print("DB updated for", DB_TENDER_ID)
            else:
                print("No documents found to save.")
    browser.close()
conn.close()

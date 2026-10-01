#!/usr/bin/env python3
"""One-off retry: reuse the already-known CPPP detail href for
2026_DMC_99815_1 and just redo the detail-scrape/download step with a
longer timeout, skipping the search+captcha step that already succeeded."""
import json
import mysql.connector
from playwright.sync_api import sync_playwright

import openscraper as osc

TARGET_TID = "2026_DMC_99815_1"
HREF = "https://eprocure.gov.in/cppp/tendersfullviewmmp/MjA3ODA4MTY4A13h1VmpGYWExTXlTWGxTYkdoUFZqSm9jbHBJYjNkUFVUMDk=A13h1VmpGYWExTXlTWGxTYkdoUFZqSm9jbHBJYjNkUFVUMDk=A13h1MTc4OTExNzUyMg==A13h1R0RNQy9TdG9yZS9TdXJnaWNhbDEvMjAyNi82NDEyA13h1MjAyNl9ETUNfOTk4MTVfMQ=="

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=osc.BROWSER_ARGS)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900}, locale="en-US",
            ignore_https_errors=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        page = context.new_page()
        page.set_default_timeout(90000)
        # dummy referer page so detail_page.goto(referer=page.url) works
        page.goto(osc.STATES_URL, timeout=60000, wait_until="domcontentloaded")

        details, _new_tab, ok = osc.open_detail_and_scrape(page, HREF, TARGET_TID)
        print("ok:", ok)
        for k, v in details.items():
            if not k.startswith("_"):
                print(f"  {k}: {v}")

        doc_urls = details.pop("_doc_urls", []) + details.pop("_nicgep_doc_urls", [])
        downloaded_documents = details.pop("_downloaded_documents", [])
        corrigendum = details.pop("_corrigendum", [])
        print("\ndoc_urls:", doc_urls)
        print("downloaded_documents:", downloaded_documents)
        print("corrigendum:", corrigendum)

        if ok:
            nicgep_fields = osc.extract_nicgep_fields(details)
            conn = mysql.connector.connect(**DB_CONFIG)
            cur = conn.cursor()
            set_clauses = []
            params = []
            for col, val in nicgep_fields.items():
                if val is not None:
                    set_clauses.append(f"{col} = %s")
                    params.append(val)
            set_clauses.append("tender_details = %s")
            params.append(json.dumps(details, ensure_ascii=False))
            if doc_urls:
                set_clauses.append("file_link = %s")
                params.append(json.dumps([{"url": u, "type": "tender_document"} for u in doc_urls]))
            if downloaded_documents:
                set_clauses.append("downloaded_documents = %s")
                params.append(json.dumps(downloaded_documents, ensure_ascii=False))
            if corrigendum:
                set_clauses.append("corrigendum = %s")
                params.append(json.dumps(corrigendum, ensure_ascii=False))
            params.append(TARGET_TID)
            sql = f"UPDATE open_tender_details SET {', '.join(set_clauses)} WHERE tender_id = %s"
            cur.execute(sql, params)
            conn.commit()
            print(f"\nUpdated {cur.rowcount} row(s) in open_tender_details")
            cur.close()
            conn.close()

        browser.close()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
fetch_one_tender_detail.py — one-off: fetch full detail for a single CPPP
tender (Doon Medical College / GDMC/Store/Surgical1/2026/6412 /
2026_DMC_99815_1) and fill in the fields still blank in open_tender_details.

Reuses the same search -> captcha -> detail-page pipeline every other CPPP
scraper here already uses (openscraper.py), just scoped to one specific
tender instead of a full keyword sweep.
"""
import sys
import mysql.connector
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

import openscraper as osc

TARGET_TID = "2026_DMC_99815_1"
TARGET_REFNO = "GDMC/Store/Surgical1/2026/6412"
SEARCH_KEYWORD = "Surgical Items"

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}


def find_row(page):
    for attempt in range(1, 6):
        page.goto(osc.STATES_URL, timeout=60000, wait_until="domcontentloaded")
        kw_input = page.locator("input#skeyword")
        kw_input.wait_for(state="visible", timeout=10000)
        kw_input.fill(SEARCH_KEYWORD)
        if not osc.fill_captcha(page):
            print(f"[attempt {attempt}] captcha solve failed, retrying")
            continue
        page.locator("input#btnSearch").click()
        page.wait_for_timeout(2500)
        content = page.content().lower()
        if "the answer you entered for the captcha was not correct" in content or "invalid captcha" in content:
            print(f"[attempt {attempt}] captcha rejected, retrying")
            continue
        break
    else:
        print("Could not get past captcha after 5 attempts")
        return None

    if "no tenders found" in content or "no record found" in content:
        print("No results for keyword search")
        return None

    try:
        page.wait_for_selector("table#table.list_table", timeout=15000)
    except PlaywrightTimeoutError:
        print("Results table never appeared")
        return None

    page_num = 1
    while True:
        rows_loc = page.locator("table#table.list_table tbody tr")
        for idx in range(rows_loc.count()):
            row = rows_loc.nth(idx)
            tds = row.locator("td")
            if tds.count() < 6:
                continue
            title, refno, tid, href = osc.parse_title_cell(tds.nth(4))
            if tid == TARGET_TID or (refno and TARGET_REFNO in refno):
                return {
                    "e_pub": tds.nth(1).inner_text().strip(),
                    "closing": tds.nth(2).inner_text().strip(),
                    "opening": tds.nth(3).inner_text().strip(),
                    "title": title, "refno": refno, "tid": tid, "href": href,
                    "state_name": tds.nth(5).inner_text().strip(),
                }
        print(f"page {page_num}: not found among {rows_loc.count()} rows, trying next page")
        if not osc.go_to_next_page(page):
            break
        page_num += 1
        page.wait_for_timeout(1500)

    return None


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
        page.set_default_timeout(60000)

        data = find_row(page)
        if not data:
            print("FAILED: could not locate the tender row via search")
            sys.exit(1)

        print(f"Found row: tid={data['tid']} refno={data['refno']} href={data['href']}")

        details, _new_tab, ok = osc.open_detail_and_scrape(page, data["href"], data["tid"])
        if not ok:
            print("FAILED: could not open/scrape the detail page")
            sys.exit(1)

        print("Raw scraped detail fields:")
        for k, v in details.items():
            if not k.startswith("_"):
                print(f"  {k}: {v}")

        nicgep_fields = osc.extract_nicgep_fields(details)
        print("\nMapped NICGEP fields:")
        for k, v in nicgep_fields.items():
            print(f"  {k}: {v}")

        doc_urls = details.pop("_doc_urls", []) + details.pop("_nicgep_doc_urls", [])
        downloaded_documents = details.pop("_downloaded_documents", [])
        corrigendum = details.pop("_corrigendum", [])

        conn = mysql.connector.connect(**DB_CONFIG)
        cur = conn.cursor()

        import json
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

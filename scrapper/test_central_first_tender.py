#!/usr/bin/env python3
"""
test_central_first_tender.py — force the FIRST tender row of the CPPP Central
listing as "relevant" (no LLM/prefilter wait) and run it through the REAL
open_detail_and_scrape() + db_save_tenders() from run_cppp_central_open_category.py,
to validate the rewritten deep-dive/download/enrichment pipeline end-to-end.
"""

import asyncio
import json
from playwright.async_api import async_playwright

from run_cppp_central_open_category import (
    CPPP_URL, UA, DB_CONFIG,
    open_central_active_tenders, handle_captcha_if_present, parse_page_rows,
    open_detail_and_scrape, db_save_tenders, log,
)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--disable-gpu", "--no-sandbox"],
        )
        context = await browser.new_context(user_agent=UA, accept_downloads=True)
        page = await context.new_page()

        log(f"Navigating to {CPPP_URL}")
        await page.goto(CPPP_URL, timeout=60000, wait_until="domcontentloaded")
        await open_central_active_tenders(page)
        await handle_captcha_if_present(page)

        rows = await parse_page_rows(page)
        if not rows:
            log("[FAIL] No rows parsed on Central listing page 1")
            await browser.close()
            return
        row = rows[0]
        log(f"[TEST] Forcing FIRST row relevant -> tender_id={row['tid']}  title={row['title'][:80]}")

        details = await open_detail_and_scrape(context, row["href"], row["tid"])
        tender_site_link = details.pop("_tender_site_link", None)
        downloaded_documents = details.pop("_downloaded_documents", None)

        log(f"[RESULT] tender_id={row['tid']}")
        log(f"[RESULT] details keys: {list(details.keys()) if details else 'EMPTY'}")
        log(f"[RESULT] tender_site_link: {tender_site_link}")
        log(f"[RESULT] downloaded_documents: {downloaded_documents}")

        tender_page_link = ("https://eprocure.gov.in" + row["href"]) if row["href"].startswith("/") else row["href"]
        record = {
            "state": row["state_name"], "organisation_name": row["state_name"],
            "e_published_date": row["e_pub"], "closing_date": row["closing"],
            "opening_date": row["opening"], "tender_title": row["title"],
            "tender_refno": row["refno"], "tender_id": row["tid"][:95],
            "organisation_chain": row["state_name"],
            "tender_details": json.dumps(details, ensure_ascii=False) if details else None,
            "_details_raw": details,
            "file_link": None, "tender_page_link": tender_page_link,
            "tender_site_link": tender_site_link,
            "relevency_checker": "proceed_futher",
            "relevancy_reason": "Forced relevant for Central-crawl pipeline testing",
            "dept": "Diagno",
            "downloaded_documents": json.dumps(downloaded_documents, ensure_ascii=False) if downloaded_documents else None,
            "corrigendum": None, "keyword": "test",
        }
        saved = db_save_tenders([record])
        log(f"[RESULT] DB rows saved: {saved}")

        await browser.close()

asyncio.run(main())

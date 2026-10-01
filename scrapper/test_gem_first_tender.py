#!/usr/bin/env python3
"""
test_gem_first_tender.py — force the FIRST tender row of the CPPP GeM listing
as "relevant" (no LLM/prefilter wait) and run it through the REAL
deep_dive_documents() + db_save_tenders() from run_cppp_gem_open_category.py,
to validate the pipeline end-to-end for this listing type.
"""

import asyncio
import json
from playwright.async_api import async_playwright

from run_cppp_gem_open_category import (
    GEM_URL, UA, DB_CONFIG,
    handle_captcha_if_present, parse_page_rows, deep_dive_documents,
    DETAILS_TO_COLUMNS, details_to_column_values, log,
)
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
import mysql.connector


def db_upsert_forced(row, details, downloaded_files):
    conn = mysql.connector.connect(**DB_CONFIG)
    cur = conn.cursor()
    column_names = list(DETAILS_TO_COLUMNS.values())
    query = f"""
    INSERT INTO open_tender_details (
        state, organisation_name, e_published_date, closing_date,
        opening_date, tender_title, tender_refno, tender_id,
        organisation_chain, tender_details, file_link, tender_page_link,
        relevency_checker, relevancy_reason, dept,
        downloaded_documents, corrigendum, searched_keyword,
        {", ".join(column_names)}
    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
        {", ".join(["%s"] * len(column_names))})
    ON DUPLICATE KEY UPDATE
        tender_details = VALUES(tender_details),
        downloaded_documents = VALUES(downloaded_documents),
        relevency_checker = VALUES(relevency_checker),
        relevancy_reason = VALUES(relevancy_reason),
        dept = VALUES(dept),
        {", ".join(f"{c} = VALUES({c})" for c in column_names)},
        updated_at = CURRENT_TIMESTAMP
    """
    column_values = details_to_column_values(details)
    vals = (
        row["state_name"], row["state_name"], row["e_pub"], row["closing"], row["opening"],
        row["title"], row["refno"], row["tid"][:95], row["state_name"],
        json.dumps(details, ensure_ascii=False) if details else None,
        None, None, "proceed_futher",
        "Forced relevant for GeM-listing pipeline testing",
        "Diagno",
        json.dumps(downloaded_files, ensure_ascii=False) if downloaded_files else None,
        None, "deep_dive_test",
        *[column_values.get(c) for c in column_names],
    )
    cur.execute(query, vals)
    conn.commit()
    cur.close()
    conn.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--disable-gpu", "--no-sandbox"],
        )
        context = await browser.new_context(user_agent=UA, accept_downloads=True)
        page = await context.new_page()

        log(f"Navigating to {GEM_URL}")
        await page.goto(GEM_URL, timeout=60000, wait_until="domcontentloaded")
        try:
            await page.wait_for_selector(
                "table#table.list_table, img[data-drupal-selector='edit-captcha-image'], #captchaImage",
                timeout=60000,
            )
        except PlaywrightTimeoutError:
            pass
        await handle_captcha_if_present(page)

        rows = await parse_page_rows(page)
        if not rows:
            log("[FAIL] No rows parsed on GeM listing page 1")
            await browser.close()
            return
        row = next((r for r in rows if r["href"]), rows[0])
        log(f"[TEST] Forcing relevant -> tender_id={row['tid']}  title={row['title'][:80]}  href={bool(row['href'])}")

        details, downloaded_files = await deep_dive_documents(page, row)

        log(f"[RESULT] tender_id={row['tid']}")
        log(f"[RESULT] details keys: {list(details.keys()) if details else 'EMPTY'}")
        log(f"[RESULT] downloaded_files: {downloaded_files}")

        db_upsert_forced(row, details, downloaded_files)
        log("[RESULT] Saved to DB.")

        await browser.close()

asyncio.run(main())

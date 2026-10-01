#!/usr/bin/env python3
"""
test_first_tender_forced.py — force the FIRST tender row of page 1 as "relevant"
(no LLM/prefilter calls) and run it through the REAL deep_dive_documents() +
db upsert from run_cppp_states_open_category.py, to validate the document
download fix end-to-end without waiting on the LLM filter tiers.
"""

import asyncio
import mysql.connector
from playwright.async_api import async_playwright

from run_cppp_states_open_category import (
    STATES_URL, UA, DB_CONFIG,
    handle_captcha_if_present, parse_page_rows, deep_dive_documents, log,
    DETAILS_TO_COLUMNS, details_to_column_values,
)


def db_upsert_forced(row, details, downloaded_files):
    import json
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
        "Forced relevant for document-download testing (1st tender, page 1)",
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

        log(f"Navigating to {STATES_URL}")
        await page.goto(STATES_URL, timeout=60000, wait_until="domcontentloaded")
        await handle_captcha_if_present(page)

        rows = await parse_page_rows(page)
        row = rows[3]
        row["tid"] = row["tid"][:95]
        log(f"[TEST] Forcing 4TH row relevant -> tender_id={row['tid']}  title={row['title'][:80]}")

        details, downloaded_files = await deep_dive_documents(page, row)

        log(f"[RESULT] tender_id={row['tid']}")
        log(f"[RESULT] details keys: {list(details.keys()) if details else 'EMPTY'}")
        log(f"[RESULT] downloaded_files: {downloaded_files}")

        db_upsert_forced(row, details, downloaded_files)
        log("[RESULT] Saved to DB.")

        await browser.close()

asyncio.run(main())

#!/usr/bin/env python3
"""
backfill_360_items.py — one-off backfill for the blank-title bug.

run360_endo_perfect_category.py's card scraper used to silently return items=""
for any bid whose item name was short enough to render as plain text (no <a>
popover) — see the fix in that file. That bug already wrote ~6,400 dept='360'
gem_tenders rows with items='' before the fix landed.

Re-running the keyword scraper does NOT backfill them: its Ollama relevancy
filter drops most rows on each page, and only rows that are kept get written to
the DB — a row already sitting in gem_tenders (already accepted earlier) can
easily be "dropped" on a re-scrape and simply never gets re-saved, leaving the
blank items untouched.

This script instead updates exactly the rows that need it, directly, with no
relevancy filtering: for each active dept='360' tender with items='', search
GeM's own search box for that EXACT bid number (returns exactly one card,
already known-relevant since it's already in our DB) and pull the item text
from it using the same popover-or-plain-text extraction gem.py uses.
"""

import asyncio
import logging
import sys
import time

import mysql.connector
from playwright.async_api import async_playwright

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}
BASE_URL = "https://bidplus.gem.gov.in"
# Without these, headless Chromium crashes outright after a couple of requests
# on this box (confirmed live: "Target page ... has been closed" within 2
# navigations using default launch args) — same flags the other scrapers here
# already rely on for stability (see cppp360_states_endo_scraper.py).
BROWSER_ARGS = [
    "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-extensions", "--disable-background-networking",
    "--disk-cache-size=0", "--aggressive-cache-discard",
    "--disable-application-cache",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("backfill_360_items")


def fetch_blank_rows():
    conn = mysql.connector.connect(**DB_CONFIG)
    cur = conn.cursor(dictionary=True)
    cur.execute(
        """
        SELECT bid_number FROM gem_tenders
        WHERE dept = '360' AND (items IS NULL OR items = '')
          AND (ra_no IS NULL OR TRIM(ra_no) = '')
          AND (marked_not_relevant IS NULL OR marked_not_relevant = 0)
        ORDER BY bid_number
        """
    )
    rows = [r["bid_number"] for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def update_items(bid_number: str, items: str):
    conn = mysql.connector.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute(
        "UPDATE gem_tenders SET items = %s WHERE bid_number = %s",
        (items, bid_number),
    )
    conn.commit()
    cur.close()
    conn.close()


async def extract_items(card) -> str:
    item_row = await card.query_selector(".card-body .col-md-4 .row:nth-child(1)")
    if not item_row:
        return ""
    popover_el = await item_row.query_selector("a[data-content]")
    if popover_el:
        return (await popover_el.get_attribute("data-content") or "").strip()
    return (await item_row.inner_text()).replace("Items:", "").strip()


async def main():
    bid_numbers = fetch_blank_rows()
    total = len(bid_numbers)
    logger.info(f"{total} dept='360' tender(s) with blank items to backfill")
    if not total:
        return

    updated, not_found, unchanged = 0, 0, 0

    # A single long-lived page degrades after a few hundred AJAX searches — the
    # search box eventually stops responding and every subsequent row burns the
    # full 30s default timeout before failing (that's what actually happened the
    # first time this ran: it silently ground to a 30s-per-row crawl after ~630
    # successful searches). Reloading the page fresh on EVERY row instead turned
    # out to be too aggressive for this box — the renderer crashed outright after
    # 2 navigations, likely from resource pressure (this machine already runs
    # many other Chrome/Python processes). The middle ground: reuse the page
    # normally, recycle it proactively every RECYCLE_EVERY rows before it has a
    # chance to degrade, and recover (new page/browser) on any crash instead of
    # aborting the whole run.
    RECYCLE_EVERY = 150

    async def new_browser_page(p):
        browser = await p.chromium.launch(headless=True, args=BROWSER_ARGS)
        page = await browser.new_page()
        # networkidle, not domcontentloaded — the search box is rendered by the
        # page's own JS after the initial DOM load, so domcontentloaded can fire
        # before it exists and every wait_for_selector right after intermittently
        # times out even though the page is fine (confirmed live).
        await page.goto(f"{BASE_URL}/all-bids", timeout=30000, wait_until="networkidle")
        return browser, page

    async with async_playwright() as p:
        browser, page = await new_browser_page(p)

        for i, bid_number in enumerate(bid_numbers, 1):
            if i > 1 and (i - 1) % RECYCLE_EVERY == 0:
                try:
                    await browser.close()
                except Exception:
                    pass
                browser, page = await new_browser_page(p)
                logger.info(f"--- recycled browser/page at row {i} ---")

            try:
                box = await page.wait_for_selector("input#searchBid", timeout=15000)
                await box.fill(bid_number, timeout=8000)
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(1800)

                cards = await page.query_selector_all("div.card")
                if not cards:
                    not_found += 1
                    logger.info(f"[{i}/{total}] {bid_number} — no longer listed on GeM, skipping")
                    continue

                items = await extract_items(cards[0])
                if items:
                    update_items(bid_number, items)
                    updated += 1
                    logger.info(f"[{i}/{total}] {bid_number} — items: {items[:80]}")
                else:
                    unchanged += 1
                    logger.info(f"[{i}/{total}] {bid_number} — still blank on GeM's own listing")
            except Exception as e:
                logger.warning(f"[{i}/{total}] {bid_number} — error ({e.__class__.__name__}: {e}); recovering page")
                try:
                    await browser.close()
                except Exception:
                    pass
                try:
                    browser, page = await new_browser_page(p)
                except Exception:
                    logger.exception(f"[{i}/{total}] {bid_number} — could not recover browser, aborting")
                    break

            if i % 50 == 0:
                logger.info(f"--- progress: {i}/{total} | updated={updated} not_found={not_found} unchanged={unchanged} ---")

        try:
            await browser.close()
        except Exception:
            pass

    logger.info(f"=== DONE | updated={updated} not_found={not_found} unchanged={unchanged} / total={total} ===")


if __name__ == "__main__":
    asyncio.run(main())

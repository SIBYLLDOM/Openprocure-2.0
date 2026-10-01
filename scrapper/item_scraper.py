#!/usr/bin/env python3
import asyncio
import time
import mysql.connector
from playwright.async_api import async_playwright
import logging

BASE_URL = "https://bidplus.gem.gov.in"
SLEEP_INTERVAL = 30 * 60  # 30 minutes

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
    "autocommit": False,
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("normal-scraper")

# -------------------------------------------------
# SQL
# -------------------------------------------------
FETCH_PENDING_BIDS_SQL = """
SELECT bid_number
FROM gem_tenders
WHERE items = ''
LIMIT 50
"""

UPDATE_SQL = """
UPDATE gem_tenders
SET
  detail_url = %s,
  items = %s,
  quantity = %s,
  department = %s,
  start_date = %s,
  end_date = %s,
  ra_no = %s,
  ra_url = %s
WHERE bid_number = %s
"""

# -------------------------------------------------
# DB HELPERS
# -------------------------------------------------
def fetch_pending_bids():
    conn = mysql.connector.connect(**DB_CONFIG)
    cur = conn.cursor()
    try:
        cur.execute(FETCH_PENDING_BIDS_SQL)
        return [r[0] for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()

def update_bid(row):
    conn = mysql.connector.connect(**DB_CONFIG)
    cur = conn.cursor()
    try:
        cur.execute(UPDATE_SQL, row)
        conn.commit()
    finally:
        cur.close()
        conn.close()

# -------------------------------------------------
# SCRAPE ONE BID (CARD ONLY)
# -------------------------------------------------
async def scrape_bid(page, bid_no: str):
    logger.info(f"Updating bid: {bid_no}")

    await page.goto(f"{BASE_URL}/all-bids", timeout=0, wait_until="networkidle")
    await asyncio.sleep(1.5)

    search_box = await page.query_selector("input#searchBid")
    if not search_box:
        logger.error("Search box not found")
        return

    await search_box.fill(bid_no)
    await asyncio.sleep(0.3)
    await search_box.press("Enter")
    await asyncio.sleep(2.5)

    c = await page.query_selector("div.card")
    if not c:
        logger.warning(f"No result for {bid_no}")
        return

    bid_link = await c.query_selector(".block_header a.bid_no_hover")
    detail_url = BASE_URL + "/" + (await bid_link.get_attribute("href")).lstrip("/")

    item_el = await c.query_selector(".card-body .col-md-4 .row:nth-child(1) a")
    items = (await item_el.inner_text()).strip() if item_el else ""

    qty_el = await c.query_selector(".card-body .col-md-4 .row:nth-child(2)")
    quantity = (await qty_el.inner_text()).replace("Quantity:", "").strip() if qty_el else ""

    dept_el = await c.query_selector(".card-body .col-md-5 .row:nth-child(2)")
    department = (await dept_el.inner_text()).strip() if dept_el else ""

    start_el = await c.query_selector("span.start_date")
    start_date = (await start_el.inner_text()).strip() if start_el else ""

    end_el = await c.query_selector("span.end_date")
    end_date = (await end_el.inner_text()).strip() if end_el else ""

    # -------- RA --------
    ra_no = ""
    ra_url = ""
    try:
        ra_p = await c.query_selector("p.bid_no")
        if ra_p and "RA NO" in (await ra_p.inner_text()):
            ra_link = await ra_p.query_selector("a")
            ra_no = (await ra_link.inner_text()).strip()
            href = await ra_link.get_attribute("href")
            if href:
                ra_url = BASE_URL + href if href.startswith("/") else href
    except:
        pass

    update_bid((
        detail_url,
        items,
        quantity,
        department,
        start_date,
        end_date,
        ra_no,
        ra_url,
        bid_no,
    ))

    logger.info(f"Updated bid: {bid_no}")

# -------------------------------------------------
# MAIN LOOP (EVERY 30 MINUTES)
# -------------------------------------------------
async def main_loop():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            channel="chrome",
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = await browser.new_page()

        while True:
            try:
                bids = fetch_pending_bids()
                if not bids:
                    logger.info("No pending bids found")
                else:
                    logger.info(f"Found {len(bids)} pending bids")

                for bid_no in bids:
                    try:
                        await scrape_bid(page, bid_no)
                        await asyncio.sleep(1.5)
                    except Exception as e:
                        logger.warning(f"Error scraping {bid_no}: {e}")

            except Exception as e:
                logger.exception(f"Main loop error: {e}")

            logger.info("Sleeping for 30 minutes...")
            await asyncio.sleep(SLEEP_INTERVAL)

        await browser.close()

# -------------------------------------------------
# ENTRY
# -------------------------------------------------
if __name__ == "__main__":
    asyncio.run(main_loop())

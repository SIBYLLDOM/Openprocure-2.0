#!/usr/bin/env python3
import asyncio
import json
import os
import re
import signal
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import mysql.connector
from playwright.async_api import async_playwright
import logging

# ---------------------------
# CONFIG
# ---------------------------
SCRAPER_NAME       = "endo_category"
BASE_URL           = "https://bidplus.gem.gov.in"
ADVANCE_SEARCH_URL = "https://bidplus.gem.gov.in/advance-search"
CATEGORY_FILE      = "./endo_cat.json"
QUEUE_MAXSIZE      = 20000
BATCH_SIZE         = 500
BATCH_TIMEOUT      = 5.0

DB_CONFIG = {
    "host":       "localhost",
    "user":       "root",
    "password":   "meril",
    "database":   "tender_automation_with_ai",
    "autocommit": False,
}

# ---------------------------
# GLOBALS
# ---------------------------
SHUTDOWN = False
_stats   = {"records_saved": 0, "current_item": "—", "items_done": 0, "total_items": 0}

# ---------------------------
# LOGGING
# ---------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("endo-category")

# ---------------------------
# SQL
# ---------------------------
UPSERT_SQL = """
INSERT INTO gem_tenders
(keyword, page_no, bid_number, detail_url, items, quantity, department,
 start_date, end_date, ra_no, ra_url, perfect_cat, sub_cat, dept)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
ON DUPLICATE KEY UPDATE
  keyword = VALUES(keyword), page_no = VALUES(page_no),
  detail_url = VALUES(detail_url), items = VALUES(items),
  quantity = VALUES(quantity), department = VALUES(department),
  start_date = VALUES(start_date), end_date = VALUES(end_date),
  ra_no = VALUES(ra_no), ra_url = VALUES(ra_url),
  perfect_cat = VALUES(perfect_cat), sub_cat = VALUES(sub_cat),
  dept = VALUES(dept);
"""

PROCESSING_SQL = """
INSERT INTO tender_processing_results (bid_no, tender_title, result)
VALUES (%s, %s, "yes")
ON DUPLICATE KEY UPDATE tender_title = VALUES(tender_title);
"""

# ---------------------------
# DB FUNCTIONS
# ---------------------------
def db_connect():
    return mysql.connector.connect(**DB_CONFIG)

def db_execute_many(rows):
    if not rows:
        return 0
    conn = db_connect()
    cur  = conn.cursor()
    try:
        cur.executemany(UPSERT_SQL, rows)
        processing_rows = [(r[2], r[4]) for r in rows]
        cur.executemany(PROCESSING_SQL, processing_rows)
        conn.commit()
        _stats["records_saved"] += len(rows)
        return len(rows)
    finally:
        cur.close()
        conn.close()

# ---------------------------
# SCRAPER UTILITIES
# ---------------------------
async def extract_total_counts(page):
    await asyncio.sleep(1.2)
    total_records, total_pages = 0, 1
    el = await page.query_selector("span.pos-bottom")
    if el:
        m = re.search(r"of\s+(\d+)\s+records", await el.inner_text())
        if m:
            total_records = int(m.group(1))
    last_page = await page.query_selector("#light-pagination a.page-link:nth-last-child(2)")
    if last_page:
        t = (await last_page.inner_text()).strip()
        if t.isdigit():
            total_pages = int(t)
    return total_records, total_pages

async def scrape_single_page(page, category_name, page_no, dept="Endo"):
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await asyncio.sleep(0.3)
    cards = await page.query_selector_all("div.card")
    rows  = []
    for c in cards:
        try:
            bid_link = await c.query_selector(".block_header a.bid_no_hover")
            if not bid_link:
                continue
            bid_no     = (await bid_link.inner_text()).strip()
            detail_url = BASE_URL + "/" + (await bid_link.get_attribute("href")).lstrip("/")
            item_row   = await c.query_selector(".card-body .col-md-4 .row:nth-child(1)")
            items      = ""
            if item_row:
                # Long item names render as a truncated <a data-content="...">
                # popover; short ones are plain text with no anchor at all.
                popover_el = await item_row.query_selector("a[data-content]")
                if popover_el:
                    items = (await popover_el.get_attribute("data-content") or "").strip()
                else:
                    items = (await item_row.inner_text()).replace("Items:", "").strip()
            qty_el     = await c.query_selector(".card-body .col-md-4 .row:nth-child(2)")
            quantity   = (await qty_el.inner_text()).replace("Quantity:", "").strip() if qty_el else ""
            dept_el    = await c.query_selector(".card-body .col-md-5 .row:nth-child(2)")
            department = (await dept_el.inner_text()).strip() if dept_el else ""
            start_el   = await c.query_selector("span.start_date")
            start_date = (await start_el.inner_text()).strip() if start_el else ""
            end_el     = await c.query_selector("span.end_date")
            end_date   = (await end_el.inner_text()).strip() if end_el else ""
            ra_no, ra_url = "", ""
            ra_p = await c.query_selector("p.bid_no")
            if ra_p and "RA NO" in (await ra_p.inner_text()):
                ra_link = await ra_p.query_selector("a")
                if ra_link:
                    ra_no = (await ra_link.inner_text()).strip()
                    href  = await ra_link.get_attribute("href")
                    if href:
                        ra_url = BASE_URL + href if href.startswith("/") else href
            rows.append((category_name, page_no, bid_no, detail_url,
                         items, quantity, department, start_date, end_date,
                         ra_no, ra_url, 1, category_name, dept))
        except Exception:
            logger.exception("Error scraping card")
    return rows

def load_categories():
    if not os.path.exists(CATEGORY_FILE):
        logger.error(f"Category file not found: {CATEGORY_FILE}")
        return []
    with open(CATEGORY_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    categories = [item["item_category"] for item in data]
    logger.info(f"Loaded {len(categories)} categories from {CATEGORY_FILE}")
    return categories

# ---------------------------
# SCRAPER WORKER
# ---------------------------
async def scraper_worker(queue: asyncio.Queue):
    global SHUTDOWN
    logger.info("Scraper starting (category-based mode)...")
    categories = load_categories()
    if not categories:
        logger.error("No categories to scrape!")
        SHUTDOWN = True
        return
    _stats["total_items"] = len(categories)
    _stats["items_done"]  = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=False,
                                           args=["--disable-blink-features=AutomationControlled"])
        context = await browser.new_context()
        page    = await context.new_page()
        try:
            for category in categories:
                if SHUTDOWN:
                    break
                _stats["current_item"] = category
                logger.info(f"===== START CATEGORY: {category} =====")
                try:
                    await page.goto(ADVANCE_SEARCH_URL, timeout=60000, wait_until="networkidle")
                    await asyncio.sleep(2)
                    await page.click("span.select2-selection__rendered#select2-categorybid-container")
                    await asyncio.sleep(1)
                    try:
                        search_input = await page.wait_for_selector(
                            "input.select2-search__field", state="visible", timeout=10000
                        )
                    except Exception:
                        logger.warning(f"Search input not visible for '{category}', skipping")
                        _stats["items_done"] += 1
                        continue
                    await search_input.click()
                    await page.keyboard.type(category, delay=100)
                    await asyncio.sleep(1.5)
                    option_selector = "li.select2-results__option[id*='select2-categorybid-result']"
                    try:
                        await page.wait_for_selector(option_selector, timeout=5000)
                        await page.click(option_selector)
                        await asyncio.sleep(1)
                    except Exception as e:
                        logger.warning(f"Option not found for '{category}': {e}")
                        _stats["items_done"] += 1
                        continue
                    search_button = await page.query_selector("a#searchByBid")
                    if not search_button:
                        logger.error("Search button not found!")
                        _stats["items_done"] += 1
                        continue
                    await search_button.click()
                    await asyncio.sleep(3)
                    total_records, total_pages = await extract_total_counts(page)
                    logger.info(f"Category '{category}' → {total_records} records, {total_pages} pages")
                    page_no = 1
                    while page_no <= total_pages and not SHUTDOWN:
                        rows = await scrape_single_page(page, category, page_no)
                        for r in rows:
                            await queue.put(r)
                        logger.info(f"[{category}] Page {page_no}/{total_pages} ({len(rows)} records)")
                        if page_no < total_pages:
                            next_btn = await page.query_selector("#light-pagination a.next")
                            if not next_btn:
                                await asyncio.sleep(14)
                                next_btn = await page.query_selector("#light-pagination a.next")
                            if not next_btn:
                                break
                            await next_btn.click()
                            await asyncio.sleep(1.2)
                        page_no += 1
                    _stats["items_done"] += 1
                    logger.info(f"===== END CATEGORY: {category} =====")
                except Exception as e:
                    logger.exception(f"Error on category '{category}', skipping: {e}")
                    _stats["items_done"] += 1
        except Exception as e:
            logger.exception(f"Fatal scraping error: {e}")
        finally:
            SHUTDOWN = True
            _stats["current_item"] = "—"
            await browser.close()

# ---------------------------
# DB CONSUMER
# ---------------------------
async def db_consumer(queue: asyncio.Queue, executor: ThreadPoolExecutor):
    buffer, last_flush = [], time.time()
    async def flush():
        nonlocal buffer, last_flush
        if buffer:
            rows = buffer; buffer = []
            await asyncio.get_event_loop().run_in_executor(executor, db_execute_many, rows)
            logger.info(f"✓ Flushed {len(rows)} records to database")
            last_flush = time.time()
    while not (SHUTDOWN and queue.empty()):
        try:
            item = await asyncio.wait_for(queue.get(), timeout=1)
            buffer.append(item); queue.task_done()
        except asyncio.TimeoutError:
            pass
        if len(buffer) >= BATCH_SIZE or (buffer and time.time() - last_flush > BATCH_TIMEOUT):
            await flush()
    await flush()

# ---------------------------
# MAIN
# ---------------------------
async def main():
    global SHUTDOWN
    SHUTDOWN = False
    queue    = asyncio.Queue(maxsize=QUEUE_MAXSIZE)
    executor = ThreadPoolExecutor(max_workers=4)
    await asyncio.gather(scraper_worker(queue), db_consumer(queue, executor))

def handle_signal(*_):
    global SHUTDOWN
    SHUTDOWN = True
    print(f"\n[{SCRAPER_NAME}] Signal received — stopping", flush=True)

if __name__ == "__main__":
    signal.signal(signal.SIGINT,  handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    logger.info(f"=== {SCRAPER_NAME} starting ===")
    asyncio.run(main())
    logger.info(f"=== {SCRAPER_NAME} done | records saved: {_stats['records_saved']} ===")


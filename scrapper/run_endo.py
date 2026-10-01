#!/usr/bin/env python3
import asyncio
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
SCRAPER_NAME  = "endo_keyword"
BASE_URL      = "https://bidplus.gem.gov.in"
QUEUE_MAXSIZE = 20000
BATCH_SIZE    = 500
BATCH_TIMEOUT = 5.0

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
    "autocommit": False,
}

relevant_words = [
  "Surgical Sutures",
  "Powered Endoscopic Stapler",
  "Surgical Trocars",
  "Hernia Fixation Device",
  "Hernia Mesh",
  "Laser Therapy Unit",
  "Circular Stapler",
  "Linear Cutter Stapler Cartridge",
  "Ultrasonic Energy Generator",
  "Open / Endoscopic Clip Applicator",
  "Ligation Clips",
  "Hemorrhoid Stapler",
  "Absorbable Hemostat",
  "Skin Stapler",
  "Intra-Uterine Contraceptive Device (IUCD)",
  "Endoscopic Linear Cutter Reload",
  "Linear Cutter Stapler Applicator",
  "Sutures",
  "Absorbable Gelatin",
  "Cartridges For Linear Cutter Stapler",
  "Endoscopic Powered Stapler",
  "Gauze Sponges Absorbable Gelatin",
  "Plant Based Hemostat",
  "Polymer Ligation Clips",
  "Disposable Bladeless Trocar",
  "Disposable Laparoscopic Trocar",
  "Disposable Optical Ports",
  "IUCD 375 For Family Planning Programme",
  "IUCD 380A For Family Planning Programme",
  "Circular Staplers",
  "Chromic Catgut",
  "Plain Catgut",
  "Poliglecaprone",
  "Monocryl",
  "Poliglecaprone 25",
  "Polyamide",
  "Nylon",
  "Polydioxanone",
  "PDS",
  "Polyester",
  "Polyglactin 910",
  "Polyglycolic Acid",
  "Polypropylene",
  "Silk",
  "Steel Wire"
]

# ---------------------------
# GLOBALS
# ---------------------------
SHUTDOWN = False
_stats   = {"records_saved": 0, "current_item": "—", "items_done": 0, "total_items": 0}

# ---------------------------
# LOGGING
# ---------------------------
os.makedirs("./log", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("./log/endo_realtime_scraper.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("endo-keyword")

# ---------------------------
# SQL
# ---------------------------
UPSERT_SQL = """
INSERT INTO gem_tenders
(keyword, page_no, bid_number, detail_url, items, quantity, department,
 start_date, end_date, ra_no, ra_url, dept)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Endo')
ON DUPLICATE KEY UPDATE
  keyword = VALUES(keyword), page_no = VALUES(page_no),
  detail_url = VALUES(detail_url), items = VALUES(items),
  quantity = VALUES(quantity), department = VALUES(department),
  start_date = VALUES(start_date), end_date = VALUES(end_date),
  ra_no = VALUES(ra_no), ra_url = VALUES(ra_url),
  dept = COALESCE(dept, 'Endo');
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
    cur = conn.cursor()
    try:
        cur.executemany(UPSERT_SQL, rows)
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

async def scrape_single_page(page, keyword, page_no):
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await asyncio.sleep(0.3)
    cards = await page.query_selector_all("div.card")
    rows = []
    for c in cards:
        try:
            bid_link = await c.query_selector(".block_header a.bid_no_hover")
            if not bid_link:
                continue
            bid_no     = (await bid_link.inner_text()).strip()
            detail_url = BASE_URL + "/" + (await bid_link.get_attribute("href")).lstrip("/")
            item_el    = await c.query_selector(".card-body .col-md-4 .row:nth-child(1) a")
            items      = (await item_el.inner_text()).strip() if item_el else ""
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
            rows.append((keyword, page_no, bid_no, detail_url, items, quantity,
                         department, start_date, end_date, ra_no, ra_url))
        except Exception:
            logger.exception("Error scraping card")
    return rows

# ---------------------------
# SCRAPER WORKER
# ---------------------------
async def scraper_worker(queue: asyncio.Queue):
    global SHUTDOWN
    logger.info("Scraper starting...")
    _stats["total_items"] = len(relevant_words)
    _stats["items_done"]  = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=False,
                                           args=["--disable-blink-features=AutomationControlled"])
        context = await browser.new_context()
        page    = await context.new_page()
        for keyword in relevant_words:
            if SHUTDOWN:
                break
            _stats["current_item"] = keyword
            logger.info(f"===== START KEYWORD: {keyword} =====")
            await page.goto(f"{BASE_URL}/all-bids", timeout=0, wait_until="networkidle")
            await asyncio.sleep(1.5)
            search_box = await page.query_selector("input#searchBid")
            if not search_box:
                logger.error("Search box not found.")
                SHUTDOWN = True
                break
            await search_box.fill("")
            await asyncio.sleep(0.2)
            await search_box.type(keyword, delay=50)
            await asyncio.sleep(0.3)
            await search_box.press("Enter")
            await asyncio.sleep(2.5)
            total_records, total_pages = await extract_total_counts(page)
            logger.info(f"Keyword '{keyword}' → {total_records} records, {total_pages} pages")
            page_no = 1
            while page_no <= total_pages and not SHUTDOWN:
                rows = await scrape_single_page(page, keyword, page_no)
                for r in rows:
                    await queue.put(r)
                logger.info(f"[{keyword}] Page {page_no}/{total_pages}")
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
            logger.info(f"===== END KEYWORD: {keyword} =====")
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

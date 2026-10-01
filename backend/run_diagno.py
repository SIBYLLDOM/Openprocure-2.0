#!/usr/bin/env python3
import asyncio
import os
import re
import signal
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import mysql.connector
import pandas as pd
from playwright.async_api import async_playwright
import logging

# Import the processor
# We need to add the parent directory to sys.path since scrapper_to_db is in the root
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

try:
    import scrapper_to_db
except ImportError:
    print("⚠️ Could not import scrapper_to_db from parent directory")
    scrapper_to_db = None

# ---------------------------
# CONFIG
# ---------------------------
BASE_URL = "https://bidplus.gem.gov.in"
QUEUE_MAXSIZE = 20000
BATCH_SIZE = 500
BATCH_TIMEOUT = 5.0


DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "tender_automation_with_ai",
    "autocommit": False,
}

relevant_words = [
    "sickle cell",
    "hospital info",
    "health info",
    "medical info",
    "healthcare management",
    "health management",
    "healthcare info",
    "hospital digital",
    "picture archiving",
    "health network",
    "health infra",
    "healthcare infra",
    "automated analy",
    "hematology",
    "elisa reader",
    "elisa washer",
    "coagulation",
    "protien analy",
    "electrolyte",
    "hplc analy",
    "real time pcr",
    "pcr machine",
    "pcr system",
    "rt-pcr",
    "rtpcr",
    "qpcr",
    "pcr kit",
    "biochemistry",
    "bio chemistry",
    "chemistry analy",
    "cell counter",
    "path lab",
    "elisa test",
    "diagnostic test",
    "diagnostic kit",
    "rapid diagnostic",
    "diagnostics test",
    "diagnostics kit",
    "rna extraction",
    "dna extraction",
    "pcr laboratory",
    "rapid test",
    "molecular",
    "antibody detect",
    "virology",
    "rapid kit",
    "hiv test",
    "hcv test",
    "maleria test",
    "dengue test",
    "hepatitis test",
    "blood grouping",
    "pregnancy test",
    "pregnancy card",
    "anti sera",
    "albumin",
    "amylase",
    "alkaline phosphatase",
    "sgpt",
    "sgot",
    "bilirubin total",
    "bilirubin direct",
    "creatinine",
    "creatine",
    "cholesterol",
    "glucose",
    "total protein",
    "microprotein",
    "triglyceride",
    "uric acid",
    "micro albumin",
    "c-reactive protein",
    "hba1c",
    "rheumatoid arthriti",
    "d-dimer",
    "ferritin",
    "cell wash",
    "microalbumin",
    "diluent",
    "lyse",
    "rinse",
    "probe cleaner",
    "bivalent test",
    "sars-cov",
    "covid19 test",
    "covid 19 test",
    "coronavirus test",
    "corona test",
    "glucometer",
    "gluco meter",
    "hbv",
    "hcg",
    "immuno assay",
    "poct",
    "point of care",
    "polymer chain reaction",
    "rapid antigen",
    "syphylis",
    "urine drug test",
    "urine test",
    "drug test",
    "drug abuse",
    "toxicology test",
    "urine screen",
    "drug test dip card",
    "prenatal screening",
    "prenatal diagnosis",
    "cffdna",
    "cell-free fetal",
    "cell free fetal",
    "cellfree fetal",
    "helicobacter pylori",
    "typhi igg",
    "gel doc",
    "thermal cycl",
    "hplc system",
    "high performance liquid chromatograph",
    "electrolyte analy",
    "hiv rapid",
    "rapid test kit",
    "rapid testing kit",
    "hcv rapid",
    "malaria rapid",
    "pregnancy detection",
    "pregnancy rapid",
    "hbsag elisa",
    "elisa test",
    "hcv elisa",
    "viral transport medium",
    "hiv elisa",
    "syphilis rapid",
    "elisa plate",
    "anti-b blood grouping",
    "blood grouping reagent",
    "immunoassay",
]


# ---------------------------
# LOGGING
# ---------------------------
os.makedirs("./log", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("./log/diagno_realtime_scraper.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("realtime")

# ---------------------------
# SQL (SCRAPE + RA ONLY)
# ---------------------------
UPSERT_SQL = """
INSERT INTO gem_tenders
(keyword, page_no, bid_number, detail_url, items, quantity, department,
 start_date, end_date, ra_no, ra_url, dept)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Diagno')
ON DUPLICATE KEY UPDATE
  keyword = VALUES(keyword),
  page_no = VALUES(page_no),
  detail_url = VALUES(detail_url),
  items = VALUES(items),
  quantity = VALUES(quantity),
  department = VALUES(department),
  start_date = VALUES(start_date),
  end_date = VALUES(end_date),
  ra_no = VALUES(ra_no),
  ra_url = VALUES(ra_url),
  dept = VALUES(dept);
"""

# The app only lists a tender once it has a matching row here (see
# tenders.controller.js getTenders, which requires tender_processing_results.result
# = 'yes' for the 'open' category path). Without this insert, tenders were scraped
# into gem_tenders but stayed invisible in the app. See run_endo.py for the same fix.
PROCESSING_SQL = """
INSERT INTO tender_processing_results
(bid_no, tender_title, result, dept)
VALUES (%s, %s, "yes", "Diagno")
ON DUPLICATE KEY UPDATE
  tender_title = VALUES(tender_title);
"""

# ---------------------------
# GLOBALS
# ---------------------------
SHUTDOWN = False


# ---------------------------
# PROGRESS HELPERS
# ---------------------------
def load_last_page():
    if os.path.exists("./log/diagno_progress.txt"):
        try:
            return int(open("./log/diagno_progress.txt").read().strip())
        except:
            return 1
    return 1


def save_last_page(page_no):
    with open("./log/diagno_progress.txt", "w") as f:
        f.write(str(page_no))


async def perform_keyword_search(page, keyword):
    logger.info(f"Searching keyword: {keyword}")

    await page.goto(f"{BASE_URL}/all-bids", timeout=0, wait_until="networkidle")
    await asyncio.sleep(1.5)

    search_box = await page.query_selector("input#searchBid")
    if not search_box:
        raise RuntimeError("Search input not found")

    # clear existing text
    await search_box.fill("")
    await asyncio.sleep(0.2)

    # type keyword & press Enter
    await search_box.type(keyword, delay=50)
    await asyncio.sleep(0.3)
    await search_box.press("Enter")

    # wait for results to load
    await asyncio.sleep(2.5)


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

        # rows tuple order: (keyword, page_no, bid_number, detail_url, items, ...)
        processing_rows = [(r[2], r[4]) for r in rows]
        cur.executemany(PROCESSING_SQL, processing_rows)

        conn.commit()
        return len(rows)
    finally:
        cur.close()
        conn.close()


# ---------------------------
# SCRAPER UTILITIES
# ---------------------------


async def extract_total_counts(page):
    await asyncio.sleep(1.2)

    total_records = 0
    total_pages = 1

    el = await page.query_selector("span.pos-bottom")
    if el:
        txt = await el.inner_text()
        m = re.search(r"of\s+(\d+)\s+records", txt)
        if m:
            total_records = int(m.group(1))

    last_page = await page.query_selector(
        "#light-pagination a.page-link:nth-last-child(2)"
    )
    if last_page:
        t = (await last_page.inner_text()).strip()
        if t.isdigit():
            total_pages = int(t)

    return total_records, total_pages


async def fast_forward_to_page(page, target_page):
    logger.info(f"Fast-forwarding to page {target_page}")
    current = 1
    while current < target_page:
        next_btn = await page.query_selector("#light-pagination a.next")
        if not next_btn:
            raise RuntimeError("Next button missing during fast-forward")
        await next_btn.click()
        await asyncio.sleep(0.8)
        current += 1


# ---------------------------
# SCRAPE SINGLE PAGE
# ---------------------------
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

            bid_no = (await bid_link.inner_text()).strip()
            detail_url = (
                BASE_URL + "/" + (await bid_link.get_attribute("href")).lstrip("/")
            )

            item_el = await c.query_selector(".card-body .col-md-4 .row:nth-child(1) a")
            items = (await item_el.inner_text()).strip() if item_el else ""

            qty_el = await c.query_selector(".card-body .col-md-4 .row:nth-child(2)")
            quantity = (
                (await qty_el.inner_text()).replace("Quantity:", "").strip()
                if qty_el
                else ""
            )

            dept_el = await c.query_selector(".card-body .col-md-5 .row:nth-child(2)")
            department = (await dept_el.inner_text()).strip() if dept_el else ""

            start_el = await c.query_selector("span.start_date")
            start_date = (await start_el.inner_text()).strip() if start_el else ""

            end_el = await c.query_selector("span.end_date")
            end_date = (await end_el.inner_text()).strip() if end_el else ""

            ra_no, ra_url = "", ""
            ra_p = await c.query_selector("p.bid_no")
            if ra_p and "RA NO" in (await ra_p.inner_text()):
                ra_link = await ra_p.query_selector("a")
                if ra_link:
                    ra_no = (await ra_link.inner_text()).strip()
                    href = await ra_link.get_attribute("href")
                    if href:
                        ra_url = BASE_URL + href if href.startswith("/") else href

            rows.append(
                (
                    keyword,
                    page_no,
                    bid_no,
                    detail_url,
                    items,
                    quantity,
                    department,
                    start_date,
                    end_date,
                    ra_no,
                    ra_url,
                )
            )

        except Exception:
            logger.exception("Error scraping card")

    return rows


# ---------------------------
# SCRAPER WORKER
# ---------------------------
async def scraper_worker(queue: asyncio.Queue):
    global SHUTDOWN
    logger.info("Scraper starting (keyword-based mode)...")

    # Create a separate executor for the PDF pipeline tasks so they don't block the scraper
    pdf_executor = ThreadPoolExecutor(max_workers=2)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            channel="chrome",
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context()
        page = await context.new_page()

        for keyword in relevant_words:
            if SHUTDOWN:
                break

            logger.info(f"===== START KEYWORD: {keyword} =====")

            # ---------------------------------
            # LOAD SEARCH PAGE & SEARCH KEYWORD
            # ---------------------------------
            await page.goto(f"{BASE_URL}/all-bids", timeout=0, wait_until="networkidle")
            await asyncio.sleep(1.5)

            search_box = await page.query_selector("input#searchBid")
            if not search_box:
                logger.error("Search box not found. Stopping scraper.")
                SHUTDOWN = True
                break

            await search_box.fill("")
            await asyncio.sleep(0.2)
            await search_box.type(keyword, delay=50)
            await asyncio.sleep(0.3)
            await search_box.press("Enter")

            await asyncio.sleep(2.5)

            # ---------------------------------
            # GET TOTAL PAGES FOR THIS KEYWORD
            # ---------------------------------
            total_records, total_pages = await extract_total_counts(page)
            logger.info(
                f"Keyword '{keyword}' → {total_records} records, {total_pages} pages"
            )

            page_no = 1

            # ---------------------------------
            # PAGE LOOP
            # ---------------------------------
            while page_no <= total_pages and not SHUTDOWN:
                rows = await scrape_single_page(page, keyword, page_no)

                for r in rows:
                    await queue.put(r)

                    # TRIGGER PDF PROCESSING
                    # r is a tuple: (keyword, page_no, bid_no, detail_url, items, quantity, department, start_date, end_date, ra_no, ra_url)
                    bid_no = r[2]
                    detail_url = r[3]

                    if scrapper_to_db:
                        logger.info(f"Triggering background processing for {bid_no}")
                        pdf_executor.submit(
                            scrapper_to_db.process_bid, bid_no, detail_url
                        )

                logger.info(f"[{keyword}] Completed page {page_no}/{total_pages}")

                # ---------------------------------
                # NEXT PAGE WITH 14s RETRY
                # ---------------------------------
                next_btn = await page.query_selector("#light-pagination a.next")

                if not next_btn:
                    logger.warning(f"[{keyword}] Next not found. Waiting 14 seconds...")
                    await asyncio.sleep(14)
                    next_btn = await page.query_selector("#light-pagination a.next")

                if not next_btn:
                    logger.info(f"[{keyword}] No more pages. Moving to next keyword.")
                    break

                await next_btn.click()
                await asyncio.sleep(1.2)
                page_no += 1

            logger.info(f"===== END KEYWORD: {keyword} =====")

        SHUTDOWN = True
        await browser.close()
        pdf_executor.shutdown(wait=False)


# ---------------------------
# DB CONSUMER
# ---------------------------
async def db_consumer(queue: asyncio.Queue, executor: ThreadPoolExecutor):
    buffer = []
    last_flush = time.time()

    async def flush():
        nonlocal buffer, last_flush
        if buffer:
            rows = buffer
            buffer = []
            await asyncio.get_event_loop().run_in_executor(
                executor, db_execute_many, rows
            )
            last_flush = time.time()

    while not (SHUTDOWN and queue.empty()):
        try:
            item = await asyncio.wait_for(queue.get(), timeout=1)
            buffer.append(item)
            queue.task_done()
        except asyncio.TimeoutError:
            pass

        if len(buffer) >= BATCH_SIZE or (
            buffer and time.time() - last_flush > BATCH_TIMEOUT
        ):
            await flush()

    await flush()


# ---------------------------
# SIGNALS
# ---------------------------
def handle_signal():
    global SHUTDOWN
    logger.info("Shutdown signal received")
    SHUTDOWN = True


# ---------------------------
# MAIN
# ---------------------------
async def main():
    queue = asyncio.Queue(maxsize=QUEUE_MAXSIZE)
    executor = ThreadPoolExecutor(max_workers=4)

    await asyncio.gather(
        scraper_worker(queue),
        db_consumer(queue, executor),
    )


if __name__ == "__main__":
    signal.signal(signal.SIGINT, lambda *_: handle_signal())
    signal.signal(signal.SIGTERM, lambda *_: handle_signal())
    asyncio.run(main())

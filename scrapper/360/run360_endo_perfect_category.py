#!/usr/bin/env python3
import asyncio
import csv
import os
import re
import signal
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import mysql.connector
from playwright.async_api import async_playwright
import logging

import openscraper as osc

# ---------------------------
# CONFIG
# ---------------------------
SCRAPER_NAME       = "endo_category"
BASE_URL           = "https://bidplus.gem.gov.in"
KEYWORD_FILE        = "./keyword/360_keywords.csv"
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
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, '360')
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

async def scrape_single_page(page, keyword, page_no):
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
                # popover; short ones are plain text with no anchor at all — the
                # old "a"-only selector silently returned "" for every short item
                # name (~90% of rows), which is why most 360 tender titles were
                # blank. Mirrors gem.py's scrape_single_page fix for the same bug.
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
            rows.append((keyword, page_no, bid_no, detail_url,
                         items, quantity, department, start_date, end_date,
                         ra_no, ra_url, 1, keyword))
        except Exception:
            logger.exception("Error scraping card")
    return rows

def load_keywords():
    if not os.path.exists(KEYWORD_FILE):
        logger.error(f"Keyword file not found: {KEYWORD_FILE}")
        return []
    keywords = []
    with open(KEYWORD_FILE, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            if not row:
                continue
            kw = row[0].strip()
            if kw:
                keywords.append(kw)
    logger.info(f"Loaded {len(keywords)} keywords from {KEYWORD_FILE}")
    return keywords

# ---------------------------
# RELEVANCY FILTER (Ollama)
# ---------------------------
# GeM's own site search (input#searchBid on /all-bids) is a loose free-text
# match — for some keywords it silently fails to filter (or the search never
# fully applies before we scrape), and the scraper ends up saving whatever is
# on screen, including totally unrelated bids (e.g. Toner Cartridges, Atta/
# Rice/Bread). Every row still gets a cheap batch check against Meril's own
# 360 Division keyword list before it's queued for insertion, exactly like
# run360_gem_open_category.py's pre-filter tier.
MERIL_360_PRODUCTS = (
    "Meril Life Sciences' 360 Division sells products matching these exact "
    "keywords (product/model names from Meril's own catalogue):\n"
    + "\n".join(f"  • {kw}" for kw in load_keywords())
)

PRE_FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd.

You will be shown a batch of GeM (Government e-Marketplace) bid listings that were
returned by searching GeM's own site search for a specific 360 Division product
keyword (shown as "searched_keyword" below). GeM's free-text search is loose and
sometimes silently fails to filter at all — when that happens it returns GeM's
generic/unfiltered bid listing instead, so you'll see items that have nothing to
do with the keyword that was searched (e.g. searching "Ureteroscope" but getting
back "3D printing", "repair and overhaul service", "custom bid for services",
office supplies, groceries, civil/electrical work). Your main job is to catch
exactly this pattern.

KEY SIGNAL — keyword/item mismatch: if the item text shares no plausible
relationship with its OWN searched_keyword, that is strong evidence GeM's search
failed for that row and it should be "skip" UNLESS the item independently and
clearly matches something in Meril's product list below regardless of the
keyword it was filed under.

The item field is sometimes truncated with "..." by GeM's own listing — a
truncated, ambiguous item name is NOT by itself a reason to keep a row; only
keep it if what IS visible plausibly relates to searched_keyword or to Meril's
product list. When genuinely unsure and there's no keyword mismatch and no
contrary signal, lean toward "check" — but a clear keyword mismatch overrides
that leniency.

{MERIL_360_PRODUCTS}

Using the Bid No, searched_keyword, Item/Category name, Quantity, and Department
shown, decide for EACH bid: "check" if it might be relevant, or "skip" if it
clearly indicates something Meril's 360 Division does not sell, or shows a clear
keyword/item mismatch with no independent match to the product list.

Return ONLY valid JSON — no text outside the JSON. Format:
{{
  "results": [
    {{"bid_no": "<bid no exactly as given>", "verdict": "check" | "skip"}}
  ]
}}
One entry per bid in the batch, referenced by bid_no."""


def _build_prefilter_message(rows):
    lines = ["Bids to screen:\n"]
    for r in rows:
        keyword, _, bid_no, _, items, quantity, department = r[:7]
        lines.append(
            f'- bid_no: "{bid_no}" | searched_keyword: "{keyword}" | items: "{items}" | '
            f'quantity: "{quantity}" | department: "{department}"'
        )
    lines.append("\nReturn ONLY the JSON object as specified in the system prompt.")
    return "\n".join(lines)


def _prefilter_batch_sync(rows):
    """Returns the set of bid_no values judged relevant. Falls back to keeping
    everything if Ollama is unreachable — a missed relevant tender is a worse
    outcome than a few extra rows getting through for manual review."""
    if not rows:
        return set()
    messages = [
        {"role": "system", "content": PRE_FILTER_SYSTEM_PROMPT},
        {"role": "user", "content": _build_prefilter_message(rows)},
    ]
    for attempt in range(1, 4):
        try:
            raw = osc._ollama_call(messages)
            if not raw:
                logger.warning(f"[FILTER] Empty Ollama response (attempt {attempt}) — retrying...")
                time.sleep(10 * attempt)
                continue
            result = osc._parse_json(raw)
            if result and isinstance(result, dict) and isinstance(result.get("results"), list):
                keep = set()
                for entry in result["results"]:
                    bid_no = str(entry.get("bid_no", "")).strip()
                    if bid_no and entry.get("verdict") != "skip":
                        keep.add(bid_no)
                return keep
            logger.warning(f"[FILTER] Bad JSON from Ollama (attempt {attempt}): {raw[:150]}")
            time.sleep(3)
        except Exception as e:
            logger.warning(f"[FILTER] Ollama call failed (attempt {attempt}/3): {e}")
            time.sleep(5)
    logger.warning("[FILTER] All Ollama attempts failed — keeping all rows on this page (safe default)")
    return {r[2] for r in rows}

# ---------------------------
# SCRAPER WORKER
# ---------------------------
async def scraper_worker(queue: asyncio.Queue, executor: ThreadPoolExecutor):
    global SHUTDOWN
    logger.info("Scraper starting (keyword-based mode)...")
    keywords = load_keywords()
    if not keywords:
        logger.error("No keywords to scrape!")
        SHUTDOWN = True
        return
    _stats["total_items"] = len(keywords)
    _stats["items_done"]  = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=False,
                                           args=["--disable-blink-features=AutomationControlled"])
        context = await browser.new_context()
        page    = await context.new_page()
        try:
            for keyword in keywords:
                if SHUTDOWN:
                    break
                _stats["current_item"] = keyword
                logger.info(f"===== START KEYWORD: {keyword} =====")
                try:
                    await page.goto(f"{BASE_URL}/all-bids", timeout=0, wait_until="networkidle")
                    await asyncio.sleep(1.5)
                    search_box = await page.query_selector("input#searchBid")
                    if not search_box:
                        logger.error("Search box not found!")
                        _stats["items_done"] += 1
                        continue
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
                        if rows:
                            keep_ids = await asyncio.get_event_loop().run_in_executor(
                                executor, _prefilter_batch_sync, rows
                            )
                            dropped = len(rows) - len(keep_ids)
                            if dropped:
                                logger.info(f"[{keyword}] Page {page_no}: Ollama filter dropped {dropped} irrelevant row(s)")
                            rows = [r for r in rows if r[2] in keep_ids]
                        for r in rows:
                            await queue.put(r)
                        logger.info(f"[{keyword}] Page {page_no}/{total_pages} ({len(rows)} records)")
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
                    logger.info(f"===== END KEYWORD: {keyword} =====")
                except Exception as e:
                    logger.exception(f"Error on keyword '{keyword}', skipping: {e}")
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
    await asyncio.gather(scraper_worker(queue, executor), db_consumer(queue, executor))

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

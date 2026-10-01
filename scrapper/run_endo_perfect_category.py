#!/usr/bin/env python3
import asyncio
import io
import json
import os
import re
import signal
import sys
import time
import urllib.error
from concurrent.futures import ThreadPoolExecutor

import mysql.connector
import pypdf
from playwright.async_api import async_playwright
import logging

import openscraper as osc

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

# Only this category (sno 36 in endo_cat.json) is noisy enough to need the
# Ollama relevancy filter — every other category keeps the existing
# unfiltered flow (scrape → queue → db_execute_many) untouched.
FILTERED_CATEGORY_NAME = "Universal Category"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

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
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, 'Endo')
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
# RELEVANCY FILTER (Ollama) — Universal Category only, same flow as
# run_gem_open_category.py's browse-all filter
# ---------------------------
PRE_FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd.

You will be shown a batch of GeM (Government e-Marketplace) bid listings —
each with a Bid No, Item/Category name, Quantity, and Department. Using ONLY
these fields, decide for EACH bid whether it might be relevant to Meril's
products — this is a cheap first-pass filter, not the final decision, so be
liberal: mark "skip" only when confident from the item name alone that it has
nothing to do with Meril's products.

{osc.MERIL_ALL_PRODUCTS}

Return "check" if the item might be relevant (mentions or hints at any product
above, is a bare code/number with no descriptive name, or comes from a
hospital/medical/health department), or "skip" if the item clearly indicates
something Meril does not sell.

Return ONLY valid JSON — no text outside the JSON. Format:
{{
  "results": [
    {{"bid_no": "<bid no exactly as given>", "verdict": "check" | "skip", "category": "<likely Meril category or null>"}}
  ]
}}
One entry per bid in the batch, referenced by bid_no."""

GEM_FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd.

Decide whether a GeM (Government e-Marketplace) bid is worth pursuing — does
it ask for products that Meril actually sells (Diagno IVD products OR
Endo-Surgery products)?

{osc.MERIL_ALL_PRODUCTS}

DECISION RULES:
1. If the Item/Category (or the extra document text, if provided) clearly
   mentions ANY of our products above → "Yes".
2. If the department is a hospital/lab/health body AND the item name is vague
   or just a code/number → "Doubt".
3. If you are unsure → "Doubt".
4. Return "No" ONLY when you are 100% certain it has nothing to do with
   diagnostic analyzers/reagents/rapid test kits/IVD OR surgical staplers/
   mesh/sutures/energy devices/biosurgicals.

CRITICAL: "Yes" and "Doubt" both proceed; only "No" drops the bid entirely.
          A missed relevant bid is a business loss.

Return ONLY valid JSON — no text outside the JSON. Format:
{{
  "decision": "Yes" | "Doubt" | "No",
  "reason": "<one sentence: what the bid is for and why>",
  "dept": "Diagno" | "Endo" | "Both" | "Unknown" | null,
  "category": "<most likely Meril product, or null>"
}}"""


def _build_prefilter_message(rows: list) -> str:
    lines = ["Bids to screen:\n"]
    for r in rows:
        lines.append(
            f'- bid_no: "{r[2]}" | items: "{r[4]}" | '
            f'quantity: "{r[5]}" | department: "{r[6]}"'
        )
    lines.append("\nReturn ONLY the JSON object as specified in the system prompt.")
    return "\n".join(lines)


def _prefilter_page_sync(rows: list) -> dict:
    if not rows:
        return {}
    messages = [
        {"role": "system", "content": PRE_FILTER_SYSTEM_PROMPT},
        {"role": "user", "content": _build_prefilter_message(rows)},
    ]
    for attempt in range(1, 4):
        try:
            raw = osc._ollama_call(messages)
            if not raw:
                logger.info(f"  [PREFILTER] Empty response (attempt {attempt}) — waiting...")
                time.sleep(10 * attempt)
                continue
            result = osc._parse_json(raw)
            if result and isinstance(result, dict) and isinstance(result.get("results"), list):
                matches = {}
                for entry in result["results"]:
                    bid_no = str(entry.get("bid_no", "")).strip()
                    if bid_no and entry.get("verdict") == "check":
                        matches[bid_no] = entry.get("category")
                return matches
            logger.info(f"  [PREFILTER] Bad JSON (attempt {attempt}): {raw[:150]}")
            time.sleep(3)
        except urllib.error.URLError as e:
            logger.info(f"  [PREFILTER] Ollama unreachable (attempt {attempt}): {e}")
            time.sleep(10)
        except Exception as e:
            logger.info(f"  [PREFILTER] Attempt {attempt}/3 failed: {e}")
            time.sleep(5)
    logger.info("  [PREFILTER] All attempts failed — defaulting to 'check all' on this page (safe)")
    return {r[2]: None for r in rows}


def _is_code_like(items: str) -> bool:
    stripped = (items or "").strip()
    if len(stripped) < 6:
        return True
    letters = sum(c.isalpha() for c in stripped)
    return letters < max(3, len(stripped) * 0.3)


def _filter_bid_sync(bid_no: str, items: str, quantity: str, department: str,
                      extra_context: str = None) -> dict:
    lines = [
        f'Bid No     : {bid_no}',
        f'Item       : {items}',
        f'Quantity   : {quantity}',
        f'Department : {department}',
    ]
    if extra_context:
        lines += ["", "Additional document text (bid PDF / ATC attachment):", extra_context[:4000]]
    lines += ["", "Return ONLY the JSON decision object as specified in the system prompt."]
    messages = [
        {"role": "system", "content": GEM_FILTER_SYSTEM_PROMPT},
        {"role": "user", "content": "\n".join(lines)},
    ]
    for attempt in range(1, 4):
        try:
            raw = osc._ollama_call(messages)
            if not raw:
                time.sleep(10 * attempt)
                continue
            result = osc._parse_json(raw)
            if result and isinstance(result, dict) and "decision" in result:
                return result
            time.sleep(3)
        except urllib.error.URLError as e:
            logger.info(f"    [FILTER/LLM] Ollama unreachable (attempt {attempt}): {e}")
            time.sleep(10)
        except Exception as e:
            logger.info(f"    [FILTER/LLM] Attempt {attempt}/3 failed: {e}")
            time.sleep(5)
    return {"decision": "Doubt", "reason": "LLM unavailable — marked relevant for safety."}


def _extract_pdf_text(data: bytes, reader_out: list = None) -> str:
    reader = pypdf.PdfReader(io.BytesIO(data))
    if reader_out is not None:
        reader_out.append(reader)
    text = ""
    for page in reader.pages:
        text += (page.extract_text() or "") + "\n"
    return text


def _find_biddoc_attachment_urls(reader) -> list:
    """Bid-document attachment links embedded in the main bid PDF — one of
    these is the buyer-uploaded ATC file when the ATC section says so instead
    of embedding the clauses as plain text."""
    urls = []
    for page in reader.pages:
        if "/Annots" not in page:
            continue
        for a in page["/Annots"]:
            obj = a.get_object()
            uri = obj.get("/A", {}).get("/URI") if obj.get("/A") else None
            if uri and "/bidding/biddoc/" in uri and uri not in urls:
                urls.append(uri)
    return urls


async def _fetch_url_bytes(context, url: str) -> bytes:
    resp = await context.request.get(url, headers={"User-Agent": UA}, timeout=30000)
    return await resp.body()


async def deep_dive_bid(context, detail_url: str, executor: ThreadPoolExecutor) -> str:
    loop = asyncio.get_event_loop()
    data = await _fetch_url_bytes(context, detail_url)
    reader_box = []
    combined = await loop.run_in_executor(executor, _extract_pdf_text, data, reader_box)
    reader = reader_box[0]
    if "buyer uploaded atc document" in combined.lower():
        attachment_urls = await loop.run_in_executor(executor, _find_biddoc_attachment_urls, reader)
        for url in attachment_urls[:5]:
            try:
                att_data = await _fetch_url_bytes(context, url)
                att_text = await loop.run_in_executor(executor, _extract_pdf_text, att_data)
                combined += f"\n\n--- ATC/attachment: {url} ---\n{att_text}"
            except Exception as e:
                logger.info(f"    [DEEPDIVE] Attachment download failed ({url}): {e}")
    return combined


async def filter_row(row: tuple, context, executor: ThreadPoolExecutor) -> tuple:
    """Fine-grained Ollama filter (+ optional PDF deep-dive) for a single bid
    row. Returns (keep: bool, reason: str)."""
    bid_no, detail_url, items, quantity, department = row[2], row[3], row[4], row[5], row[6]
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, _filter_bid_sync, bid_no, items, quantity, department)
    decision = result.get("decision", "Doubt")

    if decision == "Doubt" or _is_code_like(items):
        try:
            extra_text = await deep_dive_bid(context, detail_url, executor)
            result = await loop.run_in_executor(
                executor, _filter_bid_sync, bid_no, items, quantity, department, extra_text,
            )
            decision = result.get("decision", "Doubt")
        except Exception as e:
            logger.warning(f"    [DEEPDIVE ERROR] {bid_no}: {e}")

    return decision != "No", result.get("reason", "")


async def filter_and_queue_rows(rows: list, context, executor: ThreadPoolExecutor,
                                 queue: asyncio.Queue) -> int:
    """Page-level batch pre-filter, then per-bid fine filter (+ deep-dive) —
    only rows that survive both are queued for DB insert. Used exclusively
    for FILTERED_CATEGORY_NAME; every other category bypasses this entirely."""
    if not rows:
        return 0
    loop = asyncio.get_event_loop()
    matches = await loop.run_in_executor(executor, _prefilter_page_sync, rows)
    kept = 0
    for row in rows:
        bid_no = row[2]
        if bid_no not in matches:
            continue
        try:
            keep, reason = await filter_row(row, context, executor)
        except Exception as e:
            logger.warning(f"    [FILTER ERROR] {bid_no}: {e}")
            continue
        if keep:
            await queue.put(row)
            kept += 1
    return kept


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

async def scrape_single_page(page, category_name, page_no):
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
            rows.append((category_name, page_no, bid_no, detail_url,
                         items, quantity, department, start_date, end_date,
                         ra_no, ra_url, 1, category_name))
        except Exception:
            logger.exception("Error scraping card")
    return rows

async def _click_exact_category_option(page, category: str, option_selector: str) -> bool:
    """select2 matches suggestions by substring, so typing e.g. "Ligation Clips"
    also surfaces "Polymer Ligation Clips" — prefer the option whose text is an
    exact match instead of blindly clicking whichever suggestion comes first."""
    options = await page.query_selector_all(option_selector)
    target = category.strip().lower()
    for opt in options:
        text = (await opt.inner_text()).strip()
        if text.lower() == target:
            await opt.click()
            return True
    if options:
        await options[0].click()
        return True
    return False


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
async def scraper_worker(queue: asyncio.Queue, executor: ThreadPoolExecutor):
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
                    # no_wait_after: this select2 header's underlying <select> fires an
                    # ASP.NET UpdatePanel-style postback on click, which Playwright's
                    # navigation heuristic waits on indefinitely (the click itself always
                    # succeeds instantly — "click action done" — but the run then hangs
                    # for the full 30s timeout "waiting for scheduled navigations to
                    # finish" and the category gets skipped). Nothing after this click
                    # depends on a navigation completing (the very next step just waits
                    # for the search box to appear), so it's safe to not wait for it.
                    await page.click("span.select2-selection__rendered#select2-categorybid-container", no_wait_after=True)
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
                        if not await _click_exact_category_option(page, category, option_selector):
                            raise Exception("no matching options found")
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
                        if category == FILTERED_CATEGORY_NAME:
                            kept = await filter_and_queue_rows(rows, context, executor, queue)
                            logger.info(f"[{category}] Page {page_no}/{total_pages} "
                                        f"({len(rows)} records, {kept} kept after filter)")
                        else:
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
                            # Same postback-navigation hang risk as the category dropdown
                            # above — the follow-up sleep + next loop iteration's own
                            # waits are what actually give the page time to update.
                            await next_btn.click(no_wait_after=True)
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

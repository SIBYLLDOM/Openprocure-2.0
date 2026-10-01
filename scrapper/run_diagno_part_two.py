#!/usr/bin/env python3
import asyncio
import os
import re
import signal
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

import mysql.connector
from playwright.async_api import async_playwright
import logging
import collections
import threading
from flask import Flask as _Flask

# ---------------------------
# CONFIG
# ---------------------------
SCRAPER_NAME  = "diagno_kw2"
BASE_URL      = "https://bidplus.gem.gov.in"
QUEUE_MAXSIZE = 20000
BATCH_SIZE    = 500
BATCH_TIMEOUT = 5.0

IST          = timezone(timedelta(hours=5, minutes=30))
IST_SCHEDULE = [(5, 0), (7, 0), (11, 0), (15, 0), (19, 0), (23, 30)]

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
    "autocommit": False,
}

relevant_words = [
    "sickle cell", "hospital info", "health info", "medical info",
    "healthcare management", "health management", "healthcare info",
    "hospital digital", "picture archiving", "health network",
    "health infra", "healthcare infra", "automated analy", "hematology",
    "elisa reader", "elisa washer", "coagulation", "protien analy",
    "electrolyte", "hplc analy", "real time pcr", "pcr machine",
    "pcr system", "rt-pcr", "rtpcr", "qpcr", "pcr kit", "biochemistry",
    "bio chemistry", "chemistry analy", "cell counter", "path lab",
    "elisa test", "diagnostic test", "diagnostic kit", "rapid diagnostic",
    "diagnostics test", "diagnostics kit", "rna extraction", "dna extraction",
    "pcr laboratory", "rapid test", "molecular", "antibody detect",
    "virology", "rapid kit", "hiv test", "hcv test", "maleria test",
    "dengue test", "hepatitis test", "blood grouping", "pregnancy test",
    "pregnancy card", "anti sera", "albumin", "amylase",
    "alkaline phosphatase", "sgpt", "sgot", "bilirubin total",
    "bilirubin direct", "creatinine", "creatine", "cholesterol", "glucose",
    "total protein", "microprotein", "triglyceride", "uric acid",
    "micro albumin", "c-reactive protein", "hba1c", "rheumatoid arthriti",
    "d-dimer", "ferritin", "cell wash", "microalbumin", "diluent", "lyse",
    "rinse", "probe cleaner", "bivalent test", "sars-cov", "covid19 test",
    "covid 19 test", "coronavirus test", "corona test", "glucometer",
    "gluco meter", "hbv", "hcg", "immuno assay", "poct", "point of care",
    "polymer chain reaction", "rapid antigen", "syphylis", "urine drug test",
    "urine test", "drug test", "drug abuse", "toxicology test",
    "urine screen", "drug test dip card", "prenatal screening",
    "prenatal diagnosis", "cffdna", "cell-free fetal", "cell free fetal",
    "cellfree fetal", "helicobacter pylori", "typhi igg", "gel doc",
    "thermal cycl", "hplc system", "high performance liquid chromatograph",
    "electrolyte analy", "hiv rapid", "rapid test kit", "rapid testing kit",
    "hcv rapid", "malaria rapid", "pregnancy detection", "pregnancy rapid",
    "hbsag elisa", "hcv elisa", "viral transport medium", "hiv elisa",
    "syphilis rapid", "elisa plate", "anti-b blood grouping",
    "blood grouping reagent", "immunoassay",
]

# ---------------------------
# GLOBALS
# ---------------------------
SHUTDOWN = False
_EXIT    = False
_RUN_NOW = False
_stats   = {"records_saved": 0, "current_item": "—", "items_done": 0, "total_items": 0}

# ---------------------------
# LOGGING
# ---------------------------
os.makedirs("./log", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("./log/diagno2_realtime_scraper.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("diagno-kw2")

# ---------------------------
# FLASK UI
# ---------------------------
_log_buf   = collections.deque(maxlen=500)
_ui_status = {"state": "waiting", "next_run": "—", "last_run": "—"}

class _BufHandler(logging.Handler):
    def emit(self, r): _log_buf.append(self.format(r))

_bh = _BufHandler()
_bh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(_bh)
logging.getLogger("werkzeug").setLevel(logging.ERROR)
FLASK_PORT = 5184
_app = _Flask(__name__)

def _render_page():
    s = _ui_status["state"]
    cols = {
        "waiting": ("#8b949e", "#21262d", "#30363d"),
        "running": ("#3fb950", "#0d2119", "#238636"),
        "done":    ("#58a6ff", "#0c1a2e", "#1f6feb"),
        "error":   ("#f85149", "#2d1219", "#da3633"),
    }
    tc, bg, bc = cols.get(s, ("#e6edf3", "#161b22", "#30363d"))
    logs = "\n".join(_log_buf).replace("&", "&amp;").replace("<", "&lt;")
    cur  = str(_stats["current_item"])
    cdis = (cur[:27] + "…") if len(cur) > 30 else cur
    prog = f'{_stats["items_done"]} / {_stats["total_items"]}'
    rec  = f'{_stats["records_saved"]:,}'
    return (
        "<!DOCTYPE html><html><head><title>" + SCRAPER_NAME + "</title>"
        "<meta http-equiv='refresh' content='5'>"
        "<style>"
        "*{box-sizing:border-box;margin:0;padding:0}"
        "body{font-family:'Segoe UI',system-ui,sans-serif;background:#0d1117;color:#e6edf3;padding:28px;min-height:100vh}"
        ".hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid #21262d}"
        "h1{font-size:22px;font-weight:700;color:#58a6ff;letter-spacing:.3px}"
        ".badge{padding:5px 18px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1.2px;"
        "text-transform:uppercase;color:" + tc + ";background:" + bg + ";border:1px solid " + bc + "}"
        ".stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}"
        ".sc{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:14px 18px;transition:border-color .2s}"
        ".sc:hover{border-color:#58a6ff44}"
        ".sl{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}"
        ".sv{font-size:16px;font-weight:700;color:#e6edf3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
        ".actions{display:flex;gap:10px;margin-bottom:18px;align-items:center;flex-wrap:wrap}"
        ".btn{padding:9px 22px;border-radius:7px;border:none;cursor:pointer;font-size:13px;font-weight:700;"
        "letter-spacing:.3px;transition:all .15s;display:inline-flex;align-items:center;gap:6px}"
        ".btn-run{background:#238636;color:#fff;box-shadow:0 2px 8px #23863644}"
        ".btn-run:hover{background:#2ea043;box-shadow:0 4px 12px #23863666}"
        ".btn-run:active{transform:scale(.97)}"
        ".btn-stop{background:#21262d;color:#f85149;border:1px solid #da363344}"
        ".btn-stop:hover{background:#2d1219;border-color:#da3633}"
        ".pill{font-size:12px;color:#8b949e;padding:9px 14px;background:#161b22;border-radius:7px;"
        "border:1px solid #30363d;font-family:Consolas,monospace}"
        ".lp{background:#010409;border:1px solid #21262d;border-radius:10px;padding:16px;height:440px;"
        "overflow-y:auto;font-family:Consolas,monospace;font-size:12px;line-height:1.75;color:#8b949e;white-space:pre-wrap}"
        ".lt{font-size:11px;color:#484f58;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}"
        "</style></head><body>"
        "<div class='hdr'>"
        "<h1>&#9889; " + SCRAPER_NAME + "</h1>"
        "<span class='badge'>" + s.upper() + "</span>"
        "</div>"
        "<div class='stats'>"
        "<div class='sc'><div class='sl'>Next Run</div><div class='sv'>" + _ui_status["next_run"] + "</div></div>"
        "<div class='sc'><div class='sl'>Last Run</div><div class='sv'>" + _ui_status["last_run"] + "</div></div>"
        "<div class='sc'><div class='sl'>Records Saved</div><div class='sv'>" + rec + "</div></div>"
        "<div class='sc'><div class='sl'>Current Keyword</div><div class='sv' title='" + cur.replace("'", "&#39;") + "'>" + cdis + "</div></div>"
        "</div>"
        "<div class='actions'>"
        "<form method='POST' action='/run-now' style='display:inline'>"
        "<button class='btn btn-run' type='submit'>&#9654; Run Now</button></form>"
        "<form method='POST' action='/stop' style='display:inline'>"
        "<button class='btn btn-stop' type='submit'>&#9632; Stop</button></form>"
        "<span class='pill'>Progress: " + prog + "</span>"
        "</div>"
        "<div class='lt'>Live Log</div>"
        "<div class='lp' id='l'>" + logs + "</div>"
        "<script>var l=document.getElementById('l');l.scrollTop=l.scrollHeight;</script>"
        "</body></html>"
    )

@_app.route("/")
def _page():
    return _render_page()

@_app.route("/run-now", methods=["POST"])
def _api_run_now():
    global _RUN_NOW
    _RUN_NOW = True
    return (
        '<html><head><meta http-equiv="refresh" content="1; url=/"></head>'
        '<body style="background:#0d1117;color:#3fb950;font-family:sans-serif;padding:28px;font-size:16px">'
        '&#10003; Run triggered &mdash; redirecting...</body></html>', 200
    )

@_app.route("/stop", methods=["POST"])
def _api_stop():
    global _EXIT, SHUTDOWN
    _EXIT = True; SHUTDOWN = True
    return (
        '<html><head><meta http-equiv="refresh" content="1; url=/"></head>'
        '<body style="background:#0d1117;color:#f85149;font-family:sans-serif;padding:28px;font-size:16px">'
        '&#9632; Stop signal sent &mdash; redirecting...</body></html>', 200
    )

# ---------------------------
# SCHEDULER
# ---------------------------
def next_run_delay():
    now = datetime.now(IST)
    slots = [now.replace(hour=h, minute=m, second=0, microsecond=0) for h, m in IST_SCHEDULE]
    future = [s for s in slots if s > now]
    if future:
        target = future[0]
    else:
        nxt = now + timedelta(days=1)
        target = nxt.replace(hour=IST_SCHEDULE[0][0], minute=IST_SCHEDULE[0][1], second=0, microsecond=0)
    return (target - now).total_seconds(), target

# ---------------------------
# SQL
# ---------------------------
UPSERT_SQL = """
INSERT INTO gem_tenders
(keyword, page_no, bid_number, detail_url, items, quantity, department,
 start_date, end_date, ra_no, ra_url)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
ON DUPLICATE KEY UPDATE
  keyword = VALUES(keyword), page_no = VALUES(page_no),
  detail_url = VALUES(detail_url), items = VALUES(items),
  quantity = VALUES(quantity), department = VALUES(department),
  start_date = VALUES(start_date), end_date = VALUES(end_date),
  ra_no = VALUES(ra_no), ra_url = VALUES(ra_url);
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

# ---------------------------
# ENTRY POINT — IST scheduler
# ---------------------------
def handle_signal(*_):
    global _EXIT, SHUTDOWN
    _EXIT = True; SHUTDOWN = True
    print(f"\n[{SCRAPER_NAME}] Signal received — exiting", flush=True)

if __name__ == "__main__":
    signal.signal(signal.SIGINT,  handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    run_now = "--now" in sys.argv

    threading.Thread(target=lambda: _app.run(host="0.0.0.0", port=FLASK_PORT, use_reloader=False), daemon=True).start()
    logger.info(f"UI at http://localhost:{FLASK_PORT}")

    while not _EXIT:
        if run_now or _RUN_NOW:
            run_now  = False
            globals()["_RUN_NOW"] = False
            logger.info("=== Run triggered (immediate) ===")
        else:
            delay, target = next_run_delay()
            _ui_status["state"]    = "waiting"
            _ui_status["next_run"] = target.strftime("%Y-%m-%d %H:%M IST")
            logger.info(f"Next run at {target.strftime('%Y-%m-%d %H:%M')} IST ({delay/60:.1f} min away)")
            elapsed = 0.0
            while elapsed < delay and not _EXIT and not _RUN_NOW:
                chunk = min(30.0, delay - elapsed)
                time.sleep(chunk)
                elapsed += chunk
            if _RUN_NOW:
                globals()["_RUN_NOW"] = False
                logger.info("=== Run triggered via UI ===")
        if _EXIT:
            break
        _ui_status["state"]    = "running"
        _ui_status["last_run"] = datetime.now(IST).strftime("%Y-%m-%d %H:%M IST")
        logger.info("=== Starting scheduled run ===")
        asyncio.run(main())
        _ui_status["state"] = "done"
        logger.info("=== Run complete ===")

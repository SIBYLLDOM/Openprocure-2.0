#!/usr/bin/env python3
"""
cppp_gem_scraper.py
===================
CPPP (Central Public Procurement Portal) — GeM Active Bids Scraper
https://eprocure.gov.in/cppp/latestactivetendersnew/gemdata

Captcha trick:
  The portal puts the captcha answer directly in alt="XXXXXX" of the image.
  No OCR needed.

Results table columns (7):
  td[0] Sl.No  td[1] e-Published Date  td[2] Bid Submission Closing Date
  td[3] Tender Opening Date  td[4] Title/Ref.No./Tender Id
  td[5] State Name  td[6] Corrigendum

Title cell format:
  <a href="/cppp/tendersfullviewmmp/...">Title text</a>/Ref No/Tender_ID

Pagination:
  <div class="pagination">
    <a href="...?page=2" class="paginate_button">Next »</a>
  </div>

Detail page: CPPP-specific layout (NOT NIC tablebg).
  td.black = label, third td in row = value.

Usage:
    python cppp_gem_scraper.py
"""

import os
import re
import csv
import json
import time
import signal
import sys
import collections
import logging as _logging
import threading
import mysql.connector
from flask import Flask as _Flask
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ── Scheduler ──────────────────────────────────────────────────────────────────
SCRAPER_NAME = "cppp_gem"
IST          = timezone(timedelta(hours=5, minutes=30))
IST_SCHEDULE = [(5, 0), (7, 0), (11, 0), (15, 0), (19, 0), (23, 30)]

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

# ── Configuration ──────────────────────────────────────────────────────────────
GEM_URL = "https://eprocure.gov.in/cppp/latestactivetendersnew/gemdata"
KEYWORDS_CONFIG = [
    {"file": "endo.csv",   "dept": "endo"},
    {"file": "diagno.csv", "dept": "diagno"},
]
OUTPUT_FILE = "row_data_cppp_gem.csv"

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

BROWSER_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disk-cache-size=0",
    "--aggressive-cache-discard",
    "--disable-application-cache",
    "--disable-blink-features=AutomationControlled",
]

CSV_HEADERS = [
    "keyword", "dept", "s_no", "e_published_date", "closing_date", "opening_date",
    "tender_title", "tender_refno", "tender_id", "state_name",
]


# ── Logging & Flask UI ─────────────────────────────────────────────────────────
_log_buf   = collections.deque(maxlen=500)
_ui_status = {"state": "waiting", "next_run": "—", "last_run": "—"}

def log(msg: str):
    ts   = datetime.now().strftime("%H:%M:%S")
    line = f"  [{ts}] {msg}"
    print(line, flush=True)
    _log_buf.append(line)

_logging.getLogger("werkzeug").setLevel(_logging.ERROR)
FLASK_PORT = 5187
_app = _Flask(__name__)

@_app.route("/")
def _page():
    s = _ui_status["state"]
    c = {"waiting": "#aaa", "running": "#69f0ae", "done": "#90caf9", "error": "#ef9a9a"}.get(s, "#ddd")
    logs = "\n".join(_log_buf).replace("&", "&amp;").replace("<", "&lt;")
    return (
        "<!DOCTYPE html><html><head><title>" + SCRAPER_NAME + "</title>"
        "<meta http-equiv='refresh' content='5'>"
        "<style>body{font-family:monospace;background:#111;color:#ddd;padding:20px}"
        "h2{color:#4fc3f7}"
        ".b{display:inline-block;padding:3px 14px;border-radius:10px;font-weight:bold;border:1px solid " + c + ";color:" + c + "}"
        ".i{margin:8px 0;font-size:13px;color:#999}"
        ".l{background:#000;border:1px solid #333;padding:12px;height:480px;overflow-y:auto;white-space:pre-wrap;font-size:12px;margin-top:14px}"
        "</style></head><body>"
        "<h2>" + SCRAPER_NAME + "</h2>"
        "<span class='b'>" + s.upper() + "</span>"
        "<div class='i'>Next: <b>" + _ui_status["next_run"] + "</b>"
        "&nbsp;&nbsp;Last: <b>" + _ui_status["last_run"] + "</b></div>"
        "<div class='l' id='l'>" + logs + "</div>"
        "<script>document.getElementById('l').scrollTop=9999</script>"
        "</body></html>"
    )


# ── Database ───────────────────────────────────────────────────────────────────
UPSERT_SQL = """
    INSERT INTO gem_tenders
        (keyword, page_no, bid_number, detail_url, items, quantity, department,
         start_date, end_date, ra_no, ra_url, perfect_cat, sub_cat, dept)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON DUPLICATE KEY UPDATE
      keyword     = VALUES(keyword),
      page_no     = VALUES(page_no),
      detail_url  = VALUES(detail_url),
      items       = VALUES(items),
      quantity    = VALUES(quantity),
      department  = VALUES(department),
      start_date  = VALUES(start_date),
      end_date    = VALUES(end_date),
      ra_no       = VALUES(ra_no),
      ra_url      = VALUES(ra_url),
      perfect_cat = VALUES(perfect_cat),
      sub_cat     = VALUES(sub_cat),
      dept        = VALUES(dept)
"""

PROCESSING_SQL = """
    INSERT INTO tender_processing_results
        (bid_no, tender_title, result)
    VALUES (%s, %s, "yes")
    ON DUPLICATE KEY UPDATE
      tender_title = VALUES(tender_title)
"""


def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


def upsert_tender(conn, record):
    cursor = conn.cursor()
    try:
        cursor.execute(UPSERT_SQL, (
            record.get("keyword"),
            record.get("page_no"),
            record.get("bid_number"),
            record.get("detail_url"),
            record.get("items"),
            record.get("quantity", ""),
            record.get("department"),
            record.get("start_date"),
            record.get("end_date"),
            record.get("ra_no", ""),
            record.get("ra_url", ""),
            record.get("perfect_cat", 1),
            record.get("sub_cat"),
            record.get("dept"),
        ))
        cursor.execute(PROCESSING_SQL, (
            record.get("bid_number"),
            record.get("items"),
        ))
        conn.commit()
    except Exception as e:
        log(f"[DB ERROR] {e} | ID: {record.get('bid_number')}")
        conn.rollback()
    finally:
        cursor.close()


# ── CSV ────────────────────────────────────────────────────────────────────────
def load_keywords(csv_file: str) -> list:
    keywords = []
    if not os.path.exists(csv_file):
        log(f"[WARN] File not found: {csv_file}")
        return keywords
    try:
        with open(csv_file, "r", encoding="utf-8") as f:
            for row in csv.reader(f):
                for item in row:
                    kw = item.strip()
                    if kw:
                        keywords.append(kw)
    except Exception as e:
        log(f"[ERROR] load_keywords: {e}")
    return keywords


def init_csv(output_file: str):
    if not os.path.exists(output_file):
        with open(output_file, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(CSV_HEADERS)
        log(f"[INIT] Created {output_file}")


def append_csv(output_file: str, rows: list):
    with open(output_file, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)


# ── Captcha ────────────────────────────────────────────────────────────────────
def read_captcha_answer(page) -> str:
    """Captcha answer is in the alt attribute of the captcha image."""
    try:
        img = page.locator('img[data-drupal-selector="edit-captcha-image"]')
        img.wait_for(state="visible", timeout=10000)
        answer = (img.get_attribute("alt") or "").strip()
        log(f"[CAPTCHA] Answer from alt: '{answer}'")
        return answer
    except Exception as e:
        log(f"[CAPTCHA] Read failed: {e}")
        return ""


def fill_captcha(page) -> bool:
    answer = read_captcha_answer(page)
    if not answer:
        log("[CAPTCHA] No answer — cannot fill")
        return False
    try:
        field = page.locator("input#edit-captcha-response")
        field.wait_for(state="visible", timeout=5000)
        field.fill("")
        field.fill(answer)
        log(f"[CAPTCHA] Filled: '{answer}'")
        return True
    except Exception as e:
        log(f"[CAPTCHA] Fill error: {e}")
        return False


# ── Title cell parser ──────────────────────────────────────────────────────────
def parse_title_cell(td) -> tuple:
    """
    td[4] text format: "[Link Title]/[Ref No]/[Tender_ID]"

    Examples:
      "Supply of 102 items.../16/RCC/2026-27/E10076/P1/2026_RCC_853204_1"
      "Group- A. SUTURES.../JKMSCL/SUTURE MATERIAL/686.../2026_HME_307205_5"

    Tender ID always ends as YYYY_ORGCODE_NNNNNN_N.
    Returns: (title, refno, tender_id, detail_href)
    """
    a_el = td.locator("a").first
    if a_el.count() == 0:
        raw = td.inner_text().strip()
        return raw, "", "", ""

    title = a_el.inner_text().strip()
    href  = a_el.get_attribute("href") or ""

    # Text after the link title in the cell
    full_text = td.inner_text().strip()
    trailing  = full_text[len(title):].strip().lstrip("/")

    # Tender ID: YYYY_WORD_DIGITS_DIGIT pattern at end of string
    m = re.search(r'(\d{4}_[A-Za-z0-9]+_\d+_\d+)\s*$', trailing)
    if m:
        tender_id = m.group(1)
        refno     = trailing[:m.start()].strip().strip("/").strip()
    else:
        # Fallback: last slash-segment as tender_id
        parts     = trailing.rsplit("/", 1)
        tender_id = parts[-1].strip() if parts else trailing
        refno     = parts[0].strip("/").strip() if len(parts) > 1 else ""

    return title, refno, tender_id, href


# ── CPPP detail page scraper ───────────────────────────────────────────────────
def scrape_cppp_detail(page) -> dict:
    """
    Scrape the CPPP tendersfullviewmmp detail page.

    Two row layouts inside div#tfullview tables:
      3-td row: [label] [colon] [value-colspan]
      6-td row: [label1] [colon1] [value1] [label2] [colon2] [value2]

    Values may be inside <div class="event-dtl"> or bare text.
    """
    details = {}
    try:
        page.wait_for_selector("div#tfullview", timeout=15000)

        for table in page.locator("div#tfullview table").all():
            for row in table.locator("tr").all():
                tds = row.locator("td").all()
                n   = len(tds)

                if n == 3:
                    label = tds[0].inner_text().strip().replace(":", "")
                    # Value is in div.event-dtl or plain text
                    val_div = tds[2].locator("div.event-dtl")
                    value   = val_div.first.inner_text().strip() if val_div.count() > 0 else tds[2].inner_text().strip()
                    if label:
                        details[label] = value

                elif n == 6:
                    label1 = tds[0].inner_text().strip().replace(":", "")
                    value1 = tds[2].inner_text().strip()
                    label2 = tds[3].inner_text().strip().replace(":", "")
                    value2 = tds[5].inner_text().strip()
                    if label1:
                        details[label1] = value1
                    if label2:
                        details[label2] = value2

        # Extract external document URLs (links to originating NIC portals)
        doc_urls = []
        for lnk in page.locator("div#tfullview a[href]").all():
            href = (lnk.get_attribute("href") or "").strip()
            if href.startswith("http") and "eprocure.gov.in/cppp" not in href:
                doc_urls.append(href)
        if doc_urls:
            details["Tender Document URLs"] = doc_urls

    except Exception as e:
        log(f"[DETAIL ERROR] {e}")

    return details


# ── Pagination ─────────────────────────────────────────────────────────────────
def get_total_count(page) -> int:
    """Read 'Total Tenders : N' from results header."""
    try:
        for el in page.locator("div[style*='font-size']").all():
            text = el.inner_text().strip()
            if "total tenders" in text.lower():
                m = re.search(r'(\d+)', text)
                if m:
                    return int(m.group(1))
    except Exception:
        pass
    return 0


def go_to_next_page(page) -> bool:
    """
    Click the 'Next »' button in div.pagination.
    Returns True if navigated to next page.
    """
    try:
        next_btn = page.locator("div.pagination a.paginate_button")
        for btn in next_btn.all():
            text = btn.inner_text().strip()
            if "next" in text.lower():
                if btn.is_visible():
                    btn.click()
                    page.wait_for_selector("table#table.list_table", timeout=25000)
                    time.sleep(1.5)
                    return True
    except Exception as e:
        log(f"  [PAGINATION] {e}")
    return False


# ── Detail page navigation helper ─────────────────────────────────────────────
def open_detail_and_scrape(page, row_index: int) -> tuple:
    """
    Click the detail link in the row at row_index and scrape the detail page.

    The CPPP portal rejects direct page.goto() to detail URLs — it checks the
    Referer / session cookie. We must click the actual <a> element.

    The link may open in the same tab OR a new tab (no target="_blank" is
    declared in the HTML but some browsers/JS may force it). Both cases handled.

    Returns: (details_dict, opened_new_tab, ok)
    """
    # Re-query the row to get a live element (important after go_back)
    row = page.locator("table#table.list_table tbody tr").nth(row_index)
    link_el = row.locator("td").nth(4).locator("a").first

    if link_el.count() == 0:
        return {}, False, False

    # Try to detect a new tab opening
    try:
        with page.context.expect_page(timeout=4000) as new_page_info:
            link_el.click()
        detail_page = new_page_info.value
        detail_page.wait_for_load_state("domcontentloaded", timeout=20000)
        details = scrape_cppp_detail(detail_page)
        detail_page.close()
        # We're still on the results page — no go_back needed
        page.wait_for_selector("table#table.list_table", timeout=15000)
        return details, True, True
    except PlaywrightTimeoutError:
        pass  # No new tab — navigated in same tab

    # Same-tab navigation: wait for detail page to load
    try:
        page.wait_for_url("**/tendersfullviewmmp/**", timeout=20000)
        details = scrape_cppp_detail(page)
        page.go_back()
        page.wait_for_selector("table#table.list_table", timeout=25000)
        time.sleep(0.5)
        return details, False, True
    except Exception as e:
        log(f"      [NAV ERROR] {e}")
        try:
            page.go_back()
            page.wait_for_selector("table#table.list_table", timeout=10000)
        except Exception:
            pass
        return {}, False, False


# ── Scrape one keyword's results ──────────────────────────────────────────────
def scrape_results(page, keyword: str, dept: str, conn) -> list:
    """
    Scrape all paginated results.

    Processes rows by index so that after each go_back() the DOM is re-queried
    fresh. The link is *clicked* (not navigated via goto) so the portal's
    Referer/session check passes.
    """
    all_rows = []
    page_num = 1

    total = get_total_count(page)
    log(f"  Total tenders: {total}")

    while True:
        try:
            page.wait_for_selector("table#table.list_table", timeout=25000)
        except PlaywrightTimeoutError:
            log(f"  No results table on page {page_num}")
            break

        # ── Collect row metadata without navigating away yet ───────────────────
        # We only read text/attributes here (no clicks), so elements are stable.
        row_data_temp = []
        all_rows_loc = page.locator("table#table.list_table tbody tr")
        row_count = all_rows_loc.count()

        for idx in range(row_count):
            row = all_rows_loc.nth(idx)
            tds = row.locator("td")
            if tds.count() < 6:
                continue
            s_no = tds.nth(0).inner_text().strip()
            if not s_no:
                continue
            e_pub      = tds.nth(1).inner_text().strip()
            closing    = tds.nth(2).inner_text().strip()
            opening    = tds.nth(3).inner_text().strip()
            title, refno, tid, href = parse_title_cell(tds.nth(4))
            state_name = tds.nth(5).inner_text().strip()
            if not tid:
                continue
            full_href = ("https://eprocure.gov.in" + href) if href.startswith("/") else href
            row_data_temp.append({
                "idx":        idx,
                "s_no":       s_no,
                "e_pub":      e_pub,
                "closing":    closing,
                "opening":    opening,
                "title":      title,
                "refno":      refno,
                "tid":        tid,
                "href":       full_href,
                "state_name": state_name,
            })

        log(f"  Page {page_num}: {len(row_data_temp)} rows to process")

        # ── Click into each detail page by row index ───────────────────────────
        page_count = 0
        for data in row_data_temp:
            try:
                log(f"    [{data['s_no']}] {data['tid']} — {data['state_name']}")

                # Click the real <a> element (portal blocks direct goto navigation)
                details, _new_tab, ok = open_detail_and_scrape(page, data["idx"])
                if not ok:
                    log(f"      [SKIP] Could not open detail page")
                    continue

                org_name = details.get("Organisation Name", "").strip() or data["state_name"]
                doc_urls = details.pop("Tender Document URLs", [])

                all_rows.append([
                    keyword, dept,
                    data["s_no"], data["e_pub"], data["closing"], data["opening"],
                    data["title"], data["refno"], data["tid"], data["state_name"],
                ])

                if conn:
                    upsert_tender(conn, {
                        "keyword":     keyword,
                        "page_no":     page_num,
                        "bid_number":  data["tid"],
                        "detail_url":  data["href"],
                        "items":       data["title"],
                        "quantity":    "",
                        "department":  org_name,
                        "start_date":  data["e_pub"],
                        "end_date":    data["closing"],
                        "ra_no":       "",
                        "ra_url":      "",
                        "perfect_cat": 1,
                        "sub_cat":     keyword,
                        "dept":        dept,
                    })

                page_count += 1

            except Exception as e:
                log(f"    [SKIP] {data.get('tid', '?')}: {e}")
                try:
                    page.go_back()
                    page.wait_for_selector("table#table.list_table", timeout=10000)
                except Exception:
                    pass

        log(f"  Page {page_num}: {page_count}/{len(row_data_temp)} saved")

        if not go_to_next_page(page):
            break
        page_num += 1
        time.sleep(2)

    return all_rows


# ── Search one keyword ─────────────────────────────────────────────────────────
def search_keyword(page, keyword: str, dept: str, conn) -> list:
    log(f"\n===== '{keyword}' (dept: {dept}) =====")

    # Fresh navigation resets the form and generates a new captcha
    page.goto(GEM_URL, timeout=60000, wait_until="domcontentloaded")
    time.sleep(2)

    # Fill keyword field
    kw_input = page.locator("input#skeyword")
    kw_input.wait_for(state="visible", timeout=10000)
    kw_input.fill("")
    kw_input.fill(keyword)
    log("  Keyword filled")

    # Fill captcha (reads from img alt attribute)
    if not fill_captcha(page):
        log("  [SKIP] Captcha not available")
        return []

    # Click Search
    search_btn = page.locator("input#btnSearch")
    search_btn.wait_for(state="visible", timeout=10000)
    search_btn.click()
    log("  Search submitted")
    time.sleep(3)

    # Check for captcha rejection
    content = page.content().lower()
    if "wrong" in content or "invalid captcha" in content:
        log("  [WARN] Captcha rejected — skipping")
        return []

    # Check for no results
    if (
        "no tenders found" in content
        or "no record found" in content
        or "total tenders : 0" in content
    ):
        log("  No tenders found")
        return []

    # Make sure results table appeared
    try:
        page.wait_for_selector("table#table.list_table", timeout=10000)
    except PlaywrightTimeoutError:
        log("  Results table not found — skipping")
        return []

    rows = scrape_results(page, keyword, dept, conn)
    log(f"  '{keyword}' complete: {len(rows)} records")
    return rows


# ── Main ───────────────────────────────────────────────────────────────────────
def run(playwright):
    init_csv(OUTPUT_FILE)

    conn = None
    try:
        conn = get_db_connection()
        log("MySQL connected.")
    except Exception as e:
        log(f"[DB ERROR] {e} — CSV only")

    browser = playwright.chromium.launch(
        headless=False,
        args=BROWSER_ARGS,
    )
    context = browser.new_context(
        viewport={"width": 1280, "height": 900},
        locale="en-US",
        ignore_https_errors=True,
        java_script_enabled=True,
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
    )
    page = context.new_page()
    page.set_default_timeout(60000)
    page.on("dialog", lambda d: (log(f"[Dialog] {d.message[:80]}"), d.accept()))

    total_records = 0

    try:
        for config in KEYWORDS_CONFIG:
            keywords = load_keywords(config["file"])
            dept     = config["dept"]
            log(f"\n[CONFIG] {config['file']} → {len(keywords)} keyword(s), dept={dept}")

            for keyword in keywords:
                rows = search_keyword(page, keyword, dept, conn)
                if rows:
                    append_csv(OUTPUT_FILE, rows)
                    total_records += len(rows)

        log(f"\n[DONE] Total records saved: {total_records}")

    except Exception as e:
        log(f"[FATAL] {e}")

    finally:
        if conn:
            try: conn.close()
            except Exception: pass
        try:
            context.close()
            browser.close()
        except Exception: pass


if __name__ == "__main__":
    signal.signal(signal.SIGINT,  lambda *_: sys.exit(0))
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    run_now = "--now" in sys.argv

    threading.Thread(target=lambda: _app.run(host="0.0.0.0", port=FLASK_PORT, use_reloader=False), daemon=True).start()
    log(f"[{SCRAPER_NAME}] UI at http://localhost:{FLASK_PORT}")

    while True:
        if run_now:
            run_now = False
            log(f"[{SCRAPER_NAME}] --now flag: running immediately")
        else:
            delay, target = next_run_delay()
            _ui_status["state"]    = "waiting"
            _ui_status["next_run"] = target.strftime("%Y-%m-%d %H:%M IST")
            log(f"[{SCRAPER_NAME}] Next run at {target.strftime('%Y-%m-%d %H:%M')} IST ({delay/60:.1f} min away)")
            time.sleep(delay)
        _ui_status["state"]    = "running"
        _ui_status["last_run"] = datetime.now(IST).strftime("%Y-%m-%d %H:%M IST")
        log(f"[{SCRAPER_NAME}] === Starting scheduled run ===")
        try:
            with sync_playwright() as playwright:
                run(playwright)
        except Exception as e:
            _ui_status["state"] = "error"
            log(f"[{SCRAPER_NAME}] [ERROR] {e}")
        else:
            _ui_status["state"] = "done"
        log(f"[{SCRAPER_NAME}] === Run complete ===")

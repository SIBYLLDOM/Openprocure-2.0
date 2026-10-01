"""
iocl-scraper.py
================
IOCL eProcurement Portal – Keyword Search Scraper
https://iocletenders.nic.in/nicgep/app

Architecture: Same as NTPC_scraper.py (sync_playwright + keyword CSV search)
DB Target   : `psu` table (same as hll-scraper.py)

Flow:
  1. Open IOCL eProcurement portal
  2. Wait for page to load, locate the search input
  3. Load keywords from endo.csv and diagno.csv
  4. For each keyword:
       a. Type into SearchDescription input → click Go
       b. If "No Tenders found" → back → next keyword
       c. For each result row:
            - Extract basic info from the listing table
            - Click detail link → scrape full th/td details (table.tablebg)
            - Click Back → return to results
       d. Paginate until last page
  5. Upsert each record into psu table + save to row_data_iocl.csv
"""

import os
import re
import csv
import time
import json
import logging
from datetime import datetime

import mysql.connector
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
BASE_URL     = "https://iocletenders.nic.in/nicgep/app"
ORG_NAME     = "Indian Oil Corporation Limited (IOCL)"
STATE        = "Central"
OUTPUT_FILE  = "row_data_iocl.csv"

KEYWORDS_CONFIG = [
    {"file": "endo.csv",   "dept": "endo"},
    {"file": "diagno.csv", "dept": "diagno"},
]

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",       # <- change if needed
    "password": "meril",           # <- change if needed
    "database": "tender_automation_with_ai",
}

BROWSER_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-blink-features=AutomationControlled",
]

CSV_HEADERS = [
    "keyword", "dept", "s_no",
    "e_published_date", "closing_date", "opening_date",
    "tender_title", "tender_refno", "tender_id", "organisation_chain",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# DB
# ──────────────────────────────────────────────
def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


def upsert_tender(conn, record: dict):
    """
    Upsert one tender record into the `psu` table.
    Includes dept column: enum('endo','diagno').
    """
    sql = """
        INSERT INTO psu (
            id,
            state, organisation_name,
            e_published_date, closing_date, opening_date,
            tender_title, tender_refno, tender_id,
            organisation_chain, tender_details, file_link,
            dept,
            relevency_checker
        ) VALUES (
            NULL,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s,
            'not_processed'
        ) AS new_row
        ON DUPLICATE KEY UPDATE
            state               = new_row.state,
            organisation_name   = new_row.organisation_name,
            e_published_date    = new_row.e_published_date,
            closing_date        = new_row.closing_date,
            opening_date        = new_row.opening_date,
            tender_title        = new_row.tender_title,
            organisation_chain  = new_row.organisation_chain,
            tender_details      = new_row.tender_details,
            file_link           = new_row.file_link,
            dept                = new_row.dept,
            updated_at          = CURRENT_TIMESTAMP
    """
    cursor = conn.cursor()
    try:
        cursor.execute(sql, (
            record.get("state"),
            record.get("organisation_name"),
            record.get("e_published_date"),
            record.get("closing_date"),
            record.get("opening_date"),
            record.get("tender_title"),
            record.get("tender_refno"),
            record.get("tender_id"),
            record.get("organisation_chain"),
            record.get("tender_details"),
            record.get("file_link"),
            record.get("dept"),          # <-- endo or diagno
        ))
        conn.commit()
        log.info("    Upserted tender_id=%s dept=%s",
                 record.get("tender_id", ""), record.get("dept", ""))
    except Exception as exc:
        log.error("    DB error for id=%s: %s", record.get("tender_id"), exc)
        conn.rollback()
    finally:
        cursor.close()


# ──────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────
def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def load_keywords(csv_file: str) -> list[str]:
    keywords = []
    if not os.path.exists(csv_file):
        log.warning("Keywords file not found: %s", csv_file)
        return keywords
    with open(csv_file, "r", encoding="utf-8") as f:
        for row in csv.reader(f):
            for item in row:
                kw = item.strip()
                if kw:
                    keywords.append(kw)
    return keywords


def init_csv(path: str):
    if not os.path.exists(path):
        with open(path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(CSV_HEADERS)
        log.info("Created CSV: %s", path)


def append_csv(path: str, rows: list):
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)


def parse_title_cell(title_td) -> tuple[str, str, str]:
    """
    NIC portals encode tender info in bracket notation: [Title][RefNo][ID]
    Falls back to plain text if brackets not found.
    """
    raw = title_td.inner_text().strip()
    matches = re.findall(r'\[([^\]]+)\]', raw)
    if matches:
        title  = matches[0].strip() if len(matches) > 0 else ""
        refno  = matches[1].strip() if len(matches) > 1 else ""
        tid    = matches[2].strip() if len(matches) > 2 else ""
    else:
        lines  = [l.strip() for l in raw.splitlines() if l.strip()]
        title  = lines[0] if lines else raw
        refno  = ""
        tid    = ""
    return title, refno, tid


# ──────────────────────────────────────────────
# DETAIL PAGE SCRAPER
# ──────────────────────────────────────────────
def scrape_detail_page(page) -> tuple[dict, list]:
    """
    Scrape the NIC tender detail page.
    Structure: table.tablebg containing <td.td_caption> / <td.td_field> pairs.
    Also captures file download links.

    Returns:
        (details_dict, file_links_list)
    """
    details    = {}
    file_links = []

    try:
        page.wait_for_selector("table.tablebg", timeout=15_000)
        tables = page.locator("table.tablebg").all()

        for table in tables:
            rows = table.locator("tr").all()
            for row in rows:
                captions = row.locator("td.td_caption").all()
                fields   = row.locator("td.td_field").all()

                for i in range(min(len(captions), len(fields))):
                    key = _clean(captions[i].inner_text()).rstrip(":")
                    val = _clean(fields[i].inner_text())
                    if key:
                        details[key] = val

                    # Extract any file download links from value cell
                    links = fields[i].locator("a[href]").all() if i < len(fields) else []
                    for link in links:
                        href  = (link.get_attribute("href") or "").strip()
                        label = _clean(link.inner_text()) or _clean(
                            link.get_attribute("title") or ""
                        ) or "Download"
                        if href and href not in [fl["url"] for fl in file_links]:
                            file_links.append({"label": label, "url": href})

        # Cover/document rows (e.g. tr#informal)
        covers = []
        cover_rows = page.locator("tr#informal, tr[id^='informal_']").all()
        for crow in cover_rows:
            tds = crow.locator("td.td_field").all()
            if len(tds) >= 4:
                covers.append({
                    "cover_no":     _clean(tds[0].inner_text()),
                    "cover_type":   _clean(tds[1].inner_text()),
                    "description":  _clean(tds[2].inner_text()),
                    "document_type": _clean(tds[3].inner_text()),
                })
        if covers:
            details["Covers"] = covers

    except Exception as exc:
        log.error("    Detail scrape error: %s", exc)

    log.info("    Fields=%d | Files=%d", len(details), len(file_links))
    return details, file_links


# ──────────────────────────────────────────────
# PAGINATION
# ──────────────────────────────────────────────
def go_to_next_page(page, current_page_num: int) -> bool:
    """Click the next numbered page link. Returns True if navigated."""
    target = str(current_page_num + 1)
    selectors = [
        f"td.paging a:text-is('{target}')",
        f"div.paging a:text-is('{target}')",
        f"a:text-is('{target}')",
    ]
    for sel in selectors:
        try:
            links   = page.locator(sel).all()
            visible = [l for l in links if l.is_visible()]
            if visible:
                with page.expect_navigation(timeout=60_000):
                    visible[0].click()
                page.wait_for_selector("table#table.list_table", timeout=25_000)
                log.info("  -> Moved to page %s", target)
                return True
        except Exception:
            continue
    return False


# ──────────────────────────────────────────────
# RESULTS SCRAPER  (one keyword at a time)
# ──────────────────────────────────────────────
def scrape_search_results(page, keyword: str, dept: str, conn) -> list:
    """
    Scrape all result pages for a given keyword.
    For each row: navigate to detail page, scrape full data, click Back.
    Returns list of CSV rows.
    """
    all_csv_rows = []
    page_num     = 1

    while True:
        try:
            page.wait_for_selector("table#table.list_table", timeout=25_000)
        except PlaywrightTimeoutError:
            log.warning("  No results table on page %d", page_num)
            break

        rows = page.locator("table#table.list_table tr").all()

        # ── Collect basic row data first (avoid stale refs after navigation) ──
        row_data_list = []
        for row in rows:
            tds = row.locator("td").all()
            if len(tds) < 6:
                continue

            s_no = _clean(tds[0].inner_text())
            if not s_no or s_no.lower() == "s.no":
                continue

            link_loc = tds[4].locator('a[id^="DirectLink_"]')
            if link_loc.count() == 0:
                continue

            title, refno, tid = parse_title_cell(tds[4])

            row_data_list.append({
                "s_no":    s_no,
                "e_pub":   _clean(tds[1].inner_text()),
                "closing": _clean(tds[2].inner_text()),
                "opening": _clean(tds[3].inner_text()),
                "title":   title,
                "refno":   refno,
                "tid":     tid,
                "chain":   _clean(tds[5].inner_text()),
                "link_id": link_loc.first.get_attribute("id"),
            })

        # ── Visit each detail page ──────────────────────────────────────────
        page_count = 0
        for data in row_data_list:
            try:
                log.info("  -> Detail: %s", data["tid"])
                page.click(f"a#{data['link_id']}")

                details, file_links = scrape_detail_page(page)

                # Click Back
                back = page.locator('a#DirectLink:has-text("Back")')
                if back.count() == 0:
                    back = page.locator('a:has-text("Back")')
                back.first.click()
                page.wait_for_selector("table#table.list_table", timeout=25_000)

                # Inject dept into details dict so it appears in tender_details JSON
                details["dept"] = dept

                # ── DB upsert ───────────────────────────────────────────────
                record = {
                    "state":             STATE,
                    "organisation_name": ORG_NAME,
                    "e_published_date":  data["e_pub"]   or None,
                    "closing_date":      data["closing"] or None,
                    "opening_date":      data["opening"] or None,
                    "tender_title":      data["title"]   or data["refno"],
                    "tender_refno":      data["refno"]   or f"IOCL/{data['tid']}",
                    "tender_id":         data["tid"]     or None,
                    "organisation_chain": f"{data['chain'] or ORG_NAME} [{dept}]",
                    "tender_details":    json.dumps(details,    ensure_ascii=False),
                    "file_link":         json.dumps(file_links, ensure_ascii=False),
                    "dept":              dept,   # 'endo' or 'diagno'
                }

                if conn:
                    upsert_tender(conn, record)

                # ── CSV row ─────────────────────────────────────────────────
                all_csv_rows.append([
                    keyword, dept, data["s_no"],
                    data["e_pub"], data["closing"], data["opening"],
                    data["title"], data["refno"], data["tid"], data["chain"],
                ])
                page_count += 1

            except Exception as exc:
                log.error("    Skip error for %s: %s", data.get("tid"), exc)
                try:
                    page.go_back()
                    page.wait_for_selector("table#table.list_table", timeout=10_000)
                except Exception:
                    pass

        log.info("  Page %d: scraped %d records", page_num, page_count)

        if not go_to_next_page(page, page_num):
            break
        page_num += 1
        time.sleep(2)

    return all_csv_rows


# ──────────────────────────────────────────────
# MAIN RUNNER
# ──────────────────────────────────────────────
def run(playwright):
    init_csv(OUTPUT_FILE)

    # DB connection
    conn = None
    try:
        conn = get_db_connection()
        log.info("Connected to MySQL")
    except Exception as exc:
        log.error("DB connection failed: %s — continuing without DB", exc)

    # Browser
    browser = playwright.chromium.launch(
        headless=False,
        args=BROWSER_ARGS,
        slow_mo=100,
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
    page.set_default_timeout(60_000)

    # Auto-dismiss JS dialogs
    page.on("dialog", lambda d: (
        log.info("[Dialog] %s: %s", d.type, d.message[:80]), d.accept()
    ))

    try:
        # ── Step 1: Open portal ──────────────────────────────────────────────
        log.info("Opening: %s", BASE_URL)
        page.goto(BASE_URL, timeout=60_000, wait_until="domcontentloaded")
        time.sleep(3)

        # ── Step 2: Locate search input ──────────────────────────────────────
        search_input = page.locator("input#SearchDescription")
        search_input.wait_for(state="visible", timeout=15_000)
        search_input.click()
        log.info("Search input found and clicked")

        total_records = 0

        # ── Step 3: Iterate keywords ─────────────────────────────────────────
        for config in KEYWORDS_CONFIG:
            csv_file = config["file"]
            dept_tag = config["dept"]

            log.info("Processing file: %s (dept=%s)", csv_file, dept_tag)
            keywords = load_keywords(csv_file)

            if not keywords:
                log.warning("No keywords in %s — skipping", csv_file)
                continue

            log.info("Loaded %d keywords from %s", len(keywords), csv_file)

            for i, keyword in enumerate(keywords, 1):
                log.info("[%d/%d] Keyword: '%s' | dept=%s",
                         i, len(keywords), keyword, dept_tag)

                # Locate & fill search box
                search_input = page.locator("input#SearchDescription")
                search_input.wait_for(state="visible", timeout=15_000)
                search_input.fill("")
                search_input.fill(keyword)

                # Click Go
                go_btn = page.locator("input#Go")
                go_btn.wait_for(state="visible", timeout=10_000)
                go_btn.click()
                time.sleep(3)

                # Check for no results
                content = page.content()
                if ("no tenders found" in content.lower()
                        or page.locator("span.error:has-text('No Tenders found')").count() > 0):
                    log.info("  No tenders found for '%s'", keyword)
                    _go_back_to_search(page)
                    continue

                # Scrape all results for this keyword
                log.info("  Scraping results for '%s'...", keyword)
                csv_rows = scrape_search_results(page, keyword, dept_tag, conn)

                if csv_rows:
                    append_csv(OUTPUT_FILE, csv_rows)
                    total_records += len(csv_rows)
                    log.info("  Saved %d rows to CSV", len(csv_rows))

                _go_back_to_search(page)

        log.info("All keywords done. Total records: %d", total_records)
        log.info("Browser staying open — press Enter to close...")
        try:
            input()
        except EOFError:
            pass

    except Exception as exc:
        log.error("Fatal error: %s", exc)
        log.info("Browser staying open — press Enter to close...")
        try:
            input()
        except EOFError:
            pass

    finally:
        if conn:
            try:
                conn.close()
                log.info("DB connection closed")
            except Exception:
                pass
        try:
            context.close()
            browser.close()
        except Exception:
            pass


def _go_back_to_search(page):
    """Return to the main search page after each keyword."""
    try:
        back_btn = page.locator("a#DirectLink[title='Back']")
        if back_btn.count() > 0:
            back_btn.click()
            time.sleep(3)
            return
    except Exception:
        pass
    # Fallback: reload the portal
    try:
        page.goto(BASE_URL, timeout=60_000, wait_until="domcontentloaded")
        time.sleep(3)
    except Exception:
        pass


if __name__ == "__main__":
    with sync_playwright() as pw:
        run(pw)

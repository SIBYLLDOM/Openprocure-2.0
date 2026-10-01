#!/usr/bin/env python3
"""
run_cppp_railway_document_downloader.py — backfills tender documents for
existing "Ministry of Railways" rows in open_tender_details.

For each such row that has no downloaded_documents yet:
  1. Open CPPP Central Active Tenders search page, wait ~4s for it to load.
  2. Type the row's tender_refno into #skeyword.
  3. Solve the search captcha (img[data-drupal-selector="edit-captcha-image"]
     / input#edit-captcha-response) via the Ollama vision model, click Search.
  4. Find the matching result row in table#table.list_table and open its
     detail page (a second captcha gate can appear there too — solved the
     same way).
  5. On the detail page, find <a class="tndr_redirect" href="https://eprocure
     .gov.in/cppp/tenderredirect/by/<base64>">...</a>. For Railways/IREPS
     tenders that href's base64 payload IS the final document URL (verified:
     decoding it reproduces the link's own visible text, e.g.
     https://www.ireps.gov.in/ireps/supply/pdfdocs/.../viewNitPdf_....pdf) —
     so it's decoded directly instead of clicking through and fighting
     Chrome's built-in PDF-viewer UI. If a href doesn't match that pattern
     (non-Railways redirect target), the link is clicked instead and whatever
     page/tab it lands on is used as the download URL.
  6. Download the resulting URL through the browser context's request API
     (shares the session's cookies) and save it under
     tender_documents/<tender_id>/.
  7. Update the row's downloaded_documents JSON column in the DB.

Usage:
    python run_cppp_railway_document_downloader.py [--org "Ministry of Railways"] [--limit N] [--headless]

Runs with a visible browser window by default; pass --headless to hide it.
"""

import os
import re
import sys
import json
import time
import base64
import signal
import argparse
import urllib.parse
from datetime import datetime

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import mysql.connector

# ── Configuration ──────────────────────────────────────────────────────────────
SCRAPER_NAME = "cppp_railway_document_downloader"
STATES_URL   = "https://eprocure.gov.in/cppp/latestactivetendersnew/cpppdata"

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

BROWSER_ARGS = [
    "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-extensions", "--disable-background-networking",
    "--disk-cache-size=0", "--aggressive-cache-discard",
    "--disable-application-cache",
    "--disable-blink-features=AutomationControlled",
]

_SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(_SCRIPT_DIR, "tender_documents")

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

_EXIT  = False
_stats = {"processed": 0, "downloaded": 0, "failed": 0, "skipped_no_match": 0}


def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── Captcha (Ollama vision) ────────────────────────────────────────────────────
_CAPTCHA_DESCRIPTION_RE = re.compile(
    r'\b(image|blank|does not contain|no captcha|cannot|unable|sorry|'
    r'appears to be|unclear|too blurry|i\'?m not)\b', re.IGNORECASE
)


def solve_captcha_with_ollama(image_bytes: bytes) -> str:
    import urllib.request
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    payload = json.dumps({
        "model": "gemma4:31b-cloud",
        "prompt": "This is a CAPTCHA image. Read the characters exactly as they appear, ignoring any noise, dots, or background distortions. Reply with only the captcha characters, nothing else.",
        "images": [image_b64],
        "stream": False
    }).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL, data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw = data.get("response", "").strip()
            if _CAPTCHA_DESCRIPTION_RE.search(raw):
                log(f"  [CAPTCHA] Ollama gave a description/refusal, not an answer: '{raw[:60]}'")
                return ""
            ans = re.sub(r'[^a-zA-Z0-9]', '', raw)
            if len(ans) > 10:
                log(f"  [CAPTCHA] Answer too long, likely leftover prose: '{ans[:60]}'")
                return ""
            return ans
    except Exception as e:
        log(f"  [CAPTCHA ERROR] Ollama request failed: {e}")
        return ""


def read_captcha_answer(page) -> str:
    try:
        img = page.locator('img[data-drupal-selector="edit-captcha-image"]')
        img.wait_for(state="visible", timeout=10000)
        image_bytes = img.screenshot()
        answer = solve_captcha_with_ollama(image_bytes)
        log(f"  [CAPTCHA] Answer: '{answer}'")
        return answer
    except Exception as e:
        log(f"  [CAPTCHA] Read failed: {e}")
        return ""


def fill_captcha(page) -> bool:
    answer = read_captcha_answer(page)
    if not answer:
        return False
    try:
        field = page.locator("input#edit-captcha-response")
        field.wait_for(state="visible", timeout=5000)
        field.fill("")
        field.fill(answer)
        return True
    except Exception as e:
        log(f"  [CAPTCHA] Fill error: {e}")
        return False


def _click_submit_button(page) -> bool:
    for sel in ("input#edit-save", '[data-drupal-selector="edit-save"]',
                'input[type="submit"]', 'button[type="submit"]'):
        btn = page.locator(sel)
        if btn.count() > 0:
            try:
                btn.first.click(timeout=3000)
                return True
            except Exception:
                continue
    try:
        page.locator("input#edit-captcha-response").press("Enter")
        return True
    except Exception:
        return False


def solve_detail_page_captcha_if_present(page, max_retries: int = 3) -> bool:
    img = page.locator('img[data-drupal-selector="edit-captcha-image"]')
    try:
        img.wait_for(state="visible", timeout=5000)
    except PlaywrightTimeoutError:
        return True

    for attempt in range(1, max_retries + 1):
        if not fill_captcha(page):
            log(f"  [CAPTCHA-2] Read/fill failed (attempt {attempt}/{max_retries})")
            time.sleep(2)
            continue
        log(f"  [CAPTCHA-2] Solved (attempt {attempt}/{max_retries})")
        _click_submit_button(page)
        time.sleep(3)
        content = page.content().lower()
        if ("the answer you entered for the captcha was not correct" in content
                or "wrong" in content or "invalid captcha" in content):
            log(f"  [CAPTCHA-2] Rejected by server (attempt {attempt}/{max_retries})")
            if img.count() > 0:
                continue
            return False
        return True
    log("  [CAPTCHA-2] Failed after maximum retries.")
    return False


# ── Row parsing (same convention as cppp_central_endo_scraper.parse_title_cell) ─
def parse_title_cell(td) -> tuple:
    a_el = td.locator("a").first
    if a_el.count() == 0:
        return td.inner_text().strip(), "", "", ""
    title     = a_el.inner_text().strip()
    href      = a_el.get_attribute("href") or ""
    full_text = td.inner_text().strip()
    trailing  = full_text[len(title):].strip().lstrip("/")
    m = re.search(r'(\d{4}_[A-Za-z0-9]+_\d+_\d+)\s*$', trailing)
    if m:
        tender_id = m.group(1)
        refno     = trailing[:m.start()].strip().strip("/").strip()
    else:
        parts     = trailing.rsplit("/", 1)
        tender_id = parts[-1].strip() if parts else trailing
        refno     = parts[0].strip("/").strip() if len(parts) > 1 else ""
    return title, refno, tender_id, href


# ── Search a single tender_refno ───────────────────────────────────────────────
def search_by_refno(page, refno: str, max_retries: int = 5) -> bool:
    for attempt in range(1, max_retries + 1):
        if _EXIT:
            return False
        page.goto(STATES_URL, timeout=60000, wait_until="domcontentloaded")
        log("  [STEP] Page loaded, waiting 4s...")
        time.sleep(4)
        kw_input = page.locator("input#skeyword")
        kw_input.wait_for(state="visible", timeout=10000)
        kw_input.fill("")
        kw_input.fill(refno)
        if not fill_captcha(page):
            log("  [STEP] Captcha failed — retrying")
            time.sleep(2)
            continue
        search_btn = page.locator("input#btnSearch")
        search_btn.wait_for(state="visible", timeout=10000)
        search_btn.click()
        time.sleep(3)
        content = page.content().lower()
        if "the answer you entered for the captcha was not correct" in content or "wrong" in content or "invalid captcha" in content:
            log(f"  [WARN] Captcha rejected by server (attempt {attempt}/{max_retries}). Retrying...")
            continue
        if any(x in content for x in ["no tenders found", "no record found", "total tenders : 0"]):
            log("  No tenders found for this reference number")
            return False
        try:
            page.wait_for_selector("table#table.list_table", timeout=10000)
        except PlaywrightTimeoutError:
            log("  [WARN] Results table not found")
            return False
        return True
    log("  [ERROR] Failed to solve search captcha after maximum retries.")
    return False


def find_matching_row_index(page, tender_refno: str, tender_id: str) -> int:
    rows = page.locator("table#table.list_table tbody tr")
    count = rows.count()
    for idx in range(count):
        row = rows.nth(idx)
        tds = row.locator("td")
        if tds.count() < 6:
            continue
        _title, refno, tid, href = parse_title_cell(tds.nth(4))
        if not href:
            continue
        if tid == tender_id or refno == tender_refno:
            return idx
    if count == 1:
        return 0
    if count > 1:
        log("  [WARN] No exact refno/id match in results — using first result as best guess")
        return 0
    return -1


# ── Detail page + document link extraction ─────────────────────────────────────
def open_detail_page(context, page, tender_refno: str, tender_id: str):
    """Clicks the matching tender's link directly in the results page (rather
    than reconstructing the URL and navigating a fresh tab to it) — the
    tendersfullview link's token appears to be tied to an actual click/session
    flow: a fresh page.goto() to the same URL (even with a Referer header set)
    reliably lands on a stub page that never resolves div#tfullview, while
    clicking the anchor in-page does. May open a new tab or navigate in
    place; returns whichever page ends up holding the detail content."""
    idx = find_matching_row_index(page, tender_refno, tender_id)
    if idx < 0:
        log("  [SKIP] Could not find a matching result row")
        return None

    link = page.locator("table#table.list_table tbody tr").nth(idx).locator("td").nth(4).locator("a").first
    if link.count() == 0:
        log("  [SKIP] Matching row has no link")
        return None

    detail_page = page
    try:
        with context.expect_page(timeout=5000) as new_page_info:
            link.click()
        detail_page = new_page_info.value
        detail_page.wait_for_load_state("domcontentloaded", timeout=20000)
    except PlaywrightTimeoutError:
        page.wait_for_load_state("domcontentloaded", timeout=20000)

    if not solve_detail_page_captcha_if_present(detail_page):
        log("  [DETAIL ERROR] Detail-page captcha not solved")
        return None
    try:
        detail_page.wait_for_selector("div#tfullview", timeout=15000)
    except PlaywrightTimeoutError:
        log("  [DETAIL ERROR] div#tfullview never appeared")
        return None
    return detail_page


_REDIRECT_BY_RE = re.compile(r'/tenderredirect/by/([A-Za-z0-9+/=]+)')


def resolve_document_url(detail_page) -> str:
    """Returns the real tender-document URL. For Railways/IREPS tenders the
    a.tndr_redirect href's base64 payload after '/tenderredirect/by/' IS the
    destination URL (server-side redirect token, no intermediate landing
    page) — decoded directly. Falls back to actually clicking the link and
    following wherever it lands if the href doesn't match that pattern."""
    link = detail_page.locator("a.tndr_redirect").first
    if link.count() == 0:
        log("  [DOCUMENT] No a.tndr_redirect link found on detail page")
        return ""
    href = (link.get_attribute("href") or "").strip()

    m = _REDIRECT_BY_RE.search(href)
    if m:
        try:
            token = m.group(1)
            padded = token + "=" * (-len(token) % 4)
            decoded = base64.b64decode(padded).decode("utf-8", errors="strict")
            if decoded.startswith("http"):
                log(f"  [DOCUMENT] Decoded redirect token -> {decoded}")
                return decoded
        except Exception as e:
            log(f"  [DOCUMENT] Base64 decode failed ({e}) — falling back to click")

    log("  [DOCUMENT] Falling back to clicking the redirect link...")
    try:
        link.scroll_into_view_if_needed(timeout=15000)
        time.sleep(1)
        try:
            with detail_page.context.expect_page(timeout=6000) as new_page_info:
                link.click()
            new_page = new_page_info.value
            new_page.wait_for_load_state("domcontentloaded", timeout=20000)
            url = new_page.url
            new_page.close()
            return url
        except PlaywrightTimeoutError:
            detail_page.wait_for_load_state("domcontentloaded", timeout=20000)
            return detail_page.url
    except Exception as e:
        log(f"  [DOCUMENT ERROR] Could not resolve document link: {e}")
        return ""


# ── Download ────────────────────────────────────────────────────────────────────
def _safe_dir_name(tender_id) -> str:
    name = re.sub(r'[^A-Za-z0-9_.-]', '_', str(tender_id or "unknown"))
    name = name.rstrip('. ') or "unknown"
    return name[:80].rstrip('. _') or "unknown"


def _filename_from_response(url: str, headers: dict) -> str:
    cd = headers.get("content-disposition", "")
    m = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', cd, re.IGNORECASE)
    if m:
        return urllib.parse.unquote(m.group(1).strip())
    path = urllib.parse.urlparse(url).path
    base = os.path.basename(path)
    return base if base else "tender_document.pdf"


def download_document(context, url: str, save_dir: str) -> dict:
    try:
        resp = context.request.get(url, timeout=30000)
        if not resp.ok:
            log(f"  [DOWNLOAD] HTTP {resp.status} for {url}")
            return {"status": "failed", "url": url, "reason": f"HTTP {resp.status}"}
        body = resp.body()
        filename = _filename_from_response(url, resp.headers)
        os.makedirs(save_dir, exist_ok=True)
        path = os.path.join(save_dir, filename)
        with open(path, "wb") as f:
            f.write(body)
        log(f"  [DOWNLOAD] Saved: {path} ({len(body)} bytes)")
        return {"status": "downloaded", "url": url, "file_name": filename, "local_path": path}
    except Exception as e:
        log(f"  [DOWNLOAD ERROR] {e}")
        return {"status": "failed", "url": url, "reason": str(e)}


# ── Database ─────────────────────────────────────────────────────────────────────
def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


def fetch_pending_rows(conn, org_name: str, dept: str = "endo", limit: int = None) -> list:
    """Same definition of "currently open" as the portal's Open Tenders tab
    (see tenders.controller.js's tenderType === 'Open' query): relevency_checker
    passed the filter, dept matches, and closing_date is still in the future
    (or unparseable/empty). Re-evaluated fresh on every run — which tenders
    count as "open" shifts day to day as older ones close, so this is never a
    static id list."""
    cur = conn.cursor(dictionary=True)
    sql = """
        SELECT row_id, tender_id, tender_refno, tender_title
        FROM open_tender_details
        WHERE organisation_name = %s
          AND LOWER(dept) LIKE %s
          AND relevency_checker IN ('proceed_futher', 'files_downloaded', 'yes')
          AND (STR_TO_DATE(closing_date, '%d-%M-%Y %h:%i %p') >= NOW()
               OR closing_date IS NULL OR closing_date = '')
          AND (downloaded_documents IS NULL OR JSON_LENGTH(downloaded_documents) = 0)
        ORDER BY row_id
    """
    params = [org_name, f"%{dept.lower()}%"]
    if limit:
        sql += " LIMIT %s"
        params.append(limit)
    cur.execute(sql, params)
    rows = cur.fetchall()
    cur.close()
    return rows


def save_downloaded_documents(conn, row_id: int, docs: list):
    cur = conn.cursor()
    cur.execute(
        "UPDATE open_tender_details SET downloaded_documents = %s WHERE row_id = %s",
        (json.dumps(docs, ensure_ascii=False), row_id),
    )
    conn.commit()
    cur.close()


# ── Per-tender processing ──────────────────────────────────────────────────────
def process_row(context, conn, row: dict, position: int, total: int):
    tender_id    = row["tender_id"]
    tender_refno = row["tender_refno"] or ""
    row_id       = row["row_id"]
    log(f"===== ({position}/{total}) [{tender_id}] refno='{tender_refno}' title='{(row['tender_title'] or '')[:60]}' =====")

    if not tender_refno:
        log("  [SKIP] No tender_refno stored for this row")
        _stats["skipped_no_match"] += 1
        return

    page = context.new_page()
    try:
        if not search_by_refno(page, tender_refno):
            _stats["failed"] += 1
            save_downloaded_documents(conn, row_id, [{"status": "failed", "reason": "search returned no results"}])
            return

        detail_page = open_detail_page(context, page, tender_refno, tender_id)
        if not detail_page:
            _stats["failed"] += 1
            save_downloaded_documents(conn, row_id, [{"status": "failed", "reason": "detail page open/captcha failed"}])
            return

        try:
            doc_url = resolve_document_url(detail_page)
        finally:
            if detail_page is not page:
                try:
                    detail_page.close()
                except Exception:
                    pass

        if not doc_url:
            log("  [FAIL] Could not resolve a document URL")
            _stats["failed"] += 1
            save_downloaded_documents(conn, row_id, [{"status": "failed", "reason": "no document link resolved"}])
            return

        save_dir = os.path.join(DOWNLOAD_DIR, _safe_dir_name(tender_id))
        result = download_document(context, doc_url, save_dir)
        result["type"] = "tender_document"
        save_downloaded_documents(conn, row_id, [result])

        if result.get("status") == "downloaded":
            _stats["downloaded"] += 1
        else:
            _stats["failed"] += 1
    except Exception as e:
        log(f"  [ROW ERROR] {e}")
        _stats["failed"] += 1
        try:
            save_downloaded_documents(conn, row_id, [{"status": "failed", "reason": str(e)}])
        except Exception:
            pass
    finally:
        try:
            page.close()
        except Exception:
            pass
        _stats["processed"] += 1
        log(f"  [PROGRESS] {position}/{total} done "
            f"(downloaded={_stats['downloaded']} failed={_stats['failed']} no_match={_stats['skipped_no_match']})")


# ── Main ───────────────────────────────────────────────────────────────────────
def run(playwright, org_name: str, dept: str, limit: int, headless: bool):
    conn = get_db_connection()
    log("MySQL connected.")

    rows = fetch_pending_rows(conn, org_name, dept, limit)
    log(f"[INIT] {len(rows)} currently-open '{dept}' '{org_name}' tender(s) missing downloaded_documents")
    if not rows:
        conn.close()
        return

    browser = playwright.chromium.launch(headless=headless, args=BROWSER_ARGS)
    context = browser.new_context(
        viewport={"width": 1280, "height": 900}, locale="en-US",
        ignore_https_errors=True, accept_downloads=True,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    )
    context.on("dialog", lambda d: (log(f"[Dialog] {d.message[:80]}"), d.accept()))

    total = len(rows)
    try:
        for position, row in enumerate(rows, start=1):
            if _EXIT:
                log("[EXIT] Stop signal received — halting")
                break
            process_row(context, conn, row, position, total)
            time.sleep(1.5)
    finally:
        conn.close()
        try:
            context.close()
            browser.close()
        except Exception:
            pass

    log(f"\n[DONE] Processed: {_stats['processed']}  Downloaded: {_stats['downloaded']}  "
        f"Failed: {_stats['failed']}  No-match: {_stats['skipped_no_match']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org", default="Ministry of Railways",
                         help="organisation_name to backfill documents for")
    parser.add_argument("--dept", default="endo",
                         help="dept substring to match (same LOWER(dept) LIKE '%%...%%' the portal uses)")
    parser.add_argument("--limit", type=int, default=None,
                         help="cap the number of rows processed (for testing)")
    parser.add_argument("--headless", action="store_true",
                         help="run with no visible browser window (default is a visible window)")
    args = parser.parse_args()

    def _handle_signal(*_):
        global _EXIT
        _EXIT = True
        print(f"\n[{SCRAPER_NAME}] Signal received — stopping", flush=True)

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    log(f"=== {SCRAPER_NAME} starting (org: {args.org}, dept: {args.dept}) ===")
    try:
        with sync_playwright() as playwright:
            run(playwright, args.org, args.dept, args.limit, headless=args.headless)
    except Exception as e:
        log(f"[ERROR] {e}")
    log(f"=== {SCRAPER_NAME} done | downloaded: {_stats['downloaded']} failed: {_stats['failed']} ===")

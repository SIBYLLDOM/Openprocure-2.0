#!/usr/bin/env python3
"""
pdf_link_scrapper.py — backfills contracts.pdf_link by re-visiting
https://gem.gov.in/view_contracts and searching each existing contract_no
directly via the "Contract/Bid No" (#bno) box, instead of the category flow.

Flow per distinct contract_no already in contracts:
  1. Open https://gem.gov.in/view_contracts and wait for it to load.
  2. Type the contract_no into #bno.
  3. Solve the search CAPTCHA and click Search.
  4. If the page shows "No Result Found", mark this contract as checked
     (pdf_link left NULL) and move on.
  5. Otherwise click the Contract No. to open the popup, solve the popup
     CAPTCHA, and read the Download button's href (#dwnbtn) WITHOUT
     downloading anything — just the link.
  6. Save that href into contracts.pdf_link for that contract_no (all
     line-item rows sharing that contract_no get the same link).

Runs multiple browser workers in parallel, each taking a round-robin slice
of the contract_no list still missing a pdf_link.

Usage:
    python pdf_link_scrapper.py
"""

import base64
import io
import threading
import time

import mysql.connector
from PIL import Image
from playwright.sync_api import sync_playwright

from carting_details_scrapper import (
    ensemble_solve,
    refresh_captcha,
    close_popup,
    wait_for_download_button,
    MAX_CAPTCHA_ATTEMPTS,
    MAX_ROW_CAPTCHA_ATTEMPTS,
    DB_CONFIG,
)

# ---------------------------
# CONFIG
# ---------------------------
VIEW_CONTRACTS_URL   = "https://gem.gov.in/view_contracts"
LINK_WORKERS          = 2   # parallel browser windows


def ts():
    return time.strftime("[%H:%M:%S]")


# ---------------------------
# PAGE ACTIONS
# ---------------------------
def open_view_contracts(page):
    page.goto(VIEW_CONTRACTS_URL, timeout=60000)
    page.wait_for_selector("#bno", timeout=60000)
    page.wait_for_timeout(1500)


def search_by_contract_no(page, contract_no: str, worker_id: int) -> bool:
    """Fills #bno with the contract number and solves/submits the search CAPTCHA.
    Returns True once the search was actually submitted (result may still be
    'No Result Found' — caller checks that separately)."""
    tag = f"[w{worker_id}][{contract_no}]"
    page.fill("#bno", "")
    page.fill("#bno", contract_no)

    for attempt in range(1, MAX_CAPTCHA_ATTEMPTS + 1):
        src = page.locator("#captchaimg1").get_attribute("src")
        img = Image.open(io.BytesIO(base64.b64decode(src.split(",", 1)[1])))

        text, conf = ensemble_solve(img)
        print(f"{ts()} {tag}   [CAPTCHA] Attempt {attempt}/{MAX_CAPTCHA_ATTEMPTS} -> '{text}' (conf={conf:.2f})")

        if not text or conf < 0.55:
            refresh_captcha(page, "#captchaimg1")
            continue

        page.fill("#captcha_code1", text)
        page.click("#searchlocation1")
        page.wait_for_timeout(4000)

        error_el = page.locator("#pcaptcha_code1")
        if error_el.is_visible():
            err_text = error_el.inner_text().strip()
            if "Please enter correct Confirmation Code" in err_text or "Enter captcha code" in err_text:
                print(f"{ts()} {tag}   [CAPTCHA] Rejected: {err_text}")
                refresh_captcha(page, "#captchaimg1")
                continue

        return True

    return False


def has_no_result(page) -> bool:
    try:
        el = page.locator("div:has-text('No Result Found')").last
        return el.is_visible(timeout=2000)
    except Exception:
        return False


def solve_popup_captcha_tagged(page, contract_no: str, worker_id: int) -> bool:
    """Same loop/thresholds as carting_details_scrapper.solve_popup_captcha, just
    with contract_no/worker_id in every log line so concurrent workers' output is legible."""
    tag = f"[w{worker_id}][{contract_no}]"
    for attempt in range(1, MAX_ROW_CAPTCHA_ATTEMPTS + 1):
        src = page.locator("#captchaimg").get_attribute("src")
        img = Image.open(io.BytesIO(base64.b64decode(src.split(",", 1)[1])))

        text, conf = ensemble_solve(img)
        print(f"{ts()} {tag}     [ROW CAPTCHA] Attempt {attempt}/{MAX_ROW_CAPTCHA_ATTEMPTS} -> '{text}' (conf={conf:.2f})")

        if not text or conf < 0.55:
            refresh_captcha(page, "#captchaimg", reload_js="loadCap('0')")
            continue

        page.fill("#captcha_code", text)
        page.click("#modelsbt")
        page.wait_for_timeout(2500)

        error_el = page.locator("#pcaptcha_code")
        if error_el.is_visible() and error_el.inner_text().strip():
            print(f"{ts()} {tag}     [ROW CAPTCHA] Rejected: {error_el.inner_text().strip()}")
            refresh_captcha(page, "#captchaimg", reload_js="loadCap('0')")
            continue

        print(f"{ts()} {tag}     [ROW CAPTCHA] Accepted.")
        return True

    return False


def get_pdf_link(page, contract_no: str, worker_id: int) -> str:
    """Opens the contract popup, solves its captcha, and returns the Download
    button's href — WITHOUT clicking it / downloading anything."""
    tag = f"[w{worker_id}][{contract_no}]"
    row_span = page.locator(f"span.ajxtag_order_number:text-is('{contract_no}')").first
    if row_span.count() == 0:
        print(f"{ts()} {tag}   [ROW] Contract row not found on results grid.")
        return ""
    row_span.click()

    try:
        page.wait_for_selector("#captchaimg", state="visible", timeout=10000)
    except Exception:
        print(f"{ts()} {tag}   [POPUP] Captcha never appeared.")
        close_popup(page)
        return ""

    if not solve_popup_captcha_tagged(page, contract_no, worker_id):
        print(f"{ts()} {tag}   [POPUP] Could not solve popup captcha after {MAX_ROW_CAPTCHA_ATTEMPTS} attempts.")
        close_popup(page)
        return ""

    download_el = wait_for_download_button(page, contract_no, "pdf_link", timeout_ms=30000)
    if not download_el:
        print(f"{ts()} {tag}   [POPUP] Download button not visible yet — resubmitting captcha form once ...")
        try:
            page.click("#modelsbt", timeout=2000)
        except Exception:
            pass
        download_el = wait_for_download_button(page, contract_no, "pdf_link", timeout_ms=15000)

    if not download_el:
        print(f"{ts()} {tag}   [POPUP] Download button never appeared (captcha likely silently rejected).")
        close_popup(page)
        return ""

    # The markup has TWO elements sharing id="dwnbtn": an outer <div id="dwnbtn"> wrapping
    # an inner <a id="dwnbtn" href="...">. "#dwnbtn" as a CSS selector matches the div first
    # (it's earlier in document order), which has no href — so pull the href from whichever
    # of the two actually carries it, checking the anchor specifically first.
    href = ""
    for selector in ["#dwnbtn a[href]", "a#dwnbtn", "#dwnbtn"]:
        try:
            candidate = page.locator(selector).first
            if candidate.count() > 0:
                href = candidate.get_attribute("href") or ""
                if href:
                    break
        except Exception:
            continue

    print(f"{ts()} {tag}   [POPUP] href = {href!r}")
    close_popup(page)
    return href


# ---------------------------
# DATABASE
# ---------------------------
def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


def ensure_pdf_link_column(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'pdf_link'
    """, (DB_CONFIG["database"],))
    if not cur.fetchone():
        print(f"{ts()} [DB] Adding missing column contracts.pdf_link ...")
        try:
            cur.execute("ALTER TABLE contracts ADD COLUMN pdf_link TEXT DEFAULT NULL")
            conn.commit()
        except mysql.connector.errors.DatabaseError as e:
            if getattr(e, "errno", None) != 1060:  # duplicate column (race with another worker)
                raise
            conn.rollback()
    cur.close()


def fetch_pending_contract_numbers(conn) -> list:
    # hospital_name is only ever populated on the rows migrated in from
    # carting_details, so it's what scopes this run to just that batch
    # (~3909 rows) instead of every contract in the table.
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT contract_no FROM contracts
        WHERE contract_no IS NOT NULL AND contract_no != ''
          AND hospital_name IS NOT NULL
          AND (pdf_link IS NULL OR pdf_link = '')
        ORDER BY contract_no
    """)
    rows = [r[0] for r in cur.fetchall()]
    cur.close()
    return rows


def save_pdf_link(conn, contract_no: str, pdf_link: str):
    cur = conn.cursor()
    cur.execute(
        "UPDATE contracts SET pdf_link = %s WHERE contract_no = %s",
        (pdf_link, contract_no),
    )
    conn.commit()
    cur.close()


def mark_not_found(conn, contract_no: str):
    """No result on GeM for this contract — store an empty string (rather than
    leaving NULL) so it isn't retried every run."""
    save_pdf_link(conn, contract_no, "")


# ---------------------------
# WORKER
# ---------------------------
class Progress:
    """Thread-safe done/total counter shared across worker threads."""
    def __init__(self, total: int):
        self.total = total
        self.done = 0
        self.lock = threading.Lock()

    def bump(self) -> str:
        with self.lock:
            self.done += 1
            return f"{self.done}/{self.total}"


def process_contract(page, conn, contract_no: str, worker_id: int, progress: "Progress"):
    tag = f"[w{worker_id}][{contract_no}]"
    print(f"{ts()} {tag} Searching ...")
    open_view_contracts(page)

    if not search_by_contract_no(page, contract_no, worker_id):
        print(f"{ts()} {tag} Search captcha failed after max attempts — skipping (will retry next run). [{progress.bump()}]")
        return

    page.wait_for_timeout(2000)

    if has_no_result(page):
        print(f"{ts()} {tag} No Result Found. [{progress.bump()}]")
        mark_not_found(conn, contract_no)
        return

    pdf_link = get_pdf_link(page, contract_no, worker_id)
    if pdf_link:
        save_pdf_link(conn, contract_no, pdf_link)
        print(f"{ts()} {tag} Saved pdf_link. [{progress.bump()}]")
    else:
        print(f"{ts()} {tag} Could not extract pdf_link — leaving for retry. [{progress.bump()}]")


def run_worker(contract_numbers: list, worker_id: int, progress: "Progress"):
    if not contract_numbers:
        return
    conn = get_db_connection()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--disable-gpu", "--no-sandbox", "--disable-blink-features=AutomationControlled"],
            )
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()

            for contract_no in contract_numbers:
                try:
                    process_contract(page, conn, contract_no, worker_id, progress)
                except Exception as e:
                    print(f"{ts()} [w{worker_id}][{contract_no}] Unhandled error: {e} [{progress.bump()}]")

            browser.close()
    finally:
        conn.close()

    print(f"{ts()} [worker#{worker_id}] Finished ({len(contract_numbers)} contracts).")


def main():
    setup_conn = get_db_connection()
    ensure_pdf_link_column(setup_conn)
    pending = fetch_pending_contract_numbers(setup_conn)
    setup_conn.close()

    print(f"{ts()} [INIT] {len(pending)} contract(s) missing pdf_link.")
    if not pending:
        return

    progress = Progress(len(pending))
    slices = [pending[i::LINK_WORKERS] for i in range(LINK_WORKERS)]
    workers = [
        threading.Thread(target=run_worker, args=(slice_, i, progress), name=f"pdf-link-worker-{i}")
        for i, slice_ in enumerate(slices) if slice_
    ]
    for w in workers:
        w.start()
    for w in workers:
        w.join()

    print(f"{ts()} [MAIN] All workers finished.")


if __name__ == "__main__":
    main()

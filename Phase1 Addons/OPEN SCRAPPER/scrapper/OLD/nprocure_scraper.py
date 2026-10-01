"""
nprocure_scraper.py
===================
nProcure eProcurement Portal Search Scraper
https://tender.nprocure.com/

Flow:
  1. Open site and wait for page load
  2. Read keywords from endo.csv and diagno.csv
  3. Locate 'TENDERTITLE' field
  4. Type each keyword into the field and scrape results

Usage:
    python nprocure_scraper.py
"""

import os
import re
import csv
import json
import time
import mysql.connector
from datetime import datetime
from playwright.sync_api import sync_playwright

# ── Configuration ──────────────────────────────────────────────────────────────
BASE_URL = "https://tender.nprocure.com/"
KEYWORDS_CONFIG = [
    {"file": "endo.csv",   "dept": "endo"},
    {"file": "diagno.csv", "dept": "diagno"},
]
OUTPUT_FILE = "row_data.csv"
STATE_NAME = "nProcure"

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


def log(msg: str):
    """Print timestamped log message."""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"  [{ts}] {msg}")


def load_keywords(csv_file: str):
    """Load keywords from CSV file. Returns list of keywords."""
    keywords = []
    if not os.path.exists(csv_file):
        log(f"[WARN] Keywords file not found: {csv_file}")
        return keywords
    
    try:
        with open(csv_file, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                for item in row:
                    keyword = item.strip()
                    if keyword:
                        keywords.append(keyword)
    except Exception as e:
        log(f"[ERROR] Failed to load keywords: {e}")
    
    return keywords


# ── Database Config ─────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "",
    "database": "tender_automation_with_ai",
}

CSV_HEADERS = [
    "keyword", "dept", "tender_id", "tender_refno", "organisation", "work_name",
    "estimated_value", "submission_date"
]


def get_db_connection():
    """Get MySQL database connection."""
    return mysql.connector.connect(**DB_CONFIG)


def upsert_tender(conn, record):
    """Insert or update tender record in database."""
    cursor = conn.cursor()
    sql = """
        INSERT INTO open_tender_details
            (state, organisation_name, closing_date,
             tender_title, tender_refno, tender_id,
             organisation_chain, tender_details, dept)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            organisation_name  = VALUES(organisation_name),
            closing_date       = VALUES(closing_date),
            tender_title       = VALUES(tender_title),
            tender_refno       = VALUES(tender_refno),
            organisation_chain = VALUES(organisation_chain),
            tender_details     = VALUES(tender_details),
            dept               = VALUES(dept),
            updated_at         = CURRENT_TIMESTAMP
    """
    cursor.execute(sql, (
        record["state"],
        record["organisation_name"],
        record["closing_date"],
        record["tender_title"],
        record["tender_refno"],
        record["tender_id"],
        record["organisation_chain"],
        record.get("tender_details"),
        record.get("dept"),
    ))
    conn.commit()
    cursor.close()


def init_csv_output(output_file: str):
    """Initialize CSV file with headers if it doesn't exist."""
    if not os.path.exists(output_file):
        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(CSV_HEADERS)
        log(f"[INIT] Created output file: {output_file}")


def append_to_csv(output_file: str, rows: list):
    """Append rows to CSV file."""
    with open(output_file, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)


def scrape_nprocure_results(page, keyword: str, dept: str, conn):
    """Scrape results from nProcure table."""
    all_rows = []
    try:
        # Wait for the table body to be visible
        page.wait_for_selector("table tbody tr", timeout=15000)
    except Exception:
        log("  -> No results table rows found.")
        return all_rows

    rows = page.locator("table tbody tr").all()
    count = 0
    for row in rows:
        tds = row.locator("td").all()
        if len(tds) < 2:
            continue

        # TD 1: Ref No
        tender_refno = tds[0].inner_text().strip()

        # TD 2: Complex content
        td2_text = tds[1].inner_text().strip()

        # Regex extraction
        # Tender Id :298789
        tid_match = re.search(r'Tender Id\s*:\s*(\d+)', td2_text)
        tender_id = tid_match.group(1) if tid_match else ""

        # Name Of Work :...
        work_match = re.search(r'Name Of Work\s*:(.*)', td2_text)
        work_name = work_match.group(1).strip() if work_match else ""

        # Last Date & Time For Submission : 04-05-2026 18:00:00
        date_match = re.search(r'Last Date & Time For Submission\s*:\s*(.*)', td2_text)
        submission_date = date_match.group(1).strip() if date_match else ""

        # Estimated Contract Value : 18608300.00
        value_match = re.search(r'Estimated Contract Value\s*:\s*([\d\.]+)', td2_text)
        est_value = value_match.group(1) if value_match else ""

        # Organisation (usually first line in TD2)
        org = td2_text.splitlines()[0].strip() if td2_text.splitlines() else ""

        all_rows.append([
            keyword, dept, tender_id, tender_refno, org, work_name, est_value, submission_date
        ])

        # DB Insertion
        if conn and tender_id:
            try:
                upsert_tender(conn, {
                    "state": STATE_NAME,
                    "organisation_name": org,
                    "closing_date": submission_date,
                    "tender_title": work_name,
                    "tender_refno": tender_refno,
                    "tender_id": tender_id,
                    "organisation_chain": org,
                    "tender_details": json.dumps({
                        "estimated_contract_value": est_value,
                        "submission_date": submission_date,
                        "ref_no": tender_refno
                    }),
                    "dept": dept,
                })
            except Exception as e:
                log(f"    [DB ERROR] {tender_id}: {e}")

        count += 1

    log(f"  -> Scraped {count} rows for '{keyword}' (dept: {dept}).")
    return all_rows


def run(playwright):
    """Main scraper runner."""
    # Initialize output CSV
    init_csv_output(OUTPUT_FILE)
    
    # Connect to database
    conn = None
    try:
        import mysql.connector
        conn = get_db_connection()
        log("Connected to MySQL.")
    except Exception as e:
        log(f"[DB ERROR] Could not connect to MySQL: {e}")
    
    # Launch browser
    browser = playwright.chromium.launch(
        headless=False,
        args=BROWSER_ARGS,
    )
    
    context = browser.new_context(
        viewport={"width": 1280, "height": 900},
        locale="en-US",
        ignore_https_errors=True,
        java_script_enabled=True,
    )
    
    page = context.new_page()
    page.set_default_timeout(60000)
    
    try:
        total_records = 0

        for config in KEYWORDS_CONFIG:
            csv_file = config["file"]
            dept_tag = config["dept"]

            log(f"\n[STEP] Processing file: {csv_file} (Dept: {dept_tag})")
            keywords = load_keywords(csv_file)

            if not keywords:
                log(f"[WARN] No keywords found in {csv_file}. Skipping...")
                continue

            log(f"  -> Loaded {len(keywords)} keyword(s) from {csv_file}")

            for i, keyword in enumerate(keywords, 1):
                log(f"\n── Keyword {i}/{len(keywords)}: '{keyword}' (Dept: {dept_tag}) ──")

                try:
                    # Fresh page load for every keyword to ensure clean state
                    log(f"  -> Loading {BASE_URL}")
                    page.goto(BASE_URL, timeout=60000, wait_until="domcontentloaded")
                    page.wait_for_timeout(3000)

                    # 1. Clear and type into the Keyword / Title field (TENDERTITLE)
                    log(f"  -> Typing keyword: {keyword}")
                    input_field = page.locator("input#TENDERTITLE")
                    input_field.click()
                    input_field.fill("")
                    input_field.type(keyword, delay=100)

                    # 2. Trigger events manually for Angular
                    page.evaluate("""() => {
                        const input = document.querySelector('input#TENDERTITLE');
                        if (input) {
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            input.dispatchEvent(new Event('blur', { bubbles: true }));
                        }
                    }""")

                    page.wait_for_timeout(1000)

                    # 3. Click the Search button
                    log("  -> Clicking Search button...")
                    page.click("input#searchButtonId")

                    # 4. Wait for processing loader to start and finish
                    try:
                        log("  -> Waiting for processing...")
                        page.wait_for_selector("#DataTables_Table_0_processing", state="visible", timeout=3000)
                        page.wait_for_selector("#DataTables_Table_0_processing", state="hidden", timeout=15000)
                    except Exception:
                        page.wait_for_timeout(3000)

                    # 5. Check if table actually updated
                    info_text = ""
                    try:
                        info_text = page.locator(".dataTables_info").inner_text()
                        log(f"  -> Table Info: {info_text}")
                    except Exception:
                        pass

                    if "1 to 50" in info_text and keyword != "":
                        first_row_text = page.locator("table tbody tr").first.inner_text()
                        if keyword not in first_row_text:
                            log(f"  -> [INFO] Search for '{keyword}' returned no new results. Skipping.")
                            continue

                    # 6. Scrape
                    rows = scrape_nprocure_results(page, keyword, dept_tag, conn)
                    if rows:
                        append_to_csv(OUTPUT_FILE, rows)
                        total_records += len(rows)
                    else:
                        log(f"  -> No data found for '{keyword}'.")

                except Exception as e:
                    log(f"  -> [ERROR search for '{keyword}']: {e}")
                    continue

        log(f"\n[DONE] Total records scraped: {total_records}")
        input("Press Enter to close browser...")

    except Exception as e:
        log(f"[FATAL ERROR] {e}")
        input("Press Enter to close...")
    
    finally:
        if conn: conn.close()
        context.close()
        browser.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)

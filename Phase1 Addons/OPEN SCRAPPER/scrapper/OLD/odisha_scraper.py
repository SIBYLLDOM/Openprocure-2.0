"""
odisha_scraper.py
=================
Odisha eProcurement Portal Search Scraper
https://tendersodisha.gov.in/nicgep/app

Flow:
  1. Open site and wait for page load
  2. Click on search input field (SearchDescription)
  3. Read keywords from keywords.csv
  4. For each keyword:
     - Type into search field and click Go button
     - Scrape all rows from results table (with pagination)
     - Save to row_data.csv
  5. Browser stays open until user manually closes it

Usage:
    python odisha_scraper.py
"""

import os
import re
import csv
import time
import mysql.connector
import json
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ── Configuration ──────────────────────────────────────────────────────────────
BASE_URL = "https://tendersodisha.gov.in/nicgep/app"
KEYWORDS_CONFIG = [
    {"file": "endo.csv", "dept": "endo"},
    {"file": "diagno.csv", "dept": "diagno"},
]
OUTPUT_FILE = "row_data.csv"
STATE_NAME = "Odisha"

# ── Database Config ─────────────────────────────────────────────────────────────
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
    "tender_title", "tender_refno", "tender_id", "organisation_chain"
]


def log(msg: str):
    """Print timestamped log message."""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"  [{ts}] {msg}")


def get_db_connection():
    """Get MySQL database connection."""
    return mysql.connector.connect(**DB_CONFIG)


def upsert_tender(conn, record):
    """Insert or update tender record in database with 17-column support."""
    cursor = conn.cursor()
    sql = """
        INSERT INTO open_tender_details
            (state, organisation_name, e_published_date, closing_date,
             opening_date, tender_title, tender_refno, tender_id,
             organisation_chain, tender_details, file_link,
             relevency_checker, relevancy_reason, suggested_product, dept)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            organisation_name  = VALUES(organisation_name),
            e_published_date   = VALUES(e_published_date),
            closing_date       = VALUES(closing_date),
            opening_date       = VALUES(opening_date),
            tender_title       = VALUES(tender_title),
            tender_refno       = VALUES(tender_refno),
            organisation_chain = VALUES(organisation_chain),
            tender_details     = VALUES(tender_details),
            file_link          = VALUES(file_link),
            dept               = VALUES(dept),
            updated_at         = CURRENT_TIMESTAMP
    """
    try:
        # Prepare data
        state = record.get("state")
        org_name = record.get("organisation_name")
        e_pub = record.get("e_published_date")
        closing = record.get("closing_date")
        opening = record.get("opening_date")
        title = record.get("tender_title")
        refno = record.get("tender_refno")
        tid = record.get("tender_id")
        chain = record.get("organisation_chain")
        details = record.get("tender_details") # This is our JSON string
        file_link = record.get("file_link")
        rel_check = record.get("relevency_checker", "not_processed")
        rel_reason = record.get("relevancy_reason")
        suggested = record.get("suggested_product")
        dept = record.get("dept")

        cursor.execute(sql, (
            state, org_name, e_pub, closing, opening, 
            title, refno, tid, chain, details, file_link,
            rel_check, rel_reason, suggested, dept
        ))
        conn.commit()
    except Exception as e:
        log(f"      [DB ERROR] {e} | ID: {record.get('tender_id')}")
        conn.rollback()
    finally:
        cursor.close()


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


def parse_title_cell(title_td):
    """Parse title cell to extract tender_title, tender_refno, tender_id."""
    raw_text = title_td.inner_text().strip()
    matches = re.findall(r'\[([^\]]+)\]', raw_text)
    if matches:
        tender_title = matches[0].strip() if len(matches) > 0 else ""
        tender_refno = matches[1].strip() if len(matches) > 1 else ""
        tender_id = matches[2].strip() if len(matches) > 2 else ""
    else:
        lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
        tender_title = lines[0] if lines else raw_text
        tender_refno = ""
        tender_id = ""
    return tender_title, tender_refno, tender_id


def go_to_next_page(page, current_page_num):
    """Navigate to next page of results. Returns True if successful."""
    target = str(current_page_num + 1)
    for selector in [
        f"td.paging a:text-is('{target}')",
        f"div.paging a:text-is('{target}')",
        f"a:text-is('{target}')",
    ]:
        try:
            links = page.locator(selector).all()
            visible = [l for l in links if l.is_visible()]
            if visible:
                with page.expect_navigation(timeout=60000):
                    visible[0].click()
                page.wait_for_selector("table#table.list_table", timeout=25000)
                log(f"  -> Moved to page {target}.")
                return True
        except Exception:
            continue
    return False


def scrape_tender_details_page(page):
    """
    Scrape the detailed tender information page.
    Extracts all key-value pairs from tables with classes like 'tablebg'.
    """
    details = {}
    try:
        # Wait for the detail tables to load
        page.wait_for_selector("table.tablebg", timeout=15000)
        
        # Find all detail tables
        tables = page.locator("table.tablebg").all()
        for table in tables:
            # Look for caption/field pairs in this table
            rows = table.locator("tr").all()
            for row in rows:
                captions = row.locator("td.td_caption").all()
                fields = row.locator("td.td_field").all()
                
                # Zip them together
                for i in range(min(len(captions), len(fields))):
                    key = captions[i].inner_text().strip().replace(":", "")
                    val = fields[i].inner_text().strip()
                    if key:
                        details[key] = val
        
        # Also look for 'Cover' information (different structure)
        covers = []
        cover_rows = page.locator("tr#informal, tr[id^='informal_']").all()
        for c_row in cover_rows:
            c_tds = c_row.locator("td.td_field").all()
            if len(c_tds) >= 4:
                covers.append({
                    "cover_no": c_tds[0].inner_text().strip(),
                    "cover_type": c_tds[1].inner_text().strip(),
                    "description": c_tds[2].inner_text().strip(),
                    "document_type": c_tds[3].inner_text().strip(),
                })
        if covers:
            details["Covers"] = covers

    except Exception as e:
        log(f"    [DETAIL SCRAPE ERROR] {e}")
    
    return details


def scrape_search_results(page, keyword: str, dept: str, conn):
    """
    Scrape all rows from search results table with pagination.
    Navigates into each tender's detail page for full data.
    """
    all_rows = []
    page_num = 1
    
    while True:
        try:
            page.wait_for_selector("table#table.list_table", timeout=25000)
        except PlaywrightTimeoutError:
            log(f"  -> No results table found on page {page_num}.")
            break
        
        rows = page.locator("table#table.list_table tr").all()
        page_count = 0
        
        # Extract row basic info first to avoid stale elements after navigation
        row_data_temp = []
        for row in rows:
            tds = row.locator("td").all()
            if len(tds) < 6: continue
            
            s_no = tds[0].inner_text().strip()
            if not s_no or s_no.lower() == "s.no": continue
            
            # The click-link is usually in the 5th column matching 'a[id^="DirectLink_"]'
            link_locator = tds[4].locator('a[id^="DirectLink_"]')
            if link_locator.count() == 0: continue

            tender_title, tender_refno, tender_id = parse_title_cell(tds[4])
            e_pub = tds[1].inner_text().strip()
            closing = tds[2].inner_text().strip()
            opening = tds[3].inner_text().strip()
            org_chain = tds[5].inner_text().strip()
            
            row_data_temp.append({
                "s_no": s_no,
                "e_pub": e_pub,
                "closing": closing,
                "opening": opening,
                "title": tender_title,
                "refno": tender_refno,
                "tid": tender_id,
                "chain": org_chain,
                "link_id": link_locator.first.get_attribute("id")
            })

        # Now navigate into each link
        for data in row_data_temp:
            try:
                log(f"    -> Opening details for ID: {data['tid']}...")
                page.click(f"a#{data['link_id']}")
                
                # Scrape detailed page
                full_details = scrape_tender_details_page(page)
                
                # Go back to results
                back_btn = page.locator('a#DirectLink:has-text("Back")')
                if back_btn.count() == 0:
                    back_btn = page.locator('a:has-text("Back")')
                
                back_btn.first.click()
                page.wait_for_selector("table#table.list_table", timeout=25000)

                # Store result for CSV
                all_rows.append([
                    keyword, dept, data["s_no"], data["e_pub"], data["closing"], data["opening"],
                    data["title"], data["refno"], data["tid"], data["chain"]
                ])
                
                if conn:
                    try:
                        upsert_tender(conn, {
                            "state": STATE_NAME,
                            "organisation_name": data["chain"],
                            "e_published_date": data["e_pub"],
                            "closing_date": data["closing"],
                            "opening_date": data["opening"],
                            "tender_title": data["title"],
                            "tender_refno": data["refno"],
                            "tender_id": data["tid"],
                            "organisation_chain": data["chain"],
                            "tender_details": json.dumps(full_details),
                            "file_link": None,
                            "dept": dept,
                        })
                    except Exception as db_err:
                        log(f"      [DB ERROR] {data['tid']}: {db_err}")
                
                page_count += 1
            except Exception as e:
                log(f"      [SKIP ERROR] {e}")
                # Try to recover by going back or re-searching
                page.go_back()
                page.wait_for_selector("table#table.list_table", timeout=10000)

        log(f"  -> Page {page_num}: scraped {page_count} full records.")
        
        if not go_to_next_page(page, page_num):
            break
        page_num += 1
        time.sleep(2)
    
    return all_rows


def run(playwright):
    """Main scraper runner."""
    # Initialize output CSV
    init_csv_output(OUTPUT_FILE)
    
    # Connect to database
    conn = None
    try:
        conn = get_db_connection()
        log("Connected to MySQL.")
    except Exception as e:
        log(f"[DB ERROR] Could not connect to MySQL: {e}")
        # Continue anyway, results will still be saved to CSV
    
    # Launch browser (non-headless so user can see and close manually)
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
    
    # Auto-dismiss any JS dialogs
    def handle_dialog(dialog):
        log(f"[Dialog] {dialog.type!r}: {dialog.message[:120]!r}")
        dialog.accept()
    
    page.on("dialog", handle_dialog)
    
    try:
        # Step 1: Open site
        log("[STEP 1] Opening site: " + BASE_URL)
        page.goto(BASE_URL, timeout=60000, wait_until="domcontentloaded")
        
        # Step 2: Wait 3 seconds for page load
        log("[STEP 2] Waiting 3 seconds for page load...")
        time.sleep(3)
        
        # Step 3: Wait for and click on search input field
        log("[STEP 3] Looking for search input field...")
        search_input = page.locator("input#SearchDescription")
        search_input.wait_for(state="visible", timeout=10000)
        search_input.click()
        log("[STEP 3] Clicked on search input field")
        
        # Step 4: Iterate through departments and keywords
        total_records = 0
        
        for config in KEYWORDS_CONFIG:
            csv_file = config["file"]
            dept_tag = config["dept"]
            
            log(f"\n[STEP 4] Processing file: {csv_file} (Dept: {dept_tag})")
            keywords = load_keywords(csv_file)
            
            if not keywords:
                log(f"[WARN] No keywords found in {csv_file}. Skipping...")
                continue
            
            log(f"[STEP 4] Loaded {len(keywords)} keywords from {csv_file}")
            
            for i, keyword in enumerate(keywords, 1):
                log(f"\n[STEP 5.{i}] Searching for keyword: '{keyword}' (Dept: {dept_tag})")
                
                # Re-locate search input
                search_input = page.locator("input#SearchDescription")
                search_input.wait_for(state="visible", timeout=10000)
                
                # Clear and type keyword
                search_input.fill("")
                search_input.fill(keyword)
                log(f"[STEP 5.{i}] Typed keyword: '{keyword}'")
                
                # Click Go button
                go_button = page.locator("input#Go")
                go_button.wait_for(state="visible", timeout=10000)
                go_button.click()
                log(f"[STEP 5.{i}] Clicked Go button")
                
                # Wait 3 seconds for results to load
                log(f"[STEP 5.{i}] Waiting 3 seconds for results...")
                time.sleep(3)
                
                # Check if "No Tenders found" message appears
                page_content = page.content()
                if "no tenders found" in page_content.lower() or page.locator("span.error:has-text('No Tenders found')").count() > 0:
                    log(f"[STEP 5.{i}] No tenders found for '{keyword}'. Moving to next...")
                    # Click Back button
                    try:
                        back_button = page.locator("a#DirectLink[title='Back']")
                        if back_button.count() > 0:
                            back_button.click()
                            time.sleep(3)
                    except Exception:
                        page.goto(BASE_URL, timeout=60000, wait_until="domcontentloaded")
                        time.sleep(3)
                    continue
                
                # Scrape all results for this keyword
                log(f"[STEP 5.{i}] Scraping results for '{keyword}'...")
                rows = scrape_search_results(page, keyword, dept_tag, conn)
                
                # Save to CSV
                if rows:
                    append_to_csv(OUTPUT_FILE, rows)
                    total_records += len(rows)
                    log(f"[STEP 5.{i}] Saved {len(rows)} rows to {OUTPUT_FILE}")
                
                # Click Back button to return to search page
                log(f"[STEP 5.{i}] Clicking Back button...")
                try:
                    back_button = page.locator("a#DirectLink[title='Back']")
                    back_button.wait_for(state="visible", timeout=10000)
                    back_button.click()
                    time.sleep(3)
                except Exception:
                    page.goto(BASE_URL, timeout=60000, wait_until="domcontentloaded")
                    time.sleep(3)
        
        log(f"\n[DONE] All keywords processed. Total records: {total_records}")
        log("[INFO] Browser will remain open. Press Enter to close...")
        try:
            input()
        except EOFError:
            pass
        
    except Exception as e:
        log(f"[ERROR] {str(e)[:200]}")
        log("[INFO] Browser will remain open. Press Enter to close...")
        try:
            input()
        except EOFError:
            pass
    
    finally:
        # Close database connection
        if conn:
            try:
                conn.close()
                log("Database connection closed.")
            except Exception:
                pass
        
        # Close browser
        try:
            context.close()
            browser.close()
        except Exception:
            pass


if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)

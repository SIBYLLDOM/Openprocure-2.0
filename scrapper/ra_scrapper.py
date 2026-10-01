import os
import re
import sys
import json
import argparse
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, date
import time

# Try to import mysql connector, display friendly error if missing
try:
    import mysql.connector
except ImportError:
    print("Warning: mysql-connector-python is not installed. Database connection will not work until you install it.")
    print("Run: pip install -r requirements.txt")

# Try to import playwright, display friendly error if missing
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Warning: playwright is not installed. Web search automation will not work until you install it.")
    print("Run: pip install -r requirements.txt")

# Configuration defaults
DB_HOST = "localhost"
DB_PORT = "3306"
DB_USER = "root"
DB_PASSWORD = "meril"
DB_NAME = os.getenv("DB_NAME", "tender_automation_with_ai")

PLAYWRIGHT_HEADLESS = os.getenv("PLAYWRIGHT_HEADLESS", "False").lower() in ("true", "1", "yes")
PLAYWRIGHT_SLOW_MO = int(os.getenv("PLAYWRIGHT_SLOW_MO", "1000"))
WAIT_TIME_AFTER_SEARCH = int(os.getenv("WAIT_TIME_AFTER_SEARCH", "5"))


def ts():
    """Returns current time as [HH:MM:SS] prefix for log lines."""
    return datetime.now().strftime("[%H:%M:%S]")


def parse_date(date_str):
    if not date_str:
        return None
    date_str = str(date_str).strip()
    date_part = date_str.split()[0]
    if 'T' in date_part:
        date_part = date_part.split('T')[0]
    formats = [
        "%d-%m-%Y",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%d-%b-%Y",
        "%d-%B-%Y"
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_part, fmt).date()
        except ValueError:
            continue
    return None


def fetch_active_tenders_from_db():
    print(f"\n{ts()} [DB] Connecting to MySQL database '{DB_NAME}' on {DB_HOST}:{DB_PORT}...")
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
    except Exception as e:
        print(f"{ts()} [ERROR] Failed to connect to MySQL database: {e}")
        print("[TIP] You can test the script using mock data by running: python ra_scrapper.py --mock")
        sys.exit(1)

    cursor = conn.cursor(dictionary=True)
    # Newest-added tenders first (today's additions get processed before older
    # backlog), so a fresh scrape run always reaches today's tenders quickly
    # instead of working through the whole backlog in arbitrary/PK order first.
    query = (
        "SELECT id, bid_number, end_date, department, items, created_at "
        "FROM gem_tenders WHERE bid_number IS NOT NULL AND end_date IS NOT NULL "
        "ORDER BY created_at DESC"
    )
    print(f"{ts()} [DB] Executing query: {query}")
    cursor.execute(query)
    rows = cursor.fetchall()
    print(f"{ts()} [DB] Found {len(rows)} tenders in database. Filtering for active tenders...")

    active_tenders = []
    today = date.today()
    invalid_dates_count = 0

    for row in rows:
        end_date_str = row['end_date']
        tender_date = parse_date(end_date_str)
        if tender_date is None:
            invalid_dates_count += 1
            if invalid_dates_count <= 5:
                print(f"{ts()} [DEBUG] Could not parse date format: '{end_date_str}' for bid: {row['bid_number']}")
            continue
        if tender_date >= today:
            row['parsed_end_date'] = tender_date
            active_tenders.append(row)

    if invalid_dates_count > 0:
        print(f"{ts()} [WARNING] Could not parse end_date for {invalid_dates_count} tenders. They were skipped.")

    print(f"{ts()} [DB] Filtered down to {len(active_tenders)} active tenders.")
    cursor.close()
    conn.close()
    return active_tenders


def get_mock_tenders():
    today_str = date.today().strftime("%d-%m-%Y")
    tomorrow_str = datetime.now().date().replace(day=date.today().day + 1).strftime("%d-%m-%Y") if date.today().day < 28 else date.today().strftime("%d-%m-%Y")
    yesterday_str = "23-06-2026"

    print(f"\n{ts()} [MOCK] Running with MOCK data...")
    mock_data = [
        {"id": 1, "bid_number": "GEM/2026/B/8765431", "end_date": today_str,      "department": "Department of Health",    "items": "Medical Equipment"},
        {"id": 2, "bid_number": "GEM/2026/B/8765432", "end_date": tomorrow_str,   "department": "Ministry of Education",   "items": "Laptops & Tablets"},
        {"id": 3, "bid_number": "GEM/2026/B/8765433", "end_date": yesterday_str,  "department": "Department of Posts",     "items": "Office Supplies"},
    ]

    active_tenders = []
    today = date.today()
    for row in mock_data:
        tender_date = parse_date(row['end_date'])
        if tender_date and tender_date >= today:
            row['parsed_end_date'] = tender_date
            active_tenders.append(row)

    print(f"{ts()} [MOCK] Filtered down to {len(active_tenders)} active tenders (from {len(mock_data)} total mock tenders).")
    return active_tenders


def extract_modal_data(page, tag, trigger_locator=None, js_trigger=None):
    """Click/trigger whatever opens a Representation or Corrigendum modal, grab its
    text, close it, and return it as a JSON string (or None if nothing opened)."""
    try:
        if js_trigger:
            page.evaluate(js_trigger)
        elif trigger_locator:
            trigger_locator.click(force=True)

        modal = page.wait_for_selector("div.modal:visible", timeout=8000)
        time.sleep(1)

        content = modal.inner_text()

        close_btn = page.query_selector("div.modal:visible button.close, div.modal:visible button[data-dismiss='modal']")
        if close_btn:
            close_btn.click()
        else:
            page.keyboard.press("Escape")

        page.wait_for_selector("div.modal:visible", state="hidden", timeout=5000)
        return json.dumps({"content": content}, ensure_ascii=False)
    except Exception as e:
        print(f"{ts()} {tag}   [MODAL] extract failed: {e}")
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        return None


def extract_corrigendum_structured(page, tag, js_trigger: str):
    """Same click/open/close flow as extract_modal_data, but also parses the
    corrigendum text into structured entries (modified_on / bid_extended_to /
    bid_opening_date / download_url) so the UI can render a real table instead
    of a wall of raw text. Falls back to {"content": ...} if parsing finds nothing."""
    try:
        page.evaluate(js_trigger)
        modal = page.wait_for_selector("div.modal:visible", timeout=8000)
        time.sleep(1)

        content = modal.inner_text()

        download_hrefs = []
        try:
            for a in modal.query_selector_all("a"):
                text = (a.inner_text() or "").strip()
                href = a.get_attribute("href")
                if href and "download" in text.lower():
                    abs_href = "https://bidplus.gem.gov.in" + href if href.startswith("/") else href
                    download_hrefs.append(abs_href)
        except Exception:
            pass

        close_btn = page.query_selector("div.modal:visible button.close, div.modal:visible button[data-dismiss='modal']")
        if close_btn:
            close_btn.click()
        else:
            page.keyboard.press("Escape")
        page.wait_for_selector("div.modal:visible", state="hidden", timeout=5000)

        entries = []
        chunks = re.split(r"Modified On:\s*", content)
        dl_idx = 0
        for chunk in chunks[1:]:
            m = re.match(r"([\d\-: ]+)", chunk)
            modified_on = m.group(1).strip() if m else None

            ext_m = re.search(r"Bid extended to\s*([\d\-: ]+(?:\(Auto Extension\))?)", chunk)
            open_m = re.search(r"Bid Opening Date:\s*([\d\-: ]+(?:\(Auto Extension\))?)", chunk)

            download_url = None
            if "Download" in chunk and dl_idx < len(download_hrefs):
                download_url = download_hrefs[dl_idx]
                dl_idx += 1

            entries.append({
                "modified_on": modified_on,
                "bid_extended_to": ext_m.group(1).strip() if ext_m else None,
                "bid_opening_date": open_m.group(1).strip() if open_m else None,
                "download_url": download_url,
            })

        if entries:
            return json.dumps({"entries": entries, "raw_full_text": content}, ensure_ascii=False)
        return json.dumps({"content": content}, ensure_ascii=False)
    except Exception as e:
        print(f"{ts()} {tag}   [MODAL] corrigendum extract failed: {e}")
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        return None


def extract_corrigendum_representation(page, card, tag):
    """Expand the card's 'View Corrigendum/Representation' toggle and pull out
    both modals' contents, if present. Returns (representation_json, corrigendum_json)."""
    rep_json, corr_json = None, None

    try:
        toggle = card.locator("a:has-text('View Corrigendum/Representation')")
        if toggle.count() > 0:
            toggle.first.click(force=True)
            time.sleep(1.5)
    except Exception as e:
        print(f"{ts()} {tag}   [EXPAND] failed: {e}")

    try:
        for el in card.locator("a, span").all():
            text = el.inner_text() or ""
            if "View Representation" in text:
                onclick = el.get_attribute("onclick")
                print(f"{ts()} {tag}   Found 'View Representation' — extracting modal...")
                rep_json = extract_modal_data(
                    page, tag,
                    js_trigger=onclick if onclick else None,
                    trigger_locator=None if onclick else el,
                )
                break
    except Exception as e:
        print(f"{ts()} {tag}   [REPRESENTATION] failed: {e}")

    try:
        for s in card.locator("span[data-bid]").all():
            text = s.inner_text() or ""
            if "View Corrigendum" in text:
                bid = s.get_attribute("data-bid")
                if bid:
                    print(f"{ts()} {tag}   Found 'View Corrigendum' — extracting modal...")
                    corr_json = extract_corrigendum_structured(page, tag, f"view_corrigendum_modal('{bid}')")
                break
    except Exception as e:
        print(f"{ts()} {tag}   [CORRIGENDUM] failed: {e}")

    return rep_json, corr_json


def update_tender_ra_details(tender_id, ra_no, ra_url, representation_json=None, corrigendum_json=None, is_mock=False):
    if is_mock:
        print(f"{ts()} [MOCK-DB] Simulating DB update for tender ID {tender_id}: ra_no = '{ra_no}', ra_url = '{ra_url}'")
        return
    print(f"{ts()} [DB] Updating tender ID {tender_id} with RA Details: {ra_no}...")
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        cursor = conn.cursor()
        # NULLIF/COALESCE so an empty ra_no/ra_url this run (e.g. only a
        # corrigendum was found) never wipes out a value saved previously.
        query = """
            UPDATE gem_tenders
            SET ra_no = COALESCE(NULLIF(%s, ''), ra_no),
                ra_url = COALESCE(NULLIF(%s, ''), ra_url),
                Representation_json = COALESCE(%s, Representation_json),
                Corrigendum_json    = COALESCE(%s, Corrigendum_json)
            WHERE id = %s
        """
        cursor.execute(query, (ra_no, ra_url, representation_json, corrigendum_json, tender_id))
        conn.commit()
        print(f"{ts()} [DB] Successfully updated tender ID {tender_id} in database.")
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"{ts()} [ERROR] Failed to update tender ID {tender_id} in database: {e}")


def process_tender_batch(tenders_chunk, is_mock, worker_id):
    """
    Processes a subset of tenders in its own Playwright browser instance.
    Designed to run in a thread alongside other workers.
    """
    tag = f"[Worker-{worker_id}]"

    if not tenders_chunk:
        print(f"{ts()} {tag} No tenders assigned. Exiting worker.")
        return

    print(f"{ts()} {tag} Launching browser ({len(tenders_chunk)} tenders, Headless={PLAYWRIGHT_HEADLESS}, SlowMo={PLAYWRIGHT_SLOW_MO}ms)...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=PLAYWRIGHT_HEADLESS, slow_mo=PLAYWRIGHT_SLOW_MO)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        page.set_default_timeout(30000)

        url = "https://bidplus.gem.gov.in/all-bids"
        print(f"{ts()} {tag} Navigating to: {url}")

        for idx, tender in enumerate(tenders_chunk):
            bid_number = tender['bid_number']
            end_date = tender['end_date']
            dept = tender.get('department', 'Unknown Department')

            print(f"\n{ts()} {tag} --- [{idx + 1}/{len(tenders_chunk)}] Searching Bid: {bid_number} ---")
            print(f"{ts()} {tag}     End Date: {end_date}")
            print(f"{ts()} {tag}     Department: {dept}")

            try:
                print(f"{ts()} {tag} Loading search page...")
                page.goto(url)

                print(f"{ts()} {tag} Waiting for search input (#searchBid)...")
                page.wait_for_selector("#searchBid", state="visible")

                print(f"{ts()} {tag} Filling bid number '{bid_number}' into search field...")
                page.fill("#searchBid", bid_number)

                print(f"{ts()} {tag} Pressing Enter to search...")
                page.press("#searchBid", "Enter")

                try:
                    page.wait_for_load_state("networkidle", timeout=5000)
                except Exception:
                    pass

                if is_mock:
                    print(f"{ts()} {tag} [MOCK] Injecting mock search result HTML with RA NO...")
                    mock_html = """
                    <div id="mock-result">
                        <p class="bid_no pull-left">
                            <span class="bid_title">RA NO:&nbsp;</span>
                            <a class="bid_no_hover" href="/showradocumentPdf/9503085" target="_blank">GEM/2026/R/686006</a>
                        </p>
                    </div>
                    """
                    page.evaluate(f"document.body.insertAdjacentHTML('beforeend', `{mock_html}`)")

                print(f"{ts()} {tag} Checking for RA details in search result...")
                ra_no = None
                ra_url = None

                try:
                    page.wait_for_timeout(1000)
                    ra_paragraphs = page.locator("p.bid_no").all()
                    for p_el in ra_paragraphs:
                        text = p_el.inner_text()
                        if "RA NO:" in text:
                            a_link = p_el.locator("a.bid_no_hover")
                            if a_link.count() > 0:
                                ra_no = a_link.first.inner_text().strip()
                                href = a_link.first.get_attribute("href")
                                if href:
                                    ra_url = f"https://bidplus.gem.gov.in{href}" if href.startswith("/") else href
                            break
                except Exception as ex:
                    print(f"{ts()} {tag} Error checking for RA elements on page: {ex}")

                if ra_no:
                    print(f"{ts()} {tag} Found RA Details! RA NO: {ra_no}, URL: {ra_url}")
                else:
                    print(f"{ts()} {tag} No RA details found for this bid on the page.")

                rep_json, corr_json = None, None
                try:
                    card = page.locator("div.card").first
                    if card.count() > 0:
                        print(f"{ts()} {tag} Checking for Corrigendum/Representation...")
                        rep_json, corr_json = extract_corrigendum_representation(page, card, tag)
                except Exception as ex:
                    print(f"{ts()} {tag} Error checking for Corrigendum/Representation: {ex}")

                if ra_no or rep_json or corr_json:
                    update_tender_ra_details(
                        tender['id'], ra_no or "", ra_url or "",
                        representation_json=rep_json, corrigendum_json=corr_json,
                        is_mock=is_mock,
                    )

                print(f"{ts()} {tag} Waiting {WAIT_TIME_AFTER_SEARCH}s before next search...")
                time.sleep(WAIT_TIME_AFTER_SEARCH)

            except Exception as e:
                print(f"{ts()} {tag} [ERROR] Failed during Playwright action for bid {bid_number}: {e}")

        print(f"\n{ts()} {tag} Completed all assigned tenders. Closing browser.")
        browser.close()


def process_tenders_parallel(tenders, is_mock, num_workers):
    """
    Splits tenders across num_workers threads, each with its own browser instance.
    """
    if not tenders:
        print(f"{ts()} [INFO] No active tenders to process this cycle.")
        return

    # Split tenders into roughly equal chunks
    chunk_size = math.ceil(len(tenders) / num_workers)
    chunks = [tenders[i:i + chunk_size] for i in range(0, len(tenders), chunk_size)]
    actual_workers = len(chunks)

    print(f"\n{ts()} [PARALLEL] Splitting {len(tenders)} tenders across {actual_workers} worker(s)...")
    for i, chunk in enumerate(chunks):
        bid_list = [t['bid_number'] for t in chunk]
        print(f"{ts()} [PARALLEL] Worker-{i + 1} assigned {len(chunk)} tender(s): {bid_list}")

    with ThreadPoolExecutor(max_workers=actual_workers) as executor:
        futures = {
            executor.submit(process_tender_batch, chunk, is_mock, i + 1): i + 1
            for i, chunk in enumerate(chunks)
        }
        for future in as_completed(futures):
            worker_id = futures[future]
            try:
                future.result()
            except Exception as e:
                print(f"{ts()} [ERROR] Worker-{worker_id} raised an exception: {e}")

    print(f"\n{ts()} [PARALLEL] All workers finished for this cycle.")


def main():
    parser = argparse.ArgumentParser(description="Continuously check active tenders from MySQL and search on GeM Portal using Playwright.")
    parser.add_argument("--mock",     "-m", action="store_true", help="Run with mock tender data instead of MySQL database.")
    parser.add_argument("--limit",    "-l", type=int, default=None,  help="Limit the number of active tenders to process per cycle.")
    parser.add_argument("--workers",  "-w", type=int, default=3,     help="Number of parallel browser workers (default: 3).")
    parser.add_argument("--interval", "-i", type=int, default=30,    help="Minutes to wait between full scraping cycles (default: 30).")
    parser.add_argument("--once",           action="store_true",     help="Run only one cycle then exit (no continuous loop).")
    args = parser.parse_args()

    print("=" * 65)
    print("  GeM Active Tender Checker & Playwright Searcher (Continuous)")
    print("=" * 65)
    print(f"  Workers: {args.workers} | Interval: {args.interval} min | Mock: {args.mock} | Once: {args.once}")
    print("=" * 65)
    print(f"  Press Ctrl+C to stop gracefully at any time.")
    print("=" * 65)

    cycle = 0
    try:
        while True:
            cycle += 1
            print(f"\n{ts()} ===== CYCLE {cycle} | Date: {date.today()} =====")

            if args.mock:
                active_tenders = get_mock_tenders()
            else:
                active_tenders = fetch_active_tenders_from_db()

            if args.limit and args.limit > 0:
                print(f"{ts()} [INFO] Limiting to first {args.limit} active tenders.")
                active_tenders = active_tenders[:args.limit]

            process_tenders_parallel(active_tenders, is_mock=args.mock, num_workers=args.workers)

            print(f"\n{ts()} ===== CYCLE {cycle} COMPLETE =====")

            if args.once:
                print(f"{ts()} [INFO] --once flag set. Exiting after single cycle.")
                break

            next_run = datetime.now().strftime("%H:%M:%S")
            wait_secs = args.interval * 60
            print(f"{ts()} [INFO] Sleeping for {args.interval} minute(s) before next cycle...")
            print(f"{ts()} [INFO] Next cycle starts at approximately {next_run} + {args.interval}min.")

            # Sleep in small increments so Ctrl+C is responsive
            for _ in range(wait_secs):
                time.sleep(1)

    except KeyboardInterrupt:
        print(f"\n\n{ts()} [STOP] Ctrl+C received. Stopping gracefully. Goodbye.")
        sys.exit(0)


if __name__ == "__main__":
    main()

import sys
import re
import json
import math
import multiprocessing
import mysql.connector
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

# ─── DB CONNECTION ───────────────────────────

def get_db_connection():
    return mysql.connector.connect(
        host='localhost',
        user='root',
        password='meril',
        database='tender_automation_with_ai'
    )


def update_corrigendum_json(bid_no, data):
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        sql = """
        INSERT INTO gem_tenders (bid_number, Corrigendum_json, json_data)
        VALUES (%s, %s, '{}')
        ON DUPLICATE KEY UPDATE Corrigendum_json = VALUES(Corrigendum_json)
        """
        cursor.execute(sql, (bid_no, json.dumps(data, ensure_ascii=False)))
        connection.commit()
    finally:
        cursor.close()
        connection.close()


def update_representation_json(bid_no, data):
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        sql = """
        INSERT INTO gem_tenders (bid_number, Representation_json, json_data)
        VALUES (%s, %s, '{}')
        ON DUPLICATE KEY UPDATE Representation_json = VALUES(Representation_json)
        """
        cursor.execute(sql, (bid_no, json.dumps(data, ensure_ascii=False)))
        connection.commit()
    finally:
        cursor.close()
        connection.close()


# ─── FETCH BID NUMBERS ──────────────────────

def get_bid_numbers():
    """
    Get all active bid numbers from gem_tenders (Endo/Diagno, no RA)
    that are not yet closed. Runs every time to catch new corrigendum
    and representation updates on any active tender.
    """
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT bid_number
            FROM gem_tenders
            WHERE dept IN ('Endo', 'Diagno')
            AND (ra_no IS NULL OR TRIM(ra_no) = '')
            AND STR_TO_DATE(end_date, '%d-%m-%Y %h:%i %p') >= CURDATE()
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        print(f"[DB] Found {len(rows)} active tenders to process.")
        return [row['bid_number'] for row in rows]
    except Exception as e:
        print(f"[DB ERROR] {e}")
        return []
    finally:
        cursor.close()
        conn.close()


# ─── SCRAPING HELPERS ────────────────────────

def scrape_corrigendum_content(page):
    """
    Scrapes the Corrigendum modal content as structured JSON.
    Captures all wells and the full text (including disclaimer).
    """
    print("    [DEBUG] Waiting for corrigendum content...")
    try:
        page.wait_for_selector(".modal.show, #myModal5, .modal-content", timeout=10000)
        page.wait_for_timeout(2000)
    except Exception:
        print("    [DEBUG] Timeout waiting for modal/content.")

    modal = page.query_selector(".modal.show .modal-body") or \
            page.query_selector("#myModal5 .modal-body") or \
            page.query_selector(".modal-content") or \
            page.query_selector("body")

    data = {}
    if modal:
        data["raw_full_text"] = modal.inner_text().strip()

    wells = modal.query_selector_all(".well") if modal else []
    print(f"    [DEBUG] Found {len(wells)} .well elements.")

    entries = []
    for well in wells:
        text = well.inner_text().strip()
        if not text:
            continue

        entry = {"raw_text": text}

        mod_match = re.search(r"Modified On:\s*([\d\-\s:]+)", text)
        if mod_match:
            entry["modified_on"] = mod_match.group(1).strip()

        ext_match = re.search(r"Bid extended to\s*([\d\-\s:]+)", text)
        if ext_match:
            entry["bid_extended_to"] = ext_match.group(1).strip()

        open_match = re.search(r"Bid Opening Date:\s*([\d\-\s:]+)", text)
        if open_match:
            entry["bid_opening_date"] = open_match.group(1).strip()

        download_link = well.query_selector("a[href*='download']")
        if download_link:
            entry["download_url"] = download_link.get_attribute("href")

        entries.append(entry)

    data["entries"] = entries
    return data


def scrape_representation_content(page, bid_no):
    """
    Scrapes the Representation modal content.
    Targeting the specialized table structure: Section, Query, Reply.
    """
    print(f"    [DEBUG] Waiting for representation content for {bid_no}...")
    try:
        page.wait_for_selector(".modal.show table, h3:has-text('Publish Representations')", timeout=15000)
        page.wait_for_timeout(3000)
    except Exception:
        print("    [DEBUG] Timeout waiting for representation landmarks. Capturing screenshot...")
        page.screenshot(path=f"rep_timeout_{bid_no.replace('/', '_')}.png")

    modal = page.query_selector(".modal.show") or page.query_selector("#myModal5")

    data = {}
    if modal:
        data["raw_full_text"] = modal.inner_text().strip()

    all_tables = modal.query_selector_all("table") if modal else page.query_selector_all("table")

    rows = []
    for table in all_tables:
        if not table.is_visible():
            continue

        tr_elements = table.query_selector_all("tr")
        for tr in tr_elements:
            if tr.query_selector("th"):
                continue
            cols = tr.query_selector_all("td")
            if len(cols) >= 3:
                row = {
                    "section": cols[0].inner_text().strip(),
                    "query":   cols[1].inner_text().strip(),
                    "reply":   cols[2].inner_text().strip()
                }
                rows.append(row)

        if rows:
            print(f"    [DEBUG] Successfully scraped {len(rows)} table rows from a visible table.")
            data["rows"] = rows
            break

    if modal:
        bid_no_label = modal.query_selector("label:has-text('Bid No')")
        if bid_no_label:
            data["bid_no"] = bid_no_label.inner_text().replace("Bid No:", "").strip()

        pub_date_label = modal.query_selector("label:has-text('Response Publication Date')")
        if pub_date_label:
            data["response_publication_date"] = pub_date_label.inner_text().replace("Response Publication Date:", "").strip()

        wells = [w.inner_text().strip() for w in modal.query_selector_all(".well")]
        if wells:
            data["well_entries"] = wells

    return data


def close_modal(page):
    """Closes the modal popup."""
    try:
        close_btn = page.query_selector(".modal.show button.close") or \
                    page.query_selector("#myModal5 button.close") or \
                    page.query_selector(".modal-header span[aria-hidden='true']") or \
                    page.query_selector(".modal.show .close")
        if close_btn:
            close_btn.click()
            page.wait_for_timeout(1000)
        else:
            page.keyboard.press("Escape")
            page.wait_for_timeout(500)
    except Exception:
        pass


# ─── WORKER ──────────────────────────────────

def process_bid_chunk(bid_chunk, worker_id):
    """Worker function to process a chunk of bids."""
    print(f"[Worker {worker_id}] Starting to process {len(bid_chunk)} bids")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print(f"[Worker {worker_id}] Opening https://bidplus.gem.gov.in/all-bids ...")
        page.goto("https://bidplus.gem.gov.in/all-bids", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        for index, bid_no in enumerate(bid_chunk, start=1):
            print(f"[Worker {worker_id}] --- [{index}/{len(bid_chunk)}] Processing: {bid_no} ---")

            try:
                if index > 1:
                    page.goto("https://bidplus.gem.gov.in/all-bids", wait_until="networkidle", timeout=30000)

                page.wait_for_selector("input#searchBid", state="visible", timeout=10000)
                page.fill("input#searchBid", "")
                page.fill("input#searchBid", bid_no)

                page.wait_for_selector("button#searchBidRA", state="visible", timeout=5000)
                page.click("button#searchBidRA")
                print(f"[Worker {worker_id}]   [SEARCH] Clicked search button. Waiting for results...")

                page.wait_for_timeout(3000)

                total_record_span = page.query_selector(".totalRecord")
                if total_record_span:
                    record_text = total_record_span.inner_text().strip()
                    if "Showing 0" in record_text:
                        print(f"[Worker {worker_id}]   [SKIP] No records found on portal for {bid_no}.")
                        continue

                bid_card = page.wait_for_selector("div#bidCard", timeout=10000)
                if not bid_card:
                    print(f"[Worker {worker_id}]   [SKIP] div#bidCard not found. Moving to next bid.")
                    continue

                bid_no_link = bid_card.query_selector("a.bid_no_hover")
                shown_bid = bid_no_link.inner_text().strip() if bid_no_link else ""

                if shown_bid != bid_no:
                    print(f"[Worker {worker_id}]   [SKIP] Card shows '{shown_bid}', not '{bid_no}'.")
                    continue

                print(f"[Worker {worker_id}]   [FOUND] Correct bid card confirmed: {shown_bid}")

                other_details_btn = page.wait_for_selector("p.otherDetails", timeout=5000)
                if not other_details_btn:
                    print(f"[Worker {worker_id}]   [INFO] No Corrigendum/Representation button on this card.")
                    continue

                print(f"[Worker {worker_id}]   [CLICK] Opening details panel...")
                other_details_btn.click()
                page.wait_for_timeout(2000)

                corrigendum_btn = page.query_selector("a:has-text('View Corrigendum')")
                representation_btn = page.query_selector("a:has-text('View Representation')")

                if corrigendum_btn:
                    print(f"[Worker {worker_id}]   [CLICK] Clicking 'View Corrigendum'...")
                    corrigendum_btn.click()
                    page.wait_for_timeout(3000)
                    cor_data = scrape_corrigendum_content(page)
                    update_corrigendum_json(bid_no, cor_data)
                    print(f"[Worker {worker_id}]   [SUCCESS] Corrigendum saved.")
                    close_modal(page)
                    page.wait_for_timeout(1000)

                    # Re-open details panel if needed for representation
                    if representation_btn and not page.query_selector("a:has-text('View Representation')"):
                        print(f"[Worker {worker_id}]   [INFO] Re-opening details panel for Representation...")
                        other_details_btn = page.query_selector("p.otherDetails")
                        if other_details_btn:
                            other_details_btn.click()
                            page.wait_for_timeout(2000)

                representation_btn = page.query_selector("a:has-text('View Representation')")
                if representation_btn:
                    print(f"[Worker {worker_id}]   [CLICK] Clicking 'View Representation'...")
                    representation_btn.click()
                    page.wait_for_timeout(3000)
                    rep_data = scrape_representation_content(page, bid_no)
                    update_representation_json(bid_no, rep_data)
                    print(f"[Worker {worker_id}]   [SUCCESS] Representation saved.")
                    close_modal(page)

                if not corrigendum_btn and not representation_btn:
                    print(f"[Worker {worker_id}]   [INFO] No Corrigendum or Representation found for {bid_no}.")

            except Exception as e:
                print(f"[Worker {worker_id}]   [ERROR] Failed to process {bid_no}: {e}")
                continue

        browser.close()
        print(f"[Worker {worker_id}] Completed processing {len(bid_chunk)} bids")
        return len(bid_chunk)


# ─── MAIN ────────────────────────────────────

def main():
    print("Fetching bid numbers from database...")
    try:
        bid_numbers = get_bid_numbers()
    except Exception as e:
        print(f"Database error: {e}")
        return

    if not bid_numbers:
        print("No bid numbers found matching the criteria.")
        return

    print(f"Found {len(bid_numbers)} bid(s) to process.\n")

    num_workers = 5
    chunk_size = math.ceil(len(bid_numbers) / num_workers)
    bid_chunks = [bid_numbers[i:i + chunk_size] for i in range(0, len(bid_numbers), chunk_size)]

    print(f"Splitting {len(bid_numbers)} bids into {len(bid_chunks)} chunks for {num_workers} workers.")

    with multiprocessing.Pool(processes=num_workers) as pool:
        args = [(chunk, i) for i, chunk in enumerate(bid_chunks)]
        results = pool.starmap(process_bid_chunk, args)

    total_processed = sum(results)
    print(f"\n=> All workers completed. Total bids processed: {total_processed}")


if __name__ == "__main__":
    main()
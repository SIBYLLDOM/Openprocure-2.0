import sys
import re
import json
import pymysql
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

# ─── DB CONNECTION ───────────────────────────

def get_db_connection():
    return pymysql.connect(
        host='127.0.0.1',
        user='root',
        password='meril',
        database='tender_automation_with_ai',
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )
def update_corrigendum_json(bid_no, data):
    import json
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # Use INSERT ... ON DUPLICATE KEY UPDATE to ensure record exists
            sql = """
            INSERT INTO gem_tenders (bid_number, Corrigendum_json, json_data)
            VALUES (%s, %s, '{}')
            ON DUPLICATE KEY UPDATE Corrigendum_json = VALUES(Corrigendum_json)
            """
            cursor.execute(sql, (bid_no, json.dumps(data, ensure_ascii=False)))
        connection.commit()
    finally:
        connection.close()


def update_representation_json(bid_no, data):
    import json
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # Use INSERT ... ON DUPLICATE KEY UPDATE 
            sql = """
            INSERT INTO gem_tenders (bid_number, Representation_json, json_data)
            VALUES (%s, %s, '{}')
            ON DUPLICATE KEY UPDATE Representation_json = VALUES(Representation_json)
            """
            cursor.execute(sql, (bid_no, json.dumps(data, ensure_ascii=False)))
        connection.commit()
    finally:
        connection.close()


def scrape_corrigendum_content(page):
    """
    Scrapes the Corrigendum modal content as structured JSON.
    Captures all wells and the full text (including disclaimer).
    """
    print("    [DEBUG] Waiting for corrigendum content...")
    try:
        # Wait for the modal or content container
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
        
        # Extract specific fields if present
        mod_match = re.search(r"Modified On:\s*([\d\-\s:]+)", text)
        if mod_match:
            entry["modified_on"] = mod_match.group(1).strip()
            
        ext_match = re.search(r"Bid extended to\s*([\d\-\s:]+)", text)
        if ext_match:
            entry["bid_extended_to"] = ext_match.group(1).strip()
            
        open_match = re.search(r"Bid Opening Date:\s*([\d\-\s:]+)", text)
        if open_match:
            entry["bid_opening_date"] = open_match.group(1).strip()
            
        # Check for download links. GeM's corrigendum download href is
        # "/bidding/bid/showcorrigendumpdf/<id>/<bidId>" - it does not contain
        # the substring "download", so match on the link's visible text instead.
        download_link = well.query_selector("a:has-text('Download')")
        if download_link:
            href = download_link.get_attribute("href")
            entry["download_url"] = f"https://bidplus.gem.gov.in{href}" if href and href.startswith("/") else href
            
        entries.append(entry)
            
    data["entries"] = entries
    return data


def scrape_representation_content(page, bid_no):
    """
    Scrapes the Representation modal content.
    Targeting the specialized table structure: section, Query, Reply.

    GeM is a Bootstrap 3 site (open modals get class "in", not the Bootstrap
    4/5 "show" class this used to check for), and it renders Representation
    in its own dedicated element, #representation_modal_ajax - a completely
    different element from #myModal5 (used for Corrigendum). Checking
    ".modal.show" never matched anything, so this used to silently fall back
    to whatever #myModal5 still contained from the previous Corrigendum step.
    """
    print(f"    [DEBUG] Waiting for representation content for {bid_no}...")
    try:
        page.wait_for_function(
            """() => {
                const modal = document.querySelector('#representation_modal_ajax');
                return !!modal && modal.classList.contains('in') && /representation/i.test(modal.innerText);
            }""",
            timeout=15000
        )
        page.wait_for_timeout(1500) # Stable loading
    except Exception:
        print("    [DEBUG] Timeout waiting for representation landmarks. Capturing screenshot...")
        page.screenshot(path=f"rep_timeout_{bid_no.replace('/', '_')}.png")

    modal = page.query_selector("#representation_modal_ajax") or page.query_selector("#myModal5")
    
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
            # Skip header rows
            if tr.query_selector("th"):
                continue
            cols = tr.query_selector_all("td")
            # The representation table has 3 columns: Section, Query, Reply
            if len(cols) >= 3:
                row = {
                    "section": cols[0].inner_text().strip(),
                    "query": cols[1].inner_text().strip(),
                    "reply": cols[2].inner_text().strip()
                }
                rows.append(row)
        
        if rows:
            # If we found rows in this table, we're likely in the right spot
            print(f"    [DEBUG] Successfully scraped {len(rows)} table rows from a visible table.")
            data["rows"] = rows
            break 

    # Also grab header info from the visible modal
    if modal:
        bid_no_label = modal.query_selector("label:has-text('Bid No')")
        if bid_no_label:
            data["bid_no"] = bid_no_label.inner_text().replace("Bid No:", "").strip()
            
        pub_date_label = modal.query_selector("label:has-text('Response Publication Date')")
        if pub_date_label:
            data["response_publication_date"] = pub_date_label.inner_text().replace("Response Publication Date:", "").strip()

        # Fallback to wells if no table rows found or to augment data
        wells = [w.inner_text().strip() for w in modal.query_selector_all(".well")]
        if wells:
            data["well_entries"] = wells
            
    return data


def close_modal(page):
    """Closes any open modal(s) via Bootstrap/jQuery's own API and waits for
    them to actually disappear.

    This is a Bootstrap 3 site: open modals get class "in", not the
    Bootstrap 4/5 "show" class the old selectors checked for, and Escape
    does not dismiss these modals (keyboard dismissal isn't wired up here).
    So the previous implementation's close_btn selectors never matched and
    its Escape fallback was a no-op - the modal (e.g. #myModal5 for
    Corrigendum) stayed open, its backdrop then intercepted the next click
    (e.g. "View Representation"), and stale content got re-scraped.
    Calling jQuery's modal('hide') directly is what the page's own scripts
    use, so it reliably closes whatever is open.
    """
    try:
        page.evaluate(
            "() => { if (window.jQuery) { jQuery('.modal.in').modal('hide'); "
            "jQuery('.modal-backdrop').remove(); jQuery('body').removeClass('modal-open'); } }"
        )
        page.wait_for_function("() => !document.querySelector('.modal.in')", timeout=5000)
    except Exception:
        pass



# ─── FETCH BID NUMBERS ──────────────────────

def get_bid_numbers():
    """
    Get all bid_no from tender_processing_results where result = 'yes'
    AND they either don't exist in gem_tenders or have missing JSON data.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # More inclusive query: either NULL data or missing entry in gem_tenders
            query = """
            SELECT t.bid_no
            FROM tender_processing_results t
            LEFT JOIN gem_tenders g ON g.bid_number = t.bid_no
            WHERE t.result = 'yes'
            AND (g.bid_number IS NULL OR g.Corrigendum_json IS NULL OR g.Representation_json IS NULL)
            AND (g.perfect_cat = 1 OR (g.perfect_cat = 0 AND t.bid_no IN (
                SELECT bid_no FROM tender_processing_results WHERE result = 'yes'
            )))
            ORDER BY
              (g.perfect_cat = 1 AND STR_TO_DATE(REPLACE(g.end_date, '/', '-'), '%d-%m-%Y %h:%i %p') > NOW()) DESC,
              g.perfect_cat DESC,
              STR_TO_DATE(REPLACE(g.end_date, '/', '-'), '%d-%m-%Y %h:%i %p') ASC
            """
            cursor.execute(query)
            rows = cursor.fetchall()
            return [row['bid_no'] for row in rows]
    finally:
        conn.close()


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

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        print("Opening https://bidplus.gem.gov.in/all-bids ...")
        page.goto("https://bidplus.gem.gov.in/all-bids", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        for index, bid_no in enumerate(bid_numbers, start=1):
            print(f"\n--- [{index}/{len(bid_numbers)}] Processing: {bid_no} ---")

            try:
                # Reset search by going to the URL again if needed, or just clear input
                # Navigating is the safest way to clear any previous modals/states
                if index > 1:
                    page.goto("https://bidplus.gem.gov.in/all-bids", wait_until="networkidle", timeout=30000)

                # Type bid number into search box
                page.wait_for_selector("input#searchBid", state="visible", timeout=10000)
                page.fill("input#searchBid", "")
                page.fill("input#searchBid", bid_no)
                
                # Click the search button
                page.wait_for_selector("button#searchBidRA", state="visible", timeout=5000)
                page.click("button#searchBidRA")
                print("  [SEARCH] Clicked search button. Waiting for results...")

                # Wait for result cards to load
                page.wait_for_timeout(3000)
                
                # Check if "No records found" or "Showing 0" message is present
                total_record_span = page.query_selector(".totalRecord")
                if total_record_span:
                    record_text = total_record_span.inner_text().strip()
                    if "Showing 0" in record_text:
                        print(f"  [SKIP] No records found on portal for {bid_no}.")
                        continue

                # ── STEP 2: Verify bid card is shown ────────────────────────
                bid_card = page.wait_for_selector("div#bidCard", timeout=10000)
                if not bid_card:
                    print(f"  [SKIP] div#bidCard not found. Moving to next bid.")
                    continue

                # Check the bid number shown in the card matches what we searched
                bid_no_link = bid_card.query_selector("a.bid_no_hover")
                shown_bid = bid_no_link.inner_text().strip() if bid_no_link else ""

                if shown_bid != bid_no:
                    print(f"  [SKIP] Card shows '{shown_bid}', not '{bid_no}'.")
                    continue

                print(f"  [FOUND] Correct bid card confirmed: {shown_bid}")

                # ── STEP 3: Click "View Corrigendum/Representation" button ──
                other_details_btn = page.wait_for_selector("p.otherDetails", timeout=5000)
                if not other_details_btn:
                    print("  [INFO] No Corrigendum/Representation button on this card.")
                    continue

                print("  [CLICK] Opening details panel...")
                other_details_btn.click()
                page.wait_for_timeout(2000)

                # ── STEP 4: Scrape Corrigendum and Representation ───────────
                # We handle both sequentially.
                
                # Check for buttons FIRST
                # Use fresh queries from the page context
                corrigendum_btn = page.query_selector("a:has-text('View Corrigendum')")
                representation_btn = page.query_selector("a:has-text('View Representation')")

                if corrigendum_btn:
                    print("  [CLICK] Clicking 'View Corrigendum'...")
                    corrigendum_btn.click()
                    page.wait_for_timeout(3000)
                    cor_data = scrape_corrigendum_content(page)
                    update_corrigendum_json(bid_no, cor_data)
                    print(f"  [SUCCESS] Corrigendum saved.")
                    close_modal(page)
                    page.wait_for_timeout(1000)
                    
                    # AFTER closing Corrigendum, the detail panel might collapse.
                    # Re-click the panel if Representation button is hidden.
                    if representation_btn and not page.query_selector("a:has-text('View Representation')"):
                        print("  [INFO] Re-opening details panel for Representation...")
                        other_details_btn = page.query_selector("p.otherDetails")
                        if other_details_btn:
                            other_details_btn.click()
                            page.wait_for_timeout(2000)

                # Re-query representation button to ensure it's fresh
                representation_btn = page.query_selector("a:has-text('View Representation')")
                if representation_btn:
                    print("  [CLICK] Clicking 'View Representation'...")
                    representation_btn.click()
                    page.wait_for_timeout(3000)
                    rep_data = scrape_representation_content(page, bid_no)
                    update_representation_json(bid_no, rep_data)
                    print(f"  [SUCCESS] Representation saved.")
                    close_modal(page)

            except Exception as e:
                print(f"  [ERROR] Failed to process {bid_no}: {e}")
                continue

        print("\nAll bids processed. Browser closing.")
        browser.close()

        print("\nDone. Browser closing.")
        browser.close()

if __name__ == "__main__":
    main()
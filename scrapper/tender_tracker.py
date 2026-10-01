import os
import sys
import argparse
import time
import json
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from dotenv import load_dotenv

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

# Load environment variables from .env
load_dotenv()

# Configuration defaults
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "meril")
DB_NAME = os.getenv("DB_NAME", "tender_automation_with_ai")

PLAYWRIGHT_HEADLESS = os.getenv("PLAYWRIGHT_HEADLESS", "False").lower() in ("true", "1", "yes")
PLAYWRIGHT_SLOW_MO = int(os.getenv("PLAYWRIGHT_SLOW_MO", "1000"))
WAIT_TIME_AFTER_SEARCH = int(os.getenv("WAIT_TIME_AFTER_SEARCH", "5"))

def format_gem_datetime(dt_str):
    """
    Parses GeM date format "DD-MM-YYYY HH:MM:SS" and returns MySQL format "YYYY-MM-DD HH:MM:SS".
    """
    if not dt_str:
        return None
    try:
        dt = datetime.strptime(dt_str.strip(), "%d-%m-%Y %H:%M:%S")
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None

def parse_bid_details(text):
    """
    Parses the text from the View Bid Results popup and maps it to DB columns.
    Supports values on the same line or on the next line.
    """
    details = {}
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    current_section = None
    for idx, line in enumerate(lines):
        if "Buyer Details" in line:
            current_section = "buyer"
            continue
            
        if ":" in line:
            parts = line.split(":", 1)
            key = parts[0].strip()
            val = parts[1].strip()
            
            # If value is empty, look at the next line
            if not val and idx + 1 < len(lines):
                val = lines[idx + 1]
                
            key_clean = key.lower()
            if "bid status" in key_clean:
                details["bid_status"] = val
            elif "quantity" in key_clean:
                details["quantity"] = val
            elif "bid validity" in key_clean:
                details["bid_validity"] = val
            elif "bid start date" in key_clean:
                details["bid_start_date"] = format_gem_datetime(val)
            elif "bid end date" in key_clean:
                details["bid_end_date"] = format_gem_datetime(val)
            elif "bid opening date" in key_clean:
                details["bid_opening_date"] = format_gem_datetime(val)
            elif "name" in key_clean and current_section == "buyer":
                details["buyer_name"] = val
            elif "address" in key_clean and current_section == "buyer":
                details["buyer_address"] = val
            elif "ministry" in key_clean and current_section == "buyer":
                details["buyer_ministry"] = val
            elif "department" in key_clean and current_section == "buyer":
                details["buyer_department"] = val
            elif "organisation" in key_clean and current_section == "buyer":
                details["buyer_organisation"] = val
            elif "office" in key_clean and current_section == "buyer":
                details["buyer_office"] = val
    return details

def get_clean_text(el):
    """
    Safely extracts and strips text from a locator, falling back to text_content if inner_text is empty.
    """
    try:
        val = el.inner_text().strip()
        if not val:
            val = el.text_content().strip()
        return val
    except Exception:
        return ""

def extract_table_data(table_element):
    """
    Extracts rows and columns from a Playwright locator pointing to a table element.
    Returns a list of dictionaries.
    """
    rows_data = []
    headers = []
    
    # Extract headers from thead or the first tr
    thead = table_element.locator("thead")
    if thead.count() > 0:
        header_els = thead.locator("th").all()
        if not header_els:
            header_els = thead.locator("td").all()
        headers = [get_clean_text(el) for el in header_els]
    
    # If no thead, check the first row of tbody or table
    if not headers:
        first_row = table_element.locator("tr").first
        if first_row.count() > 0:
            header_els = first_row.locator("th").all()
            if not header_els:
                header_els = first_row.locator("td").all()
            headers = [get_clean_text(el) for el in header_els]
            
    # Iterate through all rows
    tr_elements = table_element.locator("tbody tr").all()
    if not tr_elements:
        tr_elements = table_element.locator("tr").all()
        # If we used the first row as header, skip it
        if tr_elements:
            tr_elements = tr_elements[1:]
            
    for tr in tr_elements:
        td_elements = tr.locator("td").all()
        if not td_elements:
            continue
        row_dict = {}
        for idx, td in enumerate(td_elements):
            col_name = headers[idx] if idx < len(headers) else f"column_{idx}"
            row_dict[col_name] = get_clean_text(td)
        if row_dict:
            rows_data.append(row_dict)
            
    return rows_data


def extract_table_data_bs(table_element):
    """
    Extracts rows and columns from a BeautifulSoup Table element.
    Returns a list of dictionaries.
    """
    rows_data = []
    headers = []
    
    # Find headers from thead or the first tr
    thead = table_element.find("thead")
    if thead:
        header_els = thead.find_all("th")
        if not header_els:
            header_els = thead.find_all("td")
        headers = [re.sub(r'\s+', ' ', el.get_text().strip()) for el in header_els]
        
    if not headers:
        first_row = table_element.find("tr")
        if first_row:
            header_els = first_row.find_all("th")
            if not header_els:
                header_els = first_row.find_all("td")
            headers = [re.sub(r'\s+', ' ', el.get_text().strip()) for el in header_els]
            
    tbody = table_element.find("tbody")
    tr_elements = tbody.find_all("tr") if tbody else table_element.find_all("tr")
    
    # If we used the first row as header, skip it
    if not thead and tr_elements:
        tr_elements = tr_elements[1:]
        
    for tr in tr_elements:
        td_elements = tr.find_all("td")
        if not td_elements:
            continue
        row_dict = {}
        for idx, td in enumerate(td_elements):
            col_name = headers[idx] if idx < len(headers) else f"column_{idx}"
            # Clean and collapse spaces inside cell text
            row_dict[col_name] = re.sub(r'\s+', ' ', td.get_text().strip())
        if row_dict:
            rows_data.append(row_dict)
            
    return rows_data


def scrape_bid_details_via_requests(full_url):
    """
    Fetches the bid result page HTML via requests and parses both details and evaluation tables.
    """
    print(f"[SCRAPER] Fetching details directly from: {full_url}")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        response = requests.get(full_url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"[ERROR] Failed to fetch page. HTTP Status Code: {response.status_code}")
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Parse basic details
        details = parse_bid_details(soup.get_text())
        
        # Look for both Technical and Financial tables
        tech_table = None
        fin_table = None
        
        for table in soup.find_all("table"):
            # Get header text of this table
            headers_els = table.find_all("th")
            if not headers_els:
                first_tr = table.find("tr")
                headers_els = first_tr.find_all("td") if first_tr else []
            headers_text = [re.sub(r'\s+', ' ', el.get_text().strip().lower()) for el in headers_els]
            
            # Check if it's an evaluation table (must have seller name / bidder name)
            is_eval = any("seller name" in h or "bidder" in h for h in headers_text)
            if not is_eval:
                continue
                
            # If unit price, total price, or rank are present, it is Financial
            is_financial = any("total price" in h or "rank" in h or "price" in h for h in headers_text)
            
            if is_financial:
                fin_table = table
            else:
                # If status or participated on is present, it is Technical
                is_technical = any("status" in h or "participated" in h or "emd" in h for h in headers_text)
                if is_technical or not fin_table: # fallback to technical if it's the only table
                    tech_table = table
                    
        if tech_table:
            try:
                table_data = extract_table_data_bs(tech_table)
                details["techincal_evaluvation"] = json.dumps(table_data)
                print(f"[SCRAPER] Successfully parsed Technical Evaluation table with {len(table_data)} rows.")
            except Exception as ex:
                print(f"[ERROR] Failed parsing technical evaluation table data: {ex}")
                
        if fin_table:
            try:
                table_data = extract_table_data_bs(fin_table)
                details["financial_evaluvation"] = json.dumps(table_data)
                print(f"[SCRAPER] Successfully parsed Financial Evaluation table with {len(table_data)} rows.")
            except Exception as ex:
                print(f"[ERROR] Failed parsing financial evaluation table data: {ex}")
                
        return details
    except Exception as e:
        print(f"[ERROR] Failed to scrape bid details via requests: {e}")
        return None


def fetch_gem_bids_from_db():
    """
    Connects to the database and fetches bids starting with GEM.
    """
    print(f"\n[DB] Connecting to MySQL database '{DB_NAME}' on {DB_HOST}:{DB_PORT}...")
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
    except Exception as e:
        print(f"[ERROR] Failed to connect to MySQL database: {e}")
        print("[TIP] You can test the script using mock data by running: python tracker.py --mock")
        sys.exit(1)

    cursor = conn.cursor(dictionary=True)

    query = "SELECT bid_number FROM tender_status_history WHERE bid_number LIKE 'GEM%'"
    print(f"[DB] Executing query: {query}")

    try:
        cursor.execute(query)
        rows = cursor.fetchall()
        print(f"[DB] Found {len(rows)} GEM bids in tender_status_history table.")
        return rows
    except Exception as e:
        print(f"[ERROR] Failed to execute query on tender_status_history table: {e}")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

def get_mock_bids():
    """
    Returns mock GEM bids for dry-runs and testing.
    """
    print("\n[MOCK] Running with MOCK data...")
    return [
        {
            "id": 1,
            "bid_number": "GEM/2026/B/1000001",
            "status": "proceed",
            "remarks": "Mock Bid 1"
        },
        {
            "id": 2,
            "bid_number": "GEM/2026/B/1000002",
            "status": "on-hold",
            "remarks": "Mock Bid 2"
        }
    ]

def update_tender_details_in_db(bid_number, details, is_mock=False):
    """
    Upserts the scraped details into the tender_tracker table.
    """
    if is_mock:
        print(f"[MOCK-DB] Simulating DB upsert for bid {bid_number} with details:")
        for k, v in details.items():
            if k == "techincal_evaluvation":
                print(f"  - {k}: [JSON data of length {len(v)}]")
            else:
                print(f"  - {k}: {v}")
        return

    if not details:
        print("[WARNING] No details parsed to save.")
        return

    print(f"[DB] Upserting bid {bid_number} with scraped details...")
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM `tender_tracker` WHERE `bid_number` = %s LIMIT 1", (bid_number,))
        existing = cursor.fetchone()

        if existing:
            fields = [f"`{key}` = %s" for key in details]
            values = list(details.values()) + [bid_number]
            query = f"UPDATE `tender_tracker` SET {', '.join(fields)} WHERE `bid_number` = %s"
        else:
            col_names = ', '.join([f'`{k}`' for k in details])
            placeholders = ', '.join(['%s'] * len(details))
            query = f"INSERT INTO `tender_tracker` (`bid_number`, {col_names}) VALUES (%s, {placeholders})"
            values = [bid_number] + list(details.values())

        cursor.execute(query, tuple(values))
        conn.commit()
        action = "Updated" if existing else "Inserted"
        print(f"[DB] {action} bid {bid_number} in tender_tracker.")
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"[ERROR] Failed to upsert bid {bid_number} in database: {e}")


def update_tender_status_in_db(bid_number, status_text, is_mock=False):
    """
    Upserts the status column of a tender in the tender_tracker table.
    """
    if is_mock:
        print(f"[MOCK-DB] Simulating status upsert for bid {bid_number}: status = '{status_text}'")
        return

    print(f"[DB] Upserting bid {bid_number} status to '{status_text}'...")
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM `tender_tracker` WHERE `bid_number` = %s LIMIT 1", (bid_number,))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("UPDATE `tender_tracker` SET `status` = %s WHERE `bid_number` = %s", (status_text, bid_number))
        else:
            cursor.execute("INSERT INTO `tender_tracker` (`bid_number`, `status`) VALUES (%s, %s)", (bid_number, status_text))

        conn.commit()
        action = "Updated" if existing else "Inserted"
        print(f"[DB] {action} status for bid {bid_number} in tender_tracker.")
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"[ERROR] Failed to upsert status for bid {bid_number}: {e}")


def find_table_in_frames(page_or_frame, is_financial=False):
    """
    Recursively searches for the evaluation table in the page/frame.
    If is_financial is True, it looks for Total Price/Rank. Otherwise, Status/Participated.
    """
    try:
        tables = page_or_frame.locator("table").all()
        for t in tables:
            try:
                # Retrieve all text nodes inside table (works even if element is hidden/transitioning!)
                text = t.text_content().lower()
                if "seller name" in text or "bidder" in text:
                    has_price = "total price" in text or "rank" in text or "price" in text
                    if is_financial and has_price:
                        return t
                    elif not is_financial and not has_price:
                        return t
            except Exception:
                continue
    except Exception:
        pass

    try:
        # Check child frames
        frames = page_or_frame.child_frames if hasattr(page_or_frame, "child_frames") else page_or_frame.frames
        for frame in frames:
            result = find_table_in_frames(frame, is_financial)
            if result:
                return result
    except Exception:
        pass

    return None


def wait_for_table_in_frames(page_or_frame, is_financial=False, timeout_ms=10000):
    """
    Waits for the evaluation table to become visible in the page or any of its child frames.
    """
    start_time = time.time()
    while (time.time() - start_time) < (timeout_ms / 1000.0):
        t = find_table_in_frames(page_or_frame, is_financial)
        if t:
            return t
        time.sleep(0.5)
    return None


def click_header_in_frames(page_or_frame, header_text):
    """
    Recursively searches for and clicks the header containing header_text in the page or child frames.
    """
    try:
        # Playwright's has-text matches substring case-insensitively and handles nested nodes cleanly!
        header_selectors = [
            f"a:has-text('{header_text}')",
            f"button:has-text('{header_text}')",
            f"h4:has-text('{header_text}')",
            f"div:has-text('{header_text}')",
            f"span:has-text('{header_text}')"
        ]
        for sel in header_selectors:
            elements = page_or_frame.locator(sel).all()
            for el in elements:
                try:
                    if el.is_visible():
                        print(f"[PLAYWRIGHT] Clicking '{header_text}' header using selector '{sel}'...")
                        el.click()
                        return True
                except Exception:
                    continue
    except Exception:
        pass

    try:
        frames = page_or_frame.child_frames if hasattr(page_or_frame, "child_frames") else page_or_frame.frames
        for frame in frames:
            if click_header_in_frames(frame, header_text):
                return True
    except Exception:
        pass

    return False

def process_bids_with_playwright(bids, is_mock=False):
    """
    Launches Playwright, navigates to GeM portal, searches each bid, clicks the results button, and extracts details.
    """
    if not bids:
        print("[PLAYWRIGHT] No bids to process. Exiting.")
        return
        
    print(f"\n[PLAYWRIGHT] Launching browser (Headless={PLAYWRIGHT_HEADLESS}, SlowMo={PLAYWRIGHT_SLOW_MO}ms)...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=PLAYWRIGHT_HEADLESS, slow_mo=PLAYWRIGHT_SLOW_MO)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        # Set a larger default timeout (30 seconds)
        page.set_default_timeout(30000)
        
        url = "https://bidplus.gem.gov.in/all-bids"
        
        for idx, bid in enumerate(bids):
            bid_number = bid['bid_number']
            print(f"\n--- [{idx + 1}/{len(bids)}] Processing Bid: {bid_number} ---")
            
            try:
                print(f"[PLAYWRIGHT] Navigating to: {url}")
                page.goto(url)
                
                # Wait for the check box to be present on the page
                print("[PLAYWRIGHT] Waiting for checkbox (#bidrastatus)...")
                checkbox_selector = "input#bidrastatus"
                page.wait_for_selector(checkbox_selector, state="visible")
                
                # Check if it's already checked (if not, click it)
                is_checked = page.locator(checkbox_selector).is_checked()
                if not is_checked:
                    print("[PLAYWRIGHT] Clicking the Bid/RA Status checkbox (#bidrastatus)...")
                    page.locator(checkbox_selector).click()
                else:
                    print("[PLAYWRIGHT] Checkbox (#bidrastatus) is already checked.")
                
                # Wait for the search input to be present and fill it
                print("[PLAYWRIGHT] Waiting for search input (#searchBid)...")
                search_input_selector = "input#searchBid"
                page.wait_for_selector(search_input_selector, state="visible")
                
                print(f"[PLAYWRIGHT] Typing bid number '{bid_number}' into search field...")
                page.locator(search_input_selector).fill(bid_number)
                
                # Click the search icon
                print("[PLAYWRIGHT] Clicking search icon (span.glyphicon-search)...")
                search_icon_selector = "span.glyphicon-search"
                page.wait_for_selector(search_icon_selector, state="visible")
                page.locator(search_icon_selector).first.click()
                
                # Sleep a moment to let results render
                time.sleep(2)
                
                # Scrape status first
                status_text = None
                if not is_mock:
                    print("[PLAYWRIGHT] Searching for status text on search results page...")
                    try:
                        # Try to locate the paragraph matching class pull-right containing "Status:"
                        status_para = page.locator('p.pull-right:has-text("Status:")').first
                        if status_para.count() > 0 and status_para.is_visible():
                            span_el = status_para.locator('span').first
                            if span_el.count() > 0:
                                status_text = span_el.inner_text().strip()
                            else:
                                # Fallback: split by colon
                                full_txt = status_para.inner_text()
                                if ":" in full_txt:
                                    status_text = full_txt.split(":", 1)[1].strip()
                        
                        # General fallback to look for "Status:" anywhere
                        if not status_text:
                            all_texts = page.locator('p:has-text("Status:")').all_inner_texts()
                            for txt in all_texts:
                                if "status:" in txt.lower():
                                    status_text = txt.split(":", 1)[1].strip()
                                    break
                    except Exception as ex:
                        print(f"[PLAYWRIGHT] Error extracting status: {ex}")
                        
                    if status_text:
                        update_tender_status_in_db(bid_number, status_text, is_mock=False)
                    else:
                        print("[PLAYWRIGHT] Could not locate status text on search page.")
                else:
                    # In mock mode, simulate status scraping
                    status_text = "Technical Evaluated" if bid_number.endswith("2") else "Not Evaluated"
                    update_tender_status_in_db(bid_number, status_text, is_mock=True)
                
                if is_mock:
                    # In mock mode, simulate opening a popup and extracting text details
                    print("[MOCK] Simulating popup load and extracting text details...")
                    popup_text = """
                    Bid Status: Active
                    Quantity: 750
                    Bid Validity (From End Date): 120 ( Days)
                    Bid Start Date / Time: 29-12-2025 16:58:31
                    Bid End Date / Time: 14-01-2026 11:00:00
                    Bid Opening Date / Time: 14-01-2026 11:30:00
                    Buyer Details
                    Name: Arun Kumar P
                    Address: Arun Kumar P,arbuyer9746@npcil.co.in,KKNPP, NPCIL, KUDANKULAM, RADHAPURAM TALUK, TIRUNELVELI DIST, TAMILNADU,Tirunelveli,TAMIL NADU,627106,India,04637-282358-
                    Ministry: Pmo
                    Department: Department Of Atomic Energy
                    Organisation: Nuclear Power Corporation Of India Limited
                    Office: Tamilnadu
                    """
                    details = parse_bid_details(popup_text)
                    
                    # Mock technical evaluation table
                    mock_table = [
                        {
                            "S.No.": "1",
                            "Seller Name": "CHEMNOVO SYNTHESIS PRIVATE LIMITED",
                            "Offered Item": "Make : CHemnovo--CHEMNOVO SYNTHESIS PRIVATE LIMITED\nModel : 1396F\nTitle : sulphuric acid in tankers",
                            "Participated On": "08-01-2026 15:12:39",
                            "EMD Status": "Registered with designated Agency / Authority",
                            "MSE/MII Status": "MII  MSE",
                            "Status": "Qualified"
                        },
                        {
                            "S.No.": "2",
                            "Seller Name": "CHEMOL SPECIALITIES PRIVATE LIMITED",
                            "Offered Item": "Make : NA\nModel : sulphuric acid\nTitle : sulphuric acid in tankers",
                            "Participated On": "13-01-2026 16:20:45",
                            "EMD Status": "Registered with designated Agency / Authority",
                            "MSE/MII Status": "MII  N/A",
                            "Status": "Disqualified"
                        }
                    ]
                    details["techincal_evaluvation"] = json.dumps(mock_table)
                    
                    # For mock bid ending in 2, simulate RA results and add financial evaluation
                    if bid_number.endswith("2"):
                        mock_fin_table = [
                            {
                                "S.No.": "1",
                                "Seller Name": "CHEMNOVO SYNTHESIS PRIVATE LIMITED",
                                "Offered Item": "sulphuric acid in tankers",
                                "Total Price": "`15907500.00",
                                "Rank": "L1"
                            },
                            {
                                "S.No.": "2",
                                "Seller Name": "Howrah Chemical Works",
                                "Offered Item": "sulphuric acid in tankers",
                                "Total Price": "`16200000.00",
                                "Rank": "L2"
                            }
                        ]
                        details["financial_evaluvation"] = json.dumps(mock_fin_table)
                    
                    update_tender_details_in_db(bid_number, details, is_mock=True)
                else:
                    # Case-insensitive search for buttons, inputs, or links (handles "View BID Results", "View Bid Results", etc.)
                    ra_btn = page.locator('input[value="View RA Results" i], button:has-text("View RA Results"), a:has-text("View RA Results")')
                    bid_btn = page.locator('input[value="View Bid Results" i], button:has-text("View Bid Results"), a:has-text("View Bid Results")')
                    
                    btn_to_click = None
                    is_ra = False
                    
                    # Find the first visible button, prioritizing RA Results
                    for i in range(ra_btn.count()):
                        el = ra_btn.nth(i)
                        if el.is_visible():
                            btn_to_click = el
                            is_ra = True
                            break
                            
                    if not btn_to_click:
                        for i in range(bid_btn.count()):
                            el = bid_btn.nth(i)
                            if el.is_visible():
                                btn_to_click = el
                                is_ra = False
                                break
                                
                    href = None
                    if btn_to_click:
                        # Check if the button itself has an href (is an <a> tag)
                        tag_name = btn_to_click.evaluate("el => el.tagName.toLowerCase()").strip()
                        if tag_name == "a":
                            href = btn_to_click.get_attribute("href")
                        else:
                            # Try to find nearest parent/ancestor <a> tag
                            try:
                                parent_a = btn_to_click.locator("xpath=ancestor::a[1]")
                                if parent_a.count() > 0:
                                    href = parent_a.first.get_attribute("href")
                            except Exception:
                                pass
                                
                        if not href:
                            href = btn_to_click.get_attribute("href")
                            
                    if href:
                        if href.startswith("/"):
                            full_url = f"https://bidplus.gem.gov.in{href}"
                        else:
                            full_url = href
                            
                        expected_key = "financial_evaluvation" if is_ra else "techincal_evaluvation"
                        print(f"[PLAYWRIGHT] Found detail URL: {full_url} (is_ra={is_ra}). Scraping via direct HTTP requests...")
                        details = scrape_bid_details_via_requests(full_url)
                        
                        # If requests scraper failed to get the expected evaluation table, fall back to Playwright
                        if not details or expected_key not in details:
                            print(f"[WARNING] Direct requests scraping did not yield the expected '{expected_key}'. Trying Playwright fallback...")
                            try:
                                page.goto(full_url)
                                page.wait_for_selector("body", state="visible")
                                body_text = page.locator("body").inner_text()
                                fallback_details = parse_bid_details(body_text)
                                
                                accordion_header = "Financial Evaluation" if is_ra else "Technical Evaluation"
                                print(f"[PLAYWRIGHT] Expanding '{accordion_header}' section...")
                                clicked = click_header_in_frames(page, accordion_header)
                                if not clicked:
                                    print("[PLAYWRIGHT] Fallback: Searching for chevron down icons in frames...")
                                    try:
                                        frames_to_check = [page] + page.frames
                                        for frame in frames_to_check:
                                            chevron = frame.locator(f"//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '{accordion_header.lower()}')]//span[contains(@class, 'chevron') or contains(@class, 'arrow') or contains(@class, 'down')]").first
                                            if chevron.count() > 0 and chevron.is_visible():
                                                chevron.click()
                                                clicked = True
                                                break
                                    except Exception as ex:
                                        print(f"[PLAYWRIGHT] Chevron click failed: {ex}")
                                        
                                eval_table = wait_for_table_in_frames(page, is_financial=is_ra, timeout_ms=10000)
                                if eval_table:
                                    table_data = extract_table_data(eval_table)
                                    fallback_details[expected_key] = json.dumps(table_data)
                                    
                                    # Try to get the other table as well if present on page
                                    other_key = "techincal_evaluvation" if is_ra else "financial_evaluvation"
                                    other_table = find_table_in_frames(page, is_financial=(not is_ra))
                                    if other_table:
                                        fallback_details[other_key] = json.dumps(extract_table_data(other_table))
                                        
                                    details = fallback_details
                                    print("[PLAYWRIGHT] Fallback succeeded. Extracted table via Playwright.")
                                else:
                                    print("[PLAYWRIGHT] Playwright fallback also failed to find a visible table.")
                            except Exception as ex:
                                print(f"[ERROR] Playwright fallback failed: {ex}")
                                
                        if details:
                            # Save details to database
                            update_tender_details_in_db(bid_number, details, is_mock=False)
                        else:
                            print(f"[ERROR] Failed to scrape details for bid {bid_number}.")
                    else:
                        print("[PLAYWRIGHT] Neither 'View RA Results' nor 'View Bid Results' link found for this bid.")
                
                print(f"[PLAYWRIGHT] Done with this step. Waiting {WAIT_TIME_AFTER_SEARCH} seconds...")
                time.sleep(WAIT_TIME_AFTER_SEARCH)
                
            except Exception as e:
                print(f"[ERROR] Failed during Playwright action for bid {bid_number}: {e}")
                
        print("\n[PLAYWRIGHT] Completed processing all bids. Closing browser.")
        browser.close()

def main():
    parser = argparse.ArgumentParser(description="Check GEM bids from MySQL tender_tracker and interact with GeM portal using Playwright.")
    parser.add_argument("--mock", "-m", action="store_true", help="Run with mock bid data instead of MySQL database.")
    args = parser.parse_args()
    
    print("=" * 60)
    print(" GeM Tender Tracker Automation - Playwright Script ")
    print("=" * 60)
    
    if args.mock:
        bids = get_mock_bids()
    else:
        bids = fetch_gem_bids_from_db()
        
    process_bids_with_playwright(bids, is_mock=args.mock)
    
    print("\n" + "=" * 60)
    print(" Script Execution Finished ")
    print("=" * 60)

if __name__ == "__main__":
    main()

import time
import os
import sys
import re
import csv
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import json

# ---------------- PATH FIX ----------------
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(BASE_DIR)

from solver.captcha_solver import ensemble_solve
from solver.captcha_solver import ensemble_solve
from service.otp_reader import fetch_latest_otp
from service.db_service import DBService
from datetime import datetime

# ---------------- CONFIG ----------------
URL = "https://sso.gem.gov.in/ARXSSO/oauth/doLogin"


# Get current month number (1-12)
current_month_number = datetime.now().month

# List of short month names
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Get current month name
current_month = months[current_month_number - 1]

LOGIN_ID = "stevejeraldjb"
PASSWORD = f"{current_month}@1234"

LOGS_DIR = os.path.join(BASE_DIR, "logs")
SUMMARY_SS_DIR = os.path.join(LOGS_DIR, "summarydata")
ORDERS_DATA_DIR = os.path.join(LOGS_DIR, "orders_and_payments_data")
SUMMARY_DATA_DIR = os.path.join(LOGS_DIR, "summary_data")
ORDERS_CHARTS_DIR = os.path.join(LOGS_DIR, "orders_and_payments_charts")
INCIDENTS_DATA_DIR = os.path.join(LOGS_DIR, "incidents_data")

os.makedirs(LOGS_DIR, exist_ok=True)
os.makedirs(SUMMARY_SS_DIR, exist_ok=True)
os.makedirs(ORDERS_DATA_DIR, exist_ok=True)
os.makedirs(ORDERS_CHARTS_DIR, exist_ok=True)
os.makedirs(INCIDENTS_DATA_DIR, exist_ok=True)

# ---------------- CLEAN OLD DATA ----------------
def clear_folder(folder_path):
    """
    Deletes all files inside a folder but keeps the folder.
    """
    if not os.path.exists(folder_path):
        return

    for file_name in os.listdir(folder_path):
        file_path = os.path.join(folder_path, file_name)
        try:
            if os.path.isfile(file_path):
                os.remove(file_path)
                print(f"🧹 Deleted: {file_path}")
        except Exception as e:
            print(f"❌ Failed to delete {file_path}: {e}")

# ---------------- CAPTCHA ----------------
def solve_captcha_until_success(page):
    while True:
        page.fill("#loginid", LOGIN_ID)

        img_bytes = page.locator("#captcha1").screenshot()
        img = Image.open(BytesIO(img_bytes))
        text, conf = ensemble_solve(img)
        print(f"🧠 CAPTCHA OCR: {text} (conf={conf})")

        if not text:
            page.reload()
            time.sleep(2)
            continue

        page.fill("#captcha_math", text)
        page.click("button[type='submit']")

        try:
            page.wait_for_selector("#password", timeout=3000)
            print("✅ CAPTCHA accepted")
            return
        except PlaywrightTimeoutError:
            print("❌ CAPTCHA failed")
            page.reload()
            time.sleep(2)

# ---------------- LOGIN ----------------
def perform_login(page):
    solve_captcha_until_success(page)
    page.fill("#password", PASSWORD)

    print("🖱️ Generating OTP...")
    page.evaluate("otpGeneration();")
    time.sleep(4)

    otp, _ = fetch_latest_otp()
    print(f"✅ OTP FOUND: {otp}")

    page.fill("#otp", otp)
    page.click("#finalSubmit")

# ---------------- POPUP HANDLER ----------------
def handle_popup_dialogs(page):
    """
    Automatically dismisses any popup dialogs that appear after login.
    Looks for the "Ok" button and clicks it to proceed.
    """
    try:
        # Wait briefly to see if popup appears
        page.wait_for_timeout(1500)
        
        # Check for the dialog OK button
        ok_button = page.locator('a.dialogBtnOk[data-item-id="dialogBtnOk"]')
        
        if ok_button.count() > 0 and ok_button.is_visible():
            print("🔔 Popup dialog detected, clicking OK...")
            ok_button.click()
            page.wait_for_timeout(1000)
            print("✅ Popup dismissed successfully")
            return True
        else:
            print("ℹ️ No popup detected, proceeding...")
            return False
            
    except Exception as e:
        print(f"⚠️ Error handling popup: {e}")
        return False

# ---------------- SCREENSHOT HELPERS ----------------
def screenshot_widget(page, selector, filename):
    locator = page.locator(selector)
    locator.scroll_into_view_if_needed()
    page.wait_for_timeout(1200)
    locator.screenshot(path=filename)
    print(f"📸 Saved → {filename}")

def screenshot_chart(page, selector, filename):
    try:
        locator = page.locator(selector)
        locator.scroll_into_view_if_needed()
        page.wait_for_timeout(1500)
        locator.screenshot(path=filename)
        print(f"📊 Chart saved → {filename}")
        return True
    except Exception as e:
        print(f"❌ Error saving chart: {e}")
        return False

# ---------------- SUMMARY DATA EXTRACTION ----------------
def extract_summary_data(page):
    """
    Extracts summary metrics from the GeM Seller Dashboard - Summary tab.
    """
    # 🕒 Wait for data to fully load (Dashboard widgets are heavy on lazy-loading)
    print("\n⏳ Waiting 25s for summary dashboard to fully populate...")
    
    # Aggressive scrolling to wake up lazy-loading scripts
    for i in range(4):
        page.evaluate(f"window.scrollTo(0, {200 * (i+1)})")
        page.wait_for_timeout(1500)
    page.evaluate("window.scrollTo(0, 0)")
    
    page.wait_for_timeout(19000) # Remaining time to reach ~25s
    
    print("\n📊 Extracting Summary Data...")
    summary_data = {}
    
    def get_rating_by_label(label_keywords, exact=False):
        """
        Specifically matches a rating h1 within the EXACT container of the label.
        Supports exact match to avoid mixing "Total" with "Total Orders".
        """
        try:
            for kw in label_keywords:
                # Choose between partial match (has-text) or exact match (text-is)
                match_type = 'text-is' if exact else 'has-text'
                
                container_selectors = [
                    f'div.rating_value:has(label:{match_type}("{kw}"))',
                    f'div.rating_value:has(p:{match_type}("{kw}"))',
                    f'div.value:has(label:{match_type}("{kw}"))',
                    f'div.value:has(p:{match_type}("{kw}"))',
                    f'div.buyer_services div.value:has(label:{match_type}("{kw}"))', # Products specific
                    f'div[class*="value"]:has(label:{match_type}("{kw}"))'
                ]
                
                for selector in container_selectors:
                    container = page.locator(selector).first
                    if container.count() > 0:
                        h1_locator = container.locator('h1')
                        if h1_locator.count() > 0:
                            val = h1_locator.first.inner_text().strip()
                            # Validation: digit, decimal, or currency suffixes (L, Cr, K)
                            if val and any(char.isdigit() for char in val):
                                return val
            return None
        except Exception as e:
            print(f"   ⚠️ Error in helper for {label_keywords}: {e}")
            return None

    try:
        # 1. Extract Final Rating
        rating = get_rating_by_label(["Final Rating"])
        summary_data['final_rating'] = rating if rating else "N/A"
        print(f"   ⭐ Final Rating: {summary_data['final_rating']}")

        # 2. Extract Delivery Rating
        delivery = get_rating_by_label(["Dlivery rating", "Delivery rating"])
        summary_data['delivery_rating'] = delivery if delivery else "N/A"
        print(f"   🚚 Delivery Rating: {summary_data['delivery_rating']}")

        # 3. Extract Reliability Rating
        reliability = get_rating_by_label(["Reliability Rating"])
        summary_data['reliability_rating'] = reliability if reliability else "N/A"
        print(f"   🤝 Reliability Rating: {summary_data['reliability_rating']}")

        # 4. Extract Quality Rating
        quality = get_rating_by_label(["Quality Rating"])
        summary_data['quality_rating'] = quality if quality else "N/A"
        print(f"   🏆 Quality Rating: {summary_data['quality_rating']}")

        # 5. Extract User's Feedback Rating
        feedback = get_rating_by_label(["User's Feedback Rating", "Feedback Rating"])
        summary_data['feedback_rating'] = feedback if feedback else "N/A"
        print(f"   💬 Feedback Rating: {summary_data['feedback_rating']}")

        # 6. Extract Buyer's Feedback Rating
        buyer_feedback = get_rating_by_label(["Buyer's Feedback Rating"])
        summary_data['buyer_feedback_rating'] = buyer_feedback if buyer_feedback else "N/A"
        print(f"   🛒 Buyer Feedback Rating: {summary_data['buyer_feedback_rating']}")

        # 7. Extract Total Orders
        total_orders = get_rating_by_label(["Total Orders"])
        summary_data['total_orders'] = total_orders if total_orders else "N/A"
        print(f"   📦 Total Orders: {summary_data['total_orders']}")

        # 8. Extract Pending Acceptance
        pending_acceptance = get_rating_by_label(["Pending Acceptance"])
        summary_data['pending_acceptance'] = pending_acceptance if pending_acceptance else "N/A"
        print(f"   ⏳ Pending Acceptance: {summary_data['pending_acceptance']}")

        # 9. Extract Pending Delivery
        pending_delivery = get_rating_by_label(["Pending Delivery"])
        summary_data['pending_delivery'] = pending_delivery if pending_delivery else "N/A"
        print(f"   🚚 Pending Delivery: {summary_data['pending_delivery']}")

        # 10. Extract Total Bids
        total_bids = get_rating_by_label(["Total Bids"])
        summary_data['total_bids'] = total_bids if total_bids else "N/A"
        print(f"   🔨 Total Bids: {summary_data['total_bids']}")

        # 11. Extract Bids Won
        bids_won = get_rating_by_label(["Bids Won"])
        summary_data['bids_won'] = bids_won if bids_won else "N/A"
        print(f"   🏆 Bids Won: {summary_data['bids_won']}")

        # 12. Extract Bids Lost
        bids_lost = get_rating_by_label(["Bids Lost"])
        summary_data['bids_lost'] = bids_lost if bids_lost else "N/A"
        print(f"   ❌ Bids Lost: {summary_data['bids_lost']}")

        # 13. Extract Total Incidents
        total_incidents = get_rating_by_label(["Total Incidents"])
        summary_data['total_incidents'] = total_incidents if total_incidents else "N/A"
        print(f"   🚩 Total Incidents: {summary_data['total_incidents']}")

        # 14. Extract Pending Response
        pending_response = get_rating_by_label(["Pending Response"])
        summary_data['pending_response'] = pending_response if pending_response else "N/A"
        print(f"   💬 Pending Response: {summary_data['pending_response']}")

        # 15. Extract Pending Resolution
        pending_resolution = get_rating_by_label(["Pending Resolution"])
        summary_data['pending_resolution'] = pending_resolution if pending_resolution else "N/A"
        print(f"   ⚖️ Pending Resolution: {summary_data['pending_resolution']}")

        # 16. Extract Total Products
        # ❗ Use EXACT match "Total" so it doesn't pick up "Total Orders" or "Total Bids"
        total_products = get_rating_by_label(["Total"], exact=True)
        summary_data['total_products'] = total_products if total_products else "N/A"
        print(f"   🛒 Total Products: {summary_data['total_products']}")

        # 17. Extract Published Products
        published = get_rating_by_label(["Published"])
        summary_data['published_products'] = published if published else "N/A"
        print(f"   📢 Published Products: {summary_data['published_products']}")

        # 18. Extract Pending Approval Products
        pending_app = get_rating_by_label(["Pending Approval"])
        summary_data['pending_approval_products'] = pending_app if pending_app else "N/A"
        print(f"   ⏳ Pending Approval Products: {summary_data['pending_approval_products']}")

        # 19. Extract Financial Metrics
        summary_data['total_charges'] = get_rating_by_label(["Total Charges"]) or "N/A"
        print(f"   💰 Total Charges: {summary_data['total_charges']}")

        summary_data['paid_amount'] = get_rating_by_label(["Paid"]) or "N/A"
        print(f"   💳 Paid Amount: {summary_data['paid_amount']}")

        summary_data['pending_amount'] = get_rating_by_label(["Pending"]) or "N/A"
        print(f"   🕒 Pending Amount: {summary_data['pending_amount']}")
            
    except Exception as e:
        print(f"   ❌ Error extracting summary data: {e}")
        summary_data['final_rating'] = summary_data.get('final_rating', "ERROR")
        summary_data['delivery_rating'] = "ERROR"
        
    return summary_data

# ---------------- ORDERS & PAYMENTS FULL EXTRACTION ----------------
def extract_orders_and_payments_data(page):
    """
    COMPLETE extraction of ALL orders and payments data.
    Extracts everything from the page as per your requirements.
    """
    data = {
        "total_order_value_and_volume": {},
        "order_statistics": [],
        "orders_awaiting_acceptance": {
            "title": "Orders Awaiting Acceptance",
            "data": []  # Will be empty if no table data
        },
        "buyer_org_wise_volume": [],
        "purchase_mode_wise_volume": [],
        "payment_statistics": []
    }

    print("\n📊 Extracting COMPLETE Orders & Payments Data...")
    
    # Wait for the main container to load
    try:
        page.wait_for_selector('div.ORDERS_AND_PAYMENTS_APP', timeout=15000)
        print("✅ Orders & Payments page loaded")
        
        # Scroll to ensure everything loads
        page.evaluate('window.scrollTo(0, 500)')
        page.wait_for_timeout(2000)
        
        # 1. Extract Total Order Value & Volume
        print("1️⃣ Extracting Total Order Value & Volume...")
        try:
            # Wait for the buyer_services container
            page.wait_for_selector('div.buyer_services', timeout=5000)
            
            # Order Value
            order_value_element = page.locator('div.buyer_services .products-right h1')
            order_value = order_value_element.inner_text().strip() if order_value_element.count() > 0 else "₹0"
            
            # Order Volume  
            order_volume_element = page.locator('div.buyer_services .services-left h1')
            order_volume = order_volume_element.inner_text().strip() if order_volume_element.count() > 0 else "0"
            
            data["total_order_value_and_volume"] = {
                "order_value": order_value,
                "order_volume": order_volume
            }
            print(f"   ✅ Order Value: {order_value}, Volume: {order_volume}")
        except Exception as e:
            print(f"   ⚠️ Error extracting order value/volume: {e}")

        # 2. Extract Order Statistics
        print("\n2️⃣ Extracting Order Statistics...")
        try:
            # Wait for the order statistics table
            page.wait_for_selector('#ORDERS_AND_PAYMENTS_APP1 table', timeout=5000)
            
            # Get all rows from the table
            rows = page.locator('#ORDERS_AND_PAYMENTS_APP1 tbody tr[data-grid-records]').all()
            
            for row in rows:
                try:
                    # Extract status
                    status_cell = row.locator('td[data-item-data^="STATUS"] span')
                    status = status_cell.inner_text().strip() if status_cell.count() > 0 else ""
                    
                    # Extract count
                    count_cell = row.locator('td[data-item-data^="COUNT"] a.Counthyperlink')
                    count_text = count_cell.inner_text().strip() if count_cell.count() > 0 else "0"
                    
                    # Convert to integer if possible
                    count = int(count_text) if count_text.isdigit() else count_text
                    
                    if status:
                        data["order_statistics"].append({
                            "status": status,
                            "count": count
                        })
                except Exception as e:
                    print(f"   ⚠️ Error extracting row: {e}")
                    continue
            
            print(f"   ✅ Extracted {len(data['order_statistics'])} order status records")
            
        except Exception as e:
            print(f"   ⚠️ Error extracting order statistics table: {e}")

        # 3. Extract Orders Awaiting Acceptance (header only - no table data in your HTML)
        print("\n3️⃣ Extracting Orders Awaiting Acceptance...")
        try:
            # Get the title from the widget
            title_element = page.locator('h3.panel-title.VIEW_ORDER_CTTPL_APP_portletTitle')
            if title_element.count() > 0:
                title = title_element.inner_text().strip()
                data["orders_awaiting_acceptance"]["title"] = title
                print(f"   ✅ Found: {title}")
            else:
                print("   ℹ️ No orders awaiting acceptance widget found")
        except Exception as e:
            print(f"   ⚠️ Error extracting orders awaiting acceptance: {e}")

        # 4. Extract Buyer Organization Wise Volume from chart legend
        print("\n4️⃣ Extracting Buyer Organization Wise Volume...")
        try:
            # Wait for the chart
            page.wait_for_selector('#ORG_WISE_TRANSACTIONS_VOLUME_VW_ORG_WISE_TRANSACTIONS_VOLUME_APP_CHART', timeout=5000)
            
            # Try to extract data from the SVG text elements
            chart_elements = page.locator('#ORG_WISE_TRANSACTIONS_VOLUME_VW_ORG_WISE_TRANSACTIONS_VOLUME_APP_CHART text').all()
            
            for element in chart_elements:
                try:
                    text = element.inner_text().strip()
                    if text and ',' in text:
                        parts = text.split(',')
                        if len(parts) == 2:
                            org = parts[0].strip()
                            count_text = parts[1].strip()
                            # Extract numbers from count
                            numbers = re.findall(r'\d+', count_text)
                            if numbers:
                                count = int(numbers[0])
                                data["buyer_org_wise_volume"].append({
                                    "organization": org,
                                    "count": count
                                })
                except:
                    continue
            
            # If no data from chart text, try to extract from legend
            if not data["buyer_org_wise_volume"]:
                legend_items = page.locator('#ORG_WISE_TRANSACTIONS_VOLUME_VW_ORG_WISE_TRANSACTIONS_VOLUME_APP_CHART text.fusioncharts-legenditem').all()
                for item in legend_items:
                    text = item.inner_text().strip()
                    if text:
                        # Legend items show only name, not count
                        data["buyer_org_wise_volume"].append({
                            "organization": text,
                            "count": 0  # Count not available in legend
                        })
            
            print(f"   ✅ Extracted {len(data['buyer_org_wise_volume'])} buyer organizations")
            
        except Exception as e:
            print(f"   ⚠️ Error extracting buyer organization data: {e}")

        # 5. Extract Purchase Mode Wise Volume from chart
        print("\n5️⃣ Extracting Purchase Mode Wise Volume...")
        try:
            # Wait for the chart
            page.wait_for_selector('#ORG_WISE_TRANSACTIONS_VALUE_VW_ORG_WISE_TRANSACTIONS_VALUE_APP_CHART', timeout=5000)
            
            # Try to extract the main text from the pie chart
            chart_text_elements = page.locator('#ORG_WISE_TRANSACTIONS_VALUE_VW_ORG_WISE_TRANSACTIONS_VALUE_APP_CHART text').all()
            
            for element in chart_text_elements:
                try:
                    text = element.inner_text().strip()
                    if text and ',' in text:
                        parts = text.split(',')
                        if len(parts) == 2:
                            mode = parts[0].strip()
                            count_text = parts[1].strip()
                            # Extract numbers from count
                            numbers = re.findall(r'\d+', count_text)
                            if numbers:
                                count = int(numbers[0])
                                data["purchase_mode_wise_volume"].append({
                                    "purchase_mode": mode,
                                    "count": count
                                })
                                break  # Usually only one main text in pie chart
                except:
                    continue
            
            print(f"   ✅ Extracted {len(data['purchase_mode_wise_volume'])} purchase modes")
            
        except Exception as e:
            print(f"   ⚠️ Error extracting purchase mode data: {e}")

        # 6. Extract Payment Statistics
        print("\n6️⃣ Extracting Payment Statistics...")
        try:
            # Wait for the payment table
            page.wait_for_selector('#ORDERS_AND_PAYMENTS_APP5 table', timeout=5000)
            
            # Get all rows from the payment table
            payment_rows = page.locator('#ORDERS_AND_PAYMENTS_APP5 tbody tr[data-grid-records]').all()
            
            for row in payment_rows:
                try:
                    # Extract status
                    status_cell = row.locator('td[data-item-data^="STATUS"] span')
                    status = status_cell.inner_text().strip() if status_cell.count() > 0 else ""
                    
                    # Extract count
                    count_cell = row.locator('td[data-item-data^="COUNT"] a.Counthyperlink')
                    count_text = count_cell.inner_text().strip() if count_cell.count() > 0 else "0"
                    
                    # Convert to integer if possible
                    count = int(count_text) if count_text.isdigit() else count_text
                    
                    if status:
                        data["payment_statistics"].append({
                            "status": status,
                            "count": count
                        })
                except Exception as e:
                    print(f"   ⚠️ Error extracting payment row: {e}")
                    continue
            
            print(f"   ✅ Extracted {len(data['payment_statistics'])} payment status records")
            
        except Exception as e:
            print(f"   ⚠️ Error extracting payment statistics table: {e}")

        print("\n✅ COMPLETE Orders & Payments data extraction finished!")

    except Exception as e:
        print(f"❌ ERROR in orders & payments extraction: {e}")
        import traceback
        traceback.print_exc()
    
    return data

def save_charts_as_images(page):
    """
    Save ALL chart images from Orders & Payments page.
    """
    charts = [
        ("#ORG_WISE_VAL_VOL_TREND_VW_ORG_WISE_VAL_VOL_TREND_APP_CHART", "order_value_volume_trend_chart.png"),
        ("#ORG_WISE_TRANSACTIONS_VOLUME_VW_ORG_WISE_TRANSACTIONS_VOLUME_APP_CHART", "buyer_org_wise_volume_chart.png"),
        ("#ORG_WISE_TRANSACTIONS_VALUE_VW_ORG_WISE_TRANSACTIONS_VALUE_APP_CHART", "purchase_mode_wise_volume_chart.png")
    ]
    
    print("\n📸 Saving ALL chart screenshots...")
    
    for selector, filename in charts:
        try:
            # Wait for chart to be visible
            page.wait_for_selector(selector, timeout=10000)
            page.wait_for_timeout(1000)
            
            # Scroll to chart
            chart_locator = page.locator(selector)
            chart_locator.scroll_into_view_if_needed()
            page.wait_for_timeout(1500)
            
            # Take screenshot
            chart_locator.screenshot(path=os.path.join(ORDERS_CHARTS_DIR, filename))
            print(f"   ✅ Saved: {filename}")
        except Exception as e:
            print(f"   ❌ Failed to save chart {filename}: {e}")

# ---------------- INCIDENTS DATA EXTRACTION ----------------
def extract_incidents_data(page):
    """
    Extracts incident counts from GeM Seller Dashboard - Incidents tab.
    Uses your previous successful approach with stabilization.
    """
    
    print("\n📊 Extracting Incidents Data...")
    
    # Wait for incidents page to load
    page.wait_for_selector('div.dceo-view', state='visible', timeout=30000)
    print("✅ Incidents page loaded")
    
    # Scroll to trigger lazy loading
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    page.wait_for_timeout(1000)
    page.evaluate('window.scrollTo(0, 0)')
    page.wait_for_timeout(1000)
    
    # Get all incident elements using YOUR approach
    incidents_data = {}
    
    # Map of IDs to clean labels
    id_to_label = {
        'SELLER_ALL_COUNT': 'All',
        'PENDING_SELLETR_COUNT': 'Pending',
        'INPROGRESS_SELLETR_COUNT': 'In-Progress',
        'ESCALATED_SELLER_COUNT': 'Escalated to GeM',
        'RECOMMEND_ACTION_SELLER_COUNT': 'Recommend Action',
        'RECOMMEND_CLOSE_SELLER_COUNT': 'Recommended Close',
        'SCN_SENT_COUNT': 'SCN Sent',
        'SCN_RESPONDED_SELLETR_COUNT': 'SCN Responded',
        'SCN_RESPONSE_AWAITED_SELLETR_COUNT': 'SCN Response Awaited',
        'SCN_NOT_RESPONDED_SELLETR_COUNT': 'SCN Not Responded',
        'FURTHER_CLARIFICATION_SELLER_COUNT': 'Further Clarification Sought',
        'PENDING_CLARIFIACTION_RESPONDED_SELLER_COUNT': 'Pending Clarification Responded',
        'PENDING_CLARIFIACTION_NOT_RESPONDED_SELLER_COUNT': 'Pending Clarification Not Responded',
        'PENDING_CLARIFIACTION_NOT_RESPONSE_AWAITED_SELLETR_COUNT': 'Pending Clarification Response Awaited',
        'RECTIFICATION_PENDING_SELLER_COUNT': 'Rectification Consent Pending',
        'MUTUAL_REQUEST_SELLER_COUNT': 'Mutual Resolution Pending Requests',
        'TOOK_ACTION_SELLER_COUNT': 'Took Action',
        'CLOSED_SELLER_COUNT': 'Closed',
        'REJECTED_SELLER_COUNT': 'Rejected'
    }
    
    # Stabilization logic - wait for counts to stop changing
    print("🔄 Waiting for incident counts to stabilize...")
    
    previous_counts = {}
    stable_checks = 0
    max_attempts = 10
    
    for attempt in range(max_attempts):
        current_counts = {}
        
        # Try different extraction methods
        for element_id, clean_label in id_to_label.items():
            try:
                # Method 1: Try to get by ID
                element = page.locator(f"#{element_id}")
                if element.count() > 0:
                    text = element.first.text_content().strip()
                    
                    # Extract number from text - handle various formats
                    numbers = re.findall(r'[\d,]+', text)
                    if numbers:
                        count = int(numbers[0].replace(',', ''))
                        current_counts[clean_label] = count
                        continue
                
                # Method 2: Try to find by label text in the container
                container = page.locator('div.dceo-view')
                matching_elements = container.locator(f":has-text('{clean_label}')").all()
                
                for elem in matching_elements:
                    text = elem.text_content().strip()
                    if clean_label.lower() in text.lower():
                        numbers = re.findall(r'[\d,]+', text)
                        if numbers:
                            count = int(numbers[0].replace(',', ''))
                            current_counts[clean_label] = count
                            break
                            
            except Exception as e:
                continue
        
        # Check if we got any data
        if current_counts:
            print(f"Attempt {attempt + 1}: Found {len(current_counts)} metrics")
            
            # Check stabilization
            if current_counts == previous_counts:
                stable_checks += 1
                print(f"✓ Stable {stable_checks}/3")
                if stable_checks >= 3:
                    print("✅ Counts stabilized")
                    incidents_data = current_counts
                    break
            else:
                stable_checks = 0
                previous_counts = current_counts.copy()
                print("⟳ Counts changed, waiting...")
        
        # Scroll a bit and wait
        page.evaluate('window.scrollBy(0, 300)')
        page.wait_for_timeout(2000)
    
    # Ensure all expected keys are present
    final_data = {}
    for label in id_to_label.values():
        final_data[label] = incidents_data.get(label, 0)
    
    print(f"✅ Extracted {len([v for v in final_data.values() if v > 0])} incident metrics")
    return final_data

# ---------------- NEW: EXTRACT DETAILED INCIDENT TABLE DATA ----------------
def extract_incident_table_data(page, category_name, page_number):
    """
    Extracts all data from the incident details table for a specific category and page.
    Returns a list of dictionaries containing incident details.
    """
    incidents = []
    
    try:
        # Wait for table to load completely
        page.wait_for_selector('table.ct-listview', timeout=30000)  # Increased from 15000
        page.wait_for_timeout(5000)  # Increased from 3000
        
        # Get all visible table rows
        rows = page.locator('table.ct-listview tbody tr[data-grid-records]').all()
        
        print(f"   📋 Found {len(rows)} incidents on page {page_number}")
        
        for row_index, row in enumerate(rows):
            try:
                incident_data = {}
                
                # Extract all columns
                # Severity
                severity_cell = row.locator('td[data-item-data^="ADMIN_SEVERITY"]')
                if severity_cell.count() > 0:
                    severity_span = severity_cell.locator('span.code')
                    incident_data['Severity'] = severity_span.inner_text().strip() if severity_span.count() > 0 else ""
                else:
                    incident_data['Severity'] = ""
                
                # Incident ID
                incident_id_cell = row.locator('td[data-item-data^="INCIDENT_ID"]')
                incident_data['Incident_ID'] = incident_id_cell.inner_text().strip() if incident_id_cell.count() > 0 else ""
                
                # Reason
                message_cell = row.locator('td[data-item-data^="MESSAGE"]')
                incident_data['Reason'] = message_cell.inner_text().strip() if message_cell.count() > 0 else ""
                
                # Product Category
                product_cat_cell = row.locator('td[data-item-data^="PRODUCT_CATEGORY_NAME"]')
                incident_data['Product_Category'] = product_cat_cell.inner_text().strip() if product_cat_cell.count() > 0 else ""
                
                # Status
                status_cell = row.locator('td[data-item-data^="STATUS"]')
                incident_data['Status'] = status_cell.inner_text().strip() if status_cell.count() > 0 else ""
                
                # Escalated Date
                escalated_date_cell = row.locator('td[data-item-data^="ESCALATED_DATE"]')
                incident_data['Escalated_Date'] = escalated_date_cell.inner_text().strip() if escalated_date_cell.count() > 0 else "--"
                
                # Incident Date
                incident_date_cell = row.locator('td[data-item-data^="INCIDENT_DATE"]')
                incident_data['Incident_Date'] = incident_date_cell.inner_text().strip() if incident_date_cell.count() > 0 else ""
                
                # SCN Sent Date
                scn_sent_cell = row.locator('td[data-item-data^="SCN_SENT_DATE"]')
                incident_data['SCN_Sent_Date'] = scn_sent_cell.inner_text().strip() if scn_sent_cell.count() > 0 else "--"
                
                # Raised Against
                raised_against_cell = row.locator('td[data-item-data^="RAISED_AGAINST_ROLE"]')
                incident_data['Raised_Against'] = raised_against_cell.inner_text().strip() if raised_against_cell.count() > 0 else ""
                
                # Organisation Name
                org_name_cell = row.locator('td[data-item-data^="ORGANIZATION_NAME"]')
                incident_data['Organisation_Name'] = org_name_cell.inner_text().strip() if org_name_cell.count() > 0 else "-"
                
                # Seller Organisation Name
                seller_org_cell = row.locator('td[data-item-data^="SELLER_ORGANIZATIONNAME"]')
                incident_data['Seller_Organisation_Name'] = seller_org_cell.inner_text().strip() if seller_org_cell.count() > 0 else ""
                
                # Product ID
                product_id_cell = row.locator('td[data-item-data^="PRODUCT_ID"]')
                incident_data['Product_ID'] = product_id_cell.inner_text().strip() if product_id_cell.count() > 0 else "--"
                
                # Incident For
                incident_for_cell = row.locator('td[data-item-data^="INCIDENT_FOR"]')
                incident_data['Incident_For'] = incident_for_cell.inner_text().strip() if incident_for_cell.count() > 0 else ""
                
                # SCN End Date
                scn_end_cell = row.locator('td[data-item-data^="SCN_END_DATE"]')
                incident_data['SCN_End_Date'] = scn_end_cell.inner_text().strip() if scn_end_cell.count() > 0 else "--"
                
                # Last Modified Role
                last_mod_role_cell = row.locator('td[data-item-data^="Last_Modified_Role"]')
                incident_data['Last_Modified_Role'] = last_mod_role_cell.inner_text().strip() if last_mod_role_cell.count() > 0 else ""
                
                # Last Modified Date
                last_mod_date_cell = row.locator('td[data-item-data^="LAST_MODIFIED_DATE"]')
                incident_data['Last_Modified_Date'] = last_mod_date_cell.inner_text().strip() if last_mod_date_cell.count() > 0 else ""
                
                # Maker Role
                maker_role_cell = row.locator('td[data-item-data^="MAKER_ROLE"]')
                incident_data['Maker_Role'] = maker_role_cell.inner_text().strip() if maker_role_cell.count() > 0 else "--"
                
                incidents.append(incident_data)
                
            except Exception as e:
                print(f"   ⚠️ Error extracting row {row_index}: {e}")
                continue
        
        return incidents
        
    except Exception as e:
        print(f"   ❌ Error extracting table data: {e}")
        return []

def save_incidents_to_csv(incidents, category_name, page_number):
    """
    Saves incident data to a CSV file.
    """
    if not incidents:
        print(f"   ⚠️ No incidents to save for {category_name} page {page_number}")
        return
    
    # Clean category name for filename
    clean_category = category_name.replace(' ', '_').replace('/', '_').replace('\\', '_')
    
    # Create filename
    filename = f"{clean_category}_page_{page_number}.csv"
    filepath = os.path.join(INCIDENTS_DATA_DIR, filename)
    
    try:
        # Get all fieldnames from first incident
        fieldnames = list(incidents[0].keys())
        
        with open(filepath, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(incidents)
        
        print(f"   💾 Saved {len(incidents)} incidents → {filename}")
        return filepath
        
    except Exception as e:
        print(f"   ❌ Failed to save CSV: {e}")
        return None

def click_and_extract_incident_details(page, element_id, category_name, count, incident_page_url, db_service):
    """
    Clicks on an incident category box and extracts all paginated table data.
    """
    if count <= 0:
        print(f"   ⏭️ Skipping {category_name} (count = {count})")
        return
    
    print(f"\n{'='*60}")
    print(f"🔍 Processing: {category_name} (Count: {count})")
    print(f"{'='*60}")
    
    try:
        # Get current URL for reference
        current_url = page.url
        print(f"   📍 Current URL: {current_url}")
        
        # Find and click the element
        clickable_element = page.locator(f"#{element_id}")
        
        if clickable_element.count() == 0:
            print(f"   ❌ Element not found: #{element_id}")
            return
        
        print(f"   ✅ Found element #{element_id}")
        
        # Scroll to element and click
        clickable_element.first.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)
        
        print(f"   🖱️ Clicking on {category_name}...")
        clickable_element.first.click()
        
        # Wait longer for table to load - increased for slow internet
        page.wait_for_timeout(8000)  # Increased from 5000
        
        # Check if we're still on the same page or if new content loaded
        try:
            # Wait for table to appear with longer timeout
            page.wait_for_selector('table.ct-listview', timeout=30000)  # Increased from 10000
            print(f"   ✅ Table loaded successfully")
            
            # Also wait for table rows
            page.wait_for_selector('table.ct-listview tbody tr[data-grid-records]', timeout=15000)  # Increased from 5000
            
            # Scroll to ensure all content is loaded
            page.evaluate('window.scrollTo(0, 500)')
            page.wait_for_timeout(1000)
            
            # Initialize page counter
            current_page = 1
            total_pages = 1
            all_incidents = []
            
            # First, check pagination info
            try:
                # Look for pagination info
                pagination_links = page.locator('ul.pagination li a[data-page]').all()
                if pagination_links:
                    last_page_link = page.locator('ul.pagination li a[data-page]').last
                    total_pages = int(last_page_link.get_attribute('data-page'))
                    print(f"   📖 Found {total_pages} total pages")
            except:
                print(f"   ℹ️ No pagination found or could not determine total pages")
            
            # Extract data from all pages
            while current_page <= total_pages:
                print(f"\n   📄 Extracting page {current_page}/{total_pages if total_pages > 1 else '?'}...")
                
                # Extract data from current page
                incidents = extract_incident_table_data(page, category_name, current_page)
                
                if incidents:
                    all_incidents.extend(incidents)
                    
                    # Save current page data to CSV
                    csv_file = save_incidents_to_csv(incidents, category_name, current_page)
                    
                    # Save current page data to MySQL
                    if db_service:
                        db_service.insert_incidents(incidents, category_name)
                    
                    # Check if there's a next page
                    if current_page < total_pages:
                        try:
                            # Find the "next" button
                            next_button = page.locator('a[data-paginate="next"]:not(.disabled)').first
                            if next_button.count() > 0:
                                print(f"   🔄 Moving to page {current_page + 1}...")
                                next_button.click()
                                page.wait_for_timeout(8000)  # Increased from 3000 for slow internet
                                
                                # Wait for table to reload
                                page.wait_for_selector('table.ct-listview', timeout=30000)  # Increased from 10000
                                page.wait_for_timeout(3000)  # Increased from 1000
                            else:
                                print(f"   ℹ️ No more pages available")
                                break
                        except Exception as e:
                            print(f"   ℹ️ Could not navigate to next page: {e}")
                            break
                
                current_page += 1
                
                # Safety check - don't loop forever
                if current_page > 20:
                    print(f"   ⚠️ Safety limit reached, stopping at page 20")
                    break
            
            # Save all incidents to a combined CSV
            if all_incidents:
                combined_filename = f"{category_name.replace(' ', '_')}_ALL_PAGES.csv"
                combined_filepath = os.path.join(INCIDENTS_DATA_DIR, combined_filename)
                
                fieldnames = list(all_incidents[0].keys())
                with open(combined_filepath, 'w', newline='', encoding='utf-8') as csvfile:
                    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(all_incidents)
                
                print(f"   💾 Saved ALL {len(all_incidents)} incidents to: {combined_filename}")
            
            print(f"\n   ✅ Completed extraction for {category_name}")
            
        except Exception as e:
            print(f"   ❌ Table did not load properly: {e}")
            print(f"   Current page content may have changed")
        
        # Instead of going back, navigate directly to incidents page
        print(f"\n   🔙 Navigating back to incidents page...")
        
        # Try different methods to get back to incidents
        try:
            # Method 1: Go back in history
            page.go_back()
            page.wait_for_timeout(3000)
        except:
            try:
                # Method 2: Navigate to the incidents URL we saved
                page.goto(incident_page_url)
                page.wait_for_timeout(3000)
            except:
                # Method 3: Try to click incidents tab again
                incidents_tab = page.locator("span.ct-tab__txtspan", has_text="Incidents").first
                if incidents_tab.count() > 0:
                    incidents_tab.click()
                    page.wait_for_timeout(3000)
        
        # Wait for incidents page to reload
        page.wait_for_selector('div.dceo-view', timeout=10000)
        page.wait_for_timeout(2000)
        
        # Handle popup that may appear after returning to incidents page
        print(f"   🔍 Checking for popup after navigation...")
        handle_popup_dialogs(page)
        
        print(f"   ✅ Successfully returned to incidents page")
        
    except Exception as e:
        print(f"   ❌ Error processing {category_name}: {e}")
        import traceback
        traceback.print_exc()

def process_all_incident_categories(page, incidents_data, db_service):
    """
    Processes all incident categories that have count > 0.
    """
    print("\n" + "="*60)
    print("🔄 PROCESSING INCIDENT CATEGORIES WITH COUNT > 0")
    print("="*60)
    
    # Save current URL before starting
    incident_page_url = page.url
    print(f"📌 Saved incidents page URL: {incident_page_url}")
    
    # Map of element IDs to clean names
    id_to_element = {
        'All': 'SELLER_ALL_COUNT',
        'Pending': 'PENDING_SELLETR_COUNT',
        'In-Progress': 'INPROGRESS_SELLETR_COUNT',
        'Escalated to GeM': 'ESCALATED_SELLER_COUNT',
        'Recommend Action': 'RECOMMEND_ACTION_SELLER_COUNT',
        'Recommended Close': 'RECOMMEND_CLOSE_SELLER_COUNT',
        'SCN Sent': 'SCN_SENT_COUNT',
        'SCN Responded': 'SCN_RESPONDED_SELLETR_COUNT',
        'SCN Response Awaited': 'SCN_RESPONSE_AWAITED_SELLETR_COUNT',
        'SCN Not Responded': 'SCN_NOT_RESPONDED_SELLETR_COUNT',
        'Further Clarification Sought': 'FURTHER_CLARIFICATION_SELLER_COUNT',
        'Pending Clarification Responded': 'PENDING_CLARIFIACTION_RESPONDED_SELLER_COUNT',
        'Pending Clarification Not Responded': 'PENDING_CLARIFIACTION_NOT_RESPONDED_SELLER_COUNT',
        'Pending Clarification Response Awaited': 'PENDING_CLARIFIACTION_NOT_RESPONSE_AWAITED_SELLETR_COUNT',
        'Rectification Consent Pending': 'RECTIFICATION_PENDING_SELLER_COUNT',
        'Mutual Resolution Pending Requests': 'MUTUAL_REQUEST_SELLER_COUNT',
        'Took Action': 'TOOK_ACTION_SELLER_COUNT',
        'Closed': 'CLOSED_SELLER_COUNT',
        'Rejected': 'REJECTED_SELLER_COUNT'
    }
    
    # Process each category that has count > 0
    categories_processed = 0
    for category_name, element_id in id_to_element.items():
        count = incidents_data.get(category_name, 0)
        
        if count > 0:
            click_and_extract_incident_details(page, element_id, category_name, count, incident_page_url, db_service)
            categories_processed += 1
            
            # Wait longer between categories
            page.wait_for_timeout(3000)
            
            # Verify we're still on incidents page
            try:
                page.wait_for_selector('div.dceo-view', timeout=5000)
            except:
                print(f"   ⚠️ Not on incidents page, trying to navigate back...")
                incidents_tab = page.locator("span.ct-tab__txtspan", has_text="Incidents").first
                if incidents_tab.count() > 0:
                    incidents_tab.click()
                    page.wait_for_timeout(3000)
                    # Handle popup after clicking incidents tab
                    handle_popup_dialogs(page)
    
    print(f"\n✅ Processed {categories_processed} incident categories")

def save_data_to_json(data, filename, data_dir):
    """Save data to JSON file in specified directory."""
    filepath = os.path.join(data_dir, filename)
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"💾 Data saved → {filepath}")
    except Exception as e:
        print(f"❌ Failed to save data to {filepath}: {e}")

# ---------------- MAIN ----------------
def main():
    # ℹ️ Data persistence enabled - skipping local folder clearing
    print("\n📦 Ensuring log directories exist...")
    os.makedirs(ORDERS_DATA_DIR, exist_ok=True)
    os.makedirs(SUMMARY_DATA_DIR, exist_ok=True)
    os.makedirs(ORDERS_CHARTS_DIR, exist_ok=True)
    os.makedirs(INCIDENTS_DATA_DIR, exist_ok=True)

    # Initialize Database Service
    try:
        db_service = DBService()
        db_service.create_all_tables()
        db_service.clear_old_data()  # Optional: clear DB data for fresh run
        print("✅ Database initialized and tables ready.")
    except Exception as e:
        print(f"⚠️ Failed to initialize Database: {e}")
        db_service = None

    print("✅ System initialized. Starting run with data persistence...\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        page.goto(URL)
        page.wait_for_selector("#loginid")

        while True:
            perform_login(page)
            try:
                page.wait_for_selector("#loginid", timeout=4000)
                print("❌ OTP failed, retrying")
                page.reload()
            except PlaywrightTimeoutError:
                # Double check if we are actually on dashboard by looking for an element
                try:
                    # Wait for Summary tab or some dashboard element
                    print("⌛ Waiting for Dashboard...")
                    page.wait_for_selector("span.ct-tab__txtspan", timeout=15000)
                    print("🎉 LOGIN SUCCESSFUL & DASHBOARD LOADED")
                    break
                except:
                    print("⚠️ Login verification failed, checking if still on login page...")
                    if page.locator("#loginid").count() > 0:
                        print("❌ Still on login page, retrying...")
                        page.reload()
                        continue
                    else:
                         print("❓ Unknown state, hoping for the best...")
                         break

        page.wait_for_timeout(2000)
        
        # Handle any popup dialogs that appear after login
        print("\n🔍 Checking for popup dialogs...")
        handle_popup_dialogs(page)
        
        # Explicit wait for "Summary" tab
        print("🔍 Looking for 'Summary' tab...")
        summary_tab = page.locator("span.ct-tab__txtspan", has_text="Summary").first
        summary_tab.wait_for(state="visible", timeout=30000)
        summary_tab.click()
        page.wait_for_timeout(3000)

        # Extract summary data from DOM
        summary_data = extract_summary_data(page)
        
        # Save summary data to JSON
        save_data_to_json(summary_data, "summary_dash_data.json", SUMMARY_DATA_DIR)

        # Store summary data to DB
        if db_service:
            db_service.store_summary_data(summary_data)

        # ========== PHASE 1: ORDERS & PAYMENTS ==========
        print("\n" + "="*60)
        print("PHASE 1: ORDERS & PAYMENTS EXTRACTION")
        print("="*60)
        
        try:
            # Click on Orders and Payments tab
            orders_tab = page.locator("a.childApp_NEW_TAB_LAYOUT_MULTI_APP_tabAnchorClass span.ct-tab__txtspan", has_text="Orders and Payments").first
            orders_tab.click()
            page.wait_for_timeout(5000)
            print("✅ Navigated to Orders and Payments tab")
            
            # Wait for data to load completely
            page.wait_for_selector('div.ORDERS_AND_PAYMENTS_APP', timeout=15000)
            page.wait_for_timeout(3000)
            
            # Scroll to load all content
            page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            page.wait_for_timeout(2000)
            page.evaluate('window.scrollTo(0, 0)')
            page.wait_for_timeout(1000)
            
            # Extract ALL orders and payments data
            orders_data = extract_orders_and_payments_data(page)
            
            # Save data to JSON
            save_data_to_json(orders_data, "orders_and_payments_data.json", ORDERS_DATA_DIR)

            # Store Orders & Payments Data to DB
            if db_service:
                db_service.store_orders_payments_data(orders_data)
            
            # Save ALL chart screenshots
            save_charts_as_images(page)

            # Store Chart Images to DB
            if db_service:
                db_service.store_orders_charts(ORDERS_CHARTS_DIR)
            
            print("\n✅ PHASE 1 COMPLETE: Orders & Payments data extracted and saved!")
            
        except Exception as e:
            print(f"❌ Failed in Orders & Payments phase: {e}")
            import traceback
            traceback.print_exc()

        # ========== PHASE 2: INCIDENTS ==========
        print("\n" + "="*60)
        print("PHASE 2: INCIDENTS EXTRACTION")
        print("="*60)
        
        try:
            # Click on Incidents tab
            incidents_tab = page.locator("span.ct-tab__txtspan", has_text="Incidents").first
            incidents_tab.click()
            page.wait_for_timeout(5000)
            print("✅ Navigated to Incidents tab")
            
            # Wait for incidents page to load completely
            page.wait_for_selector('div.dceo-view', timeout=15000)
            page.wait_for_timeout(2000)
            
            # Extract incidents summary data
            incidents_data = extract_incidents_data(page)
            
            # Save incidents summary data to JSON
            save_data_to_json(incidents_data, "incidents_data.json", INCIDENTS_DATA_DIR)
            
            print("\n✅ PHASE 2A COMPLETE: Incidents summary data extracted and saved!")
            
            # ========== PHASE 2B: DETAILED INCIDENT EXTRACTION ==========
            print("\n" + "="*60)
            print("PHASE 2B: DETAILED INCIDENT TABLE EXTRACTION")
            print("="*60)
            
            # Process all categories with count > 0
            process_all_incident_categories(page, incidents_data, db_service)
            
            print("\n✅ PHASE 2B COMPLETE: All incident details extracted and saved!")
            
        except Exception as e:
            print(f"❌ Failed in Incidents phase: {e}")
            import traceback
            traceback.print_exc()

        print("\n" + "="*60)
        print("SCRIPT EXECUTION COMPLETE!")
        print("="*60)
        print(f"📁 Data saved in: {LOGS_DIR}")
        print(f"   - Summary screenshots: {SUMMARY_SS_DIR}")
        print(f"   - Orders & Payments JSON: {ORDERS_DATA_DIR}")
        print(f"   - Orders & Payments charts: {ORDERS_CHARTS_DIR}")
        print(f"   - Incidents JSON & CSV files: {INCIDENTS_DATA_DIR}")

        time.sleep(3)
        browser.close()

if __name__ == "__main__":
    main() 

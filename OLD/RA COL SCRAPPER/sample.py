import csv
import json
import re
import time
from playwright.sync_api import sync_playwright
from config import BASE_URL, HEADLESS
from utils import save_json, save_csv, insert_to_db

class BOQScrapper:

    def __init__(self):
        self.results = []

    def extract_modal_data(self, page):
        """
        Waits for modal, extracts data based on GeM patterns (wells or tables).
        """
        try:
            # Wait for modal to be visible
            modal = page.wait_for_selector("div.modal:visible", state="visible", timeout=6000)
            if not modal:
                return None
                
            page.wait_for_timeout(1000)
            
            title = ""
            header_el = modal.query_selector(".modal-header, .modal-title, h4")
            if header_el:
                title = header_el.inner_text().strip()
                
            content_data = []
            
            if "Corrigendum" in title or "View(s)" in title:
                wells = modal.query_selector_all("div.well")
                if wells:
                    for w in wells:
                        cols = w.query_selector_all("div.col-block")
                        full_text = []
                        for c in cols:
                            txt = c.inner_text().strip()
                            txt = " ".join(txt.split()) 
                            if txt:
                                full_text.append(txt)
                        if full_text:
                            content_data.append({"change": " | ".join(full_text)})
            
            if not content_data:
                tables = modal.query_selector_all("table")
                for tbl in tables:
                    rows = tbl.query_selector_all("tr")
                    for r in rows:
                        cols = r.query_selector_all("td, th")
                        txts = [c.inner_text().strip() for c in cols]
                        if not txts: continue
                        if len(txts) == 2:
                            content_data.append({"label": txts[0], "value": txts[1]})
                        elif len(txts) == 3:
                            content_data.append({"field": txts[0], "old": txts[1], "new": txts[2]})
                        else:
                            content_data.append({"row": txts})
            
            close_btn = modal.query_selector("button.close, button[data-dismiss='modal'], .modal-footer button.btn-default")
            if close_btn:
                close_btn.click()
            else:
                page.keyboard.press("Escape")
                
            page.wait_for_selector("div.modal:visible", state="hidden", timeout=4000)
            
            return json.dumps({"title": title, "data": content_data}, ensure_ascii=False)

        except Exception as e:
            print(f"      ⚠️ Modal extraction error: {e}")
            try: page.keyboard.press("Escape")
            except: pass
            return None

    def start_browser(self):
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(headless=HEADLESS, slow_mo=500)
        context = browser.new_context()
        page = context.new_page()
        return playwright, browser, page

    def scrape_boq(self):
        playwright, browser, page = self.start_browser()

        try:
            # Load categories from CSV
            categories = []
            try:
                with open("data/categories.csv", "r") as f:
                    categories = [line.strip() for line in f if line.strip()]
            except FileNotFoundError:
                print("Error: data/categories.csv not found.")
                return self.results

            print(f"Opening {BASE_URL}...")
            page.goto(BASE_URL)
            page.wait_for_timeout(3000)

            # Navigate to 'List of Bids'
            print("Navigating to List of Bids...")
            page.goto("https://bidplus.gem.gov.in/bidlists")
            page.wait_for_timeout(3000)

            # Navigate to 'Advance Search'
            print("Navigating to Advance Search...")
            page.goto("https://bidplus.gem.gov.in/advance-search")
            page.wait_for_timeout(3000)

            for category in categories:
                print(f"\n--- Processing Category: {category} ---")
                
                # Click on 'Search by BOQ Title' tab
                print("Clicking 'Search by BOQ Title' tab...")
                page.click("a#boq-tab")
                page.wait_for_timeout(3000)

                # Open BOQ Title dropdown
                print(f"Opening BOQ Title dropdown for '{category}'...")
                page.click("span.select2-selection[aria-labelledby*='select2-boqtitle_con']")
                page.wait_for_timeout(3000)

                # Type category into the search field
                print(f"Typing '{category}' into the search field...")
                search_field_selector = "input.select2-search__field"
                page.wait_for_selector(search_field_selector)
                page.type(search_field_selector, category)

                # Wait for search results to load in dropdown
                print("Waiting 3 seconds for search results in dropdown...")
                page.wait_for_timeout(3000)

                # Click the perfectly matched category from the dropdown
                try:
                    print(f"Selecting the perfectly matched category for '{category}'...")
                    
                    # Target all available options in the dropdown
                    options_selector = "li.select2-results__option"
                    page.wait_for_selector(options_selector)
                    options = page.query_selector_all(options_selector)
                    
                    found_match = False
                    for option in options:
                        option_text = option.inner_text().strip()
                        # Case-insensitive comparison for "perfect match"
                        if option_text.upper() == category.strip().upper():
                            print(f"Found exact match: '{option_text}'. Clicking it...")
                            option.click()
                            found_match = True
                            break
                    
                    if not found_match:
                        print(f"No perfect match found for '{category}' in the dropdown. Skipping...")
                        continue
                        
                except Exception as e:
                    print(f"Error while selecting category '{category}': {e}")
                    continue

                # Click the Search button
                print("Clicking the Search button...")
                search_button_selector = "a#searchByBid[onclick*='boq']"
                page.wait_for_selector(search_button_selector)
                page.click(search_button_selector)

                # Pagination Loop
                page_number = 1
                while True:
                    print(f"--- Scraping Page {page_number} for Category: {category} ---")
                    
                    # Wait for results to load
                    print("Waiting 5 seconds for results to load...")
                    page.wait_for_timeout(5000)

                    # Scrape results
                    print(f"Scraping results for '{category}' (Page {page_number})...")
                    tender_blocks = page.query_selector_all("div.card")
                    
                    if not tender_blocks:
                        # Check for "No data found" alert
                        no_data_alert = page.query_selector("div#bidCard div.alert-danger")
                        if no_data_alert:
                            alert_text = no_data_alert.inner_text().strip()
                            if "No data found" in alert_text:
                                print(f"Alert: '{alert_text}' for category '{category}'. Skipping...")
                                break

                        print(f"No results found for category: {category}")
                        # Try fallback
                        tender_blocks = page.query_selector_all(".col-md-12.border")

                    if not tender_blocks:
                        break

                    category_results_count = 0
                    for block in tender_blocks:
                        bid_link = block.query_selector("a.bid_no_hover")
                        if not bid_link:
                            continue
                        bid_no = bid_link.inner_text().strip()
                        
                        href = bid_link.get_attribute("href")
                        bid_url = f"https://bidplus.gem.gov.in{href}" if href and href.startswith("/") else href

                        items_link = block.query_selector("a[data-content]")
                        items = items_link.get_attribute("data-content") if items_link else ""
                        
                        quantity = ""
                        qty_row = block.query_selector("div.row:has-text('Quantity:')")
                        if qty_row:
                            qty_text = qty_row.inner_text()
                            match = re.search(r'Quantity:\s*([\d,]+)', qty_text)
                            if match:
                                quantity = match.group(1).replace(",", "")
                        
                        department = ""
                        dept_container = block.query_selector("div.col-md-5")
                        if dept_container:
                            rows = dept_container.query_selector_all("div.row")
                            if len(rows) > 1:
                                department = rows[1].inner_text().strip().replace("\n", " | ")

                        start_date = ""
                        end_date = ""
                        start_span = block.query_selector("span.start_date")
                        end_span = block.query_selector("span.end_date")
                        if start_span:
                            start_date = start_span.inner_text().strip()
                        if end_span:
                            end_date = end_span.inner_text().strip()

                        # --- Corrigendum & Representation Extraction ---
                        corr_json = "N/A"
                        rep_json = "N/A"
                        try:
                            toggle = block.query_selector("a:has-text('View Corrigendum/Representation')")
                            if toggle:
                                toggle.click(force=True)
                                page.wait_for_timeout(1500)

                                # Try Representation
                                rep_trig = block.query_selector("a:has-text('View Representation'), span:has-text('View Representation')")
                                if rep_trig:
                                    oc = rep_trig.get_attribute("onclick")
                                    if oc: page.evaluate(oc)
                                    else: rep_trig.click()
                                    rep_json = self.extract_modal_data(page) or "N/A"

                                # Try Corrigendum
                                corr_trig = block.query_selector("span[data-bid]:has-text('View Corrigendum')")
                                if corr_trig:
                                    bid_id = corr_trig.get_attribute("data-bid")
                                    if bid_id:
                                        page.evaluate(f"view_corrigendum_modal('{bid_id}')")
                                        corr_json = self.extract_modal_data(page) or "N/A"
                        except Exception as e:
                            print(f"      ⚠️ Error extracting modals: {e}")

                        result_data = {
                            "category_searched": category,
                            "bid_no": bid_no,
                            "bid_url": bid_url,
                            "items": items,
                            "quantity": quantity,
                            "department": department,
                            "start_date": start_date,
                            "end_date": end_date,
                            "corrigendum_json": corr_json,
                            "representation_json": rep_json
                        }
                        self.results.append(result_data)
                        
                        # Instant and Simultaneous Database Insertion
                        insert_to_db(result_data)
                        
                        category_results_count += 1

                    print(f"Finished '{category}' Page {page_number}. Found {category_results_count} results.")

                    # Handle Pagination
                    next_button = page.query_selector("a.next:not(.current), span.next:not(.current), li.next a")
                    if next_button:
                        print("Clicking Next page...")
                        try:
                            next_button.click()
                            page_number += 1
                            page.wait_for_timeout(2000)
                        except:
                            break
                    else:
                        break

            # Save all consolidated results to CSV
            if self.results:
                save_csv(self.results, "data/boq_rowdata.csv")
                print(f"Successfully saved {len(self.results)} total results to data/boq_rowdata.csv")
            else:
                print("No results found across any categories.")

            # Execution Finished
            print("\nScraping Task Completed.")


        finally:
            browser.close()
            playwright.stop()

        return self.results
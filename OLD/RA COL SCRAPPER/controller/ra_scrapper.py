from playwright.sync_api import sync_playwright
import csv
import multiprocessing
import math


import mysql.connector

def get_db_connection():
    return mysql.connector.connect(
        host='localhost',
        user='root',
        password='meril',
        database='tender_automation_with_ai'
    )

def fetch_pending_bids():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        # We use STR_TO_DATE to handle typical DD-MM-YYYY format
        # Filter for perfect_cat = 1 OR (perfect_cat = 0 AND bid in tender_processing_results with result='yes')
        query = """
            SELECT bid_number 
            FROM gem_tenders 
            WHERE STR_TO_DATE(end_date, '%d-%m-%Y %h:%i %p') < CURDATE() 
              AND (ra_no IS NULL OR ra_no = '')
              AND (perfect_cat = 1 OR (perfect_cat = 0 AND bid_number IN (
                  SELECT bid_no FROM tender_processing_results WHERE result = 'yes'
              )))
        """
        cursor.execute(query)
        records = cursor.fetchall()
        
        bids = [row['bid_number'] for row in records]
        cursor.close()
        conn.close()
        return bids
    except Exception as e:
        print(f"Database fetch error: {e}")
        return []

def update_bid_ra(bid_number, ra_no, ra_url):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "UPDATE gem_tenders SET ra_no = %s, ra_url = %s WHERE bid_number = %s"
        cursor.execute(query, (ra_no, ra_url, bid_number))
        conn.commit()
        cursor.close()
        conn.close()
        print(f"✅ Successfully updated RA details for {bid_number} in database")
    except Exception as e:
        print(f"❌ Database update error for {bid_number}: {e}")

def process_bid_chunk(bid_chunk, worker_id):
    """Worker function to process a chunk of bids"""
    csv_filename = f"ra_rowdata_worker_{worker_id}.csv"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        # Open GeM website
        print(f"[Worker {worker_id}] Opening GeM website...")
        page.goto("https://gem.gov.in")
        page.wait_for_timeout(3000)

        # Navigate to 'List of Bids'
        print(f"[Worker {worker_id}] Navigating to List of Bids...")
        page.goto("https://bidplus.gem.gov.in/bidlists")
        page.wait_for_timeout(3000)

        # Apply Bid/RA Status filter
        print(f"[Worker {worker_id}] Applying 'Bid/RA Status' filter...")
        page.locator("input#bidrastatus").click()
        page.wait_for_timeout(3000)

        # Write headers to CSV
        with open(csv_filename, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['bid_number', 'ra_no', 'ra_url'])

        # Process each bid in the chunk
        for bid in bid_chunk:
            print(f"[Worker {worker_id}] --- Processing Bid: {bid} ---")
            
            try:
                # Type the bid number into the search box
                print(f"[Worker {worker_id}] Typing bid number: {bid}...")
                page.fill("input#searchBid", bid)
                
                # Click the Search button
                print(f"[Worker {worker_id}] Clicking search icon...")
                page.locator("button#searchBidRA").click()
                
                # Wait for search results to load
                print(f"[Worker {worker_id}] Waiting for search results...")
                page.wait_for_timeout(4000)
                
                # Extract the RA number and URL from the resulting card
                ra_element = page.locator("p.bid_no:has(span:has-text('RA NO')) a")
                
                if ra_element.count() > 0:
                    ra_no = ra_element.inner_text().strip()
                    href = ra_element.get_attribute("href")
                    ra_url = f"https://bidplus.gem.gov.in{href}" if href and href.startswith("/") else href
                    
                    print(f"[Worker {worker_id}] Found RA No: {ra_no}")
                    print(f"[Worker {worker_id}] Found RA URL: {ra_url}")
                    
                    # Save to CSV
                    with open(csv_filename, mode='a', newline='', encoding='utf-8') as f:
                        writer = csv.writer(f)
                        writer.writerow([bid, ra_no, ra_url])
                        
                    # Update the DB
                    update_bid_ra(bid, ra_no, ra_url)
                else:
                    print(f"[Worker {worker_id}] No RA details found on the card for bid {bid}.")
                
            except Exception as e:
                print(f"[Worker {worker_id}] Error scraping bid {bid}: {e}")
                continue

        browser.close()
        print(f"[Worker {worker_id}] Completed processing {len(bid_chunk)} bids")
        return csv_filename

def scrape_ra():
    bids_to_process = fetch_pending_bids()
    print(f"\n=> Found {len(bids_to_process)} bids to process for RA scraping from DB.\n")
    
    if not bids_to_process:
        print("No bids to process.")
        return
    
    # Number of workers
    num_workers = 5
    
    # Split bids into chunks
    chunk_size = math.ceil(len(bids_to_process) / num_workers)
    bid_chunks = [bids_to_process[i:i + chunk_size] for i in range(0, len(bids_to_process), chunk_size)]
    
    print(f"Splitting {len(bids_to_process)} bids into {len(bid_chunks)} chunks for {num_workers} workers.")
    
    # Create and start worker processes
    with multiprocessing.Pool(processes=num_workers) as pool:
        # Create arguments for each worker
        args = [(chunk, i) for i, chunk in enumerate(bid_chunks)]
        
        # Map the worker function to the chunks
        results = pool.starmap(process_bid_chunk, args)
    
    print(f"\n=> All workers completed. CSV files generated: {results}")
    
    # Merge all CSV files into one
    merged_filename = "ra_rowdata.csv"
    with open(merged_filename, mode='w', newline='', encoding='utf-8') as merged_file:
        writer = csv.writer(merged_file)
        writer.writerow(['bid_number', 'ra_no', 'ra_url'])
        
        for csv_file in results:
            try:
                with open(csv_file, mode='r', encoding='utf-8') as f:
                    reader = csv.reader(f)
                    next(reader)  # Skip header
                    for row in reader:
                        writer.writerow(row)
            except Exception as e:
                print(f"Error merging {csv_file}: {e}")
    
    print(f"\n=> Merged CSV saved to {merged_filename}")
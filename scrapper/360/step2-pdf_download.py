import os
import re
import mysql.connector
import requests
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv
import time

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(BASE_DIR, "PDF")
os.makedirs(PDF_DIR, exist_ok=True)

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}


def safe_name(text):
    return re.sub(r"[^A-Za-z0-9_-]", "_", text)


def db_connect():
    return mysql.connector.connect(**DB_CONFIG)


def fetch_one_tender():
    conn = db_connect()
    try:
        cur = conn.cursor(dictionary=True)
        # dept = '360' filter added for the 360 Division pipeline — the
        # original (unfiltered) version of this query lives in
        # TenderSystem/NewSystem/step2-pdf_download.py and would otherwise
        # compete with the Endo/Diagno pipeline for the same unprocessed-
        # tender queue.
        #
        # relevancy_check IS NULL (not just t.bid_no IS NULL) — see the
        # matching comment in relevency_processor.py: the scrapers
        # stub-insert (bid_no, tender_title, result='yes') into
        # tender_processing_results the moment their own relevancy filter
        # says "relevant", well before this pipeline's real Step 4-6 GPT
        # evaluation runs. relevancy_check is only ever set by this
        # pipeline's save_to_db(), so it's the correct "actually processed"
        # signal.
        query = """
            SELECT g.bid_number, g.detail_url
            FROM gem_tenders g
            LEFT JOIN tender_processing_results t
                ON g.bid_number = t.bid_no
            WHERE (t.bid_no IS NULL OR t.relevancy_check IS NULL)
              AND g.dept = '360'
            LIMIT 1
        """
        cur.execute(query)
        row = cur.fetchone()
        cur.close()
        return row
    except Exception as e:
        print(f" DB Fetch error: {e}")
        return None
    finally:
        conn.close()


def fetch_tender_by_bid(bid_number):
    """Fetch a specific tender by bid number — used for --bid: targeted mode."""
    conn = db_connect()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT bid_number, detail_url FROM gem_tenders WHERE bid_number = %s LIMIT 1",
            (bid_number,),
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            print(f" Bid '{bid_number}' not found in gem_tenders.")
        return row
    except Exception as e:
        print(f" DB Fetch error: {e}")
        return None
    finally:
        conn.close()


def fetch_tender_by_bid(bid_number):
    """Fetch a specific tender from DB by its bid number."""
    conn = db_connect()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT bid_number, detail_url FROM gem_tenders WHERE bid_number = %s LIMIT 1",
            (bid_number,),
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            print(f" Bid '{bid_number}' not found in gem_tenders.")
        return row
    except Exception as e:
        print(f" DB Fetch error: {e}")
        return None
    finally:
        conn.close()


def fetch_tender_by_bid(bid_number):
    """Fetch a specific tender from DB by its bid number (used for --bid: targeted mode)."""
    conn = db_connect()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT bid_number, detail_url FROM gem_tenders WHERE bid_number = %s LIMIT 1",
            (bid_number,),
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            print(f" Bid '{bid_number}' not found in gem_tenders.")
        return row
    except Exception as e:
        print(f" DB Fetch error: {e}")
        return None
    finally:
        conn.close()


def fetch_tender_by_bid(bid_number):
    """Fetch a specific tender from DB by its bid number (used for --bid: targeted mode)."""
    conn = db_connect()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT bid_number, detail_url FROM gem_tenders WHERE bid_number = %s LIMIT 1",
            (bid_number,),
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            print(f" Bid '{bid_number}' not found in gem_tenders.")
        return row
    except Exception as e:
        print(f" DB Fetch error: {e}")
        return None
    finally:
        conn.close()


def download_pdf_via_browser(detail_url, bid_number):
    safe_bid = safe_name(bid_number)
    pdf_path = os.path.join(PDF_DIR, f"{safe_bid}.pdf")

    if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 1000:
        print(f" PDF already exists locally — skipping download")
        return pdf_path

    pdf_bytes = None

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            accept_downloads=True,
        )
        page = context.new_page()

        pdf_response_data = {}

        def handle_response(response):
            try:
                ct = response.headers.get("content-type", "")
                if "pdf" in ct or response.url.endswith(".pdf"):
                    print(f" Intercepted PDF response: {response.url}")
                    pdf_response_data["url"] = response.url
                    pdf_response_data["bytes"] = response.body()
            except Exception:
                pass

        page.on("response", handle_response)

        print(f" Opening page: {detail_url}")
        try:
            page.goto(detail_url, timeout=30000, wait_until="domcontentloaded")
        except Exception as e:
            print(f" Initial load warning: {e}")

        print(" Waiting 6 seconds for page to fully load...")
        time.sleep(6)

        if pdf_response_data.get("bytes"):
            print(" PDF captured via response interception")
            pdf_bytes = pdf_response_data["bytes"]

        if not pdf_bytes:
            print(" Looking for PDF link on page...")
            links = page.query_selector_all("a")
            pdf_href = None
            for link in links:
                href = link.get_attribute("href") or ""
                if ".pdf" in href.lower():
                    if href.startswith("/"):
                        href = "https://bidplus.gem.gov.in" + href
                    pdf_href = href
                    break

            if pdf_href:
                print(f" Found PDF link: {pdf_href} — downloading via browser session...")
                pdf_response = page.request.get(pdf_href)
                if pdf_response.ok:
                    pdf_bytes = pdf_response.body()
                    print(" PDF downloaded via browser session request")

        if not pdf_bytes:
            print(" Reloading page and retrying...")
            try:
                page.reload(timeout=30000, wait_until="domcontentloaded")
            except Exception:
                pass
            time.sleep(5)

            if pdf_response_data.get("bytes"):
                print(" PDF captured after reload")
                pdf_bytes = pdf_response_data["bytes"]

        if not pdf_bytes:
            print(" Trying direct request with browser cookies/session...")
            try:
                resp = page.request.get(detail_url)
                if resp.ok:
                    ct = resp.headers.get("content-type", "")
                    if "pdf" in ct:
                        pdf_bytes = resp.body()
                        print(" PDF fetched via session request")
            except Exception as e:
                print(f" Session request failed: {e}")

        browser.close()

    if pdf_bytes and len(pdf_bytes) > 1000:
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
        print(f" PDF saved: {pdf_path} ({len(pdf_bytes):,} bytes)")
        return pdf_path
    else:
        print(" Could not capture PDF bytes from any strategy.")
        return None


def main():
    print(" Fetching one pending tender...")
    tender = fetch_one_tender()

    if not tender:
        print(" No pending tender found.")
        return

    bid = tender["bid_number"]
    detail_url = tender["detail_url"]
    print(f" Bid Number : {bid}")
    print(f" Detail URL : {detail_url}")

    print(f"\n Attempting PDF download via browser...")
    pdf_path = download_pdf_via_browser(detail_url, bid)

    if not pdf_path:
        print(" PDF download failed across all strategies.")
        return

    print(f"\n Done! PDF ready at: {pdf_path}")


if __name__ == "__main__":
    main()
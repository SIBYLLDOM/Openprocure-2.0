import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from playwright.sync_api import sync_playwright
from db import fetch_tenders_to_download, update_tender_items, update_bid_value, update_emd_amount
from pdf_parser import extract_pdf_data, save_to_json

# Configuration
BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
PDF_DIR        = os.path.join(BASE_DIR, "PDF")
JSON_DIR       = os.path.join(BASE_DIR, "JSON")
DOWNLOAD_TIMEOUT = 60000   # 60 s
NUM_WORKERS    = 8

_print_lock = threading.Lock()

def log(msg):
    with _print_lock:
        print(msg, flush=True)

def ensure_dirs():
    for d in [PDF_DIR, JSON_DIR]:
        os.makedirs(d, exist_ok=True)

def process_single_tender(tender, idx, total):
    """Download, parse and DB-update one tender. Each call owns its own browser."""
    bid_number = tender.get('bid_number')
    url        = tender.get('detail_url')
    cat_label  = 'Perfect' if tender.get('perfect_cat') == 1 else 'Open'

    if not url or not bid_number:
        log(f"[{idx}/{total}] Skipping invalid entry: {tender}")
        return False

    safe_bid   = bid_number.replace("/", "_").replace("\\", "_")
    file_path  = os.path.join(PDF_DIR, f"{safe_bid}.pdf")
    json_path  = os.path.join(JSON_DIR, f"{safe_bid}.json")

    if os.path.exists(file_path):
        log(f"[{idx}/{total}] Already exists, skipping: {bid_number}")
        return False

    log(f"[{idx}/{total}] [{cat_label}] Starting: {bid_number}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            accept_downloads=True,
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )
        page = context.new_page()

        try:
            with page.expect_download(timeout=DOWNLOAD_TIMEOUT) as dl_info:
                try:
                    page.goto(url, wait_until="commit")
                except Exception as e:
                    if "Download is starting" not in str(e):
                        raise

            dl_info.value.save_as(file_path)
            log(f"[{idx}/{total}] Downloaded: {safe_bid}.pdf")

            pdf_data = extract_pdf_data(file_path)
            if pdf_data:
                save_to_json(pdf_data, json_path)

                bid_details = pdf_data.get("bid_details", {})

                items_text = bid_details.get("Item Category")
                if items_text:
                    update_tender_items(bid_number, items_text)

                bid_value = bid_details.get("Estimated Bid Value")
                update_bid_value(bid_number, bid_value)

                emd_amount = bid_details.get("EMD Amount")
                if emd_amount:
                    update_emd_amount(bid_number, emd_amount)

                log(f"[{idx}/{total}] DB updated: {bid_number}")

                for path in (file_path, json_path):
                    try:
                        if os.path.exists(path):
                            os.remove(path)
                    except Exception as rm_err:
                        log(f"[{idx}/{total}] Cleanup error: {rm_err}")

            return True

        except Exception as e:
            log(f"[{idx}/{total}] ERROR {bid_number}: {e}")
            return False
        finally:
            browser.close()


def run_downloader():
    ensure_dirs()

    tenders = fetch_tenders_to_download()
    if not tenders:
        print("No tenders found to download.")
        return

    total   = len(tenders)
    perfect = sum(1 for t in tenders if t.get('perfect_cat') == 1)
    open_   = total - perfect
    print(f"Queue: {total} tenders  ({perfect} Perfect → {open_} Open)  |  Workers: {NUM_WORKERS}")
    print("─" * 60)

    done = failed = skipped = 0

    with ThreadPoolExecutor(max_workers=NUM_WORKERS) as pool:
        futures = {
            pool.submit(process_single_tender, tender, idx, total): tender
            for idx, tender in enumerate(tenders, 1)
        }

        for future in as_completed(futures):
            tender = futures[future]
            try:
                result = future.result()
                if result is True:
                    done += 1
                else:
                    skipped += 1
            except Exception as exc:
                log(f"Worker raised for {tender.get('bid_number')}: {exc}")
                failed += 1

    print("─" * 60)
    print(f"Finished — Downloaded: {done}  |  Skipped: {skipped}  |  Failed: {failed}")


if __name__ == "__main__":
    run_downloader()

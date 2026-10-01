"""
gujarat_single_tender_scraper.py
=================================
nProcure (Gujarat) eProcurement Portal — Single Tender ID Lookup Scraper
https://tender.nprocure.com/

Reuses all filtering / detail-scraping / document-downloading logic from
gujarat_scraper.py (same DB, same Meril Endo/Diagno relevance filter, same
two-pass "Doubt" confirmation) but instead of paging through the full
listing, it searches for ONE specific Tender ID via the site's own search box.

Flow:
  1. Open site, wait for page load
  2. Type the given Tender ID into <input id="tenderNo"> (digits only)
  3. Click <input id="searchButtonId"> ("Search")
  4. Wait for the results table to refresh
       - If it shows "No data available in table" -> print TENDER NOT FOUND, stop
       - Otherwise -> the single matching row is scraped
  5. PASS 1 — Ollama filter on title only (Yes / Doubt / No)
       - "No"    -> print NOT RELEVANT, stop (nothing opened/downloaded/saved)
       - "Yes"   -> open details tab, download documents
       - "Doubt" -> open details tab, list documents, PASS 2 confirmation
                     with details text + doc names -> final Yes/No
  6. Print the full result to the terminal. If relevant: download every
     document, upsert into MySQL (open_tender_details) so it shows up on the
     portal at /Admin/tenders -> "Open" tender type -> matching dept tab.

Usage:
    python gujarat_single_tender_scraper.py 332980
    python gujarat_single_tender_scraper.py            # will prompt for the ID
"""

import json
import sys
import time

# Windows consoles often default to a legacy codepage (cp1252) that can't
# encode characters like non-breaking hyphens or arrows that show up in
# scraped tender text/LLM output. A crash here happens mid-print, AFTER the
# relevance decision but BEFORE the DB save — silently losing a confirmed
# result. Force UTF-8 with a safe fallback so printing never aborts the run.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from playwright.sync_api import sync_playwright

import gujarat_scraper as gs

SINGLE_OUTPUT_FILE = "row_data_gujarat_single_search.csv"


def search_tender(page, tender_id: str) -> bool:
    """Types tender_id into the TENDERNO field, clicks Search, waits for the
    results table to refresh. Returns True if a matching row was found,
    False if the portal reports 'No data available in table'."""
    input_field = page.locator("input#tenderNo")
    input_field.wait_for(state="visible", timeout=15000)
    input_field.click()
    input_field.fill("")
    input_field.type(str(tender_id), delay=80)

    gs.log(f"[SEARCH] Searching Tender ID: {tender_id}")
    page.click("input#searchButtonId")

    try:
        page.wait_for_selector("#DataTables_Table_0_processing", state="visible", timeout=3000)
        page.wait_for_selector("#DataTables_Table_0_processing", state="hidden", timeout=15000)
    except Exception:
        time.sleep(3)

    empty = page.locator("td.dataTables_empty", has_text="No data available in table")
    if empty.count() > 0:
        return False
    return True


def print_result(listing_data: dict, status: str, reason: str, dept, documents: list):
    downloaded = [d["local_path"] for d in documents if d.get("local_path")]
    print("\n" + "=" * 78)
    if status == "proceed_futher":
        print("RELEVANT TENDER — SAVED TO DB")
    else:
        print("TENDER FOUND BUT NOT RELEVANT — NOT SAVED")
    print("=" * 78)
    print(f"  Tender Notice No   : {listing_data['tender_refno']}")
    print(f"  Tender Id          : {listing_data['tender_id']}")
    print(f"  Name Of Work       : {listing_data['tender_title']}")
    print(f"  Organisation       : {listing_data['organisation_name']}")
    print(f"  Estimated Value    : {listing_data['estimated_value']}")
    print(f"  Bid Closure Date   : {listing_data['bid_closure_date']}")
    print(f"  Dept (LLM)         : {dept}")
    print(f"  Filter Reason      : {reason}")
    if status == "proceed_futher":
        print(f"  Documents Saved ({len(downloaded)}):")
        for p in downloaded:
            print(f"      - {p}")
        print("\n  Check it on the portal at: /Admin/tenders -> 'Open' tender type -> "
              f"{(dept or 'Unknown')} tab")
    print("=" * 78 + "\n")


def run_single(playwright, tender_id: str):
    gs.init_csv(SINGLE_OUTPUT_FILE)
    conn = None
    try:
        conn = gs.get_db_connection()
        gs.log("MySQL connected.")
    except Exception as e:
        gs.log(f"[DB ERROR] {e} — CSV only")

    browser = playwright.chromium.launch(headless=False, args=gs.BROWSER_ARGS)
    context = browser.new_context(
        viewport={"width": 1280, "height": 900},
        locale="en-US",
        ignore_https_errors=True,
        java_script_enabled=True,
        accept_downloads=True,
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
    )
    page = context.new_page()
    page.set_default_timeout(60000)

    def handle_dialog(dialog):
        gs.log(f"[Dialog] {dialog.type!r}: {dialog.message[:120]!r}")
        dialog.accept()

    page.on("dialog", handle_dialog)

    try:
        gs.log("[STEP 1] Opening site: " + gs.BASE_URL)
        page.goto(gs.BASE_URL, timeout=60000, wait_until="domcontentloaded")

        gs.log("[STEP 2] Waiting for page load...")
        time.sleep(3)

        gs.log("[STEP 3] Searching for Tender ID...")
        found = search_tender(page, tender_id)

        if not found:
            print("\n" + "=" * 78)
            print(f"TENDER NOT FOUND — No data available for Tender ID: {tender_id}")
            print("=" * 78 + "\n")
            gs.log(f"[RESULT] Tender ID {tender_id} not found on the portal.")
            return

        page.wait_for_selector("table tbody tr", timeout=25000)
        row = page.locator("table tbody tr").first
        listing_data = gs.parse_listing_row(row)

        if not listing_data.get("tender_id"):
            print(f"\n[WARN] Row found but could not parse tender data for Tender ID: {tender_id}\n")
            return

        title = listing_data["tender_title"]
        gs.log(f"[STEP 4] Found tender: {title[:80]}")

        # PASS 1: title-only filter
        f_status, f_reason, dept_tag, decision = gs.filter_tender(title)

        if f_status == "no":
            print_result(listing_data, f_status, f_reason, dept_tag, [])
            gs.log(f"[RESULT] Tender ID {tender_id} is NOT relevant. {f_reason}")
            return

        need_confirmation = (decision == "Doubt")
        gs.log(f"[STEP 5] Opening details tab (title verdict: {decision}"
               f"{', confirming with details+documents...' if need_confirmation else ''})")

        result = gs.process_tender_details(
            context, row, listing_data,
            need_confirmation, f_reason, dept_tag,
        )
        f_status = result["final_status"]
        f_reason = result["reason"]
        dept_tag = result["dept"]
        documents = result["documents"]

        print_result(listing_data, f_status, f_reason, dept_tag, documents)

        if f_status == "no":
            gs.log(f"[RESULT] Tender ID {tender_id} confirmed NOT relevant after detail check.")
            return

        combined = result["structured_details"]
        gs.append_csv(SINGLE_OUTPUT_FILE, [[
            1, listing_data["tender_id"], listing_data["tender_refno"],
            listing_data["organisation_name"], title,
            listing_data["estimated_value"], listing_data["bid_closure_date"],
            "; ".join(d["document_name"] for d in documents),
            dept_tag or "", f_status, f_reason,
        ]])

        if conn:
            file_link_json, downloaded_documents_json = gs.build_documents_json(documents)
            record = {
                "state":                gs.STATE_NAME,
                "organisation_name":    listing_data["organisation_name"],
                "closing_date":         gs.format_closing_date_for_db(listing_data["bid_closure_date"]),
                "tender_title":         title,
                "tender_refno":         gs.make_db_refno(listing_data["tender_refno"], listing_data["tender_id"]),
                "tender_id":            listing_data["tender_id"],
                "organisation_chain":   listing_data["organisation_name"],
                "tender_details":       json.dumps(combined, ensure_ascii=False),
                "structured_details":   combined,
                "file_link":            file_link_json,
                "downloaded_documents": downloaded_documents_json,
                "relevency_checker":    f_status,
                "relevancy_reason":     f_reason,
                "suggested_product":    None,
                "dept":                 (dept_tag or "Unknown").lower(),
            }
            gs.upsert_tender(conn, record)
            gs.log(f"[DB] Upserted Tender ID {tender_id} into open_tender_details "
                   f"with {len(documents)} document(s).")

        gs.log(f"[DONE] Tender ID {tender_id} processed.")

    except Exception as e:
        gs.log(f"[ERROR] {str(e)[:200]}")

    finally:
        gs.log("[INFO] Browser will remain open. Press Enter to close...")
        try:
            input()
        except EOFError:
            pass

        if conn:
            try:
                conn.close()
            except Exception:
                pass

        try:
            context.close()
            browser.close()
        except Exception:
            pass


def main():
    if len(sys.argv) > 1:
        tender_id = sys.argv[1].strip()
    else:
        tender_id = input("Enter Tender ID to search: ").strip()

    if not tender_id.isdigit():
        print("[ERROR] Tender ID must be numeric.")
        sys.exit(1)

    with sync_playwright() as playwright:
        run_single(playwright, tender_id)


if __name__ == "__main__":
    main()

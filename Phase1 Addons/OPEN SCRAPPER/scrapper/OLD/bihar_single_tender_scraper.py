"""
bihar_single_tender_scraper.py
================================
Bihar e-Procurement Portal (EPSV2Web) — Single Tender ID Lookup Scraper
https://eproc2.bihar.gov.in/EPSV2Web/openarea/tenderListingPage.action#latestTenders

Reuses all filtering / detail-scraping / document-downloading logic from
bihar_scraper.py (same DB, same Meril Endo/Diagno relevance filter, same
two-pass "Doubt" confirmation, same modal-based preview handling) but
instead of paging through the full listing, it searches for ONE specific
Tender ID via the site's own live filter box.

Flow:
  1. Open site, wait for page load
  2. Type the given Tender ID into the filter box
     (<input ng-model="tenderFilter">, placeholder "Type any keyword")
  3. Click the search button (<button class="submit_nil">)
  4. Wait for the table to refresh
       - If it shows "No record found" -> print TENDER NOT FOUND, stop
       - Otherwise -> the matching row is scraped (first result)
  5. PASS 1 — Ollama filter on the tender description (Yes / Doubt / No)
       - "No"    -> print NOT RELEVANT, stop (nothing opened/downloaded/saved)
       - "Yes"   -> open preview modal, download documents
       - "Doubt" -> open preview modal, download documents, PASS 2
                     confirmation with details text + document content
  6. Print the full result to the terminal. If relevant: keep the
     downloaded documents, upsert into MySQL (open_tender_details) so it
     shows up on the portal at /Admin/tenders -> "Open" tender type ->
     matching dept tab.

Usage:
    python bihar_single_tender_scraper.py 137010
    python bihar_single_tender_scraper.py            # will prompt for the ID
"""

import json
import sys
import time

from playwright.sync_api import sync_playwright

import bihar_scraper as bs

SINGLE_OUTPUT_FILE = "row_data_bihar_single_search.csv"


def search_tender(page, tender_id: str) -> bool:
    """Types tender_id into the live filter box, clicks the search button,
    waits for the table to refresh. Returns True if a matching row was
    found, False if the Latest Tenders table itself reports 'No record
    found' (checking row td.frelips count directly, since the OTHER tabs —
    Cancelled/Corrigendum/Upcoming/Past — always show their own 'No record
    found' text regardless of what Latest Tenders finds, which previously
    caused this to report NOT FOUND even when the search worked)."""
    # There are 2 elements matching this ng-model (likely a responsive
    # desktop/mobile duplicate) — only one is actually visible/interactable
    # at a time, so target that one explicitly instead of `.first`, which
    # can resolve to the hidden copy and hang waiting for it to appear.
    search_input = page.locator("input[ng-model='tenderFilter']:visible")
    search_input.first.wait_for(state="visible", timeout=15000)
    search_input.first.click()
    # AngularJS's ng-change watcher on ng-model doesn't reliably fire from
    # Playwright's .fill() (which sets the value via JS + a single 'input'
    # event) — real character-by-character keystrokes are needed instead.
    search_input.first.press_sequentially(str(tender_id), delay=80)

    bs.log(f"[SEARCH] Searching Tender ID: {tender_id}")
    search_btn = page.locator("button.submit_nil:visible")
    if search_btn.count() > 0:
        search_btn.first.click()
    time.sleep(2)

    row_count = page.locator("table#myTablebyrTl tbody tr td.frelips").count()
    return row_count > 0


def print_result(listing_data: dict, status: str, reason: str, dept, documents: list):
    downloaded = [d["local_path"] for d in documents if d.get("local_path")]
    print("\n" + "=" * 78)
    if status == "proceed_futher":
        print("RELEVANT TENDER — SAVED TO DB")
    else:
        print("TENDER FOUND BUT NOT RELEVANT — NOT SAVED")
    print("=" * 78)
    print(f"  Tender Id          : {listing_data['tender_id']}")
    print(f"  Reference No.      : {listing_data['tender_refno']}")
    print(f"  Title              : {listing_data['tender_title']}")
    print(f"  Department         : {listing_data['department']}")
    print(f"  End Date           : {listing_data['end_date']}")
    print(f"  Dept (LLM)         : {dept}")
    print(f"  Filter Reason      : {reason}")
    if status == "proceed_futher":
        print(f"  Documents Saved ({len(downloaded)}):")
        for p in downloaded:
            print(f"      - {p}")
        print(f"\n  Check it on the portal at: /Admin/tenders -> 'Open' tender type -> "
              f"{(dept or 'Unknown')} tab")
    print("=" * 78 + "\n")


def run_single(playwright, tender_id: str):
    bs.init_csv(SINGLE_OUTPUT_FILE)
    conn = None
    try:
        conn = bs.get_db_connection()
        bs.log("MySQL connected.")
    except Exception as e:
        bs.log(f"[DB ERROR] {e} — CSV only")

    browser = playwright.chromium.launch(headless=False, args=bs.BROWSER_ARGS)
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
        bs.log(f"[Dialog] {dialog.type!r}: {dialog.message[:120]!r}")
        dialog.accept()

    page.on("dialog", handle_dialog)

    try:
        bs.log("[STEP 1] Opening site: " + bs.BASE_URL)
        # Bihar's Angular app occasionally aborts the initial navigation
        # (hash-routing triggers a mid-load redirect that Playwright reports
        # as "frame was detached") — retry a couple of times before giving up.
        for attempt in range(1, 4):
            try:
                page.goto(bs.BASE_URL, timeout=60000, wait_until="domcontentloaded")
                break
            except Exception as e:
                bs.log(f"[STEP 1] Navigation attempt {attempt}/3 failed: {e}")
                if attempt == 3:
                    raise
                time.sleep(3)

        bs.log("[STEP 2] Waiting for page load...")
        time.sleep(6)

        bs.log("[STEP 3] Searching for Tender ID...")
        found = search_tender(page, tender_id)

        if not found:
            print("\n" + "=" * 78)
            print(f"TENDER NOT FOUND — No record found for Tender ID: {tender_id}")
            print("=" * 78 + "\n")
            bs.log(f"[RESULT] Tender ID {tender_id} not found on the portal.")
            return

        rows_loc = page.locator("table#myTablebyrTl tbody tr")
        row = None
        for i in range(rows_loc.count()):
            candidate = rows_loc.nth(i)
            ld = bs.parse_listing_row(candidate)
            if ld.get("tender_id") == str(tender_id):
                row = candidate
                listing_data = ld
                break

        if row is None:
            # Fall back to the first row if the id didn't match exactly
            # (e.g. leading/trailing space differences from the portal).
            row = rows_loc.first
            listing_data = bs.parse_listing_row(row)

        if not listing_data.get("tender_id"):
            print(f"\n[WARN] Row found but could not parse tender data for Tender ID: {tender_id}\n")
            return

        title = listing_data["tender_title"]
        bs.log(f"[STEP 4] Found tender: {title[:80]}")

        # PASS 1: filter on the description
        f_status, f_reason, dept_tag, decision = bs.filter_tender(title)

        if f_status == "no":
            print_result(listing_data, f_status, f_reason, dept_tag, [])
            bs.log(f"[RESULT] Tender ID {tender_id} is NOT relevant. {f_reason}")
            return

        need_confirmation = (decision == "Doubt")
        bs.log(f"[STEP 5] Opening preview modal (verdict: {decision}"
               f"{', confirming with details+documents...' if need_confirmation else ''})")

        result = bs.process_tender_details(
            page, row, listing_data,
            need_confirmation, f_reason, dept_tag,
        )
        f_status = result["final_status"]
        f_reason = result["reason"]
        dept_tag = result["dept"]
        documents = result["documents"]

        print_result(listing_data, f_status, f_reason, dept_tag, documents)

        if f_status == "no":
            bs.log(f"[RESULT] Tender ID {tender_id} confirmed NOT relevant after detail check.")
            return

        combined = result["structured_details"]
        bs.append_csv(SINGLE_OUTPUT_FILE, [[
            1, listing_data["tender_id"], listing_data["tender_refno"],
            listing_data["department"], title, listing_data["end_date"],
            "; ".join(d["document_name"] for d in documents),
            dept_tag or "", f_status, f_reason,
        ]])

        if conn:
            file_link_json, downloaded_documents_json = bs.build_documents_json(documents)
            closing_date_raw = combined.get("Bid Submission End Date") or listing_data["end_date"]
            record = {
                "state":                bs.STATE_NAME,
                "organisation_name":    listing_data["department"],
                "closing_date":         bs.format_closing_date_for_db(closing_date_raw),
                "tender_title":         title,
                "tender_refno":         bs.make_db_refno(listing_data["tender_refno"], listing_data["tender_id"]),
                "tender_id":            listing_data["tender_id"],
                "organisation_chain":   combined.get("Organisation Chain") or listing_data["department"],
                "tender_details":       json.dumps(combined, ensure_ascii=False),
                "structured_details":   combined,
                "file_link":            file_link_json,
                "downloaded_documents": downloaded_documents_json,
                "relevency_checker":    f_status,
                "relevancy_reason":     f_reason,
                "suggested_product":    None,
                "dept":                 (dept_tag or "Unknown").lower(),
            }
            bs.upsert_tender(conn, record)
            bs.log(f"[DB] Upserted Tender ID {tender_id} into open_tender_details "
                   f"with {len(documents)} document(s).")

        bs.log(f"[DONE] Tender ID {tender_id} processed.")

    except Exception as e:
        bs.log(f"[ERROR] {str(e)[:200]}")

    finally:
        bs.log("[INFO] Browser will remain open. Press Enter to close...")
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

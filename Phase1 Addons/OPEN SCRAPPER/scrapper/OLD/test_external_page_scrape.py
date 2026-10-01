#!/usr/bin/env python3
"""
test_external_page_scrape.py
-----------------------------
Test that the external state-portal page (e.g. tntenders.gov.in) is fully
scraped: Cover Info, Fee Details, EMD, Work Item Details, Critical Dates,
NIT Documents, Work Item Documents, Tender Inviting Authority.

Usage:
    python test_external_page_scrape.py
    python test_external_page_scrape.py "https://tntenders.gov.in/nicgep/app?page=FrontEndTenderDetailsExternal&service=page&tnid=821270"
"""

import sys
import json
import time
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError


# ══════════════════════════════════════════════════════════════════════════════
# Parser — identical to the improved version in cppp_states_diagno_scraper.py
# ══════════════════════════════════════════════════════════════════════════════

def _list_key_from_headers(headers: list, fallback_index: int) -> str:
    """Derive a meaningful dict key from list-table column headers."""
    h = [x.lower().strip() for x in headers]
    if any("cover no" in x or "cover type" in x for x in h):
        return "cover_info"
    if any("document name" in x for x in h):
        if any("document type" in x for x in h):
            return "work_item_documents"
        return "nit_documents"
    return f"list_{fallback_index}"


def _parse_list_table(table_loc) -> tuple:
    """Parse a table with a tr.list_header row → (headers, rows)."""
    header_row = table_loc.locator("tr.list_header")
    if header_row.count() == 0:
        return [], []
    headers  = [td.inner_text().strip() for td in header_row.first.locator("td, th").all()]
    rows_out = []
    for row in table_loc.locator("tr:not(.list_header)").all():
        cells = [td.inner_text().strip() for td in row.locator("td").all()]
        if not any(c for c in cells if c):
            continue
        if headers and len(cells) == len(headers):
            rows_out.append(dict(zip(headers, cells)))
        elif cells:
            rows_out.append(cells)
    return headers, rows_out


def _parse_tablebg_page(tab, source_url: str) -> dict:
    """
    Parse ALL structured data from a NIC eProcurement state portal page:
      • table.tablebg  → key-value pairs (td_caption / td_field)
      • table.tablebg with tr.list_header → named list (e.g. cover_info)
      • table.list_table → NIT Documents, Work Item Documents
        (nested inside tablebg td_field cells — captured separately
         so the outer cell is skipped to avoid raw-text duplication)
    """
    result     = {"source_url": source_url}
    list_index = 0

    # 1. table.tablebg ─────────────────────────────────────────────────────────
    for table in tab.locator("table.tablebg").all():
        header_row = table.locator("tr.list_header")
        if header_row.count() > 0:
            headers, rows_out = _parse_list_table(table)
            if rows_out:
                key = _list_key_from_headers(headers, list_index)
                result[key] = rows_out
                list_index += 1
        else:
            for row in table.locator("tr").all():
                captions = row.locator("td.td_caption").all()
                fields   = row.locator("td.td_field").all()
                for cap, fld in zip(captions, fields):
                    label = cap.inner_text().strip().rstrip(":").strip()
                    if not label:
                        continue
                    # Skip cells that contain a nested list_table (parsed in step 2)
                    if fld.locator("table.list_table").count() > 0:
                        continue
                    value = fld.inner_text().strip()
                    result[label] = value

    # 2. table.list_table (NIT Documents, Work Item Documents, etc.) ───────────
    for lt in tab.locator("table.list_table").all():
        headers, rows_out = _parse_list_table(lt)
        if rows_out:
            key = _list_key_from_headers(headers, list_index)
            if key in result:
                key = f"{key}_{list_index}"
            result[key] = rows_out
            list_index += 1

    return result


# ══════════════════════════════════════════════════════════════════════════════
# Pretty printer
# ══════════════════════════════════════════════════════════════════════════════

SECTION_DISPLAY = {
    "cover_info":           "📋 Cover Information",
    "nit_documents":        "📄 NIT Documents",
    "work_item_documents":  "📁 Work Item Documents",
    "Title":                "🏷️  Title",
    "Work Description":     "📝 Work Description",
    "Tender Value in ₹":   "💰 Tender Value",
    "Published Date":       "📅 Published Date",
    "Bid Opening Date":     "📅 Bid Opening Date",
    "EMD Amount in ₹":     "💳 EMD Amount",
    "Tender Fee in ₹":     "🏷️  Tender Fee",
    "Name":                 "👤 Tender Inviting Authority - Name",
    "Address":              "🏢 Tender Inviting Authority - Address",
}

EXPECTED_SECTIONS = [
    "cover_info", "Title", "Work Description", "Tender Value in ₹",
    "Product Category", "Contract Type", "Location",
    "Published Date", "Bid Opening Date",
    "Bid Submission Start Date", "Bid Submission End Date",
    "Document Download / Sale Start Date", "Document Download / Sale End Date",
    "EMD Amount in ₹", "EMD Fee Type", "EMD Percentage",
    "Tender Fee in ₹", "Fee Payable To",
    "nit_documents", "work_item_documents",
    "Name", "Address",
]

def print_results(result: dict):
    print(f"\n{'='*60}")
    print(f"✅ Total fields/sections scraped: {len(result) - 1}")  # -1 for source_url
    print(f"{'='*60}\n")

    # Print expected sections first for easy validation
    print("── Expected Sections Check ──────────────────────────────")
    for section in EXPECTED_SECTIONS:
        found = section in result
        icon  = "✓" if found else "✗ MISSING"
        val   = result[section] if found else ""
        if isinstance(val, list):
            print(f"  [{icon}] {section}: ({len(val)} row(s))")
        elif isinstance(val, str) and len(val) > 80:
            print(f"  [{icon}] {section}: {val[:80]}…")
        else:
            print(f"  [{icon}] {section}: {val}")

    # Full JSON dump
    print(f"\n── Full JSON Output ─────────────────────────────────────")
    print(json.dumps(result, indent=2, ensure_ascii=False))


# ══════════════════════════════════════════════════════════════════════════════
# Test Method A: Direct navigation (fastest — tests scrape_external_tender_page)
# ══════════════════════════════════════════════════════════════════════════════

def test_direct_navigation(url: str):
    print(f"\n{'='*60}")
    print("TEST METHOD A: Direct Navigation")
    print(f"URL: {url}")
    print('='*60)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page    = browser.new_page()
        result  = None
        try:
            print("[1] Navigating to URL...")
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
            time.sleep(2)

            print("[2] Waiting for table.tablebg...")
            found_tablebg = False
            try:
                page.wait_for_selector("table.tablebg", timeout=15000)
                found_tablebg = True
                print("    ✓ table.tablebg found!")
            except PlaywrightTimeoutError:
                print("    ✗ No table.tablebg — trying table.list_table...")

            found_listtable = False
            try:
                page.wait_for_selector("table.list_table", timeout=5000)
                found_listtable = True
                print("    ✓ table.list_table found!")
            except PlaywrightTimeoutError:
                pass

            if not found_tablebg and not found_listtable:
                print("\n    ✗ No matching tables found on this page.")
                print("    Page title:", page.title())
                print("    Page URL  :", page.url)
                body = page.inner_text("body")
                print("    Body preview:\n", body[:1500])
                return

            print("[3] Parsing page...")
            result = _parse_tablebg_page(page, url)
            print_results(result)

        except Exception as e:
            print(f"\n[ERROR] {e}")
        finally:
            if result:
                try:
                    input("\n📌 Browser is still open — inspect the page. Press ENTER to close...")
                except EOFError:
                    pass
            try:
                browser.close()
            except Exception:
                pass


# ══════════════════════════════════════════════════════════════════════════════
# Test Method B: Simulate click from CPPP detail page
#   (tests the click→new-tab→scrape path in scrape_cppp_detail)
# ══════════════════════════════════════════════════════════════════════════════

def test_via_cppp_click(cppp_detail_url: str):
    print(f"\n{'='*60}")
    print("TEST METHOD B: Simulate Click from CPPP Detail Page")
    print(f"CPPP URL: {cppp_detail_url}")
    print('='*60)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            ignore_https_errors=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        page   = context.new_page()
        result = None
        try:
            print("[1] Opening CPPP detail page...")
            page.goto(cppp_detail_url, timeout=30000, wait_until="domcontentloaded")
            page.wait_for_selector("div#tfullview", timeout=15000)
            print("    ✓ CPPP detail page loaded")

            ext_locator = page.locator("td#tenderDetailDivTd div.event-dtl a[href]")
            count       = ext_locator.count()
            print(f"[2] External link elements found: {count}")
            if count == 0:
                print("    ✗ No external link on this page.")
                return

            ext_href = ext_locator.first.get_attribute("href")
            print(f"    External URL: {ext_href}")

            print("[3] Clicking link → expecting new tab...")
            try:
                with context.expect_page(timeout=8000) as ext_pg_info:
                    ext_locator.first.click()
                ext_tab = ext_pg_info.value
                ext_tab.wait_for_load_state("domcontentloaded", timeout=25000)
                print(f"    ✓ New tab opened: {ext_tab.url}")
            except Exception as e:
                print(f"    ✗ New tab failed: {e}")
                return

            print("[4] Parsing external page...")
            try:
                ext_tab.wait_for_selector("table.tablebg, table.list_table", timeout=15000)
            except PlaywrightTimeoutError:
                print("    ✗ No tables found in new tab.")
                body = ext_tab.inner_text("body")
                print("    Body preview:\n", body[:1000])
                ext_tab.close()
                return

            result = _parse_tablebg_page(ext_tab, ext_href)
            ext_tab.close()
            print_results(result)

        except Exception as e:
            print(f"\n[ERROR] {e}")
        finally:
            if result:
                try:
                    input("\n📌 Browser is still open. Press ENTER to close...")
                except EOFError:
                    pass
            try:
                browser.close()
            except Exception:
                pass


# ══════════════════════════════════════════════════════════════════════════════
# Entry Point
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    TARGET_URL = (
        "https://tntenders.gov.in/nicgep/app"
        "?page=FrontEndTenderDetailsExternal&service=page&tnid=821270"
    )

    if len(sys.argv) > 1:
        TARGET_URL = sys.argv[1]

    # ── Method A: direct navigation (quickest — run this first) ──────────────
    test_direct_navigation(TARGET_URL)

    # ── Method B: via CPPP detail page click (uncomment + replace URL) ────────
    # CPPP_DETAIL_URL = "https://eprocure.gov.in/cppp/tendersfullviewmmp/<TENDER_ID>"
    # test_via_cppp_click(CPPP_DETAIL_URL)

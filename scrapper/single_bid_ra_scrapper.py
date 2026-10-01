#!/usr/bin/env python3
"""
single_bid_ra_scrapper.py — look up ONE specific GeM bid number and save it to the DB.

Unlike ra_scrapper.py (which loops over every active tender already in gem_tenders
looking for newly-published RA numbers), this takes a single bid number you already
know — e.g. from a support request — searches it directly on bidplus.gem.gov.in,
and upserts whatever it finds (listing fields + RA NO/URL, if an RA has been raised)
into gem_tenders. Works whether or not the bid already exists in the table.

Usage:
    python single_bid_ra_scrapper.py GEM/2026/B/7604339
    python single_bid_ra_scrapper.py              # uses DEFAULT_BID_NO below
"""

import os
import re
import sys
import json
import time
from datetime import datetime

import mysql.connector
from playwright.sync_api import sync_playwright

DEFAULT_BID_NO = "GEM/2026/B/7604339"

DB_HOST = "localhost"
DB_PORT = "3306"
DB_USER = "root"
DB_PASSWORD = "meril"
DB_NAME = os.getenv("DB_NAME", "tender_automation_with_ai")

# Set SCRAPER_HEADED=1 to watch it run; scheduled/unattended use stays headless.
HEADLESS = os.environ.get("SCRAPER_HEADED", "") != "1"

BASE_URL = "https://bidplus.gem.gov.in"


def ts():
    return datetime.now().strftime("[%H:%M:%S]")


def extract_modal_data(page, trigger_locator=None, js_trigger: str = None) -> str | None:
    """Click/trigger whatever opens a Representation or Corrigendum modal, grab its
    text, close it, and return it as a JSON string. Mirrors single_bid_api.py's
    async extract_modal_data(), adapted to the sync Playwright API used here."""
    try:
        if js_trigger:
            page.evaluate(js_trigger)
        elif trigger_locator:
            trigger_locator.click(force=True)

        modal = page.wait_for_selector("div.modal:visible", timeout=8000)
        time.sleep(1)

        content = modal.inner_text()

        close_btn = page.query_selector("div.modal:visible button.close, div.modal:visible button[data-dismiss='modal']")
        if close_btn:
            close_btn.click()
        else:
            page.keyboard.press("Escape")

        page.wait_for_selector("div.modal:visible", state="hidden", timeout=5000)
        return json.dumps({"content": content}, ensure_ascii=False)
    except Exception as e:
        print(f"{ts()}   [MODAL] extract failed: {e}")
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        return None


def extract_corrigendum_structured(page, js_trigger: str) -> str | None:
    """Same click/open/close flow as extract_modal_data, but also parses the
    corrigendum text into structured entries (modified_on / bid_extended_to /
    bid_opening_date / download_url) so the UI can render a real table instead
    of a wall of raw text. Falls back to {"content": ...} if parsing finds nothing."""
    try:
        page.evaluate(js_trigger)
        modal = page.wait_for_selector("div.modal:visible", timeout=8000)
        time.sleep(1)

        content = modal.inner_text()

        # Collect "Download"-labelled links inside the modal, in document order,
        # so they can be paired back up with the entry they belong to.
        download_hrefs = []
        try:
            for a in modal.query_selector_all("a"):
                text = (a.inner_text() or "").strip()
                href = a.get_attribute("href")
                if href and "download" in text.lower():
                    abs_href = BASE_URL + href if href.startswith("/") else href
                    download_hrefs.append(abs_href)
        except Exception:
            pass

        close_btn = page.query_selector("div.modal:visible button.close, div.modal:visible button[data-dismiss='modal']")
        if close_btn:
            close_btn.click()
        else:
            page.keyboard.press("Escape")
        page.wait_for_selector("div.modal:visible", state="hidden", timeout=5000)

        entries = []
        chunks = re.split(r"Modified On:\s*", content)
        dl_idx = 0
        for chunk in chunks[1:]:  # chunks[0] is the "Corrigendum / Corrigendum Details" preamble
            m = re.match(r"([\d\-: ]+)", chunk)
            modified_on = m.group(1).strip() if m else None

            ext_m = re.search(r"Bid extended to\s*([\d\-: ]+(?:\(Auto Extension\))?)", chunk)
            open_m = re.search(r"Bid Opening Date:\s*([\d\-: ]+(?:\(Auto Extension\))?)", chunk)

            download_url = None
            if "Download" in chunk and dl_idx < len(download_hrefs):
                download_url = download_hrefs[dl_idx]
                dl_idx += 1

            entries.append({
                "modified_on": modified_on,
                "bid_extended_to": ext_m.group(1).strip() if ext_m else None,
                "bid_opening_date": open_m.group(1).strip() if open_m else None,
                "download_url": download_url,
            })

        if entries:
            return json.dumps({"entries": entries, "raw_full_text": content}, ensure_ascii=False)
        return json.dumps({"content": content}, ensure_ascii=False)
    except Exception as e:
        print(f"{ts()}   [MODAL] corrigendum extract failed: {e}")
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        return None


def extract_corrigendum_representation(page, card) -> tuple[str | None, str | None]:
    """Expand the card's 'View Corrigendum/Representation' toggle and pull out
    both modals' contents, if present. Returns (representation_json, corrigendum_json)."""
    rep_json, corr_json = None, None

    try:
        toggle = card.locator("a:has-text('View Corrigendum/Representation')")
        if toggle.count() > 0:
            toggle.first.click(force=True)
            time.sleep(1.5)
    except Exception as e:
        print(f"{ts()}   [EXPAND] failed: {e}")

    # ---------- Representation ----------
    try:
        for el in card.locator("a, span").all():
            text = el.inner_text() or ""
            if "View Representation" in text:
                onclick = el.get_attribute("onclick")
                print(f"{ts()}   Found 'View Representation' — extracting modal...")
                rep_json = extract_modal_data(
                    page,
                    js_trigger=onclick if onclick else None,
                    trigger_locator=None if onclick else el,
                )
                break
    except Exception as e:
        print(f"{ts()}   [REPRESENTATION] failed: {e}")

    # ---------- Corrigendum ----------
    try:
        for s in card.locator("span[data-bid]").all():
            text = s.inner_text() or ""
            if "View Corrigendum" in text:
                bid = s.get_attribute("data-bid")
                if bid:
                    print(f"{ts()}   Found 'View Corrigendum' — extracting modal...")
                    corr_json = extract_corrigendum_structured(page, f"view_corrigendum_modal('{bid}')")
                break
    except Exception as e:
        print(f"{ts()}   [CORRIGENDUM] failed: {e}")

    return rep_json, corr_json


def find_bid_card(page, bid_no: str) -> dict | None:
    """Search the given bid number on /all-bids and scrape its listing card."""
    print(f"{ts()} Navigating to {BASE_URL}/all-bids ...")
    page.goto(f"{BASE_URL}/all-bids", timeout=60000, wait_until="networkidle")

    print(f"{ts()} Searching bid number: {bid_no}")
    page.wait_for_selector("#searchBid", state="visible")
    page.fill("#searchBid", "")
    page.fill("#searchBid", bid_no)
    page.press("#searchBid", "Enter")

    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass
    page.wait_for_timeout(1500)

    cards = page.locator("div.card")
    count = cards.count()
    print(f"{ts()} {count} card(s) on results page.")

    for i in range(count):
        card = cards.nth(i)
        bid_link = card.locator(".block_header a.bid_no_hover")
        if bid_link.count() == 0:
            continue

        found_no = bid_link.first.inner_text().strip()
        if found_no != bid_no:
            continue

        href = bid_link.first.get_attribute("href") or ""
        detail_url = BASE_URL + "/" + href.lstrip("/") if href else ""

        item_el = card.locator(".card-body .col-md-4 .row:nth-child(1) a")
        items = item_el.first.inner_text().strip() if item_el.count() > 0 else ""

        qty_el = card.locator(".card-body .col-md-4 .row:nth-child(2)")
        quantity = qty_el.first.inner_text().replace("Quantity:", "").strip() if qty_el.count() > 0 else ""

        dept_el = card.locator(".card-body .col-md-5 .row:nth-child(2)")
        department = dept_el.first.inner_text().strip() if dept_el.count() > 0 else ""

        start_el = card.locator("span.start_date")
        start_date = start_el.first.inner_text().strip() if start_el.count() > 0 else ""

        end_el = card.locator("span.end_date")
        end_date = end_el.first.inner_text().strip() if end_el.count() > 0 else ""

        ra_no, ra_url = "", ""
        ra_p = card.locator("p.bid_no")
        if ra_p.count() > 0 and "RA NO" in ra_p.first.inner_text():
            ra_link = ra_p.first.locator("a")
            if ra_link.count() > 0:
                ra_no = ra_link.first.inner_text().strip()
                ra_href = ra_link.first.get_attribute("href")
                if ra_href:
                    ra_url = BASE_URL + ra_href if ra_href.startswith("/") else ra_href

        rep_json, corr_json = extract_corrigendum_representation(page, card)

        return {
            "bid_number": found_no,
            "detail_url": detail_url,
            "items": items,
            "quantity": quantity,
            "department": department,
            "start_date": start_date,
            "end_date": end_date,
            "ra_no": ra_no,
            "ra_url": ra_url,
            "representation_json": rep_json,
            "corrigendum_json": corr_json,
        }

    return None


def save_to_db(record: dict):
    print(f"{ts()} [DB] Connecting to '{DB_NAME}' on {DB_HOST}:{DB_PORT}...")
    conn = mysql.connector.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, database=DB_NAME,
    )
    cursor = conn.cursor()
    query = """
    INSERT INTO gem_tenders
        (bid_number, detail_url, items, quantity, department, start_date, end_date, ra_no, ra_url,
         Representation_json, Corrigendum_json)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        detail_url = VALUES(detail_url),
        items       = VALUES(items),
        quantity    = VALUES(quantity),
        department  = VALUES(department),
        start_date  = VALUES(start_date),
        end_date    = VALUES(end_date),
        ra_no       = VALUES(ra_no),
        ra_url      = VALUES(ra_url),
        Representation_json = VALUES(Representation_json),
        Corrigendum_json     = VALUES(Corrigendum_json)
    """
    cursor.execute(query, (
        record["bid_number"], record["detail_url"], record["items"], record["quantity"],
        record["department"], record["start_date"], record["end_date"],
        record["ra_no"], record["ra_url"],
        record["representation_json"], record["corrigendum_json"],
    ))
    conn.commit()
    print(f"{ts()} [DB] Saved bid {record['bid_number']} into gem_tenders.")
    cursor.close()
    conn.close()


def main():
    bid_no = sys.argv[1].strip() if len(sys.argv) > 1 else DEFAULT_BID_NO
    print("=" * 65)
    print(f"  Single-bid RA scraper — {bid_no}")
    print("=" * 65)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS, args=["--disable-blink-features=AutomationControlled"])
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        page.set_default_timeout(30000)

        try:
            record = find_bid_card(page, bid_no)
        finally:
            browser.close()

    if not record:
        print(f"{ts()} [NOT FOUND] '{bid_no}' did not appear in the GeM listing search results.")
        sys.exit(1)

    print(f"{ts()} Found bid: {record}")
    if record["ra_no"]:
        print(f"{ts()} RA raised: {record['ra_no']} -> {record['ra_url']}")
    else:
        print(f"{ts()} No RA raised yet for this bid.")
    print(f"{ts()} Representation captured: {bool(record['representation_json'])}")
    print(f"{ts()} Corrigendum captured: {bool(record['corrigendum_json'])}")

    save_to_db(record)
    print(f"{ts()} Done.")


if __name__ == "__main__":
    main()

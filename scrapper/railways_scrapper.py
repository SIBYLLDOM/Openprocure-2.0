#!/usr/bin/env python3
"""
railways_scrapper.py — IREPS (Indian Railways E-Procurement) Tenders Scraper

Flow so far:
  1. Open site (SITE_URL)
  2. Wait 3s for page load
  3. Wait for the welcome popup, click its "Close" button
  4. Click "Search E-Tenders" link (triggers anonymSearch())
  5. Wait 3s — page redirects to OTP authentication page
  6. Pause and let the user manually fill in:
       Mobile Number / Verification Code (captcha) / Enter Verification Code / Today's OTP
     and click "Proceed" themselves in the visible browser window.
  7. Wait until navigation away from the OTP page is detected, then stop here.

Scraping of the post-login results page is not implemented yet — this script
only gets the browser to that point so the next steps can be added later.
"""

import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ── Configuration ────────────────────────────────────────────────────────────
SITE_URL = "https://www.ireps.gov.in/"

BROWSER_ARGS = [
    "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-extensions", "--disable-background-networking",
    "--disk-cache-size=0", "--aggressive-cache-discard",
    "--disable-application-cache",
    "--disable-blink-features=AutomationControlled",
]


def ts():
    return time.strftime("[%H:%M:%S]")


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=BROWSER_ARGS, slow_mo=100)
        context = browser.new_context()
        page = context.new_page()

        print(f"{ts()} Opening site: {SITE_URL}")
        page.goto(SITE_URL, wait_until="domcontentloaded")

        print(f"{ts()} Waiting 3s for page to load...")
        time.sleep(3)

        # ── Close the welcome popup ─────────────────────────────────────────
        print(f"{ts()} Waiting for popup to appear...")
        try:
            modal = page.locator("#myModal")
            modal.wait_for(state="visible", timeout=30000)
            close_btn = modal.locator(
                "button.btn.btn-primary.btn-sm[data-dismiss='modal']"
            ).first
            close_btn.wait_for(state="visible", timeout=15000)
            close_btn.click()
            modal.wait_for(state="hidden", timeout=15000)
            print(f"{ts()} Popup closed.")
        except PlaywrightTimeoutError:
            print(f"{ts()} No popup appeared within timeout, continuing.")

        print(f"{ts()} Waiting 5s after popup close before clicking Search E-Tenders...")
        time.sleep(5)

        # ── Click "Search E-Tenders" ─────────────────────────────────────────
        print(f"{ts()} Clicking 'Search E-Tenders'...")
        search_link = page.locator("a[title='Click here to search for available E-Tenders']").first
        search_link.wait_for(state="visible", timeout=15000)

        try:
            with context.expect_page(timeout=5000) as new_page_info:
                search_link.click(force=True)
            page = new_page_info.value
            page.wait_for_load_state("domcontentloaded")
            print(f"{ts()} 'Search E-Tenders' opened a new tab: {page.url}")
        except PlaywrightTimeoutError:
            print(f"{ts()} No new tab opened, staying on same page: {page.url}")

        print(f"{ts()} Waiting 3s for redirect to OTP authentication page...")
        time.sleep(3)
        print(f"{ts()} Current URL: {page.url}")

        # ── Manual OTP authentication step ──────────────────────────────────
        print(f"{ts()} Reached OTP authentication page.")
        print(f"{ts()} Please manually enter in the opened browser window:")
        print("        - Mobile Number")
        print("        - Verification Code (captcha)")
        print("        - Enter Verification Code")
        print("        - Today's OTP")
        print(f"{ts()} Then click 'Proceed' yourself.")
        print(f"{ts()} Waiting for you to complete authentication (checking every 2s)...")

        submit_selector = "#submit"
        try:
            page.wait_for_selector(submit_selector, state="attached", timeout=15000)
            print(f"{ts()} OTP form detected, waiting for you to submit it...")
        except PlaywrightTimeoutError:
            print(f"{ts()} Could not find the OTP submit button — check the page manually.")

        start_url = page.url
        while True:
            time.sleep(2)
            if page.url != start_url:
                break
            if page.locator(submit_selector).count() == 0:
                break

        print(f"{ts()} Authentication complete, now at: {page.url}")
        print(f"{ts()} Stopping here — scraping logic to be added next.")

        input("Press Enter to close the browser...")
        browser.close()


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nInterrupted by user.")
        sys.exit(1)

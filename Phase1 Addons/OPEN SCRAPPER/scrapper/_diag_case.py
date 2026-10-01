import backfill_missing_documents as bf
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import urllib.parse, os, hashlib

TENDER_ID="2026_GMCK_578068_1"; LIVE_TENDER_ID="2026_GMCK_599915_1"
REFNO="MBS HOSPITAL KOTA NITNO4-2026-27"; SITE="https://eproc.rajasthan.gov.in/nicgep/app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=bf.BROWSER_ARGS)
    context = browser.new_context(viewport={"width":1280,"height":900}, ignore_https_errors=True, accept_downloads=True,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    page = context.new_page(); page.set_default_timeout(60000)
    bf.find_and_open_tender(page, SITE, LIVE_TENDER_ID, REFNO)
    bf.solve_generic_captcha(page, max_attempts=20)
    page.wait_for_selector("div#tfullview, table#table.list_table", timeout=15000)
    nicgep_url = page.url
    href = bf._extract_href(page, "text_contains", "Tendernotice_1.pdf")
    abs_url = urllib.parse.urljoin(page.url, href)
    try:
        with page.expect_download(timeout=6000): page.goto(abs_url, referer=page.url, timeout=20000)
    except Exception: pass

    cap = page.locator("#captchaImage")
    img_bytes = cap.first.screenshot()
    h1 = hashlib.md5(img_bytes).hexdigest()
    raw = bf.solve_captcha_local(img_bytes)
    print("guess:", raw)
    variants = {raw, raw.upper(), raw.lower(), raw.swapcase()}
    for v in variants:
        page.locator("#captchaText").fill(v)
        try:
            with page.expect_download(timeout=5000):
                page.locator("#Submit").click()
            print("SUCCESS with", v); break
        except PWTimeout:
            print("failed:", v)
            img2 = cap.first.screenshot() if cap.count() else b""
            h2 = hashlib.md5(img2).hexdigest() if img2 else None
            print("  image same as before?", h1==h2)
    browser.close()

import backfill_missing_documents as bf
from playwright.sync_api import sync_playwright
import os, re

TENDER_ID = "2026_GMCK_578068_1"
LIVE_TENDER_ID = "2026_GMCK_599915_1"
REFNO = "MBS HOSPITAL KOTA NITNO4-2026-27"
SITE = "https://eproc.rajasthan.gov.in/nicgep/app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=bf.BROWSER_ARGS)
    context = browser.new_context(viewport={"width":1280,"height":900}, ignore_https_errors=True, accept_downloads=True,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    page = context.new_page(); page.set_default_timeout(60000)
    bf.find_and_open_tender(page, SITE, LIVE_TENDER_ID, REFNO)
    bf.solve_generic_captcha(page, max_attempts=20)
    page.wait_for_selector("div#tfullview, table#table.list_table", timeout=15000)
    nicgep_url = page.url
    page.goto(nicgep_url, referer=page.url, timeout=20000, wait_until="domcontentloaded")
    # trigger the doc link click to reach the captcha download page
    href = bf._extract_href(page, "text_contains", "Tendernotice_1.pdf")
    print("href:", href)
    import urllib.parse
    abs_url = urllib.parse.urljoin(page.url, href)
    try:
        with page.expect_download(timeout=6000):
            page.goto(abs_url, referer=page.url, timeout=20000)
    except Exception as e:
        print("no direct download (expected):", e)
    cap = page.locator("#captchaImage")
    print("captcha present:", cap.count())
    if cap.count():
        for i in range(5):
            img_bytes = cap.first.screenshot()
            open(f"{os.environ['TEMP']}/dlcap{i}.png","wb").write(img_bytes)
            ans = bf.solve_captcha_local(img_bytes)
            print(i, "local ocr:", repr(ans), "len", len(img_bytes))
            if i < 4:
                page.locator("#captcha").click()
                page.wait_for_timeout(1000)
    browser.close()

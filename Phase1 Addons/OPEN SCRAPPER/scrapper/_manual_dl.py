import backfill_missing_documents as bf
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import urllib.parse, os, time, json, sys

TENDER_ID="2026_GMCK_578068_1"; LIVE_TENDER_ID="2026_GMCK_599915_1"
REFNO="MBS HOSPITAL KOTA NITNO4-2026-27"; SITE="https://eproc.rajasthan.gov.in/nicgep/app"
DOCS = ["Tendernotice_1.pdf", "Tendernotice_2.pdf"]
TMP = os.environ["TEMP"]
CAP_IMG = os.path.join(TMP, "manual_captcha.png")
ANSWER_FILE = os.path.join(TMP, "manual_captcha_answer.txt")
STATUS_FILE = os.path.join(TMP, "manual_captcha_status.txt")

def set_status(s):
    open(STATUS_FILE, "w").write(s)
    print("[STATUS]", s, flush=True)

def wait_for_answer(timeout=600):
    if os.path.exists(ANSWER_FILE):
        os.remove(ANSWER_FILE)
    start = time.time()
    while time.time() - start < timeout:
        if os.path.exists(ANSWER_FILE):
            ans = open(ANSWER_FILE).read().strip()
            os.remove(ANSWER_FILE)
            return ans
        time.sleep(1)
    return None

save_dir = os.path.join(bf.DOWNLOAD_DIR, TENDER_ID)
os.makedirs(save_dir, exist_ok=True)
results = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=bf.BROWSER_ARGS)
    context = browser.new_context(viewport={"width":1280,"height":900}, ignore_https_errors=True, accept_downloads=True,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    page = context.new_page(); page.set_default_timeout(60000)
    set_status("opening tender...")
    bf.find_and_open_tender(page, SITE, LIVE_TENDER_ID, REFNO)
    bf.solve_generic_captcha(page, max_attempts=20)
    page.wait_for_selector("div#tfullview, table#table.list_table", timeout=15000)
    nicgep_url = page.url

    for doc_name in DOCS:
        page.goto(nicgep_url, referer=page.url, timeout=20000, wait_until="domcontentloaded")
        href = bf._extract_href(page, "text_contains", doc_name)
        if not href:
            set_status(f"NO LINK for {doc_name}")
            results.append({"file_name": doc_name, "status": "no_link"})
            continue
        abs_url = urllib.parse.urljoin(page.url, href)
        try:
            with page.expect_download(timeout=6000) as dl_info:
                try:
                    page.goto(abs_url, referer=page.url, timeout=20000)
                except Exception:
                    pass  # navigation itself can raise once the download starts; the download still completes
            download = dl_info.value
            path = os.path.join(save_dir, download.suggested_filename or doc_name)
            download.save_as(path)
            results.append({"file_name": doc_name, "status": "downloaded_direct", "local_path": path, "type": "nit"})
            continue
        except PWTimeout:
            pass

        cap = page.locator("#captchaImage")
        if cap.count() == 0:
            set_status(f"NO CAPTCHA, NO DOWNLOAD for {doc_name}")
            results.append({"file_name": doc_name, "status": "failed_no_captcha"})
            continue

        solved = False
        for attempt in range(1, 16):
            img_bytes = cap.first.screenshot()
            open(CAP_IMG, "wb").write(img_bytes)
            set_status(f"WAITING_FOR_ANSWER doc={doc_name} attempt={attempt} img={CAP_IMG}")
            ans = wait_for_answer(timeout=180)
            if not ans:
                set_status(f"TIMEOUT waiting for answer on {doc_name} attempt {attempt}")
                break
            page.locator("#captchaText").fill(ans)
            try:
                with page.expect_download(timeout=8000) as dl_info:
                    page.locator("#Submit").click()
                download = dl_info.value
                path = os.path.join(save_dir, download.suggested_filename or doc_name)
                download.save_as(path)
                set_status(f"SUCCESS {doc_name} -> {path}")
                results.append({"file_name": doc_name, "status": "downloaded", "local_path": path, "type": "nit"})
                solved = True
                break
            except PWTimeout:
                set_status(f"REJECTED answer '{ans}' for {doc_name}, retrying...")
                cap = page.locator("#captchaImage")
                if cap.count() == 0:
                    break
                continue
        if not solved:
            results.append({"file_name": doc_name, "status": "failed", "type": "nit"})

    browser.close()

open(os.path.join(TMP, "manual_dl_results.json"), "w").write(json.dumps(results, indent=2))
set_status("ALL_DONE")
print(json.dumps(results, indent=2))

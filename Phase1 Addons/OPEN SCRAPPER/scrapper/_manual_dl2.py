import backfill_missing_documents as bf
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import urllib.parse, os, time, json

TENDER_ID="2026_GMCK_578068_1"; LIVE_TENDER_ID="2026_GMCK_599915_1"
REFNO="MBS HOSPITAL KOTA NITNO4-2026-27"; SITE="https://eproc.rajasthan.gov.in/nicgep/app"
DOC_NAME = "Tendernotice_1.pdf"
TMP = os.environ["TEMP"]
CAP_IMG = os.path.join(TMP, "manual_captcha.png")
ANSWER_FILE = os.path.join(TMP, "manual_captcha_answer.txt")
STATUS_FILE = os.path.join(TMP, "manual_captcha_status.txt")

def set_status(s):
    open(STATUS_FILE, "w").write(s); print("[STATUS]", s, flush=True)

def wait_for_answer(timeout=180):
    if os.path.exists(ANSWER_FILE): os.remove(ANSWER_FILE)
    start = time.time()
    while time.time() - start < timeout:
        if os.path.exists(ANSWER_FILE):
            ans = open(ANSWER_FILE).read().strip(); os.remove(ANSWER_FILE); return ans
        time.sleep(1)
    return None

save_dir = os.path.join(bf.DOWNLOAD_DIR, TENDER_ID)
os.makedirs(save_dir, exist_ok=True)
result = {"file_name": DOC_NAME, "status": "failed", "type": "nit"}

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

    solved = False
    for attempt in range(1, 13):
        # fresh navigation to the doc link EACH time, so we always get a clean captcha page
        page.goto(nicgep_url, referer=page.url, timeout=20000, wait_until="domcontentloaded")
        href = bf._extract_href(page, "text_contains", DOC_NAME)
        if not href:
            set_status(f"NO LINK found for {DOC_NAME}"); break
        abs_url = urllib.parse.urljoin(page.url, href)
        try:
            with page.expect_download(timeout=6000) as dl_info:
                try:
                    page.goto(abs_url, referer=page.url, timeout=20000)
                except Exception:
                    pass
            download = dl_info.value
            path = os.path.join(save_dir, download.suggested_filename or DOC_NAME)
            download.save_as(path)
            result = {"file_name": DOC_NAME, "status": "downloaded_direct", "local_path": path, "type": "nit"}
            solved = True
            set_status(f"SUCCESS (direct) {DOC_NAME} -> {path}")
            break
        except PWTimeout:
            pass

        cap = page.locator("#captchaImage")
        if cap.count() == 0:
            set_status(f"attempt {attempt}: no captcha and no download — page state: {page.url}")
            time.sleep(2)
            continue

        img_bytes = cap.first.screenshot()
        open(CAP_IMG, "wb").write(img_bytes)
        set_status(f"WAITING_FOR_ANSWER doc={DOC_NAME} attempt={attempt} img={CAP_IMG}")
        ans = wait_for_answer(timeout=180)
        if not ans:
            set_status(f"TIMEOUT waiting for answer, attempt {attempt}"); break
        page.locator("#captchaText").fill(ans)
        try:
            with page.expect_download(timeout=8000) as dl_info:
                page.locator("#Submit").click()
            download = dl_info.value
            path = os.path.join(save_dir, download.suggested_filename or DOC_NAME)
            download.save_as(path)
            result = {"file_name": DOC_NAME, "status": "downloaded", "local_path": path, "type": "nit"}
            solved = True
            set_status(f"SUCCESS {DOC_NAME} -> {path}")
            break
        except PWTimeout:
            set_status(f"REJECTED answer '{ans}' for {DOC_NAME} (attempt {attempt}), re-navigating fresh...")
            continue
        except Exception as e:
            set_status(f"attempt {attempt} error: {e}")
            continue

    browser.close()

open(os.path.join(TMP, "manual_dl2_result.json"), "w").write(json.dumps(result, indent=2))
set_status("ALL_DONE")
print(json.dumps(result, indent=2))

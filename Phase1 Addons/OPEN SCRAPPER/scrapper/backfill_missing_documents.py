#!/usr/bin/env python3
"""
backfill_missing_documents.py — Document backfill scraper for Open Tenders (Endo + Diagno)

Walks open_tender_details row by row (most recently added first) for tenders that
were confirmed relevant but have no downloaded documents. For each row it opens
the tender's own tender_site_link (the state's NICGEP portal, e.g.
https://hptenders.gov.in/nicgep/app) — either directly, if the stored link
already points at a specific tender's detail page, or via the portal's own
SearchDescription/#Go search box otherwise — matches the correct row by its
NICGEP tender_id, solves whatever captcha NICGEP puts in the way, downloads
every NIT/work-item/corrigendum document (same n-try Ollama captcha loop used
across the rest of this pipeline), writes the results back to the row, and
moves on to the next tender missing documents.

Only rows with a non-empty tender_site_link are processed — rows with no site
link at all have nothing for this script to open and are left alone.
"""

import os
import re
import base64
import json
import time
import signal
import sys
import zipfile
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import mysql.connector

# "Ministry of Railways" tenders don't sit on a normal state NICGEP portal reachable via
# tender_site_link — they route through the CPPP Central mirror to an IREPS redirect
# token that has to be base64-decoded. That whole flow already exists and works in
# scrapper/run_cppp_railway_document_downloader.py, so it's reused here rather than
# re-implemented.
_SCRAPPER_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "scrapper"
)
if _SCRAPPER_DIR not in sys.path:
    sys.path.insert(0, _SCRAPPER_DIR)
import run_cppp_railway_document_downloader as railway_dl  # noqa: E402

# ── Configuration ──────────────────────────────────────────────────────────────
SCRAPER_NAME = "backfill_missing_documents"

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

BROWSER_ARGS = [
    "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-extensions", "--disable-background-networking",
    "--disk-cache-size=0", "--aggressive-cache-discard",
    "--disable-application-cache",
    "--disable-blink-features=AutomationControlled",
]

_SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(_SCRIPT_DIR, "tender_documents")

# ── Globals ────────────────────────────────────────────────────────────────────
_EXIT = False


def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── Progress tracking (resume from last tender on restart) ─────────────────────
PROGRESS_FILE = os.path.join(_SCRIPT_DIR, f"{SCRAPER_NAME}_progress.txt")


def load_completed() -> set:
    if not os.path.exists(PROGRESS_FILE):
        return set()
    with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip()}


def mark_done(tender_id: str):
    with open(PROGRESS_FILE, "a", encoding="utf-8") as f:
        f.write(tender_id + "\n")
        f.flush()
        os.fsync(f.fileno())


def clear_progress():
    try:
        if os.path.exists(PROGRESS_FILE):
            os.remove(PROGRESS_FILE)
    except Exception:
        pass


# ── Captcha ────────────────────────────────────────────────────────────────────
_CAPTCHA_DESCRIPTION_RE = re.compile(
    r'\b(image|blank|does not contain|no captcha|cannot|unable|sorry|'
    r'appears to be|unclear|too blurry|i\'?m not)\b', re.IGNORECASE
)


_LOCAL_OCR = None


def solve_captcha_local(image_bytes: bytes) -> str:
    """Solve the NICGEP image captcha offline with ddddocr (no cloud / rate limits)."""
    global _LOCAL_OCR
    try:
        if _LOCAL_OCR is None:
            import ddddocr
            _LOCAL_OCR = ddddocr.DdddOcr(show_ad=False)
        ans = re.sub(r'[^a-zA-Z0-9]', '', _LOCAL_OCR.classification(image_bytes))
        return ans if 4 <= len(ans) <= 8 else ""
    except Exception as e:
        log(f"    [CAPTCHA] Local OCR unavailable: {e}")
        return ""


def solve_captcha_with_ollama(image_bytes: bytes) -> str:
    local = solve_captcha_local(image_bytes)
    if local:
        return local
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    payload = json.dumps({
        "model": "gemma4:31b-cloud",
        "prompt": "This is a CAPTCHA image. Read the characters exactly as they appear, ignoring any noise, dots, or background distortions. Reply with only the captcha characters, nothing else.",
        "images": [image_b64],
        "stream": False
    }).encode("utf-8")
    url = "http://127.0.0.1:11434/api/generate"
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw = data.get("response", "").strip()
            if _CAPTCHA_DESCRIPTION_RE.search(raw):
                log(f"    [CAPTCHA] Ollama gave a description/refusal, not an answer: '{raw[:60]}'")
                return ""
            ans = re.sub(r'[^a-zA-Z0-9]', '', raw)
            if len(ans) > 10:
                log(f"    [CAPTCHA] Answer too long, likely leftover prose: '{ans[:60]}'")
                return ""
            return ans
    except Exception as e:
        log(f"    [CAPTCHA ERROR] Ollama request failed: {e}")
        return ""


def solve_generic_captcha(page, max_attempts: int = 20) -> bool:
    """Solve whichever NICGEP captcha widget is on the page right now — either the raw
    NICGEP one (#captchaImage/#captchaText/#Submit) or the CPPP-mirror Drupal one
    (data-drupal-selector variants) — and return True once it's gone (solved, or was
    never there)."""
    img = page.locator('img[data-drupal-selector="edit-captcha-image"], #captchaImage')
    if img.count() == 0:
        return True

    for attempt in range(1, max_attempts + 1):
        try:
            image_bytes = img.first.screenshot()
        except Exception as e:
            log(f"    [CAPTCHA] Could not capture image: {e}")
            return False
        answer = solve_captcha_with_ollama(image_bytes)
        if not answer:
            log(f"    [CAPTCHA] Attempt {attempt}/{max_attempts}: no usable answer — retrying")
            time.sleep(1.5)
            continue
        resp = page.locator("input#edit-captcha-response, input#captchaText")
        if resp.count() == 0:
            return True
        resp.first.fill(answer)
        submit = page.locator("input#edit-save, input#Submit, input[type='submit']")
        if submit.count() > 0:
            submit.first.click()
            time.sleep(2)
        img2 = page.locator('img[data-drupal-selector="edit-captcha-image"], #captchaImage')
        if img2.count() == 0:
            return True
        log(f"    [CAPTCHA] Attempt {attempt}/{max_attempts} rejected, retrying")
        img = img2
    return page.locator('img[data-drupal-selector="edit-captcha-image"], #captchaImage').count() == 0


# ── NICGEP detail page ─────────────────────────────────────────────────────────
def scrape_nicgep_detail(page) -> dict:
    data = {}
    try:
        for tr in page.locator("tr").all():
            tds = tr.locator("td").all()
            for i in range(len(tds) - 1):
                c = tds[i].get_attribute("class") or ""
                if "td_caption" in c:
                    label = tds[i].inner_text().strip().replace(":", "")
                    if not label:
                        continue
                    for j in range(i + 1, len(tds)):
                        nc = tds[j].get_attribute("class") or ""
                        if "td_field" in nc:
                            val = tds[j].inner_text().strip()
                            data[label] = val
                            break
        doc_links = []
        for a in page.locator("a[href*='component=%24DirectLink']").all():
            text = a.inner_text().strip()
            if text and (".pdf" in text.lower() or ".xls" in text.lower() or ".rar" in text.lower() or ".zip" in text.lower()):
                href = a.get_attribute("href")
                if href:
                    doc_links.append(urllib.parse.urljoin(page.url, href))
        if doc_links:
            data["_nicgep_doc_urls"] = doc_links
    except Exception as e:
        log(f"    [NICGEP SCRAPE ERROR] {e}")
    return data


# ── NICGEP document downloads (same fixed n-try Ollama loop as the rest of this pipeline) ──
def _extract_href(page, selector_type: str, selector_value: str, index: int = 0):
    soup = BeautifulSoup(page.content(), "html.parser")
    matches = []
    for a in soup.find_all("a", href=True):
        if selector_type == "href_contains" and selector_value in a["href"]:
            matches.append(a["href"])
        elif selector_type == "text_contains" and selector_value.lower() in a.get_text(strip=True).lower():
            matches.append(a["href"])
    return matches[index] if index < len(matches) else None


def _download_via_link(page, selector_type: str, selector_value: str,
                        save_dir: str, filename_hint: str, index: int = 0,
                        max_attempts: int = 40):
    os.makedirs(save_dir, exist_ok=True)

    def _try_download(action, timeout=15000):
        try:
            with page.expect_download(timeout=timeout) as dl_info:
                try:
                    action()
                except Exception:
                    pass
            download = dl_info.value
            path = os.path.join(save_dir, download.suggested_filename or filename_hint)
            download.save_as(path)
            log(f"      [DOWNLOAD] Saved: {path}")
            return path
        except PlaywrightTimeoutError:
            return None

    def _goto_extracted_link():
        href = _extract_href(page, selector_type, selector_value, index)
        if not href:
            log(f"      [DOWNLOAD] Link not found on page ({selector_type}={selector_value})")
            return None
        abs_url = urllib.parse.urljoin(page.url, href)
        return _try_download(lambda: page.goto(abs_url, referer=page.url, timeout=20000))

    path = _goto_extracted_link()
    if path:
        return path

    captcha_img = page.locator("#captchaImage")
    if captcha_img.count() == 0:
        log("      [DOWNLOAD] No download and no captcha appeared — giving up")
        return None
    log("      [DOWNLOAD CAPTCHA] Captcha page detected, solving...")

    for attempt in range(1, max_attempts + 1):
        try:
            image_bytes = captcha_img.first.screenshot()
        except Exception as e:
            log(f"      [DOWNLOAD CAPTCHA] Could not capture the image: {e}")
            return None
        answer = solve_captcha_with_ollama(image_bytes)
        if not answer:
            log(f"      [DOWNLOAD CAPTCHA] Attempt {attempt}/{max_attempts}: no usable answer — refreshing")
            if attempt < max_attempts:
                try:
                    page.locator("#captcha").click()
                    page.wait_for_timeout(1000)
                    continue
                except Exception:
                    return None
            return None
        log(f"      [DOWNLOAD CAPTCHA] Attempt {attempt}/{max_attempts}, answer: '{answer}'")
        page.locator("#captchaText").fill(answer)
        path = _try_download(lambda: page.locator("#Submit").click(), timeout=8000)
        if path:
            return path
        if page.locator("#captchaImage").count() == 0:
            log("      [DOWNLOAD CAPTCHA] Accepted — extracting link from returned page...")
            path = _goto_extracted_link()
            if path:
                return path
            log("      [DOWNLOAD CAPTCHA] Link not found/failed after acceptance")
            return None
        log(f"      [DOWNLOAD CAPTCHA] Attempt {attempt}/{max_attempts} rejected, refreshing...")
        if attempt < max_attempts:
            try:
                page.locator("#captcha").click()
                page.wait_for_timeout(1000)
            except Exception:
                return None
    return None


def download_nit_documents(page, nicgep_url: str, save_dir: str) -> list:
    results = []
    filenames = []
    for a in page.locator("a[href*='component=docDownoad']").all():
        text = a.inner_text().strip()
        filenames.append(text or f"nit_document_{len(filenames) + 1}.pdf")
    for i, filename_hint in enumerate(filenames):
        if i > 0:
            page.goto(nicgep_url, timeout=20000, wait_until="domcontentloaded")
        log(f"      [DOWNLOAD] NIT document: {filename_hint}")
        path = _download_via_link(page, "text_contains", filename_hint, save_dir, filename_hint)
        log(f"      [DOWNLOAD] NIT document {filename_hint}: {'OK -> ' + path if path else 'FAILED'}")
        results.append({
            "type": "nit", "file_name": filename_hint,
            "local_path": path, "status": "downloaded" if path else "failed",
        })
    return results


def _extract_zip(zip_path: str) -> list:
    extract_dir = os.path.dirname(zip_path)
    try:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(extract_dir)
            names = [n for n in zf.namelist() if not n.endswith("/")]
        os.remove(zip_path)
        return [os.path.join(extract_dir, name) for name in names]
    except zipfile.BadZipFile as e:
        log(f"      [DOWNLOAD] Zip extraction failed for {zip_path}: {e}")
        return []


def download_work_item_zip(page, save_dir: str, tender_id: str):
    zip_anchor = page.locator("a:has-text('Download as zip')").first
    if zip_anchor.count() == 0:
        return None
    filename_hint = f"{tender_id}_work_item_documents.zip"
    log("      [DOWNLOAD] Work Item Documents (zip)")
    path = _download_via_link(page, "text_contains", "Download as zip", save_dir, filename_hint)
    log(f"      [DOWNLOAD] Work Item zip: {'OK -> ' + path if path else 'FAILED'}")
    extracted_files = []
    if path:
        extracted_files = _extract_zip(path)
        log(f"      [DOWNLOAD] Extracted {len(extracted_files)} file(s), zip removed")
    return {
        "type": "work_item_zip", "file_name": filename_hint,
        "local_path": None if extracted_files else path,
        "status": "downloaded" if (extracted_files or path) else "failed",
        "extracted_files": extracted_files,
    }


# ── NICGEP corrigendum documents ───────────────────────────────────────────────
def scrape_corrigendum_documents(page, url: str, save_dir: str) -> list:
    docs = []
    corr_page = None
    try:
        corr_page = page.context.new_page()
        corr_page.goto(url, referer=page.url, timeout=20000, wait_until="domcontentloaded")
        table = corr_page.locator("table#corrDoctable")
        if table.count() == 0:
            return docs
        for row in table.first.locator("tr").all():
            row_class = row.get_attribute("class") or ""
            if "td_caption" in row_class:
                continue
            tds = row.locator("td").all()
            if len(tds) < 6:
                continue
            doc_entry = {
                "corr_no":          tds[0].inner_text().strip(),
                "title":            tds[1].inner_text().strip(),
                "description":      tds[2].inner_text().strip(),
                "published_date":   tds[3].inner_text().strip(),
                "document_size_kb": tds[5].inner_text().strip(),
            }
            link = tds[4].locator("a[href]").first
            doc_name = link.inner_text().strip() if link.count() > 0 else None
            doc_entry["document_name"] = doc_name
            local_path = None
            if doc_name:
                log(f"      [DOWNLOAD] Corrigendum document: {doc_name}")
                local_path = _download_via_link(corr_page, "text_contains", doc_name, save_dir, doc_name)
                log(f"      [DOWNLOAD] Corrigendum document {doc_name}: {'OK -> ' + local_path if local_path else 'FAILED'}")
            doc_entry["local_path"] = local_path
            docs.append(doc_entry)
    except Exception as e:
        log(f"      [CORRIGENDUM ERROR] {e}")
    finally:
        if corr_page:
            try:
                corr_page.close()
            except Exception:
                pass
    return docs


def scrape_corrigendums(page, save_dir: str) -> list:
    results = []
    table = page.locator("table#corrigendumDocumenttable")
    if table.count() == 0:
        return results
    for row in table.first.locator("tr").all():
        row_class = row.get_attribute("class") or ""
        if "list_header" in row_class:
            continue
        tds = row.locator("td").all()
        if len(tds) < 4:
            continue
        sno = tds[0].inner_text().strip()
        title = tds[1].inner_text().strip()
        ctype = tds[2].inner_text().strip()
        view_link = tds[3].locator("a[title='View Corrigendum History']").first
        if view_link.count() == 0:
            continue
        href = view_link.get_attribute("href")
        if not href:
            continue
        abs_url = urllib.parse.urljoin(page.url, href)
        log(f"      [CORRIGENDUM] {sno}. {title} ({ctype})")
        results.append({
            "corr_no": sno, "title": title, "type": ctype,
            "documents": scrape_corrigendum_documents(page, abs_url, save_dir),
        })
    return results


# ── Locating the right tender on its own portal ────────────────────────────────
def _parse_row_tender_id(td) -> str:
    full_text = td.inner_text().strip()
    # Bracket-wrapped format seen on several state portals:
    # "[refno] [refno][2026_HPSEB_142423_1]" — the tender ID is the last bracketed group.
    m = re.search(r'\[(\d{4}_[A-Za-z0-9]+_\d+_\d+)\]\s*$', full_text)
    if m:
        return m.group(1)
    a_el = td.locator("a").first
    if a_el.count() == 0:
        return ""
    title = a_el.inner_text().strip()
    trailing = full_text[len(title):].strip().lstrip("/")
    m = re.search(r'(\d{4}_[A-Za-z0-9]+_\d+_\d+)\s*$', trailing)
    if m:
        return m.group(1)
    parts = trailing.rsplit("/", 1)
    return parts[-1].strip() if parts else ""


def find_and_open_tender(page, base_url: str, target_tender_id: str, search_term: str) -> bool:
    """Search base_url's NICGEP home page for search_term via SearchDescription/#Go, find
    the results row whose parsed tender_id matches target_tender_id exactly, and click
    into it. Returns True if the matching tender's detail page was opened."""
    try:
        page.goto(base_url, timeout=60000, wait_until="domcontentloaded")
    except Exception as e:
        log(f"    [SEARCH] Could not open {base_url}: {e}")
        return False
    time.sleep(2)

    search_input = page.locator("input#SearchDescription")
    try:
        search_input.wait_for(state="visible", timeout=15000)
    except PlaywrightTimeoutError:
        log(f"    [SEARCH] No SearchDescription box on {base_url} — unsupported portal layout")
        return False
    search_input.fill("")
    search_input.fill(search_term)

    go_btn = page.locator("input#Go")
    try:
        go_btn.wait_for(state="visible", timeout=10000)
    except PlaywrightTimeoutError:
        log("    [SEARCH] No #Go button found")
        return False
    go_btn.click()
    time.sleep(3)

    content = page.content().lower()
    if "no tenders found" in content or "no record found" in content:
        log(f"    [SEARCH] No results for '{search_term}'")
        return False

    try:
        page.wait_for_selector("table#table.list_table", timeout=15000)
    except PlaywrightTimeoutError:
        log("    [SEARCH] Results table never appeared")
        return False

    rows = page.locator("table#table.list_table tr")
    for i in range(rows.count()):
        row = rows.nth(i)
        tds = row.locator("td")
        if tds.count() < 5:
            continue
        title_td = tds.nth(4)
        tid = _parse_row_tender_id(title_td)
        if tid == target_tender_id:
            link = title_td.locator("a").first
            link.click()
            time.sleep(2)
            return True

    log(f"    [SEARCH] '{target_tender_id}' not among results for '{search_term}'")
    return False


# ── Per-tender processing ───────────────────────────────────────────────────────
def process_railway_row(context, row: dict) -> dict:
    """Ministry of Railways tenders don't live on a normal state NICGEP portal — route
    them through the CPPP Central + IREPS-redirect-decode flow in
    run_cppp_railway_document_downloader.py instead of the generic site-link search."""
    tender_id = row["tender_id"]
    tender_refno = row["tender_refno"] or ""
    if not tender_refno:
        log(f"    [RAILWAY] No tender_refno for {tender_id} — cannot search CPPP Central")
        return {}

    page = context.new_page()
    try:
        if not railway_dl.search_by_refno(page, tender_refno):
            log(f"    [RAILWAY] No CPPP Central search results for refno '{tender_refno}'")
            return {}
        detail_page = railway_dl.open_detail_page(context, page, tender_refno, tender_id)
        if not detail_page:
            log(f"    [RAILWAY] Could not open detail page for {tender_id}")
            return {}
        try:
            doc_url = railway_dl.resolve_document_url(detail_page)
        finally:
            if detail_page is not page:
                try:
                    detail_page.close()
                except Exception:
                    pass
        if not doc_url:
            log(f"    [RAILWAY] Could not resolve a document URL for {tender_id}")
            return {}
        save_dir = os.path.join(DOWNLOAD_DIR, railway_dl._safe_dir_name(tender_id))
        result = railway_dl.download_document(context, doc_url, save_dir)
        result["type"] = "tender_document"
        if result.get("status") != "downloaded":
            log(f"    [RAILWAY] Download failed for {tender_id}: {result.get('reason')}")
            return {}
        log(f"    [RAILWAY] Downloaded: {result.get('file_name')}")
        return {"downloaded_documents": json.dumps([result], ensure_ascii=False)}
    finally:
        try:
            page.close()
        except Exception:
            pass


def process_row(page, row: dict) -> dict:
    tender_id = row["tender_id"]

    if _is_railway_org(row.get("organisation_name")):
        return process_railway_row(page.context, row)

    site_link = (row["tender_site_link"] or "").strip()
    if not site_link:
        return {}

    save_dir = os.path.join(DOWNLOAD_DIR, tender_id)
    opened = False

    if "tendersfullview" in site_link or "tnid=" in site_link:
        try:
            page.goto(site_link, timeout=30000, wait_until="domcontentloaded")
            opened = True
        except Exception as e:
            log(f"    [OPEN] Direct goto failed: {e}")

    if not opened:
        search_term = row["tender_refno"] or (row["tender_title"] or "")[:60]
        if not search_term:
            log(f"    [SKIP] No refno/title to search with for {tender_id}")
            return {}
        opened = find_and_open_tender(page, site_link, tender_id, search_term)

    if not opened:
        return {}

    if not solve_generic_captcha(page, max_attempts=20):
        log(f"    [CAPTCHA] Could not get past the detail-page captcha for {tender_id} — skipping")
        return {}

    try:
        page.wait_for_selector("div#tfullview, table#table.list_table", timeout=15000)
    except PlaywrightTimeoutError:
        pass

    nicgep_url = page.url
    details = scrape_nicgep_detail(page)
    doc_urls = details.pop("_nicgep_doc_urls", [])

    downloaded = download_nit_documents(page, nicgep_url, save_dir)
    zip_result = download_work_item_zip(page, save_dir, tender_id)
    if zip_result:
        downloaded.append(zip_result)

    corrigendum = scrape_corrigendums(page, save_dir)

    if not downloaded and not corrigendum and not doc_urls:
        log(f"    [RESULT] No documents found on {tender_id}'s page")
        return {}

    update = {}
    if downloaded:
        update["downloaded_documents"] = json.dumps(downloaded, ensure_ascii=False)
    if doc_urls:
        update["file_link"] = json.dumps(
            [{"url": u, "type": "tender_document"} for u in doc_urls], ensure_ascii=False
        )
    if corrigendum:
        update["corrigendum"] = json.dumps(corrigendum, ensure_ascii=False)
    if details:
        merged = dict(row.get("_existing_details") or {})
        merged.update(details)
        update["tender_details"] = json.dumps(merged, ensure_ascii=False)
    return update


def update_row(conn, tender_id: str, update: dict):
    if not update:
        return
    cols = list(update.keys())
    sql = f"UPDATE open_tender_details SET {', '.join(f'{c}=%s' for c in cols)} WHERE tender_id=%s"
    cur = conn.cursor()
    try:
        cur.execute(sql, [*update.values(), tender_id])
        conn.commit()
    except Exception as e:
        log(f"    [DB ERROR] {e}")
        conn.rollback()
    finally:
        cur.close()


def _is_railway_org(organisation_name: str) -> bool:
    # Seen both as "Ministry of Railways" and "Ministry of Railways (Ministry of Railways)".
    normalized = (organisation_name or "").split("(")[0].strip().lower()
    return normalized == "ministry of railways"


def fetch_candidates_for_dept(conn, dept: str) -> list:
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT tender_id, tender_refno, tender_title, tender_site_link, tender_details,
               organisation_name, row_id
        FROM open_tender_details
        WHERE dept = %s
          AND relevency_checker = 'proceed_futher'
          AND (downloaded_documents IS NULL OR downloaded_documents = '')
          AND (
                (tender_site_link IS NOT NULL AND tender_site_link != '')
                OR organisation_name LIKE 'Ministry of Railways%%'
              )
        ORDER BY created_at DESC
    """, (dept,))
    rows = cur.fetchall()
    cur.close()
    return rows


BATCH_SIZE = 10


def fetch_candidates(conn) -> list:
    """Interleave endo/diagno in batches of BATCH_SIZE (most-recently-added first within
    each dept): 10 endo, 10 diagno, 10 endo, 10 diagno, ... until both are exhausted."""
    endo = fetch_candidates_for_dept(conn, "endo")
    diagno = fetch_candidates_for_dept(conn, "diagno")
    ordered = []
    i = 0
    while i < len(endo) or i < len(diagno):
        ordered.extend(endo[i:i + BATCH_SIZE])
        ordered.extend(diagno[i:i + BATCH_SIZE])
        i += BATCH_SIZE
    return ordered


# How long to wait, once every currently-known tender has been processed, before
# checking the portal again for newly-added tenders that are still missing documents.
POLL_INTERVAL_SECONDS = 300  # 5 minutes


# ── Main ───────────────────────────────────────────────────────────────────────
def run(playwright):
    conn = mysql.connector.connect(**DB_CONFIG)
    log("MySQL connected.")

    browser = playwright.chromium.launch(headless=True, args=BROWSER_ARGS)
    context = browser.new_context(
        viewport={"width": 1280, "height": 900}, locale="en-US",
        ignore_https_errors=True, java_script_enabled=True,
        accept_downloads=True,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    )
    page = context.new_page()
    page.set_default_timeout(60000)
    page.on("dialog", lambda d: (log(f"[Dialog] {d.message[:80]}"), d.accept()))

    def _relaunch_browser():
        nonlocal browser, context, page
        try:
            context.close()
        except Exception:
            pass
        try:
            browser.close()
        except Exception:
            pass
        browser = playwright.chromium.launch(headless=True, args=BROWSER_ARGS)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900}, locale="en-US",
            ignore_https_errors=True, java_script_enabled=True,
            accept_downloads=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        page = context.new_page()
        page.set_default_timeout(60000)
        page.on("dialog", lambda d: (log(f"[Dialog] {d.message[:80]}"), d.accept()))

    browser_relaunches = 0
    max_browser_relaunches = 5

    def _run_one_pass():
        nonlocal browser_relaunches
        browser_relaunches = 0
        rows = fetch_candidates(conn)
        completed = load_completed()
        if completed:
            remaining = [r for r in rows if r["tender_id"] not in completed]
            if remaining:
                log(f"[RESUME] {len(completed)} tender(s) already done — "
                    f"resuming with {len(remaining)}/{len(rows)} remaining")
            rows = remaining

        if not rows:
            log(f"[IDLE] No tenders currently missing documents — "
                f"checking again in {POLL_INTERVAL_SECONDS}s...")
            clear_progress()
            return

        log(f"{len(rows)} tender(s) missing documents to process.")
        idx = 0
        fixed = 0
        while idx < len(rows):
            if _EXIT:
                break
            row = rows[idx]
            tender_id = row["tender_id"]
            log(f"[{idx + 1}/{len(rows)}] {tender_id} — {(row['tender_title'] or '')[:70]}")
            try:
                try:
                    row["_existing_details"] = json.loads(row["tender_details"]) if row["tender_details"] else {}
                except Exception:
                    row["_existing_details"] = {}
                update = process_row(page, row)
                if update:
                    update_row(conn, tender_id, update)
                    fixed += 1
                    log(f"    [SAVED] {list(update.keys())}")
                else:
                    log(f"    [SKIP] Nothing recovered for {tender_id}")
            except Exception as e:
                msg = str(e)
                if "has been closed" in msg or "Target page" in msg or "Target crashed" in msg:
                    browser_relaunches += 1
                    if browser_relaunches > max_browser_relaunches:
                        log(f"  [BROWSER DEAD] Too many relaunches ({max_browser_relaunches}) — "
                            f"backing off until the next check.")
                        break
                    log(f"  [BROWSER DEAD] Browser/context died on {tender_id}: {e} — "
                        f"relaunching (attempt {browser_relaunches}/{max_browser_relaunches}) and retrying...")
                    try:
                        _relaunch_browser()
                    except Exception as relaunch_err:
                        log(f"  [BROWSER DEAD] Relaunch failed: {relaunch_err} — backing off until the next check.")
                        break
                    continue  # retry the SAME tender, do not mark done, do not advance idx
                log(f"    [ERROR] {tender_id}: {e}")
            mark_done(tender_id)
            idx += 1
        if not _EXIT and idx >= len(rows):
            clear_progress()
        log(f"\n[PASS DONE] Processed {idx}/{len(rows)}  Documents recovered for: {fixed}")

    try:
        while not _EXIT:
            try:
                _run_one_pass()
            except Exception as e:
                log(f"[PASS ERROR] {e} — will try again after the usual wait.")

            if _EXIT:
                break
            # Sleep in short slices so a Ctrl+C / stop signal is honored promptly
            # instead of waiting out the full interval.
            for _ in range(POLL_INTERVAL_SECONDS):
                if _EXIT:
                    break
                time.sleep(1)
    except Exception as e:
        log(f"[FATAL] {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass
        try:
            context.close()
            browser.close()
        except Exception:
            pass


# ── ENTRY POINT ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    def _handle_signal(*_):
        global _EXIT
        _EXIT = True
        print(f"\n[{SCRAPER_NAME}] Signal received — stopping", flush=True)

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    log(f"=== {SCRAPER_NAME} starting ===")
    try:
        with sync_playwright() as playwright:
            run(playwright)
    except Exception as e:
        log(f"[ERROR] {e}")
    log(f"=== {SCRAPER_NAME} done ===")

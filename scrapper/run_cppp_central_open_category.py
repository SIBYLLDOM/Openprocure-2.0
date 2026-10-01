#!/usr/bin/env python3
"""
run_cppp_open_category.py — CPPP full-listing browse scraper

Modeled after run_gem_open_category.py (GeM), applied to CPPP Central Tenders:
instead of searching by keyword (cppp_central_diagno_scraper.py's approach),
this walks the "Latest Active Tenders" listing page by page and batches each page's
Tender Title / Ref No / Organisation / Dates through Ollama as a cheap pre-filter
against Meril's full product catalogue (Diagno + Endo).

Two-tier relevancy check per matched tender:
  1. Cheap check using only the listing table fields (Title / Org / State).
  2. If marked "check" (or title is vague/code-like), open the tender detail view
     (and optional NICGEP page / tender documents) for deep extraction, and re-run
     Ollama filter with full context for a final decision (Yes / Doubt / No).

Matches are saved into row_data_cppp_browse_all.csv and upserted into DB (cppp_tenders).
"""

import io
import os
import re
import csv
import time
import json
import base64
import signal
import asyncio
import argparse
import zipfile
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
import mysql.connector

import openscraper as osc

# ── Configuration ──────────────────────────────────────────────────────────────
SCRAPER_NAME = "cppp_browse_all"
CPPP_URL     = "https://eprocure.gov.in/cppp/latestactivetendersnew/cpppdata"
DEFAULT_DEPT = "unknown"
MAX_PAGES    = None  # e.g. 100 to cap; None = crawl until end

# ── Department filter (--dept diagno|endo|both) ─────────────────────────────────
# Set at startup by main(). Tenders the AI tags with a dept other than this filter
# (and not "both") are kept out of the DB/CSV for this run. "both" disables filtering.
DEPT_FILTER = "both"
OUTPUT_FILE = "row_data_cppp_browse_all.csv"
DOWNLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tender_documents")


def _dept_matches(effective_dept: str) -> bool:
    if DEPT_FILTER == "both":
        return True
    return effective_dept in (DEPT_FILTER, "both")

CSV_HEADERS = [
    "keyword", "dept", "s_no", "e_published_date", "closing_date",
    "opening_date", "tender_title", "tender_refno", "tender_id", "state_name",
    "filter_status", "filter_reason",
]

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

_EXIT  = False
_stats = {
    "pages_done": 0, "tenders_seen": 0, "prefilter_hits": 0, "deep_dives": 0,
    "records_saved": 0, "records_skipped": 0, "current_page": 0,
}

PRE_FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd.

You will be shown a batch of CPPP (Central Public Procurement Portal) tender listings —
each with a Tender Title, Reference No / ID, Organisation, and State Name. Using ONLY
these fields, decide for EACH tender whether it might be relevant to Meril's products —
this is a cheap first-pass filter, so be liberal: mark "skip" ONLY when confident from
the title alone that it has nothing to do with Meril's products.

{osc.MERIL_ALL_PRODUCTS}

Return "check" if the title might be relevant (mentions or hints at any product above,
is vague like "medical equipment", "lab consumables", "surgical items", or comes from a
hospital/lab/health department), or "skip" if the tender clearly indicates something
Meril does not sell (civil works, construction, IT/software, uniforms, food, vehicles, etc.).

Return ONLY valid JSON — no text outside the JSON. Format:
{{
  "results": [
    {{"tender_id": "<tender_id exactly as given>", "verdict": "check" | "skip", "category": "<likely Meril category or null>"}}
  ]
}}
One entry per tender in the batch, referenced by tender_id."""

CPPP_FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd (Diagno & Endo Divisions).

Decide whether a CPPP government tender is worth pursuing — does it ask for products that
Meril actually sells (Diagno IVD products OR Endo-Surgery products)?

{osc.MERIL_ALL_PRODUCTS}

DECISION RULES:
1. If the Tender Title / Work Description clearly mentions ANY of our products above → "Yes".
2. If the organisation is a HOSPITAL, DIAGNOSTIC LAB, or MEDICAL COLLEGE specifically
   (not just any government department) AND the title is vague about WHAT is being
   procured → "Doubt".
3. If you are unsure whether the ACTUAL ITEM matches our products → "Doubt".
4. Return "No" when there is no concrete evidence of a Diagno/Endo product — this
   includes:
   a. The organisation's own name signals civil/engineering/infrastructure work, not
      medical procurement — e.g. "Public Health ENGINEERING Department" (PHED/PHE) is
      a WATER SUPPLY & SANITATION engineering department, NOT a medical body, despite
      having "Health" in its name. Treat department names containing "Engineering",
      "PWD", "Irrigation", "Roads", "Municipal Corporation" civil wings, etc. as a
      NEGATIVE signal even if "Health" also appears in the name.
   b. The title is an AMC/maintenance/service contract that does NOT name a specific
      piece of equipment from the lists above — "Annual Maintenance Contract" alone,
      with no named analyzer/instrument, is NOT enough evidence; do not assume an
      unnamed "AMC" is for a Meril-relevant instrument just because the tender comes
      from a hospital-adjacent body.
   c. The title/reference is not descriptive at all (e.g. just a date range, a bare
      code, or boilerplate with no actual subject matter) — there being nothing to
      judge is NOT a reason to default to "Doubt"; it is a reason for "No", since
      there is no positive evidence either.

CRITICAL: "Yes" and "Doubt" both proceed; only "No" drops the tender entirely. This
          does NOT mean defaulting to "Doubt" whenever uncertain — rule 4 above lists
          concrete cases where uncertainty should resolve to "No", not "Doubt". A
          missed relevant tender is a business loss, but so is flooding the portal
          with irrelevant civil-engineering/water-supply/generic-AMC tenders tagged
          as Diagno/Endo — only genuinely ambiguous cases (real medical body,
          real hint of a matching product, just not enough detail yet) should be
          "Doubt".

DEPT RULE — MANDATORY whenever decision is "Yes" or "Doubt": you were just shown the
FULL Diagno product-category list AND the full Endo product-category list above. You
must pick EXACTLY ONE — "Diagno" if it matches something in the Diagno list, "Endo" if
it matches the Endo list. There is no "Both" option: if a tender's items span both
lists (rare), pick whichever division the PRIMARY/most prominent item belongs to —
never use "Both" as a way to avoid choosing. "Unknown"/null for dept is ONLY valid
when decision is "No" — a tender you are pushing through as relevant must never be
left dept-unclassified or dual-classified; if you truly cannot tell which single
division even after checking both lists, treat that itself as a signal the tender is
not actually relevant and reconsider "No" instead.

Return ONLY valid JSON — no text outside the JSON. Format:
{{
  "decision": "Yes" | "Doubt" | "No",
  "reason": "<one sentence: what the tender is for and why>",
  "dept": "Diagno" | "Endo" | "Unknown" | null,
  "category": "<most likely Meril product, or null>"
}}"""


# ── Logging ────────────────────────────────────────────────────────────────────
def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── CSV Utilities ──────────────────────────────────────────────────────────────
def init_csv(output_file: str):
    if not os.path.exists(output_file):
        with open(output_file, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(CSV_HEADERS)
        log(f"[INIT] Created {output_file}")


def append_csv(output_file: str, rows: list):
    with open(output_file, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)


# ── Captcha Solver (Ollama Vision) ─────────────────────────────────────────────
async def solve_captcha_with_ollama(image_bytes: bytes) -> str:
    loop = asyncio.get_event_loop()
    def _sync_call():
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        payload = json.dumps({
            "model": "gemma4:31b-cloud",
            "prompt": "This is a CAPTCHA image. Read the characters exactly as they appear, ignoring any noise or distortion. Reply with only the captcha characters, nothing else.",
            "images": [image_b64],
            "stream": False
        }).encode("utf-8")
        url = "http://127.0.0.1:11434/api/generate"
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                raw = data.get("response", "").strip()
                # When handed a half-loaded/unclear image, the model answers in
                # prose ("The image provided is a captcha showing characters...")
                # instead of refusing outright — stripping punctuation from that
                # turns it into garbage like "Theimageprovidedi" that then gets
                # typed into the captcha box as if it were a real guess. Reject
                # anything that looks like a description rather than an answer.
                if re.search(
                    r'\b(image|blank|does not contain|no captcha|cannot|unable|'
                    r'sorry|appears to be|unclear|too blurry|i\'?m not)\b',
                    raw, re.IGNORECASE,
                ):
                    log(f"[CAPTCHA] Model described instead of answering: {raw[:80]!r}")
                    return ""
                ans = re.sub(r'[^a-zA-Z0-9]', '', raw)
                if len(ans) > 10:
                    log(f"[CAPTCHA] Ignoring non-captcha-length reply: {raw[:80]!r}")
                    return ""
                return ans
        except Exception as e:
            log(f"[CAPTCHA ERROR] Ollama vision call failed: {e}")
            return ""
    return await loop.run_in_executor(None, _sync_call)


async def open_central_active_tenders(page) -> bool:
    """
    The CPPP landing page (CPPP_URL) shows a set of category tiles (State /
    Central / etc.) rather than the tender listing directly. Click the
    "Central - Active Tenders" tile to open the actual Central listing before
    scraping starts.
    """
    try:
        tile = page.locator("div.bg-danger", has_text="Central - Active Tenders")
        await tile.first.wait_for(state="visible", timeout=20000)
        await tile.first.click()
        log("[NAV] Clicked 'Central - Active Tenders' tile")
        await asyncio.sleep(2)
        return True
    except Exception as e:
        log(f"[NAV ERROR] Could not click 'Central - Active Tenders' tile: {e}")
        return False


async def handle_captcha_if_present(page) -> bool:
    # First check if tender table is already visible
    if await page.locator("table#table.list_table").count() > 0:
        return True

    img = page.locator('img[data-drupal-selector="edit-captcha-image"], #captchaImage')
    if await img.count() == 0:
        return True

    log("[CAPTCHA] Captcha detected on page, solving via vision model...")
    for attempt in range(1, 5):
        try:
            if await page.locator("table#table.list_table").count() > 0:
                return True
            image_bytes = await img.first.screenshot()
            answer = await solve_captcha_with_ollama(image_bytes)
            if not answer:
                log(f"[CAPTCHA] Attempt {attempt}: No answer returned, retrying in 3s...")
                await asyncio.sleep(3)
                continue
            log(f"[CAPTCHA] Attempt {attempt}: Answer '{answer}'")
            resp_field = page.locator("input#edit-captcha-response, input#captchaText")
            if await resp_field.count() > 0:
                await resp_field.first.fill(answer)
                submit_btn = page.locator("input#edit-save, input#Submit, input[type='submit']")
                if await submit_btn.count() > 0:
                    await submit_btn.first.click()
                    await asyncio.sleep(3)
                if await page.locator("table#table.list_table").count() > 0:
                    log("[CAPTCHA] Successfully solved and page loaded!")
                    return True
        except Exception as e:
            log(f"[CAPTCHA] Attempt {attempt} exception: {e}")
            await asyncio.sleep(3)

    if await page.locator("table#table.list_table").count() > 0:
        return True

    log("[CAPTCHA] Captcha automatic solving incomplete. Please enter captcha manually in browser window if needed.")
    try:
        await page.wait_for_selector("table#table.list_table", timeout=60000)
        return True
    except Exception:
        return False


# ── Detail-page captcha gate (2nd captcha) ──────────────────────────────────────
# eprocure.gov.in/cppp added a second Drupal image-captcha gate on individual
# tender detail pages (the "tendersfullview/<token>" link from the results
# table), shown before the real detail content (div#tfullview) loads. Same
# widget as the listing-page captcha, but a different submit control
# (input#edit-save instead of input#btnSearch).
async def _read_detail_captcha_answer(page) -> str:
    try:
        img = page.locator('img[data-drupal-selector="edit-captcha-image"]')
        await img.wait_for(state="visible", timeout=10000)
        image_bytes = await img.screenshot()
        answer = await solve_captcha_with_ollama(image_bytes)
        log(f"  [CAPTCHA-2] Answer: '{answer}'")
        return answer
    except Exception as e:
        log(f"  [CAPTCHA-2] Read failed: {e}")
        return ""


async def _fill_detail_captcha(page) -> bool:
    answer = await _read_detail_captcha_answer(page)
    if not answer:
        return False
    try:
        field = page.locator("input#edit-captcha-response")
        await field.wait_for(state="visible", timeout=5000)
        await field.fill("")
        await field.fill(answer)
        return True
    except Exception as e:
        log(f"  [CAPTCHA-2] Fill error: {e}")
        return False


async def _click_detail_submit_button(page) -> bool:
    for sel in ("input#edit-save", '[data-drupal-selector="edit-save"]',
                'input[type="submit"]', 'button[type="submit"]'):
        btn = page.locator(sel)
        if await btn.count() > 0:
            try:
                await btn.first.click(timeout=3000)
                return True
            except Exception:
                continue
    try:
        await page.locator("input#edit-captcha-response").press("Enter")
        return True
    except Exception:
        return False


async def solve_detail_page_captcha_if_present(page, max_retries: int = 3) -> bool:
    img = page.locator('img[data-drupal-selector="edit-captcha-image"]')
    try:
        await img.wait_for(state="visible", timeout=5000)
    except PlaywrightTimeoutError:
        return True  # no second captcha on this page — nothing to do

    for attempt in range(1, max_retries + 1):
        if not await _fill_detail_captcha(page):
            log(f"  [CAPTCHA-2] Read/fill failed (attempt {attempt}/{max_retries})")
            await asyncio.sleep(2)
            continue
        log(f"  [CAPTCHA-2] Solved (attempt {attempt}/{max_retries})")

        await _click_detail_submit_button(page)
        await asyncio.sleep(3)

        content = (await page.content()).lower()
        if ("the answer you entered for the captcha was not correct" in content
                or "wrong" in content or "invalid captcha" in content):
            log(f"  [CAPTCHA-2] Rejected by server (attempt {attempt}/{max_retries})")
            if await img.count() > 0:
                continue
            return False
        return True

    log("  [CAPTCHA-2] Failed after maximum retries.")
    return False


# ── Tender detail page (div#tfullview) + tender-document redirect ───────────────
async def scrape_cppp_detail_page(page) -> dict:
    """Scrape the CPPP tender detail page's key/value tables (div#tfullview)."""
    details = {}
    try:
        await page.wait_for_selector("div#tfullview", timeout=15000)
        tables = page.locator("div#tfullview table")
        for t in range(await tables.count()):
            rows = tables.nth(t).locator("tr")
            for r in range(await rows.count()):
                tds = rows.nth(r).locator("td")
                n = await tds.count()
                if n == 3:
                    label = (await tds.nth(0).inner_text()).strip().replace(":", "")
                    val_div = tds.nth(2).locator("div.event-dtl")
                    if await val_div.count() > 0:
                        value = (await val_div.first.inner_text()).strip()
                    else:
                        value = (await tds.nth(2).inner_text()).strip()
                    if label:
                        details[label] = value
                elif n == 6:
                    for li, vi in ((0, 2), (3, 5)):
                        label = (await tds.nth(li).inner_text()).strip().replace(":", "")
                        if label:
                            details[label] = (await tds.nth(vi).inner_text()).strip()
    except Exception as e:
        log(f"  [DETAIL ERROR] {e}")
    return details


async def click_tender_document_link(page):
    """
    Scroll down the CPPP tender detail page and click the tender DOCUMENT
    redirect link — <a class="tndr_redirect" href="https://eprocure.gov.in/
    cppp/tenderredirect/by/<token>">...</a> — which forwards to the
    originating portal (NICGEP, a state eProcurement site, CPWD's own
    etender site, etc. — varies per tender). May open in a new tab or
    navigate the current page; returns whichever page ends up holding the
    destination, or None if the link could not be found/clicked.
    """
    try:
        link = page.locator("a.tndr_redirect").first
        await link.scroll_into_view_if_needed(timeout=15000)
        await asyncio.sleep(1)

        try:
            async with page.context.expect_page(timeout=6000) as new_page_info:
                await link.click()
            new_page = await new_page_info.value
            await new_page.wait_for_load_state("domcontentloaded", timeout=20000)
            log(f"  [DOCUMENT] Clicked — opened new tab: {new_page.url}")
            return new_page
        except PlaywrightTimeoutError:
            pass  # no new tab — assume same-tab navigation

        await page.wait_for_load_state("domcontentloaded", timeout=20000)
        log(f"  [DOCUMENT] Clicked — navigated same tab: {page.url}")
        return page
    except Exception as e:
        log(f"  [DOCUMENT ERROR] Could not click tender document link: {e}")
        return None


async def click_external_tender_link(page):
    """
    The page landed on after clicking the tndr_redirect link shows the real
    external tender link — e.g. <a href="https://etenders.gov.in/eprocure/
    app?page=FrontEndTenderDetailsExternal&service=page&tnid=...">, inside a
    div.event-dtl block — which must be clicked to reach the actual
    NICGEP-style detail page. May open a new tab or navigate in place;
    returns whichever page ends up holding the destination. If no such link
    is found, returns None — the caller skips this tender and moves on
    rather than guessing at an unrelated page.
    """
    try:
        link = page.locator("a[href*='FrontEndTenderDetailsExternal']").first
        if await link.count() == 0:
            link = page.locator("div.event-dtl a[href^='http']").first
        if await link.count() == 0:
            log("  [DOCUMENT] No external tender link found — skipping this tender")
            return None

        await link.scroll_into_view_if_needed(timeout=15000)
        await asyncio.sleep(1)

        try:
            async with page.context.expect_page(timeout=6000) as new_page_info:
                await link.click()
            new_page = await new_page_info.value
            await new_page.wait_for_load_state("domcontentloaded", timeout=20000)
            log(f"  [DOCUMENT] Clicked external tender link — opened new tab: {new_page.url}")
            return new_page
        except PlaywrightTimeoutError:
            pass  # no new tab — assume same-tab navigation

        await page.wait_for_load_state("domcontentloaded", timeout=20000)
        log(f"  [DOCUMENT] Clicked external tender link — navigated same tab: {page.url}")
        return page
    except Exception as e:
        log(f"  [DOCUMENT ERROR] Could not click external tender link: {e}")
        return None


# ── Document downloads (3rd captcha gate, on the external/NICGEP-style portal) ──
def _safe_dir_name(tender_id) -> str:
    # Windows silently strips trailing dots/spaces when creating a file or directory
    # (Win32 API behavior) — a tender_id/title ending in "." (very common: it's a
    # sentence) would otherwise produce a save_dir string that never matches the real
    # on-disk folder name, so downloaded_documents paths saved to the DB would 404 when
    # the portal tries to serve them. Strip them here so the stored path is real.
    name = re.sub(r'[^A-Za-z0-9_.-]', '_', str(tender_id or "unknown"))
    name = name.rstrip('. ') or "unknown"
    # Windows' default MAX_PATH is 260 chars for the WHOLE path (this dir, plus a
    # filename, plus DOWNLOAD_DIR's own length) — a tender_id built from a long title
    # (no numeric ID pattern to shorten it) can blow well past that on its own, and
    # os.makedirs()/file writes then fail with WinError 3 "path not found" with no
    # earlier warning. Cap it here so the directory this produces always fits.
    return name[:80].rstrip('. _') or "unknown"


def _extract_zip_local(zip_path: str) -> list:
    extract_dir = os.path.dirname(zip_path)
    try:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(extract_dir)
            names = [n for n in zf.namelist() if not n.endswith("/")]
        os.remove(zip_path)
        return [os.path.join(extract_dir, name) for name in names]
    except zipfile.BadZipFile as e:
        log(f"  [DOWNLOAD] Zip extraction failed for {zip_path}: {e}")
        return []


async def scrape_external_tender_page(page) -> dict:
    """Flatten the external tender-details page into a flat label->value dict by
    pairing each td.td_caption cell with the next td.td_field cell in the same row —
    most Indian govt e-procurement destinations (NICGEP/GePNIC-based: state portals,
    CPWD, defence, PSUs) share this exact markup, so this works across the variety of
    sites a Central tender can redirect to. This is the flat shape the portal
    frontend's open-tender parser expects (tender_details[key], no nesting)."""
    data = {}
    try:
        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td")
            for i, td in enumerate(tds):
                if "td_caption" not in (td.get("class") or []):
                    continue
                label = td.get_text().strip().rstrip(":").strip()
                if not label:
                    continue
                for nd in tds[i + 1:]:
                    if "td_field" in (nd.get("class") or []):
                        data[label] = nd.get_text().strip()
                        break
    except Exception as e:
        data["_scrape_error"] = str(e)
    data["_url"] = page.url
    return data


async def solve_generic_captcha(page, max_attempts: int = 6) -> bool:
    """Solve a NIC/eProcure captcha (img#captchaImage) wherever it appears on the
    external tender-document page. Returns True once no captcha remains."""
    img = page.locator('#captchaImage')
    if await img.count() == 0 or not await img.first.is_visible():
        return True
    for attempt in range(1, max_attempts + 1):
        try:
            image_bytes = await img.first.screenshot()
            answer = await solve_captcha_with_ollama(image_bytes)
            if not answer:
                await asyncio.sleep(2)
                continue
            resp = page.locator("#captchaText")
            if await resp.count() == 0:
                return True
            await resp.first.fill(answer)
            submit = page.locator("#Submit")
            if await submit.count() > 0:
                await submit.first.click()
                await asyncio.sleep(2)
            img2 = page.locator('#captchaImage')
            if await img2.count() == 0 or not await img2.first.is_visible():
                return True
        except Exception as e:
            log(f"    [DOC-CAPTCHA] Attempt {attempt}/{max_attempts} exception: {e}")
            await asyncio.sleep(2)
    return False


def _extract_href(html: str, mode: str, value: str, index: int = 0):
    soup = BeautifulSoup(html, "html.parser")
    matches = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if mode == "href_contains" and value in href:
            matches.append(href)
        elif mode == "text_contains" and value.lower() in a.get_text().strip().lower():
            matches.append(href)
    return matches[index] if index < len(matches) else None


async def _try_download(page, action, timeout_ms: int = 15000):
    try:
        async with page.expect_download(timeout=timeout_ms) as dl_info:
            try:
                await action()
            except Exception:
                pass
        return await dl_info.value
    except Exception:
        return None


async def _save_download(download, save_dir: str, filename_hint: str) -> str:
    os.makedirs(save_dir, exist_ok=True)
    dest = os.path.join(save_dir, download.suggested_filename or filename_hint)
    await download.save_as(dest)
    log(f"  [DOWNLOAD] Saved: {dest}")
    return dest


async def _goto_extracted_link(page, mode: str, value: str, save_dir: str, filename_hint: str, index: int = 0):
    html = await page.content()
    href = _extract_href(html, mode, value, index)
    if not href:
        log(f"  [DOWNLOAD] Link not found on page ({mode}={value})")
        return None
    abs_url = urllib.parse.urljoin(page.url, href)
    referer = page.url
    download = await _try_download(page, lambda: page.goto(abs_url, timeout=20000, referer=referer))
    if download:
        return await _save_download(download, save_dir, filename_hint)
    return None


async def _download_via_link(page, mode: str, value: str, save_dir: str, filename_hint: str,
                              index: int = 0, max_attempts: int = 40) -> str:
    """Extract the link fresh from the current HTML and navigate to it directly
    (goto, not click) with an explicit Referer. If that lands on a captcha instead of
    a file, solve it (Ollama) and submit — either the submit itself downloads the
    file, or (once accepted) the link is re-extracted from the real page and
    navigated to.

    Keeps retrying with a fresh captcha image until Ollama gets one right rather than
    giving up after a small fixed count — a wrong/garbled read on one attempt says
    nothing about the next, fresh image. `max_attempts` is a sanity ceiling only."""
    os.makedirs(save_dir, exist_ok=True)

    dl_path = await _goto_extracted_link(page, mode, value, save_dir, filename_hint, index)
    if dl_path:
        return dl_path

    captcha_img = page.locator('#captchaImage')
    if await captcha_img.count() == 0:
        log("  [DOWNLOAD] No download and no captcha appeared — giving up")
        return None

    log("  [DOWNLOAD CAPTCHA] Captcha page detected, solving...")
    for attempt in range(1, max_attempts + 1):
        try:
            image_bytes = await captcha_img.first.screenshot()
        except Exception as e:
            log(f"  [DOWNLOAD CAPTCHA] Could not capture the image: {e}")
            return None
        answer = await solve_captcha_with_ollama(image_bytes)
        resp = page.locator("#captchaText")
        if await resp.count() == 0:
            return None

        if not answer:
            log(f"  [DOWNLOAD CAPTCHA] Attempt {attempt}/{max_attempts}: no usable answer — refreshing")
        else:
            log(f"  [DOWNLOAD CAPTCHA] Attempt {attempt}/{max_attempts}, answer: '{answer}'")
            await resp.first.fill(answer)
            submit_loc = page.locator("#Submit")
            download = await _try_download(page, submit_loc.click, timeout_ms=8000)
            if download:
                return await _save_download(download, save_dir, filename_hint)
            if await page.locator('#captchaImage').count() == 0:
                log("  [DOWNLOAD CAPTCHA] Accepted — extracting link from returned page...")
                dl_path = await _goto_extracted_link(page, mode, value, save_dir, filename_hint, index)
                if dl_path:
                    return dl_path
                log("  [DOWNLOAD CAPTCHA] Link not found/failed after acceptance")
                return None
            log(f"  [DOWNLOAD CAPTCHA] Attempt {attempt}/{max_attempts} rejected, refreshing...")

        if attempt < max_attempts:
            try:
                refresh = page.locator("#captcha")
                if await refresh.count() > 0:
                    await refresh.first.click()
                await asyncio.sleep(1)
            except Exception:
                return None
    log(f"  [DOWNLOAD CAPTCHA] Gave up after {max_attempts} attempts")
    return None


async def download_nit_documents(page, ext_url: str, tender_id, save_dir: str) -> list:
    """Download every individual document link (component=docDownoad) on the page."""
    results = []
    a_tags = page.locator("a[href*='component=docDownoad']")
    count = await a_tags.count()
    filenames = []
    for i in range(count):
        text = (await a_tags.nth(i).inner_text()).strip()
        filenames.append(text or f"nit_document_{len(filenames) + 1}.pdf")

    for i, filename_hint in enumerate(filenames):
        if i > 0:
            await page.goto(ext_url, timeout=20000, wait_until="domcontentloaded")
        log(f"  [DOWNLOAD] NIT document: {filename_hint}")
        dl_path = await _download_via_link(page, "text_contains", filename_hint, save_dir, filename_hint)
        log(f"  [DOWNLOAD] NIT document {filename_hint}: {'OK -> ' + dl_path if dl_path else 'FAILED'}")
        results.append({
            "type": "nit", "file_name": filename_hint,
            "local_path": dl_path, "status": "downloaded" if dl_path else "failed",
        })
    return results


async def download_work_item_zip(page, tender_id, save_dir: str) -> dict:
    zip_anchor = page.locator("a:has-text('Download as zip')").first
    if await zip_anchor.count() == 0:
        return None
    filename_hint = f"{_safe_dir_name(tender_id)}_work_item_documents.zip"
    log("  [DOWNLOAD] Work Item Documents (zip)")
    dl_path = await _download_via_link(page, "text_contains", "Download as zip", save_dir, filename_hint)
    log(f"  [DOWNLOAD] Work Item zip: {'OK -> ' + dl_path if dl_path else 'FAILED'}")

    extracted_files = []
    if dl_path:
        extracted_files = _extract_zip_local(dl_path)
        if extracted_files:
            log(f"  [DOWNLOAD] Extracted {len(extracted_files)} file(s), zip removed")

    return {
        "type": "work_item_zip", "file_name": filename_hint,
        "local_path": None if extracted_files else dl_path,
        "status": "downloaded" if (extracted_files or dl_path) else "failed",
        "extracted_files": extracted_files,
    }


PDF_ENRICH_SYSTEM_PROMPT = """You are extracting structured fields from an Indian government tender notice document (GePNIC/CPPP/NICGEP portal PDF text).

Given the raw extracted text of the tender document, return ONLY valid JSON with these
keys — use null for anything genuinely not stated in the text, do not guess:
{
  "Work Description": "...",
  "Processing Fee in ₹": "...",
  "Payment Mode": "...",
  "Contract Type": "...",
  "Withdrawal Allowed": "...",
  "Period Of Work(Days)": "...",
  "EMD Payable To": "...",
  "Bid Submission Start Date": "...",
  "Bid Submission End Date": "...",
  "NDA/Pre Qualification": "...",
  "Product Category": "...",
  "Item Categories": "<comma-separated list of the SPECIFIC items/materials/works/products actually being procured or constructed, e.g. 'PVC Pipes, Submersible Pumps, Water Meters' or 'Paving Blocks, Cement, Sand' — be concrete and specific, never just the department or scheme name>"
}
Return ONLY the JSON object, no other text, no markdown fences."""


def extract_pdf_text(path: str, max_chars: int = 10000) -> str:
    try:
        import pdfplumber
        parts = []
        total = 0
        with pdfplumber.open(path) as pdf:
            for p in pdf.pages:
                t = p.extract_text() or ""
                parts.append(t)
                total += len(t)
                if total >= max_chars:
                    break
        return "\n".join(parts)[:max_chars]
    except Exception as e:
        log(f"  [PDF] Text extraction failed for {path}: {e}")
        return ""


def enrich_details_from_pdf_text(pdf_text: str) -> dict:
    """Ask Ollama to fill in tender fields (esp. Item Categories/products) from the raw
    text of a downloaded tender PDF — the summary tables don't carry the actual
    item/product list, only the source document does."""
    if not pdf_text.strip():
        return {}
    messages = [
        {"role": "system", "content": PDF_ENRICH_SYSTEM_PROMPT},
        {"role": "user", "content": pdf_text[:8000]},
    ]
    for attempt in range(1, 4):
        try:
            raw = osc._ollama_call(messages)
            if not raw:
                time.sleep(3)
                continue
            result = osc._parse_json(raw)
            if result and isinstance(result, dict):
                return {k: v for k, v in result.items() if v not in (None, "", "null", "N/A")}
            time.sleep(2)
        except Exception as e:
            log(f"  [ENRICH] Attempt {attempt}/3 failed: {e}")
            time.sleep(2)
    return {}


def enrich_details_from_downloaded_docs(details: dict, downloaded_files: list) -> dict:
    pdf_paths = []
    for d in downloaded_files or []:
        lp = d.get("local_path")
        if lp and lp.lower().endswith(".pdf"):
            pdf_paths.append(lp)
        for ef in d.get("extracted_files") or []:
            if ef.lower().endswith(".pdf"):
                pdf_paths.append(ef)
    if not pdf_paths:
        return details

    combined_text = ""
    for p in pdf_paths[:2]:
        combined_text += extract_pdf_text(p) + "\n\n"
        if len(combined_text) >= 8000:
            break

    enrichment = enrich_details_from_pdf_text(combined_text)
    for k, v in enrichment.items():
        if k == "Item Categories" or not details.get(k):
            details[k] = v
    return details


async def download_all_documents(page, ext_url: str, tender_id, save_dir: str) -> list:
    """Download every document link on the external tender page — individual NIT
    documents plus the work-item zip — retrying failed NIT docs once more after the
    zip attempt (a captcha solve sometimes resets session state helpfully)."""
    downloaded = await download_nit_documents(page, ext_url, tender_id, save_dir)
    zip_result = await download_work_item_zip(page, tender_id, save_dir)
    if zip_result:
        downloaded.append(zip_result)

    failed_nit = [d for d in downloaded if d["type"] == "nit" and d["status"] == "failed"]
    if failed_nit:
        log(f"  [DOWNLOAD] Retrying {len(failed_nit)} failed NIT document(s) after zip...")
        try:
            await page.goto(ext_url, timeout=20000, wait_until="domcontentloaded")
            retry_results = await download_nit_documents(page, ext_url, tender_id, save_dir)
            retry_by_name = {r["file_name"]: r for r in retry_results}
            downloaded = [retry_by_name.get(d["file_name"], d) if d["type"] == "nit" else d for d in downloaded]
        except Exception as e:
            log(f"  [DOWNLOAD] NIT retry pass failed: {e}")

    return downloaded


async def open_detail_and_scrape(context, href: str, tender_id: str) -> dict:
    """
    Full CPPP deep-dive for a tender already judged relevant (or "Doubt"):
      1. Open its detail page (solving the 2nd captcha gate if shown).
      2. Scroll down and click the tender DOCUMENT redirect link
         (a.tndr_redirect) — lands on an intermediate page.
      3. On that page, click the real external tender link (e.g. an
         etenders.gov.in FrontEndTenderDetailsExternal link, usually inside
         a div.event-dtl block) to reach the originating portal.
      4. Solve whatever captcha gate that portal shows (same widget family
         eprocure.gov.in uses elsewhere; a no-op if none appears).
      5. Scrape the external page into a flat label/value dict (merged over
         the CPPP detail-page fields — the external portal has the fuller
         picture: payment mode, EMD, work item details, dates, etc.).
      6. Download every document on that page (individual NIT docs + the
         work-item zip), then read the PDFs through Ollama to fill in the
         Item Categories/product list the summary tables never carry.
    """
    if not href:
        return {}
    url = "https://eprocure.gov.in" + href if href.startswith("/") else href
    opened_pages = []  # every distinct page opened along the way, for cleanup
    try:
        detail_page = await context.new_page()
        opened_pages.append(detail_page)
        await detail_page.goto(url, referer=CPPP_URL, timeout=20000, wait_until="domcontentloaded")

        if not await solve_detail_page_captcha_if_present(detail_page):
            log(f"  [DETAIL ERROR] Detail-page captcha not solved for {url}")
            return {}

        content = await detail_page.content()
        if "Invalid Url" in content:
            log(f"  [DETAIL ERROR] Server returned 'Invalid Url' for {url}")
            return {}

        details = await scrape_cppp_detail_page(detail_page)

        # The CPPP detail table's own "Tender Document" field already contains the
        # real external NICGEP-style URL as plain text (verified live: e.g.
        # "https://defproc.gov.in/nicgep/app?...tnid=..."), exactly like the States
        # crawl found on its detail pages. Use that directly — far more reliable than
        # the tndr_redirect -> external-link click chain, which depends on a specific
        # anchor being present/visible and has been seen to time out.
        ext_page = None
        doc_field = (details.get("Tender Document") or "").strip()
        if doc_field.startswith("http"):
            try:
                ext_page = await context.new_page()
                opened_pages.append(ext_page)
                await ext_page.goto(doc_field, referer=detail_page.url, timeout=20000,
                                     wait_until="domcontentloaded")
            except Exception as e:
                log(f"  [DOCUMENT] Direct navigation to Tender Document URL failed: {e}")
                ext_page = None

        if not ext_page:
            doc_page = await click_tender_document_link(detail_page)
            if not doc_page:
                return details
            if doc_page not in opened_pages:
                opened_pages.append(doc_page)

            ext_page = await click_external_tender_link(doc_page)
            if not ext_page:
                log(f"  [SKIP] {tender_id}: no external tender link on redirect landing page — skipping to next tender")
                return details
            if ext_page not in opened_pages:
                opened_pages.append(ext_page)

        if not await solve_detail_page_captcha_if_present(ext_page):
            log(f"  [DETAIL ERROR] External-page captcha not solved for {ext_page.url}")
            details["_tender_site_link"] = ext_page.url
            return details

        ext_details = await scrape_external_tender_page(ext_page)
        details.update({k: v for k, v in ext_details.items() if v})
        details["_tender_site_link"] = ext_page.url

        save_dir = os.path.join(DOWNLOAD_DIR, _safe_dir_name(tender_id))
        downloaded = await download_all_documents(ext_page, ext_page.url, tender_id, save_dir)
        if downloaded:
            details["_downloaded_documents"] = downloaded
            details = enrich_details_from_downloaded_docs(details, downloaded)

        return details
    except Exception as e:
        log(f"  [DETAIL ERROR] {e}")
        return {}
    finally:
        for p in opened_pages:
            try:
                await p.close()
            except Exception:
                pass


# ── Database Operations ────────────────────────────────────────────────────────
# Maps the flat label keys produced by scrape_cppp_detail_page()/scrape_external_
# tender_page() to the dedicated open_tender_details columns that exist for exactly
# this purpose in the production schema (see open_tender_details.sql) — tender_details
# JSON is what the portal's current frontend parser reads, but the table itself is
# designed to carry these as first-class columns too, so both must be kept in sync.
DETAILS_TO_COLUMNS = {
    "Withdrawal Allowed": "withdrawal_allowed",
    "Tender Type": "tender_type",
    "Form Of Contract": "form_of_contract",
    "Tender Category": "tender_category",
    "No. of Covers": "no_of_covers",
    "General Technical Evaluation Allowed": "general_technical_evaluation_allowed",
    "ItemWise Technical Evaluation Allowed": "itemwise_technical_evaluation_allowed",
    "Payment Mode": "payment_mode",
    "Is Multi Currency Allowed For BOQ": "multi_currency_allowed_boq",
    "Is Multi Currency Allowed For Fee": "multi_currency_allowed_fee",
    "Allow Two Stage Bidding": "two_stage_bidding_allowed",
    "EMD Amount in ₹": "emd_amount",
    "Title": "work_item_title",
    "Work Description": "work_description",
    "NDA/Pre Qualification": "nda_pre_qualification",
    "Independent External Monitor/Remarks": "independent_external_monitor_remarks",
    "Tender Value in ₹": "tender_value",
    "Product Category": "product_category",
    "Sub category": "sub_category",
    "Contract Type": "contract_type",
    "Bid Validity(Days)": "bid_validity_days",
    "Period Of Work(Days)": "period_of_work_days",
    "Location": "location",
    "Pincode": "pincode",
    "Pre Bid Meeting Place": "pre_bid_meeting_place",
    "Pre Bid Meeting Address": "pre_bid_meeting_address",
    "Pre Bid Meeting Date": "pre_bid_meeting_date",
    "Bid Opening Place": "bid_opening_place",
    "Should Allow NDA Tender": "nda_tender_allowed",
    "Allow Preferential Bidder": "preferential_bidder_allowed",
    "Published Date": "nicgep_published_date",
    "Bid Opening Date": "bid_opening_date",
    "Document Download / Sale Start Date": "doc_download_start_date",
    "Document Download / Sale End Date": "doc_download_end_date",
    "Clarification Start Date": "clarification_start_date",
    "Clarification End Date": "clarification_end_date",
    "Bid Submission Start Date": "bid_submission_start_date",
    "Bid Submission End Date": "bid_submission_end_date",
}
_COLUMN_MAXLEN = {
    "withdrawal_allowed": 10, "tender_type": 100, "form_of_contract": 100,
    "tender_category": 100, "no_of_covers": 10, "general_technical_evaluation_allowed": 10,
    "itemwise_technical_evaluation_allowed": 10, "payment_mode": 50,
    "multi_currency_allowed_boq": 10, "multi_currency_allowed_fee": 10,
    "two_stage_bidding_allowed": 10, "emd_amount": 50, "work_item_title": 500,
    "tender_value": 50, "product_category": 255, "sub_category": 255,
    "contract_type": 100, "bid_validity_days": 20, "period_of_work_days": 20,
    "location": 255, "pincode": 20, "pre_bid_meeting_place": 255,
    "pre_bid_meeting_address": 500, "pre_bid_meeting_date": 50, "bid_opening_place": 255,
    "nda_tender_allowed": 10, "preferential_bidder_allowed": 10,
    "nicgep_published_date": 50, "bid_opening_date": 50, "doc_download_start_date": 50,
    "doc_download_end_date": 50, "clarification_start_date": 50, "clarification_end_date": 50,
    "bid_submission_start_date": 50, "bid_submission_end_date": 50,
}


def details_to_column_values(details: dict) -> dict:
    out = {}
    if not details:
        return out
    for label, col in DETAILS_TO_COLUMNS.items():
        v = details.get(label)
        if v is None or v == "" or v == "NA":
            continue
        v = str(v)
        maxlen = _COLUMN_MAXLEN.get(col)
        if maxlen and len(v) > maxlen:
            v = v[:maxlen]
        out[col] = v
    return out


def db_save_tenders(records: list) -> int:
    if not records:
        return 0
    saved = 0
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        column_names = list(DETAILS_TO_COLUMNS.values())
        query_open_tenders = f"""
        INSERT INTO open_tender_details (
            state, organisation_name, e_published_date, closing_date,
            opening_date, tender_title, tender_refno, tender_id,
            organisation_chain, tender_details, file_link, tender_page_link,
            tender_site_link, relevency_checker, relevancy_reason, dept,
            downloaded_documents, corrigendum, searched_keyword,
            {", ".join(column_names)}
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            {", ".join(["%s"] * len(column_names))}
        )
        ON DUPLICATE KEY UPDATE
            state = VALUES(state),
            organisation_name = VALUES(organisation_name),
            e_published_date = VALUES(e_published_date),
            closing_date = VALUES(closing_date),
            opening_date = VALUES(opening_date),
            tender_title = VALUES(tender_title),
            tender_refno = VALUES(tender_refno),
            organisation_chain = VALUES(organisation_chain),
            tender_details = VALUES(tender_details),
            file_link = VALUES(file_link),
            tender_page_link = VALUES(tender_page_link),
            tender_site_link = VALUES(tender_site_link),
            relevency_checker = VALUES(relevency_checker),
            relevancy_reason  = VALUES(relevancy_reason),
            dept              = VALUES(dept),
            downloaded_documents = VALUES(downloaded_documents),
            corrigendum       = VALUES(corrigendum),
            searched_keyword  = VALUES(searched_keyword),
            {", ".join(f"{c} = VALUES({c})" for c in column_names)},
            updated_at        = CURRENT_TIMESTAMP
        """

        query_processing_results = """
        INSERT INTO tender_processing_results (bid_no, tender_title, result)
        VALUES (%s, %s, "yes")
        ON DUPLICATE KEY UPDATE tender_title = VALUES(tender_title)
        """

        for r in records:
            column_values = details_to_column_values(r.get("_details_raw"))
            vals = (
                r.get("state"), r.get("organisation_name"), r.get("e_published_date"),
                r.get("closing_date"), r.get("opening_date"), r.get("tender_title"),
                r.get("tender_refno"), r.get("tender_id"), r.get("organisation_chain"),
                r.get("tender_details"), r.get("file_link"), r.get("tender_page_link"),
                r.get("tender_site_link"), r.get("relevency_checker"), r.get("relevancy_reason"),
                r.get("dept"), r.get("downloaded_documents"), r.get("corrigendum"),
                r.get("keyword", "browse_all"),
                *[column_values.get(c) for c in column_names],
            )
            cursor.execute(query_open_tenders, vals)

            # Insert into tender_processing_results (same dual-table insert behavior as gem.py)
            tid = r.get("tender_id")
            title = r.get("tender_title")
            if tid and title:
                try:
                    cursor.execute(query_processing_results, (tid, title))
                except Exception as pe:
                    log(f"[DB WARN] tender_processing_results upsert skipped for {tid}: {pe}")

            saved += 1

        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        log(f"[DB ERROR] Failed to save CPPP tenders: {e}")
    return saved


# ── Tier 1: Page-Level Pre-Filter (Ollama) ─────────────────────────────────────
def _build_prefilter_message(rows: list) -> str:
    lines = ["Tenders to screen:\n"]
    for r in rows:
        lines.append(
            f'- tender_id: "{r["tid"]}" | title: "{r["title"]}" | '
            f'refno: "{r["refno"]}" | org: "{r["state_name"]}"'
        )
    lines.append("\nReturn ONLY the JSON object as specified in the system prompt.")
    return "\n".join(lines)


def _prefilter_page_sync(rows: list) -> dict:
    if not rows:
        return {}
    messages = [
        {"role": "system", "content": PRE_FILTER_SYSTEM_PROMPT},
        {"role": "user", "content": _build_prefilter_message(rows)},
    ]
    for attempt in range(1, 4):
        try:
            raw = osc._ollama_call(messages)
            if not raw:
                time.sleep(5 * attempt)
                continue
            result = osc._parse_json(raw)
            if result and isinstance(result, dict) and isinstance(result.get("results"), list):
                matches = {}
                for entry in result["results"]:
                    tid = str(entry.get("tender_id", "")).strip()
                    if tid and entry.get("verdict") == "check":
                        matches[tid] = entry.get("category")
                return matches
            time.sleep(2)
        except Exception as e:
            log(f"  [PREFILTER] Attempt {attempt}/3 failed: {e}")
            time.sleep(3)
    log("  [PREFILTER] All attempts failed — defaulting to 'check all' on page")
    return {r["tid"]: None for r in rows}


# ── Tier 2: Deep-Dive Filter ───────────────────────────────────────────────────
def _filter_tender_sync(title: str, org: str, state: str, refno: str,
                        tid: str, details: dict = None, doc_text: str = None) -> dict:
    lines = [
        f'Tender ID        : {tid}',
        f'Tender Reference : {refno}',
        f'Organisation     : {org}',
        f'State            : {state}',
        f'Title            : {title}',
    ]
    if details:
        work_desc = details.get("Work Description", "").strip()
        if work_desc:
            lines += ["", f"Work Description : {work_desc[:1000]}"]
    if doc_text:
        lines += ["", f"Extracted Document Text: {doc_text[:3000]}"]

    lines += ["", "Return ONLY the JSON decision object as specified in the system prompt."]
    messages = [
        {"role": "system", "content": CPPP_FILTER_SYSTEM_PROMPT},
        {"role": "user", "content": "\n".join(lines)},
    ]
    for attempt in range(1, 4):
        try:
            raw = osc._ollama_call(messages)
            if not raw:
                time.sleep(5 * attempt)
                continue
            result = osc._parse_json(raw)
            if result and isinstance(result, dict) and "decision" in result:
                return result
            time.sleep(2)
        except Exception as e:
            log(f"    [FILTER/LLM] Attempt {attempt}/3 failed: {e}")
            time.sleep(3)
    return {"decision": "Doubt", "reason": "LLM unavailable — marked relevant for safety."}


async def process_tender(row: dict, page_context, executor: ThreadPoolExecutor) -> tuple:
    """Title-only Tier 2 filter first. A clear "Yes" or "No" goes straight to its
    verdict — no page is opened, no captcha solved, no document downloaded. Only a
    "Doubt" (or a too-short/code-like title) earns the deep-dive: detail page +
    NICGEP-style hop + document download + PDF re-verification, matching the
    two-tier design used for the CPPP States crawl."""
    loop = asyncio.get_event_loop()

    result = await loop.run_in_executor(
        executor, _filter_tender_sync, row["title"], row["state_name"],
        row["state_name"], row["refno"], row["tid"]
    )
    decision = result.get("decision", "Doubt")

    details = {}
    if decision == "Doubt" or len(row["title"]) < 10:
        _stats["deep_dives"] += 1
        if row.get("href"):
            details = await open_detail_and_scrape(page_context, row["href"], row["tid"])
        result = await loop.run_in_executor(
            executor, _filter_tender_sync, row["title"], row["state_name"],
            row["state_name"], row["refno"], row["tid"], details
        )
        decision = result.get("decision", "Doubt")

    reason   = result.get("reason", "")
    dept_tag = result.get("dept")
    category = result.get("category")
    if dept_tag and dept_tag not in ("Unknown", "Both"):
        effective_dept = dept_tag.lower()
    elif decision != "No":
        # LLM said relevant but left dept unset despite the prompt's instruction not
        # to — fall back to matching the returned category against the real Diagno/
        # Endo category lists in code, rather than just accepting "unknown".
        effective_dept = osc.infer_dept_from_category(category) or DEFAULT_DEPT
    else:
        effective_dept = DEFAULT_DEPT
    status = "no" if decision == "No" else "proceed_futher"

    return status, effective_dept, reason, category, details


# ── Title Cell Parsing ─────────────────────────────────────────────────────────
def parse_title_cell_data(text: str, href: str) -> tuple:
    title = text.strip()
    m = re.search(r'(\d{4}_[A-Za-z0-9]+_\d+_\d+)\s*$', title)
    if m:
        tender_id = m.group(1)
        refno     = title[:m.start()].strip().strip("/").strip()
    else:
        # No embedded numeric tender ID — using just the last "/"-segment as
        # tender_id collides across unrelated tenders that happen to share a
        # trailing fragment (e.g. two different titles both ending "/...Works"
        # would both save under tender_id "Works"), so use the full title instead.
        # The portal's backend (tenders.controller.js getTenderDetails) looks up
        # open_tender_details by tender_id with slashes replaced by underscores,
        # so store it that way too — keep refno as the raw slash form for display.
        tender_id = title.replace("/", "_")
        refno     = title
    return title, refno, tender_id, href


# ── Page Table Parsing ─────────────────────────────────────────────────────────
async def parse_page_rows(page) -> list:
    rows = []
    try:
        await page.wait_for_selector("table#table.list_table", timeout=20000)
        tr_locators = page.locator("table#table.list_table tbody tr")
        count = await tr_locators.count()
        for idx in range(count):
            row = tr_locators.nth(idx)
            tds = row.locator("td")
            if await tds.count() < 6:
                continue
            s_no = (await tds.nth(0).inner_text()).strip()
            if not s_no:
                continue
            
            e_pub   = (await tds.nth(1).inner_text()).strip()
            closing = (await tds.nth(2).inner_text()).strip()
            opening = (await tds.nth(3).inner_text()).strip()
            
            title_td = tds.nth(4)
            a_el     = title_td.locator("a").first
            if await a_el.count() > 0:
                raw_title = (await a_el.inner_text()).strip()
                href      = (await a_el.get_attribute("href")) or ""
            else:
                raw_title = (await title_td.inner_text()).strip()
                href      = ""
                
            state_name = (await tds.nth(5).inner_text()).strip()
            title, refno, tid, href = parse_title_cell_data(raw_title, href)
            if not tid:
                tid = f"CPPP_{s_no}_{int(time.time())}"
                
            rows.append({
                "s_no": s_no, "e_pub": e_pub, "closing": closing, "opening": opening,
                "title": title, "refno": refno, "tid": tid, "href": href,
                "state_name": state_name,
            })
    except Exception as e:
        log(f"[PARSE ERROR] {e}")
    return rows


async def goto_next_page(page) -> bool:
    try:
        next_btns = page.locator("div.pagination a.paginate_button")
        count = await next_btns.count()
        for idx in range(count):
            btn = next_btns.nth(idx)
            text = (await btn.inner_text()).strip().lower()
            if "next" in text and await btn.is_visible():
                # The site can throw a fresh captcha challenge mid-crawl instead of
                # the next page of results — wait for EITHER the table or a captcha
                # to appear, and solve the captcha if it's there before giving up.
                await btn.click(no_wait_after=True)
                await asyncio.sleep(2)
                try:
                    await page.wait_for_selector(
                        "table#table.list_table, img[data-drupal-selector='edit-captcha-image'], #captchaImage",
                        timeout=90000,
                    )
                except PlaywrightTimeoutError:
                    log("[PAGINATION] Timed out waiting for next page to load")
                    return False
                if not await handle_captcha_if_present(page):
                    log("[PAGINATION] Captcha appeared after 'Next' and could not be solved")
                    return False
                await asyncio.sleep(1.5)
                return True
    except Exception as e:
        log(f"[PAGINATION ERROR] {e}")
    return False


# ── Per-Page Processing ────────────────────────────────────────────────────────
def _is_non_descriptive_title(title: str) -> bool:
    """True for titles with no real subject matter — bare date ranges, short codes,
    etc. — that give the AI nothing concrete to judge. Reject these outright instead
    of spending an AI call on them (left to the AI, "not enough info" tends to default
    to Doubt, letting pure noise through as relevant)."""
    t = title.strip()
    if len(t) < 8:
        return True
    if re.fullmatch(r'[\d\-\/\s.]+', t):
        return True
    return False


async def process_page(rows: list, context, executor: ThreadPoolExecutor, page_num: int) -> list:
    if not rows:
        return []

    loop = asyncio.get_event_loop()
    _stats["tenders_seen"] += len(rows)

    ai_rows = [r for r in rows if not _is_non_descriptive_title(r["title"])]
    garbage_rows = [r for r in rows if _is_non_descriptive_title(r["title"])]
    matches = await loop.run_in_executor(executor, _prefilter_page_sync, ai_rows)
    _stats["prefilter_hits"] += len(matches)
    log(f"  Page {page_num}: {len(rows)} tenders, {len(matches)} flagged by pre-filter"
        f"{f' ({len(garbage_rows)} non-descriptive titles skipped)' if garbage_rows else ''}")

    csv_rows, db_records = [], []
    for row in garbage_rows:
        csv_rows.append([
            "browse_all", DEFAULT_DEPT, row["s_no"], row["e_pub"], row["closing"],
            row["opening"], row["title"], row["refno"], row["tid"], row["state_name"],
            "no", "Title has no descriptive subject matter to evaluate (bare code/date range)",
        ])
    for row in ai_rows:
        if row["tid"] not in matches:
            csv_rows.append([
                "browse_all", DEFAULT_DEPT, row["s_no"], row["e_pub"], row["closing"],
                row["opening"], row["title"], row["refno"], row["tid"], row["state_name"],
                "prefiltered_no", "Skipped by page-level title pre-filter",
            ])
            continue

        try:
            status, dept, reason, category, details = await process_tender(row, context, executor)
        except Exception as e:
            log(f"    [SKIP] {row['tid']}: {e}")
            continue

        keyword_label = category or matches.get(row["tid"]) or "browse_all"
        csv_rows.append([
            keyword_label, dept, row["s_no"], row["e_pub"], row["closing"],
            row["opening"], row["title"], row["refno"], row["tid"], row["state_name"],
            status, reason,
        ])

        if status == "no":
            _stats["records_skipped"] += 1
            continue

        if not _dept_matches(dept):
            _stats["records_skipped"] += 1
            continue

        tender_page_link = ("https://eprocure.gov.in" + row["href"]) if row["href"].startswith("/") else row["href"]
        tender_site_link = details.pop("_tender_site_link", None)
        downloaded_documents = details.pop("_downloaded_documents", None)
        db_records.append({
            "state":              row["state_name"],
            "organisation_name":  row["state_name"],
            "e_published_date":   row["e_pub"],
            "closing_date":       row["closing"],
            "opening_date":       row["opening"],
            "tender_title":       row["title"],
            "tender_refno":       row["refno"],
            "tender_id":          row["tid"][:95],  # column is varchar(100)
            "organisation_chain": row["state_name"],
            "tender_details":     json.dumps(details, ensure_ascii=False) if details else None,
            "_details_raw":       details,
            "file_link":          None,
            "tender_page_link":   tender_page_link,
            "tender_site_link":   tender_site_link,
            "relevency_checker":  status,
            "relevancy_reason":   reason,
            "dept":               dept,
            "downloaded_documents": json.dumps(downloaded_documents, ensure_ascii=False) if downloaded_documents else None,
            "corrigendum":        None,
            "keyword":            keyword_label,
        })

    if db_records:
        saved = await loop.run_in_executor(executor, db_save_tenders, db_records)
        _stats["records_saved"] += saved

    return csv_rows


# ── Main Run ───────────────────────────────────────────────────────────────────
async def run():
    init_csv(OUTPUT_FILE)
    executor = ThreadPoolExecutor(max_workers=4)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--disable-gpu", "--no-sandbox"],
        )
        context = await browser.new_context(user_agent=UA, accept_downloads=True)
        page = await context.new_page()

        log(f"Navigating to CPPP Active Tenders: {CPPP_URL}")
        await page.goto(CPPP_URL, timeout=60000, wait_until="domcontentloaded")
        await open_central_active_tenders(page)
        await handle_captcha_if_present(page)

        page_num = 1
        try:
            while not _EXIT:
                if MAX_PAGES and page_num > MAX_PAGES:
                    log(f"[DONE] Reached MAX_PAGES={MAX_PAGES}")
                    break

                _stats["current_page"] = page_num
                rows = await parse_page_rows(page)
                if not rows:
                    log(f"[DONE] No rows parsed on page {page_num} — stopping")
                    break

                csv_rows = await process_page(rows, context, executor, page_num)
                append_csv(OUTPUT_FILE, csv_rows)
                _stats["pages_done"] += 1

                has_next = await goto_next_page(page)
                if not has_next:
                    log(f"[DONE] No next-page link found after page {page_num} — stopping")
                    break
                page_num += 1

            log(f"\n[DONE] Pages: {_stats['pages_done']}  Tenders seen: {_stats['tenders_seen']}  "
                f"Pre-filter hits: {_stats['prefilter_hits']}  Deep-dives: {_stats['deep_dives']}  "
                f"DB-saved: {_stats['records_saved']}  Skipped: {_stats['records_skipped']}")
        except Exception as e:
            log(f"[FATAL] {e}")
        finally:
            try:
                await context.close()
                await browser.close()
            except Exception:
                pass
        executor.shutdown(wait=False)


# ── Entry Point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dept", choices=["diagno", "endo", "both"], default="both",
        help="Only keep tenders the AI tags as this dept (or 'Both'); 'both' keeps everything.",
    )
    args = parser.parse_args()
    DEPT_FILTER = args.dept
    if DEPT_FILTER != "both":
        OUTPUT_FILE = f"row_data_cppp_browse_{DEPT_FILTER}.csv"
        SCRAPER_NAME = f"cppp_browse_{DEPT_FILTER}"

    def _handle_signal(*_):
        global _EXIT
        _EXIT = True
        print(f"\n[{SCRAPER_NAME}] Signal received — stopping", flush=True)

    signal.signal(signal.SIGINT,  _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    log(f"=== {SCRAPER_NAME} starting (dept filter: {DEPT_FILTER}) ===")
    try:
        asyncio.run(run())
    except Exception as e:
        log(f"[ERROR] {e}")
    log(f"=== {SCRAPER_NAME} done | pages: {_stats['pages_done']} ===")

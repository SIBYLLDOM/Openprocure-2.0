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
2. If the organisation is a hospital/lab/health body AND the title is vague → "Doubt".
3. If you are unsure → "Doubt".
4. Return "No" ONLY when you are 100% certain it has nothing to do with diagnostic
   analyzers/reagents/rapid test kits/IVD OR surgical staplers/mesh/sutures/energy devices/biosurgicals.

CRITICAL: "Yes" and "Doubt" both proceed; only "No" drops the tender entirely.
          A missed relevant tender is a business loss.

Return ONLY valid JSON — no text outside the JSON. Format:
{{
  "decision": "Yes" | "Doubt" | "No",
  "reason": "<one sentence: what the tender is for and why>",
  "dept": "Diagno" | "Endo" | "Both" | "Unknown" | null,
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
                ans = data.get("response", "").strip()
                ans = re.sub(r'[^a-zA-Z0-9]', '', ans)
                return ans
        except Exception as e:
            log(f"[CAPTCHA ERROR] Ollama vision call failed: {e}")
            return ""
    return await loop.run_in_executor(None, _sync_call)


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


# ── Database Operations ────────────────────────────────────────────────────────
def db_save_tenders(records: list) -> int:
    if not records:
        return 0
    saved = 0
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        query_open_tenders = """
        INSERT INTO open_tender_details (
            state, organisation_name, e_published_date, closing_date,
            opening_date, tender_title, tender_refno, tender_id,
            organisation_chain, tender_details, file_link, tender_page_link,
            relevency_checker, relevancy_reason, dept,
            downloaded_documents, corrigendum, searched_keyword
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
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
            relevency_checker = VALUES(relevency_checker),
            relevancy_reason  = VALUES(relevancy_reason),
            dept              = VALUES(dept),
            downloaded_documents = VALUES(downloaded_documents),
            corrigendum       = VALUES(corrigendum),
            searched_keyword  = VALUES(searched_keyword),
            updated_at        = CURRENT_TIMESTAMP
        """

        query_processing_results = """
        INSERT INTO tender_processing_results (bid_no, tender_title, result)
        VALUES (%s, %s, "yes")
        ON DUPLICATE KEY UPDATE tender_title = VALUES(tender_title)
        """

        for r in records:
            vals = (
                r.get("state"), r.get("organisation_name"), r.get("e_published_date"),
                r.get("closing_date"), r.get("opening_date"), r.get("tender_title"),
                r.get("tender_refno"), r.get("tender_id"), r.get("organisation_chain"),
                r.get("tender_details"), r.get("file_link"), r.get("tender_page_link"),
                r.get("relevency_checker"), r.get("relevancy_reason"),
                r.get("dept"), r.get("downloaded_documents"), r.get("corrigendum"),
                r.get("keyword", "browse_all"),
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
    loop = asyncio.get_event_loop()
    
    # Tier 2 fine filter
    result = await loop.run_in_executor(
        executor, _filter_tender_sync, row["title"], row["state_name"],
        row["state_name"], row["refno"], row["tid"]
    )
    decision = result.get("decision", "Doubt")

    details = {}
    # If decision is Doubt or title is vague, open details page for deep extraction
    if decision == "Doubt" or len(row["title"]) < 10:
        _stats["deep_dives"] += 1
        # Deep extraction logic can open row["href"]
        # for now we re-evaluate with current metadata
        result = await loop.run_in_executor(
            executor, _filter_tender_sync, row["title"], row["state_name"],
            row["state_name"], row["refno"], row["tid"], details
        )
        decision = result.get("decision", "Doubt")

    reason   = result.get("reason", "")
    dept_tag = result.get("dept")
    category = result.get("category")
    effective_dept = dept_tag.lower() if dept_tag and dept_tag != "Unknown" else DEFAULT_DEPT
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
        parts     = title.rsplit("/", 1)
        tender_id = parts[-1].strip() if parts else title
        refno     = parts[0].strip("/").strip() if len(parts) > 1 else ""
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
                await btn.click()
                await page.wait_for_selector("table#table.list_table", timeout=20000)
                await asyncio.sleep(1.5)
                return True
    except Exception as e:
        log(f"[PAGINATION ERROR] {e}")
    return False


# ── Per-Page Processing ────────────────────────────────────────────────────────
async def process_page(rows: list, context, executor: ThreadPoolExecutor, page_num: int) -> list:
    if not rows:
        return []

    loop = asyncio.get_event_loop()
    _stats["tenders_seen"] += len(rows)
    matches = await loop.run_in_executor(executor, _prefilter_page_sync, rows)
    _stats["prefilter_hits"] += len(matches)
    log(f"  Page {page_num}: {len(rows)} tenders, {len(matches)} flagged by pre-filter")

    csv_rows, db_records = [], []
    for row in rows:
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

        keyword_label = category or matches[row["tid"]] or "browse_all"
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
        db_records.append({
            "state":              row["state_name"],
            "organisation_name":  row["state_name"],
            "e_published_date":   row["e_pub"],
            "closing_date":       row["closing"],
            "opening_date":       row["opening"],
            "tender_title":       row["title"],
            "tender_refno":       row["refno"],
            "tender_id":          row["tid"],
            "organisation_chain": row["state_name"],
            "tender_details":     json.dumps(details, ensure_ascii=False) if details else None,
            "file_link":          None,
            "tender_page_link":   tender_page_link,
            "tender_site_link":   None,
            "relevency_checker":  status,
            "relevancy_reason":   reason,
            "dept":               dept,
            "downloaded_documents": None,
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
        browser = await p.chromium.launch(headless=False, args=["--disable-blink-features=AutomationControlled"])
        context = await browser.new_context(user_agent=UA)
        page = await context.new_page()

        log(f"Navigating to CPPP Active Tenders: {CPPP_URL}")
        await page.goto(CPPP_URL, timeout=60000, wait_until="domcontentloaded")
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

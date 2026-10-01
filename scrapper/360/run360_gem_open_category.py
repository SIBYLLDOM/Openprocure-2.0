#!/usr/bin/env python3
"""
gem_browse_scraper.py — GeM (bidplus.gem.gov.in) full-listing browse scraper

Same idea as browse_scraper.py (CPPP), applied to GeM: instead of searching by
category (gem.py's existing approach), this walks the "All Bids" listing page
by page and batches each page's Bid No/Items/Quantity/Department through
Ollama as a cheap pre-filter against Meril's full product catalogue.

GeM's listing is a JS/AJAX app (not plain ?page=N URLs): page turns are driven
by clicking the "next" link in the `#light-pagination` widget (same widget/
selector used by the category-search scrapers), same as run_endo_perfect_category.py.
An earlier version tried jumping pages via `loadBids(pageNumber)` through
page.evaluate(), but that did not reliably advance the AJAX listing.

Two-tier relevancy check per matched bid (per product decision):
  1. Cheap check using only the listing card fields (Items/Quantity/Department).
  2. If that's "Doubt", or the Items field is just a code/number rather than a
     descriptive name, download the bid's PDF (the only "detail page" GeM has
     — showbidDocument/{id} serves a PDF directly, confirmed via a live
     request) and extract its text. If the PDF's "Buyer Added Bid Specific
     Terms and Conditions" section indicates a buyer-uploaded ATC file rather
     than embedding the clauses directly, also download and read that
     attachment. Re-run the filter with this fuller context for a final call.

Matches are upserted into gem_tenders / tender_processing_results via gem.py's
existing db_execute_many() (now dept-aware — see the gem.py edit).
"""

import io
import os
import re
import csv
import time
import signal
import asyncio
import urllib.error
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

import pypdf
from playwright.async_api import async_playwright

import gem as g
import openscraper as osc

# ── Configuration ──────────────────────────────────────────────────────────────
SCRAPER_NAME  = "gem_browse_all"
ALL_BIDS_URL  = f"{g.BASE_URL}/all-bids"
OUTPUT_FILE   = "row_data_gem_browse_all.csv"
KEYWORD_FILE  = "./keyword/360_keywords.csv"
DEFAULT_DEPT  = "unknown"   # fallback when the LLM doesn't confidently tag a dept
DB_DEPT       = "360"       # dept value actually written to gem_tenders by this scraper
MAX_PAGES     = None        # e.g. 200 to cap a run; None = crawl until no pages left


def _load_360_keywords(path: str) -> list:
    if not os.path.exists(path):
        log(f"[WARN] Keyword file not found: {path}")
        return []
    keywords = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            if not row:
                continue
            kw = row[0].strip()
            if kw:
                keywords.append(kw)
    return keywords


_360_KEYWORD_LIST = "\n".join(f"  • {kw}" for kw in _load_360_keywords(KEYWORD_FILE))
MERIL_360_PRODUCTS = (
    "Meril Life Sciences sells ONLY these 360° Infection Prevention Solutions products:\n"
    f"{_360_KEYWORD_LIST}\n"
)

CSV_HEADERS = [
    "keyword", "dept", "bid_no", "start_date", "end_date",
    "items", "quantity", "department", "filter_status", "filter_reason",
]

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

_EXIT  = False
_stats = {
    "pages_done": 0, "bids_seen": 0, "prefilter_hits": 0, "deep_dives": 0,
    "records_saved": 0, "records_skipped": 0, "current_page": 0,
}

PRE_FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd.

You will be shown a batch of GeM (Government e-Marketplace) bid listings —
each with a Bid No, Item/Category name, Quantity, and Department. Using ONLY
these fields, decide for EACH bid whether it might be relevant to Meril's
products — this is a cheap first-pass filter, not the final decision, so be
liberal: mark "skip" only when confident from the item name alone that it has
nothing to do with Meril's products.

{MERIL_360_PRODUCTS}

Return "check" if the item might be relevant (mentions or hints at any product
above, is a bare code/number with no descriptive name, or comes from a
hospital/medical/health department), or "skip" if the item clearly indicates
something Meril does not sell.

Return ONLY valid JSON — no text outside the JSON. Format:
{{
  "results": [
    {{"bid_no": "<bid no exactly as given>", "verdict": "check" | "skip", "category": "<likely Meril category or null>"}}
  ]
}}
One entry per bid in the batch, referenced by bid_no."""

GEM_FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd.

Decide whether a GeM (Government e-Marketplace) bid is worth pursuing — does
it ask for products that Meril's 360° Infection Prevention Solutions
division actually sells?

{MERIL_360_PRODUCTS}

DECISION RULES:
1. If the Item/Category (or the extra document text, if provided) clearly
   mentions ANY of our products above → "Yes".
2. If the department is a hospital/lab/health body AND the item name is vague
   or just a code/number → "Doubt".
3. If you are unsure → "Doubt".
4. Return "No" ONLY when you are 100% certain it has nothing to do with
   infection prevention/surgical drapes/gowns/masks/caps/disinfectants/
   antiseptics/hand hygiene products.

CRITICAL: "Yes" and "Doubt" both proceed; only "No" drops the bid entirely.
          A missed relevant bid is a business loss.

Return ONLY valid JSON — no text outside the JSON. Format:
{{
  "decision": "Yes" | "Doubt" | "No",
  "reason": "<one sentence: what the bid is for and why>",
  "dept": "360" | "Unknown" | null,
  "category": "<most likely Meril product, or null>"
}}"""


# ── Logging ────────────────────────────────────────────────────────────────────
def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── CSV ────────────────────────────────────────────────────────────────────────
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


# ── Page-level batch pre-filter (Ollama) ────────────────────────────────────────
def _build_prefilter_message(rows: list) -> str:
    lines = ["Bids to screen:\n"]
    for r in rows:
        lines.append(
            f'- bid_no: "{r["bid_no"]}" | items: "{r["items"]}" | '
            f'quantity: "{r["quantity"]}" | department: "{r["department"]}"'
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
                log(f"  [PREFILTER] Empty response (attempt {attempt}) — waiting...")
                time.sleep(10 * attempt)
                continue
            result = osc._parse_json(raw)
            if result and isinstance(result, dict) and isinstance(result.get("results"), list):
                matches = {}
                for entry in result["results"]:
                    bid_no = str(entry.get("bid_no", "")).strip()
                    if bid_no and entry.get("verdict") == "check":
                        matches[bid_no] = entry.get("category")
                return matches
            log(f"  [PREFILTER] Bad JSON (attempt {attempt}): {raw[:150]}")
            time.sleep(3)
        except urllib.error.URLError as e:
            log(f"  [PREFILTER] Ollama unreachable (attempt {attempt}): {e}")
            time.sleep(10)
        except Exception as e:
            log(f"  [PREFILTER] Attempt {attempt}/3 failed: {e}")
            time.sleep(5)
    log("  [PREFILTER] All attempts failed — defaulting to 'check all' on this page (safe)")
    return {r["bid_no"]: None for r in rows}


# ── Per-bid fine-grained filter (+ optional deep-dive) ──────────────────────────
def _is_code_like(items: str) -> bool:
    stripped = (items or "").strip()
    if len(stripped) < 6:
        return True
    letters = sum(c.isalpha() for c in stripped)
    return letters < max(3, len(stripped) * 0.3)


def _filter_bid_sync(bid_no: str, items: str, quantity: str, department: str,
                      extra_context: str = None) -> dict:
    lines = [
        f'Bid No     : {bid_no}',
        f'Item       : {items}',
        f'Quantity   : {quantity}',
        f'Department : {department}',
    ]
    if extra_context:
        lines += ["", "Additional document text (bid PDF / ATC attachment):", extra_context[:4000]]
    lines += ["", "Return ONLY the JSON decision object as specified in the system prompt."]
    messages = [
        {"role": "system", "content": GEM_FILTER_SYSTEM_PROMPT},
        {"role": "user", "content": "\n".join(lines)},
    ]
    for attempt in range(1, 4):
        try:
            raw = osc._ollama_call(messages)
            if not raw:
                time.sleep(10 * attempt)
                continue
            result = osc._parse_json(raw)
            if result and isinstance(result, dict) and "decision" in result:
                return result
            time.sleep(3)
        except urllib.error.URLError as e:
            log(f"    [FILTER/LLM] Ollama unreachable (attempt {attempt}): {e}")
            time.sleep(10)
        except Exception as e:
            log(f"    [FILTER/LLM] Attempt {attempt}/3 failed: {e}")
            time.sleep(5)
    return {"decision": "Doubt", "reason": "LLM unavailable — marked relevant for safety."}


def _extract_pdf_text(data: bytes, reader_out: list = None) -> str:
    reader = pypdf.PdfReader(io.BytesIO(data))
    if reader_out is not None:
        reader_out.append(reader)
    text = ""
    for page in reader.pages:
        text += (page.extract_text() or "") + "\n"
    return text


def _find_biddoc_attachment_urls(reader) -> list:
    """Bid-document attachment links embedded in the main bid PDF — one of
    these is the buyer-uploaded ATC file when the ATC section says so instead
    of embedding the clauses as plain text."""
    urls = []
    for page in reader.pages:
        if "/Annots" not in page:
            continue
        for a in page["/Annots"]:
            obj = a.get_object()
            uri = obj.get("/A", {}).get("/URI") if obj.get("/A") else None
            if uri and "/bidding/biddoc/" in uri and uri not in urls:
                urls.append(uri)
    return urls


async def _fetch_url_bytes(context, url: str) -> bytes:
    # Routed through Playwright's own request context (same engine that
    # renders the site) rather than urllib — gem.gov.in's cert chain isn't
    # trusted by Python's default SSL store in some environments even though
    # a real browser trusts it fine.
    resp = await context.request.get(url, headers={"User-Agent": UA}, timeout=30000)
    return await resp.body()


async def deep_dive_bid(context, detail_url: str, executor: ThreadPoolExecutor) -> str:
    loop = asyncio.get_event_loop()
    data = await _fetch_url_bytes(context, detail_url)
    reader_box = []
    combined = await loop.run_in_executor(executor, _extract_pdf_text, data, reader_box)
    reader = reader_box[0]
    if "buyer uploaded atc document" in combined.lower():
        attachment_urls = await loop.run_in_executor(executor, _find_biddoc_attachment_urls, reader)
        for url in attachment_urls[:5]:
            try:
                att_data = await _fetch_url_bytes(context, url)
                att_text = await loop.run_in_executor(executor, _extract_pdf_text, att_data)
                combined += f"\n\n--- ATC/attachment: {url} ---\n{att_text}"
            except Exception as e:
                log(f"    [DEEPDIVE] Attachment download failed ({url}): {e}")
    return combined


async def process_bid(row: dict, context, executor: ThreadPoolExecutor) -> tuple:
    """Returns (status, effective_dept, reason, category). status: 'no' | 'proceed_futher'."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        executor, _filter_bid_sync, row["bid_no"], row["items"], row["quantity"], row["department"],
    )
    decision = result.get("decision", "Doubt")

    if decision == "Doubt" or _is_code_like(row["items"]):
        try:
            extra_text = await deep_dive_bid(context, row["detail_url"], executor)
            _stats["deep_dives"] += 1
            result = await loop.run_in_executor(
                executor, _filter_bid_sync, row["bid_no"], row["items"], row["quantity"],
                row["department"], extra_text,
            )
            decision = result.get("decision", "Doubt")
        except Exception as e:
            log(f"    [DEEPDIVE ERROR] {row['bid_no']}: {e}")

    reason   = result.get("reason", "")
    dept_tag = result.get("dept")
    category = result.get("category")
    effective_dept = dept_tag.lower() if dept_tag and dept_tag != "Unknown" else DEFAULT_DEPT
    status = "no" if decision == "No" else "proceed_futher"
    return status, effective_dept, reason, category


# ── Listing page parsing (click-through pagination + gem.py's card scraper) ─────
async def goto_first_page(page):
    await page.goto(ALL_BIDS_URL, timeout=60000, wait_until="domcontentloaded")
    await page.wait_for_selector("div.card", timeout=20000)


async def goto_next_page(page) -> bool:
    next_btn = await page.query_selector("#light-pagination a.next")
    if not next_btn:
        await asyncio.sleep(14)
        next_btn = await page.query_selector("#light-pagination a.next")
    if not next_btn:
        return False
    await next_btn.click()
    await page.wait_for_selector("div.card", timeout=20000)
    await page.wait_for_timeout(500)
    return True


async def parse_page_rows(page, page_num: int) -> list:
    raw_rows = await g.scrape_single_page(page, "browse_all", page_num, dept=DEFAULT_DEPT)
    return [
        {
            "category_name": r[0], "page_no": r[1], "bid_no": r[2], "detail_url": r[3],
            "items": r[4], "quantity": r[5], "department": r[6], "start_date": r[7],
            "end_date": r[8], "ra_no": r[9], "ra_url": r[10], "perfect_cat": r[11],
            "sub_cat": r[12], "dept": r[13],
        }
        for r in raw_rows
    ]


# ── Per-page processing ──────────────────────────────────────────────────────────
async def process_page(rows: list, context, executor: ThreadPoolExecutor) -> list:
    if not rows:
        return []

    loop = asyncio.get_event_loop()
    _stats["bids_seen"] += len(rows)
    matches = await loop.run_in_executor(executor, _prefilter_page_sync, rows)
    _stats["prefilter_hits"] += len(matches)
    log(f"  Page {rows[0]['page_no']}: {len(rows)} bids, {len(matches)} flagged by pre-filter")

    csv_rows, db_rows = [], []
    for row in rows:
        if row["bid_no"] not in matches:
            csv_rows.append([
                "browse_all", DEFAULT_DEPT, row["bid_no"], row["start_date"], row["end_date"],
                row["items"], row["quantity"], row["department"],
                "prefiltered_no", "Skipped by page-level item pre-filter",
            ])
            continue

        try:
            status, dept, reason, category = await process_bid(row, context, executor)
        except Exception as e:
            log(f"    [SKIP] {row['bid_no']}: {e}")
            continue

        keyword_label = category or matches[row["bid_no"]] or "browse_all"
        csv_rows.append([
            keyword_label, dept, row["bid_no"], row["start_date"], row["end_date"],
            row["items"], row["quantity"], row["department"], status, reason,
        ])
        if status == "no":
            _stats["records_skipped"] += 1
            continue

        db_rows.append((
            # perfect_cat = 0: this is the "All Bids" browse scraper, not a
            # category search — matches the perfectCat='open' filter the
            # frontend/backend already use (see tenders.controller.js and
            # NewSystem/endofilter.js, which query gem_tenders on perfect_cat=0).
            # dept is always saved as DB_DEPT ("360") here — `dept` (from the
            # LLM, defaulting to DEFAULT_DEPT="unknown") is only used for the
            # CSV audit trail above.
            keyword_label, row["page_no"], row["bid_no"], row["detail_url"],
            row["items"], row["quantity"], row["department"], row["start_date"],
            row["end_date"], row["ra_no"], row["ra_url"], 0, keyword_label, DB_DEPT,
        ))

    if db_rows:
        try:
            saved = await loop.run_in_executor(executor, g.db_execute_many, db_rows)
            _stats["records_saved"] += saved
        except Exception as e:
            log(f"[DB ERROR] {e}")

    return csv_rows


# ── Main ───────────────────────────────────────────────────────────────────────
async def run():
    init_csv(OUTPUT_FILE)
    executor = ThreadPoolExecutor(max_workers=4)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=["--disable-blink-features=AutomationControlled"])
        context = await browser.new_context(user_agent=UA)
        page = await context.new_page()

        await goto_first_page(page)
        _total_records, total_pages = await g.extract_total_counts(page)
        log(f"Total bids: {_total_records}  Total pages: {total_pages}")

        page_num = 1
        try:
            while not _EXIT and page_num <= total_pages:
                if MAX_PAGES and page_num > MAX_PAGES:
                    log(f"[DONE] Reached MAX_PAGES={MAX_PAGES}")
                    break

                _stats["current_page"] = page_num
                rows = await parse_page_rows(page, page_num)
                if not rows:
                    log(f"[DONE] No rows parsed on page {page_num} — stopping")
                    break

                csv_rows = await process_page(rows, context, executor)
                append_csv(OUTPUT_FILE, csv_rows)
                _stats["pages_done"] += 1

                if page_num < total_pages:
                    if not await goto_next_page(page):
                        log(f"[DONE] No next-page link found after page {page_num} — stopping")
                        break
                page_num += 1

            log(f"\n[DONE] Pages: {_stats['pages_done']}  Bids seen: {_stats['bids_seen']}  "
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


# ── ENTRY POINT ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    def _handle_signal(*_):
        global _EXIT
        _EXIT = True
        print(f"\n[{SCRAPER_NAME}] Signal received — stopping", flush=True)

    signal.signal(signal.SIGINT,  _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    log(f"=== {SCRAPER_NAME} starting ===")
    try:
        asyncio.run(run())
    except Exception as e:
        log(f"[ERROR] {e}")
    log(f"=== {SCRAPER_NAME} done | pages: {_stats['pages_done']} ===")

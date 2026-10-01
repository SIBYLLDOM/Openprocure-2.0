"""
HLL Lifecare Tender Scraper
============================
Scrapes ALL pages of https://www.lifecarehll.com/tender (with pagination)
and stores them in the `psu` table in `tender_automation_with_ai` DB.

Steps:
  1. Load listing page -> detect all .pageLink anchors for pagination
  2. For EACH page: extract Sl.No, Title, URL, Ref No, Department
  3. For each tender: visit detail page -> extract dates, Tender ID, file links
  4. Upsert into MySQL `psu` table after each tender
  5. Move to the next page and repeat

Browser runs in VISIBLE mode so you can watch it work.
"""

import asyncio
import json
import re
import logging
from datetime import datetime

import aiomysql
from playwright.async_api import (
    async_playwright,
    TimeoutError as PlaywrightTimeoutError,
    Error as PlaywrightError,
)

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
DB_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "root",          # <- change if needed
    "password": "meril",          # <- change if needed
    "db": "tender_automation_with_ai",
    "charset": "utf8mb4",
    "autocommit": True,
}

BASE_URL    = "https://www.lifecarehll.com"
LISTING_URL = f"{BASE_URL}/tender"
ORG_NAME    = "HLL Lifecare Limited"
STATE       = "Kerala"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# DB HELPERS
# ──────────────────────────────────────────────
async def get_db_pool() -> aiomysql.Pool:
    return await aiomysql.create_pool(**DB_CONFIG, minsize=1, maxsize=5)


async def upsert_tender(pool: aiomysql.Pool, record: dict) -> None:
    """Insert or update a tender record by tender_refno."""
    sql = """
        INSERT INTO psu (
            id,
            state, organisation_name,
            e_published_date, closing_date, opening_date,
            tender_title, tender_refno, tender_id,
            organisation_chain, tender_details, file_link,
            relevency_checker
        ) VALUES (
            NULL,
            %(state)s, %(organisation_name)s,
            %(e_published_date)s, %(closing_date)s, %(opening_date)s,
            %(tender_title)s, %(tender_refno)s, %(tender_id)s,
            %(organisation_chain)s, %(tender_details)s, %(file_link)s,
            'not_processed'
        ) AS new_row
        ON DUPLICATE KEY UPDATE
            state               = new_row.state,
            organisation_name   = new_row.organisation_name,
            e_published_date    = new_row.e_published_date,
            closing_date        = new_row.closing_date,
            opening_date        = new_row.opening_date,
            tender_title        = new_row.tender_title,
            organisation_chain  = new_row.organisation_chain,
            tender_details      = new_row.tender_details,
            file_link           = new_row.file_link,
            updated_at          = CURRENT_TIMESTAMP
    """
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, record)
    log.info("  Upserted: %s", record.get("tender_refno", "?"))


# ──────────────────────────────────────────────
# SCRAPING HELPERS
# ──────────────────────────────────────────────
def _clean(text: str) -> str:
    """Strip extra whitespace."""
    return re.sub(r"\s+", " ", text or "").strip()


async def scrape_one_page(page) -> list[dict]:
    """
    Extract tender rows from the CURRENTLY loaded listing page.
    Returns a list of dicts: { sl_no, title, detail_url, ref_no, department }
    """
    await page.wait_for_selector("table tbody tr", timeout=30_000)
    rows = await page.query_selector_all("table tbody tr")
    tenders = []

    for row in rows:
        # Skip header rows (th cells)
        headers = await row.query_selector_all("th")
        if headers:
            continue

        cells = await row.query_selector_all("td")
        if len(cells) < 4:
            continue

        sl_no      = _clean(await cells[0].inner_text())
        link_el    = await cells[1].query_selector("a")
        title      = _clean(await link_el.inner_text()) if link_el else _clean(await cells[1].inner_text())
        detail_url = await link_el.get_attribute("href") if link_el else ""
        ref_no     = _clean(await cells[2].inner_text())
        department = _clean(await cells[3].inner_text())

        if not detail_url:
            continue

        # Make absolute if relative
        if detail_url.startswith("/"):
            detail_url = BASE_URL + detail_url

        tenders.append({
            "sl_no":       sl_no,
            "title":       title,
            "detail_url":  detail_url,
            "ref_no":      ref_no,
            "department":  department,
        })
        log.info("  Found [%s] %s", sl_no, title[:80])

    return tenders


async def get_all_page_urls(page) -> list[str]:
    """
    After loading page 1, collect ALL pagination URLs from .pageLink anchors.
    Always includes page 1 (LISTING_URL) as the first entry.
    """
    page_urls = [LISTING_URL]  # page 1 is already loaded

    try:
        link_els = await page.query_selector_all("a.pageLink")
        seen = set()
        for el in link_els:
            href = await el.get_attribute("href") or ""
            if href.startswith("/"):
                href = BASE_URL + href
            if href and href not in seen and href != LISTING_URL:
                seen.add(href)
                page_urls.append(href)
    except Exception as exc:
        log.warning("Could not read pagination links: %s", exc)

    log.info("Pagination: %d page(s) detected -> %s", len(page_urls),
             [u.split("/p/")[-1] if "/p/" in u else "1" for u in page_urls])
    return page_urls


async def scrape_detail(page, detail_url: str) -> dict:
    """
    Visit a tender detail page and extract all tbody sections:
      - Basic Details  (Tender ID, Ref No, Title, Category, Location)
      - Dates          (ePublished, Bid Start, Bid Closing, Bid Opening)
      - Work Details   (Work Description, Pre-Qualification)
    All key-value pairs stored in tender_details as {section: {key: value}}.

    For file_links: ONLY picks up <a href="/file/download/..."> that contain
    an <i class="...icon_pdf..."> child inside them.
    This filters out nav/footer links like 'Procurement Plan' and
    'Vendor Payment Status' which are also /file/download/ URLs but have no
    PDF icon.
    """
    result = {
        "tender_id":        None,
        "e_published_date": None,
        "closing_date":     None,
        "opening_date":     None,
        "tender_details":   {},   # {section_name: {label: value}, ...}
        "file_links":       [],
    }

    try:
        log.info("  -> Detail: %s", detail_url)
        await page.goto(detail_url, wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_load_state("domcontentloaded")

        # ── Section-aware extraction ──────────────────────────────────────
        # Each <tbody> starts with a <th> header row, then <tr><td><td> pairs.
        all_sections = {}

        tbodies = await page.query_selector_all("table tbody")
        for tbody in tbodies:
            rows = await tbody.query_selector_all("tr")
            if not rows:
                continue

            # First row: <th> = section header
            first_ths = await rows[0].query_selector_all("th")
            if first_ths:
                section_name = _clean(await first_ths[0].inner_text()).rstrip(":")
            else:
                section_name = "Other"

            section_data = {}
            for tr in rows[1:]:
                tds = await tr.query_selector_all("td")
                if len(tds) >= 2:
                    label = _clean(await tds[0].inner_text()).rstrip(":")
                    value = _clean(await tds[1].inner_text())
                    if label:
                        section_data[label] = value

            if section_data:
                if section_name in all_sections:
                    all_sections[section_name].update(section_data)
                else:
                    all_sections[section_name] = section_data

        result["tender_details"] = all_sections

        # ── Flat helper: find value by keyword across all sections ────────
        def get_field(*keywords):
            for sec_data in all_sections.values():
                for label, value in sec_data.items():
                    for kw in keywords:
                        if kw.lower() in label.lower():
                            return value
            return None

        # ── Map to DB columns ─────────────────────────────────────────────
        result["tender_id"]        = get_field("Tender ID", "Tender Id")
        result["e_published_date"] = get_field("ePublished Date", "e Published Date", "Published Date")
        result["closing_date"]     = get_field("Bid Submission Closing Date", "Closing Date")
        result["opening_date"]     = get_field("Bid Opening Date", "Opening Date")

        # ── Extract file download links (ONLY tender documents) ───────────
        #
        # The actual tender document download button looks like:
        #   <a href="/file/download/reference/...">
        #     <i class="icon_size16 icon_pdf float_left right_5"></i>Download
        #   </a>
        #
        # Navigation/footer links (e.g. "Procurement Plan", "Vendor Payment
        # Status") are also /file/download/ URLs but they do NOT contain an
        # <i class="...icon_pdf..."> child — so they are excluded here.
        #
        icon_els = await page.query_selector_all(
            "a[href*='/file/download/'] i[class*='icon_pdf'], "
            "a[href*='/tender/download/'] i[class*='icon_pdf']"
        )
        file_links = []
        seen_hrefs: set = set()
        for icon_el in icon_els:
            # Walk up to the enclosing <a href="...">
            parent_a = await icon_el.evaluate_handle("el => el.closest('a[href]')")
            if not parent_a:
                continue
            href  = await parent_a.get_attribute("href") or ""
            label = _clean(await parent_a.inner_text()) or "Download"
            if href.startswith("/"):
                href = BASE_URL + href
            if href and href not in seen_hrefs:
                seen_hrefs.add(href)
                file_links.append({"label": label, "url": href})

        result["file_links"] = file_links
        log.info("    Sections=%s | Files=%d",
                 list(all_sections.keys()), len(file_links))

    except PlaywrightTimeoutError:
        log.warning("  Timeout loading detail page: %s", detail_url)
    except PlaywrightError as exc:
        msg = str(exc)
        if "Target page, context or browser has been closed" in msg or \
           "Target closed" in msg:
            # Browser closed externally — propagate so main can stop cleanly
            raise
        log.error("  Playwright error on detail page %s: %s", detail_url, exc)
    except Exception as exc:
        log.error("  Error on detail page %s: %s", detail_url, exc)

    return result


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
async def main():
    pool = await get_db_pool()
    log.info("DB pool created")

    async with async_playwright() as pw:
        # VISIBLE browser so you can watch it scrape
        browser = await pw.chromium.launch(
            headless=False,
            args=["--start-maximized"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            no_viewport=True,   # use the maximized window size
        )
        page = await context.new_page()

        # Step 1: Load page 1 and discover all pagination URLs
        log.info("Opening listing page 1: %s", LISTING_URL)
        await page.goto(LISTING_URL, wait_until="networkidle", timeout=60_000)

        page_urls = await get_all_page_urls(page)

        total_processed = 0

        # Step 2: Loop through every listing page
        browser_alive = True
        for page_num, page_url in enumerate(page_urls, start=1):
            if not browser_alive:
                break
            try:
                if page_num == 1:
                    log.info("=== Scraping page 1 (already loaded)")
                else:
                    log.info("=== Navigating to page %d: %s", page_num, page_url)
                    await page.goto(page_url, wait_until="networkidle", timeout=60_000)

                # Extract rows from the current listing page
                listing = await scrape_one_page(page)
                log.info("  Page %d -> %d tenders found", page_num, len(listing))

                # Step 3: Visit each detail page & upsert
                for item in listing:
                    try:
                        detail = await scrape_detail(page, item["detail_url"])
                    except PlaywrightError:
                        log.warning("  Browser closed -- stopping scrape after %d tenders.",
                                    total_processed)
                        browser_alive = False
                        break

                    record = {
                        "state":             STATE,
                        "organisation_name": ORG_NAME,
                        "e_published_date":  detail["e_published_date"],
                        "closing_date":      detail["closing_date"],
                        "opening_date":      detail["opening_date"],
                        "tender_title":      item["title"],
                        "tender_refno":      item["ref_no"],
                        "tender_id":         detail["tender_id"],
                        "organisation_chain": f"{ORG_NAME} -> {item['department']}",
                        "tender_details":    json.dumps(detail["tender_details"], ensure_ascii=False),
                        "file_link":         json.dumps(detail["file_links"],    ensure_ascii=False),
                    }

                    await upsert_tender(pool, record)
                    total_processed += 1

                if browser_alive:
                    log.info("  Page %d complete (%d upserted so far)",
                             page_num, total_processed)

            except PlaywrightError as exc:
                log.warning("  Browser closed during page %d navigation -- stopping. (%s)",
                            page_num, exc)
                browser_alive = False

        if browser_alive:
            try:
                await browser.close()
            except Exception:
                pass

    pool.close()
    await pool.wait_closed()
    log.info("All done. Total tenders processed across all pages: %d",
             total_processed)


if __name__ == "__main__":
    asyncio.run(main())

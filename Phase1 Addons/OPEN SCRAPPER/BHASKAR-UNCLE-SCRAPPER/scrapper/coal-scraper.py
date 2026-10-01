"""
Coal Ministry Tender Scraper
==============================
Scrapes ALL pages of https://coal.gov.in/tenders (Drupal views, paginated)
and stores them in the `psu` table in `tender_automation_with_ai` DB.

Table columns scraped:
  - S.No   -> (used for reference)
  - Title  -> tender_title
  - Download/Link -> file_link (JSON array of {label, url})
  - Date   -> e_published_date

No detail page — all data is on the listing itself.
Browser is visible so you can watch it work.
"""

import asyncio
import json
import re
import logging

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
    "user": "root",      # <- change if needed
    "password": "meril",      # <- change if needed
    "db": "tender_automation_with_ai",
    "charset": "utf8mb4",
    "autocommit": True,
}

BASE_URL    = "https://coal.gov.in"
LISTING_URL = f"{BASE_URL}/tenders"
ORG_NAME    = "Ministry of Coal, Government of India"
STATE       = "Central"

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
    """Insert or update a tender record keyed on tender_title + e_published_date."""
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
            tender_title        = new_row.tender_title,
            organisation_chain  = new_row.organisation_chain,
            tender_details      = new_row.tender_details,
            file_link           = new_row.file_link,
            updated_at          = CURRENT_TIMESTAMP
    """
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, record)
    log.info("  Upserted: %s", (record.get("tender_title") or "")[:70])


# ──────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────
def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _make_refno(title: str, date: str) -> str:
    """Generate a stable reference key from title + date for the unique key."""
    slug = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")[:80]
    return f"COAL/{date}/{slug}" if date else f"COAL/{slug}"


# ──────────────────────────────────────────────
# SCRAPING
# ──────────────────────────────────────────────
async def scrape_one_page(page) -> list[dict]:
    """
    Extract tender rows from the CURRENTLY loaded listing page.
    The table has: S.No | Title | Download/Link | Date
    Selector: table.views-table tbody tr  (Drupal views table)
    """
    try:
        await page.wait_for_selector("table tbody tr", timeout=20_000)
    except PlaywrightTimeoutError:
        log.warning("  No table rows found on this page — may be last page.")
        return []

    rows = await page.query_selector_all("table tbody tr")
    tenders = []

    for row in rows:
        # ── S.No ──────────────────────────────────────────────────────────
        sno_el = await row.query_selector("td.views-field-counter")
        sl_no  = _clean(await sno_el.inner_text()) if sno_el else ""

        # ── Title ─────────────────────────────────────────────────────────
        title_el = await row.query_selector("td.views-field-title")
        title    = _clean(await title_el.inner_text()) if title_el else ""

        # ── Date ─────────────────────────────────────────────────────────
        date_el = await row.query_selector("td.views-field-field-date-range")
        date    = _clean(await date_el.inner_text()) if date_el else ""

        # ── Download links ────────────────────────────────────────────────
        # The Download/Link cell may contain one or more <a href="...">
        # hrefs are typically relative: /sites/default/files/...
        nid_el = await row.query_selector("td.views-field-nid")
        file_links = []
        if nid_el:
            link_els = await nid_el.query_selector_all("a[href]")
            for el in link_els:
                href  = await el.get_attribute("href") or ""
                label = _clean(await el.inner_text()) or "Download"
                # Make absolute
                if href.startswith("/"):
                    href = BASE_URL + href
                if href:
                    file_links.append({"label": label, "url": href})

        if not title:
            continue  # skip empty / header rows

        tenders.append({
            "sl_no":      sl_no,
            "title":      title,
            "date":       date,
            "file_links": file_links,
        })
        log.info("  [%s] %s | Files=%d", sl_no, title[:70], len(file_links))

    return tenders


async def get_next_page_url(page) -> str | None:
    """
    Drupal pagination: look for a <a rel="next"> or a link with text containing
    'next' / '>' in the pager section. Returns the absolute URL or None.
    """
    # Prefer rel="next" (most reliable)
    next_el = await page.query_selector("a[rel='next']")
    if next_el:
        href = await next_el.get_attribute("href") or ""
        if href.startswith("/"):
            href = BASE_URL + href
        return href or None

    # Fallback: pager li.pager__item--next > a
    next_el = await page.query_selector("li.pager__item--next a, li.next a")
    if next_el:
        href = await next_el.get_attribute("href") or ""
        if href.startswith("/"):
            href = BASE_URL + href
        return href or None

    return None


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
async def main():
    pool = await get_db_pool()
    log.info("DB pool created")

    async with async_playwright() as pw:
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
            no_viewport=True,
        )
        page = await context.new_page()

        current_url  = LISTING_URL
        page_num     = 0
        total_saved  = 0
        browser_alive = True

        while current_url and browser_alive:
            page_num += 1
            log.info("=== Page %d: %s", page_num, current_url)

            try:
                await page.goto(current_url, wait_until="networkidle", timeout=60_000)
            except PlaywrightError as exc:
                log.warning("Browser closed or navigation failed: %s", exc)
                browser_alive = False
                break

            # Scrape rows from current listing page
            rows = await scrape_one_page(page)
            log.info("  Page %d -> %d tenders found", page_num, len(rows))

            if not rows:
                log.info("  No rows on page %d — stopping.", page_num)
                break

            # Upsert each row
            for item in rows:
                refno = _make_refno(item["title"], item["date"])

                tender_details = {
                    "S.No":  item["sl_no"],
                    "Title": item["title"],
                    "Date":  item["date"],
                }

                record = {
                    "state":             STATE,
                    "organisation_name": ORG_NAME,
                    "e_published_date":  item["date"] or None,
                    "closing_date":      None,
                    "opening_date":      None,
                    "tender_title":      item["title"],
                    "tender_refno":      refno,
                    "tender_id":         item["sl_no"] or None,
                    "organisation_chain": ORG_NAME,
                    "tender_details":    json.dumps(tender_details, ensure_ascii=False),
                    "file_link":         json.dumps(item["file_links"], ensure_ascii=False),
                }

                try:
                    await upsert_tender(pool, record)
                    total_saved += 1
                except Exception as exc:
                    log.error("  DB error for '%s': %s", item["title"][:50], exc)

            log.info("  Page %d complete (%d saved so far)", page_num, total_saved)

            # Find next page
            try:
                next_url = await get_next_page_url(page)
            except PlaywrightError:
                log.warning("Browser closed while reading pagination.")
                browser_alive = False
                break

            if not next_url:
                log.info("  No next page found — pagination complete.")
                break

            current_url = next_url

        if browser_alive:
            try:
                await browser.close()
            except Exception:
                pass

    pool.close()
    await pool.wait_closed()
    log.info("All done. Total tenders saved: %d across %d page(s)",
             total_saved, page_num)


if __name__ == "__main__":
    asyncio.run(main())

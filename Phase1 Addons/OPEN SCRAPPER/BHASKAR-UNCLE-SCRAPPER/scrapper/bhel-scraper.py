"""
BHEL Tender Scraper
====================
Flow:
  1. Open https://tenders.bhel.com/tenders
  2. Scrape all listing rows (NIT No, Notif No, Description, Unit, Dates)
  3. For each row → click detail link → scrape the full th/td table:
       NIT NO, UNIT NAME, ADDRESS, EMAIL, TELEPHONE, FAX, APPROVED BY,
       CONTACT PERSON, NOTIFICATION NO, PUBLISH DATE, TENDER TITLE,
       TENDER TYPE, TENDER DESCRIPTION, TENDER VALUE, DOCUMENT VALUE,
       DATE OF NOTIFICATION, CLOSING DATE OF SALE FROM,
       CLOSING DATE OF SUBMISSION FORM, TENDER OPENING DATE,
       Download links (PDF/ZIP from #adddownloadpdf)
  4. Navigate to next listing page, repeat until exhausted.

DB: same `psu` table schema as hll-scraper.py
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

BASE_URL    = "https://tenders.bhel.com"
LISTING_URL = f"{BASE_URL}/tenders"
ORG_NAME    = "Bharat Heavy Electricals Limited (BHEL)"
STATE       = "Central"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# DB
# ──────────────────────────────────────────────
async def get_db_pool() -> aiomysql.Pool:
    return await aiomysql.create_pool(**DB_CONFIG, minsize=1, maxsize=5)


async def upsert_tender(pool: aiomysql.Pool, record: dict) -> None:
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
    log.info("    Upserted NIT#%s", record.get("tender_id", ""))


# ──────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────
def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


async def _safe_goto(page, url: str, timeout: int = 60_000) -> bool:
    """Navigate with domcontentloaded. Returns False if browser died."""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        return True
    except PlaywrightTimeoutError:
        return True     # partial load is fine
    except PlaywrightError as exc:
        if "closed" in str(exc).lower() or "target" in str(exc).lower():
            return False
        log.warning("Nav error for %s: %s", url, exc)
        return True


# ──────────────────────────────────────────────
# LISTING PAGE  →  extract rows (no detail yet)
# ──────────────────────────────────────────────
async def scrape_listing_rows(page) -> list[dict]:
    """Return raw row dicts from the CURRENTLY loaded listing page."""
    try:
        await page.wait_for_selector("tbody tr", timeout=20_000)
    except PlaywrightTimeoutError:
        return []

    rows = await page.query_selector_all("tbody tr")
    items = []

    for row in rows:
        # Col 1 – NIT No
        nit_el = await row.query_selector("td[headers='view-field-nit-no-table-column']")
        nit_no = _clean(await nit_el.inner_text()) if nit_el else ""

        # Col 2 – title cell
        title_el  = await row.query_selector("td[headers='view-title-table-column']")
        notif_no  = ""
        description = ""
        detail_url  = ""
        date_notif  = ""

        if title_el:
            desp_spans = await title_el.query_selector_all("span.tender-desp")

            if len(desp_spans) >= 1:
                raw = _clean(await desp_spans[0].inner_text())
                notif_no = re.sub(r"^Tender Notification Number\s*:\s*", "", raw).strip()

            if len(desp_spans) >= 2:
                link_el = await desp_spans[1].query_selector("a")
                if link_el:
                    description = _clean(await link_el.inner_text())
                    href = (await link_el.get_attribute("href") or "").strip()
                    detail_url = href if href.startswith("http") else (BASE_URL + "/" + href.lstrip("/"))
                else:
                    raw2 = _clean(await desp_spans[1].inner_text())
                    description = re.sub(r"^Tender Description\s*:\s*", "", raw2).strip()

            # Date of Notification
            date_span = await title_el.query_selector(f"span[id='{nit_no}']")
            if not date_span:
                date_span = await title_el.query_selector("span[id]")
            if date_span:
                date_notif = _clean(await date_span.inner_text())

        # Col 3 – Unit
        unit_el = await row.query_selector("td[headers='view-field-tender-unit-name-table-column']")
        unit = _clean(await unit_el.inner_text()) if unit_el else ""

        # Col 4 – Opening Bid Date
        bid_el  = await row.query_selector("td[headers='view-field-opening-bid-date-new-table-column']")
        bid_date = _clean(await bid_el.inner_text()) if bid_el else ""

        if not nit_no and not description:
            continue

        items.append({
            "nit_no":      nit_no,
            "notif_no":    notif_no,
            "description": description,
            "detail_url":  detail_url,
            "date_notif":  date_notif,
            "unit":        unit,
            "bid_date":    bid_date,
        })
        log.info("  NIT#%s | %s", nit_no, description[:60])

    return items


# ──────────────────────────────────────────────
# DETAIL PAGE  →  scrape th/td table
# ──────────────────────────────────────────────
async def scrape_detail(page, detail_url: str) -> tuple[dict, list]:
    """
    Navigate to the tender detail page.
    Scrape the tbody table where each row has <th>KEY</th><td>VALUE</td>.
    Also extract file download links from #adddownloadpdf.

    Returns:
        (tender_details_dict, file_links_list)
    """
    details   = {}
    file_links = []

    if not detail_url:
        return details, file_links

    log.info("  -> Detail: %s", detail_url)
    alive = await _safe_goto(page, detail_url, timeout=45_000)
    if not alive:
        raise PlaywrightError("Browser closed")

    # Wait for the detail table
    try:
        await page.wait_for_selector("tbody tr th", timeout=20_000)
    except PlaywrightTimeoutError:
        log.warning("    Detail table not found on %s", detail_url)
        return details, file_links

    rows = await page.query_selector_all("tbody tr")
    for row in rows:
        th_el = await row.query_selector("th")
        td_el = await row.query_selector("td")
        if not th_el or not td_el:
            continue

        key = _clean(await th_el.inner_text())

        # Check if this is the download row
        if "download" in key.lower():
            # Extract every <a> in #adddownloadpdf (or the whole td)
            download_div = await td_el.query_selector("#adddownloadpdf")
            container    = download_div if download_div else td_el
            links        = await container.query_selector_all("a[href]")
            for link in links:
                href  = (await link.get_attribute("href") or "").strip()
                label = _clean(await link.get_attribute("title") or
                               await link.inner_text()) or "Download"
                if href:
                    file_links.append({"label": label, "url": href})
            # Store file count in details too
            details[key] = f"{len(file_links)} file(s)"
        else:
            # Plain text value (may be inside a nested .field-item div)
            val = _clean(await td_el.inner_text())
            details[key] = val

    log.info("    Fields=%d | Files=%d", len(details), len(file_links))
    return details, file_links


# ──────────────────────────────────────────────
# PAGINATION
# ──────────────────────────────────────────────
async def get_next_page_url(page) -> str | None:
    """Return the URL of the next pager page, or None if last page."""
    selectors = [
        "a[title='Go to next page']",
        "a[title*='next page']",
        "li.pager__item--next a",
        "a[rel='next']",
    ]
    for sel in selectors:
        el = await page.query_selector(sel)
        if el:
            href = (await el.get_attribute("href") or "").strip()
            if href.startswith("http"):
                return href
            if href.startswith("?"):
                return f"{LISTING_URL}{href}"
            if href.startswith("/"):
                return BASE_URL + href
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
            slow_mo=100,
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 768},
        )
        page = await context.new_page()

        current_url   = LISTING_URL
        page_num      = 0
        total_saved   = 0
        browser_alive = True

        while current_url and browser_alive:
            page_num += 1
            log.info("=== Listing Page %d: %s", page_num, current_url)

            # ── Load listing page ───────────────────────────────────────────
            alive = await _safe_goto(page, current_url)
            if not alive:
                log.warning("Browser closed loading listing — stopping.")
                break

            # ── Scrape listing rows ─────────────────────────────────────────
            listing_rows = await scrape_listing_rows(page)
            log.info("  Found %d tenders on page %d", len(listing_rows), page_num)

            if not listing_rows:
                log.info("  No rows — done.")
                break

            # Capture the "next page" URL BEFORE leaving this listing page
            try:
                next_url = await get_next_page_url(page)
            except PlaywrightError:
                log.warning("Browser closed reading pager.")
                browser_alive = False
                next_url = None

            # ── For each tender: visit detail page ──────────────────────────
            for item in listing_rows:
                if not browser_alive:
                    break

                # Visit detail page and scrape
                try:
                    details, file_links = await scrape_detail(page, item["detail_url"])
                except PlaywrightError:
                    log.warning("Browser closed on detail — stopping.")
                    browser_alive = False
                    break

                # Prefer detail-page values where available; fall back to listing
                tender_title  = (details.get("TENDER TITLE")
                                 or details.get("TENDER DESCRIPTION")
                                 or item["description"])
                tender_refno  = (details.get("NOTIFICATION NO.")
                                 or item["notif_no"]
                                 or f"BHEL/{item['nit_no']}")
                closing_date  = (details.get("TENDER OPENING DATE")
                                 or details.get("CLOSING DATE OF SUBMISSION FORM")
                                 or item["bid_date"])
                pub_date      = (details.get("DATE OF NOTIFICATION")
                                 or details.get("PUBLISH DATE")
                                 or item["date_notif"])
                opening_date  = details.get("TENDER OPENING DATE") or item["bid_date"]
                unit          = details.get("UNIT NAME") or item["unit"]

                record = {
                    "state":             STATE,
                    "organisation_name": ORG_NAME,
                    "e_published_date":  pub_date     or None,
                    "closing_date":      closing_date or None,
                    "opening_date":      opening_date or None,
                    "tender_title":      tender_title,
                    "tender_refno":      tender_refno,
                    "tender_id":         item["nit_no"] or None,
                    "organisation_chain": f"{ORG_NAME} -> {unit}",
                    "tender_details":    json.dumps(details,     ensure_ascii=False),
                    "file_link":         json.dumps(file_links,  ensure_ascii=False),
                }

                try:
                    await upsert_tender(pool, record)
                    total_saved += 1
                except Exception as exc:
                    log.error("  DB error NIT#%s: %s", item["nit_no"], exc)

            log.info("  Page %d done. Total saved so far: %d", page_num, total_saved)

            if not browser_alive:
                break

            # ── Move to next listing page ───────────────────────────────────
            if not next_url:
                log.info("No next page — scraping complete.")
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

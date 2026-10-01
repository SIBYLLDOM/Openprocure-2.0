"""
AIIMS New Delhi Tender Scraper
================================
Scrapes https://www.aiims.edu/index.php/en/tenders

Listing table columns:
  S.No | Tender Category | Tender Title (with link) | Date of Publishing | Date of Closing

For EACH tender, clicks the link and scrapes the detail div:
  <div class="detail">
    <div class="left">Tender No</div>       <div class="right">...</div>
    <div class="left">Title</div>           <div class="right">...</div>
    <div class="left">Date of Uploading</div><div class="right">...</div>
    <div class="left">Date of Closing</div> <div class="right">...</div>
    <div class="left">Document</div>        <div class="right"><a href="...pdf"><img></a></div>
  </div>

Stored in psu table:
  tender_details -> JSON dict of all left/right key-value pairs
  file_link      -> JSON array of {label, url} for Document links only

All 79 tenders appear on a SINGLE listing page (no pagination).
Browser is VISIBLE so you can watch it work.
"""

import asyncio
import json
import re
import logging
from urllib.parse import quote

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

BASE_URL    = "https://www.aiims.edu"
LISTING_URL = f"{BASE_URL}/index.php/en/tenders"
ORG_NAME    = "All India Institute of Medical Sciences (AIIMS), New Delhi"
STATE       = "Delhi"

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
            tender_title        = new_row.tender_title,
            organisation_chain  = new_row.organisation_chain,
            tender_details      = new_row.tender_details,
            file_link           = new_row.file_link,
            updated_at          = CURRENT_TIMESTAMP
    """
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, record)
    log.info("  Upserted: %s", (record.get("tender_refno") or "")[:60])


# ──────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────
def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _extract_id(url: str) -> str:
    """Extract the ?id= value from a tender URL."""
    m = re.search(r"[?&]id=(\d+)", url)
    return m.group(1) if m else ""


def _make_abs_url(href: str) -> str:
    """
    Convert a relative href to an absolute URL, properly encoding
    spaces and special characters in the path (e.g. PDF filenames).
    'safe' keeps URL structure chars intact so only spaces/etc get encoded.
    """
    if not href:
        return ""
    if href.startswith("http"):
        return href   # already absolute
    # Encode only the path (spaces -> %20, etc.) but leave / : ? & = # intact
    encoded = quote(href, safe="/:@!$&'()*+,;=?#%")
    return BASE_URL + encoded


async def _safe_goto(page, url: str, timeout: int = 60_000) -> bool:
    """Navigate with domcontentloaded; returns False if browser is dead."""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        return True
    except PlaywrightTimeoutError:
        # Site loaded partially — that's OK, continue
        return True
    except PlaywrightError as exc:
        if "closed" in str(exc).lower() or "target" in str(exc).lower():
            return False   # browser died
        log.warning("Navigation error for %s: %s", url, exc)
        return True        # other error, keep going


# ──────────────────────────────────────────────
# LISTING PAGE SCRAPER
# ──────────────────────────────────────────────
async def scrape_listing(page) -> list[dict]:
    """
    Extract all rows from the tender listing table.
    Columns: S.No | Tender Category | Tender Title (with link) |
             Date of Publishing | Date of Closing
    """
    try:
        await page.wait_for_selector("table tbody tr", timeout=30_000)
    except PlaywrightTimeoutError:
        log.warning("No table rows found on listing page.")
        return []

    rows = await page.query_selector_all("table tbody tr")
    tenders = []

    for row in rows:
        cells = await row.query_selector_all("td")
        if len(cells) < 5:
            continue  # skip header or malformed rows

        sl_no      = _clean(await cells[0].inner_text())
        category   = _clean(await cells[1].inner_text())
        title      = _clean(await cells[2].inner_text())
        pub_date   = _clean(await cells[3].inner_text())
        close_date = _clean(await cells[4].inner_text())

        link_el    = await cells[2].query_selector("a[href]")
        detail_url = await link_el.get_attribute("href") if link_el else ""
        if detail_url and detail_url.startswith("/"):
            detail_url = BASE_URL + detail_url

        if not title or not detail_url:
            continue

        tender_id = _extract_id(detail_url)

        tenders.append({
            "sl_no":      sl_no,
            "category":   category,
            "title":      title,
            "detail_url": detail_url,
            "pub_date":   pub_date,
            "close_date": close_date,
            "tender_id":  tender_id,
            "refno":      f"AIIMS/{tender_id}",
        })
        log.info("  [%s] %s", sl_no, title[:70])

    return tenders


# ──────────────────────────────────────────────
# DETAIL PAGE SCRAPER
# ──────────────────────────────────────────────
async def scrape_detail(page, detail_url: str) -> dict:
    """
    Navigate to the tender detail page and scrape the structured
    div.detail block:

      <div class="detail">
        <div class="left">KEY</div>
        <div class="right">VALUE  (or <a href="...pdf">)</div>
        ...
      </div>

    Returns:
      {
        "tender_details": { "Tender No": "...", "Title": "...", ... },
        "file_links":     [ { "label": "Document", "url": "https://..." }, ... ]
      }
    """
    result = {
        "tender_details": {},
        "file_links":     [],
    }

    try:
        log.info("  -> %s", detail_url)
        ok = await _safe_goto(page, detail_url)
        if not ok:
            raise PlaywrightError("Browser closed")

        # ── Check for Joomla error page (article not found) ────────────────
        error_el = await page.query_selector("#errorboxbody")
        if error_el:
            log.warning("    Error page (article not found) — skipping")
            return result

        # Wait for the detail div
        try:
            await page.wait_for_selector("div.detail", timeout=20_000)
        except PlaywrightTimeoutError:
            log.warning("    div.detail not found on %s", detail_url)
            return result

        # Grab ALL children of div.detail (alternating .left / .right)
        detail_el = await page.query_selector("div.detail")
        if not detail_el:
            return result

        children = await detail_el.query_selector_all(".left, .right")

        details_dict = {}
        file_links   = []
        current_key  = None

        for child in children:
            cls = await child.get_attribute("class") or ""

            if "left" in cls:
                # This is a KEY div
                current_key = _clean(await child.inner_text())

            elif "right" in cls and current_key is not None:
                # This is a VALUE div — check for a download link first
                link_el = await child.query_selector("a[href]")

                if link_el:
                    # Has a link — extract href and URL-encode (e.g. spaces -> %20)
                    raw_href = await link_el.get_attribute("href") or ""
                    href = _make_abs_url(raw_href)

                    # Value text: try inner_text, fall back to filename from raw href
                    val_text = _clean(await link_el.inner_text())
                    if not val_text:
                        val_text = raw_href.split("/")[-1].split("?")[0] or "Download"

                    details_dict[current_key] = val_text

                    # Store as a file link if it looks like a downloadable file
                    if href and re.search(
                        r'\.(pdf|doc|docx|xls|xlsx|zip|rar)(\?.*)?$',
                        href, re.IGNORECASE
                    ):
                        file_links.append({
                            "label": current_key,   # e.g. "Document"
                            "url":   href,
                        })
                    elif href and "/images/" in href:
                        # AIIMS stores PDFs under /images/pdf/tender/
                        file_links.append({
                            "label": current_key,
                            "url":   href,
                        })
                else:
                    # Plain text value
                    val_text = _clean(await child.inner_text())
                    details_dict[current_key] = val_text

                current_key = None   # reset for next pair

        result["tender_details"] = details_dict
        result["file_links"]     = file_links

        log.info("    Fields=%d | Files=%d", len(details_dict), len(file_links))

    except PlaywrightError:
        raise   # let caller handle browser-dead case
    except Exception as exc:
        log.error("  Error on %s: %s", detail_url, exc)

    return result


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
async def main():
    pool = await get_db_pool()
    log.info("DB pool created")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=False,
            slow_mo=200,          # give each action 200ms — avoids race conditions
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

        # ── Step 1: Load listing page ──────────────────────────────────────
        log.info("Opening listing: %s", LISTING_URL)
        alive = await _safe_goto(page, LISTING_URL)
        if not alive:
            log.error("Browser closed during listing load — exiting.")
            pool.close()
            await pool.wait_closed()
            return

        # ── Step 2: Scrape all rows ────────────────────────────────────────
        listing = await scrape_listing(page)
        log.info("Total tenders found: %d", len(listing))

        total_saved   = 0
        browser_alive = True

        # ── Step 3: Visit each detail page ────────────────────────────────
        for item in listing:
            if not browser_alive:
                break

            try:
                detail = await scrape_detail(page, item["detail_url"])
            except PlaywrightError:
                log.warning("Browser closed — stopping after %d tenders.", total_saved)
                browser_alive = False
                break

            record = {
                "state":             STATE,
                "organisation_name": ORG_NAME,
                "e_published_date":  item["pub_date"]   or None,
                "closing_date":      item["close_date"] or None,
                "opening_date":      None,
                "tender_title":      item["title"],
                "tender_refno":      item["refno"],
                "tender_id":         item["tender_id"] or None,
                "organisation_chain": f"{ORG_NAME} -> {item['category']}",
                "tender_details":    json.dumps(
                                         detail["tender_details"],
                                         ensure_ascii=False
                                     ),
                "file_link":         json.dumps(
                                         detail["file_links"],
                                         ensure_ascii=False
                                     ),
            }

            try:
                await upsert_tender(pool, record)
                total_saved += 1
            except Exception as exc:
                log.error("  DB error for '%s': %s", item["title"][:50], exc)

        if browser_alive:
            try:
                await browser.close()
            except Exception:
                pass

    pool.close()
    await pool.wait_closed()
    log.info("Done. Total saved: %d", total_saved)


if __name__ == "__main__":
    asyncio.run(main())

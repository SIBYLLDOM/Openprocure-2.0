"""
HITES Tender Scraper
====================
Scrapes ALL pages of https://hllhites.com/tenders/tender (with pagination)
and stores them in the `psu` table in `tender_automation_with_ai` DB.

Table columns on the site:
  Sl.No | Title | Ref No | Closing Date | Department | Download

Since there are no individual detail pages, all data is extracted from the
listing table. File download links are picked from the .downloadDropdown ul > li > a
elements on the same row.

Steps:
  1. Load listing page -> detect pagination
  2. For EACH page: extract all tender rows
  3. For each row: collect title, ref_no, closing_date, department, file_links
  4. Upsert into MySQL `psu` table
  5. Move to the next page and repeat

Browser runs in VISIBLE mode so you can watch it work.
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
    "host":      "localhost",
    "port":      3306,
    "user":      "root",           # <- change if needed
    "password":  "",               # <- change if needed
    "db":        "tender_automation_with_ai",
    "charset":   "utf8mb4",
    "autocommit": True,
}

BASE_URL    = "https://hllhites.com"
LISTING_URL = f"{BASE_URL}/tenders/tender"
ORG_NAME    = "HLL HITES"
STATE       = "Delhi"              # HLL HITES HQ is in New Delhi

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

    Expected columns (0-indexed):
      0 - Sl.No
      1 - Tender Title
      2 - Ref No / Tender No
      3 - Closing Date
      4 - Department
      5 - Download (may contain <a> links inside .downloadDropdown)
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
        if len(cells) < 5:
            continue

        sl_no      = _clean(await cells[0].inner_text())
        title      = _clean(await cells[1].inner_text())
        ref_no     = _clean(await cells[2].inner_text())
        closing_dt = _clean(await cells[3].inner_text())
        department = _clean(await cells[4].inner_text())

        # ── Click Download dropdown and collect ALL revealed links ──────────
        # The site loads file links dynamically when .downloadCard is clicked.
        # Some tenders have 1 file, others have 6+ (Vol1, Vol2 ... + Prebid etc.)
        file_links = []
        if len(cells) >= 6:
            download_card = await cells[5].query_selector(".downloadCard")
            if download_card:
                try:
                    await download_card.click()
                    # Wait until at least one <a href> appears inside this cell
                    await page.wait_for_function(
                        """(cell) => cell.querySelectorAll('a[href]').length > 0""",
                        arg=cells[5],
                        timeout=5_000,
                    )
                    # Extra settle so ALL <li> links finish rendering
                    await asyncio.sleep(0.5)
                except PlaywrightTimeoutError:
                    pass  # No links uploaded yet for this tender
                except Exception as exc:
                    log.warning("    Could not click download card for [%s]: %s", sl_no, exc)

            # Read ALL links now in the DOM (handles 1 file or 6+ files)
            link_els = await cells[5].query_selector_all("ul li a[href]")
            for link_el in link_els:
                href  = await link_el.get_attribute("href") or ""
                label = _clean(await link_el.inner_text()) or "Tender File"
                if not href:
                    continue
                if href.startswith("/"):
                    href = BASE_URL + href
                file_links.append({"label": label, "url": href})
            log.info("    [%s] %d file link(s) found", sl_no, len(file_links))

            # Dismiss the dropdown (click elsewhere) before next row
            try:
                await page.keyboard.press("Escape")
                await asyncio.sleep(0.3)
            except Exception:
                pass

        # Build a tender_details dict from the listing data
        tender_details = {
            "Listing Info": {
                "Sl No":        sl_no,
                "Ref No":       ref_no,
                "Closing Date": closing_dt,
                "Department":   department,
            }
        }

        tenders.append({
            "sl_no":         sl_no,
            "title":         title,
            "ref_no":        ref_no,
            "closing_date":  closing_dt,
            "department":    department,
            "file_links":    file_links,
            "tender_details": tender_details,
        })
        log.info("  Found [%s] %s", sl_no, title[:80])

    return tenders


async def next_page_exists(page) -> bool:
    """
    Returns True if the Next button is present AND not disabled.
    The site uses: <button class="next_btn prev_btn">Next</button>
    """
    try:
        btn = await page.query_selector("button.next_btn")
        if btn is None:
            return False
        # Check for disabled attribute or class
        disabled = await btn.get_attribute("disabled")
        cls = await btn.get_attribute("class") or ""
        if disabled is not None or "disabled" in cls:
            return False
        return True
    except Exception:
        return False


async def click_next_page(page) -> None:
    """
    Click the Next button and wait until the table content refreshes.
    Strategy: record the text of the first row before clicking, then
    wait until it changes (new page loaded) or a short timeout.
    """
    # Snapshot first row text so we can detect when content changes
    try:
        first_row = await page.query_selector("table tbody tr:first-child")
        old_text = await first_row.inner_text() if first_row else ""
    except Exception:
        old_text = ""

    btn = await page.query_selector("button.next_btn")
    await btn.click()

    # Wait up to 15 s for the table content to change
    try:
        await page.wait_for_function(
            """(oldText) => {
                const row = document.querySelector('table tbody tr:first-child');
                return row && row.innerText.trim() !== oldText.trim();
            }""",
            arg=old_text,
            timeout=15_000,
        )
    except PlaywrightTimeoutError:
        # Content may not have changed (last page edge case), continue anyway
        log.warning("  Timed out waiting for next page content — may be last page.")
    await asyncio.sleep(0.5)  # small settle delay


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

        # Step 1: Open the listing page
        log.info("Opening listing page: %s", LISTING_URL)
        await page.goto(LISTING_URL, wait_until="networkidle", timeout=60_000)

        total_processed = 0
        page_num       = 0
        browser_alive  = True

        # Step 2: Click-based pagination loop
        while browser_alive:
            page_num += 1
            log.info("=== Scraping page %d", page_num)

            try:
                # Extract all rows on the current page
                listing = await scrape_one_page(page)
                log.info("  Page %d -> %d tenders found", page_num, len(listing))

                # Step 3: Build records and upsert
                for item in listing:
                    try:
                        record = {
                            "state":             STATE,
                            "organisation_name": ORG_NAME,
                            "e_published_date":  None,      # not shown on listing
                            "closing_date":      item["closing_date"],
                            "opening_date":      None,      # not shown on listing
                            "tender_title":      item["title"],
                            "tender_refno":      item["ref_no"],
                            "tender_id":         None,      # site uses ref_no as ID
                            "organisation_chain": f"{ORG_NAME} -> {item['department']}",
                            "tender_details":    json.dumps(item["tender_details"], ensure_ascii=False),
                            "file_link":         json.dumps(item["file_links"],     ensure_ascii=False),
                        }
                        await upsert_tender(pool, record)
                        total_processed += 1

                    except PlaywrightError:
                        log.warning("  Browser closed -- stopping after %d tenders.",
                                    total_processed)
                        browser_alive = False
                        break
                    except Exception as exc:
                        log.error("  Error processing tender [%s]: %s", item.get("ref_no"), exc)

                log.info("  Page %d complete (%d upserted so far)", page_num, total_processed)

                # Step 4: Check for Next button and click it
                if not browser_alive:
                    break

                has_next = await next_page_exists(page)
                if not has_next:
                    log.info("No more pages — scraping complete.")
                    break

                log.info("  Clicking Next button -> page %d", page_num + 1)
                await click_next_page(page)

            except PlaywrightTimeoutError:
                log.warning("  Timeout on page %d — stopping.", page_num)
                break
            except PlaywrightError as exc:
                log.warning("  Browser closed on page %d — stopping. (%s)", page_num, exc)
                browser_alive = False

        if browser_alive:
            try:
                await browser.close()
            except Exception:
                pass

    pool.close()
    await pool.wait_closed()
    log.info("All done. Total tenders processed across all pages: %d", total_processed)



if __name__ == "__main__":
    # NOTE: On Windows, Playwright REQUIRES the default ProactorEventLoop
    # (asyncio.subprocess needs it to spawn the browser process).
    # DO NOT switch to WindowsSelectorEventLoopPolicy — it breaks subprocess launch.
    # The "Event loop is closed" line at teardown is harmless aiomysql noise.
    asyncio.run(main())

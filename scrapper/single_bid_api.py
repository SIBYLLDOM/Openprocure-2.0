#!/usr/bin/env python3
import asyncio
import re
import sys
import json
import mysql.connector
import logging
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from playwright.async_api import async_playwright
from contextlib import asynccontextmanager
import uvicorn

BASE_URL = "https://bidplus.gem.gov.in"

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
    "autocommit": False,
}

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("single-bid-api")

# Global browser state
browser_state = {"playwright": None, "browser": None, "page": None, "semaphore": None}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for FastAPI - launches browser on startup and closes on shutdown"""
    logger.info("🚀 Starting browser in background...")

    # Launch browser on startup
    browser_state["playwright"] = await async_playwright().start()
    browser_state["browser"] = await browser_state["playwright"].chromium.launch(
        channel="chrome",
        headless=False,
        args=["--disable-blink-features=AutomationControlled"],
    )
    browser_state["page"] = await browser_state["browser"].new_page()
    browser_state["semaphore"] = asyncio.Semaphore(1)  # Ensure one request at a time

    logger.info("✅ Browser is ready and waiting in background!")

    yield

    # Cleanup on shutdown
    logger.info("🛑 Shutting down browser...")
    if browser_state["page"]:
        await browser_state["page"].close()
    if browser_state["browser"]:
        await browser_state["browser"].close()
    if browser_state["playwright"]:
        await browser_state["playwright"].stop()
    logger.info("✅ Browser closed successfully")


app = FastAPI(title="GeM Single Bid Scraper", lifespan=lifespan)

# Add CORS middleware to allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*"
    ],  # Allow all origins (or specify your frontend URL: ["http://localhost:5173"])
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# -------------------------------------------------
# SQL
# -------------------------------------------------
UPSERT_SQL = """
INSERT INTO gem_tenders
(keyword, page_no, bid_number, detail_url, items, quantity, department,
 start_date, end_date, ra_no, ra_url,
 Representation_json, Corrigendum_json, main_relevency_score, match_count)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
ON DUPLICATE KEY UPDATE
  detail_url = VALUES(detail_url),
  items = VALUES(items),
  quantity = VALUES(quantity),
  department = VALUES(department),
  start_date = VALUES(start_date),
  end_date = VALUES(end_date),
  ra_no = VALUES(ra_no),
  ra_url = VALUES(ra_url),
  Representation_json = VALUES(Representation_json),
  Corrigendum_json = VALUES(Corrigendum_json),
  main_relevency_score = VALUES(main_relevency_score),
  match_count = VALUES(match_count);
"""


def db_insert(row):
    conn = mysql.connector.connect(**DB_CONFIG)
    cur = conn.cursor()
    try:
        cur.execute(UPSERT_SQL, row)
        conn.commit()
    finally:
        cur.close()
        conn.close()


# -------------------------------------------------
# MODAL EXTRACTION
# -------------------------------------------------
async def extract_modal_data(page, trigger_element=None, js_trigger=None):
    try:
        if js_trigger:
            await page.evaluate(js_trigger)
        elif trigger_element:
            await trigger_element.click(force=True)

        modal = await page.wait_for_selector("div.modal:visible", timeout=8000)
        await asyncio.sleep(1)

        content = await modal.inner_text()

        close_btn = await modal.query_selector(
            "button.close, button[data-dismiss='modal']"
        )
        if close_btn:
            await close_btn.click()
        else:
            await page.keyboard.press("Escape")

        await page.wait_for_selector("div.modal:visible", state="hidden", timeout=5000)

        return json.dumps({"content": content}, ensure_ascii=False)

    except Exception:
        try:
            await page.keyboard.press("Escape")
        except:
            pass
        return None


# -------------------------------------------------
# CORE SCRAPER (USING PERSISTENT BROWSER)
# -------------------------------------------------
async def scrape_bid_internal(bid_no: str):
    # Use semaphore to ensure only one request processes at a time
    async with browser_state["semaphore"]:
        page = browser_state["page"]

        logger.info(f"Searching Bid No: {bid_no}")

        await page.goto(f"{BASE_URL}/all-bids", timeout=0, wait_until="networkidle")
        await asyncio.sleep(1.5)

        search_box = await page.query_selector("input#searchBid")
        if not search_box:
            raise RuntimeError("Search box not found")

        await search_box.fill(bid_no)
        await asyncio.sleep(0.3)
        await search_box.press("Enter")
        await asyncio.sleep(2.5)

        c = await page.query_selector("div.card")
        if not c:
            return {"status": "not_found", "bid_no": bid_no}

        bid_link = await c.query_selector(".block_header a.bid_no_hover")
        bid_text = (await bid_link.inner_text()).strip()
        detail_url = BASE_URL + "/" + (await bid_link.get_attribute("href")).lstrip("/")

        item_el = await c.query_selector(".card-body .col-md-4 .row:nth-child(1) a")
        items = (await item_el.inner_text()).strip() if item_el else ""

        qty_el = await c.query_selector(".card-body .col-md-4 .row:nth-child(2)")
        quantity = (
            (await qty_el.inner_text()).replace("Quantity:", "").strip()
            if qty_el
            else ""
        )

        dept_el = await c.query_selector(".card-body .col-md-5 .row:nth-child(2)")
        department = (await dept_el.inner_text()).strip() if dept_el else ""

        start_el = await c.query_selector("span.start_date")
        start_date = (await start_el.inner_text()).strip() if start_el else ""

        end_el = await c.query_selector("span.end_date")
        end_date = (await end_el.inner_text()).strip() if end_el else ""

        # ---------- RA ----------
        ra_no = ""
        ra_url = ""
        try:
            ra_p = await c.query_selector("p.bid_no")
            if ra_p and "RA NO" in (await ra_p.inner_text()):
                ra_link = await ra_p.query_selector("a")
                ra_no = (await ra_link.inner_text()).strip()
                href = await ra_link.get_attribute("href")
                if href:
                    ra_url = BASE_URL + href if href.startswith("/") else href
        except:
            pass

        # ---------- Expand ----------
        try:
            toggle = await c.query_selector(
                "a:has-text('View Corrigendum/Representation')"
            )
            if toggle:
                await toggle.click(force=True)
                await asyncio.sleep(1.5)
        except:
            pass

        # ---------- Representation ----------
        rep_json = None
        try:
            for el in await c.query_selector_all("a, span"):
                if "View Representation" in ((await el.inner_text()) or ""):
                    oc = await el.get_attribute("onclick")
                    rep_json = await extract_modal_data(
                        page,
                        js_trigger=oc if oc else None,
                        trigger_element=None if oc else el,
                    )
                    break
        except:
            pass

        # ---------- Corrigendum ----------
        corr_json = None
        try:
            for s in await c.query_selector_all("span[data-bid]"):
                if "View Corrigendum" in ((await s.inner_text()) or ""):
                    bid = await s.get_attribute("data-bid")
                    if bid:
                        corr_json = await extract_modal_data(
                            page,
                            js_trigger=f"view_corrigendum_modal('{bid}')",
                        )
                    break
        except:
            pass

        row = (
            "MANUAL_BID_SEARCH",
            1,
            bid_text,
            detail_url,
            items,
            quantity,
            department,
            start_date,
            end_date,
            ra_no,
            ra_url,
            rep_json,
            corr_json,
            0.87,  # main_relevency_score
            6,  # match_count
        )

        db_insert(row)
        logger.info(f"Bid {bid_text} saved to DB")

        return {
            "status": "success",
            "bid_number": bid_text,
            "detail_url": detail_url,
            "items": items,
            "quantity": quantity,
            "department": department,
            "start_date": start_date,
            "end_date": end_date,
            "ra_no": ra_no,
            "ra_url": ra_url,
            "representation": rep_json,
            "corrigendum": corr_json,
        }


# -------------------------------------------------
# FASTAPI ENDPOINTS
# -------------------------------------------------
@app.get("/get/tender")
async def get_tender(bid_no: str = Query(...)):
    """GET endpoint to fetch tender metadata and save to DB"""
    return await scrape_bid_internal(bid_no)


@app.post("/scrape")
async def scrape_tender(request: Request):
    """POST endpoint to scrape tender by query (bid number)"""
    body = await request.json()
    query = body.get("query", "").strip()
    if not query:
        return {"status": "error", "message": "Query parameter is required"}

    try:
        result = await scrape_bid_internal(query)
        return {
            "status": "success",
            "message": f"Tender {query} scraped and saved to database",
            "data": result,
        }
    except Exception as e:
        logger.error(f"Error scraping tender {query}: {e}")
        return {"status": "error", "message": str(e)}


# -------------------------------------------------
# RUN SERVER
# -------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("single_bid_api:app", host="0.0.0.0", port=5080, reload=False)

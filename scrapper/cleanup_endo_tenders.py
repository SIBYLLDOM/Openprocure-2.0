#!/usr/bin/env python3
"""
cleanup_endo_tenders.py

Re-checks every currently-active GeM Endo tender already saved in gem_tenders
(dept = 'Endo', end_date not yet passed) and flags the ones that are not
actually relevant to Meril's Endo-Surgery product line — cleans up noise left
behind by broad category scraping (run_endo_perfect_category.py etc.).

Nothing is deleted. Irrelevant tenders are marked via the existing
gem_tenders.marked_not_relevant flag, the same column the tender portal
listing already excludes on (see WHERE ... marked_not_relevant = 0 in
tenders.controller.js) — so they simply stop showing up in the portal, and
can be un-marked any time by setting the flag back to 0.

Usage:
    python cleanup_endo_tenders.py            # dry run — logs what WOULD be marked
    python cleanup_endo_tenders.py --yes       # actually marks marked_not_relevant = 1

Safety:
    - Only ever considers dept = 'Endo' rows whose end_date is still in the future.
    - Never marks a tender that's is_interested=1, has a workspace, or has a
      tracked gem_bids row — those mean someone already acted on it.
    - Defaults to a dry run; pass --yes to actually apply the flag.
    - Every decision is logged to cleanup_endo_tenders.log.
"""
import argparse
import io
import logging
import sys
import time
from datetime import datetime

import mysql.connector
import pypdf
import requests

import openscraper as osc

# ---------------------------
# CONFIG
# ---------------------------
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
    "autocommit": False,
}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

# Reasons/PDF text can contain characters the Windows console's default cp1252
# codepage can't print — reconfigure so a stray character never crashes a
# 400+ item batch run partway through.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("cleanup_endo_tenders.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("cleanup-endo")

FILTER_SYSTEM_PROMPT = f"""You are a Tender Pre-Screening Specialist at Meril Life Sciences Pvt Ltd (Endo-Surgery Division).

Your ONLY job: decide whether a GeM tender already saved as an "Endo" tender is
actually relevant — does it ask for products Meril's Endo-Surgery division sells?

{osc.MERIL_ENDO_PRODUCTS}

DECISION RULES:
1. If the Item/Category (or extra document text, if given) clearly mentions ANY
   product above -> "Yes".
2. If the department is a hospital/lab/health body AND the item name is vague or
   just a code/number -> "Doubt".
3. If unsure -> "Doubt".
4. Return "No" ONLY when 100% certain it has nothing to do with surgical
   staplers/trocars/mesh/sutures/energy devices/biosurgicals/glue/IUDs.

CRITICAL: "Yes" and "Doubt" both survive; only "No" gets marked not-relevant.
          Wrongly hiding a relevant tender is a business loss — be conservative.

Return ONLY valid JSON — no text outside the JSON.
{{
  "decision": "Yes" | "Doubt" | "No",
  "reason": "<one sentence: what the tender is for and why>"
}}"""


# ---------------------------
# DB HELPERS
# ---------------------------
def db_connect():
    return mysql.connector.connect(**DB_CONFIG)


END_DATE_FORMATS = (
    "%d-%m-%Y %I:%M %p",    # "23-01-2026 9:00 AM"  (actual GeM format)
    "%d-%m-%Y %H:%M:%S",
    "%d-%m-%Y %H:%M",
    "%d-%m-%Y",
)


def parse_end_date(raw):
    if not raw:
        return None
    raw = raw.strip()
    for fmt in END_DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def fetch_active_endo_tenders(conn):
    cur = conn.cursor(dictionary=True)
    cur.execute(
        "SELECT g.id, g.bid_number, g.items, g.quantity, g.department, g.end_date, "
        "       g.is_interested, g.detail_url, d.pdf_path "
        "FROM gem_tenders g "
        "LEFT JOIN gem_tender_docs d ON d.bid_number = g.bid_number "
        "WHERE g.dept = 'Endo' AND (g.marked_not_relevant IS NULL OR g.marked_not_relevant = 0)"
    )
    rows = cur.fetchall()
    cur.close()
    now = datetime.now()
    active = []
    for r in rows:
        end_dt = parse_end_date(r["end_date"])
        if end_dt and end_dt >= now:
            active.append(r)
    return active


def has_protected_reference(conn, bid_number):
    """True if this tender must never be auto-deleted — someone already
    engaged with it (marked interested, opened a workspace, or it's a
    tracked bid). Each check is best-effort: a missing table is not fatal,
    it just means that particular protection doesn't apply."""
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM workspaces WHERE tender_id = %s LIMIT 1", (bid_number,))
        if cur.fetchone():
            return True
    except mysql.connector.Error:
        pass
    try:
        cur.execute("SELECT 1 FROM gem_bids WHERE bid_no = %s LIMIT 1", (bid_number,))
        if cur.fetchone():
            return True
    except mysql.connector.Error:
        pass
    finally:
        cur.close()
    return False


# ---------------------------
# BID DOC DEEP-DIVE — when there's no usable title, pull the actual bid
# document (local copy if already downloaded, else fetch detail_url) and
# extract its text so the LLM has something real to judge relevance from.
# ---------------------------
def _is_code_like(items: str) -> bool:
    stripped = (items or "").strip()
    if len(stripped) < 6:
        return True
    letters = sum(c.isalpha() for c in stripped)
    return letters < max(3, len(stripped) * 0.3)


def fetch_bid_doc_text(bid_number, detail_url, pdf_path, max_chars=4000):
    data = None
    if pdf_path:
        try:
            with open(pdf_path, "rb") as f:
                data = f.read()
        except OSError as e:
            logger.info(f"    [DOC] local pdf_path unreadable for {bid_number}: {e}")
            data = None
    if data is None and detail_url:
        try:
            resp = requests.get(detail_url, headers={"User-Agent": UA}, timeout=30)
            resp.raise_for_status()
            data = resp.content
        except Exception as e:
            logger.info(f"    [DOC] download failed for {bid_number}: {e}")
            return None
    if not data:
        return None
    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        text = ""
        for page in reader.pages:
            text += (page.extract_text() or "") + "\n"
        return text.strip()[:max_chars] or None
    except Exception as e:
        logger.info(f"    [DOC] PDF text extraction failed for {bid_number}: {e}")
        return None


def mark_not_relevant(conn, bid_number):
    cur = conn.cursor()
    cur.execute(
        "UPDATE gem_tenders SET marked_not_relevant = 1 WHERE bid_number = %s",
        (bid_number,),
    )
    conn.commit()
    cur.close()


# ---------------------------
# LLM RELEVANCY CHECK
# ---------------------------
def ask_llm(bid_number, items, quantity, department, extra_context=None, retries=3):
    lines = [
        f"Bid No     : {bid_number}",
        f"Item       : {items}",
        f"Quantity   : {quantity}",
        f"Department : {department}",
    ]
    if extra_context:
        lines += ["", "Bid document text (extracted from the PDF):", extra_context]
    lines += ["", "Return ONLY the JSON decision object as specified in the system prompt."]
    messages = [
        {"role": "system", "content": FILTER_SYSTEM_PROMPT},
        {"role": "user", "content": "\n".join(lines)},
    ]
    for attempt in range(1, retries + 1):
        try:
            raw = osc._ollama_call(messages)
            if not raw:
                logger.info(f"    [LLM] Empty response (attempt {attempt}) — waiting...")
                time.sleep(10 * attempt)
                continue
            result = osc._parse_json(raw)
            if result and isinstance(result, dict) and "decision" in result:
                return result
            logger.info(f"    [LLM] Bad JSON (attempt {attempt}): {raw[:150]}")
            time.sleep(3)
        except Exception as e:
            logger.warning(f"    [LLM] attempt {attempt}/{retries} failed for {bid_number}: {e}")
            time.sleep(5)
    return {"decision": "Doubt", "reason": "LLM unavailable — kept for safety."}


# ---------------------------
# MAIN
# ---------------------------
def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--yes", action="store_true",
        help="Actually mark. Without this flag, only reports what would be marked not-relevant.",
    )
    args = parser.parse_args()

    conn = db_connect()
    tenders = fetch_active_endo_tenders(conn)
    logger.info(f"Found {len(tenders)} active, not-yet-marked Endo tender(s) to review.")
    if not args.yes:
        logger.info("DRY RUN — pass --yes to actually mark. Nothing will change this run.")

    kept, skipped_protected, marked = 0, 0, 0
    for i, t in enumerate(tenders, 1):
        bid_number = t["bid_number"]
        logger.info(f"[{i}/{len(tenders)}] {bid_number}")

        if t.get("is_interested"):
            logger.info("    -> SKIP (marked interested)")
            skipped_protected += 1
            continue
        if has_protected_reference(conn, bid_number):
            logger.info("    -> SKIP (has a workspace / tracked bid)")
            skipped_protected += 1
            continue

        extra_context = None
        if _is_code_like(t["items"]):
            logger.info("    [DOC] no usable title — pulling bid document for context...")
            extra_context = fetch_bid_doc_text(bid_number, t["detail_url"], t["pdf_path"])

        result = ask_llm(bid_number, t["items"], t["quantity"], t["department"], extra_context)
        decision = result.get("decision", "Doubt")
        reason = result.get("reason", "")

        if decision == "No":
            logger.info(f"    -> MARK NOT RELEVANT — {reason}")
            if args.yes:
                mark_not_relevant(conn, bid_number)
            marked += 1
        else:
            logger.info(f"    -> KEEP ({decision}) — {reason}")
            kept += 1

    conn.close()
    mode = "marked not-relevant" if args.yes else "would mark not-relevant (dry run — pass --yes to apply)"
    logger.info(
        f"=== Done. Kept: {kept} | Protected/skipped: {skipped_protected} | {marked} tender(s) {mode} ==="
    )


if __name__ == "__main__":
    main()

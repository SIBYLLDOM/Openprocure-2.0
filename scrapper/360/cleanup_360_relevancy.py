#!/usr/bin/env python3
"""
cleanup_360_relevancy.py — one-time cleanup for existing dept='360' rows in
gem_tenders that were inserted before run360_endo_perfect_category.py had an
Ollama relevancy filter. GeM's free-text keyword search (input#searchBid on
/all-bids) sometimes silently failed to filter, letting totally unrelated
bids (Toner Cartridges, Atta/Rice/Bread/Cornflakes/Milk, etc.) through
tagged dept='360'.

Re-runs every un-reviewed dept='360' row through the same batch relevancy
prompt run360_endo_perfect_category.py now applies going forward, and
soft-deletes (marked_not_relevant = 1) anything judged irrelevant — the same
mechanism the UI's "Mark as Not Relevant" button already uses, so it's
reversible/auditable and is already excluded by getTenders()'s WHERE clause.

Only ever touches rows where dept = '360'. Does not read or write dept='Endo'
or dept='Diagno' rows.

Usage:
  python cleanup_360_relevancy.py --dry-run --limit 50   # preview, no writes
  python cleanup_360_relevancy.py                        # full run
"""

import os
import sys
import time
import argparse
import logging
import threading
import mysql.connector
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run360_endo_perfect_category as filt  # reuses PRE_FILTER_SYSTEM_PROMPT / DB_CONFIG
import openscraper as osc                    # reuses _ollama_call / _parse_json

DB_CONFIG   = filt.DB_CONFIG
BATCH_SIZE  = 25
WORKERS     = 4  # matches the max_workers=4 convention already used elsewhere in this project
_db_lock    = threading.Lock()  # mysql.connector connections aren't thread-safe

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("cleanup-360")


def fetch_unreviewed_360_rows(conn):
    cur = conn.cursor(dictionary=True)
    cur.execute(
        """
        SELECT bid_number, items, quantity, department, keyword
        FROM gem_tenders
        WHERE dept = '360'
          AND (marked_not_relevant IS NULL OR marked_not_relevant = 0)
        """
    )
    rows = cur.fetchall()
    cur.close()
    return rows


def build_message(batch):
    lines = ["Bids to screen:\n"]
    for r in batch:
        lines.append(
            f'- bid_no: "{r["bid_number"]}" | searched_keyword: "{r["keyword"]}" | '
            f'items: "{r["items"]}" | quantity: "{r["quantity"]}" | department: "{r["department"]}"'
        )
    lines.append("\nReturn ONLY the JSON object as specified in the system prompt.")
    return "\n".join(lines)


def classify_batch(batch):
    """Returns the set of bid_number values judged relevant. Falls back to
    keeping everything if Ollama is unreachable — never soft-delete a row we
    couldn't actually verify."""
    messages = [
        {"role": "system", "content": filt.PRE_FILTER_SYSTEM_PROMPT},
        {"role": "user", "content": build_message(batch)},
    ]
    for attempt in range(1, 4):
        try:
            raw = osc._ollama_call(messages)
            if not raw:
                logger.warning(f"  Empty Ollama response (attempt {attempt}) — retrying...")
                time.sleep(10 * attempt)
                continue
            result = osc._parse_json(raw)
            if result and isinstance(result, dict) and isinstance(result.get("results"), list):
                keep = set()
                for entry in result["results"]:
                    bid_no = str(entry.get("bid_no", "")).strip()
                    if bid_no and entry.get("verdict") != "skip":
                        keep.add(bid_no)
                return keep
            logger.warning(f"  Bad JSON from Ollama (attempt {attempt}): {raw[:150]}")
            time.sleep(3)
        except Exception as e:
            logger.warning(f"  Ollama call failed (attempt {attempt}/3): {e}")
            time.sleep(5)
    logger.warning("  All Ollama attempts failed for this batch — keeping all rows (safe default)")
    return {r["bid_number"] for r in batch}


def mark_not_relevant(conn, bid_numbers):
    if not bid_numbers:
        return
    with _db_lock:
        cur = conn.cursor()
        sql = """
            UPDATE gem_tenders
            SET marked_not_relevant = 1,
                not_relevant_by = 'system-360-cleanup',
                not_relevant_at = NOW(),
                not_relevant_reason = 'Ollama relevancy cleanup: item does not match Meril 360 Division product keywords'
            WHERE bid_number = %s AND dept = '360'
        """
        cur.executemany(sql, [(b,) for b in bid_numbers])
        conn.commit()
        cur.close()


def chunked(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Classify only, do not write to the DB")
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N rows (for testing)")
    args = parser.parse_args()

    conn = mysql.connector.connect(**DB_CONFIG)
    rows = fetch_unreviewed_360_rows(conn)
    if args.limit:
        rows = rows[:args.limit]
    total_batches = (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE
    logger.info(f"Fetched {len(rows)} unreviewed dept='360' row(s) — {total_batches} batch(es) of {BATCH_SIZE}")
    if args.dry_run:
        logger.info("[DRY RUN] No database writes will be made.")

    total_kept, total_marked, done_batches = 0, 0, 0
    started = time.time()
    batches = list(chunked(rows, BATCH_SIZE))

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        future_to_batch = {pool.submit(classify_batch, b): b for b in batches}
        for future in as_completed(future_to_batch):
            batch = future_to_batch[future]
            done_batches += 1
            try:
                keep_ids = future.result()
            except Exception as e:
                logger.error(f"Batch failed unexpectedly, keeping all rows in it: {e}")
                keep_ids = {r["bid_number"] for r in batch}

            all_ids  = {r["bid_number"] for r in batch}
            drop_ids = all_ids - keep_ids
            total_kept   += len(keep_ids)
            total_marked += len(drop_ids)

            logger.info(
                f"Batch {done_batches}/{total_batches}: {len(batch)} rows -> "
                f"{len(keep_ids)} relevant, {len(drop_ids)} irrelevant"
                + (f"  DROPPED: {sorted(drop_ids)}" if drop_ids else "")
            )

            if drop_ids and not args.dry_run:
                mark_not_relevant(conn, drop_ids)

    elapsed = time.time() - started
    logger.info(
        f"DONE in {elapsed/60:.1f}m. Relevant kept: {total_kept}  "
        f"Marked not-relevant: {total_marked}"
        + ("  [DRY RUN — no DB writes]" if args.dry_run else "")
    )
    conn.close()


if __name__ == "__main__":
    main()

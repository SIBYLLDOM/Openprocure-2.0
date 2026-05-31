# pipline.py
import importlib.util
import sys
import os
import json
import mysql.connector

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}


# ── Schema Bootstrap ──────────────────────────────────────────────────────────


def ensure_schema():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        columns_to_add = [
            ("dept", "VARCHAR(50)  DEFAULT NULL"),
            ("item_category", "VARCHAR(100) DEFAULT NULL"),
            (
                "deviation_tables",
                "JSON         DEFAULT NULL",
            ),
        ]
        for col_name, col_def in columns_to_add:
            cursor.execute(
                """
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s
                  AND TABLE_NAME   = 'tender_processing_results'
                  AND COLUMN_NAME  = %s
            """,
                (DB_CONFIG["database"], col_name),
            )
            (count,) = cursor.fetchone()
            if count == 0:
                cursor.execute(
                    f"ALTER TABLE tender_processing_results "
                    f"ADD COLUMN {col_name} {col_def}"
                )
                conn.commit()
                print(f"✅ Schema updated: '{col_name}' column added.")
            else:
                print(f"✅ Schema OK: '{col_name}' column already exists.")
        cursor.close()
        conn.close()
    except mysql.connector.Error as err:
        print(f"⚠️  Schema check failed: {err}")


ensure_schema()


# ── DB Save ───────────────────────────────────────────────────────────────────


def save_to_db(
    bid_no,
    result,
    dept=None,
    item_category=None,
    relevancy_check=None,
    suggested_products=None,
    deviation_tables=None,
):
    """
    Upsert a row into tender_processing_results.
    """
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()

        sql = """
            INSERT INTO tender_processing_results
                (bid_no, result, dept, item_category, relevancy_check, suggested_products, deviation_tables)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                result             = VALUES(result),
                dept               = VALUES(dept),
                item_category      = VALUES(item_category),
                relevancy_check    = VALUES(relevancy_check),
                suggested_products = VALUES(suggested_products),
                deviation_tables   = VALUES(deviation_tables),
                updated_at         = CURRENT_TIMESTAMP
        """

        cursor.execute(
            sql,
            (
                bid_no,
                result,
                dept,
                item_category,
                (
                    json.dumps(relevancy_check, ensure_ascii=False)
                    if relevancy_check
                    else None
                ),
                (
                    json.dumps(suggested_products, ensure_ascii=False)
                    if suggested_products
                    else None
                ),
                (
                    json.dumps(deviation_tables, ensure_ascii=False)
                    if deviation_tables
                    else None
                ),
            ),
        )

        conn.commit()
        cursor.close()
        conn.close()
        print(
            f"✅ DB saved — bid: {bid_no} | result: {result} | dept: {dept} | category: {item_category}"
        )

    except mysql.connector.Error as err:
        print(f"❌ DB Error: {err}")
        raise


def cleanup_files():
    """Delete all files in PDF/ and DOWNLOADS/ to prepare for the next tender."""
    print("\n🧹 Cleaning up files for next tender...")
    deleted = 0
    for folder in ["PDF", "DOWNLOADS"]:
        folder_path = os.path.join(BASE_DIR, folder)
        if not os.path.exists(folder_path):
            continue
        for filename in os.listdir(folder_path):
            filepath = os.path.join(folder_path, filename)
            try:
                if os.path.isfile(filepath):
                    os.remove(filepath)
                    deleted += 1
                    print(f"   🗑️  Deleted: {folder}/{filename}")
            except Exception as e:
                print(f"   ⚠️  Could not delete {filename}: {e}")
    print(f"✅ Cleanup done — {deleted} file(s) removed.")


# ── Module Loader (handles filenames with hyphens) ────────────────────────────


def load_module(name, filename):
    path = os.path.join(BASE_DIR, filename)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# ── Pipeline ──────────────────────────────────────────────────────────────────


def run_pipeline(target_bid=None):
    """
    Process ONE tender.

    target_bid : if provided (e.g. "GEM/2026/B/7132959"), run only that specific bid.
                 If None, picks the next unprocessed tender from DB automatically.

    Returns: True  = processed successfully
             False = processed but failed/not-relevant (still recorded in DB)
             None  = no unprocessed tenders left
    """
    print("\n" + "=" * 60)
    print("🚀  TENDER PIPELINE — Starting (Optimised Batched Processing)")
    print("=" * 60)

    step2 = load_module("step2_pdf_download", "step2-pdf_download.py")

    if target_bid:
        # ── TARGETED MODE: fetch this specific bid from DB ────────────────────
        print(f"\n📌 TARGETED MODE — Processing bid: {target_bid}")
        print("-" * 60)

        tender = step2.fetch_tender_by_bid(target_bid)
        if not tender:
            print(f"❌ Bid '{target_bid}' not found in DB. Pipeline stopping.")
            return None

        bid = tender["bid_number"]
        detail_url = tender["detail_url"]

    else:
        # ── AUTO MODE: check for next unprocessed tender ──────────────────────
        print("\n📌 STEP 1 — Checking for unprocessed tenders...")
        print("-" * 60)

        step1 = load_module("relevency_processor", "relevency_processor.py")
        tenders = step1.fetch_unprocessed_tenders()

        if not tenders:
            print("❌ No unprocessed tenders found. Pipeline stopping.")
            return None

        print(f"✅ {len(tenders)} unprocessed tender(s) found:")
        for t in tenders:
            print(f"   Bid: {t['bid_number']}  |  URL: {t['detail_url']}")

        tender = step2.fetch_one_tender()
        if not tender:
            print("❌ Could not fetch a tender from DB. Pipeline stopping.")
            return None

        bid = tender["bid_number"]
        detail_url = tender["detail_url"]

    print(f"\n📌 STEP 2 — Downloading PDF...")
    print("-" * 60)
    print(f"   Bid: {bid}")
    print(f"   URL: {detail_url}")

    pdf_path = step2.download_pdf_via_browser(detail_url, bid)

    if not pdf_path:
        print("❌ PDF download failed. Pipeline stopping.")
        save_to_db(bid, result="no")
        cleanup_files()
        return False

    print(f"✅ PDF ready: {pdf_path}")

    # ── STEP 3: Extract links from PDF & download ATC files ───────────────────
    print("\n📌 STEP 3 — Extracting links & downloading ATC files...")
    print("-" * 60)

    step3 = load_module("step3_links", "step3-links.py")
    step3.main()

    print("✅ Step 3 complete.")

    # ── STEP 4: GPT Evaluation ────────────────────────────────────────────────
    print("\n📌 STEP 4 — GPT Tender Evaluation...")
    print("-" * 60)

    step4 = load_module("step4_gpt", "step4-gpt.py")

    bid_doc_path = step4.find_bid_document()
    atc_paths = step4.find_atc_files()

    # GPT Call 1: Evaluate (with ATC spec extraction)
    raw_evaluation = step4.evaluate_tender(bid_doc_path, atc_paths)
    evaluation = step4.parse_json_response(raw_evaluation)

    print("\n" + "=" * 60)
    print("📊 Evaluation Result:")
    print(json.dumps(evaluation, indent=2))
    print("=" * 60)

    # Not relevant → record in DB and stop
    if not isinstance(evaluation, list) or not evaluation:
        print("❌ Could not parse evaluation. Saving 'no' to DB.")
        save_to_db(bid, result="no", dept=None, relevancy_check=evaluation)
        cleanup_files()
        return False

    if evaluation[0].get("relevant") != "Yes":
        reason = evaluation[0].get("reason", "No reason provided.")
        print(f"❌ NOT RELEVANT — {reason}")
        save_to_db(bid, result="no", dept=None, relevancy_check=evaluation)
        cleanup_files()
        return False

    no_items = evaluation[1].get("no_of_items", 0) if len(evaluation) > 1 else 0
    print(f"✅ RELEVANT — {no_items} matching item(s) found")

    # Extract dept and item_category from all matched items
    item_entries = evaluation[2:]
    raw_depts = []
    raw_categories = []

    for item in item_entries:
        if any(k.startswith("item_") for k in item):
            raw_depts.append(item.get("dept", ""))
            raw_categories.append(
                item.get("item_main_category", "") or item.get("item_category", "")
            )

    # Clean dept values
    cleaned_depts = []
    for d in raw_depts:
        d = d.strip()
        if d.lower() in ("endo", "endo.json"):
            cleaned_depts.append("Endo")
        elif d.lower() in ("diagno", "diagno.json"):
            cleaned_depts.append("Diagno")
        else:
            cleaned_depts.append(d)

    dept_value = "/".join(dict.fromkeys(cleaned_depts)) or None
    category_value = (
        "/".join(dict.fromkeys([c.strip() for c in raw_categories if c.strip()]))
        or None
    )

    print(f"   Dept(s): {dept_value}")
    print(f"   Category: {category_value}")

    # ── STEP 4b: Batched Product Match + Deviation (OPT 1 + OPT 2) ───────────
    print("\n" + "=" * 60)
    print("🛒 STEP 4b — Batched Product Matching & Deviation Analysis")
    print(f"   {len(item_entries)} item(s) → batches of {step4.BATCH_SIZE}")
    print("=" * 60)

    # ── KEY CHANGE: replaces old per-item for-loop with one batched call ──────
    all_suggestions, all_deviations = step4.process_all_items(item_entries)

    if all_suggestions:
        print("\n" + "=" * 60)
        print(f"🎯 Product Suggestions ({len(all_suggestions)} total):")
        print(json.dumps(all_suggestions, indent=2))
        print("=" * 60)
    else:
        print("\n⚠️  No product suggestions generated.")

    if all_deviations:
        print("\n" + "=" * 60)
        total_specs = sum(len(v) for v in all_deviations.values())
        print(f"📊 Deviation Analysis ({total_specs} total specifications):")
        print(json.dumps(all_deviations, indent=2))
        print("=" * 60)
    else:
        print("\n⚠️  No deviation analysis generated.")

    print("\n📌 STEP 5 — Saving results to database...")
    print("-" * 60)

    save_to_db(
        bid_no=bid,
        result="yes",
        dept=dept_value,
        item_category=category_value,
        relevancy_check=evaluation,
        suggested_products=all_suggestions if all_suggestions else None,
        deviation_tables=all_deviations if all_deviations else None,
    )

    # ── STEP 6: Cleanup files ─────────────────────────────────────────────────
    cleanup_files()

    print("\n" + "=" * 60)
    print("🏁  TENDER DONE")
    print("=" * 60)
    return True


# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Parse optional --bid:GEM/2026/B/XXXXXXX argument
    target_bid = None
    for arg in sys.argv[1:]:
        if arg.startswith("--bid:"):
            target_bid = arg[len("--bid:"):].strip()
            break

    if target_bid:
        # ── SINGLE BID MODE ───────────────────────────────────────────────────
        print("\n" + "=" * 60)
        print(f"🎯  TENDER PIPELINE — Single Bid Mode: {target_bid}")
        print("=" * 60)
        run_pipeline(target_bid=target_bid)

    else:
        # ── AUTO LOOP MODE ────────────────────────────────────────────────────
        print("\n" + "=" * 60)
        print("🚀  TENDER PIPELINE — Auto Loop Starting")
        print("=" * 60)

        tender_count = 0
        while True:
            result = run_pipeline()
            if result is False:
                tender_count += 1
                print(f"\n🔁 Processed {tender_count} tender(s). Checking for more...")
                continue
            elif result is True:
                tender_count += 1
                print(f"\n🔁 Processed {tender_count} tender(s). Checking for more...")
                continue
            else:
                print(
                    f"\n✅ All done! Total tenders processed this run: {tender_count}"
                )
                break
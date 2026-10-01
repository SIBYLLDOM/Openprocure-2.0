"""
relevency_processor.py — 360 Division variant.

Same idea as TenderSystem/NewSystem/relevency_processor.py, but scoped to
dept = '360' only. The original query has no dept filter at all, so pointing
single_pipeline.py at it directly would pull ANY unprocessed gem_tenders row
(Endo/Diagno included) into this folder's 360-only step4-gpt.py classifier,
where they'd wrongly come back "Not Relevant". Filtering here keeps this
pipeline scoped to what the 360 scrapers (run360_gem_open_category.py /
run360_endo_perfect_category.py) actually tagged dept='360'.
"""
import mysql.connector


DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}


def fetch_unprocessed_tenders():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)

        # relevancy_check IS NULL (not just t.bid_no IS NULL) — the scrapers
        # themselves stub-insert (bid_no, tender_title, result='yes') into
        # tender_processing_results the moment their own relevancy filter
        # says "relevant", well before this pipeline's Step 4-6 GPT
        # evaluation ever runs. relevancy_check is only ever set by THIS
        # pipeline's save_to_db(), so it's the correct "actually processed"
        # signal — t.bid_no IS NULL alone made every scraped bid look done
        # on arrival and silently starved this queue.
        query = """
        SELECT g.bid_number, g.detail_url
        FROM gem_tenders g
        LEFT JOIN tender_processing_results t
            ON g.bid_number = t.bid_no
        WHERE (t.bid_no IS NULL OR t.relevancy_check IS NULL)
          AND g.dept = '360'
        LIMIT 1;
        """

        cursor.execute(query)
        results = cursor.fetchall()

        cursor.close()
        conn.close()

        return results

    except mysql.connector.Error as err:
        print("Database Error:", err)
        return []


if __name__ == "__main__":
    tenders = fetch_unprocessed_tenders()

    print(f"Total Unprocessed 360 Tenders: {len(tenders)}\n")

    for tender in tenders:
        print(f"Bid: {tender['bid_number']}")
        print(f"URL: {tender['detail_url']}")
        print("-" * 40)

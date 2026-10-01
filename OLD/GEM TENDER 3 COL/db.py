import pymysql
import pymysql.cursors

def get_db_conn():
    """Return a pymysql connection to tender_automation_with_ai."""
    conn = pymysql.connect(
        host="127.0.0.1",
        port=3306,
        user="root",
        password="meril",
        db="tender_automation_with_ai",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )
    return conn

def fetch_tenders_to_download():
    """Fetch tenders that need PDF download.

    Priority order:
      1. Perfect category (perfect_cat = 1) before non-perfect (perfect_cat = 0)
      2. Within each category, tenders whose start_date falls on today come first
      3. Then sorted by end_date ascending (most urgent deadline first)
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            sql = """
                SELECT bid_number, detail_url, perfect_cat
                FROM gem_tenders
                WHERE detail_url IS NOT NULL
                  AND detail_url != ''
                  AND (items IS NULL OR items = '')
                ORDER BY
                    perfect_cat DESC,
                    CASE
                        WHEN DATE(STR_TO_DATE(REPLACE(start_date, '/', '-'), '%d-%m-%Y %h:%i %p')) = CURDATE()
                        THEN 0 ELSE 1
                    END ASC,
                    STR_TO_DATE(REPLACE(end_date, '/', '-'), '%d-%m-%Y %h:%i %p') ASC
            """
            cur.execute(sql)
            return cur.fetchall()
    finally:
        conn.close()

def update_tender_items(bid_number, items_text):
    """Update the items column for a given bid number."""
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            sql = "UPDATE gem_tenders SET items = %s WHERE bid_number = %s"
            cur.execute(sql, (items_text, bid_number))
            return cur.rowcount
    finally:
        conn.close()

def update_bid_value(bid_number, value):
    """Update the bid_value column for a given bid number."""
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            sql = "UPDATE gem_tenders SET bid_value = %s WHERE bid_number = %s"
            cur.execute(sql, (value, bid_number))
            return cur.rowcount
    finally:
        conn.close()

def update_emd_amount(bid_number, value):
    """Update the emd_amount column for a given bid number."""
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            sql = "UPDATE gem_tenders SET emd_amount = %s WHERE bid_number = %s"
            cur.execute(sql, (value, bid_number))
            return cur.rowcount
    finally:
        conn.close()

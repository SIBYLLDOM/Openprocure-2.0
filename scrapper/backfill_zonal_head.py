#!/usr/bin/env python3
"""One-off backfill: recompute zonal_head for carting_details rows where it's NULL/empty,
using the same resolve_zonal_head() logic (which now checks buyer AND seller state fields)."""

from carting_details_scrapper import get_db_connection, resolve_zonal_head

FIELDS = [
    "id", "state", "hospital_state", "buyer_department", "office_zone",
    "hospital_location", "buyer_dept_org", "organization_name",
    "seller_state", "seller_location", "seller_details",
]


def main():
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute(f"""
        SELECT {", ".join(FIELDS)} FROM carting_details
        WHERE zonal_head IS NULL OR zonal_head = ''
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} rows with missing zonal_head.")

    update_cur = conn.cursor()
    fixed = 0
    for row in rows:
        head = resolve_zonal_head(row)
        if head:
            update_cur.execute(
                "UPDATE carting_details SET zonal_head=%s WHERE id=%s", (head, row["id"])
            )
            fixed += 1
    conn.commit()
    update_cur.close()
    cur.close()
    conn.close()
    print(f"Backfilled zonal_head for {fixed}/{len(rows)} rows (rest had no resolvable state).")


if __name__ == "__main__":
    main()

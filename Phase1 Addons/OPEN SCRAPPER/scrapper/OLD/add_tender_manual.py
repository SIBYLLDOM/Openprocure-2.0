#!/usr/bin/env python3
"""
add_tender_manual.py
────────────────────
Manually insert a single tender into open_tender_details.
Run once, then delete or keep for the next manual entry.
"""

import json
import mysql.connector

DB_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

# ── Tender data ────────────────────────────────────────────────────────────────
TENDER = {
    "state":              "Rajasthan",
    "organisation_name":  "Director (F.W.) Medical Health and Family Welfare Services",
    "e_published_date":   "05-Jun-2026 09:30 AM",
    "closing_date":       "28-Jun-2026 06:00 PM",
    "opening_date":       "29-Jun-2026 02:00 PM",
    "tender_title":       "Drug and Medicines",
    "tender_refno":       "66",
    "tender_id":          "2026_MEDIC_564910_1",
    "organisation_chain": "Medical and Health||Director (F.W.) Medical Health and Family Welfare Services",
    "file_link":          None,
    "relevency_checker":  "proceed_futher",
    "relevancy_reason":   "Manually added — Family Welfare dept tender; potential IUD/IUCD relevance (Endo).",
    "suggested_product":  None,
    "dept":               "endo",
    "tender_details": json.dumps({
        "Organisation Chain":                    "Medical and Health||Director (F.W.) Medical Health and Family Welfare Services",
        "Tender Reference Number":               "66",
        "Tender ID":                             "2026_MEDIC_564910_1",
        "Withdrawal Allowed":                    "Yes",
        "Tender Type":                           "Open Tender",
        "Form Of Contract":                      "Item Wise",
        "Tender Category":                       "Goods",
        "No. of Covers":                         "2",
        "General Technical Evaluation Allowed":  "No",
        "ItemWise Technical Evaluation Allowed": "No",
        "Payment Mode":                          "Offline",
        "Is Multi Currency Allowed For BOQ":     "No",
        "Is Multi Currency Allowed For Fee":     "No",
        "Allow Two Stage Bidding":               "No",
        "Tender Fee in Rs":                      "1,000",
        "Processing Fee in Rs":                  "2,000",
        "Fee Payable To":                        "CMHO",
        "Fee Payable At":                        "JHUNJHUNU",
        "Tender Fee Exemption Allowed":          "Yes",
        "EMD Amount in Rs":                      "6,00,000",
        "EMD Exemption Allowed":                 "Yes",
        "EMD Fee Type":                          "percentage",
        "EMD Percentage":                        "2.0%",
        "EMD Payable To":                        "CMHO",
        "EMD Payable At":                        "JHUNJHUNU",
        "Title":                                 "Drug and Medicines",
        "Work Description":                      "Generic Medicine",
        "NDA/Pre Qualification":                 "refer tender documents",
        "Tender Value in Rs":                    "3,00,00,000",
        "Product Category":                      "Miscellaneous Goods",
        "Sub category":                          "Drug and Medicines",
        "Contract Type":                         "Rate Contract",
        "Bid Validity(Days)":                    "90",
        "Period Of Work(Days)":                  "30",
        "Location":                              "Jhunjhunu",
        "Pincode":                               "333001",
        "Bid Opening Place":                     "CMHO JHUNJHUNU",
        "Published Date":                        "05-Jun-2026 09:30 AM",
        "Bid Opening Date":                      "29-Jun-2026 02:00 PM",
        "Document Download Start Date":          "05-Jun-2026 09:30 AM",
        "Document Download End Date":            "28-Jun-2026 06:00 PM",
        "Bid Submission Start Date":             "05-Jun-2026 10:00 AM",
        "Bid Submission End Date":               "28-Jun-2026 06:00 PM",
        "Tender Inviting Authority Name":        "CMHO JHUNJHUNU",
        "Tender Inviting Authority Address":     "CMHO OFFICE JHUNJHUNU",
    }, ensure_ascii=False),
}

SQL = """
    INSERT INTO open_tender_details
        (state, organisation_name, e_published_date, closing_date,
         opening_date, tender_title, tender_refno, tender_id,
         organisation_chain, tender_details, file_link,
         relevency_checker, relevancy_reason, suggested_product, dept)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON DUPLICATE KEY UPDATE
        state              = VALUES(state),
        organisation_name  = VALUES(organisation_name),
        e_published_date   = VALUES(e_published_date),
        closing_date       = VALUES(closing_date),
        opening_date       = VALUES(opening_date),
        tender_title       = VALUES(tender_title),
        tender_refno       = VALUES(tender_refno),
        organisation_chain = VALUES(organisation_chain),
        tender_details     = VALUES(tender_details),
        relevency_checker  = VALUES(relevency_checker),
        relevancy_reason   = VALUES(relevancy_reason),
        dept               = VALUES(dept),
        updated_at         = CURRENT_TIMESTAMP
"""

def main():
    conn = mysql.connector.connect(**DB_CONFIG)
    cur  = conn.cursor()
    try:
        cur.execute(SQL, (
            TENDER["state"],
            TENDER["organisation_name"],
            TENDER["e_published_date"],
            TENDER["closing_date"],
            TENDER["opening_date"],
            TENDER["tender_title"],
            TENDER["tender_refno"],
            TENDER["tender_id"],
            TENDER["organisation_chain"],
            TENDER["tender_details"],
            TENDER["file_link"],
            TENDER["relevency_checker"],
            TENDER["relevancy_reason"],
            TENDER["suggested_product"],
            TENDER["dept"],
        ))
        conn.commit()
        rows_affected = cur.rowcount
        if rows_affected == 1:
            print(f"[OK] Tender inserted  ->  {TENDER['tender_id']}")
        else:
            print(f"[OK] Tender already existed, updated  ->  {TENDER['tender_id']}")
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()

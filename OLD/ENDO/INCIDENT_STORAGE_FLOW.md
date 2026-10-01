"""
INCIDENT DATA STORAGE - COMPLETE FLOW DOCUMENTATION
====================================================

This document explains how incident data is stored both in CSV files and the MySQL database.

## CURRENT IMPLEMENTATION (Already Working Correctly)

### 1. CSV STORAGE (Page-wise + Combined)

For each incident category (e.g., "In-Progress", "Escalated to GeM"), the system creates:

A. **Individual Page CSVs:**
   - `In-Progress_page_1.csv`
   - `In-Progress_page_2.csv`
   - `In-Progress_page_3.csv`
   - ... (one file per page)

B. **Combined CSV:**
   - `In-Progress_ALL_PAGES.csv` (contains ALL incidents from ALL pages)

Location: `logs/incidents_data/`

### 2. DATABASE STORAGE (All Data in incidents Table)

**Table:** `incidents`
**Behavior:** UPSERT (Insert new, Update existing)

#### How It Works:

1. **Page 1 scraped** → Data inserted into `incidents` table
2. **Page 2 scraped** → Data inserted into `incidents` table
3. **Page 3 scraped** → Data inserted into `incidents` table
4. ... continues for all pages

**Result:** ALL incidents from ALL pages are stored in the `incidents` table.

#### Duplicate Handling:

The system uses `incident_id` as a UNIQUE key:
- If an incident already exists → UPDATE it
- If it's new → INSERT it

This prevents duplicates and keeps data fresh.

### 3. CODE FLOW (playwright_controller.py)

```python
# For each category (e.g., "In-Progress"):
for current_page in range(1, total_pages + 1):
    
    # Extract incidents from current page
    incidents = extract_incident_table_data(page, category_name, current_page)
    
    # STEP 1: Save page-wise CSV
    save_incidents_to_csv(incidents, category_name, current_page)
    # Creates: In-Progress_page_1.csv
    
    # STEP 2: Insert into database
    db_service.insert_incidents(incidents, category_name)
    # Inserts into: incidents table
    
    # Move to next page...

# After all pages processed:
# STEP 3: Save combined CSV
save_combined_csv(all_incidents, category_name)
# Creates: In-Progress_ALL_PAGES.csv
```

### 4. DATABASE QUERY (db_service.py)

```sql
INSERT INTO incidents (
    type, incident_id, severity, reason, product_category, status,
    escalated_date, incident_date, raised_against, organisation_name,
    seller_organisation_name, product_id, incident_for, scn_sent_date,
    scn_end_date, last_modified_role, last_modified_date, maker_role
) VALUES (...)
ON DUPLICATE KEY UPDATE
    type = VALUES(type),
    severity = VALUES(severity),
    reason = VALUES(reason),
    ... (all fields updated)
```

**Key Point:** `incident_id` has a UNIQUE constraint, so duplicates are automatically handled.

### 5. VERIFICATION

To verify all data is in the database, run this SQL query:

```sql
-- Count total incidents in database
SELECT COUNT(*) as total_incidents FROM incidents;

-- Count by category
SELECT type, COUNT(*) as count 
FROM incidents 
GROUP BY type 
ORDER BY count DESC;

-- View all incidents for a specific category
SELECT * FROM incidents WHERE type = 'in-progress';
```

### 6. EXAMPLE OUTPUT

When processing "In-Progress" category with 45 incidents across 3 pages:

```
🔍 Processing: In-Progress (Count: 45)
   📄 Extracting page 1/3...
   💾 Saved 20 incidents → In-Progress_page_1.csv
   🗄️  Inserted/Updated 20/20 incidents (In-Progress) into MySQL
   
   📄 Extracting page 2/3...
   💾 Saved 20 incidents → In-Progress_page_2.csv
   🗄️  Inserted/Updated 20/20 incidents (In-Progress) into MySQL
   
   📄 Extracting page 3/3...
   💾 Saved 5 incidents → In-Progress_page_3.csv
   🗄️  Inserted/Updated 5/5 incidents (In-Progress) into MySQL
   
   💾 Saved ALL 45 incidents to: In-Progress_ALL_PAGES.csv
   ✅ Completed extraction for In-Progress
```

**Result:**
- CSV Files: 4 files (3 page-wise + 1 combined)
- Database: 45 records in `incidents` table with `type = 'in-progress'`

## SUMMARY

✅ **Page-wise CSVs:** Created for each page
✅ **Combined CSV:** Created with all pages
✅ **Database Storage:** All incidents stored in `incidents` table
✅ **Duplicate Handling:** Automatic via UPSERT
✅ **Data Integrity:** Maintained across multiple runs

The system is ALREADY working as required!
"""

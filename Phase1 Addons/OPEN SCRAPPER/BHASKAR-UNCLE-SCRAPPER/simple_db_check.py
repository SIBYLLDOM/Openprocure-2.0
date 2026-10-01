#!/usr/bin/env python3
"""
Simple database checker for dept column
"""

import mysql.connector
import json
from datetime import datetime

# Database configuration
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

def check_iocl_dept_data():
    """Check IOCL data and dept values"""
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Get recent IOCL records
        query = """
        SELECT id, organisation_name, tender_title, dept, tender_details, created_at
        FROM psu 
        WHERE organisation_name LIKE '%IOCL%' 
        ORDER BY created_at DESC 
        LIMIT 10
        """
        
        cursor.execute(query)
        records = cursor.fetchall()
        
        print("📊 Recent IOCL Records:")
        print("=" * 60)
        
        dept_counts = {"endo": 0, "diagno": 0, "NULL": 0, "": 0}
        
        for record in records:
            record_id = record[0]
            org = record[1]
            title = record[2][:40] + "..." if len(record[2]) > 40 else record[2]
            dept = record[3]
            details = record[4]
            created = record[5]
            
            print(f"ID: {record_id}")
            print(f"Title: {title}")
            print(f"Dept: '{dept}'")
            print(f"Created: {created}")
            
            # Count dept values
            if dept is None:
                dept_counts["NULL"] += 1
            elif dept == "":
                dept_counts[""] += 1
            elif dept in dept_counts:
                dept_counts[dept] += 1
            else:
                dept_counts[dept] = dept_counts.get(dept, 0) + 1
            
            # Check tender_details JSON for dept
            if details:
                try:
                    details_dict = json.loads(details)
                    dept_in_json = details_dict.get('dept', 'NOT_FOUND')
                    print(f"Dept in JSON: {dept_in_json}")
                except:
                    print("Dept in JSON: JSON_ERROR")
            
            print("-" * 40)
        
        print("\n📈 Dept Distribution:")
        for dept, count in dept_counts.items():
            print(f"  '{dept}': {count}")
        
        # Check total IOCL records
        cursor.execute("SELECT COUNT(*) FROM psu WHERE organisation_name LIKE '%IOCL%'")
        total = cursor.fetchone()[0]
        print(f"\nTotal IOCL records: {total}")
        
        return records
        
    except Exception as e:
        print(f"Error: {e}")
        return []
    finally:
        if conn:
            conn.close()

def check_table_structure():
    """Check if dept column exists"""
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        cursor.execute("SHOW COLUMNS FROM psu LIKE 'dept'")
        result = cursor.fetchone()
        
        if result:
            print("✅ Dept column exists:")
            print(f"   {result}")
            return True
        else:
            print("❌ Dept column not found")
            return False
            
    except Exception as e:
        print(f"Error checking structure: {e}")
        return False
    finally:
        if conn:
            conn.close()

def main():
    print("🔍 IOCL Dept Column Check")
    print("=" * 40)
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Check table structure
    if check_table_structure():
        # Check IOCL data
        check_iocl_dept_data()
    else:
        print("Dept column needs to be added")

if __name__ == "__main__":
    main()

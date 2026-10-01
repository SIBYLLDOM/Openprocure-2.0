#!/usr/bin/env python3
"""
Database checker for dept column issue
"""

import mysql.connector
from datetime import datetime, timedelta

# Database configuration
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

def check_db_structure():
    """Check the psu table structure"""
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Check table structure
        cursor.execute("DESCRIBE psu")
        columns = cursor.fetchall()
        
        print("📋 PSU Table Structure:")
        print("=" * 60)
        for col in columns:
            print(f"  {col[0]:20} {col[1]:20} {col[2]:5} {col[3]:5} {col[4]:10} {col[5]}")
        
        # Check if dept column exists
        dept_exists = any(col[0] == 'dept' for col in columns)
        print(f"\n✅ Dept column exists: {dept_exists}")
        
        return dept_exists
        
    except Exception as e:
        print(f"❌ Error checking structure: {e}")
        return False
    finally:
        if conn:
            conn.close()

def check_recent_iocl_data():
    """Check recent IOCL data and dept values"""
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Get recent IOCL records
        query = """
        SELECT id, organisation_name, tender_title, dept, tender_details, created_at, updated_at
        FROM psu 
        WHERE organisation_name LIKE '%IOCL%' 
        ORDER BY created_at DESC 
        LIMIT 10
        """
        
        cursor.execute(query)
        records = cursor.fetchall()
        
        print(f"\n📊 Recent IOCL Records ({len(records)} found):")
        print("=" * 80)
        
        for record in records:
            print(f"ID: {record[0]}")
            print(f"Org: {record[1]}")
            print(f"Title: {record[2][:50]}...")
            print(f"Dept: '{record[3]}'")
            print(f"Created: {record[5]}")
            print(f"Updated: {record[6]}")
            
            # Check if dept is in tender_details JSON
            if record[4]:
                try:
                    import json
                    details = json.loads(record[4])
                    dept_in_details = details.get('dept', 'NOT FOUND')
                    print(f"Dept in JSON: {dept_in_details}")
                except:
                    print("Dept in JSON: JSON ERROR")
            
            print("-" * 40)
        
        return records
        
    except Exception as e:
        print(f"❌ Error checking IOCL data: {e}")
        return []
    finally:
        if conn:
            conn.close()

def check_dept_distribution():
    """Check distribution of dept values"""
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Count dept values
        cursor.execute("""
        SELECT dept, COUNT(*) as count 
        FROM psu 
        WHERE organisation_name LIKE '%IOCL%' 
        GROUP BY dept
        """)
        
        results = cursor.fetchall()
        
        print(f"\n📈 Dept Distribution for IOCL:")
        print("=" * 40)
        for result in results:
            print(f"Dept: '{result[0]}' -> Count: {result[1]}")
        
        # Check total IOCL records
        cursor.execute("""
        SELECT COUNT(*) 
        FROM psu 
        WHERE organisation_name LIKE '%IOCL%'
        """)
        total = cursor.fetchone()[0]
        print(f"Total IOCL records: {total}")
        
    except Exception as e:
        print(f"❌ Error checking dept distribution: {e}")
    finally:
        if conn:
            conn.close()

def main():
    print("🔍 Database Dept Column Checker")
    print("=" * 50)
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Check structure
    dept_exists = check_db_structure()
    
    if dept_exists:
        # Check recent data
        check_recent_iocl_data()
        
        # Check distribution
        check_dept_distribution()
    else:
        print("\n❌ Dept column doesn't exist in table!")
        print("Need to add dept column to psu table")

if __name__ == "__main__":
    main()

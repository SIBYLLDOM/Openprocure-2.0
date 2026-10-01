#!/usr/bin/env python3
"""
Add dept column to psu table
"""

import mysql.connector

# Database configuration
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "meril",
    "database": "tender_automation_with_ai",
}

def add_dept_column():
    """Add dept column to psu table"""
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        print("🔧 Adding dept column to psu table...")
        
        # Add dept column with ENUM type
        alter_sql = """
        ALTER TABLE psu 
        ADD COLUMN dept ENUM('endo', 'diagno') NULL 
        COMMENT 'Department: endo or diagno based on keyword source'
        """
        
        cursor.execute(alter_sql)
        conn.commit()
        
        print("✅ Dept column added successfully!")
        
        # Verify the column was added
        cursor.execute("DESCRIBE psu")
        columns = cursor.fetchall()
        
        print("\n📋 Updated table structure (dept column):")
        for col in columns:
            if 'dept' in col[0].lower():
                print(f"  {col[0]:20} {col[1]:20} {col[2]:5} {col[3]:5} {col[4]:10} {col[5]}")
        
        return True
        
    except mysql.connector.Error as e:
        if e.errno == 1060:  # Column already exists
            print("⚠️  Dept column already exists")
            return True
        else:
            print(f"❌ Error adding dept column: {e}")
            return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False
    finally:
        if conn:
            conn.close()

def verify_column():
    """Verify the dept column exists and test insertion"""
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        print("\n🧪 Testing dept column insertion...")
        
        # Test insertion with dept
        test_sql = """
        INSERT INTO psu (
            state, organisation_name, tender_title, tender_refno, 
            dept, relevency_checker
        ) VALUES (
            'Test', 'Test Org', 'Test Tender', 'TEST-001',
            'endo', 'not_processed'
        )
        """
        
        cursor.execute(test_sql)
        conn.commit()
        
        # Retrieve the test record
        cursor.execute("""
        SELECT id, dept, tender_title 
        FROM psu 
        WHERE tender_refno = 'TEST-001'
        ORDER BY id DESC 
        LIMIT 1
        """)
        
        result = cursor.fetchone()
        
        if result:
            print(f"✅ Test insertion successful!")
            print(f"   ID: {result[0]}, Dept: '{result[1]}', Title: {result[2]}")
            
            # Clean up test record
            cursor.execute("DELETE FROM psu WHERE tender_refno = 'TEST-001'")
            conn.commit()
            print("🧹 Test record cleaned up")
            
            return True
        else:
            print("❌ Test insertion failed - no record found")
            return False
            
    except Exception as e:
        print(f"❌ Error testing dept column: {e}")
        return False
    finally:
        if conn:
            conn.close()

def main():
    print("🔧 Dept Column Setup")
    print("=" * 40)
    
    # Add the column
    if add_dept_column():
        # Verify it works
        verify_column()
        print("\n🎉 Dept column is ready for use!")
    else:
        print("\n❌ Failed to set up dept column")

if __name__ == "__main__":
    main()

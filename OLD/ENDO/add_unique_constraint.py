import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from service.db_service import DBService

def add_unique_constraint_to_incidents():
    print("🔧 Adding UNIQUE constraint to incident_id column...")
    
    try:
        db = DBService()
        conn = db.get_connection()
        if not conn:
            print("❌ Failed to connect to database.")
            return
        
        cursor = conn.cursor()
        
        # Check if unique constraint already exists
        cursor.execute("""
            SELECT COUNT(*) 
            FROM information_schema.TABLE_CONSTRAINTS 
            WHERE TABLE_SCHEMA = 'tender_automation_with_ai' 
            AND TABLE_NAME = 'incidents' 
            AND CONSTRAINT_TYPE = 'UNIQUE'
            AND CONSTRAINT_NAME LIKE '%incident_id%'
        """)
        
        result = cursor.fetchone()
        
        if result and result[0] > 0:
            print("✅ UNIQUE constraint already exists on incident_id column.")
        else:
            print("⚠️ UNIQUE constraint is missing. Adding it now...")
            
            # First, remove any duplicate incident_ids (keep the latest one)
            print("🧹 Removing duplicate incident_ids (keeping latest)...")
            cursor.execute("""
                DELETE t1 FROM incidents t1
                INNER JOIN incidents t2 
                WHERE t1.id < t2.id 
                AND t1.incident_id = t2.incident_id
            """)
            duplicates_removed = cursor.rowcount
            if duplicates_removed > 0:
                print(f"   Removed {duplicates_removed} duplicate records")
            
            # Add the unique constraint
            cursor.execute("ALTER TABLE incidents ADD UNIQUE KEY unique_incident_id (incident_id)")
            conn.commit()
            print("✅ UNIQUE constraint added successfully!")
        
        cursor.close()
        conn.close()
        print("✅ Incidents table is ready for UPSERT operations!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    add_unique_constraint_to_incidents()

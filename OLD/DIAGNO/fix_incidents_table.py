import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from service.db_service import DBService

def fix_incidents_table():
    print("🔧 Fixing incidents table schema...")
    
    try:
        db = DBService()
        conn = db.get_connection()
        if not conn:
            print("❌ Failed to connect to database.")
            return
        
        cursor = conn.cursor()
        
        # Check if 'type' column exists
        cursor.execute("SHOW COLUMNS FROM incidents LIKE 'type'")
        result = cursor.fetchone()
        
        if result:
            print("✅ Column 'type' already exists in incidents table.")
        else:
            print("⚠️ Column 'type' is missing. Adding it now...")
            # Add the type column after id
            cursor.execute("ALTER TABLE incidents ADD COLUMN type VARCHAR(100) AFTER id")
            conn.commit()
            print("✅ Column 'type' added successfully!")
        
        cursor.close()
        conn.close()
        print("✅ Incidents table is now ready!")
        
    except Exception as e:
        print(f"❌ Error fixing table: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    fix_incidents_table()

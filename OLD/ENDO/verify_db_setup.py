
import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from service.db_service import DBService

def verify_tables():
    print("🔍 Verifying Database Setup...")
    
    try:
        db = DBService()
        db.create_all_tables()  # Create tables first
        
        # 1. Connect and verify DB exists
        conn = db.get_connection()
        if not conn:
            print("❌ Failed to connect to database.")
            return
        
        cursor = conn.cursor()
        
        # 2. Check Tables
        tables_to_check = [
            'summary_images', 
            'orders_charts', 
            'order_value_volume', 
            'order_statistics', 
            'payment_statistics',
            'incidents'
        ]
        
        print(f"📋 Checking for {len(tables_to_check)} tables...")
        
        cursor.execute("SHOW TABLES")
        existing_tables = [table[0] for table in cursor.fetchall()]
        
        all_exist = True
        for table in tables_to_check:
            if table in existing_tables:
                print(f"   ✅ Table '{table}' exists")
            else:
                print(f"   ❌ Table '{table}' MISSING")
                all_exist = False
        
        if all_exist:
            print("\n✅ All tables verified successfully!")
        else:
            print("\n⚠️ Some tables are missing. Try running db.create_all_tables()")
            
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error during verification: {e}")

if __name__ == "__main__":
    verify_tables()

import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from service.db_service import DBService

def migrate_order_statistics():
    print("🔄 Migrating order statistics schema...")
    
    try:
        db = DBService()
        conn = db.get_connection()
        if not conn:
            print("❌ Failed to connect to database.")
            return
        
        cursor = conn.cursor()
        
        # Drop old tables if they exist
        print("🗑️  Dropping old tables...")
        cursor.execute("DROP TABLE IF EXISTS order_value_volume")
        cursor.execute("DROP TABLE IF EXISTS payment_statistics")
        
        # Check if order_statistics has old schema
        cursor.execute("SHOW COLUMNS FROM order_statistics")
        columns = [col[0] for col in cursor.fetchall()]
        
        if 'category' not in columns:
            print("🗑️  Dropping old order_statistics table...")
            cursor.execute("DROP TABLE IF EXISTS order_statistics")
            
            # Create new order_statistics table
            print("✨ Creating new order_statistics table...")
            create_query = """
            CREATE TABLE order_statistics (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category VARCHAR(100),
                status VARCHAR(100),
                value VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_query)
            print("✅ New order_statistics table created!")
        else:
            print("✅ order_statistics table already has correct schema!")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print("✅ Migration complete!")
        
    except Exception as e:
        print(f"❌ Error during migration: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    migrate_order_statistics()

"""
Database Migration Script
Adds unique constraints and updated_at columns to existing tables
Run this ONCE to update your existing database schema
"""

import mysql.connector
from mysql.connector import Error

def migrate_database():
    """Adds unique constraints and updated_at fields to existing tables."""
    
    try:
        # Connect to database
        connection = mysql.connector.connect(
            host="localhost",
            user="root",
            password="",
            database="tender_automation_with_ai"
        )
        
        if not connection.is_connected():
            print("❌ Failed to connect to database")
            return
        
        cursor = connection.cursor()
        print("✅ Connected to database")
        
        # Migration queries
        migrations = [
            # 1. Add unique constraint to summary_images.image_name
            {
                "name": "summary_images - unique image_name",
                "check": "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='tender_automation_with_ai' AND table_name='summary_images' AND index_name='image_name'",
                "query": "ALTER TABLE summary_images ADD UNIQUE KEY (image_name)"
            },
            # 2. Add updated_at to summary_images
            {
                "name": "summary_images - updated_at column",
                "check": "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='tender_automation_with_ai' AND table_name='summary_images' AND column_name='updated_at'",
                "query": "ALTER TABLE summary_images ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
            },
            # 3. Add unique constraint to orders_charts.chart_name
            {
                "name": "orders_charts - unique chart_name",
                "check": "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='tender_automation_with_ai' AND table_name='orders_charts' AND index_name='chart_name'",
                "query": "ALTER TABLE orders_charts ADD UNIQUE KEY (chart_name)"
            },
            # 4. Add updated_at to orders_charts
            {
                "name": "orders_charts - updated_at column",
                "check": "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='tender_automation_with_ai' AND table_name='orders_charts' AND column_name='updated_at'",
                "query": "ALTER TABLE orders_charts ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
            },
            # 5. Add unique constraint to order_statistics (category, status)
            {
                "name": "order_statistics - unique (category, status)",
                "check": "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='tender_automation_with_ai' AND table_name='order_statistics' AND index_name='unique_category_status'",
                "query": "ALTER TABLE order_statistics ADD UNIQUE KEY unique_category_status (category, status)"
            },
            # 6. Add updated_at to order_statistics
            {
                "name": "order_statistics - updated_at column",
                "check": "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='tender_automation_with_ai' AND table_name='order_statistics' AND column_name='updated_at'",
                "query": "ALTER TABLE order_statistics ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
            },
            # 7. Add record_type to summary_dash
            {
                "name": "summary_dash - record_type column",
                "check": "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='tender_automation_with_ai' AND table_name='summary_dash' AND column_name='record_type'",
                "query": "ALTER TABLE summary_dash ADD COLUMN record_type VARCHAR(50) DEFAULT 'latest' UNIQUE FIRST"
            },
            # 8. Add updated_at to summary_dash
            {
                "name": "summary_dash - updated_at column",
                "check": "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='tender_automation_with_ai' AND table_name='summary_dash' AND column_name='updated_at'",
                "query": "ALTER TABLE summary_dash ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
            },
        ]
        
        # Execute migrations
        for migration in migrations:
            try:
                # Check if migration is needed
                cursor.execute(migration["check"])
                result = cursor.fetchone()
                
                if result[0] > 0:
                    print(f"⏭️  Skipping: {migration['name']} (already exists)")
                else:
                    print(f"🔄 Applying: {migration['name']}")
                    cursor.execute(migration["query"])
                    connection.commit()
                    print(f"✅ Applied: {migration['name']}")
                    
            except Error as e:
                print(f"⚠️  Error with {migration['name']}: {e}")
                # Continue with other migrations
                continue
        
        # Update existing summary_dash records to have record_type='latest'
        try:
            cursor.execute("UPDATE summary_dash SET record_type='latest' WHERE record_type IS NULL")
            connection.commit()
            print("✅ Updated existing summary_dash records")
        except Error as e:
            print(f"⚠️  Error updating summary_dash: {e}")
        
        print("\n🎉 Database migration completed!")
        
    except Error as e:
        print(f"❌ Database error: {e}")
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()
            print("🔌 Database connection closed")

if __name__ == "__main__":
    print("=" * 60)
    print("DATABASE MIGRATION SCRIPT")
    print("=" * 60)
    print("\nThis will update your database schema to support UPSERT operations.")
    print("It's safe to run multiple times - it will skip already applied changes.\n")
    
    response = input("Do you want to proceed? (yes/no): ").strip().lower()
    
    if response in ['yes', 'y']:
        migrate_database()
    else:
        print("❌ Migration cancelled")

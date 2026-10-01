import sys
import os
import json

# Add current directory to path
sys.path.append(os.getcwd())

from service.db_service import DBService

def test_order_statistics_storage():
    print("🧪 Testing order statistics storage...\n")
    
    # Load the JSON data
    json_path = "logs/orders_and_payments_data/orders_and_payments_data.json"
    
    if not os.path.exists(json_path):
        print(f"❌ JSON file not found: {json_path}")
        return
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print("📄 JSON Data loaded:")
    print(json.dumps(data, indent=2))
    
    # Initialize DB and store data
    try:
        db = DBService()
        db.create_all_tables()
        
        # Clear old data first
        print("\n🧹 Clearing old data...")
        db.clear_old_data()
        
        # Store the data
        print("\n💾 Storing data in order_statistics table...")
        db.store_orders_payments_data(data)
        
        # Verify what was stored
        print("\n📊 Verifying stored data:")
        conn = db.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT category, status, value, created_at FROM order_statistics ORDER BY category, id")
        results = cursor.fetchall()
        
        print(f"\n✅ Found {len(results)} records in order_statistics table:\n")
        print(f"{'Category':<20} {'Status':<35} {'Value':<15}")
        print("-" * 70)
        
        for row in results:
            category, status, value, created_at = row
            print(f"{category:<20} {status:<35} {value:<15}")
        
        cursor.close()
        conn.close()
        
        print("\n✅ Test complete!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_order_statistics_storage()

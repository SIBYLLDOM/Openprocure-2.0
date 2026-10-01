import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from service.db_service import DBService

def test_upsert():
    print("🧪 Testing UPSERT functionality for incidents...\n")
    
    try:
        db = DBService()
        
        # Test data - same incident_id
        test_incidents_v1 = [
            {
                'Incident_ID': 'TEST-12345',
                'Severity': 'High',
                'Reason': 'Initial reason',
                'Product_Category': 'Electronics',
                'Status': 'Pending',
                'Escalated_Date': '2026-01-01',
                'Incident_Date': '2026-01-01',
                'Raised_Against': 'Seller',
                'Organisation_Name': 'Test Org',
                'Seller_Organisation_Name': 'Test Seller',
                'Product_ID': 'PROD-001',
                'Incident_For': 'Quality Issue',
                'SCN_Sent_Date': '--',
                'SCN_End_Date': '--',
                'Last_Modified_Role': 'Admin',
                'Last_Modified_Date': '2026-01-01',
                'Maker_Role': 'System'
            }
        ]
        
        test_incidents_v2 = [
            {
                'Incident_ID': 'TEST-12345',  # Same ID
                'Severity': 'Critical',  # Updated
                'Reason': 'Updated reason - escalated',  # Updated
                'Product_Category': 'Electronics',
                'Status': 'In-Progress',  # Updated
                'Escalated_Date': '2026-01-02',  # Updated
                'Incident_Date': '2026-01-01',
                'Raised_Against': 'Seller',
                'Organisation_Name': 'Test Org',
                'Seller_Organisation_Name': 'Test Seller',
                'Product_ID': 'PROD-001',
                'Incident_For': 'Quality Issue',
                'SCN_Sent_Date': '2026-01-02',  # Updated
                'SCN_End_Date': '--',
                'Last_Modified_Role': 'Manager',  # Updated
                'Last_Modified_Date': '2026-01-02',  # Updated
                'Maker_Role': 'System'
            }
        ]
        
        # First insert
        print("1️⃣ Inserting initial incident...")
        db.insert_incidents(test_incidents_v1, 'test')
        
        # Query to see what was inserted
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT incident_id, severity, reason, status FROM incidents WHERE incident_id = 'TEST-12345'")
        result = cursor.fetchone()
        print(f"   Initial: ID={result[0]}, Severity={result[1]}, Status={result[3]}")
        
        # Second insert (should update)
        print("\n2️⃣ Updating same incident (UPSERT)...")
        db.insert_incidents(test_incidents_v2, 'test')
        
        # Query again to see if it was updated
        cursor.execute("SELECT incident_id, severity, reason, status FROM incidents WHERE incident_id = 'TEST-12345'")
        result = cursor.fetchone()
        print(f"   Updated: ID={result[0]}, Severity={result[1]}, Status={result[3]}")
        
        # Count total records with this ID (should be 1)
        cursor.execute("SELECT COUNT(*) FROM incidents WHERE incident_id = 'TEST-12345'")
        count = cursor.fetchone()[0]
        print(f"\n📊 Total records with ID 'TEST-12345': {count}")
        
        if count == 1 and result[1] == 'Critical' and result[3] == 'In-Progress':
            print("\n✅ UPSERT working correctly! Record was updated, not duplicated.")
        else:
            print("\n❌ UPSERT failed - duplicate or not updated")
        
        # Cleanup
        print("\n🧹 Cleaning up test data...")
        cursor.execute("DELETE FROM incidents WHERE incident_id = 'TEST-12345'")
        conn.commit()
        
        cursor.close()
        conn.close()
        
        print("✅ Test complete!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_upsert()

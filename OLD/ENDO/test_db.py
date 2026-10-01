from service.db_service import DBService

print("Testing database connection...")
db = DBService()
conn = db.get_connection()
if conn:
    print("✅ Connection Successful!")
    db.create_table()
    print("✅ Table Verification Successful!")
else:
    print("❌ Connection Failed.")

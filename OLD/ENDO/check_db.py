import sys
import os

# Add parent directory to path to import service
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from service.db_service import DBService

# Initialize DB Service
db = DBService()
conn = db.get_connection()

if not conn:
    print("❌ Failed to connect to database.")
    sys.exit(1)

cursor = conn.cursor()


# Get count by type
cursor.execute('SELECT type, COUNT(*) as count FROM incidents GROUP BY type ORDER BY count DESC')
rows = cursor.fetchall()

print('\n' + '='*60)
print(' '*15 + 'INCIDENT DATA BY TYPE')
print('='*60)
print(f"{'Type':<30} {'Count':>10}")
print('-'*60)

for row in rows:
    print(f"{row[0]:<30} {row[1]:>10}")

# Get total count
cursor.execute('SELECT COUNT(*) FROM incidents')
total = cursor.fetchone()[0]

print('-'*60)
print(f"{'TOTAL RECORDS':<30} {total:>10}")
print('='*60)


# Also show a sample record
print('\nSample record from database:')
cursor.execute('SELECT * FROM incidents LIMIT 1')
sample = cursor.fetchone()

if sample:
    cursor.execute('DESCRIBE incidents')
    columns = [col[0] for col in cursor.fetchall()]
    
    for i, col in enumerate(columns):
        if i < len(sample):
            print(f"  {col}: {sample[i]}")
else:
    print("  No records found in database")

conn.close()

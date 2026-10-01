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


# Get total count
cursor.execute('SELECT COUNT(*) FROM incidents')
total = cursor.fetchone()[0]

print(f'\n{"="*50}')
print(f'Total incidents in database: {total}')
print(f'{"="*50}')

# Get counts by type
cursor.execute('SELECT type, COUNT(*) as cnt FROM incidents GROUP BY type ORDER BY cnt DESC')
results = cursor.fetchall()

print('\nBreakdown by type:')
for row in results:
    print(f'  {row[0]:20} {row[1]:>5}')

conn.close()

import os
import csv
import sys
from service.db_service import DBService

# Directories
INCIDENTS_DATA_DIR = os.path.join(os.path.dirname(__file__), "logs", "incidents_data")

print("="*60)
print("DEBUGGING CSV IMPORT")
print("="*60)

# Check directory
print(f"\nChecking directory: {INCIDENTS_DATA_DIR}")
print(f"Directory exists: {os.path.exists(INCIDENTS_DATA_DIR)}")

# List all files
all_files = os.listdir(INCIDENTS_DATA_DIR)
print(f"\nAll files in directory: {len(all_files)}")
for f in all_files:
    print(f"  - {f}")

# Filter CSV files
csv_files = [f for f in all_files if f.endswith('.csv')]
print(f"\nCSV files: {len(csv_files)}")
for f in csv_files:
    print(f"  - {f}")

# Filter ALL_PAGES files
all_pages_files = [f for f in csv_files if 'ALL_PAGES' in f]
print(f"\nALL_PAGES files: {len(all_pages_files)}")
for f in all_pages_files:
    filepath = os.path.join(INCIDENTS_DATA_DIR, f)
    # Count rows
    with open(filepath, 'r', encoding='utf-8') as csvfile:
        row_count = sum(1 for _ in csvfile) - 1  # Subtract header
    print(f"  - {f}: {row_count} rows")

print("\n" + "="*60)
print("Now attempting import...")
print("="*60)

# Initialize database
db_service = DBService()
db_service.create_table()

# Import each ALL_PAGES file
for csv_file in all_pages_files:
    filepath = os.path.join(INCIDENTS_DATA_DIR, csv_file)
    
    # Extract type from filename
    category = csv_file.split('_')[0]
    incident_type = category.lower()
    
    print(f"\nProcessing: {csv_file}")
    print(f"  Type: {incident_type}")
    
    # Read CSV
    incidents = []
    with open(filepath, 'r', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            incidents.append(row)
    
    print(f"  Loaded: {len(incidents)} rows")
    
    # Insert to database
    if incidents:
        db_service.insert_incidents(incidents, incident_type)

print("\n" + "="*60)
print("Import complete!")
print("="*60)

import os
import csv
import sys
from service.db_service import DBService

# Directories
INCIDENTS_DATA_DIR = os.path.join(os.path.dirname(__file__), "logs", "incidents_data")

def extract_type_from_filename(filename):
    """
    Extracts the incident type from the CSV filename.
    Examples:
        - "All_page_1.csv" -> "all"
        - "Rejected_ALL_PAGES.csv" -> "rejected"
        - "Closed_page_2.csv" -> "closed"
    """
    # Remove file extension
    name_without_ext = filename.replace('.csv', '')
    
    # Split by underscore and get the first part (the category)
    parts = name_without_ext.split('_')
    category = parts[0]
    
    # Return lowercase version
    return category.lower()

def import_csv_file(csv_filepath, db_service):
    """
    Imports a single CSV file into the database.
    """
    filename = os.path.basename(csv_filepath)
    
    # Skip the JSON file  
    if filename.endswith('.json'):
        return
    
    # Only process ALL_PAGES files (which contain all data combined)
    # Skip individual page files to avoid processing same data multiple times
    if 'ALL_PAGES' not in filename:
        print(f"⏭️  Skipping individual page file: {filename}")
        return
    
    print(f"\n📂 Processing: {filename}")
    
    # Extract incident type from filename
    incident_type = extract_type_from_filename(filename)
    print(f"   📌 Type: {incident_type}")
    
    try:
        # Read CSV file
        incidents = []
        with open(csv_filepath, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                incidents.append(row)
        
        print(f"   📊 Found {len(incidents)} incidents in file")
        
        if incidents:
            # Insert into database
            db_service.insert_incidents(incidents, incident_type)
        
    except Exception as e:
        print(f"   ❌ Error processing {filename}: {e}")
        import traceback
        traceback.print_exc()

def import_all_csv_files():
    """
    Imports all CSV files from the incidents_data directory.
    """
    print("=" * 60)
    print("CSV IMPORT TO DATABASE")
    print("=" * 60)
    
    # Initialize database
    db_service = DBService()
    
    # Recreate table to ensure clean start
    print("\n🗄️  Recreating database table...")
    db_service.create_table()
    
    # Get all CSV files
    csv_files = [f for f in os.listdir(INCIDENTS_DATA_DIR) if f.endswith('.csv')]
    
    print(f"\n📁 Found {len(csv_files)} CSV files in {INCIDENTS_DATA_DIR}")
    
    # Import each file
    for csv_file in csv_files:
        csv_filepath = os.path.join(INCIDENTS_DATA_DIR, csv_file)
        import_csv_file(csv_filepath, db_service)
    
    print("\n" + "=" * 60)
    print("✅ IMPORT COMPLETE!")
    print("=" * 60)
    print(f"\n💡 Run this query to check the data:")
    print(f"   SELECT type, COUNT(*) as count FROM incidents GROUP BY type;")

if __name__ == "__main__":
    import_all_csv_files()

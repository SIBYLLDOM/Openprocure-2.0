import mysql.connector
from mysql.connector import Error
import os
from dotenv import load_dotenv

load_dotenv('c:/Users/Administrator/Downloads/INCIDENT SCRAPPER/INCIDENT SCRAPPER/ENDO/.env')

def check_summary_dash():
    try:
        connection = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
            database=os.getenv("DB_NAME", "tender_automation_with_ai")
        )
        
        if connection.is_connected():
            cursor = connection.cursor()
            
            print("--- Table: summary_dash ---")
            cursor.execute("DESCRIBE summary_dash")
            for row in cursor.fetchall():
                print(row)
                
            print("\n--- Indexes: summary_dash ---")
            cursor.execute("SHOW INDEX FROM summary_dash")
            for row in cursor.fetchall():
                print(row)
            
            cursor.close()
            connection.close()
    except Error as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_summary_dash()

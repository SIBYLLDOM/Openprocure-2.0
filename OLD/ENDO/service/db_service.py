import mysql.connector
from mysql.connector import Error
import os
from dotenv import load_dotenv

# Load .env from the root of the department (DIAGNO or ENDO)
ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(ENV_PATH)

class DBService:
    def __init__(self):
        self.host = os.getenv("DB_HOST", "localhost")
        self.user = os.getenv("DB_USER", "root")
        self.password = os.getenv("DB_PASSWORD", "")
        self.database = os.getenv("DB_NAME", "tender_automation_with_ai")


    def get_connection(self):
        """Creates a database connection."""
        try:
            # First connect to MySQL server without database to ensure DB exists
            connection = mysql.connector.connect(
                host=self.host,
                user=self.user,
                password=self.password
            )
            
            if connection.is_connected():
                cursor = connection.cursor()
                cursor.execute(f"CREATE DATABASE IF NOT EXISTS {self.database}")
                cursor.close()
                connection.close()
            
            # Now connect to the specific database
            connection = mysql.connector.connect(
                host=self.host,
                user=self.user,
                password=self.password,
                database=self.database
            )
            return connection
        except Error as e:
            print(f"❌ Error connecting to MySQL: {e}")
            return None

    def create_all_tables(self):
        """Creates all required tables if they don't exist."""
        connection = self.get_connection()
        if connection is None:
            return

        try:
            cursor = connection.cursor()
            
            # 1. Incidents Table
            create_incidents_query = """
            CREATE TABLE IF NOT EXISTS incidents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type VARCHAR(100),
                incident_id VARCHAR(50) UNIQUE,
                severity VARCHAR(50),
                reason TEXT,
                product_category VARCHAR(255),
                status VARCHAR(50),
                escalated_date VARCHAR(50),
                incident_date VARCHAR(50),
                raised_against VARCHAR(100),
                organisation_name VARCHAR(255),
                seller_organisation_name VARCHAR(255),
                product_id VARCHAR(50),
                incident_for VARCHAR(255),
                scn_sent_date VARCHAR(50),
                scn_end_date VARCHAR(50),
                last_modified_role VARCHAR(100),
                last_modified_date VARCHAR(50),
                maker_role VARCHAR(100),
                dept VARCHAR(100) DEFAULT 'endo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_incidents_query)

            # 2. Summary Images Table
            create_summary_images_query = """
            CREATE TABLE IF NOT EXISTS summary_images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                table_name VARCHAR(100),
                image_name VARCHAR(255) UNIQUE,
                image_data LONGBLOB,
                dept VARCHAR(100) DEFAULT 'endo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_summary_images_query)

            # 3. Orders Charts Table
            create_orders_charts_query = """
            CREATE TABLE IF NOT EXISTS orders_charts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chart_name VARCHAR(255) UNIQUE,
                image_data LONGBLOB,
                dept VARCHAR(100) DEFAULT 'endo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_orders_charts_query)

            # 4. Order Statistics Table (Consolidated)
            create_order_statistics_query = """
            CREATE TABLE IF NOT EXISTS order_statistics (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category VARCHAR(100),
                status VARCHAR(100),
                value VARCHAR(100),
                dept VARCHAR(100) DEFAULT 'endo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_category_status (category, status)
            )
            """
            cursor.execute(create_order_statistics_query)

            # 5. Summary Dashboard Table
            # NOTE: No record_type column, no UNIQUE constraint.
            # Every scraper run inserts a brand-new row tracked by created_at.
            create_summary_dash_query = """
            CREATE TABLE IF NOT EXISTS summary_dash (
                id INT AUTO_INCREMENT PRIMARY KEY,
                final_rating VARCHAR(50),
                delivery_rating VARCHAR(50),
                reliability_rating VARCHAR(50),
                quality_rating VARCHAR(50),
                feedback_rating VARCHAR(50),
                buyer_feedback_rating VARCHAR(50),
                total_orders VARCHAR(50),
                pending_acceptance VARCHAR(50),
                pending_delivery VARCHAR(50),
                total_bids VARCHAR(50),
                bids_won VARCHAR(50),
                bids_lost VARCHAR(50),
                total_incidents VARCHAR(50),
                pending_response VARCHAR(50),
                pending_resolution VARCHAR(50),
                total_products VARCHAR(50),
                published_products VARCHAR(50),
                pending_approval_products VARCHAR(50),
                total_charges VARCHAR(50),
                paid_amount VARCHAR(50),
                pending_amount VARCHAR(50),
                dept VARCHAR(100) DEFAULT 'endo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_summary_dash_query)

            print("🗄️  All database tables checked/created.")
            connection.commit()
            
        except Error as e:
            print(f"❌ Error creating tables: {e}")
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()

    def clear_old_data(self):
        """DEPRECATED: No longer clears data. Data is now updated via UPSERT."""
        print("ℹ️  Data persistence enabled - using UPSERT logic instead of clearing.")
        pass

    def store_summary_images(self, directory):
        """Stores/Updates all images from the summary directory into the database."""
        connection = self.get_connection()
        if connection is None or not os.path.exists(directory):
            return

        try:
            cursor = connection.cursor()
            count = 0
            
            for filename in os.listdir(directory):
                if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                    file_path = os.path.join(directory, filename)
                    with open(file_path, 'rb') as file:
                        binary_data = file.read()
                    
                    table_name = "Summary Overview"
                    
                    query = """
                        INSERT INTO summary_images (table_name, image_name, image_data, dept) 
                        VALUES (%s, %s, %s, 'endo')
                        ON DUPLICATE KEY UPDATE
                            table_name = VALUES(table_name),
                            image_data = VALUES(image_data),
                            dept = VALUES(dept)
                    """
                    cursor.execute(query, (table_name, filename, binary_data))
                    count += 1
            
            connection.commit()
            print(f"🗄️  Stored/Updated {count} summary images in DB.")
        except Error as e:
            print(f"❌ Error storing summary images: {e}")
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()

    def store_orders_charts(self, directory):
        """Stores/Updates all chart images from the orders charts directory."""
        connection = self.get_connection()
        if connection is None or not os.path.exists(directory):
            return

        try:
            cursor = connection.cursor()
            count = 0
            
            for filename in os.listdir(directory):
                if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                    file_path = os.path.join(directory, filename)
                    with open(file_path, 'rb') as file:
                        binary_data = file.read()
                    
                    query = """
                        INSERT INTO orders_charts (chart_name, image_data, dept) 
                        VALUES (%s, %s, 'endo')
                        ON DUPLICATE KEY UPDATE
                            image_data = VALUES(image_data),
                            dept = VALUES(dept)
                    """
                    cursor.execute(query, (filename, binary_data))
                    count += 1
            
            connection.commit()
            print(f"🗄️  Stored/Updated {count} orders charts in DB.")
        except Error as e:
            print(f"❌ Error storing orders charts: {e}")
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()

    def store_orders_payments_data(self, data):
        """Stores/Updates extracted JSON data into the order_statistics table."""
        connection = self.get_connection()
        if connection is None or not data:
            return

        try:
            cursor = connection.cursor()
            records_to_upsert = []
            
            # 1. Store Total Order Value and Volume
            val_vol = data.get("total_order_value_and_volume", {})
            if val_vol:
                if val_vol.get("order_value"):
                    records_to_upsert.append(("order_value", "Total Order Value", val_vol.get("order_value")))
                if val_vol.get("order_volume"):
                    records_to_upsert.append(("order_volume", "Total Order Volume", val_vol.get("order_volume")))
            
            # 2. Store Order Statistics
            order_stats = data.get("order_statistics", [])
            for item in order_stats:
                records_to_upsert.append(("order_status", item['status'], str(item['count'])))
            
            # 3. Store Payment Statistics
            payment_stats = data.get("payment_statistics", [])
            for item in payment_stats:
                records_to_upsert.append(("payment_status", item['status'], str(item['count'])))
            
            if records_to_upsert:
                query = """
                    INSERT INTO order_statistics (category, status, value, dept) 
                    VALUES (%s, %s, %s, 'endo')
                    ON DUPLICATE KEY UPDATE
                        value = VALUES(value),
                        dept = VALUES(dept)
                """
                cursor.executemany(query, records_to_upsert)
                connection.commit()
                print(f"🗄️  Stored/Updated {len(records_to_upsert)} records in order_statistics table.")
            
        except Error as e:
            print(f"❌ Error storing orders/payments data: {e}")
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()

    def store_summary_data(self, data):
        """
        Inserts a NEW row into summary_dash on every scraper run.
        No UNIQUE constraint — each run produces its own record tracked by created_at.
        """
        connection = self.get_connection()
        if connection is None or not data:
            return

        try:
            cursor = connection.cursor()
            
            final_rating              = data.get("final_rating")
            delivery_rating           = data.get("delivery_rating")
            reliability_rating        = data.get("reliability_rating")
            quality_rating            = data.get("quality_rating")
            feedback_rating           = data.get("feedback_rating")
            buyer_feedback_rating     = data.get("buyer_feedback_rating")
            total_orders              = data.get("total_orders")
            pending_acceptance        = data.get("pending_acceptance")
            pending_delivery          = data.get("pending_delivery")
            total_bids                = data.get("total_bids")
            bids_won                  = data.get("bids_won")
            bids_lost                 = data.get("bids_lost")
            total_incidents           = data.get("total_incidents")
            pending_response          = data.get("pending_response")
            pending_resolution        = data.get("pending_resolution")
            total_products            = data.get("total_products")
            published_products        = data.get("published_products")
            pending_approval_products = data.get("pending_approval_products")
            total_charges             = data.get("total_charges")
            paid_amount               = data.get("paid_amount")
            pending_amount            = data.get("pending_amount")

            # Plain INSERT — new row per scraper run, no upsert/overwrite
            query = """
                INSERT INTO summary_dash (
                    final_rating, delivery_rating, reliability_rating, quality_rating,
                    feedback_rating, buyer_feedback_rating, total_orders, pending_acceptance,
                    pending_delivery, total_bids, bids_won, bids_lost, total_incidents,
                    pending_response, pending_resolution, total_products, published_products,
                    pending_approval_products, total_charges, paid_amount, pending_amount, dept
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, 'endo'
                )
            """
            cursor.execute(query, (
                final_rating, delivery_rating, reliability_rating, quality_rating,
                feedback_rating, buyer_feedback_rating, total_orders, pending_acceptance,
                pending_delivery, total_bids, bids_won, bids_lost, total_incidents,
                pending_response, pending_resolution, total_products, published_products,
                pending_approval_products, total_charges, paid_amount, pending_amount
            ))
            
            connection.commit()
            print(f"🗄️  Inserted new summary_dash row (Charges: {total_charges}, Paid: {paid_amount}, Pending: {pending_amount})")
            
        except Error as e:
            print(f"❌ Error storing summary data: {e}")
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()

    def create_table(self):
        """Deprecated: Use create_all_tables instead. Kept for backward compatibility if needed."""
        self.create_all_tables()

    def insert_incidents(self, incidents, incident_type):
        """
        Inserts a list of incident dictionaries into the database.
        Upserts based on incident_id (UNIQUE key).
        """
        if not incidents:
            return

        connection = self.get_connection()
        if connection is None:
            return

        try:
            for incident in incidents:
                incident['Type'] = incident_type.lower()
                incident['Dept'] = 'endo'

            cursor = connection.cursor()
            
            insert_query = """
            INSERT INTO incidents (
                type, incident_id, severity, reason, product_category, status,
                escalated_date, incident_date, raised_against, organisation_name,
                seller_organisation_name, product_id, incident_for, scn_sent_date,
                scn_end_date, last_modified_role, last_modified_date, maker_role, dept
            ) VALUES (
                %(Type)s, %(Incident_ID)s, %(Severity)s, %(Reason)s, %(Product_Category)s, %(Status)s,
                %(Escalated_Date)s, %(Incident_Date)s, %(Raised_Against)s, %(Organisation_Name)s,
                %(Seller_Organisation_Name)s, %(Product_ID)s, %(Incident_For)s, %(SCN_Sent_Date)s,
                %(SCN_End_Date)s, %(Last_Modified_Role)s, %(Last_Modified_Date)s, %(Maker_Role)s, %(Dept)s
            )
            ON DUPLICATE KEY UPDATE
                type = VALUES(type),
                severity = VALUES(severity),
                reason = VALUES(reason),
                product_category = VALUES(product_category),
                status = VALUES(status),
                escalated_date = VALUES(escalated_date),
                incident_date = VALUES(incident_date),
                raised_against = VALUES(raised_against),
                organisation_name = VALUES(organisation_name),
                seller_organisation_name = VALUES(seller_organisation_name),
                product_id = VALUES(product_id),
                incident_for = VALUES(incident_for),
                scn_sent_date = VALUES(scn_sent_date),
                scn_end_date = VALUES(scn_end_date),
                last_modified_role = VALUES(last_modified_role),
                last_modified_date = VALUES(last_modified_date),
                maker_role = VALUES(maker_role),
                dept = VALUES(dept)
            """
            
            cursor.executemany(insert_query, incidents)
            connection.commit()
            
            inserted = cursor.rowcount
            total = len(incidents)
            
            print(f"🗄️  Inserted/Updated {inserted}/{total} incidents ({incident_type}) into MySQL")
            
        except Error as e:
            print(f"❌ Error inserting data: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()
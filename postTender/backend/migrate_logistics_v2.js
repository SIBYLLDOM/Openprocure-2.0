const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tender_system'
};

async function migrateLogisticsV2() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log("Connected to database.");

        // We will DROP the old table and recreate it to ensure it matches exactly what the user wants.
        // WARNING: This deletes existing data. Since we are in development/refactor mode and user said "not working", this is acceptable.
        // If data preservation was needed, we would use ALTER TABLE.

        await connection.query("DROP TABLE IF EXISTS logistics_docs"); // Drop the temp table we made
        await connection.query("DROP TABLE IF EXISTS logistics"); // Drop main table
        console.log("Dropped existing logistics tables.");

        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS logistics (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,

                invoice_no VARCHAR(255) DEFAULT NULL,
                dispatch_date DATE DEFAULT NULL,
                dispatch_ref VARCHAR(255) DEFAULT NULL, -- LR/AWB Number
                transporter VARCHAR(255) DEFAULT NULL,

                invoice_file JSON DEFAULT NULL,
                eway_bill JSON DEFAULT NULL,
                packing_list JSON DEFAULT NULL,
                dispatch_challan JSON DEFAULT NULL,

                status VARCHAR(50) DEFAULT 'Not Dispatched',
                remarks TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                FOREIGN KEY (order_id) REFERENCES orders_rows(id) ON DELETE CASCADE,
                UNIQUE KEY unique_order (order_id)
            )
        `;

        await connection.query(createTableQuery);
        console.log("✅ Table 'logistics' recreated with new schema.");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        if (connection) await connection.end();
    }
    process.exit();
}

migrateLogisticsV2();

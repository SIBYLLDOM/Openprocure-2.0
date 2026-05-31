const db = require('./src/config/db');

async function migrateLogistics() {
    try {
        // 1. Create table
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS logistics (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                dispatch_date DATE,
                dispatch_ref VARCHAR(255),
                documents TEXT,
                status VARCHAR(50) DEFAULT 'Not Dispatched',
                remarks TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders_rows(id) ON DELETE CASCADE,
                UNIQUE KEY unique_order (order_id)
            )
        `;
        await db.query(createTableQuery);
        console.log("✅ Table 'logistics' created.");

        // 2. Migrate existing data
        // Fetch data from orders_rows that has dispatch info
        const [rows] = await db.query(`
            SELECT id, dispatch_date, dispatch_ref, dispatch_status, dispatch_remarks, dispatch_documents 
            FROM orders_rows 
            WHERE dispatch_status != 'Not Dispatched' 
               OR dispatch_date IS NOT NULL 
               OR dispatch_ref IS NOT NULL
        `);

        console.log(`Found ${rows.length} records to migrate.`);

        for (const row of rows) {
            await db.query(`
                INSERT INTO logistics (order_id, dispatch_date, dispatch_ref, status, remarks, documents)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    dispatch_date = VALUES(dispatch_date),
                    dispatch_ref = VALUES(dispatch_ref),
                    status = VALUES(status),
                    remarks = VALUES(remarks),
                    documents = VALUES(documents)
            `, [
                row.id,
                row.dispatch_date,
                row.dispatch_ref,
                row.dispatch_status || 'Not Dispatched',
                row.dispatch_remarks,
                row.dispatch_documents
            ]);
        }

        console.log("✅ Migration completed.");

    } catch (err) {
        console.error("Migration failed:", err);
    }
    process.exit();
}

migrateLogistics();

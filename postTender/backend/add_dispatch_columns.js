const db = require('./src/config/db');

async function addColumns() {
    try {
        const queries = [
            "ALTER TABLE orders_rows ADD COLUMN IF NOT EXISTS dispatch_date DATE",
            "ALTER TABLE orders_rows ADD COLUMN IF NOT EXISTS dispatch_ref VARCHAR(255)",
            "ALTER TABLE orders_rows ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(50) DEFAULT 'Not Dispatched'",
            "ALTER TABLE orders_rows ADD COLUMN IF NOT EXISTS dispatch_remarks TEXT"
        ];

        for (const query of queries) {
            try {
                await db.query(query);
                console.log(`Executed: ${query}`);
            } catch (err) {
                // Ignore if duplicate column error (though IF NOT EXISTS should handle it on newer MySQL)
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log(`Skipped (Exists): ${query}`);
                } else {
                    console.error(`Error executing ${query}:`, err.message);
                }
            }
        }
        console.log("✅ Dispatch columns migration completed.");

    } catch (error) {
        console.error("Migration failed:", error);
    }
    process.exit();
}

addColumns();

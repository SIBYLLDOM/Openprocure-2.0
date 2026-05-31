const db = require('./src/config/db');

async function forceAddColumns() {
    try {
        const queries = [
            "ALTER TABLE orders_rows ADD COLUMN dispatch_date DATE",
            "ALTER TABLE orders_rows ADD COLUMN dispatch_ref VARCHAR(255)",
            "ALTER TABLE orders_rows ADD COLUMN dispatch_status VARCHAR(50) DEFAULT 'Not Dispatched'",
            "ALTER TABLE orders_rows ADD COLUMN dispatch_remarks TEXT"
        ];

        for (const query of queries) {
            try {
                await db.query(query);
                console.log(`Executed: ${query}`);
            } catch (err) {
                console.log(`Error (likely exists): ${err.message}`);
            }
        }
        console.log("✅ Force migration check completed.");

    } catch (error) {
        console.error("Migration failed:", error);
    }
    process.exit();
}

forceAddColumns();

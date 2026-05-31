const db = require('./src/config/db');

async function addDocColumn() {
    try {
        await db.query("ALTER TABLE orders_rows ADD COLUMN IF NOT EXISTS dispatch_documents TEXT");
        console.log("✅ Added dispatch_documents column.");
    } catch (err) {
        console.error("Migration failed:", err.message);
    }
    process.exit();
}

addDocColumn();

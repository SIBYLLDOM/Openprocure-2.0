const fs = require('fs');
const db = require('./src/config/db');

async function describeTable() {
    try {
        const [rows] = await db.query("DESCRIBE orders_rows");
        fs.writeFileSync('schema_description.txt', JSON.stringify(rows, null, 2));
    } catch (error) {
        fs.writeFileSync('schema_description.txt', `Describe failed: ${error.message}`);
    }
    process.exit();
}

describeTable();

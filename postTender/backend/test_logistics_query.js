const fs = require('fs');
const db = require('./src/config/db');

async function testQuery() {
    try {
        const query = `
            SELECT 
                id, 
                contract_no, 
                contract_no as po_no, 
                sap_order_no, 
                dispatch_date, 
                dispatch_ref, 
                dispatch_status as status, 
                dispatch_remarks as remarks
            FROM orders_rows
            WHERE sap_order_no IS NOT NULL
            ORDER BY 
                CASE WHEN dispatch_date IS NULL THEN 0 ELSE 1 END,
                dispatch_date DESC
        `;
        const [rows] = await db.query(query);
        fs.writeFileSync('query_test_output.txt', `Query successful, rows: ${rows.length}\nFirst row: ${JSON.stringify(rows[0])}`);
    } catch (error) {
        fs.writeFileSync('query_test_output.txt', `Query failed: ${error.message}`);
    }
    process.exit();
}

testQuery();

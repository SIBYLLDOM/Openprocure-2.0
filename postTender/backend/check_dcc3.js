require('dotenv').config();
const mysql = require('mysql2/promise');
async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    // All contracts in orders_rows with sap_order_no
    const [orders] = await pool.query(`SELECT id, contract_no, sap_order_no FROM orders_rows WHERE sap_order_no IS NOT NULL`);
    console.log('=== orders_rows (has sap_order_no) ===');
    orders.forEach(r => console.log(JSON.stringify(r)));

    // All DCC records
    const [dcc] = await pool.query(`SELECT contract_no, status FROM dcc`);
    console.log('\n=== dcc table ===');
    dcc.forEach(r => console.log(JSON.stringify(r)));

    await pool.end();
    process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });

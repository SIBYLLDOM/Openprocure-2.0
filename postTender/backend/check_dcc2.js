require('dotenv').config();
const mysql = require('mysql2/promise');
async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    const [rows] = await pool.query(`
        SELECT o.contract_no, o.sap_order_no, 
               COALESCE(l.status,'Not Dispatched') as dispatch_status, 
               d.status as dcc_status
        FROM orders_rows o
        LEFT JOIN logistics l ON o.id=l.order_id
        LEFT JOIN dcc d ON o.contract_no=d.contract_no
        WHERE o.sap_order_no IS NOT NULL
    `);
    rows.forEach(r => console.log(JSON.stringify(r)));
    await pool.end();
    process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });

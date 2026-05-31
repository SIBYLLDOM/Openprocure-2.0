require('dotenv').config();
const mysql = require('mysql2/promise');
async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    // Insert/update DCC record for GEMC-511687778991457 as verified for testing
    const [r] = await pool.query(`
        INSERT INTO dcc (contract_no, status) VALUES (?, 'verified')
        ON DUPLICATE KEY UPDATE status = 'verified'
    `, ['GEMC-511687778991457']);
    console.log('Inserted DCC record, affectedRows:', r.affectedRows);

    // Verify the logistics join now works
    const [rows] = await pool.query(`
        SELECT o.contract_no, d.status as dcc_status
        FROM orders_rows o
        LEFT JOIN dcc d ON o.contract_no = d.contract_no
        WHERE o.sap_order_no IS NOT NULL
    `);
    rows.forEach(r => console.log(JSON.stringify(r)));

    await pool.end();
    process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });

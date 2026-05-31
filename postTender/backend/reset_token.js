require('dotenv').config();
const mysql = require('mysql2/promise');
async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    const [r] = await pool.query(`UPDATE opi_access_tokens SET status = 'Active' WHERE token = ?`,
        ['cf680477-241a-4d87-8001-38be384feff4']);
    console.log('Rows updated:', r.affectedRows);
    await pool.end();
    process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });

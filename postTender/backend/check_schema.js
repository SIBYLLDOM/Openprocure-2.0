require('dotenv').config();
const mysql = require('mysql2/promise');
async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    // Check the DCC table columns
    const [cols] = await pool.query(`DESCRIBE dcc`);
    console.log('=== dcc table schema ===');
    cols.forEach(c => console.log(JSON.stringify(c)));

    // Check the logistics table columns  
    const [lcols] = await pool.query(`DESCRIBE logistics`);
    console.log('\n=== logistics table schema ===');
    lcols.forEach(c => console.log(JSON.stringify(c)));

    await pool.end();
    process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });

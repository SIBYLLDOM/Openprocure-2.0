const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkUsers() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'meril',
        database: 'tender_automation_with_ai',
    });

    try {
        const [rows] = await pool.query('SELECT DISTINCT role FROM users');
        console.log('Existing roles in users table:');
        rows.forEach(r => console.log(` - ${r.role}`));

        const [count] = await pool.query('SELECT COUNT(*) as count FROM users');
        console.log(`Total users: ${count[0].count}`);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

checkUsers();

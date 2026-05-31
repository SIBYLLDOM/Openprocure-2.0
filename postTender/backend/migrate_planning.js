require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS planning_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                opi_token TEXT NOT NULL,
                planning_token VARCHAR(191) UNIQUE NOT NULL,
                contract_no VARCHAR(191) NOT NULL,
                manufacturing_remarks TEXT NOT NULL,
                flsp_email TEXT,
                accepted_by_email TEXT,
                planning_remarks TEXT,
                delivery_date DATE,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Table planning_requests created OK');
    } catch (e) {
        console.error('Migration error:', e.message);
    }
    await pool.end();
    process.exit(0);
}
migrate();

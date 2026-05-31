const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateSchema() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'meril',
        database: 'tender_automation_with_ai',
    });

    try {
        console.log('Updating users table schema...');
        await pool.query("ALTER TABLE users MODIFY COLUMN role ENUM('Admin','Tender','Finance','Sales','Management','pre-tender') DEFAULT 'Tender'");
        console.log('Schema updated successfully.');

        // Check if we need to create a test user with pre-tender role
        const [rows] = await pool.query("SELECT * FROM users WHERE email = 'pretender@test.com'");
        if (rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('password123', 10);
            await pool.query("INSERT INTO users (name, email, password, role) VALUES ('Pre-Tender User', 'pretender@test.com', ?, 'pre-tender')", [hashedPassword]);
            console.log('Created test pre-tender user: pretender@test.com / password123');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

updateSchema();

require('dotenv').config();
const mysql = require('mysql2/promise');

async function updateEnum() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'meril',
            database: process.env.DB_NAME || 'tender_automation_with_ai'
        });

        console.log("Connected to DB.");

        // Define all valid roles from Register.jsx
        const availableRoles = [
            'Admin',
            'User',
            'pre-tender',
            'Management',
            'Sales',
            'Tender',
            'Post',
            'Finance',
            'Logistics',
            'QC'
        ];

        const enumStr = availableRoles.map(r => `'${r}'`).join(', ');

        const alterQuery = `ALTER TABLE users MODIFY COLUMN role ENUM(${enumStr}) DEFAULT 'User'`;

        console.log(`Executing: ${alterQuery}`);
        await connection.query(alterQuery);

        console.log("Successfully updated the role ENUM in the users table!");

        await connection.end();
    } catch (err) {
        console.error("Error updating schema:", err);
    }
}

updateEnum();

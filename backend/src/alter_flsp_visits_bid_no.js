require('dotenv').config();
const mysql = require('mysql2/promise');

async function alterTable() {
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'tender_automation_with_ai'
    };

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Adding bid_no to flsp_visits...');
        try {
            await connection.execute(`
                ALTER TABLE flsp_visits 
                ADD COLUMN bid_no VARCHAR(255)
            `);
            console.log('bid_no added successfully.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Column bid_no already exists.');
            } else {
                throw err;
            }
        }
    } catch (error) {
        console.error('Error altering table:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed.');
        }
    }
}

alterTable();

const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'd:/Tender System/OpenProcure/postTender/backend/.env' });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'posttender'
};

async function initBanks() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database.');

        // Create table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS banks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bank_name VARCHAR(100) NOT NULL,
                branch_name VARCHAR(100) NOT NULL,
                ifsc_code VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_bank_name (bank_name)
            )
        `);
        console.log('Banks table created or already exists.');

        // Check if data exists
        const [rows] = await connection.query('SELECT COUNT(*) as count FROM banks');

        if (rows[0].count === 0) {
            console.log('Seeding banks data...');
            const banks = [
                ['State Bank of India', 'Main Branch, New Delhi', 'SBIN0000691'],
                ['State Bank of India', 'Connaught Place, New Delhi', 'SBIN0004532'],
                ['HDFC Bank', 'Koramangala, Bangalore', 'HDFC0001234'],
                ['HDFC Bank', 'Indiranagar, Bangalore', 'HDFC0005678'],
                ['ICICI Bank', 'Nariman Point, Mumbai', 'ICIC0000005'],
                ['Punjab National Bank', 'Civil Lines, Delhi', 'PUNB0001200'],
                ['Bank of Baroda', 'Sayajigunj, Vadodara', 'BARB0SAYAJI'],
                ['Canara Bank', 'MG Road, Bangalore', 'CNRB0000001']
            ];

            await connection.query(
                'INSERT INTO banks (bank_name, branch_name, ifsc_code) VALUES ?',
                [banks]
            );
            console.log('Sample banks data inserted.');
        } else {
            console.log('Banks table already has data.');
        }

    } catch (error) {
        console.error('Error initializing banks:', error);
    } finally {
        if (connection) await connection.end();
    }
}

initBanks();

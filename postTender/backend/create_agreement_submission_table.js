const mysql = require('mysql2/promise');
require('dotenv').config();

async function createAgreementSubmissionTable() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('✅ Connected to database');

        // Create agreement_submission table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS agreement_submission (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bid_no VARCHAR(100) NOT NULL,
                file_path VARCHAR(500) NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                uploaded_by VARCHAR(50),
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status ENUM('Pending', 'Verified') DEFAULT 'Pending',
                verified_by VARCHAR(50),
                verified_at TIMESTAMP NULL,
                remarks TEXT,
                UNIQUE KEY unique_bid_submission (bid_no)
            )
        `);

        console.log('✅ agreement_submission table created successfully');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('✅ Database connection closed');
        }
    }
}

createAgreementSubmissionTable();

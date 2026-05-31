const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'd:/Tender System/OpenProcure/postTender/backend/.env' });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'posttender'
};

async function fixContractColumn() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database.');

        // Drop old 'contracts' column if it exists
        try {
            await connection.query(`ALTER TABLE pbg_records DROP COLUMN contracts`);
            console.log("Dropped 'contracts' column.");
        } catch (error) {
            console.log("'contracts' column might not exist, skipping drop.");
        }

        // Add 'contract_no' column after 'bid_no'
        try {
            await connection.query(`
                ALTER TABLE pbg_records 
                ADD COLUMN contract_no VARCHAR(100) AFTER bid_no
            `);
            console.log("Added 'contract_no' column after 'bid_no'.");
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log("'contract_no' column already exists.");
            } else {
                throw error;
            }
        }

    } catch (error) {
        console.error('Error modifying columns:', error);
    } finally {
        if (connection) await connection.end();
    }
}

fixContractColumn();

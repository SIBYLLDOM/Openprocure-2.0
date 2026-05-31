const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'd:/Tender System/OpenProcure/postTender/backend/.env' });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'posttender'
};

async function addContractsColumn() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database.');

        // Add column if not exists
        try {
            await connection.query(`
                ALTER TABLE pbg_records 
                ADD COLUMN contracts VARCHAR(100) AFTER reference_number
            `);
            console.log('Added contracts column to pbg_records.');
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('contracts column already exists in pbg_records.');
            } else {
                throw error;
            }
        }

    } catch (error) {
        console.error('Error adding column:', error);
    } finally {
        if (connection) await connection.end();
    }
}

addContractsColumn();

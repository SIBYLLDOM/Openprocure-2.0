require('dotenv').config();
const mysql = require('mysql2/promise');

async function alterTables() {
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'tender_automation_with_ai'
    };

    let connection;
    try {
        console.log(`Attempting to connect to database: ${dbConfig.database}`);
        connection = await mysql.createConnection(dbConfig);
        console.log('Successfully connected to database.');

        // 1. Add attendance_submitted to prebid_meeting
        console.log('Adding attendance_submitted to prebid_meeting...');
        try {
            await connection.execute(`
                ALTER TABLE prebid_meeting 
                ADD COLUMN attendance_submitted TINYINT(1) DEFAULT 0
            `);
            console.log('attendance_submitted added successfully.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Column attendance_submitted already exists.');
            } else {
                throw err;
            }
        }

        // 2. Add latitude and longitude to flsp_visits
        console.log('Adding latitude and longitude to flsp_visits...');
        try {
            await connection.execute(`
                ALTER TABLE flsp_visits 
                ADD COLUMN latitude DECIMAL(10,8),
                ADD COLUMN longitude DECIMAL(11,8)
            `);
            console.log('latitude and longitude added successfully.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Columns latitude/longitude already exist.');
            } else {
                throw err;
            }
        }

        console.log('Table alterations complete.');
    } catch (error) {
        console.error('Error altering tables:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed.');
        }
    }
}

alterTables();

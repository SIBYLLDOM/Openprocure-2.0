const mysql = require('mysql2/promise');
require('dotenv').config();

async function createPrebidTable() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'tender_automation_with_ai'
        });

        const query = `
            CREATE TABLE IF NOT EXISTS prebid_meeting (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bid_no VARCHAR(150) UNIQUE NOT NULL,
                datetime_venue TEXT,
                zone_head VARCHAR(150),
                flsp TEXT,
                team_remarks TEXT,
                token_id VARCHAR(150),
                flsp_remarks TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await connection.query(query);
        console.log('Successfully created prebid_meeting table');
        process.exit(0);
    } catch (error) {
        console.error('Error creating prebid_meeting table:', error);
        process.exit(1);
    }
}

createPrebidTable();

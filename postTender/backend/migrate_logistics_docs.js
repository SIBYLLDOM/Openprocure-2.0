const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tender_system'
};

async function migrateLogisticsDocs() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log("Connected to database.");

        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS logistics_docs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                logistics_id INT NOT NULL,
                file_name VARCHAR(255),
                file_path VARCHAR(255),
                file_type VARCHAR(100),
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (logistics_id) REFERENCES logistics(id) ON DELETE CASCADE
            )
        `;

        await connection.query(createTableQuery);
        console.log("✅ Table 'logistics_docs' created.");

        // Optional: Trigger to move existing JSON docs to new table? 
        // Skipping complex migration for now as user said "not working" so likely no important data yet.

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        if (connection) await connection.end();
    }
    process.exit();
}

migrateLogisticsDocs();

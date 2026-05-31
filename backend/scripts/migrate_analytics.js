const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

const migrate = async () => {
    try {
        const sqlPath = path.join(__dirname, '../database/create_analytics.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split by semicolon? No, create table usually one statement.
        // Or execute whole string if driver supports it.
        // Standard mysql2 execute supports one statement.
        // create_analytics.sql has one statement.

        console.log('Running migration...');
        await db.query(sql);
        console.log('Migration successful: workspace_analytics_data table created/verified.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();

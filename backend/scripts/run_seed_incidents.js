const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

const seed = async () => {
    try {
        const sqlPath = path.join(__dirname, '../database/seed_incidents.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running incidents seed...');

        // Split by semicolon to handle multiple statements if necessary, 
        // though db.query might only support one at a time depending on config.
        // The SQL file has DROP, CREATE, and INSERT. 
        // db.query in mysql2 with multipleStatements: true (if enabled) works, 
        // otherwise we split.
        // Let's assume standard config and split.

        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            await db.query(statement);
        }

        console.log('Seed successful: incidents table populated.');
        process.exit(0);
    } catch (error) {
        console.error('Seed failed:', error);
        process.exit(1);
    }
};

seed();

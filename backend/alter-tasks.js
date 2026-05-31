require('dotenv').config();
const db = require('./src/config/db');

async function migrate() {
    try {
        console.log('Adding description...');
        await db.query('ALTER TABLE workspace_tasks ADD COLUMN description TEXT DEFAULT NULL');
    } catch (e) { console.log('description exists'); }

    try {
        console.log('Adding deadline...');
        await db.query('ALTER TABLE workspace_tasks ADD COLUMN deadline DATETIME DEFAULT NULL');
    } catch (e) { console.log('deadline exists'); }

    try {
        console.log('Adding assigned_users...');
        await db.query('ALTER TABLE workspace_tasks ADD COLUMN assigned_users JSON DEFAULT NULL');
    } catch (e) { console.log('assigned_users exists'); }

    try {
        console.log('Adding remarks...');
        await db.query('ALTER TABLE workspace_tasks ADD COLUMN remarks TEXT DEFAULT NULL');
    } catch (e) { console.log('remarks exists'); }

    console.log('Done');
    process.exit(0);
}

migrate();

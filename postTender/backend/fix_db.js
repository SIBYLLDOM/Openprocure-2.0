const db = require('./src/config/db');
async function fix() {
    try {
        await db.query(`ALTER TABLE opi_access_tokens ADD COLUMN expires_at DATETIME`);
        console.log('Added expires_at');
    } catch (e) { console.error('Error adding expires_at', e.message); }

    try {
        await db.query(`ALTER TABLE opi_access_tokens ADD COLUMN status VARCHAR(50) DEFAULT 'Active'`);
        console.log('Added status');
    } catch (e) { console.error('Error adding status', e.message); }

    process.exit(0);
}
fix();

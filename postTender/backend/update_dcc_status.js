const db = require('./src/config/db');

async function updateTables() {
    try {
        console.log('Updating DCC table status enum to include declined...');

        // Altering ENUM requires redefining all values
        await db.query(`
            ALTER TABLE dcc 
            MODIFY COLUMN status ENUM('not', 'created', 'verified', 'declined') DEFAULT 'not';
        `);

        console.log('DCC table updated.');
        process.exit(0);
    } catch (error) {
        console.error('Error updating tables:', error);
        process.exit(1);
    }
}

updateTables();

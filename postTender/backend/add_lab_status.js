const db = require('./src/config/db');

async function migrate() {
    try {
        console.log('🔄 Checking for lab_status column in coa_certificate table...');

        // Check if column exists
        const [columns] = await db.query(`SHOW COLUMNS FROM coa_certificate LIKE 'lab_status'`);

        if (columns.length === 0) {
            console.log('➕ Column missing. Adding lab_status...');
            await db.query(`
                ALTER TABLE coa_certificate 
                ADD COLUMN lab_status VARCHAR(50) DEFAULT 'Pending' AFTER nabl_certificate;
            `);
            console.log('✅ Column added successfully.');
        } else {
            console.log('ℹ️ Column already exists. Skipping.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();

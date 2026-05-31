const db = require('./src/config/db');

async function addColumn() {
    try {
        console.log('Adding order_prog_status column to orders_rows table...');
        await db.query(`
            ALTER TABLE orders_rows
            ADD COLUMN order_prog_status ENUM('Accepted', 'Declined') DEFAULT NULL;
        `);
        console.log('Column added successfully.');
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Column order_prog_status already exists.');
        } else {
            console.error('Error adding column:', error);
        }
    } finally {
        process.exit();
    }
}

addColumn();

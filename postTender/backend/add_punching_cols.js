const db = require('./src/config/db');

const addPunchingColumns = async () => {
    try {
        console.log('Adding punching columns to orders_rows table...');

        // Helper to add column safely
        const addColumn = async (colDef) => {
            try {
                await db.query(`ALTER TABLE orders_rows ADD COLUMN ${colDef}`);
                console.log(`Added column: ${colDef.split(' ')[0]}`);
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log(`Column already exists: ${colDef.split(' ')[0]}`);
                } else {
                    console.error(`Error adding ${colDef.split(' ')[0]}:`, err.message);
                }
            }
        };

        await addColumn('sap_order_no VARCHAR(100) DEFAULT NULL');
        await addColumn('punched_by VARCHAR(100) DEFAULT NULL');
        await addColumn('punched_date DATE DEFAULT NULL');

    } catch (error) {
        console.error('Error adding columns:', error);
    } finally {
        process.exit();
    }
};

addPunchingColumns();

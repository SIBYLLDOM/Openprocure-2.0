const db = require('./src/config/db');

const addColumn = async () => {
    try {
        const query = `
            ALTER TABLE pbg_records 
            ADD COLUMN uploaded_by_user_id INT;
        `;
        await db.query(query);
        console.log('Column uploaded_by_user_id added to pbg_records successfully.');
        process.exit(0);
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Column already exists.');
            process.exit(0);
        }
        console.error('Error adding column:', error);
        process.exit(1);
    }
};

addColumn();

const db = require('./src/config/db');

const migrate = async () => {
    try {
        const query = `
            ALTER TABLE coa_certificate 
            ADD COLUMN lab_status ENUM('Not Sent', 'Sent to Lab', 'NABL Received') DEFAULT 'Not Sent';
        `;
        await db.query(query);
        console.log("Added 'lab_status' column to 'coa_certificate' table.");
        process.exit(0);
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log("Column 'lab_status' already exists.");
            process.exit(0);
        }
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

migrate();

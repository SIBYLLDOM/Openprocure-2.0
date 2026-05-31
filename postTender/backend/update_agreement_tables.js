const db = require('./src/config/db');

async function createAgreementTable() {
    try {
        console.log('Creating agreement_drafts table...');

        await db.query(`
            CREATE TABLE IF NOT EXISTS agreement_drafts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bid_no VARCHAR(100) NOT NULL,
                content LONGTEXT,
                submitted BOOLEAN DEFAULT 0,
                submitted_by VARCHAR(50),
                submitted_at TIMESTAMP NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (bid_no) REFERENCES participated_tenders(bid_no) ON DELETE CASCADE,
                UNIQUE KEY unique_bid_agreement (bid_no)
            );
        `);

        console.log('agreement_drafts table created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error creating table:', error);
        process.exit(1);
    }
}

createAgreementTable();

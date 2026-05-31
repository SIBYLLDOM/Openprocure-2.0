const db = require('./src/config/db');

const createTable = async () => {
    try {
        const query = `
            CREATE TABLE IF NOT EXISTS contracts (
              id INT AUTO_INCREMENT PRIMARY KEY,
              bid_no VARCHAR(100) NOT NULL,
              contract_no VARCHAR(100) UNIQUE NOT NULL,
              contract_date DATE,
              validity_period VARCHAR(50),
              contract_value DECIMAL(15,2),
              status ENUM('Active','Expired','Terminated') DEFAULT 'Active',
              document_path VARCHAR(500),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              FOREIGN KEY (bid_no) REFERENCES participated_tenders(bid_no) ON DELETE CASCADE,
              INDEX idx_contract_no (contract_no)
            );
        `;
        await db.query(query);
        console.log('Contracts table created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error creating table:', error);
        process.exit(1);
    }
};

createTable();

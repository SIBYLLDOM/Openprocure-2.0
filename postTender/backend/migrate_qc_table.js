const db = require('./src/config/db');

const createTableQuery = `
CREATE TABLE IF NOT EXISTS coa_certificate (
  id INT NOT NULL AUTO_INCREMENT,
  contract_no VARCHAR(150) NOT NULL,

  coa_file JSON DEFAULT NULL,
  nabl_certificate JSON DEFAULT NULL,

  status ENUM('onprocess', 'completed') DEFAULT 'onprocess',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_contract (contract_no)
);
`;

const migrate = async () => {
    try {
        await db.query(createTableQuery);
        console.log("QC Table 'coa_certificate' created successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

migrate();

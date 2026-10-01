require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const db = require('../config/db');

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_departments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      department VARCHAR(100) NOT NULL,
      UNIQUE KEY unique_user_dept (user_id, department),
      KEY idx_user_id (user_id)
    ) ENGINE=InnoDB
  `);
  console.log('✓ user_departments table created (or already exists)');
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });

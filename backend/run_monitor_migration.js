/**
 * Migration: User Management & Monitoring System
 * Run once: node run_monitor_migration.js
 */
require('dotenv').config({ path: './src/.env' });
require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || 'meril',
    database: process.env.DB_NAME     || 'tender_automation_with_ai',
    multipleStatements: true,
  });

  console.log('Connected. Running migrations...');

  // 1. Add monitor role to users ENUM
  await conn.query(`
    ALTER TABLE users MODIFY COLUMN role
      ENUM('Admin','User','pre-tender','Management','Sales','Tender','Post',
           'Finance','Logistics','QC','monitor') DEFAULT 'User'
  `);
  console.log('✓ users.role ENUM updated');

  // 2. user_login_history
  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_login_history (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT NOT NULL,
      email         VARCHAR(100),
      role          VARCHAR(50),
      ip_address    VARCHAR(45),
      user_agent    TEXT,
      logged_in_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      logged_out_at TIMESTAMP NULL,
      INDEX idx_uid (user_id),
      INDEX idx_date (logged_in_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('✓ user_login_history created');

  // 3. user_sessions
  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      user_id              INT NOT NULL,
      login_history_id     INT,
      started_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_heartbeat_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      total_active_seconds INT DEFAULT 0,
      is_active            TINYINT(1) DEFAULT 1,
      INDEX idx_uid (user_id),
      INDEX idx_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('✓ user_sessions created');

  // 4. support_tickets
  await conn.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      INT NOT NULL,
      user_name    VARCHAR(100),
      user_email   VARCHAR(100),
      title        VARCHAR(255) NOT NULL,
      description  TEXT NOT NULL,
      image_path   VARCHAR(500),
      status       ENUM('open','in_progress','resolved','closed') DEFAULT 'open',
      priority     ENUM('low','medium','high') DEFAULT 'medium',
      resolved_by  INT NULL,
      resolved_at  TIMESTAMP NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_uid (user_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('✓ support_tickets created');

  await conn.end();
  console.log('\nAll migrations completed successfully.');
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

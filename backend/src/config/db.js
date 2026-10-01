// src/config/db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  port: process.env.DB_PORT || 8889,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection — warn on failure but keep the pool alive so the server
// stays up and can retry on the next incoming request.
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('DB Connected Successfully');
    conn.release();
  } catch (err) {
    console.error('DB Connection Failed:', err.message);
    // Do NOT exit — the pool will reconnect automatically on the next query.
  }
})();

module.exports = pool;

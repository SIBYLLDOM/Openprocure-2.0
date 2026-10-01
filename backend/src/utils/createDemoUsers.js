/**
 * One-time script to create demo accounts for the complaint-review presentation.
 * Run: node src/utils/createDemoUsers.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const users = [
  { name: 'Sales Demo', email: 'sales@test.com', password: 'sales123', role: 'Sales' },
  { name: 'Zonal Head Demo', email: 'zonalhead@test.com', password: 'zonal123', role: 'Zonal Head' },
  { name: 'Finance Demo', email: 'finance@test.com', password: 'finance123', role: 'Finance Team' },
];

async function createDemoUsers() {
  for (const user of users) {
    try {
      const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [user.email]);
      if (existing.length > 0) {
        console.log(`skip: ${user.email} already exists`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(user.password, 10);
      await db.execute(
        `INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, 'Active')`,
        [user.name, user.email, hashedPassword, user.role]
      );
      console.log(`created: ${user.email} / ${user.password} / ${user.role}`);
    } catch (error) {
      console.error(`error creating ${user.email}:`, error.message);
    }
  }
  process.exit(0);
}

createDemoUsers();

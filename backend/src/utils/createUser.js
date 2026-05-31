/**
 * One-time script to create a user
 * Run: node src/scripts/createUser.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function createUser() {
  try {
    const user = {
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'admin123',
      role: 'Admin'
    };

    // Check if user already exists
    const [existing] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [user.email]
    );

    if (existing.length > 0) {
      console.log('⚠️ User already exists with this email');
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(user.password, 10);

    // Insert user
    await db.execute(
      `INSERT INTO users (name, email, password, role)
       VALUES (?, ?, ?, ?)`,
      [user.name, user.email, hashedPassword, user.role]
    );

    console.log('✅ User created successfully');
    console.log('Email:', user.email);
    console.log('Password:', user.password);
    console.log('Role:', user.role);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    process.exit(1);
  }
}

createUser();

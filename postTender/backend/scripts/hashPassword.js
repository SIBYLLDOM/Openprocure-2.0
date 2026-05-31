// scripts/hashPassword.js
// Run this script to generate password hashes for database
// Usage: node scripts/hashPassword.js <password>

const bcrypt = require('bcryptjs');

const password = process.argv[2] || 'admin123';
const saltRounds = 10;

const hash = bcrypt.hashSync(password, saltRounds);

console.log('\n=================================');
console.log('Password Hash Generator');
console.log('=================================');
console.log(`Password: ${password}`);
console.log(`Hash: ${hash}`);
console.log('=================================\n');
console.log('Use this hash in your SQL INSERT statement:');
console.log(`INSERT INTO users (name, email, password, role) VALUES`);
console.log(`('User Name', 'email@example.com', '${hash}', 'Admin');`);
console.log('\n');

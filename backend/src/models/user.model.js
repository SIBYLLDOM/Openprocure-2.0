const db = require('../config/db');

const User = {
  findByEmail: async (email) => {
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE email = ? AND status = "Active"',
      [email]
    );
    return rows[0];
  },

  create: async (user) => {
    const { name, email, password, role } = user;
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, password, role]
    );
    return result.insertId;
  }
};

module.exports = User;

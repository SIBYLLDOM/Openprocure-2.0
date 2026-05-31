// src/models/user.model.js
const db = require('../config/db');

const User = {
    findByEmail: async (email) => {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM users WHERE email = ? AND status = "Active"',
                [email]
            );
            return rows[0];
        } catch (error) {
            console.error('Database error in findByEmail:', error);
            throw error;
        }
    },

    create: async (user) => {
        try {
            const { name, email, password, role } = user;
            const [result] = await db.execute(
                'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
                [name, email, password, role || 'Tender']
            );
            return result.insertId;
        } catch (error) {
            console.error('Database error in create:', error);
            throw error;
        }
    },

    findById: async (id) => {
        try {
            const [rows] = await db.execute(
                'SELECT id, name, email, role, status FROM users WHERE id = ?',
                [id]
            );
            return rows[0];
        } catch (error) {
            console.error('Database error in findById:', error);
            throw error;
        }
    }
};

module.exports = User;

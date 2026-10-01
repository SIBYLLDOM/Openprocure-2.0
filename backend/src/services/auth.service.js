const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const db = require('../config/db');

const login = async (email, password, rememberMe = false) => {
  const user = await User.findByEmail(email);
  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Invalid email or password');
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    {
      expiresIn: rememberMe ? '7d' : process.env.JWT_EXPIRES_IN
    }
  );

  // Both scoping axes: division (Endo/Diagno) and source (GEM/Open). The UI
  // uses these to hide tabs the user has no access to; the server enforces the
  // same limits independently (see utils/userScope.js).
  const [deptRows] = await db.query(
    `SELECT department, type FROM user_departments WHERE user_id = ?`,
    [user.id]
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departments: deptRows.filter(r => r.type === 'department').map(r => r.department),
      fields: deptRows.filter(r => r.type === 'field').map(r => r.department),
      states: deptRows.filter(r => r.type === 'state').map(r => r.department)
    }
  };
};

module.exports = { login };

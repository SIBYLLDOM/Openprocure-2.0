'use strict';
const db = require('../config/db');

/**
 * Restricts a route to a set of roles.
 *
 * The UI hides actions a role shouldn't have, but that is only cosmetic — the
 * endpoint has to enforce it too, or the action is a curl away. Reads the role
 * from the database rather than the JWT so a role change takes effect without
 * waiting for the user's token to expire.
 */
function requireRole(...allowed) {
  return async (req, res, next) => {
    try {
      const [[user]] = await db.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
      if (!user) return res.status(401).json({ success: false, message: 'User not found' });

      if (!allowed.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: `Your role (${user.role}) cannot perform this action.`,
        });
      }
      next();
    } catch (err) {
      console.error('requireRole:', err);
      res.status(500).json({ success: false, message: 'Failed to verify role' });
    }
  };
}

module.exports = requireRole;

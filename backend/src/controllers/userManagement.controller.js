const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { getUserScope, userScopeSql, findReporteeIds } = require('../utils/userScope');

// A Zonal Head may only view/manage the Sales users reporting to them (by
// working-state overlap, see findReporteeIds) — never other Zonal Heads or
// other roles. Returns null when unrestricted (not a Zonal Head).
async function zonalReporteeGuard(req) {
  const scope = await getUserScope(req.user.id);
  if (!scope.isZonalHead) return { scope, reporteeIds: null };
  const reporteeIds = await findReporteeIds(scope, req.user.id);
  return { scope, reporteeIds };
}

// GET /api/users  — list all users (monitor/Admin)
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role = '', status = '' } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push('(u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    // A Tender Admin only sees people in their own department (division AND
    // source). Admin sees everyone. A Zonal Head sees only their Sales
    // reportees (by covering-state overlap). See utils/userScope.js.
    const scope = await getUserScope(req.user.id);

    if (scope.isZonalHead) {
      const reporteeIds = await findReporteeIds(scope, req.user.id);
      conditions.push(reporteeIds.length ? `u.id IN (${reporteeIds.map(() => '?').join(',')})` : '1=0');
      params.push(...reporteeIds);
      conditions.push("u.role = 'Sales'");
    } else {
      if (role) { conditions.push('u.role = ?'); params.push(role); }
      const scoped = userScopeSql(scope, 'u.id');
      conditions.push(scoped.sql);
      params.push(...scoped.params);
    }
    if (status) { conditions.push('u.status = ?'); params.push(status); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
              MAX(h.logged_in_at) AS last_login,
              GROUP_CONCAT(DISTINCT CASE WHEN ud.type='department' THEN ud.department END ORDER BY ud.department SEPARATOR ',') AS departments_str,
              GROUP_CONCAT(DISTINCT CASE WHEN ud.type='field' THEN ud.department END ORDER BY ud.department SEPARATOR ',') AS fields_str,
              GROUP_CONCAT(DISTINCT CASE WHEN ud.type='state' THEN ud.department END ORDER BY ud.department SEPARATOR ',') AS states_str
       FROM users u
       LEFT JOIN user_login_history h ON h.user_id = u.id
       LEFT JOIN user_departments ud ON ud.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, +limit, +offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM users u ${where}`,
      params
    );

    const data = rows.map(r => ({
      ...r,
      departments: r.departments_str ? r.departments_str.split(',') : [],
      fields: r.fields_str ? r.fields_str.split(',') : [],
      states: r.states_str ? r.states_str.split(',') : [],
      departments_str: undefined,
      fields_str: undefined,
      states_str: undefined,
    }));

    res.json({ success: true, data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('getUsers:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

// POST /api/users  — create user (monitor/Admin)
const createUser = async (req, res) => {
  try {
    const { scope } = await zonalReporteeGuard(req);
    if (scope.isZonalHead) {
      return res.status(403).json({ success: false, message: 'Zonal Head cannot create users' });
    }

    const { name, email, password, role = 'Tender Admin', departments = [], fields = [], states = [] } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email and password are required' });
    }
    const [[existing]] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    // Same guard as the public registration form — stops an admin from unknowingly
    // creating a second account for someone who already has one under another email.
    const [[nameDup]] = await db.query(
      'SELECT id, email FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
      [name]
    );
    if (nameDup) {
      return res.status(409).json({
        success: false,
        message: `An account already exists for "${name}" (${nameDup.email}). ` +
          `Edit that account instead of creating a new one.`,
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashed, role, 'Active']
    );

    const deptRows = [
      ...departments.map(d => [result.insertId, d, 'department']),
      ...fields.map(f => [result.insertId, f, 'field']),
      ...states.map(st => [result.insertId, st, 'state']),
    ];
    if (deptRows.length) {
      await db.query('INSERT INTO user_departments (user_id, department, type) VALUES ?', [deptRows]);
    }

    res.status(201).json({ success: true, message: 'User created', id: result.insertId });
  } catch (err) {
    console.error('createUser:', err);
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
};

// PUT /api/users/:id  — update user (monitor/Admin)
const updateUser = async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    const { reporteeIds } = await zonalReporteeGuard(req);
    if (reporteeIds && !reporteeIds.includes(+id)) {
      return res.status(403).json({ success: false, message: 'Not one of your covering-state Sales users' });
    }

    const { name, email, role, status, departments, fields: userFields, states } = req.body;
    // A Zonal Head can only manage Sales users, so they may not reassign role.
    const allowRole = reporteeIds ? undefined : role;
    const setCols = [];
    const vals = [];
    if (name)   { setCols.push('name = ?');   vals.push(name); }
    if (email)  { setCols.push('email = ?');  vals.push(email); }
    if (allowRole) { setCols.push('role = ?'); vals.push(allowRole); }
    if (status) { setCols.push('status = ?'); vals.push(status); }

    if (!setCols.length && departments === undefined && userFields === undefined && states === undefined) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    // (user_id, department, type) is unique — a duplicate in any of these
    // arrays (stale UI state, a resubmitted double-click, etc.) used to blow
    // up the bulk INSERT with a 500 after the matching DELETE had *already*
    // committed, silently wiping that person's real assignments. Dedupe here
    // so a duplicate is just harmlessly collapsed instead of fatal, and run
    // the whole update in one transaction so a genuine failure rolls back
    // cleanly instead of leaving the delete applied without its insert.
    conn = await db.getConnection();
    await conn.beginTransaction();

    if (setCols.length) {
      vals.push(id);
      await conn.query(`UPDATE users SET ${setCols.join(', ')} WHERE id = ?`, vals);
    }

    const replaceType = async (type, values) => {
      if (values === undefined) return;
      await conn.query('DELETE FROM user_departments WHERE user_id = ? AND type = ?', [id, type]);
      const unique = [...new Set(values)];
      if (unique.length) {
        const rows = unique.map((v) => [+id, v, type]);
        await conn.query('INSERT INTO user_departments (user_id, department, type) VALUES ?', [rows]);
      }
    };
    await replaceType('department', departments);
    await replaceType('field', userFields);
    await replaceType('state', states);

    await conn.commit();
    res.json({ success: true, message: 'User updated' });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('updateUser:', err);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  } finally {
    if (conn) conn.release();
  }
};

// PUT /api/users/:id/reset-password  — admin/monitor reset password
const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { reporteeIds } = await zonalReporteeGuard(req);
    if (reporteeIds && !reporteeIds.includes(+id)) {
      return res.status(403).json({ success: false, message: 'Not one of your covering-state Sales users' });
    }
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, id]);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('resetUserPassword:', err);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
};

// POST /api/users/:id/reset-link  — admin generates a 24h self-service reset
// link without needing outbound email (SMTP was down when this was added —
// the admin shares the link out-of-band, e.g. WhatsApp, instead). Reuses
// the exact same token table/redemption path as the emailed forgot-password
// flow (auth.controller.js createResetLink/resetPassword) — just minted
// directly instead of via email.
const generateResetLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { reporteeIds } = await zonalReporteeGuard(req);
    if (reporteeIds && !reporteeIds.includes(+id)) {
      return res.status(403).json({ success: false, message: 'Not one of your covering-state Sales users' });
    }
    const [[user]] = await db.query('SELECT id, name, email FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { createResetLink } = require('./auth.controller');
    const { link, expiresAt } = await createResetLink(user.id);

    res.json({ success: true, link, expiresAt, name: user.name, email: user.email });
  } catch (err) {
    console.error('generateResetLink:', err);
    res.status(500).json({ success: false, message: 'Failed to generate reset link' });
  }
};

// DELETE /api/users/:id  — deactivate user
const deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (+id === req.user.id) return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' });
    const { reporteeIds } = await zonalReporteeGuard(req);
    if (reporteeIds && !reporteeIds.includes(+id)) {
      return res.status(403).json({ success: false, message: 'Not one of your covering-state Sales users' });
    }
    await db.query("UPDATE users SET status = 'Inactive' WHERE id = ?", [id]);
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    console.error('deactivateUser:', err);
    res.status(500).json({ success: false, message: 'Failed to deactivate user' });
  }
};

// DELETE /api/users/:id/permanent  — Admin-only, irreversible account removal.
// Only user_departments is cleaned up (meaningless once the account is gone);
// everything else the account ever touched — login history, approvals they
// raised or decided, tenders they marked — is left alone as historical
// record, the same way the rest of the app treats a deleted actor.
const deleteUserPermanently = async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only Admins can permanently delete accounts' });
    }
    const { id } = req.params;
    if (+id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    const [[target]] = await db.query('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    if (target.role === 'Admin') {
      const [[{ c }]] = await db.query("SELECT COUNT(*) AS c FROM users WHERE role = 'Admin' AND status = 'Active'");
      if (c <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete the last remaining Admin' });
      }
    }

    await db.query('DELETE FROM user_departments WHERE user_id = ?', [id]);
    await db.query('DELETE FROM users WHERE id = ?', [id]);

    res.json({ success: true, message: 'User permanently deleted' });
  } catch (err) {
    console.error('deleteUserPermanently:', err);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};

// PUT /api/users/me/profile  — self-service name/email change
const updateMyProfile = async (req, res) => {
  try {
    const { name, email, currentPassword } = req.body;
    const userId = req.user.id;

    if (email) {
      // Require current password to change email
      if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password required to change email' });
      const [[user]] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
      const ok = await bcrypt.compare(currentPassword, user.password);
      if (!ok) return res.status(401).json({ success: false, message: 'Incorrect current password' });

      const [[existing]] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
      if (existing) return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    const fields = [];
    const vals = [];
    if (name)  { fields.push('name = ?');  vals.push(name); }
    if (email) { fields.push('email = ?'); vals.push(email); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'Nothing to update' });

    vals.push(userId);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);

    const [[updated]] = await db.query('SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
    res.json({ success: true, message: 'Profile updated', user: updated });
  } catch (err) {
    console.error('updateMyProfile:', err);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

// PUT /api/users/me/password  — self-service password change
const changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const [[user]] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('changeMyPassword:', err);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

// GET /api/users/me  — get own profile
const getMyProfile = async (req, res) => {
  try {
    const [[user]] = await db.query(
      'SELECT id, name, email, role, status, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};

module.exports = {
  getUsers, createUser, updateUser, resetUserPassword, generateResetLink,
  deactivateUser, deleteUserPermanently, updateMyProfile, changeMyPassword, getMyProfile,
};

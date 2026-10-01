const { login } = require('../services/auth.service');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/user.model');
const db = require('../config/db');
const { sendMail, layout } = require('../utils/mailer');

const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const APP_URL = process.env.APP_URL || 'https://openprocure.ai';

/** Mints a 24h reset token for a user and returns the full reset link.
 * Shared by the public forgot-password flow and the admin generate-link
 * endpoint — same table, same expiry, same redemption path either way. */
async function createResetLink(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await db.query(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
    [userId, token, expiresAt]
  );
  return { token, expiresAt, link: `${APP_URL}/reset-password?token=${token}` };
}

const loginUser = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const data = await login(email, password, rememberMe);

    // Record login history
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
    const ua = req.headers['user-agent'] || null;
    const [histResult] = await db.query(
      'INSERT INTO user_login_history (user_id, email, role, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
      [data.user.id, data.user.email, data.user.role, ip, ua]
    );
    const loginHistoryId = histResult.insertId;

    // Create session record
    const [sessResult] = await db.query(
      'INSERT INTO user_sessions (user_id, login_history_id) VALUES (?, ?)',
      [data.user.id, loginHistoryId]
    );

    res.json({ ...data, sessionId: sessResult.insertId });
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

/* Forgot password — mints a real 24h reset token and emails the link.
 * Always responds with the same generic message regardless of whether the
 * email exists, so this endpoint can't be used to enumerate accounts. */
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const [[user]] = await db.query('SELECT id, name FROM users WHERE email = ?', [email]);
    if (user) {
      const { link } = await createResetLink(user.id);
      await sendMail({
        to: email,
        subject: 'Reset your OpenProcure password',
        html: layout({
          heading: 'Reset your password',
          intro: `Hi ${user.name}, click below to set a new password. This link expires in 24 hours.`,
          ctaLabel: 'Reset Password',
          ctaUrl: link,
          footer: "If you didn't request this, you can ignore this email.",
        }),
      });
    }
  } catch (err) {
    console.error('forgotPassword:', err);
    // Fall through to the generic response regardless — never reveal failure detail.
  }

  res.json({
    message: 'If that email is registered, password reset instructions have been sent.'
  });
};

/* POST /api/auth/reset-password — { token, newPassword } */
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: 'Token and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  try {
    const [[row]] = await db.query(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = ?',
      [token]
    );
    if (!row) {
      return res.status(400).json({ success: false, message: 'Invalid or unknown reset link' });
    }
    if (row.used_at) {
      return res.status(400).json({ success: false, message: 'This reset link has already been used' });
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'This reset link has expired — request a new one' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, row.user_id]);
    await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [row.id]);

    res.json({ success: true, message: 'Password updated — you can log in now.' });
  } catch (err) {
    console.error('resetPassword:', err);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
};

/** GET /api/auth/reset-password/verify?token=... — used by the frontend page
 * to check the link is still valid before showing the "set new password"
 * form, so a dead link shows a clear message instead of a form that fails
 * on submit. */
const verifyResetToken = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ valid: false, message: 'No token provided' });

  const [[row]] = await db.query(
    `SELECT prt.expires_at, prt.used_at, u.email
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token = ?`,
    [token]
  );
  if (!row) return res.json({ valid: false, message: 'Invalid or unknown reset link' });
  if (row.used_at) return res.json({ valid: false, message: 'This reset link has already been used' });
  if (new Date(row.expires_at) < new Date()) {
    return res.json({ valid: false, message: 'This reset link has expired — request a new one' });
  }
  // Included so the reset page can show/confirm which account this link
  // belongs to — the reset itself is still authorized purely by the token.
  res.json({ valid: true, email: row.email });
};

/* Register new user */
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, states = [], departments = [], fields = [] } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    // Sales AND Zonal Head are both state/department/field-scoped (see
    // utils/userScope.js's isStateScoped) — without these an account sees
    // nothing at all, so require them up front rather than silently
    // creating a locked-out account.
    const isScopedRole = role === 'Sales' || role === 'Zonal Head';
    if (isScopedRole && (!Array.isArray(states) || !states.length)) {
      return res.status(400).json({ message: 'Select at least one state you cover' });
    }
    if (isScopedRole && (!Array.isArray(departments) || !departments.length)) {
      return res.status(400).json({ message: 'Select at least one department (Endo/Diagno/360) you cover' });
    }
    if (isScopedRole && (!Array.isArray(fields) || !fields.length)) {
      return res.status(400).json({ message: 'Select at least one field (GEM/Open) you cover' });
    }

    // Check if email already exists — any status, not just Active.
    // User.findByEmail filters to status='Active' (right for login, wrong
    // here): an email belonging to a since-deactivated account would pass
    // this check, then crash uncaught on the INSERT's UNIQUE constraint a
    // few lines down, surfacing to the user as a bare "server error" instead
    // of the clear "already registered" message this is meant to give.
    const [[existingAnyStatus]] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingAnyStatus) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // A mistyped email on a first registration attempt used to just create a second,
    // orphaned account under the retry email instead of surfacing the existing one —
    // same person, two logins, duplicate rows in every list that shows users. Catch
    // that here by name (case/whitespace-insensitive) before it happens again.
    const [[nameDup]] = await db.query(
      'SELECT id, email FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
      [name]
    );
    if (nameDup) {
      return res.status(409).json({
        message: `An account already exists for "${name}" (${nameDup.email}). ` +
          `Sign in with that account, use "Forgot password" if needed, or contact your admin — ` +
          `don't register a new one.`,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await User.create({ name, email, password: hashedPassword, role });

    if (isScopedRole) {
      const rows = [
        ...states.map(s => [userId, s, 'state']),
        ...departments.map(d => [userId, d, 'department']),
        ...fields.map(f => [userId, f, 'field']),
      ];
      if (rows.length) {
        await db.query('INSERT INTO user_departments (user_id, department, type) VALUES ?', [rows]);
      }
    }

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
};


/**
 * GET /api/auth/me
 * Returns the caller's live role and department scope. The client must not
 * rely on the copy cached in localStorage at login: an Admin can change a
 * user's departments mid-session, and older sessions predate the `fields`
 * value entirely. See utils/userScope.js.
 */
const getMe = async (req, res) => {
  try {
    const [[user]] = await db.query(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const [rows] = await db.query(
      'SELECT department, type FROM user_departments WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      user: {
        ...user,
        departments: rows.filter(r => r.type === 'department').map(r => r.department),
        fields: rows.filter(r => r.type === 'field').map(r => r.department),
        states: rows.filter(r => r.type === 'state').map(r => r.department),
      },
    });
  } catch (err) {
    console.error('getMe:', err);
    res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
};

module.exports = {
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
  verifyResetToken,
  createResetLink,
  registerUser
};
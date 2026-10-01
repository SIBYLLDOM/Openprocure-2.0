const db = require('../config/db');
const { getUserScope, userScopeSql } = require('../utils/userScope');

// GET /api/monitoring/dashboard
const getDashboard = async (req, res) => {
  try {
    // Tender Admins only monitor people in their own department; Admin sees
    // everyone. Applied to every per-user list below. See utils/userScope.js.
    const scope = await getUserScope(req.user.id);
    const forUsers = userScopeSql(scope, 'u.id');
    const forHistory = userScopeSql(scope, 'h.user_id');
    const forSessions = userScopeSql(scope, 's.user_id');
    // Date filter for login history table (defaults to current month)
    const { from, to } = req.query;
    const dateFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const dateTo   = to   || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

    const [[activeNow]] = await db.query(
      `SELECT COUNT(*) AS count FROM user_sessions s WHERE s.is_active = 1
       AND s.last_heartbeat_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE) AND ${forSessions.sql}`,
      forSessions.params
    );
    const [[loginsToday]] = await db.query(
      `SELECT COUNT(*) AS count FROM user_login_history h
       WHERE DATE(h.logged_in_at) = CURDATE() AND ${forHistory.sql}`,
      forHistory.params
    );
    const [[loginsWeek]] = await db.query(
      `SELECT COUNT(*) AS count FROM user_login_history h
       WHERE h.logged_in_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND ${forHistory.sql}`,
      forHistory.params
    );
    const [[avgSession]] = await db.query(
      `SELECT AVG(s.total_active_seconds) AS avg_seconds FROM user_sessions s
       WHERE s.total_active_seconds > 0 AND ${forSessions.sql}`,
      forSessions.params
    );
    const [ticketStats] = await db.query(
      "SELECT status, COUNT(*) AS count FROM support_tickets GROUP BY status"
    );

    // Per-user activity: last login overall + today's first login time
    const [userActivity] = await db.query(`
      SELECT u.id, u.name, u.email, u.role,
             MAX(h.logged_in_at) AS last_login,
             MAX(CASE WHEN DATE(h.logged_in_at) = CURDATE() THEN h.logged_in_at ELSE NULL END) AS today_login_time
      FROM users u
      LEFT JOIN user_login_history h ON h.user_id = u.id
      WHERE ${forUsers.sql}
      GROUP BY u.id
      ORDER BY last_login DESC
      LIMIT 1000
    `, forUsers.params);

    // Login history filtered by date range
    const [recentLogins] = await db.query(
      `SELECT h.id, h.user_id, u.name, h.email, h.role, h.ip_address,
              h.logged_in_at, h.logged_out_at,
              TIMESTAMPDIFF(SECOND, h.logged_in_at, IFNULL(h.logged_out_at, NOW())) AS duration_seconds
       FROM user_login_history h
       LEFT JOIN users u ON u.id = h.user_id
       WHERE h.logged_in_at >= ? AND h.logged_in_at <= DATE_ADD(?, INTERVAL 1 DAY)
         AND ${forHistory.sql}
       ORDER BY h.logged_in_at DESC
       LIMIT 200`,
      [dateFrom, dateTo, ...forHistory.params]
    );

    const tickets = {};
    for (const row of ticketStats) tickets[row.status] = row.count;

    res.json({
      success: true,
      stats: {
        activeNow: activeNow.count,
        loginsToday: loginsToday.count,
        loginsWeek: loginsWeek.count,
        avgSessionMinutes: Math.round((avgSession.avg_seconds || 0) / 60),
      },
      ticketStats: tickets,
      userActivity,
      recentLogins,
      filter: { from: dateFrom, to: dateTo },
    });
  } catch (err) {
    console.error('getDashboard:', err);
    res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
};

// GET /api/monitoring/login-history
const getLoginHistory = async (req, res) => {
  try {
    const { page = 1, limit = 30, userId, from, to } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (userId) { conditions.push('h.user_id = ?'); params.push(userId); }
    if (from)   { conditions.push('h.logged_in_at >= ?'); params.push(from); }
    if (to)     { conditions.push('h.logged_in_at <= ?'); params.push(to); }

    const scope = await getUserScope(req.user.id);
    const scoped = userScopeSql(scope, 'h.user_id');
    conditions.push(scoped.sql);
    params.push(...scoped.params);

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT h.id, h.user_id, u.name, h.email, h.role, h.ip_address, h.user_agent,
              h.logged_in_at, h.logged_out_at,
              TIMESTAMPDIFF(SECOND, h.logged_in_at, IFNULL(h.logged_out_at, NOW())) AS duration_seconds
       FROM user_login_history h
       LEFT JOIN users u ON u.id = h.user_id
       ${where}
       ORDER BY h.logged_in_at DESC
       LIMIT ? OFFSET ?`,
      [...params, +limit, +offset]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM user_login_history h ${where}`, params
    );

    res.json({ success: true, data: rows, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('getLoginHistory:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch login history' });
  }
};

// GET /api/monitoring/sessions
const getSessions = async (req, res) => {
  try {
    const { page = 1, limit = 30, userId } = req.query;
    const offset = (page - 1) * limit;
    const conditions = userId ? ['s.user_id = ?'] : [];
    const params = userId ? [userId] : [];

    const scope = await getUserScope(req.user.id);
    const scoped = userScopeSql(scope, 's.user_id');
    conditions.push(scoped.sql);
    params.push(...scoped.params);

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT s.id, s.user_id, u.name, u.email, s.started_at,
              s.last_heartbeat_at, s.total_active_seconds, s.is_active
       FROM user_sessions s
       LEFT JOIN users u ON u.id = s.user_id
       ${where}
       ORDER BY s.started_at DESC
       LIMIT ? OFFSET ?`,
      [...params, +limit, +offset]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM user_sessions s ${where}`, params
    );

    res.json({ success: true, data: rows, total, page: +page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('getSessions:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch sessions' });
  }
};

// POST /api/monitoring/session/heartbeat
const heartbeat = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId required' });

    await db.query(
      'UPDATE user_sessions SET last_heartbeat_at = NOW(), total_active_seconds = total_active_seconds + 30 WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('heartbeat:', err);
    res.status(500).json({ success: false, message: 'Heartbeat failed' });
  }
};

// POST /api/monitoring/session/end
const endSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId required' });

    // Mark session inactive
    await db.query(
      'UPDATE user_sessions SET is_active = 0 WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );

    // Update logout time in login_history
    await db.query(
      `UPDATE user_login_history h
       JOIN user_sessions s ON s.login_history_id = h.id
       SET h.logged_out_at = NOW()
       WHERE s.id = ? AND s.user_id = ?`,
      [sessionId, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('endSession:', err);
    res.status(500).json({ success: false, message: 'Failed to end session' });
  }
};

module.exports = { getDashboard, getLoginHistory, getSessions, heartbeat, endSession };

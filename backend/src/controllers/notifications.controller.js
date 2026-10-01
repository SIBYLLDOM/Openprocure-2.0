'use strict';
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const hub = require('../utils/notificationHub');

// GET /api/notifications?unread=1&limit=30
const list = async (req, res) => {
  try {
    const { unread = '', limit = 30 } = req.query;
    const conditions = ['user_id = ?'];
    const params = [req.user.id];
    if (unread === '1' || unread === 'true') conditions.push('is_read = 0');

    const [rows] = await db.query(
      `SELECT id, type, title, body, link, ref_type, ref_id, is_read, created_at
       FROM notifications
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [...params, Number(limit) || 30]
    );

    const [[{ unread_count }]] = await db.query(
      'SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );

    res.json({ success: true, data: rows, unread_count });
  } catch (err) {
    console.error('notifications.list:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

// PATCH /api/notifications/:id/read
const markRead = async (req, res) => {
  try {
    // Scoped to the caller so one user cannot mark another's notifications.
    const [result] = await db.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('notifications.markRead:', err);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
};

// PATCH /api/notifications/read-all
const markAllRead = async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ success: true, updated: result.affectedRows });
  } catch (err) {
    console.error('notifications.markAllRead:', err);
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
};


/**
 * GET /api/notifications/stream?token=<jwt>
 *
 * Server-sent events, so a new notification appears immediately instead of on
 * the next poll. The token travels as a query param because EventSource cannot
 * set an Authorization header — it is verified here exactly as the auth
 * middleware would, and the route is deliberately NOT behind that middleware.
 */
const stream = async (req, res) => {
  let user;
  try {
    user = jwt.verify(req.query.token || '', process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // don't let a proxy buffer the stream
  });
  res.write('retry: 5000\n\n');           // client reconnect delay
  res.write('event: ready\ndata: {}\n\n');

  const unsubscribe = hub.subscribe(Number(user.id), res);

  // Comment frames keep the connection alive through idle-timeout proxies.
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* closed */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
};

module.exports = { list, markRead, markAllRead, stream };

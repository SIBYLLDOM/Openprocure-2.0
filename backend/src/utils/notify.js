'use strict';
const db = require('../config/db');
const { sendMail, layout } = require('./mailer');
const hub = require('./notificationHub');

/**
 * Creates in-app notifications and sends the matching email.
 *
 * Both happen together so a caller cannot accidentally do one without the
 * other. Delivery is best-effort and never throws: a notification is a side
 * effect of some other action (raising an approval request, deciding one) and
 * must never fail that action. Email outcome is recorded on the row via
 * emailed_at / email_error.
 *
 * The app URL used for links comes from APP_URL in .env, defaulting to the
 * local dev frontend.
 */
const APP_URL = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

/**
 * @param {Array<{id:number,email:string,name:string}>} recipients
 * @param {{type,title,body,link,refType,refId,emailRows,ctaLabel}} payload
 */
async function notifyUsers(recipients, payload) {
  const people = (recipients || []).filter(r => r && r.id);
  if (!people.length) return { created: 0, emailed: 0 };

  const {
    type, title, body = null, link = null,
    refType = null, refId = null,
    emailRows = [], ctaLabel = 'Open in OpenProcure',
    emailSubject,
  } = payload;

  const url = link ? `${APP_URL()}${link}` : null;
  let emailed = 0;

  for (const person of people) {
    let notificationId = null;
    try {
      const [res] = await db.query(
        `INSERT INTO notifications (user_id, type, title, body, link, ref_type, ref_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [person.id, type, title, body, link, refType, refId]
      );
      notificationId = res.insertId;
    } catch (err) {
      console.error('[notify] failed to store notification:', err.message);
      continue; // without a stored row there is nothing to deliver
    }

    // Push over SSE straight away so an open tab updates without waiting for
    // the next poll. No-op when the user has no connection open.
    hub.publish(person.id, {
      id: notificationId, type, title, body, link,
      ref_type: refType, ref_id: refId, is_read: 0,
      created_at: new Date().toISOString(),
    });

    const html = layout({
      heading: title,
      intro: body ? `Hi ${person.name || 'there'},<br/>${body}` : `Hi ${person.name || 'there'},`,
      rows: emailRows,
      ctaLabel,
      ctaUrl: url,
    });

    const { ok, error } = await sendMail({
      to: person.email,
      subject: emailSubject || title,
      html,
    });

    if (ok) {
      emailed += 1;
      await db.query('UPDATE notifications SET emailed_at = NOW() WHERE id = ?', [notificationId]);
    } else {
      await db.query('UPDATE notifications SET email_error = ? WHERE id = ?', [error, notificationId]);
    }
  }

  return { created: people.length, emailed };
}

/**
 * Resolves the Tender Admins who can act on a request from the given
 * department — the same division AND source rule used everywhere else
 * (see utils/userScope.js). Admins are included as a fallback so a request
 * from a department with no Tender Admin still reaches somebody.
 */
async function findApprovers(division, source) {
  const [rows] = await db.query(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM users u
     WHERE u.status = 'Active'
       AND u.role IN ('Tender Admin','Office Administrator')
       AND EXISTS (SELECT 1 FROM user_departments d
                   WHERE d.user_id = u.id AND d.type = 'department' AND d.department = ?)
       AND EXISTS (SELECT 1 FROM user_departments d
                   WHERE d.user_id = u.id AND d.type = 'field' AND d.department = ?)`,
    [division, source]
  );
  if (rows.length) return rows;

  const [admins] = await db.query(
    "SELECT id, name, email FROM users WHERE role = 'Admin' AND status = 'Active'"
  );
  return admins;
}

async function findUser(userId) {
  const [[row]] = await db.query('SELECT id, name, email FROM users WHERE id = ?', [userId]);
  return row || null;
}

module.exports = { notifyUsers, findApprovers, findUser, APP_URL };

/**
 * In-app notifications.
 *
 * One row per (recipient, event). Email is sent alongside the row by
 * utils/notify.js — `emailed_at` records whether that succeeded, so a failed
 * SMTP call never loses the in-app notification and can be retried/audited.
 *
 * `link` is a frontend path the bell menu navigates to (e.g. /Admin/approvals).
 *
 * NOTE: `users` is MyISAM here, so no foreign keys — user_id is a plain int,
 * matching user_departments and approval_requests.
 */
const db = require('../config/db');

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,
      type        VARCHAR(50) NOT NULL,
      title       VARCHAR(255) NOT NULL,
      body        TEXT NULL,
      link        VARCHAR(255) NULL,
      ref_type    VARCHAR(50) NULL,
      ref_id      VARCHAR(255) NULL,
      is_read     TINYINT(1) NOT NULL DEFAULT 0,
      emailed_at  DATETIME NULL,
      email_error VARCHAR(255) NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_unread (user_id, is_read),
      INDEX idx_created (created_at)
    )
  `);
  console.log('✓ notifications table created (or already exists)');
}

module.exports = { up };

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

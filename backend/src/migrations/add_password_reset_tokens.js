/**
 * Self-service password reset via a one-time link.
 *
 * `forgotPassword` (public, email-triggered) and the admin
 * generate-reset-link endpoint both mint a row here. `token` is a random
 * 32-byte hex string — long enough that guessing is not a practical attack.
 * `expires_at` is set 24h out at creation; `used_at` is stamped the moment
 * the token is redeemed so a link can never be replayed twice.
 *
 * NOTE: `users` is MyISAM here, so no foreign keys — user_id is a plain int,
 * matching notifications/user_departments/approval_requests.
 */
const db = require('../config/db');

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,
      token       VARCHAR(64) NOT NULL UNIQUE,
      expires_at  DATETIME NOT NULL,
      used_at     DATETIME NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id)
    )
  `);
  console.log('✓ password_reset_tokens table created (or already exists)');
}

module.exports = { up };

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

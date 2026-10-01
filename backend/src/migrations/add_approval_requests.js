/**
 * Approval workflow for the Tender Executive role.
 *
 * A Tender Executive can browse every tender, but three actions need sign-off
 * from a Tender Admin in their own department:
 *   tender_proceed  — marking a tender as 'proceed'
 *   representation  — finalising a generated representation
 *   document        — finalising a generated document
 *
 * Requests are routed by matching the requester's division AND source against
 * the approver's assignment (see utils/userScope.js) — there is no explicit
 * manager link. The division/source are snapshotted onto the row so that a
 * later change to the requester's assignment cannot silently re-route or hide
 * a pending request.
 *
 * NOTE: `users` is MyISAM in this schema, so foreign keys are unavailable.
 * requested_by / decided_by are plain int columns, matching user_departments.
 */
const db = require('../config/db');

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      type          ENUM('tender_proceed','representation','document') NOT NULL,
      bid_number    VARCHAR(255) NOT NULL,
      reference     VARCHAR(255) NULL,
      payload       JSON NULL,
      requested_by  INT NOT NULL,
      division      VARCHAR(50) NULL,
      source        VARCHAR(50) NULL,
      status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      remarks       TEXT NULL,
      decision_note TEXT NULL,
      decided_by    INT NULL,
      decided_at    DATETIME NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_bid (bid_number),
      INDEX idx_requester (requested_by)
    )
  `);
  console.log('✓ approval_requests table created (or already exists)');

  // await db.query(
  //   "ALTER TABLE users MODIFY COLUMN role ENUM('Admin','Tender Admin','Tender Executive') NOT NULL DEFAULT 'Tender Executive'"
  // );
  console.log('· users.role modification skipped to prevent truncation');
}

module.exports = { up };

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

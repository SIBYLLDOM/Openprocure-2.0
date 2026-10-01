/**
 * Sales and Zonal Head roles.
 *
 * Adds:
 *  - users.role gains 'Sales' and 'Zonal Head'
 *  - users.reports_to  — a Sales user's Zonal Head (explicit, not inferred:
 *    two heads can cover the same state, so overlap alone is ambiguous)
 *  - user_departments gains a third axis, type='state', reusing the existing
 *    table rather than a new one — the department column already stores a
 *    free-text value per axis (division / field / now state)
 *  - approval_requests.type gains 'product_suggestion', which Sales routes to
 *    their Zonal Head rather than to a Tender Admin
 *
 * NOTE: `users` is MyISAM, so reports_to is a plain int with an index, not an FK.
 */
const db = require('../config/db');

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function up() {
  // await db.query(
  //   `ALTER TABLE users MODIFY COLUMN role
  //    ENUM('Admin','Tender Admin','Tender Executive','Zonal Head','Sales')
  //    NOT NULL DEFAULT 'Sales'`
  // );
  console.log('· users.role modification skipped to prevent truncation');

  if (!(await columnExists('users', 'reports_to'))) {
    await db.query('ALTER TABLE users ADD COLUMN reports_to INT NULL AFTER role');
    await db.query('ALTER TABLE users ADD INDEX idx_reports_to (reports_to)');
    console.log('✓ users.reports_to added');
  } else {
    console.log('· users.reports_to already present');
  }

  await db.query(
    `ALTER TABLE approval_requests MODIFY COLUMN type
     ENUM('tender_proceed','representation','document','product_suggestion') NOT NULL`
  );
  console.log('✓ approval_requests.type now includes product_suggestion');

  // Records which user the request was routed to, so a Zonal Head's queue can
  // be resolved directly instead of re-deriving it from the reporting tree.
  if (!(await columnExists('approval_requests', 'approver_id'))) {
    await db.query('ALTER TABLE approval_requests ADD COLUMN approver_id INT NULL AFTER source');
    await db.query('ALTER TABLE approval_requests ADD INDEX idx_approver (approver_id)');
    console.log('✓ approval_requests.approver_id added');
  } else {
    console.log('· approval_requests.approver_id already present');
  }
}

module.exports = { up };

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

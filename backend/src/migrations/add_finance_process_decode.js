/**
 * Finance Team role + the Process Decode approval chain.
 *
 * Process Decode is the first request with more than one decision point:
 *
 *   Sales submits       -> stage 'zonal_head' -> stage 'finance' -> done
 *   Zonal Head submits  -> stage 'finance'                       -> done
 *
 * A request therefore stays `pending` after the Zonal Head approves; only the
 * stage moves. `stage_history` keeps each decision so the trail is not lost
 * when decided_by/decided_at are overwritten by the next approver.
 *
 * Finance Team sees every request in the system, of every type and status.
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
  //    ENUM('Admin','Tender Admin','Tender Executive','Zonal Head','Sales','Finance Team')
  //    NOT NULL DEFAULT 'Sales'`
  // );
  console.log('· users.role modification skipped to prevent truncation');

  await db.query(
    `ALTER TABLE approval_requests MODIFY COLUMN type
     ENUM('tender_proceed','representation','document','product_suggestion','process_decode') NOT NULL`
  );
  console.log('✓ approval_requests.type now includes process_decode');

  if (!(await columnExists('approval_requests', 'stage'))) {
    await db.query(
      `ALTER TABLE approval_requests
       ADD COLUMN stage ENUM('zonal_head','finance','tender_admin') NULL AFTER status`
    );
    await db.query('ALTER TABLE approval_requests ADD INDEX idx_stage (stage)');
    console.log('✓ approval_requests.stage added');
  } else {
    console.log('· approval_requests.stage already present');
  }

  if (!(await columnExists('approval_requests', 'stage_history'))) {
    await db.query('ALTER TABLE approval_requests ADD COLUMN stage_history JSON NULL AFTER stage');
    console.log('✓ approval_requests.stage_history added');
  } else {
    console.log('· approval_requests.stage_history already present');
  }
}

module.exports = { up };

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

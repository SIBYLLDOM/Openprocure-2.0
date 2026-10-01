/**
 * Acknowledgement of approver-modified sheets.
 *
 * If Finance approves a Process Decode sheet exactly as submitted, nothing more
 * is needed. If they change the rates and then approve, the people who own the
 * numbers — the submitting Sales user and the Zonal Head who signed it off —
 * have to see and acknowledge what changed.
 *
 *   approver_modified : set the moment someone other than the requester edits
 *                       the payload, so the decision knows whether it changed.
 *   ack_required      : set on approval when approver_modified is true.
 *   acknowledgements  : [{ user_id, name, at }] — append-only.
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
  const adds = [
    ['approver_modified', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['ack_required', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['acknowledgements', 'JSON NULL'],
  ];
  for (const [col, type] of adds) {
    if (await columnExists('approval_requests', col)) {
      console.log(`· approval_requests.${col} already present`);
      continue;
    }
    await db.query(`ALTER TABLE approval_requests ADD COLUMN ${col} ${type}`);
    console.log(`✓ approval_requests.${col} added`);
  }
}

module.exports = { up };

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

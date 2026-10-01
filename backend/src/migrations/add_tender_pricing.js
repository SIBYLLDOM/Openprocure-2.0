/**
 * Finance pricing (modules 2–5).
 *
 * A pricing sheet is created per tender by the Finance Team, seeded from the
 * approved Process Decode sheet so the item list, quantities and dealer rates
 * carry straight over instead of being re-keyed.
 *
 * Two tables rather than one JSON blob, because pricing is queried per line for
 * the margin/L1 reports later (modules 11–14) and needs a real audit trail.
 *
 * Money is DECIMAL, never FLOAT — binary floats cannot represent 0.1 exactly
 * and these values are quoted to customers.
 *
 * NOTE: `users` is MyISAM here, so no foreign keys (see add_approval_requests).
 */
const db = require('../config/db');

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tender_pricing (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      bid_number     VARCHAR(255) NOT NULL,
      source_request INT NULL,            -- approval_requests.id of the decode sheet
      participation  ENUM('direct','distributor') NULL,
      distributor_id INT NULL,
      status         ENUM('draft','pending_approval','approved','rejected') NOT NULL DEFAULT 'draft',
      freight        DECIMAL(14,2) NOT NULL DEFAULT 0,
      other_charges  DECIMAL(14,2) NOT NULL DEFAULT 0,
      discount_pct   DECIMAL(6,3)  NOT NULL DEFAULT 0,
      l1_target      DECIMAL(14,2) NULL,   -- price we believe wins
      remarks        TEXT NULL,
      created_by     INT NULL,
      updated_by     INT NULL,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_bid (bid_number),
      INDEX idx_status (status)
    )
  `);
  console.log('✓ tender_pricing created (or already exists)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS tender_pricing_lines (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      pricing_id    INT NOT NULL,
      line_no       INT NOT NULL,
      item_key      VARCHAR(50) NULL,      -- item_1 … from the decode sheet
      item_name     VARCHAR(500) NULL,
      product_code  VARCHAR(120) NULL,
      specification TEXT NULL,
      qty           DECIMAL(14,3) NOT NULL DEFAULT 0,
      basic_price   DECIMAL(14,2) NOT NULL DEFAULT 0,  -- per unit, excl. GST
      gst_pct       DECIMAL(6,3)  NOT NULL DEFAULT 0,
      discount_pct  DECIMAL(6,3)  NOT NULL DEFAULT 0,
      landed_cost   DECIMAL(14,2) NOT NULL DEFAULT 0,  -- per unit cost to us
      remarks       VARCHAR(500) NULL,
      INDEX idx_pricing (pricing_id)
    )
  `);
  console.log('✓ tender_pricing_lines created (or already exists)');

  // Module 15 — who changed what, and from what to what.
  await db.query(`
    CREATE TABLE IF NOT EXISTS tender_pricing_audit (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      pricing_id INT NOT NULL,
      bid_number VARCHAR(255) NOT NULL,
      action     VARCHAR(40) NOT NULL,     -- created | updated | submitted | approved | rejected
      field      VARCHAR(60) NULL,
      old_value  VARCHAR(255) NULL,
      new_value  VARCHAR(255) NULL,
      note       TEXT NULL,
      user_id    INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pricing (pricing_id),
      INDEX idx_bid (bid_number)
    )
  `);
  console.log('✓ tender_pricing_audit created (or already exists)');

  await db.query(
    `ALTER TABLE approval_requests MODIFY COLUMN type
     ENUM('tender_proceed','representation','document','product_suggestion','process_decode','pricing') NOT NULL`
  );
  console.log('✓ approval_requests.type now includes pricing');
}

module.exports = { up };

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

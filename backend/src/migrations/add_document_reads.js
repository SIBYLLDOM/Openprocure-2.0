/**
 * Tender document reading sign-off.
 *
 * Once Finance has settled the pricing, the tender team has to actually read
 * the bid documents before bidding — the GeM bid document, the ATC, and any
 * additional specifications — and record that they have.
 *
 * One row per (tender, document, reader): several people may need to read the
 * same document, and we want to know who did, not just that someone did.
 */
const db = require('../config/db');

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tender_document_reads (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      bid_number VARCHAR(255) NOT NULL,
      doc_type   ENUM('gem_bid','atc','additional_specs') NOT NULL,
      user_id    INT NOT NULL,
      note       VARCHAR(500) NULL,
      read_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_read (bid_number, doc_type, user_id),
      INDEX idx_bid (bid_number)
    )
  `);
  console.log('✓ tender_document_reads created (or already exists)');
}

module.exports = { up };

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

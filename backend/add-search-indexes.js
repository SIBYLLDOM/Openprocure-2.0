require('dotenv').config();
const db = require('./src/config/db');

const steps = [
  // ── gem_tenders ────────────────────────────────────────────────────────────
  // Division tab filter (always in WHERE)
  [`ALTER TABLE gem_tenders ADD INDEX idx_dept (dept(100))`,
   'gem_tenders: idx_dept'],

  // Category filter (perfect_cat = 0/1)
  [`ALTER TABLE gem_tenders ADD INDEX idx_perfect_cat (perfect_cat)`,
   'gem_tenders: idx_perfect_cat'],

  // Most common combined filter: dept + perfect_cat
  [`ALTER TABLE gem_tenders ADD INDEX idx_dept_perfcat (dept(100), perfect_cat)`,
   'gem_tenders: idx_dept_perfcat'],

  // Sub-category filter
  [`ALTER TABLE gem_tenders ADD INDEX idx_sub_cat (sub_cat(100))`,
   'gem_tenders: idx_sub_cat'],

  // FULLTEXT on title (items) + keyword — replaces LIKE '%…%' for text search
  [`ALTER TABLE gem_tenders ADD FULLTEXT INDEX idx_ft_gem (items, keyword)`,
   'gem_tenders: FULLTEXT(items, keyword)'],

  // ── open_tender_details ────────────────────────────────────────────────────
  // Relevency checker is in EVERY open-tender query
  [`ALTER TABLE open_tender_details ADD INDEX idx_relevency (relevency_checker)`,
   'open_tender_details: idx_relevency'],

  // Division tab filter
  [`ALTER TABLE open_tender_details ADD INDEX idx_dept (dept(100))`,
   'open_tender_details: idx_dept'],

  // FULLTEXT on title + org name — replaces LIKE '%…%' for text search
  [`ALTER TABLE open_tender_details ADD FULLTEXT INDEX idx_ft_open (tender_title, organisation_name)`,
   'open_tender_details: FULLTEXT(tender_title, organisation_name)'],
];

(async () => {
  for (const [sql, label] of steps) {
    try {
      await db.query(sql);
      console.log(`✅  ${label}`);
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log(`⏭️   ${label} — already exists, skipped`);
      } else {
        console.error(`❌  ${label}: ${e.message}`);
      }
    }
  }
  console.log('\nDone.');
  process.exit(0);
})();

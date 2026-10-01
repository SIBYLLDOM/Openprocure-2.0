// One-time reconciliation for gem_tenders.dept drift.
//
// Root cause: run_diagno_perfect_category.py's ON DUPLICATE KEY UPDATE used to omit
// `dept`, so when a bid_number first classified by the Endo scraper (dept='Endo') was
// later re-matched by the Diagno category scraper, sub_cat/keyword moved to a Diagno
// category name but dept stayed stuck at 'Endo' (now fixed in that script). This script
// corrects existing rows left mismatched by that historic bug.
//
// sub_cat (falling back to keyword) is always set verbatim to one of the category names
// in scrapper/endo_cat.json or scrapper/diagno_cat.json, so those two files are the
// authoritative source for "which division this tender actually belongs to".
//
// Usage:
//   node backend/scripts/fix_dept_mismatch.js            (dry-run, no writes)
//   node backend/scripts/fix_dept_mismatch.js --apply     (applies the UPDATEs)

const path = require('path');
const db = require('../src/config/db');

const APPLY = process.argv.includes('--apply');

const endoCats = require(path.join(__dirname, '../../scrapper/endo_cat.json'));
const diagnoCats = require(path.join(__dirname, '../../scrapper/diagno_cat.json'));

function toSet(raw) {
  return new Set(
    raw.map(r => (r.item_category || '').trim().toLowerCase()).filter(Boolean)
  );
}

const endoSet = toSet(endoCats);
const diagnoSet = toSet(diagnoCats);

// Resolve the "true" dept for a row from its sub_cat/keyword against the category lists.
// Returns null if the category name isn't recognized in either list (leave untouched).
function resolveTrueDept(subCat, keyword) {
  for (const candidate of [subCat, keyword]) {
    const key = (candidate || '').trim().toLowerCase();
    if (!key) continue;
    if (endoSet.has(key)) return 'Endo';
    if (diagnoSet.has(key)) return 'Diagno';
  }
  return null;
}

async function run() {
  try {
    const [rows] = await db.query(
      `SELECT id, bid_number, dept, sub_cat, keyword
       FROM gem_tenders
       WHERE perfect_cat = 1`
    );

    const mismatches = [];
    const other = { null: 0, threeSixty: 0 };
    for (const row of rows) {
      const trueDept = resolveTrueDept(row.sub_cat, row.keyword);
      if (!trueDept) continue; // category name not in either list — skip, don't guess

      const currentDept = (row.dept || '').trim();

      // Only touch genuine Endo<->Diagno flips. dept='360' is a legitimate third
      // division that appears to reuse the same GeM category taxonomy by design
      // (scrapper/360/gem.py scrapes endo_cat.json but tags dept='360') — reclassifying
      // those to Endo would wrongly gut the 360 Division. dept=NULL rows were simply
      // never tagged by either scraper — a different problem, not this drift bug.
      if (!currentDept) { other.null++; continue; }
      if (currentDept === '360') { other.threeSixty++; continue; }
      if (!['endo', 'diagno'].includes(currentDept.toLowerCase())) continue;

      if (currentDept.toLowerCase() !== trueDept.toLowerCase()) {
        mismatches.push({
          id: row.id,
          bid_number: row.bid_number,
          currentDept: row.dept,
          correctDept: trueDept,
          sub_cat: row.sub_cat,
          keyword: row.keyword
        });
      }
    }

    console.log(`Scanned ${rows.length} perfect_cat=1 rows.`);
    console.log(`Found ${mismatches.length} genuine Endo<->Diagno mismatches.`);
    console.log(`(Skipped, not touched: ${other.null} rows with dept=NULL, ${other.threeSixty} rows with dept='360')\n`);

    if (mismatches.length) {
      console.log('bid_number'.padEnd(28), 'current dept'.padEnd(14), 'correct dept'.padEnd(14), 'sub_cat');
      console.log('-'.repeat(100));
      for (const m of mismatches) {
        console.log(
          String(m.bid_number).padEnd(28),
          String(m.currentDept).padEnd(14),
          String(m.correctDept).padEnd(14),
          m.sub_cat || m.keyword || ''
        );
      }
    }

    if (!APPLY) {
      console.log(`\nDry-run only — no changes written. Re-run with --apply to update these ${mismatches.length} rows.`);
      process.exit(0);
    }

    if (!mismatches.length) {
      console.log('Nothing to apply.');
      process.exit(0);
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (const m of mismatches) {
        await conn.query('UPDATE gem_tenders SET dept = ? WHERE id = ?', [m.correctDept, m.id]);
      }
      await conn.commit();
      console.log(`\nApplied: updated dept on ${mismatches.length} rows.`);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    process.exit(0);
  } catch (err) {
    console.error('fix_dept_mismatch failed:', err);
    process.exit(1);
  }
}

run();

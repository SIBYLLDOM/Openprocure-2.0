/**
 * Seeds the process tracker from tender-flow.json — the authoritative flow.
 *
 * Four flows: {gem, open} x {distributor, direct}. Within GeM the step LIST is
 * identical for both modes and only the TATs differ; an earlier version wrongly
 * treated blank TATs as "step does not apply", which hid Pricing, EMD and the
 * annexures from distributor tenders. Seeding from the file removes that guess.
 *
 * TAT text is kept verbatim alongside the parsed minutes, because several
 * entries carry conditions worth showing ("subject to availability of office
 * boy", "in case of BG") that no single number captures.
 *
 * Parsing rules:
 *   ranges ("2-3days", "3-5hrs")  -> upper bound, so a breach is unambiguous
 *   "post step N"                 -> anchor_step = N, not the previous step
 *   "(Process Repeat)", "Depends" -> no TAT; never flags as breached
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const FLOW_FILE = path.join(__dirname, '../../../tender-flow.json');

/** "2-3days" -> 4320 (upper bound). Returns { minutes, anchorStep }. */
function parseTat(text) {
  if (!text) return { minutes: null, anchorStep: null };
  const t = String(text).toLowerCase();

  if (t.includes('process repeat') || t.includes('depends')) {
    return { minutes: null, anchorStep: null };
  }

  const anchorMatch = t.match(/post\s+step\s+(\d+)/);
  const anchorStep = anchorMatch ? Number(anchorMatch[1]) : null;

  // Range first ("2-3days", "3-5hrs", "1-2 days") — take the upper bound.
  const range = t.match(/(\d+)\s*-\s*(\d+)\s*(min|mint|mints|hr|hrs|day|days)/);
  if (range) {
    const n = Number(range[2]);
    const unit = range[3];
    if (unit.startsWith('min')) return { minutes: n, anchorStep };
    if (unit.startsWith('hr')) return { minutes: n * 60, anchorStep };
    return { minutes: n * 1440, anchorStep };
  }

  const single = t.match(/(\d+)\s*(min|mint|mints|hr|hrs|day|days)/);
  if (single) {
    const n = Number(single[1]);
    const unit = single[2];
    if (unit.startsWith('min')) return { minutes: n, anchorStep };
    if (unit.startsWith('hr')) return { minutes: n * 60, anchorStep };
    return { minutes: n * 1440, anchorStep };
  }

  return { minutes: null, anchorStep };
}

/** Which role does this step belong to, by what the step actually is. */
function ownerFor(process) {
  const p = process.toLowerCase();
  if (p.includes('decoding received')) return 'Sales';
  if (p.includes('rejected')) return 'Sales';
  if (p.includes('authorization')) return 'Legal';
  if (p.includes('oem approval')) return 'Tender Admin';
  if (p.includes('shared with sales')) return 'Tender Admin';
  if (p.includes('pricing')) return 'Finance Team';
  if (p.includes('emd')) return 'Finance Team';
  if (p.includes('annexure')) return 'Documentation';
  if (p.includes('common documents')) return 'Documentation';
  if (p.includes('notary')) return 'Documentation';
  if (p.startsWith('po ')) return 'Documentation';
  if (p.includes('rearrangement')) return 'Documentation';
  if (p.includes('phyical') || p.includes('physical')) return 'Documentation';
  if (p.includes('in case of ra')) return 'Tender Admin';
  return 'Tender Executive';
}

/** Steps the system already records complete themselves. */
function autoSourceFor(process) {
  const p = process.toLowerCase();
  if (p.includes('product matching')) return 'suggestions';
  if (p.includes('decoding received')) return 'decode_approved';
  if (p === 'pricing') return 'pricing_done';
  if (p.includes('document reading')) return 'docs_read';
  if (p.includes('decode review')) return 'representation';
  return null;
}

async function up() {
  const raw = JSON.parse(fs.readFileSync(FLOW_FILE, 'utf-8'));

  await db.query('DROP TABLE IF EXISTS process_steps');
  await db.query(`
    CREATE TABLE process_steps (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      flow        ENUM('gem','open') NOT NULL,
      mode        ENUM('distributor','direct') NOT NULL,
      step_no     INT NOT NULL,
      code        VARCHAR(80) NOT NULL,
      name        VARCHAR(500) NOT NULL,
      tat_text    VARCHAR(120) NULL,
      tat_minutes INT NULL,
      anchor_step INT NULL,
      owner_role  VARCHAR(40) NULL,
      auto_source VARCHAR(40) NULL,
      active      TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY uniq_step (flow, mode, step_no),
      INDEX idx_flow_mode (flow, mode)
    )
  `);

  const FLOWS = [
    ['open', 'distributor', raw.open_tender_process.Participating_with_distributor],
    ['open', 'direct', raw.open_tender_process.Meril_direct_participation],
    ['gem', 'distributor', raw.gem_process.Participating_with_distributor],
    ['gem', 'direct', raw.gem_process.Meril_direct_participation],
  ];

  let n = 0;
  for (const [flow, mode, steps] of FLOWS) {
    for (const s of steps) {
      const { minutes, anchorStep } = parseTat(s.tat);
      // Stable code from the process text, so progress survives a reseed.
      const code = s.process.toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

      await db.query(
        `INSERT INTO process_steps
           (flow, mode, step_no, code, name, tat_text, tat_minutes, anchor_step, owner_role, auto_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [flow, mode, s.step, code, s.process, s.tat || null, minutes, anchorStep,
          ownerFor(s.process), autoSourceFor(s.process)]
      );
      n += 1;
    }
  }
  console.log(`✓ process_steps rebuilt — ${n} rows across 4 flows`);

  // await db.query(
  //   `ALTER TABLE users MODIFY COLUMN role
  //    ENUM('Admin','Tender Admin','Tender Executive','Zonal Head','Sales','Finance Team','Legal','Documentation')
  //    NOT NULL DEFAULT 'Sales'`
  // );
  console.log('· users.role modification skipped to prevent truncation');
}

module.exports = { up, parseTat };

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

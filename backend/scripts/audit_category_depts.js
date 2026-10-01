// Read-only audit: flags product_categories rows whose keyword text looks like it
// belongs to the OTHER division's equipment, for the Endo/Diagno handling teams to
// review and fix themselves via Admin > Product Categories (PUT /api/product-categories/:id
// already supports reassigning dept). This script makes no changes.
//
// Usage: node backend/scripts/audit_category_depts.js

const db = require('../src/config/db');

const ENDO_TERMS = [
  'endoscop', 'laparoscop', 'arthroscop', 'resectoscop', 'bronchoscop',
  'hysteroscop', 'trocar', 'stapler', 'energy device', 'harmonic',
  'suture', 'hernia', 'ureteroscop', 'cystoscop'
];

const DIAGNO_TERMS = [
  'biochemistry', 'analyzer', 'reagent', 'elisa', 'coagulat',
  'hematology', 'haematology', 'immunoassay', 'centrifuge', 'blood grouping'
];

function matches(text, terms) {
  const t = (text || '').toLowerCase();
  return terms.filter(term => t.includes(term));
}

async function run() {
  try {
    const [rows] = await db.query(
      `SELECT id, dept, keywords, category FROM product_categories ORDER BY dept, keywords`
    );

    const suspects = { diagnosticFlaggedEndo: [], endoFlaggedDiagno: [] };

    for (const row of rows) {
      const dept = (row.dept || '').toLowerCase();
      if (dept === 'diagnostic') {
        const hits = matches(row.keywords, ENDO_TERMS);
        if (hits.length) suspects.diagnosticFlaggedEndo.push({ ...row, hits });
      } else if (dept === 'endo') {
        const hits = matches(row.keywords, DIAGNO_TERMS);
        if (hits.length) suspects.endoFlaggedDiagno.push({ ...row, hits });
      }
    }

    console.log(`Scanned ${rows.length} product_categories rows.\n`);

    console.log(`=== dept='diagnostic' rows containing Endo-sounding terms (${suspects.diagnosticFlaggedEndo.length}) ===`);
    for (const s of suspects.diagnosticFlaggedEndo) {
      console.log(`  id=${s.id}  [${s.category}]  "${s.keywords}"  (matched: ${s.hits.join(', ')})`);
    }

    console.log(`\n=== dept='endo' rows containing Diagno-sounding terms (${suspects.endoFlaggedDiagno.length}) ===`);
    for (const s of suspects.endoFlaggedDiagno) {
      console.log(`  id=${s.id}  [${s.category}]  "${s.keywords}"  (matched: ${s.hits.join(', ')})`);
    }

    console.log('\nThis is a candidate list only — no rows were changed. Review each in Admin > Product Categories and reassign dept if it is genuinely mis-filed.');
    process.exit(0);
  } catch (err) {
    console.error('audit_category_depts failed:', err);
    process.exit(1);
  }
}

run();

'use strict';
const db = require('../config/db');

/**
 * Scrapers write the `dept` column with inconsistent casing (some hardcode
 * 'Endo', others lowercase whatever an LLM returned) — normalize here so
 * every caller can rely on getting back exactly 'Endo' | 'Diagno' | null.
 */
function normalizeDept(raw) {
  const d = String(raw || '').trim().toLowerCase();
  if (d === 'endo') return 'Endo';
  if (d === 'diagno') return 'Diagno';
  return null; // 'unknown' / 'both' / blank — caller defaults to Diagno
}

/**
 * Resolves a bid's product division ('Endo' | 'Diagno' | null) by checking
 * gem_tenders first, then falling back to open_tender_details. Used to pick
 * the correct letterhead branding (logo + signature) for generated letters.
 */
async function getTenderDept(bidNumber) {
  const [gemRows] = await db.query(
    `SELECT dept FROM gem_tenders WHERE bid_number = ? LIMIT 1`,
    [bidNumber]
  );
  const gemDept = normalizeDept(gemRows[0]?.dept);
  if (gemDept) return gemDept;

  const openBidNumber = bidNumber.replace(/\//g, '_');
  const [openRows] = await db.query(
    `SELECT dept FROM open_tender_details WHERE tender_id = ? LIMIT 1`,
    [openBidNumber]
  );
  const openDept = normalizeDept(openRows[0]?.dept);
  if (openDept) return openDept;

  return null;
}

module.exports = { getTenderDept, normalizeDept };

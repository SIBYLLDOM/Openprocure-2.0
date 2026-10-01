'use strict';
// Name -> email lookup for the "Send via Mail" feature, sourced from the
// client's own "Email ID's.xlsx" (copied into src/asset/budget-targeting/ so
// this doesn't depend on a path outside the repo). One flat sheet covers
// everyone — FLSPs, RSMs and Zonal Heads alike — keyed by name only, so the
// same map is used for the person's own "To" address and for resolving their
// RSM/Zonal Head's "Cc" address.
const path = require('path');
const ExcelJS = require('exceljs');
const { normalizeNameKey } = require('./budgetTargetingExcelParser');

const WORKBOOK_PATH = path.join(__dirname, '../asset/budget-targeting/email-directory.xlsx');

let directory = null; // { byName: Map<normalizedName, email>, byFirstWord: Map<firstWord, {name, email}[]> }

async function loadDirectory() {
  if (directory) return directory;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(WORKBOOK_PATH);
  const ws = wb.worksheets[0];

  const byName = new Map();
  const byFirstWord = new Map();

  ws.eachRow((row) => {
    // Row 1 is blank, row 2 is the "EMP Code / EMP Name / Email ID" header —
    // skip both by requiring a real numeric EMP Code, which only data rows have.
    if (typeof row.getCell(3).value !== 'number') return;

    const rawName = row.getCell(4).value;
    let rawEmail = row.getCell(5).value;
    if (rawEmail && typeof rawEmail === 'object') {
      rawEmail = rawEmail.text || (rawEmail.hyperlink || '').replace(/^mailto:/i, '');
    }
    if (!rawName || !rawEmail) return;

    const name = String(rawName).trim();
    const email = String(rawEmail).trim();
    const key = normalizeNameKey(name);
    if (!key || !email) return;

    byName.set(key, email);

    const firstWord = key.split(' ')[0];
    if (firstWord) {
      if (!byFirstWord.has(firstWord)) byFirstWord.set(firstWord, []);
      byFirstWord.get(firstWord).push({ name, email });
    }
  });

  directory = { byName, byFirstWord };
  return directory;
}

/** Exact-match lookup only — used for the person's own "To" address, where a
 * wrong guess would mean sending someone else's target letter to the wrong
 * inbox. Returns null (never guesses) when there's no exact match. */
async function lookupEmailExact(name) {
  if (!name) return null;
  const dir = await loadDirectory();
  return dir.byName.get(normalizeNameKey(name)) || null;
}

/** Exact match first; if that fails, falls back to a first-word match ONLY
 * when it's unambiguous (exactly one candidate in the directory shares that
 * first word) — e.g. resolves the workbook's "Yellesh M" against the
 * directory's "Yellesh (Sickle)" entry. Used for RSM/Zonal Head "Cc" only,
 * where the worst case of a miss is a silently-omitted Cc, not a misdirected
 * "To". "Vacant" (an unfilled role) and unresolvable names return null. */
async function lookupEmailForCc(name) {
  if (!name || /^vacant$/i.test(name.trim())) return null;
  const dir = await loadDirectory();
  const key = normalizeNameKey(name);
  const exact = dir.byName.get(key);
  if (exact) return exact;

  const firstWord = key.split(' ')[0];
  const candidates = dir.byFirstWord.get(firstWord);
  if (candidates && candidates.length === 1) return candidates[0].email;
  return null;
}

module.exports = { lookupEmailExact, lookupEmailForCc };

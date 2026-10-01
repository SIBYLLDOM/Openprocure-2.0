'use strict';

/**
 * Best-effort expiry-date extraction from a Library filename. Certificate
 * filenames in this org (CE/MSC/NCC/WHO GMP/Mfg License/Trademark) often
 * embed both an issue date and an expiry date (e.g. "DTD 27.01.2023 EXP
 * 26.01.2023"), so this deliberately only matches dates anchored to an
 * explicit expiry keyword (EXP/EXPIRY/VALID/VALID UPTO/VALID TILL) rather
 * than "the first date found" — a naive date regex would grab the issue
 * date half the time. Filenames with no such keyword (or no date at all)
 * return null, leaving the expiry date for a human to set manually.
 */

const DATE_SEP = '(\\d{1,2})[.\\-\\/](\\d{1,2})[.\\-\\/](\\d{2,4})';
const DATE_NOSEP = '(\\d{2})(\\d{2})(\\d{4})';
const SEP = '[\\s_]*';
const KEYWORD_JOIN = `${SEP}(?:UPTO|UP${SEP}TO|TILL)?${SEP}[:\\-]?${SEP}`;

function toDate(dStr, mStr, yStr) {
  let d = parseInt(dStr, 10);
  let m = parseInt(mStr, 10);
  let y = parseInt(yStr, 10);
  if (yStr.length === 2) y = y < 70 ? 2000 + y : 1900 + y;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Reject dates that overflowed (e.g. 31.02.2025) rather than silently rolling forward.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function toISODate(dt) {
  return dt.toISOString().slice(0, 10);
}

/**
 * @param {string} name filename (with or without extension)
 * @returns {{ expiry_date: string, expiry_source: 'parsed' } | null}
 */
function parseExpiryFromFilename(name) {
  if (!name) return null;
  const s = String(name);

  let m = s.match(new RegExp(`EXP(?:IRY)?\\.?${KEYWORD_JOIN}${DATE_SEP}`, 'i'));
  if (m) { const d = toDate(m[1], m[2], m[3]); if (d) return { expiry_date: toISODate(d), expiry_source: 'parsed' }; }

  m = s.match(new RegExp(`VALID${KEYWORD_JOIN}${DATE_SEP}`, 'i'));
  if (m) { const d = toDate(m[1], m[2], m[3]); if (d) return { expiry_date: toISODate(d), expiry_source: 'parsed' }; }

  m = s.match(new RegExp(`VALID${KEYWORD_JOIN}${DATE_NOSEP}`, 'i'));
  if (m) { const d = toDate(m[1], m[2], m[3]); if (d) return { expiry_date: toISODate(d), expiry_source: 'parsed' }; }

  // Year-only fallback ("VALID UPTO 2025" / "EXP 2027") — treat as expiring
  // end-of-year since no day/month was given.
  m = s.match(/EXP(?:IRY)?\.?[\s_]*(?:DATE)?[\s_]*[:\-]?[\s_]*(20\d{2})\b/i);
  if (m) return { expiry_date: `${m[1]}-12-31`, expiry_source: 'parsed' };

  m = s.match(new RegExp(`VALID${KEYWORD_JOIN}(20\\d{2})\\b`, 'i'));
  if (m) return { expiry_date: `${m[1]}-12-31`, expiry_source: 'parsed' };

  return null;
}

module.exports = { parseExpiryFromFilename };

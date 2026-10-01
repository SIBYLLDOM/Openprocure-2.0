'use strict';
// State -> Zonal Sales Manager routing for the Process Decode "submit for
// approval" flow, built from the client's own "ZSM Org.xlsx" (each ZSM's
// full downline was listed with their covering state(s); this file is the
// distilled state -> ZSM(s) result of that, confirmed with the user for the
// two real ambiguities the source data had — see the notes below).
//
// Replaces the old zone_data-based zone lookup (findZonalHeadsForBidZone in
// userScope.js), which routed by matching ANY user with role='Zonal Head'
// whose assigned states overlapped the tender's zone — that pulled in
// several stale/test accounts alongside the real ZSM because their state
// lists were broad and messy. This maps directly to the named ZSM instead.
const db = require('../config/db');

// Canonical state name -> ZSM full name(s), matching each ZSM's name in the
// `users` table (role='Zonal Head') so their live email is always used —
// this file only pins down *who covers what*, not their contact details.
// West Bengal is intentionally routed to both Joyabrata Podder (WB1) and
// Manojendra Das (WB2) — the source Excel splits West Bengal into two
// sub-regions, but a tender's own state field has no such split, so both are
// notified rather than guessing which sub-region it falls in.
const STATE_TO_ZSM_NAMES = {
  'Uttar Pradesh': ['Ajeet Srivastava'],
  'Bihar': ['Ajeet Srivastava'],
  'Uttarakhand': ['Ajeet Srivastava'],
  'Rajasthan': ['Ajeet Srivastava'],

  'Delhi': ['Deepak Kumar Agrawal'],

  'Punjab': ['Kapil Arora'],
  'Haryana': ['Kapil Arora'],
  'Chandigarh': ['Kapil Arora'],
  'Jammu and Kashmir': ['Kapil Arora'],
  'Himachal Pradesh': ['Kapil Arora'],

  'Maharashtra': ['Mangesh Chandurkar'],
  'Goa': ['Mangesh Chandurkar'],
  'Gujarat': ['Mangesh Chandurkar'],
  'Chhattisgarh': ['Mangesh Chandurkar'],
  'Madhya Pradesh': ['Mangesh Chandurkar'],

  'Assam': ['Manojendra Das'],
  // Named North-East states not separately claimed by another ZSM in the
  // Excel — "Assam & NE" is Manojendra Das's own listed coverage.
  'Arunachal Pradesh': ['Manojendra Das'],
  'Manipur': ['Manojendra Das'],
  'Meghalaya': ['Manojendra Das'],
  'Mizoram': ['Manojendra Das'],
  'Nagaland': ['Manojendra Das'],
  'Sikkim': ['Manojendra Das'],

  'Odisha': ['Joyabrata Podder'],
  'Tripura': ['Joyabrata Podder'],

  'West Bengal': ['Joyabrata Podder', 'Manojendra Das'],

  'Telangana': ['Yellesh M'],
  'Andhra Pradesh': ['Yellesh M'],
  'Tamil Nadu': ['Yellesh M'],
  'Puducherry': ['Yellesh M'],
  'Kerala': ['Yellesh M'],
  'Karnataka': ['Yellesh M'],

  'Jharkhand': ['Yugeswar Kumar'],
};

/** Folds known spelling/typo variants seen in real tender records onto the
 * canonical name used as a key in STATE_TO_ZSM_NAMES above. */
function normalizeStateName(raw) {
  if (!raw) return null;
  const t = String(raw).trim();
  const table = {
    'gujrat': 'Gujarat',
    'uttrakhand': 'Uttarakhand',
    'jammu & kashmir': 'Jammu and Kashmir',
    'j&k': 'Jammu and Kashmir',
    'chandigarh ut': 'Chandigarh',
    'chattisgarh': 'Chhattisgarh',
  };
  const lower = t.toLowerCase();
  return table[lower] || t;
}

/**
 * Resolves the ZSM(s) covering a given state to their live `users` account
 * (id + email) — every ZSM named in STATE_TO_ZSM_NAMES has a matching
 * role='Zonal Head' row there (confirmed directly against the live data),
 * which is also what notifyUsers() needs an id from to create the in-app
 * notification alongside the email. Returns [] if the state isn't
 * recognized or isn't mapped to any ZSM yet.
 */
async function findZsmForState(rawState) {
  const state = normalizeStateName(rawState);
  const names = state ? STATE_TO_ZSM_NAMES[state] : null;
  if (!names || !names.length) return [];

  const [rows] = await db.query(
    `SELECT id, name, email FROM users
     WHERE role = 'Zonal Head' AND status = 'Active' AND name IN (${names.map(() => '?').join(',')})`,
    names
  );
  return rows;
}

/** Same bid-number lookup findZonalHeadsForBidZone (utils/userScope.js) used —
 * bid numbers reach this either slash- or underscore-separated. */
async function findZsmForBid(bidNumber) {
  const underscored = String(bidNumber).replace(/\//g, '_');
  const slashed = String(bidNumber).replace(/_/g, '/');

  const [[gem]] = await db.query(
    `SELECT state FROM gem_tenders WHERE bid_number IN (?, ?) LIMIT 1`,
    [slashed, underscored]
  );
  const [[open]] = await db.query(
    `SELECT state FROM open_tender_details WHERE tender_id IN (?, ?) LIMIT 1`,
    [underscored, slashed]
  );
  const state = (gem && gem.state) || (open && open.state) || null;
  if (!state) return [];

  return findZsmForState(state);
}

module.exports = { findZsmForState, findZsmForBid, normalizeStateName, STATE_TO_ZSM_NAMES };

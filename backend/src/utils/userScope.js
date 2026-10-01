'use strict';
const db = require('../config/db');

/**
 * Department model
 * ----------------
 * A "department" is a PAIR of two independent axes stored in user_departments:
 *   type='department' -> division: 'Endo' | 'Diagno' | '360'
 *   type='field'      -> source:   'GEM'  | 'Open'
 *   type='state'      -> working states, used by Sales and Zonal Head only
 *
 * The six departments in the system are the combinations:
 *   Diagno-GeM, Diagno-Open, Endo-GeM, Endo-Open, 360-GeM, 360-Open
 *
 * Access rules
 * ------------
 *  - Admin            : unrestricted. Sees every tender and every user.
 *  - Tender Admin     : sees ONLY tenders and users matching BOTH axes.
 *                       Matching is AND across axes, so a Diagno-GeM admin does
 *                       NOT see Diagno-Open tenders or Diagno-Open people.
 *  - Tender Executive : browses EVERY tender (no division/source limit), but
 *                       their Workdesk is scoped to their own department, and
 *                       marking a tender 'proceed', finalising a representation
 *                       or finalising a document all require approval from a
 *                       Tender Admin sharing their division AND source.
 *                       See controllers/approvals.controller.js.
 *  - Sales / Zonal Head : additionally limited to their assigned states.
 *                       Sales raises proceed/representation/document requests
 *                       to the Tender Admin of their division+source, but
 *                       product-suggestion requests go to their Zonal Head.
 *                       The reporting line is INFERRED from overlapping states
 *                       (a Zonal Head for TN+Kerala automatically covers the
 *                       Sales people working TN or Kerala) — users.reports_to
 *                       exists only as a manual override for the ambiguous
 *                       case where two Zonal Heads share a state. A Zonal Head
 *                       approves their reportees' product suggestions and
 *                       raises their own requests up to a Tender Admin.
 *  - A Tender Admin with no assignment on either axis sees NOTHING
 *    (fail closed) rather than everything.
 *  - Tenders whose dept is NULL/'unknown' are treated as unclassified and
 *    are hidden from EVERYONE, including Admin. '360' is a real division
 *    (like Endo/Diagno), not an unclassified value.
 */

const DIVISIONS = ['Endo', 'Diagno', '360'];
const SOURCES = ['GEM', 'Open'];

// Only these dept values count as classified; everything else is hidden.
const CLASSIFIED = ['endo', 'diagno', '360'];

/** Loads the caller's role and department assignments. */
async function getUserScope(userId) {
  const [[user]] = await db.query('SELECT id, role, reports_to FROM users WHERE id = ?', [userId]);
  if (!user) {
    return {
      role: null, isAdmin: false, isExecutive: false, isSales: false,
      isZonalHead: false, reportsTo: null, divisions: [], sources: [], states: [],
    };
  }

  const [rows] = await db.query(
    'SELECT department, type FROM user_departments WHERE user_id = ?',
    [userId]
  );

  return {
    role: user.role,
    isAdmin: user.role === 'Admin',
    isExecutive: user.role === 'Tender Executive',
    isSales: user.role === 'Sales',
    isZonalHead: user.role === 'Zonal Head',
    reportsTo: user.reports_to || null,
    divisions: rows.filter(r => r.type === 'department').map(r => r.department),
    sources: rows.filter(r => r.type === 'field').map(r => r.department),
    states: rows.filter(r => r.type === 'state').map(r => r.department),
  };
}

/** Roles limited to the states they work in. */
function isStateScoped(scope) {
  return scope.isSales || scope.isZonalHead;
}

/**
 * SQL predicate limiting a direct gem_tenders / open_tender_details query to
 * the caller's working states.
 *
 * STRICT: only tenders whose state matches. Tenders with no state recorded are
 * NOT shown — Sales and Zonal Head see their states' tenders and nothing else.
 *
 * Be aware this depends entirely on the `state` column being populated: today
 * ~99% of gem_tenders rows have no state, so those rows are invisible to these
 * roles until the scraper backfills them. Relaxing this is a one-line change —
 * add `${col} IS NULL OR ${col} = '' OR` back into the predicate below.
 */
function stateScopeSql(scope, col = 'state') {
  if (!isStateScoped(scope)) return { sql: '1=1', params: [] };
  // A state-scoped user with no states assigned sees nothing rather than
  // everything, matching how the division/source axes fail closed.
  if (!scope.states.length) return { sql: '1=0', params: [] };
  return {
    sql: `${col} IN (${scope.states.map(() => '?').join(',')})`,
    params: [...scope.states],
  };
}

/** True when a Tender Admin is missing an axis and must therefore see nothing. */
function isBlocked(scope) {
  if (scope.isAdmin || scope.isExecutive) return false;
  return !scope.divisions.length || !scope.sources.length;
}

/**
 * True when the caller may browse the full tender list regardless of
 * department. Deliberately NOT used for the Workdesk, which stays scoped for
 * executives — only the browse/listing surfaces are unrestricted.
 */
function seesAllTenders(scope) {
  return scope.isAdmin || scope.isExecutive;
}

/**
 * SQL predicate restricting a tender listing to the caller's departments.
 * `bidExpr` is the SQL expression yielding the bid number on the outer query.
 * Returns { sql, params } — sql is always a complete boolean expression.
 */
function tenderScopeSql(scope, bidExpr) {
  if (isBlocked(scope)) return { sql: '1=0', params: [] };

  const divisions = scope.isAdmin || !scope.divisions.length ? CLASSIFIED : scope.divisions;
  const includeGem = scope.isAdmin || scope.sources.includes('GEM');
  const includeOpen = scope.isAdmin || scope.sources.includes('Open');

  // Sales and Zonal Head are additionally limited to their working states —
  // the same rule the tender list applies, so the Workdesk cannot show a
  // tender the list would have hidden.
  const stateLimited = isStateScoped(scope);
  if (stateLimited && !scope.states.length) return { sql: '1=0', params: [] };
  const stateSql = (col) => (stateLimited
    ? ` AND ${col} IN (${scope.states.map(() => '?').join(',')})`
    : '');
  const stateParams = stateLimited ? scope.states : [];

  const clauses = [];
  const params = [];

  // dept = 'both' means "relevant to both divisions" — it should be visible
  // to an Endo-only caller AND a Diagno-only caller alike, so it's always
  // added as an extra OR rather than being one of the caller's own allowed
  // `divisions` (which is what a Diagno-scoped caller is limited to seeing
  // among single-division tenders).
  if (includeGem) {
    clauses.push(
      `EXISTS (SELECT 1 FROM gem_tenders g WHERE g.bid_number = ${bidExpr}
               AND (LOWER(g.dept) IN (${divisions.map(() => '?').join(',')}) OR LOWER(g.dept) = 'both')${stateSql('g.state')})`
    );
    params.push(...divisions.map(d => d.toLowerCase()), ...stateParams);
  }
  if (includeOpen) {
    // open_tender_details.dept can hold combined values, so match with LIKE.
    clauses.push(
      `EXISTS (SELECT 1 FROM open_tender_details o
               WHERE o.tender_id = REPLACE(${bidExpr}, '/', '_')
               AND (${divisions.map(() => 'LOWER(o.dept) LIKE ?').join(' OR ')} OR LOWER(o.dept) = 'both')${stateSql('o.state')})`
    );
    params.push(...divisions.map(d => `%${d.toLowerCase()}%`), ...stateParams);
  }

  return { sql: clauses.length ? `(${clauses.join(' OR ')})` : '1=0', params };
}

/**
 * Whether this caller may open a specific tender.
 *
 * The list endpoints filter, but the detail endpoints are addressable by URL —
 * without this a Sales user could read any tender by pasting its bid number.
 */
async function canAccessTender(scope, bidNumber) {
  if (scope.isAdmin) return true;
  if (isBlocked(scope)) return false;
  if (!isStateScoped(scope)) return true;   // division/source roles are unrestricted here
  if (!scope.states.length) return false;

  const underscored = String(bidNumber).replace(/\//g, '_');
  const slashed = String(bidNumber).replace(/_/g, '/');

  const [[gem]] = await db.query(
    `SELECT 1 AS ok FROM gem_tenders
     WHERE bid_number IN (?, ?) AND state IN (${scope.states.map(() => '?').join(',')}) LIMIT 1`,
    [slashed, underscored, ...scope.states]
  );
  if (gem) return true;

  const [[open]] = await db.query(
    `SELECT 1 AS ok FROM open_tender_details
     WHERE tender_id IN (?, ?) AND state IN (${scope.states.map(() => '?').join(',')}) LIMIT 1`,
    [underscored, slashed, ...scope.states]
  );
  return !!open;
}

/**
 * SQL predicate restricting a direct query on gem_tenders / open_tender_details
 * (i.e. the dept column is on the table being selected, not looked up by bid).
 * `col` is the qualified dept column, `source` is 'GEM' or 'Open'.
 */
function deptColumnSql(scope, col, source) {
  if (isBlocked(scope)) return { sql: '1=0', params: [] };
  if (!scope.isAdmin && !scope.sources.includes(source)) return { sql: '1=0', params: [] };

  const divisions = scope.isAdmin || !scope.divisions.length ? CLASSIFIED : scope.divisions;

  // dept = 'both' — relevant to every division — is always included
  // alongside whatever single division(s) this caller is scoped to; see
  // the matching comment in tenderScopeSql above.
  if (source === 'Open') {
    return {
      sql: `(${divisions.map(() => `LOWER(${col}) LIKE ?`).join(' OR ')} OR LOWER(${col}) = 'both')`,
      params: divisions.map(d => `%${d.toLowerCase()}%`),
    };
  }
  return {
    sql: `(LOWER(${col}) IN (${divisions.map(() => '?').join(',')}) OR LOWER(${col}) = 'both')`,
    params: divisions.map(d => d.toLowerCase()),
  };
}

/**
 * SQL predicate restricting a user listing to people in the caller's
 * departments. A user is visible when they share at least one division AND
 * at least one source with the caller. `userCol` is the users.id expression.
 * Users with no assignment are visible only to Admin.
 */
function userScopeSql(scope, userCol = 'u.id') {
  if (scope.isAdmin) return { sql: '1=1', params: [] };
  if (isBlocked(scope)) return { sql: '1=0', params: [] };

  const params = [...scope.divisions, ...scope.sources];
  return {
    sql: `(EXISTS (SELECT 1 FROM user_departments ud1
                   WHERE ud1.user_id = ${userCol} AND ud1.type = 'department'
                   AND ud1.department IN (${scope.divisions.map(() => '?').join(',')}))
      AND EXISTS (SELECT 1 FROM user_departments ud2
                  WHERE ud2.user_id = ${userCol} AND ud2.type = 'field'
                  AND ud2.department IN (${scope.sources.map(() => '?').join(',')})))`,
    params,
  };
}


/**
 * Zonal Heads covering a Sales user: any Zonal Head sharing at least one
 * working state. Division/source are also matched when the Sales user has
 * them assigned, so an Endo head does not pick up Diagno requests.
 *
 * An explicit users.reports_to wins when set — that is the escape hatch for
 * two Zonal Heads covering the same state.
 */
async function findZonalHeads(scope, userId) {
  if (scope.reportsTo) {
    const [rows] = await db.query(
      "SELECT id, name, email FROM users WHERE id = ? AND status = 'Active'",
      [scope.reportsTo]
    );
    if (rows.length) return rows;
  }

  if (!scope.states.length) return [];

  const params = [...scope.states];
  let sql = `SELECT DISTINCT u.id, u.name, u.email
             FROM users u
             JOIN user_departments s ON s.user_id = u.id AND s.type = 'state'
             WHERE u.role = 'Zonal Head' AND u.status = 'Active' AND u.id <> ?
               AND s.department IN (${scope.states.map(() => '?').join(',')})`;
  params.unshift(userId);

  if (scope.divisions.length) {
    sql += ` AND EXISTS (SELECT 1 FROM user_departments d WHERE d.user_id = u.id
             AND d.type = 'department' AND d.department IN (${scope.divisions.map(() => '?').join(',')}))`;
    params.push(...scope.divisions);
  }
  if (scope.sources.length) {
    sql += ` AND EXISTS (SELECT 1 FROM user_departments f WHERE f.user_id = u.id
             AND f.type = 'field' AND f.department IN (${scope.sources.map(() => '?').join(',')}))`;
    params.push(...scope.sources);
  }

  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * Zonal Heads for a Process Decode sheet: resolved from the TENDER's own
 * zone (via the Field Team roster, zone_data), not the submitter's own
 * working states — so an FLSP or executive submitting on behalf of a region
 * still routes to that region's Zonal Head team, wherever the submitter is.
 *
 * zone_data only maps state -> zone through its FLSP rows (Leader rows carry
 * no state), so: look up the tender's state, find which zone that state
 * belongs to, expand to every state in that zone, then match against real
 * `users` Zonal Head accounts scoped to any of those states — this is what
 * actually lets them act on it from their Approvals page.
 */
async function findZonalHeadsForBidZone(bidNumber) {
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

  const [[zoneRow]] = await db.query(
    `SELECT zone FROM zone_data WHERE state = ? LIMIT 1`,
    [state]
  );
  if (!zoneRow) return [];

  const [stateRows] = await db.query(
    `SELECT DISTINCT state FROM zone_data WHERE zone = ? AND state IS NOT NULL AND state != ''`,
    [zoneRow.zone]
  );
  const zoneStates = stateRows.map(r => r.state);
  if (!zoneStates.length) return [];

  const [rows] = await db.query(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM users u
     JOIN user_departments d ON d.user_id = u.id AND d.type = 'state'
     WHERE u.role = 'Zonal Head' AND u.status = 'Active'
       AND d.department IN (${zoneStates.map(() => '?').join(',')})`,
    zoneStates
  );
  return rows;
}

/**
 * The inverse: user ids reporting to this Zonal Head, by the same state-overlap
 * rule. Used to scope the approval queue.
 */
async function findReporteeIds(scope, userId) {
  const [explicit] = await db.query(
    "SELECT id FROM users WHERE reports_to = ? AND status = 'Active'",
    [userId]
  );
  const ids = new Set(explicit.map(r => r.id));

  if (scope.states.length) {
    const params = [userId, ...scope.states];
    let sql = `SELECT DISTINCT u.id
               FROM users u
               JOIN user_departments s ON s.user_id = u.id AND s.type = 'state'
               WHERE u.role = 'Sales' AND u.status = 'Active' AND u.id <> ?
                 AND s.department IN (${scope.states.map(() => '?').join(',')})`;
    if (scope.divisions.length) {
      sql += ` AND EXISTS (SELECT 1 FROM user_departments d WHERE d.user_id = u.id
               AND d.type = 'department' AND d.department IN (${scope.divisions.map(() => '?').join(',')}))`;
      params.push(...scope.divisions);
    }
    const [rows] = await db.query(sql, params);
    rows.forEach(r => ids.add(r.id));
  }

  return [...ids];
}

module.exports = {
  seesAllTenders,
  canAccessTender,
  findZonalHeads,
  findZonalHeadsForBidZone,
  findReporteeIds,
  isStateScoped,
  stateScopeSql,
  DIVISIONS,
  SOURCES,
  CLASSIFIED,
  getUserScope,
  isBlocked,
  tenderScopeSql,
  deptColumnSql,
  userScopeSql,
};

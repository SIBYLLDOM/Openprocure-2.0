'use strict';
const db = require('../config/db');
const fs = require('fs');
const path = require('path');

const DOC_PREP_DIR = path.join(__dirname, '../../uploads/doc-prep');

/**
 * Wipes any Doc Prep work already sitting on this bid number so a tender
 * that gets marked Proceed always starts its workspace from scratch — same
 * cleanup as the manual "Reset Workspace" button (docPrep.controller.js's
 * resetWorkspace), just triggered automatically on proceed instead of by
 * hand. Covers the case where a tender was analyzed once, moved off
 * Proceed, and is now proceeding again (or a doc_prep_sessions row was
 * otherwise left over) — never throws, since a failed cleanup must not
 * block the status change or team setup that triggered it.
 */
async function resetDocPrepForFreshStart(bidNumber) {
  try {
    await db.query(`DELETE FROM doc_prep_sessions WHERE bid_no = ?`, [bidNumber]);
    await db.query(`DELETE FROM tender_summaries WHERE tender_id = ?`, [bidNumber]).catch(() => {});

    const folder = path.join(DOC_PREP_DIR, bidNumber.replace(/[^a-zA-Z0-9_\-]/g, '_'));
    if (fs.existsSync(folder)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  } catch (err) {
    console.error('[workspace] resetDocPrepForFreshStart failed:', err.message);
  }
}

/**
 * Workspace bootstrap for a tender that has been marked Proceed.
 *
 * Once a tender is approved to proceed, the two teams that always act on it —
 * Sales and Finance — get a department in its workspace, pre-populated with the
 * people who would work it. Doing this on approval means nobody has to remember
 * to set the workspace up by hand before work can start.
 *
 * Everything here is idempotent: marking a tender Proceed twice (or an approval
 * being replayed) must not duplicate departments or members.
 */

const DEPARTMENTS = [
  { name: 'Sales', color: '#be185d', icon: '💼' },
  { name: 'Finance', color: '#0f766e', icon: '💰' },
];

/** Finds the workspace for a bid, creating it if this is the first activity. */
async function ensureWorkspace(bidNumber) {
  const underscored = bidNumber.replace(/\//g, '_');
  const [existing] = await db.query(
    'SELECT id FROM workspaces WHERE tender_id IN (?, ?) LIMIT 1',
    [bidNumber, underscored]
  );
  if (existing.length) return existing[0].id;

  const [res] = await db.query(
    "INSERT INTO workspaces (tender_id, status) VALUES (?, 'active')",
    [bidNumber]
  );
  return res.insertId;
}

/**
 * Sales people who should be on this tender: same division and source as the
 * requester, and — when the tender has a state — working that state.
 *
 * Falls back to every active Sales user rather than creating an empty
 * department, since an empty one helps nobody.
 */
async function findSalesPeople(division, source, state) {
  const params = [];
  let sql = `SELECT DISTINCT u.id, u.name, u.email
             FROM users u
             WHERE u.role = 'Sales' AND u.status = 'Active'`;

  if (division) {
    sql += ` AND EXISTS (SELECT 1 FROM user_departments d WHERE d.user_id = u.id
             AND d.type = 'department' AND d.department = ?)`;
    params.push(division);
  }
  if (source) {
    sql += ` AND EXISTS (SELECT 1 FROM user_departments f WHERE f.user_id = u.id
             AND f.type = 'field' AND f.department = ?)`;
    params.push(source);
  }
  if (state) {
    sql += ` AND EXISTS (SELECT 1 FROM user_departments s WHERE s.user_id = u.id
             AND s.type = 'state' AND s.department = ?)`;
    params.push(state);
  }

  const [scoped] = await db.query(sql, params);
  if (scoped.length) return scoped;

  const [all] = await db.query(
    "SELECT id, name, email FROM users WHERE role = 'Sales' AND status = 'Active'"
  );
  return all;
}

async function findFinancePeople() {
  const [rows] = await db.query(
    "SELECT id, name, email FROM users WHERE role = 'Finance Team' AND status = 'Active'"
  );
  return rows;
}

/**
 * Creates the Sales and Finance departments for a proceeding tender and adds
 * the relevant people. Never throws — a workspace that failed to set itself up
 * must not roll back the approval that triggered it.
 *
 * @returns {{workspaceId:number, departments:object[]}|null}
 */
async function setupProceedWorkspace(bidNumber, { division = null, source = null } = {}) {
  try {
    const workspaceId = await ensureWorkspace(bidNumber);

    // The tender's own state, used to narrow which Sales people belong here.
    const [[tender]] = await db.query(
      'SELECT state, dept FROM gem_tenders WHERE bid_number = ? LIMIT 1', [bidNumber]
    );
    const state = tender?.state || null;
    const div = division || (tender?.dept
      ? tender.dept.toLowerCase() === 'endo' ? 'Endo' : 'Diagno'
      : null);

    const members = {
      Sales: await findSalesPeople(div, source, state),
      Finance: await findFinancePeople(),
    };

    const created = [];
    for (const dept of DEPARTMENTS) {
      const [[existing]] = await db.query(
        'SELECT id FROM workspace_departments WHERE workspace_id = ? AND name = ? LIMIT 1',
        [workspaceId, dept.name]
      );

      let departmentId = existing?.id;
      if (!departmentId) {
        const [res] = await db.query(
          'INSERT INTO workspace_departments (workspace_id, name, color, icon) VALUES (?, ?, ?, ?)',
          [workspaceId, dept.name, dept.color, dept.icon]
        );
        departmentId = res.insertId;
      }

      let added = 0;
      for (const person of members[dept.name] || []) {
        if (!person.email) continue;
        // Membership is keyed on email here (workspace_employees has no
        // user_id column), so re-running simply skips people already added.
        const [[dupe]] = await db.query(
          'SELECT id FROM workspace_employees WHERE workspace_id = ? AND department_id = ? AND email = ? LIMIT 1',
          [workspaceId, departmentId, person.email]
        );
        if (dupe) continue;

        await db.query(
          "INSERT INTO workspace_employees (workspace_id, department_id, name, email, role) VALUES (?, ?, ?, ?, 'member')",
          [workspaceId, departmentId, person.name || person.email, person.email]
        );
        added += 1;
      }

      created.push({ name: dept.name, departmentId, added, total: (members[dept.name] || []).length });
    }

    console.log(`[workspace] ${bidNumber} proceed setup:`,
      created.map(c => `${c.name}(+${c.added})`).join(' '));
    return { workspaceId, departments: created };
  } catch (err) {
    console.error('[workspace] setupProceedWorkspace failed:', err.message);
    return null;
  }
}

module.exports = { setupProceedWorkspace, ensureWorkspace, resetDocPrepForFreshStart, DEPARTMENTS };

'use strict';
const db = require('../config/db');
const { getUserScope } = require('../utils/userScope');

/**
 * Per-tender process tracker.
 *
 * Steps come from process_steps, seeded from tender-flow.json. There are four
 * flows — {gem, open} x {distributor, direct} — picked from which table the
 * tender lives in and the participation mode on its decode sheet.
 *
 * TAT is measured from when the PREVIOUS step completed — the clock starts on
 * hand-off, so a breach points at the step that stalled rather than marking
 * everything downstream late as well. The first step measures from the tender's
 * capture date.
 *
 * Steps whose work the system already records (product suggestions, the decode
 * approval chain, pricing, document reading) complete themselves; the rest are
 * ticked by hand.
 */

// Every role that owns a step in the flow can move it along.
const MARK_ROLES = [
  'Admin', 'Tender Admin', 'Office Administrator', 'Tender Executive', 'Sales', 'Zonal Head',
  'Finance Team', 'Legal', 'Documentation',
];

/** Facts the system already knows, used to auto-complete matching steps. */
async function deriveAutoState(bidNumber) {
  const underscored = bidNumber.replace(/\//g, '_');
  const state = {};

  const [[decode]] = await db.query(
    `SELECT status, stage, ack_required, decided_at, created_at, payload
     FROM approval_requests
     WHERE type = 'process_decode' AND bid_number IN (?, ?)
     ORDER BY id DESC LIMIT 1`,
    [bidNumber, underscored]
  );
  if (decode) {
    // The decode step is done once it has cleared the Zonal Head.
    if (decode.status === 'approved' || decode.stage === 'finance') {
      state.decode_approved = decode.decided_at || decode.created_at;
    }
    // Pricing is settled when the whole chain closes with nothing outstanding.
    if (decode.status === 'approved' && !decode.ack_required) {
      state.pricing_done = decode.decided_at;
    }
  }

  const [[sugg]] = await db.query(
    'SELECT updated_at FROM tender_processing_results WHERE bid_no = ? AND JSON_LENGTH(suggested_products) > 0 LIMIT 1',
    [bidNumber]
  );
  if (sugg) state.suggestions = sugg.updated_at;

  const [[rep]] = await db.query(
    'SELECT representation_generated_at FROM tender_processing_results WHERE bid_no = ? AND representation_generated_at IS NOT NULL LIMIT 1',
    [bidNumber]
  );
  if (rep) state.representation = rep.representation_generated_at;

  // Document reading counts as done when all three have at least one reader.
  const [[reads]] = await db.query(
    'SELECT COUNT(DISTINCT doc_type) n, MAX(read_at) at FROM tender_document_reads WHERE bid_number = ?',
    [bidNumber]
  );
  if (reads && reads.n >= 3) state.docs_read = reads.at;

  return state;
}

/** Participation mode from the tender's most recent decode sheet. */
async function participationOf(bidNumber) {
  const [[row]] = await db.query(
    `SELECT payload FROM approval_requests
     WHERE type = 'process_decode' AND bid_number IN (?, ?)
     ORDER BY id DESC LIMIT 1`,
    [bidNumber, bidNumber.replace(/\//g, '_')]
  );
  if (!row) return null;
  let p = row.payload;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return null; } }
  return p?.participation || null;
}

const fmtTat = (mins) => {
  if (mins === null || mins === undefined) return null;
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) return `${Math.round(mins / 60)} hr`;
  return `${Math.round(mins / 1440)} day${mins >= 2880 ? 's' : ''}`;
};

// GET /api/process/:bidNumber
const getProcess = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');

    const participation = await participationOf(bidNumber);
    // Until a decode sheet exists there is no participation mode; default to
    // direct so the tender team still sees the process rather than a blank tab.
    const mode = participation === 'distributor' ? 'distributor' : 'direct';

    // GeM and open tenders run different processes — which table the tender
    // lives in tells us which.
    const [[isGem]] = await db.query(
      'SELECT 1 AS ok FROM gem_tenders WHERE bid_number = ? LIMIT 1', [bidNumber]
    );
    const flow = isGem ? 'gem' : 'open';

    const [steps] = await db.query(
      'SELECT * FROM process_steps WHERE active = 1 AND flow = ? AND mode = ? ORDER BY step_no',
      [flow, mode]
    );

    const [progressRows] = await db.query(
      'SELECT * FROM tender_process_progress WHERE bid_number = ?', [bidNumber]
    );
    const progress = Object.fromEntries(progressRows.map(r => [r.step_code, r]));

    const auto = await deriveAutoState(bidNumber);

    // The first step's clock starts from when the tender was captured.
    const [[tender]] = await db.query(
      'SELECT created_at FROM gem_tenders WHERE bid_number = ? LIMIT 1', [bidNumber]
    );

    const now = Date.now();
    const tenderAt = tender?.created_at ? new Date(tender.created_at) : null;

    // First pass: resolve each step's completion, so an anchored TAT
    // ("within 24hrs post step 2") can look up the step it depends on.
    const resolved = steps.map(step => {
      const row = progress[step.code];
      const autoAt = step.auto_source ? auto[step.auto_source] : null;
      const completedAt = row?.completed_at || autoAt || null;
      return { step, row, autoAt, completedAt };
    });
    const completionByStepNo = Object.fromEntries(
      resolved.map(r => [r.step.step_no, r.completedAt])
    );

    let previousDone = tenderAt;
    const data = resolved.map(({ step, row, autoAt, completedAt }) => {
      const status = completedAt ? 'done' : (row?.status || 'pending');

      // Most steps start when the previous one finished. A few are written
      // against a specific step ("post step 2") and anchor there instead.
      const anchorAt = step.anchor_step ? completionByStepNo[step.anchor_step] : null;
      const startsAt = step.anchor_step ? anchorAt : previousDone;

      let elapsedMin = null;
      let overdue = false;
      if (startsAt) {
        const endedAt = completedAt ? new Date(completedAt).getTime() : now;
        elapsedMin = Math.max(0, Math.round((endedAt - new Date(startsAt).getTime()) / 60000));
        if (step.tat_minutes !== null && elapsedMin > step.tat_minutes) overdue = true;
      }

      previousDone = completedAt ? new Date(completedAt) : null;

      return {
        code: step.code,
        name: step.name,
        step_no: step.step_no,
        flow: step.flow,
        mode: step.mode,
        owner_role: step.owner_role,
        tat_minutes: step.tat_minutes,
        tat_text: step.tat_text,
        tat_label: step.tat_text || fmtTat(step.tat_minutes),
        anchor_step: step.anchor_step,
        status,
        auto: !!autoAt && !row?.completed_at,
        started_at: startsAt,
        completed_at: completedAt,
        note: row?.note || null,
        elapsed_minutes: elapsedMin,
        overdue,
      };
    });

    const scope = await getUserScope(req.user.id);
    res.json({
      success: true,
      participation,
      flow,
      mode,
      canMark: MARK_ROLES.includes(scope.role),
      summary: {
        total: data.length,
        done: data.filter(d => d.status === 'done').length,
        overdue: data.filter(d => d.overdue && d.status !== 'done').length,
      },
      data,
    });
  } catch (err) {
    console.error('process.getProcess:', err);
    res.status(500).json({ success: false, message: 'Failed to load the process tracker' });
  }
};

// POST /api/process/:bidNumber/:stepCode   { status, note }
const markStep = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    const { stepCode } = req.params;
    const { status = 'done', note } = req.body;

    if (!['pending', 'in_progress', 'done', 'skipped'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const scope = await getUserScope(req.user.id);
    if (!MARK_ROLES.includes(scope.role)) {
      return res.status(403).json({ success: false, message: 'Your role cannot update the process.' });
    }

    const [[step]] = await db.query('SELECT code FROM process_steps WHERE code = ?', [stepCode]);
    if (!step) return res.status(404).json({ success: false, message: 'Unknown step' });

    const completedAt = status === 'done' ? new Date() : null;
    await db.query(
      `INSERT INTO tender_process_progress
         (bid_number, step_code, status, started_at, completed_at, completed_by, note)
       VALUES (?, ?, ?, NOW(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status), completed_at = VALUES(completed_at),
         completed_by = VALUES(completed_by), note = VALUES(note)`,
      [bidNumber, stepCode, status, completedAt, req.user.id, note || null]
    );

    res.json({ success: true, message: `Step marked ${status}` });
  } catch (err) {
    console.error('process.markStep:', err);
    res.status(500).json({ success: false, message: 'Failed to update the step' });
  }
};

module.exports = { getProcess, markStep };

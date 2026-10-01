'use strict';
const db = require('../config/db');

/**
 * GET /api/timeline/:bidNumber
 *
 * Everything that has happened to one tender, merged into a single ordered
 * feed: the tender's own dates, status changes, approval requests and each
 * decision on them, pricing edits, and workspace activity.
 *
 * Each source is queried independently and failures are swallowed per-source —
 * a missing table (several are optional in this schema) must not blank out the
 * whole timeline.
 */

const safe = async (fn) => {
  try { return await fn(); } catch { return []; }
};

const getTimeline = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    const underscored = bidNumber.replace(/\//g, '_');
    const events = [];

    // ── The tender itself ────────────────────────────────────────────────
    const gem = await safe(async () => {
      const [rows] = await db.query(
        `SELECT bid_number, items, department, start_date, end_date, dept, state, created_at
         FROM gem_tenders WHERE bid_number = ? LIMIT 1`, [bidNumber]);
      return rows;
    });
    if (gem[0]) {
      const t = gem[0];
      if (t.created_at) events.push({ at: t.created_at, kind: 'tender', title: 'Tender captured', detail: t.items || null });
      if (t.start_date) events.push({ at: t.start_date, kind: 'tender', title: 'Bid opens', detail: t.department || null, raw_date: true });
      if (t.end_date) events.push({ at: t.end_date, kind: 'deadline', title: 'Bid closes', detail: t.department || null, raw_date: true });
    }

    // ── Status history ───────────────────────────────────────────────────
    const statuses = await safe(async () => {
      const [rows] = await db.query(
        `SELECT status, remarks, updated_date FROM tender_status_history
         WHERE bid_number = ? ORDER BY id`, [bidNumber]);
      return rows;
    });
    statuses.forEach(s => events.push({
      at: s.updated_date, kind: 'status',
      title: `Marked ${s.status}`, detail: s.remarks || null,
    }));

    // ── Approval requests and their decisions ────────────────────────────
    const approvals = await safe(async () => {
      const [rows] = await db.query(
        `SELECT a.*, u.name AS requester, d.name AS decider
         FROM approval_requests a
         LEFT JOIN users u ON u.id = a.requested_by
         LEFT JOIN users d ON d.id = a.decided_by
         WHERE a.bid_number IN (?, ?) ORDER BY a.id`, [bidNumber, underscored]);
      return rows;
    });

    const TYPE_LABEL = {
      tender_proceed: 'Proceed request',
      representation: 'Representation',
      document: 'Document finalisation',
      product_suggestion: 'Product suggestion',
      process_decode: 'Process Decode sheet',
      pricing: 'Pricing',
    };

    approvals.forEach(a => {
      events.push({
        at: a.created_at, kind: 'approval',
        title: `${TYPE_LABEL[a.type] || a.type} submitted`,
        detail: a.requester ? `by ${a.requester}` : null,
        meta: { stage: a.stage, reference: a.reference, remarks: a.remarks },
      });

      // Each stage decision, from the trail rather than just the last one.
      const history = Array.isArray(a.stage_history) ? a.stage_history
        : (a.stage_history ? JSON.parse(a.stage_history) : []);
      (history || []).forEach(h => {
        events.push({
          at: h.at, kind: h.decision === 'rejected' ? 'rejected' : 'approved',
          title: `${TYPE_LABEL[a.type] || a.type} ${h.decision} at ${h.stage.replace('_', ' ')}`,
          detail: h.note || null,
        });
      });

      // A decision with no trail entry (single-stage requests).
      if (a.status !== 'pending' && !(history || []).length && a.decided_at) {
        events.push({
          at: a.decided_at, kind: a.status === 'rejected' ? 'rejected' : 'approved',
          title: `${TYPE_LABEL[a.type] || a.type} ${a.status}`,
          detail: [a.decider ? `by ${a.decider}` : null, a.decision_note].filter(Boolean).join(' — ') || null,
        });
      }
    });

    // ── Pricing audit ────────────────────────────────────────────────────
    const pricing = await safe(async () => {
      const [rows] = await db.query(
        `SELECT p.action, p.field, p.new_value, p.note, p.created_at, u.name AS user_name
         FROM tender_pricing_audit p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE p.bid_number = ? ORDER BY p.id`, [bidNumber]);
      return rows;
    });
    pricing.forEach(p => events.push({
      at: p.created_at, kind: 'pricing',
      title: `Pricing ${p.action}`,
      detail: [p.user_name ? `by ${p.user_name}` : null,
        p.new_value ? `value ${p.new_value}` : null, p.note].filter(Boolean).join(' · ') || null,
    }));

    // ── Workspace activity ───────────────────────────────────────────────
    const workspace = await safe(async () => {
      const [rows] = await db.query(
        `SELECT created_at, name FROM workspaces WHERE tender_id IN (?, ?) LIMIT 5`,
        [bidNumber, underscored]);
      return rows;
    });
    workspace.forEach(w => events.push({
      at: w.created_at, kind: 'workspace', title: 'Workspace created', detail: w.name || null,
    }));

    // Dates in this schema are a mix of DATETIME and dd-mm-yyyy strings, so
    // sort on a parsed value and drop anything unparseable to the end.
    const parse = (v) => {
      if (!v) return 0;
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.getTime();
      const m = String(v).match(/(\d{2})-(\d{2})-(\d{4})/);
      return m ? new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime() : 0;
    };
    events.sort((a, b) => parse(b.at) - parse(a.at));

    res.json({ success: true, data: events, bid_number: bidNumber });
  } catch (err) {
    console.error('timeline.getTimeline:', err);
    res.status(500).json({ success: false, message: 'Failed to build the timeline' });
  }
};

module.exports = { getTimeline };

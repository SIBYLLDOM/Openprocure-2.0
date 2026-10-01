'use strict';
const db = require('../config/db');
const { getUserScope, findZonalHeads, findReporteeIds } = require('../utils/userScope');
const { notifyUsers, findApprovers, findUser } = require('../utils/notify');
const { findZsmForBid } = require('../utils/zsmStateMap');
const { setupProceedWorkspace, resetDocPrepForFreshStart } = require('../utils/workspaceSetup');

/**
 * Approval workflow for the Tender Executive role.
 *
 * An executive can browse every tender, but these actions need sign-off from a
 * Tender Admin sharing their division AND source:
 *   tender_proceed  — marking a tender 'proceed'
 *   representation  — finalising a generated representation
 *   document        — finalising a generated document
 *
 * Approvers are resolved by department match, not an explicit manager link.
 * The requester's division/source are snapshotted onto the row so a later
 * reassignment cannot re-route or orphan a pending request.
 */

const TYPES = ['tender_proceed', 'representation', 'document', 'product_suggestion', 'process_decode'];

/** Human labels used in notification titles and email bodies. */
const TYPE_LABELS = {
  tender_proceed: 'Mark tender as Proceed',
  representation: 'Representation finalisation',
  document: 'Document finalisation',
  product_suggestion: 'Product suggestion',
  process_decode: 'Process Decode sheet',
};

/**
 * Who signs off a given request.
 *
 * Product suggestions raised by Sales go to their Zonal Head (inferred from
 * overlapping working states). Everything else — including a Zonal Head's own
 * requests — goes to the Tender Admin of the requester's division+source.
 */
async function resolveApprovers(type, scope, userId, bidNumber) {
  if (type === 'process_decode') {
    // Route by the TENDER's own state to its named ZSM (see zsmStateMap.js,
    // built from the client's "ZSM Org.xlsx"), not the submitter's own
    // assigned states — whoever finalises the sheet, it reaches the ZSM who
    // actually owns that state's territory.
    if (bidNumber) {
      const zsms = await findZsmForBid(bidNumber);
      if (zsms.length) return { approvers: zsms, via: 'zonal_head', stage: 'zonal_head' };
    }
    // Couldn't resolve a zone for this tender (no state on record) — fall
    // back to the submitter's own state-scoped Zonal Head rather than
    // stranding it at Finance outright.
    if (scope.isSales) {
      const heads = await findZonalHeads(scope, userId);
      if (heads.length) return { approvers: heads, via: 'zonal_head', stage: 'zonal_head' };
    }
    return { approvers: await findFinanceTeam(), via: 'finance', stage: 'finance' };
  }

  if (type === 'product_suggestion' && scope.isSales) {
    const heads = await findZonalHeads(scope, userId);
    if (heads.length) return { approvers: heads, via: 'zonal_head', stage: 'zonal_head' };
    // No Zonal Head covers their states — fall through to the Tender Admin so
    // the request is never stranded.
  }
  const admins = await findApprovers(scope.divisions[0] || null, scope.sources[0] || null);
  return { approvers: admins, via: 'tender_admin', stage: 'tender_admin' };
}

/** Everyone on the Finance Team — the final stage for a Process Decode sheet. */
async function findFinanceTeam() {
  const [rows] = await db.query(
    "SELECT id, name, email FROM users WHERE role = 'Finance Team' AND status = 'Active'"
  );
  if (rows.length) return rows;
  // No Finance user configured yet — fall back to Admin so nothing is stranded.
  const [admins] = await db.query(
    "SELECT id, name, email FROM users WHERE role = 'Admin' AND status = 'Active'"
  );
  return admins;
}

/**
 * Notifies the Tender Admins who can act on a freshly-raised request.
 * Best-effort: a mail/notification failure must not fail the request itself.
 */
async function notifyRequestRaised(requestId, { type, bidNumber, reference, remarks }, requester, scope, approvers, via) {
  try {
    const division = scope.divisions[0] || null;
    const source = scope.sources[0] || null;
    if (!approvers || !approvers.length) {
      console.warn(`[approvals] request ${requestId} has no approver in ${division}-${source}`);
      return;
    }
    await notifyUsers(approvers, {
      type: 'approval_requested',
      title: `Approval needed: ${TYPE_LABELS[type] || type}`,
      body: `<b>${requester.name}</b> has requested approval on tender <b>${bidNumber}</b>.`,
      link: '/Admin/approvals',
      refType: 'approval_request',
      refId: String(requestId),
      emailSubject: `[OpenProcure] Approval needed — ${bidNumber}`,
      ctaLabel: 'Review request',
      emailRows: [
        ['Action', TYPE_LABELS[type] || type],
        ['Tender', bidNumber],
        ['Requested by', `${requester.name} (${requester.email})`],
        ['Department', [division, source].filter(Boolean).join(' · ') || '—'],
        ['States', (scope.states || []).join(', ') || '—'],
        ['Routed to', via === 'zonal_head' ? 'Zonal Head' : 'Tender Admin'],
        ['Reference', reference || '—'],
        ['Remarks', remarks || '—'],
      ],
    });
  } catch (err) {
    console.error('[approvals] notifyRequestRaised failed:', err.message);
  }
}

/**
 * Notifies the requester once their request has been approved or rejected.
 *
 * For a Process Decode sheet the Zonal Head is copied in as well: they signed
 * it off on the way through, so if Finance sends it back they need to know
 * without having to go looking.
 */
async function notifyDecision(request, decision, note, decider) {
  try {
    const requester = await findUser(request.requested_by);
    if (!requester) return;
    const approved = decision === 'approved';

    const recipients = [requester];
    if (request.type === 'process_decode') {
      const history = Array.isArray(request.stage_history) ? request.stage_history
        : (request.stage_history ? JSON.parse(request.stage_history) : []);
      const zhEntry = (history || []).find(h => h.stage === 'zonal_head');
      if (zhEntry?.by && zhEntry.by !== requester.id && zhEntry.by !== decider?.id) {
        const zh = await findUser(zhEntry.by);
        if (zh) recipients.push(zh);
      }
    }

    await notifyUsers(recipients, {
      type: `approval_${decision}`,
      title: `Request ${approved ? 'approved' : 'rejected'}: ${TYPE_LABELS[request.type] || request.type}`,
      body: approved
        ? `Your request on tender <b>${request.bid_number}</b> was approved by <b>${decider.name}</b>.`
        : `Your request on tender <b>${request.bid_number}</b> was rejected by <b>${decider.name}</b>.`,
      link: '/Admin/approvals',
      refType: 'approval_request',
      refId: String(request.id),
      emailSubject: `[OpenProcure] Request ${approved ? 'approved' : 'rejected'} — ${request.bid_number}`,
      ctaLabel: 'View request',
      emailRows: [
        ['Action', TYPE_LABELS[request.type] || request.type],
        ['Tender', request.bid_number],
        ['Decision', approved ? 'Approved' : 'Rejected'],
        ['Decided by', `${decider.name} (${decider.email})`],
        ['Note', note || '—'],
      ],
    });
  } catch (err) {
    console.error('[approvals] notifyDecision failed:', err.message);
  }
}




/** Tells the Finance Team a Process Decode sheet has reached them. */
async function notifyStageAdvanced(request, financeUsers, deciderId) {
  try {
    if (!financeUsers.length) return;
    const decider = await findUser(deciderId);
    const requester = await findUser(request.requested_by);
    await notifyUsers(financeUsers, {
      type: 'approval_requested',
      title: 'Finance approval needed: Process Decode sheet',
      body: `A Process Decode sheet for <b>${request.bid_number}</b> was approved by `
        + `<b>${decider?.name || 'the Zonal Head'}</b> and now needs Finance sign-off.`,
      link: '/Admin/approvals',
      refType: 'approval_request',
      refId: String(request.id),
      emailSubject: `[OpenProcure] Finance approval needed — ${request.bid_number}`,
      ctaLabel: 'Review sheet',
      emailRows: [
        ['Tender', request.bid_number],
        ['Raised by', requester ? `${requester.name} (${requester.email})` : '—'],
        ['Approved by', decider ? `${decider.name} (${decider.email})` : '—'],
        ['Stage', 'Finance'],
      ],
    });
  } catch (err) {
    console.error('[approvals] notifyStageAdvanced failed:', err.message);
  }
}

/**
 * Roles whose actions need sign-off. Admin and Tender Admin act directly;
 * Tender Executive, Sales and Zonal Head all raise requests.
 */
function requiresApproval(scope) {
  return scope.isExecutive || scope.isSales || scope.isZonalHead;
}

/**
 * Creates a pending request. Returns the inserted row id.
 * Safe to call from other controllers (doc/representation finalisation).
 */
async function createRequest({ type, bidNumber, reference = null, payload = null, userId, scope, remarks = null }) {
  const [result] = await db.query(
    `INSERT INTO approval_requests
       (type, bid_number, reference, payload, requested_by, division, source, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      type,
      bidNumber,
      reference,
      payload ? JSON.stringify(payload) : null,
      userId,
      scope.divisions[0] || null,
      scope.sources[0] || null,
      remarks,
    ]
  );

  // Resolve who signs this off and record it, so a Zonal Head's queue can be
  // read straight off the row instead of re-deriving the reporting tree later.
  const { approvers, via, stage } = await resolveApprovers(type, scope, userId, bidNumber);
  await db.query('UPDATE approval_requests SET approver_id = ?, stage = ? WHERE id = ?',
    [approvers[0]?.id || null, stage, result.insertId]);

  // Notify here rather than in the HTTP handler, so every entry point is
  // covered — the status modal calls createRequest() directly.
  const requester = await findUser(userId);
  if (requester) {
    await notifyRequestRaised(
      result.insertId, { type, bidNumber, reference, remarks }, requester, scope, approvers, via
    );
  }

  return result.insertId;
}

/**
 * True when this bid already has an approved request of the given type.
 *
 * Bid numbers reach us in two shapes: with slashes (GEM/2026/B/123, as stored)
 * and with underscores (GEM_2026_B_123, as they appear in URLs, since a bid
 * number cannot go in a path segment unescaped). Some open-tender ids contain
 * genuine underscores, so rather than picking one canonical form we compare
 * both the raw value and its slash-swapped twin.
 */
async function isApproved(type, bidNumber, userId = null) {
  const swapped = bidNumber.includes('/')
    ? bidNumber.replace(/\//g, '_')
    : bidNumber.replace(/_/g, '/');

  const params = [type, bidNumber, swapped];
  let sql = `SELECT id FROM approval_requests
             WHERE type = ? AND bid_number IN (?, ?) AND status = 'approved'`;
  if (userId) { sql += ' AND requested_by = ?'; params.push(userId); }
  const [rows] = await db.query(sql + ' LIMIT 1', params);
  return rows.length > 0;
}

/* ============================ HTTP handlers ============================ */

// POST /api/approvals  — an executive raises a request
const create = async (req, res) => {
  try {
    const { type, bidNumber, reference, payload, remarks } = req.body;
    if (!TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of ${TYPES.join(', ')}` });
    }
    if (!bidNumber) {
      return res.status(400).json({ success: false, message: 'bidNumber is required' });
    }

    const scope = await getUserScope(req.user.id);
    if (!requiresApproval(scope)) {
      return res.status(400).json({
        success: false,
        message: 'Your role can perform this action directly; no approval needed.',
      });
    }
    if (!scope.divisions.length || !scope.sources.length) {
      return res.status(400).json({
        success: false,
        message: 'You have no department assigned, so there is no Tender Admin to approve this.',
      });
    }

    // Don't stack duplicates for the same action on the same bid.
    const [[existing]] = await db.query(
      `SELECT id FROM approval_requests
       WHERE type = ? AND bid_number = ? AND requested_by = ? AND status = 'pending'
       LIMIT 1`,
      [type, bidNumber, req.user.id]
    );
    if (existing) {
      return res.status(409).json({ success: false, message: 'A request for this is already pending.', id: existing.id });
    }

    const id = await createRequest({
      type, bidNumber, reference, payload, remarks,
      userId: req.user.id, scope,
    });

    // Name the actual destination — routing differs by type and role, so a
    // blanket "sent to your Tender Admin" was wrong for most requests.
    const [[saved]] = await db.query('SELECT stage FROM approval_requests WHERE id = ?', [id]);
    const destination = {
      zonal_head: 'your Zonal Head',
      finance: 'the Finance Team',
      tender_admin: 'your Tender Admin',
    }[saved?.stage] || 'your approver';

    res.status(201).json({ success: true, message: `Sent to ${destination} for approval`, id, stage: saved?.stage });
  } catch (err) {
    console.error('approvals.create:', err);
    res.status(500).json({ success: false, message: 'Failed to raise approval request' });
  }
};

// GET /api/approvals — pending queue for an approver, or own requests for an executive
const list = async (req, res) => {
  try {
    const { status = 'pending', type = '' } = req.query;
    const scope = await getUserScope(req.user.id);

    // "Pending" means "still needs someone to act". An approved-with-changes
    // sheet awaiting acknowledgement qualifies — the work is not finished, so
    // it belongs in the pending tab rather than being filed under approved.
    const conditions = [status === 'pending'
      ? "(a.status = 'pending' OR (a.status = 'approved' AND a.ack_required = 1))"
      : 'a.status = ?'];
    const params = status === 'pending' ? [] : [status];
    if (type) { conditions.push('a.type = ?'); params.push(type); }

    if (scope.role === 'Finance Team') {
      // Finance oversees the whole pipeline — every request, every type,
      // every status. No extra predicate.
    } else if (scope.isExecutive || scope.isSales) {
      // These roles only ever see what they raised themselves.
      conditions.push('a.requested_by = ?');
      params.push(req.user.id);
    } else if (scope.isZonalHead) {
      // A Zonal Head sees their reportees' requests (by state overlap) plus
      // anything routed explicitly to them, and their own requests.
      const reportees = await findReporteeIds(scope, req.user.id);
      const ors = ['a.approver_id = ?', 'a.requested_by = ?'];
      params.push(req.user.id, req.user.id);
      if (reportees.length) {
        ors.push(`a.requested_by IN (${reportees.map(() => '?').join(',')})`);
        params.push(...reportees);
      }
      conditions.push(`(${ors.join(' OR ')})`);
    } else if (!scope.isAdmin) {
      // A Tender Admin sees requests whose snapshotted department matches
      // theirs on BOTH axes — the same rule as every other listing.
      if (!scope.divisions.length || !scope.sources.length) {
        return res.json({ success: true, data: [] });
      }
      conditions.push(`a.division IN (${scope.divisions.map(() => '?').join(',')})`);
      params.push(...scope.divisions);
      conditions.push(`a.source IN (${scope.sources.map(() => '?').join(',')})`);
      params.push(...scope.sources);
    }
    // Admin sees everything.

    let [rows] = await db.query(
      `SELECT a.*, u.name AS requested_by_name, u.email AS requested_by_email,
              d.name AS decided_by_name
       FROM approval_requests a
       LEFT JOIN users u ON u.id = a.requested_by
       LEFT JOIN users d ON d.id = a.decided_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT 200`,
      params
    );

    // A Process Decode sheet routes to the ZSM(s) who own the tender's state
    // (findZsmForBid — West Bengal routes to two), but only the first one is
    // stored as approver_id — the condition above alone would hide it from
    // the other. Widen it here: pull every zonal_head-stage row this caller
    // doesn't already have, and keep the ones where they're actually one of
    // that tender's ZSMs.
    if (scope.isZonalHead) {
      const seen = new Set(rows.map(r => r.id));
      const extraConditions = [conditions[0], "a.type = 'process_decode'", "a.stage = 'zonal_head'"];
      const extraParams = [...(status === 'pending' ? [] : [status])];
      if (type && type !== 'process_decode') {
        // caller asked for a different type only — nothing extra to widen
      } else {
        const [candidates] = await db.query(
          `SELECT a.*, u.name AS requested_by_name, u.email AS requested_by_email,
                  d.name AS decided_by_name
           FROM approval_requests a
           LEFT JOIN users u ON u.id = a.requested_by
           LEFT JOIN users d ON d.id = a.decided_by
           WHERE ${extraConditions.join(' AND ')}
           ORDER BY a.created_at DESC
           LIMIT 200`,
          extraParams
        );
        for (const cand of candidates) {
          if (seen.has(cand.id)) continue;
          const zsms = await findZsmForBid(cand.bid_number);
          if (zsms.some(h => h.id === req.user.id)) {
            rows.push(cand);
            seen.add(cand.id);
          }
        }
        rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        rows = rows.slice(0, 200);
      }
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('approvals.list:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch approvals' });
  }
};

// PATCH /api/approvals/:id — approve or reject

/**
 * Whether `scope` may act on `request` — used both for deciding it and for
 * editing the sheet attached to it, so the two can never drift apart.
 * Returns null when allowed, or a { code, message } refusal.
 */
async function canActOn(scope, request, userId) {
  if (scope.isExecutive || scope.isSales) {
    return { code: 403, message: 'Your role cannot approve requests.' };
  }

  if (scope.role === 'Finance Team') {
    // Finance only acts on what has actually reached them.
    if (request.stage !== 'finance') {
      return { code: 403, message: 'This request has not reached the Finance stage yet.' };
    }
    return null;
  }

  if (scope.isZonalHead) {
    // Only while the request is actually at their stage — once they have
    // approved it on to Finance it is no longer theirs to decide or edit.
    if (request.stage && request.stage !== 'zonal_head') {
      return { code: 403, message: 'This request has already moved past your stage.' };
    }
    // A Zonal Head acts only on their own reportees' requests, never their
    // own — those escalate to a Tender Admin.
    if (request.requested_by === userId) {
      return { code: 403, message: 'You cannot approve your own request.' };
    }
    const reportees = await findReporteeIds(scope, userId);
    if (request.approver_id !== userId && !reportees.includes(request.requested_by)) {
      // Not the stored primary approver and not a direct reportee's request —
      // last check: a Process Decode sheet can route to more than one ZSM
      // (West Bengal), so either of them may still act on it.
      let inZoneTeam = false;
      if (request.type === 'process_decode') {
        const zsms = await findZsmForBid(request.bid_number);
        inZoneTeam = zsms.some(h => h.id === userId);
      }
      if (!inZoneTeam) {
        return { code: 403, message: 'This request is not from your team.' };
      }
    }
    return null;
  }

  if (!scope.isAdmin) {
    // A Tender Admin acts only on requests from their own department, and only
    // while the request is at their stage.
    if (request.stage && request.stage !== 'tender_admin') {
      return { code: 403, message: 'This request is not at your stage.' };
    }
    if (!scope.divisions.includes(request.division) || !scope.sources.includes(request.source)) {
      return { code: 403, message: 'This request belongs to another department.' };
    }
  }
  return null;
}

const decide = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, note } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, message: "decision must be 'approved' or 'rejected'" });
    }

    const scope = await getUserScope(req.user.id);

    const [[request]] = await db.query('SELECT * FROM approval_requests WHERE id = ?', [id]);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, message: `Already ${request.status}.` });
    }

    // Rejections must say why — an approver sending work back without a reason
    // leaves the requester guessing.
    if (decision === 'rejected' && !String(note || '').trim()) {
      return res.status(400).json({ success: false, message: 'A comment is required when rejecting.' });
    }

    const refusal = await canActOn(scope, request, req.user.id);
    if (refusal) return res.status(refusal.code).json({ success: false, message: refusal.message });

    // Append this decision to the trail before anything is overwritten.
    const history = Array.isArray(request.stage_history) ? request.stage_history
      : (request.stage_history ? JSON.parse(request.stage_history) : []);
    history.push({
      stage: request.stage,
      decision,
      note: note || null,
      by: req.user.id,
      at: new Date().toISOString(),
    });

    // A Process Decode approved by the Zonal Head is not finished — it moves on
    // to Finance and stays pending. Everything else closes here.
    const movesToFinance =
      decision === 'approved' &&
      request.type === 'process_decode' &&
      request.stage === 'zonal_head';

    if (movesToFinance) {
      const finance = await findFinanceTeam();
      await db.query(
        `UPDATE approval_requests
         SET stage = 'finance', approver_id = ?, stage_history = ?,
             decided_by = ?, decided_at = NOW(), decision_note = ?
         WHERE id = ?`,
        [finance[0]?.id || null, JSON.stringify(history), req.user.id, note || null, id]
      );
      await notifyStageAdvanced(request, finance, req.user.id);
      return res.json({
        success: true,
        message: 'Approved and forwarded to the Finance Team',
        stage: 'finance',
      });
    }

    // An approval that changed the numbers has to be acknowledged by the people
    // who own them; an untouched approval needs nothing further.
    const needsAck = decision === 'approved' && !!request.approver_modified;

    await db.query(
      `UPDATE approval_requests
       SET status = ?, decision_note = ?, decided_by = ?, decided_at = NOW(),
           stage_history = ?, ack_required = ?
       WHERE id = ?`,
      [decision, note || null, req.user.id, JSON.stringify(history), needsAck ? 1 : 0, id]
    );

    if (needsAck) await notifyAckRequired(request, req.user.id, note);

    // Tell the requester what happened. Best-effort; never blocks the decision.
    const decider = await findUser(req.user.id);
    await notifyDecision(request, decision, note, decider || { name: 'A Tender Admin', email: '' });

    // Approving a 'proceed' request is what actually moves the tender — the
    // executive's original click only recorded the intent.
    if (decision === 'approved' && request.type === 'tender_proceed') {
      await db.query(
        `INSERT INTO tender_status_history (bid_number, status, remarks, marked_by, created_date, updated_date)
         VALUES (?, 'proceed', ?, ?, NOW(), NOW())`,
        [request.bid_number, request.remarks || 'Approved by Tender Admin', request.requested_by]
      );

      // A proceeding tender always needs Sales and Finance on it, so stand the
      // workspace departments up now rather than waiting for someone to do it —
      // and Doc Prep always starts fresh, even if this bid was analyzed before.
      await resetDocPrepForFreshStart(request.bid_number);
      await setupProceedWorkspace(request.bid_number, {
        division: request.division, source: request.source,
      });
    }

    res.json({ success: true, message: `Request ${decision}` });
  } catch (err) {
    console.error('approvals.decide:', err);
    res.status(500).json({ success: false, message: 'Failed to record decision' });
  }
};

// GET /api/approvals/status?type=&bidNumber= — is this action cleared?
const status = async (req, res) => {
  try {
    const { type, bidNumber } = req.query;
    if (!TYPES.includes(type) || !bidNumber) {
      return res.status(400).json({ success: false, message: 'type and bidNumber are required' });
    }
    const scope = await getUserScope(req.user.id);
    if (!requiresApproval(scope)) {
      return res.json({ success: true, required: false, approved: true, state: 'not_required' });
    }
    const [[row]] = await db.query(
      `SELECT status FROM approval_requests
       WHERE type = ? AND bid_number = ? AND requested_by = ?
       ORDER BY created_at DESC LIMIT 1`,
      [type, bidNumber, req.user.id]
    );
    res.json({
      success: true,
      required: true,
      approved: row?.status === 'approved',
      state: row?.status || 'none',
    });
  } catch (err) {
    console.error('approvals.status:', err);
    res.status(500).json({ success: false, message: 'Failed to check approval status' });
  }
};


/**
 * PATCH /api/approvals/:id/payload
 *
 * Lets the requester revise a still-pending submission — a Process Decode sheet
 * stays editable until someone acts on it, and the approver must see the latest
 * version rather than whatever was first sent. Refused once a decision is made.
 */
const updatePayload = async (req, res) => {
  try {
    const [[request]] = await db.query('SELECT * FROM approval_requests WHERE id = ?', [req.params.id]);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    // The requester may revise their own submission; so may whoever it is
    // currently sitting with, so a Zonal Head can correct rates before
    // approving rather than bouncing the sheet back for a typo.
    if (request.requested_by !== req.user.id) {
      const scope = await getUserScope(req.user.id);
      const refusal = await canActOn(scope, request, req.user.id);
      if (refusal) {
        return res.status(refusal.code).json({
          success: false,
          message: refusal.code === 403 && scope.isSales
            ? 'This is not your request.'
            : refusal.message,
        });
      }
    }
    if (request.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: `This request has already been ${request.status} and can no longer be edited.`,
      });
    }

    // Remember whether the change came from an approver rather than the owner —
    // that is what turns a later approval into one needing acknowledgement.
    const byApprover = request.requested_by !== req.user.id;

    await db.query(
      `UPDATE approval_requests
       SET payload = ?, reference = ?, remarks = ?,
           approver_modified = IF(?, 1, approver_modified)
       WHERE id = ?`,
      [
        req.body.payload ? JSON.stringify(req.body.payload) : null,
        req.body.reference ?? request.reference,
        req.body.remarks ?? request.remarks,
        byApprover ? 1 : 0,
        req.params.id,
      ]
    );
    res.json({ success: true, message: 'Submission updated' });
  } catch (err) {
    console.error('approvals.updatePayload:', err);
    res.status(500).json({ success: false, message: 'Failed to update submission' });
  }
};


/**
 * Everyone who must acknowledge a modified-then-approved sheet: the requester,
 * plus whoever signed it off at the zonal_head stage.
 */
async function ackAudience(request) {
  const people = [];
  const requester = await findUser(request.requested_by);
  if (requester) people.push(requester);

  const history = Array.isArray(request.stage_history) ? request.stage_history
    : (request.stage_history ? JSON.parse(request.stage_history) : []);
  const zh = (history || []).find(h => h.stage === 'zonal_head');
  if (zh?.by && zh.by !== request.requested_by) {
    const head = await findUser(zh.by);
    if (head) people.push(head);
  }
  return people;
}

/** Tells them the sheet was approved but the numbers were changed first. */
async function notifyAckRequired(request, deciderId, note) {
  try {
    const decider = await findUser(deciderId);
    const people = await ackAudience(request);
    if (!people.length) return;

    await notifyUsers(people, {
      type: 'approval_modified',
      title: 'Approved with changes — please acknowledge',
      body: `<b>${decider?.name || 'The approver'}</b> changed the pricing on `
        + `<b>${request.bid_number}</b> before approving it. Review the revised sheet and acknowledge.`,
      link: '/Admin/approvals',
      refType: 'approval_request',
      refId: String(request.id),
      emailSubject: `[OpenProcure] Approved with changes — ${request.bid_number}`,
      ctaLabel: 'Review and acknowledge',
      emailRows: [
        ['Tender', request.bid_number],
        ['Changed and approved by', decider ? `${decider.name} (${decider.email})` : '—'],
        ['Note', note || '—'],
      ],
    });
  } catch (err) {
    console.error('[approvals] notifyAckRequired failed:', err.message);
  }
}


/**
 * Once the changed pricing has been acknowledged by everyone required, the
 * tender team needs to know the sheet is settled — they act on the final
 * numbers, but sit outside the Sales -> Zonal Head -> Finance chain and would
 * otherwise never hear that it closed.
 */
async function notifyTenderTeamAcknowledged(request, acknowledgements) {
  try {
    const admins = await findApprovers(request.division, request.source);

    const params = [];
    let sql = `SELECT DISTINCT u.id, u.name, u.email FROM users u
               WHERE u.role = 'Tender Executive' AND u.status = 'Active'`;
    if (request.division) {
      sql += ` AND EXISTS (SELECT 1 FROM user_departments d WHERE d.user_id = u.id
               AND d.type = 'department' AND d.department = ?)`;
      params.push(request.division);
    }
    if (request.source) {
      sql += ` AND EXISTS (SELECT 1 FROM user_departments f WHERE f.user_id = u.id
               AND f.type = 'field' AND f.department = ?)`;
      params.push(request.source);
    }
    const [executives] = await db.query(sql, params);

    // De-duplicate: the Admin fallback can appear in both lists.
    const seen = new Set();
    const people = [...admins, ...executives].filter(p => {
      if (!p || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    if (!people.length) return;

    const names = (acknowledgements || []).map(a => a.name).filter(Boolean).join(', ');
    await notifyUsers(people, {
      type: 'pricing_finalised',
      title: 'Pricing finalised: Process Decode sheet',
      body: `Finance approved <b>${request.bid_number}</b> with changes, and `
        + `${names || 'the team'} acknowledged it. The sheet is now final.`,
      link: '/Admin/approvals',
      refType: 'approval_request',
      refId: String(request.id),
      emailSubject: `[OpenProcure] Pricing finalised — ${request.bid_number}`,
      ctaLabel: 'View the sheet',
      emailRows: [
        ['Tender', request.bid_number],
        ['Department', [request.division, request.source].filter(Boolean).join(' · ') || '—'],
        ['Finance note', request.decision_note || '—'],
        ['Acknowledged by', names || '—'],
      ],
    });
  } catch (err) {
    console.error('[approvals] notifyTenderTeamAcknowledged failed:', err.message);
  }
}

/**
 * POST /api/approvals/:id/acknowledge
 * Records that this user has seen the approver's changes.
 */
const acknowledge = async (req, res) => {
  try {
    const [[request]] = await db.query('SELECT * FROM approval_requests WHERE id = ?', [req.params.id]);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (!request.ack_required) {
      return res.status(400).json({ success: false, message: 'This request does not need acknowledgement.' });
    }

    const audience = await ackAudience(request);
    if (!audience.some(p => p.id === req.user.id)) {
      return res.status(403).json({ success: false, message: 'This is not yours to acknowledge.' });
    }

    const existing = Array.isArray(request.acknowledgements) ? request.acknowledgements
      : (request.acknowledgements ? JSON.parse(request.acknowledgements) : []);
    if (existing.some(a => a.user_id === req.user.id)) {
      return res.json({ success: true, message: 'Already acknowledged', acknowledgements: existing });
    }

    const me = await findUser(req.user.id);
    const next = [...existing, { user_id: req.user.id, name: me?.name || null, at: new Date().toISOString() }];

    // Once everyone required has acknowledged, the flag comes down.
    const allDone = audience.every(p => next.some(a => a.user_id === p.id));
    await db.query(
      'UPDATE approval_requests SET acknowledgements = ?, ack_required = ? WHERE id = ?',
      [JSON.stringify(next), allDone ? 0 : 1, req.params.id]
    );

    // Only once the last person has acknowledged — telling the tender team on
    // each individual acknowledgement would just be noise.
    if (allDone) await notifyTenderTeamAcknowledged(request, next);

    res.json({ success: true, message: 'Acknowledged', acknowledgements: next, allDone });
  } catch (err) {
    console.error('approvals.acknowledge:', err);
    res.status(500).json({ success: false, message: 'Failed to record acknowledgement' });
  }
};

module.exports = {
  create, list, decide, status, updatePayload, acknowledge,
  requiresApproval, createRequest, isApproved, TYPES,
};

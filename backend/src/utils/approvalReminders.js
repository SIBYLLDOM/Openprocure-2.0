'use strict';
const db = require('../config/db');
const { notifyUsers, findUser } = require('./notify');

const TYPE_LABELS = {
  tender_proceed: 'Mark tender as Proceed',
  representation: 'Representation finalisation',
  document: 'Document finalisation',
  product_suggestion: 'Product suggestion',
  process_decode: 'Process Decode sheet',
  pricing: 'Pricing',
};

/**
 * Reminds the Zonal Head about any request that's been sitting at their
 * stage, still pending, for 24+ hours — Sales raises a request and it can
 * otherwise sit unseen indefinitely if the Zonal Head doesn't happen to
 * check their queue. One reminder per request (reminder_sent_at gates it so
 * re-running this on a timer doesn't re-email the same request every pass).
 *
 * Scoped to the zonal_head stage specifically, per the ask — not finance or
 * tender_admin — but the shape here generalizes easily if that's wanted later.
 */
async function checkOverdueZonalHeadApprovals() {
  try {
    const [rows] = await db.query(
      `SELECT * FROM approval_requests
       WHERE status = 'pending' AND stage = 'zonal_head'
         AND created_at <= (NOW() - INTERVAL 24 HOUR)
         AND reminder_sent_at IS NULL
       LIMIT 100`
    );

    for (const request of rows) {
      try {
        if (!request.approver_id) continue; // nothing to remind — no Zonal Head was resolved
        const approver = await findUser(request.approver_id);
        if (!approver) continue;
        const requester = await findUser(request.requested_by);

        const hoursWaiting = Math.floor((Date.now() - new Date(request.created_at).getTime()) / (60 * 60 * 1000));

        await notifyUsers([approver], {
          type: 'approval_reminder',
          title: `Reminder: approval pending on ${request.bid_number}`,
          body: `A request on tender <b>${request.bid_number}</b> has been waiting on your approval for over 24 hours.`,
          link: '/Admin/approvals',
          refType: 'approval_request',
          refId: String(request.id),
          emailSubject: `[OpenProcure] Reminder — approval pending on ${request.bid_number}`,
          ctaLabel: 'Review request',
          emailRows: [
            ['Action', TYPE_LABELS[request.type] || request.type],
            ['Tender', request.bid_number],
            ['Requested by', requester ? `${requester.name} (${requester.email})` : '—'],
            ['Waiting', `${hoursWaiting} hour${hoursWaiting === 1 ? '' : 's'}`],
            ['Remarks', request.remarks || '—'],
          ],
        });

        await db.query('UPDATE approval_requests SET reminder_sent_at = NOW() WHERE id = ?', [request.id]);
        console.log(`[approval-reminders] sent 24h reminder for request ${request.id} (${request.bid_number}) to ${approver.email}`);
      } catch (err) {
        console.error(`[approval-reminders] failed for request ${request.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[approval-reminders] check failed:', err.message);
  }
}

/** Starts the recurring check. Call once at server boot. */
function startApprovalReminderScheduler() {
  const INTERVAL_MS = 30 * 60 * 1000; // check every 30 minutes — reminders themselves are still capped at one-per-request via reminder_sent_at
  setInterval(() => { checkOverdueZonalHeadApprovals().catch(() => {}); }, INTERVAL_MS);
  // Also run shortly after boot, not immediately, so a slow DB connection on
  // startup doesn't race this.
  setTimeout(() => { checkOverdueZonalHeadApprovals().catch(() => {}); }, 60 * 1000);
}

module.exports = { checkOverdueZonalHeadApprovals, startApprovalReminderScheduler };

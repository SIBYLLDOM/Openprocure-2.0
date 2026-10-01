'use strict';
const db = require('../config/db');
const { notifyUsers } = require('./notify');

/**
 * Emails every active Tender Admin about a Library file whose expiry date
 * (parsed from its filename, or set manually) falls within the next 3
 * months — certificates like CE/MSC/NCC/WHO GMP/Mfg License need renewing
 * well ahead of time, so this gives a heads-up rather than discovering the
 * lapse when a tender actually needs the document.
 *
 * One reminder per file (expiry_reminder_sent_at gates it, same pattern as
 * approval_requests.reminder_sent_at) — editing the expiry date clears that
 * column (see library.controller.js updateExpiry) so a pushed-out or
 * corrected date can trigger a fresh reminder later.
 */
// mysql2 returns a DATE column as a JS Date built from local-time parts (see
// config/db.js — no `dateStrings` option), so String(date)/toISOString() both
// risk shifting the calendar day once timezone conversion gets involved.
// Local getters give back exactly what's stored.
function formatDateOnly(val) {
  if (!val) return null;
  const y = val.getFullYear();
  const m = String(val.getMonth() + 1).padStart(2, '0');
  const d = String(val.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function checkExpiringLibraryFiles() {
  try {
    const [rows] = await db.query(
      `SELECT id, name, file_path, parent_id, expiry_date FROM library_items
       WHERE type = 'file' AND expiry_date IS NOT NULL
         AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 3 MONTH)
         AND expiry_reminder_sent_at IS NULL
       LIMIT 100`
    );
    if (!rows.length) return;

    const [admins] = await db.query(
      `SELECT id, name, email FROM users WHERE role IN ('Tender Admin','Office Administrator') AND status = 'Active'`
    );
    if (!admins.length) return;

    for (const file of rows) {
      try {
        const expiry = new Date(file.expiry_date);
        const daysLeft = Math.ceil((expiry - new Date()) / 86400000);
        const statusLabel = daysLeft < 0 ? `expired ${Math.abs(daysLeft)} day(s) ago` : `expires in ${daysLeft} day(s)`;
        const expiryStr = formatDateOnly(file.expiry_date);

        await notifyUsers(admins, {
          type: 'library_expiry',
          title: `Library file expiring soon: ${file.name}`,
          body: `A file in the Library — <b>${file.name}</b> — ${statusLabel}. Please arrange renewal.`,
          link: file.parent_id ? `/Admin/workdesk/library?folder_id=${file.parent_id}` : '/Admin/workdesk/library',
          refType: 'library_item',
          refId: String(file.id),
          emailSubject: `[OpenProcure] Library file expiring soon — ${file.name}`,
          ctaLabel: 'Open in Library',
          emailRows: [
            ['File name', file.name],
            ['File path', file.file_path || '—'],
            ['Expiry date', expiryStr],
            ['Status', statusLabel],
          ],
        });

        await db.query('UPDATE library_items SET expiry_reminder_sent_at = NOW() WHERE id = ?', [file.id]);
        console.log(`[library-expiry-reminders] sent reminder for file ${file.id} (${file.name}) to ${admins.length} Tender Admin(s)`);
      } catch (err) {
        console.error(`[library-expiry-reminders] failed for file ${file.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[library-expiry-reminders] check failed:', err.message);
  }
}

/** Starts the recurring check. Call once at server boot. */
function startLibraryExpiryReminderScheduler() {
  const INTERVAL_MS = 60 * 60 * 1000; // hourly — reminders are still capped at one-per-file via expiry_reminder_sent_at
  setInterval(() => { checkExpiringLibraryFiles().catch(() => {}); }, INTERVAL_MS);
  // Run once shortly after boot, staggered after the expiry-date backfill
  // (library.controller.js runs that at +60s) so newly-parsed dates are
  // already in place before the first reminder pass.
  setTimeout(() => { checkExpiringLibraryFiles().catch(() => {}); }, 90 * 1000);
}

module.exports = { checkExpiringLibraryFiles, startLibraryExpiryReminderScheduler };

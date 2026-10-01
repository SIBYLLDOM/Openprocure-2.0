'use strict';
// Loaded here too so the mailer works when required from a standalone script
// (migrations, one-off jobs) that hasn't already initialised dotenv.
require('dotenv').config();
const nodemailer = require('nodemailer');

const REQUIRED_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];

/**
 * Startup check — logs a clear, actionable error if the SMTP relay isn't
 * configured, WITHOUT ever printing the actual values (credentials included).
 * Mirrors config/db.js's own pattern of warning rather than crashing the
 * process: a misconfigured mailer shouldn't take down a server whose main
 * job isn't sending email.
 */
function validateEmailConfig() {
  const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
  if (missing.length) {
    console.warn(
      `[mailer] Missing required environment variable(s): ${missing.join(', ')}. ` +
      `Emails will be skipped until these are set (see backend/.env.example).`
    );
    return false;
  }
  return true;
}
validateEmailConfig();

/**
 * Single shared SMTP transport (Amazon SES — see backend/.env.example).
 *
 * Credentials come from .env rather than being hardcoded — several
 * controllers used to each build their own transporter with the password
 * inline, which meant rotating it required editing five files (and leaking
 * it into source control). Every email in the app now goes through this one
 * transport instead.
 *
 * The transport is created lazily and reused, so we open one connection pool
 * for the process instead of one per call.
 */
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    console.warn('[mailer] SMTP not configured — emails will be skipped');
    return null;
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host,
    port,
    // SES's SMTP endpoint on 587 uses STARTTLS, not implicit TLS — secure
    // must be false here so nodemailer negotiates STARTTLS after connecting,
    // rather than opening a TLS socket directly (which SES's 587 listener
    // doesn't speak, unlike the old Gmail/Brevo setup on 465).
    secure: port === 465,
    auth: { user, pass },
    pool: true,
  });
  return transporter;
}

// The SMTP login (SMTP_USER) authenticates the connection, but the relay
// separately requires the "From" address to be a verified sender/domain —
// using the raw SMTP login as From gets every send rejected even though the
// login itself is fine. Keep them as two separate settings. SMTP_FROM is the
// one source of truth for the sender address — nothing else in the app
// hardcodes it.
const FROM = () => `"OpenProcure" <${process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER}>`;

// Amazon SES on this account is capped at 14 messages/second. Nothing here
// intentionally sends faster than that: every sendMail() call (regardless of
// how many happen concurrently — e.g. Budget Targeting's bulk sender) passes
// through this single gate first, using a sliding 1-second window so a burst
// of concurrent callers queues up instead of tripping SES's rate limit.
const MAX_SENDS_PER_SECOND = 14;
const recentSendTimestamps = [];

async function rateLimitGate() {
  for (;;) {
    const now = Date.now();
    while (recentSendTimestamps.length && now - recentSendTimestamps[0] >= 1000) {
      recentSendTimestamps.shift();
    }
    if (recentSendTimestamps.length < MAX_SENDS_PER_SECOND) {
      recentSendTimestamps.push(now);
      return;
    }
    const waitMs = 1000 - (now - recentSendTimestamps[0]) + 5;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

/**
 * Sends an email. Never throws — callers treat mail as best-effort so a dead
 * SMTP server cannot break the request that triggered it. Returns
 * { ok, error, messageId }. A failed send is always reported as failed
 * (ok: false) — this never claims success when SES/nodemailer rejected it.
 */
async function sendMail({ to, cc, subject, html, text, attachments }) {
  const tx = getTransporter();
  if (!tx) return { ok: false, error: 'SMTP not configured' };

  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  const ccRecipients = Array.isArray(cc) ? cc.filter(Boolean) : [cc].filter(Boolean);
  if (!recipients.length && !ccRecipients.length) return { ok: false, error: 'No recipients' };

  await rateLimitGate();

  try {
    const info = await tx.sendMail({
      from: FROM(),
      to: recipients.join(','),
      ...(ccRecipients.length && { cc: ccRecipients.join(',') }),
      subject,
      html,
      text: text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''),
      attachments, // [{ filename, path }] or [{ filename, content: Buffer }] — passed straight to nodemailer
    });
    // Safe to log: recipient, subject and the mail server's own message id.
    // Never log SMTP_PASSWORD or any AWS credential.
    console.log(`[mailer] Email sent successfully — to=${recipients.join(',')} subject="${subject}" messageId=${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    // err.message from nodemailer/SES never includes the credential itself,
    // only the server's rejection reason — safe to log as-is.
    console.error(`[mailer] Email sending failed — to=${recipients.join(',')} subject="${subject}":`, err.message);
    return { ok: false, error: err.message.slice(0, 250) };
  }
}

/** Wraps body content in the standard OpenProcure email shell. */
function layout({ heading, intro, rows = [], ctaLabel, ctaUrl, footer }) {
  const rowsHtml = rows.length
    ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
         ${rows.map(([k, v]) => `
           <tr>
             <td style="padding:7px 10px;border:1px solid #dde4f0;background:#f8fafc;font-weight:600;color:#374151;width:38%">${k}</td>
             <td style="padding:7px 10px;border:1px solid #dde4f0;color:#111827">${v ?? '—'}</td>
           </tr>`).join('')}
       </table>`
    : '';

  const ctaHtml = ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;background:#084f9a;color:#fff;text-decoration:none;
          padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;margin-top:8px">${ctaLabel || 'Open'}</a>`
    : '';

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f3f6fb;padding:24px">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:26px 28px;border:1px solid #e6ecf5">
      <h2 style="margin:0 0 6px;font-size:18px;color:#0f172a">${heading}</h2>
      ${intro ? `<p style="margin:0;color:#475569;font-size:14px;line-height:1.55">${intro}</p>` : ''}
      ${rowsHtml}
      ${ctaHtml}
      <p style="margin:22px 0 0;color:#94a3b8;font-size:12px;border-top:1px solid #eef2f7;padding-top:12px">
        ${footer || 'This is an automated message from OpenProcure.'}
      </p>
    </div>
  </div>`;
}

module.exports = { sendMail, layout, getTransporter, validateEmailConfig };

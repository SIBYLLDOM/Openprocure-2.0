'use strict';
// Dev/ops utility to confirm the SMTP relay (Amazon SES) is actually working
// end-to-end — separate from any real application email, so nobody has to
// trigger a password reset or approval just to check the relay is alive.
// Gated at the route level (see routes/emailTest.routes.js): a valid JWT for
// an Admin account is required in every environment, so this can't be hit
// anonymously in production.
const { sendMail } = require('../utils/mailer');

// POST /api/email/test  { to: "someone@example.com" }
exports.sendTestEmail = async (req, res) => {
  const { to } = req.body || {};
  if (!to || typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ success: false, message: 'A valid "to" email address is required' });
  }

  const result = await sendMail({
    to,
    subject: 'OpenProcure Amazon SES Test',
    html: '<p>This is a test email from OpenProcure using Amazon SES.</p>',
    text: 'This is a test email from OpenProcure using Amazon SES.',
  });

  // Never report success if the relay actually rejected it — and never leak
  // SMTP/AWS internals to the caller, just the safe error message sendMail()
  // already truncates.
  if (!result.ok) {
    return res.status(502).json({ success: false, message: result.error || 'Failed to send test email' });
  }

  res.json({ success: true, message: 'Test email sent', messageId: result.messageId });
};

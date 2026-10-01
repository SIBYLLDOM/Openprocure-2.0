'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/requireRole.middleware');
const { sendTestEmail } = require('../controllers/emailTest.controller');

// Admin-only in every environment — this sends a real email through the live
// SES relay, so it's gated the same way any other admin action is, not left
// open just because it's a "test" endpoint.
router.post('/test', auth, requireRole('Admin'), sendTestEmail);

module.exports = router;

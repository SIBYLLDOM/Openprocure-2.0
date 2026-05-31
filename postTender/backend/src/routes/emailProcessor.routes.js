const express = require('express');
const router = express.Router();
const emailProcessorController = require('../controllers/emailProcessor.controller');

// Process new emails manually
router.post('/process', emailProcessorController.processNewEmails);

// Get archived emails
router.get('/archive', emailProcessorController.getArchivedEmails);

// Get processing logs
router.get('/logs', emailProcessorController.getProcessingLogs);

module.exports = router;

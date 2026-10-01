const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
  getTenderTracker,
  saveTenderTrackerOverride,
  getRemarkOptions,
  exportTenderTracker,
} = require('../controllers/tenderTracker.controller');

// GET /api/tender-tracker - paginated tender tracker table
router.get('/', auth, getTenderTracker);

// GET /api/tender-tracker/remark-options - distinct Final Remarks values for the filter dropdown
router.get('/remark-options', auth, getRemarkOptions);

// GET /api/tender-tracker/export - export the (filtered) tender tracker table as Excel
router.get('/export', auth, exportTenderTracker);

// PUT /api/tender-tracker/override - save manually-entered/corrected fields for a tender
router.put('/override', auth, saveTenderTrackerOverride);

module.exports = router;

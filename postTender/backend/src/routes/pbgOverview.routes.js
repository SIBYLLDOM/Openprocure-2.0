const express = require('express');
const router = express.Router();
const pbgOverviewController = require('../controllers/pbgOverview.controller');

// GET /api/pbg-overview/overview
router.get('/overview', pbgOverviewController.getPBGOverview);

// GET /api/pbg-overview/download/:orderId/:docType
router.get('/download/:orderId/:docType', pbgOverviewController.downloadDocument);

module.exports = router;

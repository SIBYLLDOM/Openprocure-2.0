// src/routes/pbg.routes.js
const express = require('express');
const router = express.Router();
const pbgController = require('../controllers/pbg.controller');

// Get PBG overview
router.get('/overview', pbgController.getPBGOverview);

// Get PBG tracker
router.get('/tracker', pbgController.getPBGTracker);

// Upload PBG
router.post('/upload', pbgController.uploadPBG);

module.exports = router;

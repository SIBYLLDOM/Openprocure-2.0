const express = require('express');
const router = express.Router();
const pbgGenerationController = require('../controllers/pbgGeneration.controller');

// Draft generation
router.post('/draft', pbgGenerationController.draftPBG);

// Save PBG Draft
router.post('/save', pbgGenerationController.saveDraft);

// Submit PBG Draft
router.post('/submit', pbgGenerationController.submitDraft);

// Get PBG Draft
router.get('/get/:bidNo', pbgGenerationController.getDraft);

module.exports = router;

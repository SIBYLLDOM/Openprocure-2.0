const express = require('express');
const router = express.Router();
const planningController = require('../controllers/planning.controller');

// FLSP triggers planning team request from OPI form
router.post('/send/:opiToken', planningController.sendToPlanningTeam);

// Planning team fetches their request details via link in email
router.get('/request/:planningToken', planningController.getPlanningRequest);

// Planning team submits delivery date + remarks
router.post('/respond/:planningToken', planningController.submitPlanningResponse);

module.exports = router;

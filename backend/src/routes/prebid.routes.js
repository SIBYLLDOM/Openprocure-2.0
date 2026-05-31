const express = require('express');
const router = express.Router();
const prebidController = require('../controllers/prebid.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Optional: you can add authMiddleware to these routes to secure them
// router.use(authMiddleware);

// Get all distinct zones
router.get('/zones', prebidController.getZones);

// Get all distinct states for a given zone
router.get('/states', prebidController.getStates);

// Get zone heads for a given zone
router.get('/zone-heads', prebidController.getZoneHeads);

// Get FLSPs for a given state
router.get('/flsp', prebidController.getFlsp);

// Send the Pre-Bid Meeting Invite email
router.post('/send-invite', prebidController.sendInvite);

// Submit FLSP Attendance feedback
router.post('/attendance', prebidController.submitAttendance);

// Get all Pre-Bid Summaries globally
router.get('/all-summaries', prebidController.getAllSummaries);

// Get Pre-Bid Meeting remarks
router.get('/meeting/:bid_no', prebidController.getPreBidMeeting);

module.exports = router;

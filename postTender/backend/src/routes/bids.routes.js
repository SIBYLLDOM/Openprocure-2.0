// src/routes/bids.routes.js
const express = require('express');
const router = express.Router();
const bidsController = require('../controllers/bids.controller');

// Get all won bids
router.get('/won', bidsController.getWonBids);

// Get bid by ID
router.get('/:id', bidsController.getBidById);

// Update bid status
router.patch('/:id/status', bidsController.updateBidStatus);

// Create new bid
router.post('/', bidsController.createBid);

module.exports = router;

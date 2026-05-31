const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
    getGemBids,
    getGemBidById,
    getGemBidsStats
} = require('../controllers/gemBids.controller');

// GET /api/gem-bids - Get all gem bids with pagination and filters
router.get('/', auth, getGemBids);

// GET /api/gem-bids/stats - Get gem bids statistics
router.get('/stats', auth, getGemBidsStats);

// GET /api/gem-bids/:id - Get single gem bid by ID
router.get('/:id', auth, getGemBidById);

module.exports = router;

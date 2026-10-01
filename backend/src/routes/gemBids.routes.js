const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
    getGemBids,
    getGemBidById,
    getGemBidsStats,
    updateBidNotes
} = require('../controllers/gemBids.controller');

// GET /api/gem-bids - Get all gem bids with pagination and filters
router.get('/', auth, getGemBids);

// GET /api/gem-bids/stats - Get gem bids statistics
router.get('/stats', auth, getGemBidsStats);

// PUT /api/gem-bids/:bidNo/notes - user-entered RA Date / Remarks.
// Regex route: bid numbers contain slashes (e.g. GEM/2024/B/123), which a
// plain `/:bidNo` segment can't hold — same convention as tenders.routes.js.
router.put(/^\/(.+)\/notes$/, auth, (req, res, next) => {
    req.params.bidNo = req.params[0];
    next();
}, updateBidNotes);

// GET /api/gem-bids/:id - Get single gem bid by ID
router.get('/:id', auth, getGemBidById);

module.exports = router;

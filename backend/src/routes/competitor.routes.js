const express = require('express');
const router = express.Router();
const { 
    getCompetitorBrands, 
    getCompetitorStats, 
    getCompetitorComparison,
    // Add these new functions:
    getSellers,
    compareSellers,
    getProducts,
    getProductIntelligence
} = require('../controllers/competitor.controller');
const auth = require('../middlewares/auth.middleware');

// Existing Routes
router.get('/brands', auth, getCompetitorBrands);
router.get('/stats', auth, getCompetitorStats);
router.get('/compare', auth, getCompetitorComparison);

// --- New Routes for Competitor Pages ---
router.get('/list', auth, getSellers); // Used by Portfolio Tracking dropdown
router.get('/compare-detailed', auth, compareSellers); // Used by Documents Comparison
router.get('/products/list', auth, getProducts); // Used by Product Comparison dropdown
router.get('/products/intelligence', auth, getProductIntelligence); // Used by Product Comparison data

module.exports = router;

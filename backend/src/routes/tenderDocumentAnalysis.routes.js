const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
    uploadAndAnalyze,
    fillTemplate,
    saveAnalysis,
    getAnalysis
} = require('../controllers/tenderDocumentAnalysis.controller');

// Middleware to extract tender IDs that contain forward slashes (e.g. 2026/HFW/1027943/1)
const extractTenderId = (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    next();
};

// Specific action routes must come BEFORE the catch-all GET
router.post(/^\/(.+)\/upload$/, auth, extractTenderId, uploadAndAnalyze);
router.post(/^\/(.+)\/fill-template$/, auth, extractTenderId, fillTemplate);
router.post(/^\/(.+)\/save$/, auth, extractTenderId, saveAnalysis);

// Catch-all GET — must be last
router.get(/^\/(.+)$/, auth, extractTenderId, getAnalysis);

module.exports = router;

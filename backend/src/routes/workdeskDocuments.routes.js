const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
    upload,
    uploadDocument,
    getDocuments,
    downloadDocument,
    deleteDocument
} = require('../controllers/workdeskDocuments.controller');

// Regex-based route to handle forward slashes in tender IDs (e.g. GEM/2026/B/7209438)
const extractTenderId = (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    next();
};

// Upload a file for a tender
router.post(/^\/(.+)\/upload$/, auth, extractTenderId, upload, uploadDocument);

// Get all documents for a tender (optional ?workspace_dept=Finance query param)
router.get(/^\/(.+)$/, auth, extractTenderId, getDocuments);

// Download a document by its DB id
router.get('/download/:docId', auth, downloadDocument);

// Delete a document by its DB id
router.delete('/doc/:docId', auth, deleteDocument);
// Analyze a document with AI
router.post('/analyze/:docId', auth, require('../controllers/workdeskDocuments.controller').analyzeDocument);

module.exports = router;

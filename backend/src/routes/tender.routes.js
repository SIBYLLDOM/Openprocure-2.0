const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
  getTenders,
  toggleInterested,
  getSuggestedProducts,
  searchProducts,
  updateSuggestedProducts,
  saveSelectedProduct,
  getDeviationTables,
  updateDeviationTables,
  getTenderDetails
} = require('../controllers/tenders.controller');
const { generateRepresentationLetter, saveRepresentationLetter, getRepresentationLetter } = require('../controllers/deviationRepresentation.controller');
const { getTenderStatusHistory, updateTenderStatus } = require('../controllers/tenderStatus.controller');

router.get('/', auth, getTenders);
router.get('/', auth, getTenders);
router.patch('/:bidNumber/interest', auth, toggleInterested);
// Search products from S3
router.get('/products/search', auth, searchProducts);

// Tender Status (Must be before generic :bidNumber route)
router.get('/:tenderId/status/history', auth, getTenderStatusHistory);
router.post('/:tenderId/status', auth, updateTenderStatus);

// Single Tender Details (including json_data)
router.get('/:bidNumber', auth, getTenderDetails);

// Suggestions
router.get('/:bidNumber/suggestions', auth, getSuggestedProducts);
router.put('/:bidNumber/suggestions', auth, updateSuggestedProducts);
router.put('/:bidNumber/selection', auth, saveSelectedProduct);

// Deviations
router.get('/:bidNumber/deviations', auth, getDeviationTables);
router.put('/:bidNumber/deviations', auth, updateDeviationTables);

// Deviation Representation Generation
router.post('/:bidNumber/generate-representation', auth, generateRepresentationLetter);
router.post('/:bidNumber/save-representation', auth, saveRepresentationLetter);
router.get('/:bidNumber/get-representation', auth, getRepresentationLetter);

module.exports = router;

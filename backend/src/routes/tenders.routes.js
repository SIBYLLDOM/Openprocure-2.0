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
  getTenderDetails,
  getTenderMeta,
  getTenderDocumentPath,
  getTenderJson,
  getSubCategories,
  getDepartments,
  exportTenders,
  downloadFile
} = require('../controllers/tenders.controller');
const { generateRepresentationLetter, saveRepresentationLetter, getRepresentationLetter } = require('../controllers/deviationRepresentation.controller');
const { getTenderStatusHistory, updateTenderStatus } = require('../controllers/tenderStatus.controller');

// Middleware to map regex capture group to named parameters for controllers
const extractBidNumber = (req, res, next) => {
  // Regex routes populate req.params[0], [1] etc.
  // We map the first capture group to bidNumber and tenderId
  if (req.params[0]) {
    req.params.bidNumber = req.params[0];
    req.params.tenderId = req.params[0];
  }
  next();
};

router.get('/', auth, getTenders);

// Search products from S3 (Static path must be before wildcard regex)
router.get('/products/search', auth, searchProducts);

// Sub-categories for Perfect Category filter
router.get('/subcats', auth, getSubCategories);
// Departments for filter dropdown
router.get('/departments', auth, getDepartments);

// Export tenders to Excel
router.get('/export', auth, exportTenders);

// Download file (must be before wildcard regex)
router.get('/download', auth, downloadFile);

router.get(/^\/(.+)\/status\/history$/, auth, extractBidNumber, getTenderStatusHistory);
router.post(/^\/(.+)\/status$/, auth, extractBidNumber, updateTenderStatus);

router.patch(/^\/(.+)\/interest$/, auth, extractBidNumber, toggleInterested);

router.get(/^\/(.+)\/suggestions$/, auth, extractBidNumber, getSuggestedProducts);
router.put(/^\/(.+)\/suggestions$/, auth, extractBidNumber, updateSuggestedProducts);
router.put(/^\/(.+)\/selection$/, auth, extractBidNumber, saveSelectedProduct);

router.get(/^\/(.+)\/deviations$/, auth, extractBidNumber, getDeviationTables);
router.put(/^\/(.+)\/deviations$/, auth, extractBidNumber, updateDeviationTables);

router.get(/^\/(.+)\/meta$/, auth, extractBidNumber, getTenderMeta);

router.get(/^\/(.+)\/documents\/path$/, auth, extractBidNumber, getTenderDocumentPath);

router.post(/^\/(.+)\/generate-representation$/, auth, extractBidNumber, generateRepresentationLetter);
router.post(/^\/(.+)\/save-representation$/, auth, extractBidNumber, saveRepresentationLetter);
router.get(/^\/(.+)\/get-representation$/, auth, extractBidNumber, getRepresentationLetter);

router.get(/^\/(.+)\/json$/, auth, extractBidNumber, getTenderJson);

router.get(/^\/(.+)$/, auth, extractBidNumber, getTenderDetails);

module.exports = router;

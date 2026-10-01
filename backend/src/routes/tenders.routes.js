const express = require('express');
const requireApproval = require('../middlewares/requireApproval.middleware');
const requireRole = require('../middlewares/requireRole.middleware');
const requireTenderAccess = require('../middlewares/requireTenderAccess.middleware');
const router = express.Router();
const multer = require('multer');
const auth = require('../middlewares/auth.middleware');
const authOrQueryToken = require('../middlewares/authOrQueryToken.middleware');
const {
  getTenders,
  toggleInterested,
  getTeamSuggestions,
  getSuggestedProducts,
  searchProducts,
  getProductByCode,
  updateSuggestedProducts,
  saveSelectedProduct,
  getDeviationTables,
  updateDeviationTables,
  exportDeviationsExcel,
  importDeviationsExcel,
  getTenderDetails,
  getTenderMeta,
  getPriceListByCode,
  getTenderDocumentPath,
  getTenderSummary,
  getTenderJson,
  getSubCategories,
  getDepartments,
  getStates,
  exportTenders,
  downloadFile,
  uploadTenderDocumentMiddleware,
  uploadTenderDocument,
  recalculateDeviation,
  regenerateDeviation,
  getCatalogueSpecs,
  markNotRelevant,
  suggestFromSpreadsheet,
  saveSpreadsheetSuggestions,
  extractItemsFromDocument,
  extractItemsUploadMiddleware,
  proxyDocument,
} = require('../controllers/tenders.controller');
const { generateRepresentationLetter, saveRepresentationLetter, getRepresentationLetter, getPrebidTeam, shareDeviation, shareSuggestedProducts, shareTenderDetails } = require('../controllers/deviationRepresentation.controller');
const { uploadMiddleware: documentTenderUploadMiddleware, createDocumentTender, getDocumentTenderJob } = require('../controllers/documentTender.controller');
const { getTenderStatusHistory, updateTenderStatus, getTenderZsm, searchTenderExecutives, getTenderExecutives } = require('../controllers/tenderStatus.controller');
const { getEmdProcess, saveEmdProcess, getZsmCandidates } = require('../controllers/emdProcess.controller');

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

// Search the local product catalogue (src/asset/products) — static path must be before wildcard regex
router.get('/products/search', auth, searchProducts);
// Full raw spec sheet for one product (used by "Regenerate Deviation" so the AI
// gets real technical_specifications instead of the lightweight suggestion summary)
router.get('/products/by-code/:code', auth, getProductByCode);
router.get('/price-list/by-code/:code', auth, getPriceListByCode);

// Proxy: recalculate deviation (avoids CORS when calling external service from browser)
// Deviation generation is the tender team's job; Sales/Zonal Head/Finance
// get a read-only deviations page (see Frontend DeviationPage canGenerate).
router.post('/recalculate-deviation', auth, requireRole('Admin', 'Tender Admin', 'Office Administrator', 'Tender Executive'), recalculateDeviation);
// Proxy: regenerate deviation with full product specs (same CORS reasoning as above)
router.post('/regenerate-deviation', auth, requireRole('Admin', 'Tender Admin', 'Office Administrator', 'Tender Executive'), regenerateDeviation);

// Sub-categories for Perfect Category filter
router.get('/subcats', auth, getSubCategories);
// Departments for filter dropdown
router.get('/departments', auth, getDepartments);
// States for filter dropdown (curated state text + PIN-code-derived states)
router.get('/states', auth, getStates);

// Suggested recipients for the Share Tender Details / Share Deviation /
// Share Suggestions modal — see getTeamSuggestions for the exact rule.
router.get('/team-suggestions', auth, getTeamSuggestions);

// Export tenders to Excel
router.get('/export', auth, exportTenders);

// Download file (must be before wildcard regex). Accepts ?token=... so the
// "View" button can open it via a plain new-tab navigation.
router.get('/download', authOrQueryToken, downloadFile);

// Proxy: fetch external GeM/BHEL tender-document URLs server-side (avoids CORS)
router.get('/proxy-document', auth, proxyDocument);

// "Document Tender" — create a new tender row from user-uploaded documents.
// Runs as a background job (can take several minutes for scanned PDFs) —
// POST kicks it off, GET polls status. Must be registered before the
// wildcard GET /:id route below, or "/document-tender/<jobId>" would match
// that instead.
router.post('/document-tender', auth, documentTenderUploadMiddleware, createDocumentTender);
router.get('/document-tender/:jobId', auth, getDocumentTenderJob);

router.post(/^\/(.+)\/documents\/upload$/, auth, extractBidNumber, uploadTenderDocumentMiddleware, uploadTenderDocument);

router.get(/^\/(.+)\/status\/history$/, auth, extractBidNumber, getTenderStatusHistory);
router.post(/^\/(.+)\/status$/, auth, extractBidNumber, updateTenderStatus);
router.get(/^\/(.+)\/zsm$/, auth, extractBidNumber, getTenderZsm);
router.get('/executives/search', auth, searchTenderExecutives);
router.get(/^\/(.+)\/executives$/, auth, extractBidNumber, getTenderExecutives);

router.patch(/^\/(.+)\/interest$/, auth, extractBidNumber, toggleInterested);
router.patch(/^\/(.+)\/not-relevant$/, auth, extractBidNumber, markNotRelevant);

router.get(/^\/(.+)\/suggestions$/, auth, extractBidNumber, requireTenderAccess(), getSuggestedProducts);
router.put(/^\/(.+)\/suggestions$/, auth, extractBidNumber, updateSuggestedProducts);
router.post(/^\/(.+)\/suggestions\/extract-items$/, auth, extractBidNumber, extractItemsUploadMiddleware, extractItemsFromDocument);
router.post(/^\/(.+)\/suggestions\/from-spreadsheet$/, auth, extractBidNumber, suggestFromSpreadsheet);
router.post(/^\/(.+)\/suggestions\/save$/, auth, extractBidNumber, saveSpreadsheetSuggestions);
router.put(/^\/(.+)\/selection$/, auth, extractBidNumber, saveSelectedProduct);

// Sales / Zonal Head may only open tenders in their own states — the list
// filters, but these are addressable by URL. See requireTenderAccess.
router.get(/^\/(.+)\/deviations$/, auth, extractBidNumber, requireTenderAccess(), getDeviationTables);
router.put(/^\/(.+)\/deviations$/, auth, extractBidNumber, updateDeviationTables);
router.get(/^\/(.+)\/deviations\/export$/, auth, extractBidNumber, exportDeviationsExcel);
router.post(
  /^\/(.+)\/deviations\/import$/,
  auth, extractBidNumber,
  multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('file'),
  importDeviationsExcel
);

router.get(/^\/(.+)\/meta$/, auth, extractBidNumber, requireTenderAccess(), getTenderMeta);

router.get(/^\/(.+)\/emd-process$/, auth, extractBidNumber, requireTenderAccess(), getEmdProcess);
router.put(/^\/(.+)\/emd-process$/, auth, extractBidNumber, requireTenderAccess(), saveEmdProcess);
router.get(/^\/(.+)\/zsm-candidates$/, auth, extractBidNumber, requireTenderAccess(), getZsmCandidates);

router.get(/^\/(.+)\/documents\/path$/, auth, extractBidNumber, getTenderDocumentPath);

router.post(/^\/(.+)\/summary$/, auth, extractBidNumber, requireTenderAccess(), getTenderSummary);

router.post(/^\/(.+)\/generate-representation$/, auth, requireRole('Admin', 'Tender Admin', 'Office Administrator', 'Tender Executive'), extractBidNumber, generateRepresentationLetter);
// Finalising a representation needs Tender Admin sign-off for executives;
// generating/previewing one above stays open. See middlewares/requireApproval.
router.post(/^\/(.+)\/save-representation$/, auth, extractBidNumber, requireApproval('representation'), saveRepresentationLetter);
router.get(/^\/(.+)\/get-representation$/, auth, extractBidNumber, getRepresentationLetter);
router.get(/^\/(.+)\/prebid-team$/, auth, extractBidNumber, getPrebidTeam);
router.post(/^\/(.+)\/share-deviation$/, auth, extractBidNumber, shareDeviation);
router.post(/^\/(.+)\/share-suggestions$/, auth, extractBidNumber, shareSuggestedProducts);
router.post(/^\/(.+)\/share-tender$/, auth, extractBidNumber, shareTenderDetails);

router.get(/^\/(.+)\/json$/, auth, extractBidNumber, requireTenderAccess(), getTenderJson);
router.get(/^\/(.+)\/tech-specs$/, auth, extractBidNumber, getCatalogueSpecs);

router.get(/^\/(.+)$/, auth, extractBidNumber, getTenderDetails);

module.exports = router;

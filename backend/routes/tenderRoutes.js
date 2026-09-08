const express = require('express');
const router = express.Router();
const {
  getTenders, getFilters, getSubCategories, getTenderDetails, getDashboardStats,
  toggleInterest, setNotRelevant, getStatusHistory, postStatus,
  getSuggestedProducts, selectSuggestedProduct, generateSuggestedProducts,
  getParticipatedTenders, updateParticipatedTenderNote, getActiveWorkspaces,
} = require('../controllers/tenderController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/stats/summary', getDashboardStats);
router.get('/filters', getFilters);
router.get('/subcategories', getSubCategories);
router.get('/participated', getParticipatedTenders);
router.get('/workspaces', getActiveWorkspaces);
router.put('/:bidNumber/participated-note', updateParticipatedTenderNote);
router.get('/', getTenders);
router.patch('/:bidNumber/interest', toggleInterest);
router.patch('/:bidNumber/not-relevant', setNotRelevant);
router.get('/:bidNumber/status/history', getStatusHistory);
router.post('/:bidNumber/status', postStatus);
router.get('/:bidNumber/suggestions', getSuggestedProducts);
router.post('/:bidNumber/suggestions/select', selectSuggestedProduct);
router.post('/:bidNumber/suggestions/generate', generateSuggestedProducts);
router.get('/:bidNumber', getTenderDetails);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
  getGemContracts, getContractCategories, getContractStates,
  getCartingSellers, getCartingStates, getCartingCategories, getCartingKpi, getCartingPivot, getCartingMap,
} = require('../controllers/ordersController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/gem-contracts', getGemContracts);
router.get('/gem-contracts/categories', getContractCategories);
router.get('/gem-contracts/states', getContractStates);

router.get('/carting/sellers', getCartingSellers);
router.get('/carting/states', getCartingStates);
router.get('/carting/categories', getCartingCategories);
router.get('/carting/kpi', getCartingKpi);
router.get('/carting/pivot', getCartingPivot);
router.get('/carting/map', getCartingMap);

module.exports = router;

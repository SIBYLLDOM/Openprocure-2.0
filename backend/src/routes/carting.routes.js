const express = require('express');
const router = express.Router();
const { getCartingKPIs, getPivotCarting, getMapCarting, getCartingSellers, getCartingStates, getCartingCategories } = require('../controllers/carting.controller');
const auth = require('../middlewares/auth.middleware');

router.get('/kpi', auth, getCartingKPIs);
router.get('/pivot', auth, getPivotCarting);
router.get('/map', auth, getMapCarting);

// New Route for Sellers
router.get('/sellers', auth, getCartingSellers);
router.get('/states', auth, getCartingStates);
router.get('/categories', auth, getCartingCategories);

module.exports = router;

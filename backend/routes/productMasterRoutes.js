const express = require('express');
const router = express.Router();
const { getMyCategories, getProducts } = require('../controllers/productMasterController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/categories', getMyCategories);
router.get('/products', getProducts);

module.exports = router;

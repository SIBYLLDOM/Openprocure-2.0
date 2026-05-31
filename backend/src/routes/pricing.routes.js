const express = require('express');
const router = express.Router();
const { predictPrice } = require('../controllers/pricing.controller');

// Predict Price
router.post('/predict', predictPrice);

module.exports = router;

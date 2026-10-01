const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/pricing.controller');

// Predict Price (pre-existing mock endpoint — left unauthenticated as it was)
router.post('/predict', ctrl.predictPrice);

// Finance pricing. `requests` must precede /:bidNumber or it is swallowed by it.
router.get('/requests', auth, ctrl.listRequests);
router.get('/:bidNumber/audit', auth, ctrl.getAudit);
router.get('/:bidNumber', auth, ctrl.getPricing);
router.put('/:bidNumber', auth, ctrl.savePricing);
router.post('/:bidNumber/submit', auth, ctrl.submitPricing);

module.exports = router;

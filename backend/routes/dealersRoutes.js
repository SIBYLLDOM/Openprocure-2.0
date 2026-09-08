const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dealersController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/report', ctrl.getContractDealers);
router.get('/report/suggestions', ctrl.getDealerSuggestions);
router.get('/report/states', ctrl.getDealerStates);
router.get('/report/categories', ctrl.getDealerCategories);
router.get('/report/contracts', ctrl.getDealerContracts);

router.get('/distributors', ctrl.listDistributors);
router.get('/distributors/states', ctrl.getDistributorStates);
router.post('/distributors', ctrl.createDistributor);
router.post('/distributors/import', ctrl.importDistributors);
router.patch('/distributors/:id', ctrl.updateDistributor);
router.delete('/distributors/:id', ctrl.deleteDistributor);

module.exports = router;

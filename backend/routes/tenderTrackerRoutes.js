const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tenderTrackerController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/remark-options', ctrl.getRemarkOptions);
router.get('/export', ctrl.exportExcel);
router.get('/', ctrl.listTracker);
router.put('/override', ctrl.saveOverride);

module.exports = router;

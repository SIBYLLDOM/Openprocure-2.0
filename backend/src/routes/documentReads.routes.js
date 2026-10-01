const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/documentReads.controller');

router.get('/:bidNumber', auth, ctrl.getReads);
router.post('/:bidNumber', auth, ctrl.markRead);
router.delete('/:bidNumber/:docType', auth, ctrl.unmarkRead);

module.exports = router;

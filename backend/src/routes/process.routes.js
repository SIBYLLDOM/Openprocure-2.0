const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/process.controller');

router.get('/:bidNumber', auth, ctrl.getProcess);
router.post('/:bidNumber/:stepCode', auth, ctrl.markStep);

module.exports = router;

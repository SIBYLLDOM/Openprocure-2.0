const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/approvals.controller');

router.post('/', auth, ctrl.create);
router.get('/', auth, ctrl.list);
router.get('/status', auth, ctrl.status);
router.patch('/:id/payload', auth, ctrl.updatePayload); // must precede /:id
router.post('/:id/acknowledge', auth, ctrl.acknowledge);
router.patch('/:id', auth, ctrl.decide);

module.exports = router;

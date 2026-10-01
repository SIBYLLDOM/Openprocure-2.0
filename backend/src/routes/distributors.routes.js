const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { getDistributors, createDistributor, importDistributors, updateDistributor, deleteDistributor } = require('../controllers/distributors.controller');

router.get('/', auth, getDistributors);
router.post('/', auth, createDistributor);
router.post('/import', auth, importDistributors);
router.put('/:id', auth, updateDistributor);
router.delete('/:id', auth, deleteDistributor);

module.exports = router;

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { getTimeline } = require('../controllers/timeline.controller');

router.get('/:bidNumber', auth, getTimeline);

module.exports = router;

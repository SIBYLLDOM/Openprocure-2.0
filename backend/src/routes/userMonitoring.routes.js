const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
  getDashboard, getLoginHistory, getSessions, heartbeat, endSession,
} = require('../controllers/userMonitoring.controller');

router.get('/dashboard', auth, getDashboard);
router.get('/login-history', auth, getLoginHistory);
router.get('/sessions', auth, getSessions);
router.post('/session/heartbeat', auth, heartbeat);
router.post('/session/end', auth, endSession);

module.exports = router;

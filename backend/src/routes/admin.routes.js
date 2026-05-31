const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/admin.controller');
const auth = require('../middlewares/auth.middleware');

// Routes
router.get('/dashboard-stats', auth, getDashboardStats);

module.exports = router;

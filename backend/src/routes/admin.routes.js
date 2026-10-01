const express = require('express');
const router = express.Router();
const { getDashboardStats, getTenderDashboardStats } = require('../controllers/admin.controller');
const auth = require('../middlewares/auth.middleware');

// Routes
router.get('/dashboard-stats', auth, getDashboardStats);
router.get('/tender-dashboard', auth, getTenderDashboardStats);

module.exports = router;

// src/routes/dealerAuthLetters.routes.js
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/dealerAuthLetters.controller');

router.post('/', auth, ctrl.createRequest);
router.get('/', auth, ctrl.listRequests);
router.get('/:id', auth, ctrl.getRequest);
router.post('/:id/send-otp', auth, ctrl.sendOtp);
router.post('/:id/verify-otp', auth, ctrl.verifyOtp);
router.get('/:id/pdf', auth, ctrl.downloadPdf);

module.exports = router;

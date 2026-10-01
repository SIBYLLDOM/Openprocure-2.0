const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
  verifyResetToken,
  registerUser
} = require('../controllers/auth.controller');

router.post('/login', loginUser);
router.get('/me', auth, getMe);
router.post('/forgot-password', forgotPassword);
router.get('/reset-password/verify', verifyResetToken);
router.post('/reset-password', resetPassword);
router.post('/register', registerUser);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
  loginUser,
  forgotPassword,
  registerUser
} = require('../controllers/auth.controller');

router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/register', registerUser);

module.exports = router;

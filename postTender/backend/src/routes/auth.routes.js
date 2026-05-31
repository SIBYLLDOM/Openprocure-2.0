// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const {
    loginUser,
    forgotPassword
} = require('../controllers/auth.controller');

router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);

module.exports = router;


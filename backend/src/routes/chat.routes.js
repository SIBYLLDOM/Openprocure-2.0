'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/chat.controller');

router.post('/', auth, ctrl.chat);

module.exports = router;

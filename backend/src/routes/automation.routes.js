'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const ctrl    = require('../controllers/automation.controller');

router.get('/status',                  auth, ctrl.getStatus);
router.post('/service/:name/restart',  auth, ctrl.restartService);
router.post('/scraper/:name/run',      auth, ctrl.runScraper);
router.get('/logs/:name',              auth, ctrl.getLogs);

module.exports = router;

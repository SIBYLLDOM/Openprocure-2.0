'use strict';
const express = require('express');
const router  = express.Router();
const auth         = require('../middlewares/auth.middleware');
const authOrQuery  = require('../middlewares/authOrQueryToken.middleware');
const ctrl         = require('../controllers/budgetTargeting.controller');

router.post('/upload',              auth, ctrl.uploadMiddleware, ctrl.uploadWorkbook);
router.get('/names',                auth, ctrl.listNames);
router.get('/person/:key',          auth, ctrl.getPerson);
router.post('/generate',            auth, ctrl.generatePdfs);
router.get('/generated',            auth, ctrl.listGenerated);
// authOrQueryToken, not auth — this is opened directly via <a href>/window.open
// ("Open"/"Download" on a generated letter), which can't attach a Bearer header.
router.get('/generated/:id',        authOrQuery, ctrl.downloadGenerated);
router.post('/pdf/bulk',            auth, ctrl.bulkDownload);
router.post('/send-mail',           auth, ctrl.sendGeneratedMail);
router.post('/send-sample-mail',    auth, ctrl.sendSampleMail);

module.exports = router;

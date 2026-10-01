'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const ctrl    = require('../controllers/companyDrive.controller');

// Specific routes before parameterised ones
router.post('/upload',      auth, ctrl.uploadMiddleware, ctrl.uploadDriveDoc);
router.post('/suggest',     auth, ctrl.suggestDriveDocs);
router.post('/nl-search',   auth, ctrl.nlSearchDriveDocs);
router.get('/download/:id', auth, ctrl.downloadDriveDoc);
router.delete('/:id',       auth, ctrl.deleteDriveDoc);
router.get('/',             auth, ctrl.listDriveDocs);

module.exports = router;

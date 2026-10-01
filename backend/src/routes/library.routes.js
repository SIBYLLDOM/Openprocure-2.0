'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const ctrl    = require('../controllers/library.controller');

router.get('/',                       auth, ctrl.listItems);
router.get('/search',                 auth, ctrl.searchItems);
router.get('/brand-docs',             auth, ctrl.getBrandDocs);
router.post('/folder',                auth, ctrl.createFolder);
router.post('/file',                  auth, ctrl.uploadMiddleware, ctrl.uploadFile);
router.post('/upload-folder',         auth, ctrl.uploadFolderMiddleware, ctrl.uploadFolder);
router.get('/upload-folder/:jobId',   auth, ctrl.getUploadFolderJob);
router.get('/folder/:id/download-zip',auth, ctrl.downloadFolderZip);
router.get('/file/:id/download',      auth, ctrl.downloadFile);
router.get('/file/:id/view',          auth, ctrl.viewFile);
router.post('/file/:id/share',        auth, ctrl.shareFile);
router.patch('/:id/expiry',           auth, ctrl.updateExpiry);
router.patch('/:id',                  auth, ctrl.renameItem);
router.delete('/:id',                 auth, ctrl.deleteItem);

module.exports = router;

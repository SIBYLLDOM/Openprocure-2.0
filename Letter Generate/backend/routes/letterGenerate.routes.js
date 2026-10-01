'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const authOrQuery = require('../middlewares/authOrQueryToken.middleware');
const ctrl = require('../controllers/letterGenerate.controller');

// Bid numbers contain slashes (e.g. "GEM/2026/B/7653031") — same greedy-regex
// approach used throughout tenders.routes.js/docPrep.routes.js so both the
// encoded and IIS-decoded forms reach here as one path segment.
const extractBidNumber = (req, res, next) => {
  if (req.params[0]) req.bidNumber = req.params[0].replace(/^\/+|\/+$/g, '');
  next();
};

router.get(/^\/(.+)\/folders$/, auth, extractBidNumber, ctrl.listFolders);
router.post(/^\/(.+)\/folders$/, auth, extractBidNumber, ctrl.createFolder);
router.get(/^\/(.+)\/documents$/, auth, extractBidNumber, ctrl.listDocuments);
router.get(/^\/(.+)\/documents\/([^/]+)$/, auth, (req, res, next) => {
  req.params.id = req.params[1];
  next();
}, extractBidNumber, ctrl.getDocument);
// authOrQueryToken, not auth — opened directly via window.open()/<a href>,
// which can't attach a Bearer header, same as budgetTargeting.routes.js.
router.get(/^\/(.+)\/documents\/([^/]+)\/download$/, authOrQuery, (req, res, next) => {
  req.params.id = req.params[1];
  next();
}, extractBidNumber, ctrl.downloadDocument);
router.delete(/^\/(.+)\/documents\/([^/]+)$/, auth, (req, res, next) => {
  req.params.id = req.params[1];
  next();
}, extractBidNumber, ctrl.deleteDocument);
router.post(/^\/(.+)\/upload$/, auth, extractBidNumber, ctrl.uploadMiddleware, ctrl.uploadFile);
router.post(/^\/(.+)\/chat$/, auth, extractBidNumber, ctrl.chatGenerate);

module.exports = router;

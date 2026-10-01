'use strict';

const express = require('express');
const requireApproval = require('../middlewares/requireApproval.middleware');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const ctrl    = require('../controllers/docPrep.controller');

// Bid numbers (e.g. "GEM/2026/B/7653031") contain slashes. In production, requests
// go through an IIS reverse proxy that decodes %2F to a literal "/" before forwarding
// to this server, which breaks plain `/:bidNo/...` routes (they only match one segment).
// Regex routes with a greedy capture group handle both the encoded and decoded forms,
// the same approach used in tenders.routes.js.
const extractBidNumber = (req, res, next) => {
  if (req.params[0]) req.params.bidNo = req.params[0];
  next();
};

/* =========================
   Standalone routes
========================= */
router.post('/export-docx',    auth, ctrl.exportDocxStandalone);
router.post('/export-pdf',     auth, ctrl.exportPdfStandalone);
router.post('/export-share',   auth, ctrl.shareGeneratedDoc);
router.post('/print-html-pdf', auth, ctrl.printHtmlToPdf);
router.post('/chat-edit',      auth, ctrl.chatEditUploadMiddleware, ctrl.chatEdit);
router.post('/share-blob',     auth, ctrl.shareBlobUploadMiddleware, ctrl.shareBlob);

/* =========================
   Bid routes
========================= */
router.get(/^\/(.+)\/session$/,              auth, extractBidNumber, ctrl.getOrCreateSession);
router.post(/^\/(.+)\/upload-bid$/,          auth, extractBidNumber, ctrl.uploadMiddleware, ctrl.uploadBidDoc);
router.post(/^\/(.+)\/import-from-workspace$/, auth, extractBidNumber, ctrl.importFromWorkspace);
router.post(/^\/(.+)\/assign-extracted$/,    auth, extractBidNumber, ctrl.assignExtractedFiles);
router.post(/^\/(.+)\/upload-additional$/,   auth, extractBidNumber, ctrl.uploadMiddleware, ctrl.uploadAdditionalDoc);
router.post(/^\/(.+)\/upload-document$/,     auth, extractBidNumber, ctrl.uploadMiddleware, ctrl.uploadUserDocument);
router.delete(/^\/(.+)\/drive-match\/([^/]+)$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.annexureId = req.params[1];
  next();
}, ctrl.removeDriveMatch);
router.post(/^\/(.+)\/import-from-library$/, auth, extractBidNumber, ctrl.importFromLibrary);
router.post(/^\/(.+)\/uploaded\/push-to-mydocs$/, auth, extractBidNumber, ctrl.pushUserDocumentsToMyDocs);
router.get(/^\/(.+)\/uploaded\/([^/]+)\/download$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.docId = req.params[1];
  next();
}, ctrl.downloadUserDocument);
router.get(/^\/(.+)\/uploaded\/([^/]+)\/pdf$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.docId = req.params[1];
  next();
}, ctrl.downloadUserDocumentAsPdf);
router.post(/^\/(.+)\/uploaded\/([^/]+)\/share$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.docId = req.params[1];
  next();
}, ctrl.shareUserDocument);
router.delete(/^\/(.+)\/uploaded\/([^/]+)$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.docId = req.params[1];
  next();
}, ctrl.deleteUserDocument);
router.patch(/^\/(.+)\/uploaded\/([^/]+)$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.docId = req.params[1];
  next();
}, ctrl.renameUserDocument);
router.delete(/^\/(.+)\/additional\/([^/]+)$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.docId = req.params[1];
  next();
}, ctrl.deleteAdditionalDoc);
router.post(/^\/(.+)\/detected\/([^/]+)\/accept$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.docId = req.params[1];
  next();
}, ctrl.acceptDetectedDoc);
router.post(/^\/(.+)\/detected\/([^/]+)\/reject$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.docId = req.params[1];
  next();
}, ctrl.rejectDetectedDoc);
router.post(/^\/(.+)\/reset$/,               auth, extractBidNumber, ctrl.resetWorkspace);
router.post(/^\/(.+)\/analyze$/,             auth, extractBidNumber, ctrl.analyzeBidDoc);
router.post(/^\/(.+)\/extract-template$/,    auth, extractBidNumber, ctrl.extractTemplate);
router.post(/^\/(.+)\/fill-template$/,       auth, extractBidNumber, ctrl.fillTemplate);
router.post(/^\/(.+)\/generate$/,            auth, extractBidNumber, ctrl.generateDocument);
router.post(/^\/(.+)\/draft-claude$/,        auth, extractBidNumber, ctrl.draftWithClaude);
router.post(/^\/(.+)\/draft-ollama$/,        auth, extractBidNumber, ctrl.draftWithOllama);
// Generating/drafting above is open to everyone. Exporting is the finalisation
// step, so for a Tender Executive it needs Tender Admin approval first.
router.post(/^\/(.+)\/export-rich$/,         auth, extractBidNumber, requireApproval('document'), ctrl.exportRichDocx);
router.post(/^\/(.+)\/export-pdf$/,          auth, extractBidNumber, requireApproval('document'), ctrl.exportPdf);
router.post(/^\/(.+)\/save-filled$/,         auth, extractBidNumber, ctrl.saveFilledTemplate);
router.post(/^\/(.+)\/generate-annexure$/,   auth, extractBidNumber, ctrl.generateAnnexure);
router.post(/^\/(.+)\/download-all-zip$/,    auth, extractBidNumber, ctrl.downloadAllZip);
router.get(/^\/(.+)\/download\/([^/]+)$/,    auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.annexureId = req.params[1];
  next();
}, ctrl.downloadFilledTemplate);
router.delete(/^\/(.+)\/annexure\/([^/]+)$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.annexureId = req.params[1];
  next();
}, ctrl.deleteAnnexure);
router.patch(/^\/(.+)\/annexure\/([^/]+)$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.annexureId = req.params[1];
  next();
}, ctrl.updateAnnexure);

/* =========================
   Checklist
========================= */
router.post(/^\/(.+)\/checklist\/sync-annexures$/, auth, extractBidNumber, ctrl.syncChecklistFromAnnexures);
router.post(/^\/(.+)\/checklist\/import$/,          auth, extractBidNumber, ctrl.uploadMiddleware, ctrl.importChecklistDocument);
router.post(/^\/(.+)\/checklist\/recompute$/,       auth, extractBidNumber, ctrl.recomputeChecklist);
router.post(/^\/(.+)\/checklist\/render-pdf$/,      auth, extractBidNumber, ctrl.renderChecklistPdf);
router.post(/^\/(.+)\/checklist\/apply-page-map$/,  auth, extractBidNumber, ctrl.applyChecklistPageMap);
router.post(/^\/(.+)\/page-to-html$/,               auth, extractBidNumber, ctrl.uploadMiddleware, ctrl.pageToHtml);
router.post(/^\/(.+)\/checklist$/,                  auth, extractBidNumber, ctrl.addChecklistRow);
router.patch(/^\/(.+)\/checklist\/([^/]+)$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.rowId  = req.params[1];
  next();
}, ctrl.updateChecklistRow);
router.delete(/^\/(.+)\/checklist\/([^/]+)$/, auth, (req, res, next) => {
  req.params.bidNo = req.params[0];
  req.params.rowId  = req.params[1];
  next();
}, ctrl.deleteChecklistRow);

module.exports = router;

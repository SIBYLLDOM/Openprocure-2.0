const express = require('express');
const router = express.Router();
const utilsController = require('../controllers/utils.controller');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/parse-pdf', upload.single('file'), utilsController.parsePdf);
router.post('/check-prebid', utilsController.checkPreBid);

module.exports = router;

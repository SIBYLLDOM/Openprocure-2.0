const express = require('express');
const router = express.Router();
const agreementController = require('../controllers/agreement.controller');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for Agreement Uploads
const uploadDir = path.join(__dirname, '../../uploads/agreements');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Routes
router.post('/generate', upload.fields([
    { name: 'tender_document', maxCount: 1 },
    { name: 'loa_document', maxCount: 1 }
]), agreementController.generateAgreement);
router.post('/save', agreementController.saveDraft);
router.get('/get/:bidNo', agreementController.getDraft);
router.post('/submit', agreementController.submitAgreement);
router.get('/submitted', agreementController.getSubmittedAgreements);
router.get('/download/:bidNo', agreementController.downloadAgreement);
router.post('/upload-signed', upload.single('signed_agreement'), agreementController.uploadSignedAgreement);
router.post('/verify', agreementController.verifyAgreement);

module.exports = router;

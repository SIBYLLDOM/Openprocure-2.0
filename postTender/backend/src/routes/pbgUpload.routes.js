const express = require('express');
const router = express.Router();
const pbgUploadController = require('../controllers/pbgUpload.controller');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for PDF uploads
const uploadDir = 'uploads/pbg_docs';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Sanitize bidNo for filename
        const safeBidNo = req.body.bidNo ? req.body.bidNo.replace(/[^a-zA-Z0-9]/g, '_') : 'unknown';
        const timestamp = Date.now();
        cb(null, `PBG_${safeBidNo}_${timestamp}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});

// GET Pending Uploads (Drafts not in Records)
router.get('/pending', pbgUploadController.getPendingUploads);

// POST Upload PBG
router.post('/upload', upload.single('file'), pbgUploadController.uploadPBG);

// GET Banks List
router.get('/banks', pbgUploadController.getBanks);

// GET Branches List
router.get('/branches', pbgUploadController.getBranches);

module.exports = router;

const express = require('express');
const router = express.Router();
const qcController = require('../controllers/qc.controller');

// Upload Middleware (reuse or create specific if needed)
// reusing existing upload or creating a simple one for now.
// Actually, let's use multer directly here or import a configured one.
// Let's create a specific upload middleware inline or import.
// For now, assume we have a `uploads/qc` directory.

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads/qc');
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
router.get('/', qcController.getQcRecords);
router.post('/upload', upload.single('coa_file'), qcController.uploadCoa);

router.post('/send-to-lab', qcController.sendToLab);


router.get('/dcc', qcController.getDCCRecords);


router.get('/dcc/documents/:contractNo', qcController.getDCCDocuments);
router.get('/dcc/download', qcController.downloadDocument);
router.post('/dcc/create', qcController.createDCC);
router.get('/dcc/verify', qcController.verifyDCC);
router.get('/dcc/decline', qcController.declineDCC);

module.exports = router;

const express = require('express');
const router = express.Router();
const opiController = require('../controllers/opi.controller');

router.get('/verify/:token', opiController.verifyToken);
router.put('/update/:token', opiController.updateOpiData);
router.post('/submit/:token', opiController.submitOpiVerification);
router.get('/download/:contractNo', opiController.downloadOpiFile);
router.get('/view/:contractNo', opiController.viewOpiFile);

module.exports = router;

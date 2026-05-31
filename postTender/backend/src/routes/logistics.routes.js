// src/routes/logistics.routes.js
const express = require('express');
const router = express.Router();
const logisticsController = require('../controllers/logistics.controller');

const upload = require('../middlewares/uploadLogistics');

// Get logistics dispatch data
router.get('/dispatch', logisticsController.getDispatchData);

// Get single dispatch by ID
router.get('/dispatch/:id', logisticsController.getDispatchById);

// Update dispatch status with file upload
router.patch('/dispatch/:id', upload.fields([
    { name: 'invoice_file', maxCount: 1 },
    { name: 'eway_bill', maxCount: 1 },
    { name: 'packing_list', maxCount: 1 },
    { name: 'dispatch_challan', maxCount: 1 }
]), logisticsController.updateDispatch);

module.exports = router;

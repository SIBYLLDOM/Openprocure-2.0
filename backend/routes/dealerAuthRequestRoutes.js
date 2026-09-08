const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dealerAuthRequestController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/oems', ctrl.listOems);
router.get('/oems/:oemUserId/categories', ctrl.listOemCategories);
router.get('/oems/:oemUserId/subcategories', ctrl.listOemSubCategories);
router.get('/oems/:oemUserId/products', ctrl.listOemProducts);

router.post('/', ctrl.createRequest);
router.get('/sent', ctrl.listSentRequests);
router.get('/received', ctrl.listReceivedRequests);
router.get('/:id', ctrl.getRequest);
router.get('/:id/reseller-profile', ctrl.getResellerProfile);
router.post('/:id/approve', ctrl.approveRequest);
router.post('/:id/reject', ctrl.rejectRequest);

module.exports = router;

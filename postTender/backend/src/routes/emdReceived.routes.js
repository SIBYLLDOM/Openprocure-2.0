// src/routes/emdReceived.routes.js
const express = require('express');
const router = express.Router();
const {
    getAllEMDReceived,
    getEMDReceivedByBidNo,
    createEMDReceived,
    updateEMDReceived,
    deleteEMDReceived,
    getEMDSummary,
    getEMDDashboardData,
    assignEMDDetails,
    markEMDReceived,
    sendEMDMail
} = require('../controllers/emdReceived.controller');

// GET EMD summary/dashboard
router.get('/summary', getEMDSummary);

// GET EMD dashboard data (custom join query)
router.get('/dashboard', getEMDDashboardData);

// GET all EMD received records
router.get('/', getAllEMDReceived);

// GET EMD received by bid_no
router.get('/:bidNo', getEMDReceivedByBidNo);

// POST create new EMD received record
router.post('/', createEMDReceived);

// PUT update EMD received record
router.put('/:id', updateEMDReceived);

// DELETE EMD received record
router.delete('/:id', deleteEMDReceived);

// PUT Assign EMD fields
router.put('/:id/assign', assignEMDDetails);

// PUT Mark EMD as Received
router.put('/:id/mark-received', markEMDReceived);

// POST Send manual mail
router.post('/:id/send-mail', sendEMDMail);

module.exports = router;

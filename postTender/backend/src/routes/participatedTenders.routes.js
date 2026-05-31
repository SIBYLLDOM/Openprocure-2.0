// src/routes/participatedTenders.routes.js
const express = require('express');
const router = express.Router();
const {
    getAllParticipatedTenders,
    getParticipatedTenderByBidNo,
    createParticipatedTender,
    updateParticipatedTender,
    deleteParticipatedTender
} = require('../controllers/participatedTenders.controller');

// GET all participated tenders
router.get('/', getAllParticipatedTenders);

// GET participated tender by bid_no
router.get('/:bidNo', getParticipatedTenderByBidNo);

// POST create new participated tender
router.post('/', createParticipatedTender);

// PUT update participated tender
router.put('/:bidNo', updateParticipatedTender);

// DELETE participated tender
router.delete('/:bidNo', deleteParticipatedTender);

module.exports = router;

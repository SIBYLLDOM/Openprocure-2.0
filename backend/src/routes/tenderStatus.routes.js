const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const {
  getTenderStatusHistory,
  updateTenderStatus,
  getCurrentTenderStatus,
  getAllTenderStatusHistory
} = require("../controllers/tenderStatus.controller");

// Get tender status history
router.get(
  "/tenders/:tenderId/status/history",
  auth,
  getTenderStatusHistory
);

// Get current tender status
router.get(
  "/tenders/:tenderId/status/current",
  auth,
  getCurrentTenderStatus
);

// Update tender status
router.post(
  "/tenders/:tenderId/status",
  auth,
  updateTenderStatus
);


// Get ALL tender status history (for Workdesk)
router.get(
  "/tender-status-history",
  auth,
  getAllTenderStatusHistory
);

module.exports = router;

const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const {
  toggleTenderInterest,
  getTenderInterest,
  updateTenderInterest
} = require("../controllers/tenderInterest.controller");

// Toggle tender interest status (0 -> 1, 1 -> 0)
router.patch(
  "/tenders/:tenderId/interest",
  auth,
  toggleTenderInterest
);

// Get tender interest status
router.get(
  "/tenders/:tenderId/interest",
  auth,
  getTenderInterest
);

// Set specific interest status (0 or 1)
router.put(
  "/tenders/:tenderId/interest",
  auth,
  updateTenderInterest
);

module.exports = router;

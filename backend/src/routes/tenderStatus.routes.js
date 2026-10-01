const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const {
  getTenderStatusHistory,
  updateTenderStatus,
  getCurrentTenderStatus,
  getAllTenderStatusHistory,
  deleteTenderWorkspace,
  getTenderZsm
} = require("../controllers/tenderStatus.controller");

// Regex routes (not ':tenderId') because bid numbers contain "/" — a proxy in
// front of this server decodes %2F to a literal slash before Express sees it,
// so a named param would only match the last segment. Same pattern used for
// deleteTenderWorkspace below and elsewhere in this codebase (e.g. docPrep.routes.js).
const forwardTenderId = (req, res, next) => {
  req.params.tenderId = req.params[0];
  next();
};

// Get tender status history
router.get(
  /^\/tenders\/(.+)\/status\/history$/,
  auth,
  forwardTenderId,
  getTenderStatusHistory
);

// Get current tender status
router.get(
  /^\/tenders\/(.+)\/status\/current$/,
  auth,
  forwardTenderId,
  getCurrentTenderStatus
);

// Update tender status
router.post(
  /^\/tenders\/(.+)\/status$/,
  auth,
  forwardTenderId,
  updateTenderStatus
);

// Get the ZSM auto-resolved (or manually overridden) for a tender, plus the
// full active-ZSM list for the Edit dropdown.
router.get(
  /^\/tenders\/(.+)\/zsm$/,
  auth,
  forwardTenderId,
  getTenderZsm
);


// Get ALL tender status history (for Workdesk)
router.get(
  "/tender-status-history",
  auth,
  getAllTenderStatusHistory
);

// Delete a workspace (Admin only)
// Regex route (not ':bidNumber') because bid numbers contain "/" — a proxy in
// front of this server decodes %2F to a literal slash before Express sees it,
// so a named param would only match the last segment. See workspace.routes.js
// for the same pattern used elsewhere in this codebase.
router.delete(
  /^\/tender-status-history\/(.+)$/,
  auth,
  (req, res, next) => {
    req.params.bidNumber = req.params[0];
    next();
  },
  deleteTenderWorkspace
);

module.exports = router;

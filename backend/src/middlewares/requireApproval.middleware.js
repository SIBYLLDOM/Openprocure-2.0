'use strict';
const { getUserScope } = require('../utils/userScope');
const { requiresApproval, isApproved } = require('../controllers/approvals.controller');

/**
 * Gates a *finalisation* action behind Tender Admin sign-off.
 *
 * Only Tender Executives are gated — Admin and Tender Admin pass straight
 * through. Generation itself is deliberately left open: an executive can draft
 * and preview freely, and it is committing the result (saving a representation,
 * exporting a final document) that needs approval.
 *
 * `type` is an approval_requests.type value. `getBid` pulls the bid number off
 * the request; it defaults to the value extractBidNumber puts on req.
 */
// Each router's extractBidNumber leaves the value in a different place —
// docPrep uses params.bidNo, others params.bidNumber or the raw regex capture.
const defaultGetBid = (req) =>
  req.bidNumber ||
  req.params?.bidNumber ||
  req.params?.bidNo ||
  req.params?.[0] ||
  req.body?.bidNumber;

function requireApproval(type, getBid = defaultGetBid) {
  return async (req, res, next) => {
    try {
      const scope = await getUserScope(req.user.id);
      if (!requiresApproval(scope)) return next();

      const bidNumber = getBid(req);
      if (!bidNumber) {
        return res.status(400).json({ success: false, message: 'Bid number missing; cannot check approval.' });
      }

      if (await isApproved(type, bidNumber, req.user.id)) return next();

      return res.status(403).json({
        success: false,
        needsApproval: true,
        type,
        bidNumber,
        message: 'This needs approval from your Tender Admin before it can be finalised.',
      });
    } catch (err) {
      console.error('requireApproval:', err);
      res.status(500).json({ success: false, message: 'Failed to verify approval' });
    }
  };
}

module.exports = requireApproval;

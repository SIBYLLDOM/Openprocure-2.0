'use strict';
const { getUserScope, canAccessTender } = require('../utils/userScope');

/**
 * Blocks a state-scoped role (Sales, Zonal Head) from opening a tender outside
 * their working states.
 *
 * The list endpoints already filter, but detail endpoints are addressable by
 * URL — without this, pasting a bid number would read any tender in the system.
 * Everyone else passes through untouched.
 */
const defaultGetBid = (req) =>
  req.bidNumber ||
  req.params?.bidNumber ||
  req.params?.bidNo ||
  req.params?.tenderId ||
  req.params?.[0] ||
  req.query?.bidNumber;

function requireTenderAccess(getBid = defaultGetBid) {
  return async (req, res, next) => {
    try {
      const scope = await getUserScope(req.user.id);
      const bid = getBid(req);
      if (!bid) return next();          // nothing to check against

      if (await canAccessTender(scope, decodeURIComponent(bid))) return next();

      return res.status(403).json({
        success: false,
        message: 'This tender is outside your assigned states.',
      });
    } catch (err) {
      console.error('requireTenderAccess:', err);
      res.status(500).json({ success: false, message: 'Failed to verify tender access' });
    }
  };
}

module.exports = requireTenderAccess;

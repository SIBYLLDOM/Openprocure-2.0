const { Op } = require('sequelize');
const {
  User, PartnerProfile, PartnerContact, PartnerCertificate, PartnerTaxRegistration,
  CompanyCategory, CompanySubCategory, ProductMasterItem, PartnerProductSelection,
  DealerAuthRequest, DealerAuthRequestItem, ResellerProduct,
} = require('../models');
const { notify } = require('../utils/notify');

// Dealer Management > Request Authorization — a reseller asks a specific
// OEM (another real partner account on this platform) for permission to
// sell one of that OEM's own products (drawn from what that OEM actually
// selected in their Setup Profile — see PartnerProductSelection.js), for a
// stated validity window. The OEM approves/rejects; either action notifies
// the reseller. See DealerAuthRequest.js for the cross-tenant reasoning.

const companyLabel = (profile) => {
  const info = profile?.companyInfo || {};
  return info.tradeName || info.legalName || info.shortName || null;
};

// @route GET /api/dealer-requests/oems?q=
exports.listOems = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const users = await User.findAll({
      where: { userType: 'partner', partnerType: 'oem', profileSubmitted: true, id: { [Op.ne]: req.user.id } },
      include: [{ model: PartnerProfile, as: 'partnerProfile' }],
    });
    const data = users
      .map((u) => ({ userId: u.id, name: companyLabel(u.partnerProfile) || u.name, email: u.email }))
      .filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));
    res.json({ success: true, data });
  } catch (err) {
    console.error('listOems error:', err);
    res.status(500).json({ success: false, message: 'Failed to load OEM list' });
  }
};

async function oemProfileId(oemUserId) {
  const profile = await PartnerProfile.findOne({ where: { userId: oemUserId } });
  return profile?.id || null;
}

// @route GET /api/dealer-requests/oems/:oemUserId/categories
exports.listOemCategories = async (req, res) => {
  try {
    const profileId = await oemProfileId(req.params.oemUserId);
    if (!profileId) return res.json({ success: true, data: [] });
    const selections = await PartnerProductSelection.findAll({
      where: { profileId, categoryId: { [Op.ne]: null } },
      include: [{ model: CompanyCategory, as: 'category' }],
    });
    const seen = new Map();
    for (const s of selections) if (s.category && !seen.has(s.category.id)) seen.set(s.category.id, s.category.name);
    res.json({ success: true, data: [...seen.entries()].map(([id, name]) => ({ id, name })) });
  } catch (err) {
    console.error('listOemCategories error:', err);
    res.status(500).json({ success: false, message: 'Failed to load categories' });
  }
};

// @route GET /api/dealer-requests/oems/:oemUserId/subcategories?categoryId=
exports.listOemSubCategories = async (req, res) => {
  try {
    const profileId = await oemProfileId(req.params.oemUserId);
    if (!profileId) return res.json({ success: true, data: [] });
    const selections = await PartnerProductSelection.findAll({
      where: { profileId, categoryId: req.query.categoryId, subCategoryId: { [Op.ne]: null } },
      include: [{ model: CompanySubCategory, as: 'subCategory' }],
    });
    const seen = new Map();
    for (const s of selections) if (s.subCategory && !seen.has(s.subCategory.id)) seen.set(s.subCategory.id, s.subCategory.name);
    res.json({ success: true, data: [...seen.entries()].map(([id, name]) => ({ id, name })) });
  } catch (err) {
    console.error('listOemSubCategories error:', err);
    res.status(500).json({ success: false, message: 'Failed to load sub-categories' });
  }
};

// @route GET /api/dealer-requests/oems/:oemUserId/products?categoryId=
// Keyed directly off categoryId (not subCategoryId) — the request form only
// asks for Category > Product now, and this also avoids silently hiding
// products whose selection row has an inconsistent/blank sub-category.
exports.listOemProducts = async (req, res) => {
  try {
    const profileId = await oemProfileId(req.params.oemUserId);
    if (!profileId) return res.json({ success: true, data: [] });
    const selections = await PartnerProductSelection.findAll({
      where: { profileId, categoryId: req.query.categoryId },
      include: [{ model: ProductMasterItem, as: 'product' }],
    });
    const data = selections.map((s) => (
      s.product ? { productId: s.product.id, name: s.product.name } : { productId: null, name: s.customProductName, custom: true }
    )).filter((p) => p.name);
    // De-dupe (a product can theoretically be selected more than once).
    const seen = new Set();
    res.json({ success: true, data: data.filter((p) => { const k = p.productId ?? p.name; if (seen.has(k)) return false; seen.add(k); return true; }) });
  } catch (err) {
    console.error('listOemProducts error:', err);
    res.status(500).json({ success: false, message: 'Failed to load products' });
  }
};

async function nextRefNo() {
  const year = new Date().getFullYear();
  const count = await DealerAuthRequest.count();
  return `${year}_auth_${String(count + 1).padStart(4, '0')}`;
}

// MDPL/XXXX/YYYY — the user-facing authorization code shown in listings,
// a running 4-digit sequence plus the current year. Distinct from refNo
// (see DealerAuthRequest.js for why both exist).
async function nextAuthCode() {
  const year = new Date().getFullYear();
  const count = await DealerAuthRequest.count();
  return `MDPL/${String(count + 1).padStart(4, '0')}/${year}`;
}

// @route POST /api/dealer-requests
// body: { toUserId, validFrom, validTo, reason, items: [{ categoryId, subCategoryId, productId, customProductName, productCode, conditionBullets }] }
exports.createRequest = async (req, res) => {
  try {
    const { toUserId, validFrom, validTo, reason } = req.body;
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!toUserId) return res.status(400).json({ success: false, message: 'Select an OEM' });
    if (!items.length) return res.status(400).json({ success: false, message: 'Add at least one product' });
    if (items.some((it) => !it.productId && !it.customProductName)) {
      return res.status(400).json({ success: false, message: 'Select a product for every row' });
    }
    if (!validFrom || !validTo) return res.status(400).json({ success: false, message: 'Validity from/to dates are required' });
    if (new Date(validTo) < new Date(validFrom)) return res.status(400).json({ success: false, message: 'Validity end date must be after the start date' });

    const oem = await User.findOne({ where: { id: toUserId, userType: 'partner', partnerType: 'oem' } });
    if (!oem) return res.status(404).json({ success: false, message: 'OEM not found' });

    const [refNo, authCode] = await Promise.all([nextRefNo(), nextAuthCode()]);
    const request = await DealerAuthRequest.create({
      refNo, authCode, fromUserId: req.user.id, toUserId,
      validFrom, validTo, reason: reason || null, status: 'pending',
    });

    await DealerAuthRequestItem.bulkCreate(items.map((it, idx) => ({
      dealerAuthRequestId: request.id,
      sortOrder: idx,
      categoryId: it.categoryId || null,
      subCategoryId: it.subCategoryId || null,
      productId: it.productId || null,
      customProductName: it.productId ? null : (it.customProductName || null),
      productCode: it.productCode || null,
      conditionBullets: Array.isArray(it.conditionBullets) ? it.conditionBullets.filter((b) => b && b.trim()) : null,
    })));

    const fromProfile = await PartnerProfile.findOne({ where: { userId: req.user.id } });
    await notify(toUserId, {
      type: 'auth_request',
      title: 'New Authorization Request',
      message: `${companyLabel(fromProfile) || req.user.name || 'A reseller'} has requested authorization (${authCode}).`,
      relatedType: 'DealerAuthRequest', relatedId: request.id,
    });

    res.json({ success: true, data: request.toJSON() });
  } catch (err) {
    console.error('createRequest error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit request' });
  }
};

const REQUEST_INCLUDE = [
  { model: User, as: 'fromUser', attributes: ['id', 'name', 'email'] },
  { model: User, as: 'toUser', attributes: ['id', 'name', 'email'] },
  {
    model: DealerAuthRequestItem,
    as: 'items',
    separate: true,
    order: [['sortOrder', 'ASC']],
    include: [
      { model: CompanyCategory, as: 'category' },
      { model: CompanySubCategory, as: 'subCategory' },
      { model: ProductMasterItem, as: 'product' },
    ],
  },
];

async function decorate(rows) {
  const fromProfiles = await PartnerProfile.findAll({ where: { userId: rows.map((r) => r.fromUserId) } });
  const toProfiles = await PartnerProfile.findAll({ where: { userId: rows.map((r) => r.toUserId) } });
  const fromMap = new Map(fromProfiles.map((p) => [p.userId, p]));
  const toMap = new Map(toProfiles.map((p) => [p.userId, p]));
  return rows.map((r) => {
    const json = r.toJSON();
    const items = (json.items || []).map((it) => ({ ...it, productName: it.product?.name || it.customProductName }));
    return {
      ...json,
      items,
      fromCompanyName: companyLabel(fromMap.get(json.fromUserId)) || json.fromUser?.name,
      toCompanyName: companyLabel(toMap.get(json.toUserId)) || json.toUser?.name,
      productName: items.map((it) => it.productName).filter(Boolean).join(', ') || null,
    };
  });
}

// @route GET /api/dealer-requests/sent
exports.listSentRequests = async (req, res) => {
  try {
    const rows = await DealerAuthRequest.findAll({ where: { fromUserId: req.user.id }, include: REQUEST_INCLUDE, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: await decorate(rows) });
  } catch (err) {
    console.error('listSentRequests error:', err);
    res.status(500).json({ success: false, message: 'Failed to load your requests' });
  }
};

// @route GET /api/dealer-requests/received
exports.listReceivedRequests = async (req, res) => {
  try {
    const rows = await DealerAuthRequest.findAll({ where: { toUserId: req.user.id }, include: REQUEST_INCLUDE, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: await decorate(rows) });
  } catch (err) {
    console.error('listReceivedRequests error:', err);
    res.status(500).json({ success: false, message: 'Failed to load incoming requests' });
  }
};

async function findAccessible(req) {
  const row = await DealerAuthRequest.findOne({ where: { id: req.params.id }, include: REQUEST_INCLUDE });
  if (!row) return null;
  if (row.fromUserId !== req.user.id && row.toUserId !== req.user.id) return undefined; // exists but not yours
  return row;
}

// @route GET /api/dealer-requests/:id
exports.getRequest = async (req, res) => {
  try {
    const row = await findAccessible(req);
    if (row === null) return res.status(404).json({ success: false, message: 'Request not found' });
    if (row === undefined) return res.status(403).json({ success: false, message: 'Not authorized to view this request' });
    const [decorated] = await decorate([row]);
    res.json({ success: true, data: decorated });
  } catch (err) {
    console.error('getRequest error:', err);
    res.status(500).json({ success: false, message: 'Failed to load request' });
  }
};

// @route GET /api/dealer-requests/:id/reseller-profile
// Full bio-data view for the OEM reviewing a request — only the OEM the
// request was addressed to can see it, and only ever for the reseller on
// that specific request (not an open "look up anyone" endpoint).
exports.getResellerProfile = async (req, res) => {
  try {
    const request = await DealerAuthRequest.findOne({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.toUserId !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });

    const [user, profile] = await Promise.all([
      User.findOne({ where: { id: request.fromUserId }, attributes: ['id', 'name', 'email', 'partnerType'] }),
      PartnerProfile.findOne({
        where: { userId: request.fromUserId },
        include: [
          { model: PartnerContact, as: 'contacts' },
          { model: PartnerCertificate, as: 'certificates' },
          { model: PartnerTaxRegistration, as: 'taxRegistrations' },
        ],
      }),
    ]);

    res.json({ success: true, data: { user, profile } });
  } catch (err) {
    console.error('getResellerProfile error:', err);
    res.status(500).json({ success: false, message: 'Failed to load reseller profile' });
  }
};

// @route POST /api/dealer-requests/:id/approve
exports.approveRequest = async (req, res) => {
  try {
    const request = await DealerAuthRequest.findOne({
      where: { id: req.params.id, toUserId: req.user.id },
      include: [{ model: DealerAuthRequestItem, as: 'items', include: [{ model: ProductMasterItem, as: 'product' }] }],
    });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'This request has already been decided' });

    request.status = 'approved';
    request.decidedAt = new Date();
    await request.save();

    const toProfile = await PartnerProfile.findOne({ where: { userId: req.user.id } });
    const oemName = companyLabel(toProfile) || req.user.name || 'The OEM';

    // Push straight into the reseller's Our Products list — an approved
    // authorization IS a product they're now cleared to sell, so they
    // shouldn't have to re-enter it by hand (see ResellerProduct.js). One
    // row per item now that a request can cover multiple products.
    for (const item of request.items || []) {
      await ResellerProduct.findOrCreate({
        where: { dealerAuthRequestItemId: item.id },
        defaults: {
          userId: request.fromUserId,
          dealerAuthRequestId: request.id,
          dealerAuthRequestItemId: item.id,
          authSerialNo: request.authCode || request.refNo,
          productName: item.product?.name || item.customProductName || 'Authorized Product',
          decode: item.productCode || null,
          technicalSpecification: (item.conditionBullets || []).join('\n'),
          oemBy: oemName,
          validFrom: request.validFrom,
          validTo: request.validTo,
        },
      });
    }

    await notify(request.fromUserId, {
      type: 'auth_approved',
      title: 'Authorization Request Approved',
      message: `${oemName} approved your request (${request.authCode || request.refNo}) — added to Our Products.`,
      relatedType: 'DealerAuthRequest', relatedId: request.id,
    });

    res.json({ success: true, data: request.toJSON() });
  } catch (err) {
    console.error('approveRequest error:', err);
    res.status(500).json({ success: false, message: 'Failed to approve request' });
  }
};

// @route POST /api/dealer-requests/:id/reject   { remarks }
exports.rejectRequest = async (req, res) => {
  try {
    const { remarks } = req.body;
    if (!remarks?.trim()) return res.status(400).json({ success: false, message: 'A reason is required to reject a request' });

    const request = await DealerAuthRequest.findOne({ where: { id: req.params.id, toUserId: req.user.id } });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'This request has already been decided' });

    request.status = 'rejected';
    request.rejectionRemarks = remarks.trim();
    request.decidedAt = new Date();
    await request.save();

    const toProfile = await PartnerProfile.findOne({ where: { userId: req.user.id } });
    await notify(request.fromUserId, {
      type: 'auth_rejected',
      title: 'Authorization Request Rejected',
      message: `${companyLabel(toProfile) || req.user.name || 'The OEM'} rejected your request (${request.authCode || request.refNo}): ${remarks.trim()}`,
      relatedType: 'DealerAuthRequest', relatedId: request.id,
    });

    res.json({ success: true, data: request.toJSON() });
  } catch (err) {
    console.error('rejectRequest error:', err);
    res.status(500).json({ success: false, message: 'Failed to reject request' });
  }
};

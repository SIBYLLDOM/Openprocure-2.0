const { PartnerProfile, PartnerContact, PartnerLocation, PartnerTaxRegistration, PartnerCertificate, PartnerProductSelection, ProductMasterItem, User } = require('../models');

// Every handler below keys off req.user.id (the caller's own login) — a
// partner can only ever read/edit their own Setup Profile, never one
// supplied via a request body/param.

const profileInclude = [
  { model: PartnerContact, as: 'contacts' },
  { model: PartnerLocation, as: 'locations' },
  { model: PartnerTaxRegistration, as: 'taxRegistrations' },
  { model: PartnerCertificate, as: 'certificates' },
  { model: PartnerProductSelection, as: 'productSelections', include: [{ model: ProductMasterItem, as: 'product' }] }
];

const getOrCreateProfile = async (userId) => {
  const [profile] = await PartnerProfile.findOrCreate({ where: { userId }, defaults: { userId } });
  return profile;
};

// Nothing here is mandatory (per explicit testing instruction) — every
// section computes "how much of this did they fill in", not "is this
// complete/valid", so completion is a rough progress indicator, not a gate.
const computeCompletion = (profile) => {
  const hasAny = (obj) => !!obj && Object.values(obj).some((v) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0));
  const sections = {
    contact: profile.contacts.length > 0,
    company: hasAny(profile.companyInfo),
    address: hasAny(profile.registeredAddress) || hasAny(profile.corporateAddress) || profile.locations.length > 0,
    products: profile.productSelections.length > 0,
    banking: hasAny(profile.bankDetails),
    tax: profile.taxRegistrations.length > 0,
    certificates: profile.certificates.length > 0,
    business: hasAny(profile.businessDetails),
    additional: hasAny(profile.additionalInfo)
  };
  const done = Object.values(sections).filter(Boolean).length;
  const overallPercent = Math.round((done / Object.keys(sections).length) * 100);
  return { overallPercent, sections };
};

const serialize = (profile) => ({ ...profile.toJSON(), completion: computeCompletion(profile) });

// @route GET /api/partner-profile
exports.getProfile = async (req, res) => {
  try {
    await getOrCreateProfile(req.user.id);
    const full = await PartnerProfile.findOne({ where: { userId: req.user.id }, include: profileInclude });
    res.status(200).json(serialize(full));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch profile', error: error.message });
  }
};

// @route PATCH /api/partner-profile   { section, data }
// section is one of: companyInfo, registeredAddress, corporateAddress,
// bankDetails, businessDetails, additionalInfo (JSON blobs — merged, not
// replaced, so a step can be saved partially without clobbering other
// fields already saved in that same section) or sameAsRegistered,
// currentStep, confirmedAccurate (plain scalars — replaced outright).
const JSON_SECTIONS = ['companyInfo', 'registeredAddress', 'corporateAddress', 'bankDetails', 'businessDetails', 'additionalInfo'];
const SCALAR_SECTIONS = ['sameAsRegistered', 'currentStep', 'confirmedAccurate'];

exports.updateSection = async (req, res) => {
  try {
    const { section, data } = req.body;
    if (!JSON_SECTIONS.includes(section) && !SCALAR_SECTIONS.includes(section)) {
      return res.status(400).json({ message: `Unknown section: ${section}` });
    }

    const profile = await getOrCreateProfile(req.user.id);

    if (JSON_SECTIONS.includes(section)) {
      profile[section] = { ...(profile[section] || {}), ...(data || {}) };
    } else {
      profile[section] = data;
    }
    await profile.save();

    const full = await PartnerProfile.findOne({ where: { userId: req.user.id }, include: profileInclude });
    res.status(200).json(serialize(full));
  } catch (error) {
    res.status(500).json({ message: 'Failed to save section', error: error.message });
  }
};

// @route POST /api/partner-profile/logo   multipart, field "logo"
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const profile = await getOrCreateProfile(req.user.id);
    profile.companyInfo = { ...(profile.companyInfo || {}), logoUrl: `/uploads/${req.file.filename}` };
    await profile.save();
    res.status(200).json({ logoUrl: profile.companyInfo.logoUrl });
  } catch (error) {
    res.status(500).json({ message: 'Failed to upload logo', error: error.message });
  }
};

// ----- Generic repeatable-section CRUD (contacts / locations / tax registrations / certificates) -----
// All four follow the same shape: list is embedded in GET /partner-profile,
// and these just add/edit/remove one row scoped to the caller's own profile
// (never trusts a profileId from the client).

const makeCrud = (Model, allowedFields, { fileField, fileUrlField, fileNameField, fileSizeField } = {}) => ({
  create: async (req, res) => {
    try {
      const profile = await getOrCreateProfile(req.user.id);
      const payload = {};
      allowedFields.forEach((f) => { if (req.body[f] !== undefined) payload[f] = req.body[f]; });
      if (fileField && req.file) {
        payload[fileUrlField] = `/uploads/${req.file.filename}`;
        if (fileNameField) payload[fileNameField] = req.file.originalname;
        if (fileSizeField) payload[fileSizeField] = req.file.size;
      }
      const row = await Model.create({ ...payload, profileId: profile.id });
      res.status(201).json(row);
    } catch (error) {
      res.status(500).json({ message: 'Failed to add entry', error: error.message });
    }
  },
  update: async (req, res) => {
    try {
      const profile = await getOrCreateProfile(req.user.id);
      const row = await Model.findOne({ where: { id: req.params.id, profileId: profile.id } });
      if (!row) return res.status(404).json({ message: 'Not found' });
      allowedFields.forEach((f) => { if (req.body[f] !== undefined) row[f] = req.body[f]; });
      if (fileField && req.file) {
        row[fileUrlField] = `/uploads/${req.file.filename}`;
        if (fileNameField) row[fileNameField] = req.file.originalname;
        if (fileSizeField) row[fileSizeField] = req.file.size;
      }
      await row.save();
      res.status(200).json(row);
    } catch (error) {
      res.status(500).json({ message: 'Failed to update entry', error: error.message });
    }
  },
  remove: async (req, res) => {
    try {
      const profile = await getOrCreateProfile(req.user.id);
      const deleted = await Model.destroy({ where: { id: req.params.id, profileId: profile.id } });
      if (!deleted) return res.status(404).json({ message: 'Not found' });
      res.status(200).json({ message: 'Deleted' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete entry', error: error.message });
    }
  }
});

const contactsCrud = makeCrud(PartnerContact, ['isPrimary', 'name', 'designation', 'department', 'email', 'mobile', 'altMobile', 'whatsapp', 'landline', 'photoUrl', 'contactType', 'communicationPreferences']);
const locationsCrud = makeCrud(PartnerLocation, ['name', 'locationType', 'addressLine1', 'addressLine2', 'country', 'state', 'city', 'pincode', 'contactPerson', 'phone', 'email']);
const taxRegCrud = makeCrud(PartnerTaxRegistration, ['registrationType', 'registrationNumber', 'issueDate', 'expiryDate', 'issuingAuthority', 'applicability'], { fileField: 'document', fileUrlField: 'documentUrl' });
const certificatesCrud = makeCrud(PartnerCertificate, ['certificateType', 'certificateName', 'certificateNumber', 'issuingAuthority', 'issueDate', 'expiryDate', 'remarks'], { fileField: 'document', fileUrlField: 'documentUrl', fileNameField: 'fileName', fileSizeField: 'fileSize' });

exports.createContact = contactsCrud.create;
exports.updateContact = contactsCrud.update;
exports.deleteContact = contactsCrud.remove;

exports.createLocation = locationsCrud.create;
exports.updateLocation = locationsCrud.update;
exports.deleteLocation = locationsCrud.remove;

exports.createTaxRegistration = taxRegCrud.create;
exports.updateTaxRegistration = taxRegCrud.update;
exports.deleteTaxRegistration = taxRegCrud.remove;

exports.createCertificate = certificatesCrud.create;
exports.updateCertificate = certificatesCrud.update;
exports.deleteCertificate = certificatesCrud.remove;

// @route PUT /api/partner-profile/products
// { selections: [{ categoryId, subCategoryId, productId }], customProducts: [{ categoryId, subCategoryId, name }] }
// Full replace, not incremental — the wizard's product-selection UI keeps
// the complete selected-id set in its own state (so it survives
// search/pagination client-side, per SETUP_PROFILE.txt section 7) and PUTs
// that whole set back whenever the step is saved.
exports.setProducts = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const { selections, customProducts } = req.body;

    await PartnerProductSelection.destroy({ where: { profileId: profile.id } });

    const rows = [
      ...(Array.isArray(selections) ? selections.map((s) => ({ profileId: profile.id, categoryId: s.categoryId ?? null, subCategoryId: s.subCategoryId ?? null, productId: s.productId ?? null })) : []),
      ...(Array.isArray(customProducts) ? customProducts.map((c) => ({ profileId: profile.id, categoryId: c.categoryId ?? null, subCategoryId: c.subCategoryId ?? null, customProductName: c.name, pendingApproval: true })) : [])
    ];
    if (rows.length > 0) await PartnerProductSelection.bulkCreate(rows);

    const full = await PartnerProductSelection.findAll({ where: { profileId: profile.id }, include: [{ model: ProductMasterItem, as: 'product' }] });
    res.status(200).json(full);
  } catch (error) {
    res.status(500).json({ message: 'Failed to save product selections', error: error.message });
  }
};

// @route POST /api/partner-profile/submit   { confirmedAccurate }
exports.submitProfile = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    profile.confirmedAccurate = !!req.body.confirmedAccurate;
    profile.submitted = true;
    profile.submittedAt = new Date();
    await profile.save();

    await User.update({ profileSubmitted: true }, { where: { id: req.user.id } });

    const full = await PartnerProfile.findOne({ where: { userId: req.user.id }, include: profileInclude });
    res.status(200).json(serialize(full));
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit profile', error: error.message });
  }
};

const { Op } = require('sequelize');
const { CompanyCategory, CompanySubCategory, ProductMasterItem, User } = require('../models');

// @route GET /api/product-master/categories
// Only the categories the caller actually selected at registration (see
// SETUP_PROFILE.txt section 6: "do not show an unrelated global product
// list by default") — matched by name against User.companyTypes. A partner
// who typed a fully custom "Other" company type at registration (see
// PartnerRegisterPage.tsx) simply gets no categories here; the wizard's
// "+ Add Other Product" free-text path covers that case.
exports.getMyCategories = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['companyTypes'] });
    const myTypes = user?.companyTypes ? JSON.parse(user.companyTypes) : [];

    const categories = await CompanyCategory.findAll({
      where: { name: { [Op.in]: myTypes }, enabled: true },
      include: [{ model: CompanySubCategory, as: 'subCategories', where: { enabled: true }, required: false, order: [['sortOrder', 'ASC']] }],
      order: [['sortOrder', 'ASC']]
    });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
  }
};

// @route GET /api/product-master/products?subCategoryId=&search=&page=&pageSize=
// Paginated + searchable, per SETUP_PROFILE.txt section 7's product-grid spec.
exports.getProducts = async (req, res) => {
  try {
    const { subCategoryId, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize, 10) || 10));

    const where = { enabled: true };
    if (subCategoryId) where.subCategoryId = subCategoryId;
    if (search) where.name = { [Op.like]: `%${search}%` };

    const { rows, count } = await ProductMasterItem.findAndCountAll({
      where,
      order: [['name', 'ASC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    res.status(200).json({ items: rows, total: count, page, pageSize, totalPages: Math.ceil(count / pageSize) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products', error: error.message });
  }
};

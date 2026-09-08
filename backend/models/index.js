const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.User = require('./User')(sequelize, DataTypes);

// ----- OEM/Reseller Setup Profile (see SETUP_PROFILE.txt) -----
db.PartnerProfile = require('./PartnerProfile')(sequelize, DataTypes);
db.PartnerContact = require('./PartnerContact')(sequelize, DataTypes);
db.PartnerLocation = require('./PartnerLocation')(sequelize, DataTypes);
db.PartnerTaxRegistration = require('./PartnerTaxRegistration')(sequelize, DataTypes);
db.PartnerCertificate = require('./PartnerCertificate')(sequelize, DataTypes);
db.CompanyCategory = require('./CompanyCategory')(sequelize, DataTypes);
db.CompanySubCategory = require('./CompanySubCategory')(sequelize, DataTypes);
db.ProductMasterItem = require('./ProductMasterItem')(sequelize, DataTypes);
db.PartnerProductSelection = require('./PartnerProductSelection')(sequelize, DataTypes);

// ----- Tenders (read-only mirror of the tender-automation system's DB —
// see backend/models/GemTender.js for why) -----
db.GemTender = require('./GemTender')(sequelize, DataTypes);
db.GemTenderDoc = require('./GemTenderDoc')(sequelize, DataTypes);
db.OpenTenderDetail = require('./OpenTenderDetail')(sequelize, DataTypes);
db.Contract = require('./Contract')(sequelize, DataTypes);
db.Incident = require('./Incident')(sequelize, DataTypes);
db.SupportTicket = require('./SupportTicket')(sequelize, DataTypes);
db.Distributor = require('./Distributor')(sequelize, DataTypes);
db.TenderProcessingResult = require('./TenderProcessingResult')(sequelize, DataTypes);
db.UserLoginHistory = require('./UserLoginHistory')(sequelize, DataTypes);
db.UserSession = require('./UserSession')(sequelize, DataTypes);

// Per-partner tender interaction state — lives in our own schema (not
// migrated), see model files for why this can't just be columns on the
// shared gem_tenders table.
db.TenderPartnerState = require('./TenderPartnerState')(sequelize, DataTypes);
db.TenderStatusEntry = require('./TenderStatusEntry')(sequelize, DataTypes);
db.TenderProductSelection = require('./TenderProductSelection')(sequelize, DataTypes);
db.ParticipatedTenderNote = require('./ParticipatedTenderNote')(sequelize, DataTypes);
db.LibraryItem = require('./LibraryItem')(sequelize, DataTypes);

// ----- Tender Hub / Workspace (see WorkspaceDepartment.js for why these are
// per-partner rather than the original's shared internal-staff tables) -----
db.WorkspaceDepartment = require('./WorkspaceDepartment')(sequelize, DataTypes);
db.WorkspaceTask = require('./WorkspaceTask')(sequelize, DataTypes);
db.WorkspaceDeadline = require('./WorkspaceDeadline')(sequelize, DataTypes);
db.WorkspaceDocument = require('./WorkspaceDocument')(sequelize, DataTypes);
db.WorkspaceMyDoc = require('./WorkspaceMyDoc')(sequelize, DataTypes);
db.WorkspaceDocPrepSession = require('./WorkspaceDocPrepSession')(sequelize, DataTypes);

// ----- Dealer Management -----
db.PartnerDistributor = require('./PartnerDistributor')(sequelize, DataTypes);
// Cross-tenant Authorization Request workflow (reseller -> OEM) — see
// DealerAuthRequest.js. Replaces the earlier single-tenant "generate my own
// letter" version of this feature.
db.DealerAuthRequest = require('./DealerAuthRequest')(sequelize, DataTypes);
db.Notification = require('./Notification')(sequelize, DataTypes);
db.DealerAuthRequest.belongsTo(db.User, { foreignKey: 'fromUserId', as: 'fromUser' });
db.DealerAuthRequest.belongsTo(db.User, { foreignKey: 'toUserId', as: 'toUser' });
db.DealerAuthRequest.belongsTo(db.CompanyCategory, { foreignKey: 'categoryId', as: 'category' });
db.DealerAuthRequest.belongsTo(db.CompanySubCategory, { foreignKey: 'subCategoryId', as: 'subCategory' });
db.DealerAuthRequest.belongsTo(db.ProductMasterItem, { foreignKey: 'productId', as: 'product' });

// Product Management > Our Products (reseller-only) — see ResellerProduct.js.
db.ResellerProduct = require('./ResellerProduct')(sequelize, DataTypes);
db.ResellerProduct.belongsTo(db.DealerAuthRequest, { foreignKey: 'dealerAuthRequestId', as: 'authRequest' });

db.User.hasOne(db.PartnerProfile, { foreignKey: 'userId', as: 'partnerProfile' });
db.PartnerProfile.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });

db.PartnerProfile.hasMany(db.PartnerContact, { foreignKey: 'profileId', as: 'contacts', onDelete: 'CASCADE' });
db.PartnerContact.belongsTo(db.PartnerProfile, { foreignKey: 'profileId', as: 'profile' });

db.PartnerProfile.hasMany(db.PartnerLocation, { foreignKey: 'profileId', as: 'locations', onDelete: 'CASCADE' });
db.PartnerLocation.belongsTo(db.PartnerProfile, { foreignKey: 'profileId', as: 'profile' });

db.PartnerProfile.hasMany(db.PartnerTaxRegistration, { foreignKey: 'profileId', as: 'taxRegistrations', onDelete: 'CASCADE' });
db.PartnerTaxRegistration.belongsTo(db.PartnerProfile, { foreignKey: 'profileId', as: 'profile' });

db.PartnerProfile.hasMany(db.PartnerCertificate, { foreignKey: 'profileId', as: 'certificates', onDelete: 'CASCADE' });
db.PartnerCertificate.belongsTo(db.PartnerProfile, { foreignKey: 'profileId', as: 'profile' });

db.CompanyCategory.hasMany(db.CompanySubCategory, { foreignKey: 'categoryId', as: 'subCategories' });
db.CompanySubCategory.belongsTo(db.CompanyCategory, { foreignKey: 'categoryId', as: 'category' });

db.CompanySubCategory.hasMany(db.ProductMasterItem, { foreignKey: 'subCategoryId', as: 'products' });
db.ProductMasterItem.belongsTo(db.CompanySubCategory, { foreignKey: 'subCategoryId', as: 'subCategory' });

db.PartnerProfile.hasMany(db.PartnerProductSelection, { foreignKey: 'profileId', as: 'productSelections', onDelete: 'CASCADE' });
db.PartnerProductSelection.belongsTo(db.PartnerProfile, { foreignKey: 'profileId', as: 'profile' });
db.PartnerProductSelection.belongsTo(db.ProductMasterItem, { foreignKey: 'productId', as: 'product' });
db.PartnerProductSelection.belongsTo(db.CompanyCategory, { foreignKey: 'categoryId', as: 'category' });
db.PartnerProductSelection.belongsTo(db.CompanySubCategory, { foreignKey: 'subCategoryId', as: 'subCategory' });

module.exports = db;

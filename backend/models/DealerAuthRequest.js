// Dealer Management > Request Authorization — a reseller requests
// permission from a specific OEM (both real partner accounts on this same
// platform) to sell one of that OEM's products, for a stated validity
// window and reason/conditions. The OEM reviews and approves/rejects.
// Cross-tenant by design: fromUserId (reseller) and toUserId (OEM) are two
// different partner accounts, unlike every other per-partner table in this
// app which is scoped to a single user.
module.exports = (sequelize, DataTypes) => {
  const DealerAuthRequest = sequelize.define('DealerAuthRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    refNo: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'ref_no' },
    fromUserId: { type: DataTypes.INTEGER, allowNull: false, field: 'from_user_id' },
    toUserId: { type: DataTypes.INTEGER, allowNull: false, field: 'to_user_id' },
    categoryId: { type: DataTypes.INTEGER, allowNull: true, field: 'category_id' },
    subCategoryId: { type: DataTypes.INTEGER, allowNull: true, field: 'sub_category_id' },
    productId: { type: DataTypes.INTEGER, allowNull: true, field: 'product_id' },
    customProductName: { type: DataTypes.STRING, allowNull: true, field: 'custom_product_name' },
    validFrom: { type: DataTypes.DATEONLY, allowNull: false, field: 'valid_from' },
    validTo: { type: DataTypes.DATEONLY, allowNull: false, field: 'valid_to' },
    conditions: { type: DataTypes.TEXT, allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
    rejectionRemarks: { type: DataTypes.TEXT, allowNull: true, field: 'rejection_remarks' },
    decidedAt: { type: DataTypes.DATE, allowNull: true, field: 'decided_at' },
  }, {
    tableName: 'dealer_auth_requests',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['from_user_id'] }, { fields: ['to_user_id'] }],
  });

  return DealerAuthRequest;
};

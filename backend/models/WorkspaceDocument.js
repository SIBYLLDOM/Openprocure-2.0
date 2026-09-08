// Tender Hub > Documents tab — files the partner adds themselves, alongside
// (not replacing) the officially scraped GeM tender documents already shown
// via gem_tenders.json_data links.
module.exports = (sequelize, DataTypes) => {
  const WorkspaceDocument = sequelize.define('WorkspaceDocument', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    bidNumber: { type: DataTypes.STRING, allowNull: false, field: 'bid_number' },
    name: { type: DataTypes.STRING, allowNull: false },
    filePath: { type: DataTypes.STRING, allowNull: false, field: 'file_path' },
    fileSize: { type: DataTypes.BIGINT, allowNull: true, field: 'file_size' },
    mimeType: { type: DataTypes.STRING, allowNull: true, field: 'mime_type' },
  }, {
    tableName: 'workspace_documents',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['user_id', 'bid_number'] }],
  });

  return WorkspaceDocument;
};

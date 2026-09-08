// Tender Hub > My Docs — a lightweight per-tender notes/draft editor
// (the original backed this with a much larger doc-prep-linked editor;
// here it's a straightforward autosaved title+content note).
module.exports = (sequelize, DataTypes) => {
  const WorkspaceMyDoc = sequelize.define('WorkspaceMyDoc', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    bidNumber: { type: DataTypes.STRING, allowNull: false, field: 'bid_number' },
    title: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Untitled document' },
    content: { type: DataTypes.TEXT('long'), allowNull: true },
  }, {
    tableName: 'workspace_my_docs',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['user_id', 'bid_number'] }],
  });

  return WorkspaceMyDoc;
};

// Tender Hub > Doc Prep — clone of the original's doc_prep_sessions table,
// scoped per (user, bidNumber). `annexures` is the AI-detected checklist of
// required documents ([{ id, name, description, status, draftContent }]),
// populated by an Ollama call over this tender's parsed spec data (see
// docPrepController.js's analyze()) — the original's much larger pipeline
// (Claude CLI drafting, docx/pdf export, company-drive integration,
// scanned-doc OCR) isn't ported; this is the checklist + AI-draft core of
// it, built so it can grow into that once a real local model is online.
module.exports = (sequelize, DataTypes) => {
  const WorkspaceDocPrepSession = sequelize.define('WorkspaceDocPrepSession', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    bidNumber: { type: DataTypes.STRING, allowNull: false, field: 'bid_number' },
    status: { type: DataTypes.ENUM('idle', 'processing', 'done', 'error'), allowNull: false, defaultValue: 'idle' },
    annexures: { type: DataTypes.JSON, allowNull: true },
    errorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'error_message' },
  }, {
    tableName: 'workspace_doc_prep_sessions',
    timestamps: true,
    underscored: true,
    indexes: [{ unique: true, fields: ['user_id', 'bid_number'] }],
  });

  return WorkspaceDocPrepSession;
};

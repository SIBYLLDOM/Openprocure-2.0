// Read-only mirror of the tender-automation system's `tender_processing_results`
// table — used for the dashboard's "Recent Activity" feed.
module.exports = (sequelize, DataTypes) => {
  const TenderProcessingResult = sequelize.define('TenderProcessingResult', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    bidNo: { type: DataTypes.STRING, field: 'bid_no' },
    result: { type: DataTypes.ENUM('yes', 'no') },
    processingDate: { type: DataTypes.DATE, field: 'processing_date' },
    status: { type: DataTypes.STRING },
    dept: { type: DataTypes.STRING },
    itemCategory: { type: DataTypes.STRING, field: 'item_category' },
    suggestedProducts: { type: DataTypes.JSON, field: 'suggested_products' },
    deviationTables: { type: DataTypes.JSON, field: 'deviation_tables' },
  }, {
    tableName: 'tender_processing_results',
    timestamps: false,
  });

  return TenderProcessingResult;
};

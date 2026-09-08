// Repeatable "Additional Contact Persons" under a PartnerProfile (see
// SETUP_PROFILE.txt Step 1) — every field optional per the testing
// instruction; `isPrimary` marks the one that came from the wizard's own
// "Primary Contact" block (still just a row here, not a separate table).
module.exports = (sequelize, DataTypes) => {
  const PartnerContact = sequelize.define('PartnerContact', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    profileId: { type: DataTypes.INTEGER, allowNull: false, field: 'profile_id' },
    isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_primary' },
    name: { type: DataTypes.STRING, allowNull: true },
    designation: { type: DataTypes.STRING, allowNull: true },
    department: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    mobile: { type: DataTypes.STRING, allowNull: true },
    altMobile: { type: DataTypes.STRING, allowNull: true, field: 'alt_mobile' },
    whatsapp: { type: DataTypes.STRING, allowNull: true },
    landline: { type: DataTypes.STRING, allowNull: true },
    photoUrl: { type: DataTypes.STRING, allowNull: true, field: 'photo_url' },
    contactType: {
      type: DataTypes.ENUM('primary', 'sales', 'technical', 'finance', 'support', 'management'),
      allowNull: true,
      defaultValue: 'primary',
      field: 'contact_type'
    },
    // Comma-separated subset of ['Email','Phone','WhatsApp','SMS'].
    communicationPreferences: { type: DataTypes.STRING, allowNull: true, field: 'communication_preferences' }
  }, {
    tableName: 'partner_contacts',
    timestamps: true
  });

  return PartnerContact;
};

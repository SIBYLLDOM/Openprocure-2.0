// One row per partner (OEM/Reseller) User — the OEM/Reseller Setup Profile
// wizard (see SETUP_PROFILE.txt). Single-instance sections (company info,
// addresses, bank details, business/additional info) are stored as JSON
// blobs here rather than one column each — the spec has ~40 loosely-related
// scalar fields per section and every one of them is optional (per explicit
// testing instruction), so a flexible JSON blob per section avoids a
// sprawling column list while still keeping each section independently
// PATCH-able. Repeatable sections (contacts, locations, tax registrations,
// certificates, product selections) get their own tables below instead,
// since those genuinely need add/edit/delete-one-of-many semantics.
module.exports = (sequelize, DataTypes) => {
  const PartnerProfile = sequelize.define('PartnerProfile', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'user_id' },

    // ----- Step: Company Information -----
    // legalName, tradeName, logoUrl, shortName, description, yearEstablished,
    // employeeCount, website, officialEmail, altEmail, officialPhone,
    // altPhone, registrationNumber, cin, pan, gstin, tin, businessLicenseNumber
    companyInfo: { type: DataTypes.JSON, allowNull: true, field: 'company_info' },

    // ----- Step: Registered & Business Address -----
    // { line1, line2, country, state, city, district, pincode, landmark }
    registeredAddress: { type: DataTypes.JSON, allowNull: true, field: 'registered_address' },
    sameAsRegistered: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true, field: 'same_as_registered' },
    corporateAddress: { type: DataTypes.JSON, allowNull: true, field: 'corporate_address' },

    // ----- Step: Bank & Payment Details -----
    // { accountHolderName, bankName, branchName, accountNumber, ifsc, swift,
    //   accountType, bankAddress, preferredPaymentMethod, paymentTerms,
    //   currency, creditPeriod, upiId }
    bankDetails: { type: DataTypes.JSON, allowNull: true, field: 'bank_details' },

    // ----- Step: Business / OEM Details -----
    // { manufacturerStatus, brandName, productBrands, manufacturingTypes[],
    //   manufacturingLocations, distributionNetwork, authorizedDistributorStatus,
    //   authorizedDealerNetwork, serviceCenters, technicalSupportAvailability,
    //   warrantySupport, amcSupport, productSupportContact, salesSupportContact,
    //   technicalSupportContact }
    businessDetails: { type: DataTypes.JSON, allowNull: true, field: 'business_details' },

    // ----- Step: Additional Business Information -----
    // { missionAbout, keyProducts, keyMarkets, countriesServed, branchCount,
    //   warehouseCount, annualTurnoverRange, customerSegments[], businessModel }
    additionalInfo: { type: DataTypes.JSON, allowNull: true, field: 'additional_info' },

    // Which wizard step the partner last left off on — drives "Continue
    // Setting Up Your Profile" on return (see SETUP_PROFILE.txt section 21).
    currentStep: { type: DataTypes.STRING, allowNull: true, defaultValue: 'welcome', field: 'current_step' },
    confirmedAccurate: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false, field: 'confirmed_accurate' },
    submitted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    submittedAt: { type: DataTypes.DATE, allowNull: true, field: 'submitted_at' }
  }, {
    tableName: 'partner_profiles',
    timestamps: true
  });

  return PartnerProfile;
};

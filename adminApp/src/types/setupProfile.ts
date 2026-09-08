// Shared shapes for the OEM/Reseller Setup Profile wizard — mirrors the
// backend models in backend/models/Partner*.js. Every field is optional
// (matches "keep everything optional for testing" — see SETUP_PROFILE.txt).

export interface CompanyInfo {
  legalName?: string;
  tradeName?: string;
  logoUrl?: string;
  shortName?: string;
  description?: string;
  yearEstablished?: string;
  employeeCount?: string;
  website?: string;
  officialEmail?: string;
  altEmail?: string;
  officialPhone?: string;
  altPhone?: string;
  registrationNumber?: string;
  cin?: string;
  pan?: string;
  gstin?: string;
  tin?: string;
  businessLicenseNumber?: string;
  gemSellerId?: string;
  udyamId?: string;
}

export interface Address {
  line1?: string;
  line2?: string;
  country?: string;
  state?: string;
  city?: string;
  district?: string;
  pincode?: string;
  landmark?: string;
}

export interface BankAccount {
  id: string;
  accountHolderName?: string;
  bankName?: string;
  branchName?: string;
  accountNumber?: string;
  confirmAccountNumber?: string;
  ifsc?: string;
  swift?: string;
  accountType?: string;
  bankAddress?: string;
}

export interface PaymentMethodEntry {
  id: string;
  preferredPaymentMethod?: string;
  paymentTerms?: string;
  currency?: string;
  creditPeriod?: string;
  upiId?: string;
}

export interface BankDetails {
  accounts?: BankAccount[];
  paymentMethods?: PaymentMethodEntry[];
  // Legacy single-account / single-payment-method fields — profiles saved
  // before multi-account/multi-method support only have these;
  // BankingStep migrates them into accounts[0] / paymentMethods[0] on load
  // rather than the backend needing a data migration.
  accountHolderName?: string;
  bankName?: string;
  branchName?: string;
  accountNumber?: string;
  confirmAccountNumber?: string;
  ifsc?: string;
  swift?: string;
  accountType?: string;
  bankAddress?: string;
  preferredPaymentMethod?: string;
  paymentTerms?: string;
  currency?: string;
  creditPeriod?: string;
  upiId?: string;
}

export interface BusinessDetails {
  manufacturerStatus?: string;
  brandName?: string;
  productBrands?: string;
  manufacturingTypes?: string[];
  manufacturingLocations?: string;
  distributionNetwork?: string;
  authorizedDistributorStatus?: string;
  authorizedDealerNetwork?: string;
  serviceCenters?: string;
  technicalSupportAvailability?: string;
  warrantySupport?: string;
  amcSupport?: string;
  productSupportContact?: string;
  salesSupportContact?: string;
  technicalSupportContact?: string;
}

export interface AdditionalInfo {
  missionAbout?: string;
  keyProducts?: string;
  keyMarkets?: string;
  countriesServed?: string;
  branchCount?: string;
  warehouseCount?: string;
  annualTurnoverRange?: string;
  customerSegments?: string[];
  businessModel?: string;
}

export interface PartnerContact {
  id: number;
  isPrimary: boolean;
  name?: string | null;
  designation?: string | null;
  department?: string | null;
  email?: string | null;
  mobile?: string | null;
  altMobile?: string | null;
  whatsapp?: string | null;
  landline?: string | null;
  photoUrl?: string | null;
  contactType?: string | null;
  communicationPreferences?: string | null;
}

export interface PartnerLocation {
  id: number;
  name?: string | null;
  locationType?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  pincode?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface PartnerTaxRegistration {
  id: number;
  registrationType?: string | null;
  registrationNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  issuingAuthority?: string | null;
  documentUrl?: string | null;
  applicability?: 'required' | 'optional' | 'not_applicable' | null;
}

export interface PartnerCertificate {
  id: number;
  certificateType?: string | null;
  certificateName?: string | null;
  certificateNumber?: string | null;
  issuingAuthority?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  documentUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  remarks?: string | null;
}

export interface PartnerProductSelection {
  id: number;
  categoryId?: number | null;
  subCategoryId?: number | null;
  productId?: number | null;
  customProductName?: string | null;
  pendingApproval: boolean;
  product?: { id: number; name: string } | null;
}

export interface CompletionBreakdown {
  overallPercent: number;
  sections: Record<string, boolean>;
}

export interface PartnerProfileData {
  id: number;
  userId: number;
  companyInfo: CompanyInfo | null;
  registeredAddress: Address | null;
  sameAsRegistered: boolean | null;
  corporateAddress: Address | null;
  bankDetails: BankDetails | null;
  businessDetails: BusinessDetails | null;
  additionalInfo: AdditionalInfo | null;
  currentStep: string | null;
  confirmedAccurate: boolean | null;
  submitted: boolean;
  submittedAt: string | null;
  contacts: PartnerContact[];
  locations: PartnerLocation[];
  taxRegistrations: PartnerTaxRegistration[];
  certificates: PartnerCertificate[];
  productSelections: PartnerProductSelection[];
  completion: CompletionBreakdown;
}

export interface ProductMasterCategory {
  id: number;
  name: string;
  subCategories: { id: number; name: string }[];
}

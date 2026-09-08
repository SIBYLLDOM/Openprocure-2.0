import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronDown, Pencil, ExternalLink, FileText,
  UserCircle2, Building2, MapPin, Package, Landmark, Receipt, BadgeCheck, Briefcase,
} from 'lucide-react';
import { Badge } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { API_ORIGIN } from '../../utils/apiBase';
import * as setupApi from '../../services/setupProfileApi';
import { deriveAccounts, deriveMethods } from '../../utils/bankDetails';
import type { PartnerProfileData, ProductMasterCategory } from '../../types/setupProfile';

const maskAccount = (num?: string | null) => (num ? `••••${num.slice(-4)}` : '—');
const isImage = (url?: string | null) => !!url && /\.(png|jpe?g|gif|webp)$/i.test(url);

const Row = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-gray-50 last:border-0">
    <span className="text-gray-500">{label}</span>
    <span className="text-gray-900 font-medium text-right">{value || '—'}</span>
  </div>
);

const SubHeading = ({ children }: { children: ReactNode }) => (
  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-4 mb-1 first:mt-0">{children}</h4>
);

const DocThumb = ({ url, label }: { url?: string | null; label: string }) => {
  if (!url) return <span className="text-xs text-gray-300">No document</span>;
  const src = `${API_ORIGIN}${url}`;
  return (
    <a href={src} target="_blank" rel="noreferrer" title={label} className="flex items-center gap-1.5 text-xs text-primary-600 hover:underline">
      {isImage(url) ? <img src={src} alt={label} className="w-6 h-6 rounded object-cover border border-gray-200" /> : <FileText size={13} />}
      View document <ExternalLink size={11} />
    </a>
  );
};

interface SectionDef { id: string; title: string; icon: typeof UserCircle2; content: ReactNode }

interface Props {
  profile: PartnerProfileData;
  confirmChecked: boolean;
  onConfirmChange: (v: boolean) => void;
  termsChecked: boolean;
  onTermsChange: (v: boolean) => void;
  onEditSection: (step: string) => void;
}

const ReviewStep = ({ profile, confirmChecked, onConfirmChange, termsChecked, onTermsChange, onEditSection }: Props) => {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>('contact');
  const [categories, setCategories] = useState<ProductMasterCategory[]>([]);
  useEffect(() => { setupApi.getMyCategories().then(setCategories).catch(() => {}); }, []);
  const categoryName = (id: string) => categories.find((c) => String(c.id) === id)?.name || `Category ${id}`;

  const primary = profile.contacts.find((c) => c.isPrimary);
  const others = profile.contacts.filter((c) => !c.isPrimary);
  const accounts = deriveAccounts(profile.bankDetails);
  const methods = deriveMethods(profile.bankDetails);

  const productsByCategory = new Map<string, { id: number; name: string; custom: boolean }[]>();
  profile.productSelections.forEach((s) => {
    const key = s.categoryId ? String(s.categoryId) : 'other';
    const name = s.product?.name || s.customProductName || 'Unnamed';
    productsByCategory.set(key, [...(productsByCategory.get(key) || []), { id: s.id, name, custom: !s.productId }]);
  });

  const sections: SectionDef[] = [
    {
      id: 'contact', title: 'Contact Person Details', icon: UserCircle2,
      content: (
        <>
          <SubHeading>Primary Contact</SubHeading>
          <Row label="Name" value={primary?.name} />
          <Row label="Designation" value={primary?.designation} />
          <Row label="Department" value={primary?.department} />
          <Row label="Email" value={primary?.email} />
          <Row label="Mobile" value={primary?.mobile} />
          <Row label="Alternate Mobile" value={primary?.altMobile} />
          <Row label="WhatsApp" value={primary?.whatsapp} />
          <Row label="Landline" value={primary?.landline} />
          <Row label="Communication Preferences" value={primary?.communicationPreferences?.split(',').join(', ')} />

          {others.length > 0 && (
            <>
              <SubHeading>Additional Contacts ({others.length})</SubHeading>
              {others.map((c) => (
                <div key={c.id} className="rounded-lg border border-gray-100 p-3 mt-2">
                  <Row label="Name" value={c.name} />
                  <Row label="Type" value={c.contactType} />
                  <Row label="Designation" value={c.designation} />
                  <Row label="Department" value={c.department} />
                  <Row label="Email" value={c.email} />
                  <Row label="Mobile" value={c.mobile} />
                </div>
              ))}
            </>
          )}
        </>
      ),
    },
    {
      id: 'company', title: 'Company Information', icon: Building2,
      content: (
        <>
          {profile.companyInfo?.logoUrl && (
            <img src={`${API_ORIGIN}${profile.companyInfo.logoUrl}`} alt="Company logo" className="h-12 mb-3 object-contain" />
          )}
          <Row label="Legal Name" value={profile.companyInfo?.legalName} />
          <Row label="Trade Name" value={profile.companyInfo?.tradeName} />
          <Row label="Short Name" value={profile.companyInfo?.shortName} />
          <Row label="Year Established" value={profile.companyInfo?.yearEstablished} />
          <Row label="Number of Employees" value={profile.companyInfo?.employeeCount} />
          <Row label="Website" value={profile.companyInfo?.website} />
          <Row label="Official Email" value={profile.companyInfo?.officialEmail} />
          <Row label="Alternate Email" value={profile.companyInfo?.altEmail} />
          <Row label="Official Phone" value={profile.companyInfo?.officialPhone} />
          <Row label="Alternate Phone" value={profile.companyInfo?.altPhone} />
          <Row label="Description" value={profile.companyInfo?.description} />
          <SubHeading>Company Identity</SubHeading>
          <Row label="Registration Number" value={profile.companyInfo?.registrationNumber} />
          <Row label="GSTIN" value={profile.companyInfo?.gstin} />
          <Row label="PAN" value={profile.companyInfo?.pan} />
          <Row label="Gem Seller ID" value={profile.companyInfo?.gemSellerId} />
          <Row label="Business License Number" value={profile.companyInfo?.businessLicenseNumber} />
          <Row label="Udyam ID Number" value={profile.companyInfo?.udyamId} />
          <SubHeading>Business Categories</SubHeading>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(user?.companyTypes ?? []).map((t) => <Badge key={t} status={t} variant="primary" />)}
          </div>
        </>
      ),
    },
    {
      id: 'address', title: 'Registered & Business Address', icon: MapPin,
      content: (
        <>
          <SubHeading>Registered Address</SubHeading>
          <Row label="Address Line 1" value={profile.registeredAddress?.line1} />
          <Row label="Address Line 2" value={profile.registeredAddress?.line2} />
          <Row label="Country" value={profile.registeredAddress?.country} />
          <Row label="State" value={profile.registeredAddress?.state} />
          <Row label="City" value={profile.registeredAddress?.city} />
          <Row label="District" value={profile.registeredAddress?.district} />
          <Row label="Pincode" value={profile.registeredAddress?.pincode} />
          <Row label="Landmark" value={profile.registeredAddress?.landmark} />

          <SubHeading>Corporate Office</SubHeading>
          {profile.sameAsRegistered ? (
            <Row label="Corporate Office" value="Same as Registered Office" />
          ) : (
            <>
              <Row label="Address Line 1" value={profile.corporateAddress?.line1} />
              <Row label="Country" value={profile.corporateAddress?.country} />
              <Row label="State" value={profile.corporateAddress?.state} />
              <Row label="City" value={profile.corporateAddress?.city} />
              <Row label="Pincode" value={profile.corporateAddress?.pincode} />
            </>
          )}

          {profile.locations.length > 0 && (
            <>
              <SubHeading>Manufacturing / Warehouse Locations ({profile.locations.length})</SubHeading>
              {profile.locations.map((l) => (
                <div key={l.id} className="rounded-lg border border-gray-100 p-3 mt-2">
                  <Row label="Name" value={l.name} />
                  <Row label="Type" value={l.locationType} />
                  <Row label="Address" value={l.addressLine1} />
                  <Row label="City / State / Country" value={[l.city, l.state, l.country].filter(Boolean).join(', ')} />
                  <Row label="Pincode" value={l.pincode} />
                  <Row label="Contact" value={[l.contactPerson, l.phone].filter(Boolean).join(' · ')} />
                </div>
              ))}
            </>
          )}
        </>
      ),
    },
    {
      id: 'products', title: 'Products & Categories', icon: Package,
      content: profile.productSelections.length === 0 ? (
        <p className="text-sm text-gray-400">No products selected yet.</p>
      ) : (
        <>
          {Array.from(productsByCategory.entries()).map(([catId, items]) => (
            <div key={catId} className="mt-3 first:mt-0">
              <SubHeading>{categoryName(catId)} · {items.length} product{items.length === 1 ? '' : 's'}</SubHeading>
              <div className="flex flex-wrap gap-1.5">
                {items.map((p) => (
                  <Badge key={p.id} status={p.name} variant={p.custom ? 'warning' : 'gray'} />
                ))}
              </div>
            </div>
          ))}
        </>
      ),
    },
    {
      id: 'banking', title: 'Bank & Payment Details', icon: Landmark,
      content: (
        <>
          {accounts.length === 0 ? <p className="text-sm text-gray-400">No bank accounts added.</p> : (
            <>
              <SubHeading>Bank Accounts ({accounts.length})</SubHeading>
              {accounts.map((a, i) => (
                <div key={a.id} className="rounded-lg border border-gray-100 p-3 mt-2">
                  <Row label={i === 0 ? 'Primary Account Holder' : 'Account Holder'} value={a.accountHolderName} />
                  <Row label="Bank" value={a.bankName} />
                  <Row label="Branch" value={a.branchName} />
                  <Row label="Account Type" value={a.accountType} />
                  <Row label="Account Number" value={maskAccount(a.accountNumber)} />
                  <Row label="IFSC" value={a.ifsc} />
                  <Row label="SWIFT" value={a.swift} />
                </div>
              ))}
            </>
          )}
          {methods.length === 0 ? <p className="text-sm text-gray-400 mt-3">No payment methods added.</p> : (
            <>
              <SubHeading>Payment Methods ({methods.length})</SubHeading>
              {methods.map((m) => (
                <div key={m.id} className="rounded-lg border border-gray-100 p-3 mt-2">
                  <Row label="Method" value={m.preferredPaymentMethod} />
                  <Row label="Terms" value={m.paymentTerms} />
                  <Row label="Currency" value={m.currency} />
                  <Row label="Credit Period" value={m.creditPeriod} />
                  <Row label="UPI ID" value={m.upiId} />
                </div>
              ))}
            </>
          )}
        </>
      ),
    },
    {
      id: 'tax', title: 'Tax & Government Registration', icon: Receipt,
      content: profile.taxRegistrations.length === 0 ? (
        <p className="text-sm text-gray-400">No registrations added.</p>
      ) : (
        profile.taxRegistrations.map((r) => (
          <div key={r.id} className="rounded-lg border border-gray-100 p-3 mt-2 first:mt-0">
            <Row label="Type" value={r.registrationType} />
            <Row label="Number" value={r.registrationNumber} />
            <Row label="Issuing Authority" value={r.issuingAuthority} />
            <Row label="Applicability" value={r.applicability} />
            <div className="flex justify-between items-center py-1.5 text-sm"><span className="text-gray-500">Document</span><DocThumb url={r.documentUrl} label={r.registrationType || 'Registration'} /></div>
          </div>
        ))
      ),
    },
    {
      id: 'certificates', title: 'Certificates & Compliance Documents', icon: BadgeCheck,
      content: profile.certificates.length === 0 ? (
        <p className="text-sm text-gray-400">No certificates uploaded.</p>
      ) : (
        profile.certificates.map((c) => (
          <div key={c.id} className="rounded-lg border border-gray-100 p-3 mt-2 first:mt-0">
            <Row label="Type" value={c.certificateType} />
            <Row label="Name" value={c.certificateName} />
            <Row label="Number" value={c.certificateNumber} />
            <Row label="Issuing Authority" value={c.issuingAuthority} />
            <Row label="Expiry Date" value={c.expiryDate} />
            <div className="flex justify-between items-center py-1.5 text-sm"><span className="text-gray-500">Document</span><DocThumb url={c.documentUrl} label={c.certificateType || 'Certificate'} /></div>
          </div>
        ))
      ),
    },
    {
      id: 'business', title: 'Business / OEM Details', icon: Briefcase,
      content: (
        <>
          <Row label="Manufacturing Types" value={profile.businessDetails?.manufacturingTypes?.join(', ')} />
          <Row label="Brand Name" value={profile.businessDetails?.brandName} />
          <Row label="Product Brands" value={profile.businessDetails?.productBrands} />
          <Row label="Manufacturing Locations" value={profile.businessDetails?.manufacturingLocations} />
          <Row label="Distribution Network" value={profile.businessDetails?.distributionNetwork} />
          <Row label="Authorized Distributor Status" value={profile.businessDetails?.authorizedDistributorStatus} />
          <Row label="Authorized Dealer Network" value={profile.businessDetails?.authorizedDealerNetwork} />
          <Row label="Service Centers" value={profile.businessDetails?.serviceCenters} />
          <Row label="Technical Support Availability" value={profile.businessDetails?.technicalSupportAvailability} />
          <Row label="Warranty Support" value={profile.businessDetails?.warrantySupport} />
          <Row label="AMC Support" value={profile.businessDetails?.amcSupport} />
          <SubHeading>Support Contacts</SubHeading>
          <Row label="Product Support" value={profile.businessDetails?.productSupportContact} />
          <Row label="Sales Support" value={profile.businessDetails?.salesSupportContact} />
          <Row label="Technical Support" value={profile.businessDetails?.technicalSupportContact} />
        </>
      ),
    },
    {
      id: 'additional', title: 'Additional Business Information', icon: FileText,
      content: (
        <>
          <Row label="Mission / About" value={profile.additionalInfo?.missionAbout} />
          <Row label="Key Products" value={profile.additionalInfo?.keyProducts} />
          <Row label="Key Markets" value={profile.additionalInfo?.keyMarkets} />
          <Row label="Countries Served" value={profile.additionalInfo?.countriesServed} />
          <Row label="Number of Branches" value={profile.additionalInfo?.branchCount} />
          <Row label="Number of Warehouses" value={profile.additionalInfo?.warehouseCount} />
          <Row label="Annual Turnover Range" value={profile.additionalInfo?.annualTurnoverRange} />
          <Row label="Business Model" value={profile.additionalInfo?.businessModel} />
          <Row label="Customer Segments" value={profile.additionalInfo?.customerSegments?.join(', ')} />
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="space-y-2.5">
        {sections.map((s) => {
          const Icon = s.icon;
          const open = openId === s.id;
          return (
            <div key={s.id} className="rounded-xl border border-gray-100 overflow-hidden">
              <div className={`w-full flex items-center justify-between gap-3 p-4 transition-colors ${open ? 'bg-primary-50/60' : 'bg-gray-50/60 hover:bg-gray-50'}`}>
                <button onClick={() => setOpenId(open ? null : s.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                  <Icon size={16} className={open ? 'text-primary-600' : 'text-gray-400'} />
                  <span className="font-semibold text-sm text-gray-900 truncate">{s.title}</span>
                </button>
                <button onClick={() => onEditSection(s.id)} className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1 flex-shrink-0">
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={() => setOpenId(open ? null : s.id)} className="flex-shrink-0 text-gray-400">
                  <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {open && <div className="p-4 border-t border-gray-100">{s.content}</div>}
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-gray-100 p-4 space-y-3">
        <label className="flex items-start gap-2.5 text-sm text-gray-700">
          <input type="checkbox" className="accent-primary-600 mt-0.5" checked={termsChecked} onChange={(e) => onTermsChange(e.target.checked)} />
          I have read and agree to the <a href="#" onClick={(e) => e.preventDefault()} className="text-primary-600 hover:underline">Terms &amp; Conditions</a>.
        </label>
        <label className="flex items-start gap-2.5 text-sm text-gray-700">
          <input type="checkbox" className="accent-primary-600 mt-0.5" checked={confirmChecked} onChange={(e) => onConfirmChange(e.target.checked)} />
          I confirm that the information provided above is accurate and complete.
        </label>
        {(!termsChecked || !confirmChecked) && (
          <p className="text-xs text-gray-400">Both boxes must be checked before you can submit.</p>
        )}
      </div>
    </div>
  );
};

export default ReviewStep;

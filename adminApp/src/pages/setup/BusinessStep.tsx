import { useState } from 'react';
import { Input } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import * as setupApi from '../../services/setupProfileApi';
import type { PartnerProfileData, BusinessDetails } from '../../types/setupProfile';

const MANUFACTURING_TYPES = ['Own Manufacturing', 'Contract Manufacturing', 'Importer', 'Distributor', 'Wholesaler', 'Retailer', 'System Integrator', 'Service Provider', 'OEM', 'ODM'];

const BusinessStep = ({ profile, onSaved }: { profile: PartnerProfileData; onSaved: (p: PartnerProfileData) => void }) => {
  const { show } = useToast();
  const [form, setForm] = useState<BusinessDetails>(profile.businessDetails || {});
  const set = (k: keyof BusinessDetails, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // No explicit Save button on this step — fields persist on blur, and the
  // manufacturing-type toggle chips persist the instant they're clicked.
  const persist = (next: BusinessDetails) => setupApi.saveSection('businessDetails', next).then(onSaved).catch(() => show('Failed to save.', 'error'));

  const toggleType = (t: string) => {
    const cur = form.manufacturingTypes || [];
    const next = { ...form, manufacturingTypes: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] };
    setForm(next);
    persist(next);
  };

  return (
    <div>
      <div>
        <label className="label mb-2">Manufacturing / Business Type — select all that apply</label>
        <div className="flex flex-wrap gap-2">
          {MANUFACTURING_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => toggleType(t)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${(form.manufacturingTypes || []).includes(t) ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-x-10 gap-y-6 mt-6">
        <div className="rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Manufacturing & Distribution</h3>
          <div className="grid sm:grid-cols-2 gap-5">
            <Input label="Brand Name" placeholder="e.g. ACME Industries" value={form.brandName || ''} onChange={(e) => set('brandName', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Product Brands" value={form.productBrands || ''} onChange={(e) => set('productBrands', e.target.value)} onBlur={() => persist(form)} placeholder="Comma-separated" />
            <Input label="Manufacturing Locations" placeholder="e.g. Pune, Chennai" value={form.manufacturingLocations || ''} onChange={(e) => set('manufacturingLocations', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Distribution Network" placeholder="Regions covered" value={form.distributionNetwork || ''} onChange={(e) => set('distributionNetwork', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Authorized Distributor Status" placeholder="e.g. Authorized for XYZ" value={form.authorizedDistributorStatus || ''} onChange={(e) => set('authorizedDistributorStatus', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Authorized Dealer Network" placeholder="Number / regions of dealers" value={form.authorizedDealerNetwork || ''} onChange={(e) => set('authorizedDealerNetwork', e.target.value)} onBlur={() => persist(form)} />
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 p-5 flex flex-col">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Support & Service</h3>
          <div className="grid sm:grid-cols-2 gap-5">
            <Input label="Service Centers" placeholder="e.g. 5 centers across India" value={form.serviceCenters || ''} onChange={(e) => set('serviceCenters', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Technical Support Availability" placeholder="e.g. 24x7, business hours" value={form.technicalSupportAvailability || ''} onChange={(e) => set('technicalSupportAvailability', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Warranty Support" placeholder="e.g. 1 year on-site" value={form.warrantySupport || ''} onChange={(e) => set('warrantySupport', e.target.value)} onBlur={() => persist(form)} />
            <Input label="AMC Support" placeholder="e.g. Available, on request" value={form.amcSupport || ''} onChange={(e) => set('amcSupport', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Product Support Contact" placeholder="Name or email" value={form.productSupportContact || ''} onChange={(e) => set('productSupportContact', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Sales Support Contact" placeholder="Name or email" value={form.salesSupportContact || ''} onChange={(e) => set('salesSupportContact', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Technical Support Contact" placeholder="Name or email" value={form.technicalSupportContact || ''} onChange={(e) => set('technicalSupportContact', e.target.value)} onBlur={() => persist(form)} wrapperClassName="sm:col-span-2" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessStep;

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Input, PhoneInput, Select, Button, Modal, FileUploadField } from '../../components/ui';
import { API_ORIGIN } from '../../utils/apiBase';
import * as setupApi from '../../services/setupProfileApi';
import type { PartnerProfileData, CompanyInfo } from '../../types/setupProfile';

// Requires an actual domain (something.tld), with or without a scheme —
// "eden" fails this, "eden.com" or "https://eden.com" pass. Rejecting a
// bare word here is the whole point of the validation.
const isValidWebsite = (v: string) => /^(https?:\/\/)?([\w-]+\.)+[a-zA-Z]{2,}([/?#]\S*)?$/.test(v.trim());

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [
  { value: '', label: 'Select year…' },
  ...Array.from({ length: currentYear - 1949 }, (_, i) => String(currentYear - i)).map((y) => ({ value: y, label: y })),
];

const CompanyStep = ({ profile, onSaved }: { profile: PartnerProfileData; onSaved: (p: PartnerProfileData) => void }) => {
  const { user, refreshUser } = useAuth();
  const { show } = useToast();
  const [form, setForm] = useState<CompanyInfo>(profile.companyInfo || {});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [websiteError, setWebsiteError] = useState<string | undefined>(undefined);

  // No explicit Save button on this step — fields persist on blur instead,
  // so typing doesn't fire a request per keystroke.
  const set = (key: keyof CompanyInfo, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const persist = () => setupApi.saveSection('companyInfo', form).then(onSaved).catch(() => show('Failed to save.', 'error'));
  // For a dropdown there's no blur-to-commit moment worth waiting for —
  // persist the instant a value is picked, using the merged object
  // directly rather than the `form` closure (which is still the
  // pre-change value at the point onChange fires).
  const setAndPersist = (key: keyof CompanyInfo, value: string) => {
    const next = { ...form, [key]: value };
    setForm(next);
    setupApi.saveSection('companyInfo', next).then(onSaved).catch(() => show('Failed to save.', 'error'));
  };

  // Website gets its own blur handler: a value that doesn't look like a
  // real site link (no dot + TLD) is flagged and NOT saved until fixed —
  // matches "eden should not be accepted", only "eden.com" is.
  const persistWebsite = () => {
    const value = (form.website || '').trim();
    if (value && !isValidWebsite(value)) {
      setWebsiteError('Enter a real website link, e.g. www.company.com');
      return;
    }
    setWebsiteError(undefined);
    persist();
  };

  const handleLogoChange = async (file: File | null) => {
    setLogoFile(file);
    if (!file) return;
    try {
      await setupApi.uploadLogo(file);
      onSaved(await setupApi.getProfile());
      show('Company logo uploaded.', 'success');
    } catch (err: any) {
      show(err?.response?.data?.message ?? 'Failed to upload logo.', 'error');
    }
  };

  // Business categories drive what Products & Categories (Step 4) offers —
  // see backend getMyCategories, which reads User.companyTypes fresh every
  // request, so any change here shows up there immediately.
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [savingCategories, setSavingCategories] = useState(false);
  const selected = user?.companyTypes ?? [];

  useEffect(() => { setupApi.getCompanyTypes().then(setAllCategories).catch(() => {}); }, []);

  const openCategories = () => { setDraftCategories(selected); setCategoriesOpen(true); };
  const toggleDraft = (t: string) => setDraftCategories((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const saveCategories = async (next: string[]) => {
    if (next.length === 0) { show('Select at least one business category.', 'error'); return; }
    setSavingCategories(true);
    try {
      await setupApi.updateCompanyTypes(next);
      await refreshUser();
      show('Business categories updated.', 'success');
      setCategoriesOpen(false);
    } catch (err: any) {
      show(err?.response?.data?.message ?? 'Failed to update categories.', 'error');
    } finally {
      setSavingCategories(false);
    }
  };

  const removeCategory = (t: string) => {
    if (selected.length <= 1) { show('At least one business category is required.', 'error'); return; }
    saveCategories(selected.filter((x) => x !== t));
  };

  return (
    <div className="grid lg:grid-cols-[2fr_1fr] gap-x-10 gap-y-4">
      {/* Left — legal name and the rest of the company's core details */}
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          <Input label="Legal Company Name" placeholder="As per registration certificate" value={form.legalName || ''} onChange={(e) => set('legalName', e.target.value)} onBlur={persist} />
          <Input label="Display / Trade Name" placeholder="Brand or trading name" value={form.tradeName || ''} onChange={(e) => set('tradeName', e.target.value)} onBlur={persist} />
          <Input label="Company Short Name" placeholder="e.g. ACME" value={form.shortName || ''} onChange={(e) => set('shortName', e.target.value)} onBlur={persist} />
          <Select label="Year Established" value={form.yearEstablished || ''} options={YEAR_OPTIONS} onChange={(e) => setAndPersist('yearEstablished', e.target.value)} />
          <Input label="Number of Employees" placeholder="e.g. 50-100" value={form.employeeCount || ''} onChange={(e) => set('employeeCount', e.target.value)} onBlur={persist} />
          <Input label="Company Website" value={form.website || ''} onChange={(e) => { set('website', e.target.value); setWebsiteError(undefined); }} onBlur={persistWebsite} error={websiteError} placeholder="www.company.com" />
          <Input label="Official Email" type="email" placeholder="contact@company.com" value={form.officialEmail || ''} onChange={(e) => set('officialEmail', e.target.value)} onBlur={persist} />
          <Input label="Alternate Email" type="email" placeholder="alternate@company.com" value={form.altEmail || ''} onChange={(e) => set('altEmail', e.target.value)} onBlur={persist} />
          <PhoneInput label="Official Phone Number" value={form.officialPhone || ''} onChange={(v) => set('officialPhone', v)} onBlur={persist} />
          <PhoneInput label="Alternate Phone Number" value={form.altPhone || ''} onChange={(v) => set('altPhone', v)} onBlur={persist} />

          {/* Company Logo sits in the grid right next to Alternate Phone Number */}
          <div>
            <FileUploadField
              label="Company Logo"
              file={logoFile}
              onChange={handleLogoChange}
              existingFileName={form.logoUrl ? form.logoUrl.split('/').pop() : null}
              accept=".png,.jpg,.jpeg"
            />
            {form.logoUrl && !logoFile && (
              <img src={`${API_ORIGIN}${form.logoUrl}`} alt="Company logo" className="h-10 mt-2 rounded-lg border border-gray-100 object-contain" />
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2.5">Company Identity</h3>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            <Input label="Company Registration Number" placeholder="e.g. U12345MH2010PTC000000" value={form.registrationNumber || ''} onChange={(e) => set('registrationNumber', e.target.value)} onBlur={persist} />
            <Input label="GSTIN" placeholder="15-digit GST number" value={form.gstin || ''} onChange={(e) => set('gstin', e.target.value)} onBlur={persist} />
            <Input label="PAN" placeholder="e.g. ABCDE1234F" value={form.pan || ''} onChange={(e) => set('pan', e.target.value)} onBlur={persist} />
            <Input label="Gem Seller ID" placeholder="GeM portal seller ID" value={form.gemSellerId || ''} onChange={(e) => set('gemSellerId', e.target.value)} onBlur={persist} />
            <Input label="Business License Number" placeholder="License / registration no." value={form.businessLicenseNumber || ''} onChange={(e) => set('businessLicenseNumber', e.target.value)} onBlur={persist} />
            <Input label="Udyam ID Number" placeholder="e.g. UDYAM-XX-00-0000000" value={form.udyamId || ''} onChange={(e) => set('udyamId', e.target.value)} onBlur={persist} />
          </div>
        </div>
      </div>

      {/* Right — business categories first, then the company description, spread to fill the column's full height */}
      <div className="flex flex-col gap-4 lg:border-l lg:border-gray-100 lg:pl-8 h-full">
        <div className="rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="label !mb-0">Selected Business Categories</label>
            <button onClick={openCategories} className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1 flex-shrink-0">
              <Plus size={12} /> Manage
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {selected.map((t) => (
              <div key={t} className="flex items-center justify-between gap-3 rounded-lg bg-primary-50/60 border border-primary-100 px-3.5 py-2">
                <span className="text-sm font-semibold text-primary-800">{t}</span>
                <button onClick={() => removeCategory(t)} title="Remove category" className="text-primary-400 hover:text-danger-600 flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">Determines the product categories offered in Step 4.</p>
        </div>

        <div className="rounded-xl border border-gray-100 p-4 flex-1 flex flex-col">
          <label className="label mb-3">Company Description</label>
          <textarea
            className="input flex-1 resize-none !text-sm leading-relaxed"
            placeholder="A short overview of what your company does, its mission, and what sets it apart…"
            value={form.description || ''}
            onChange={(e) => set('description', e.target.value)}
            onBlur={persist}
          />
        </div>
      </div>

      <Modal open={categoriesOpen} onClose={() => !savingCategories && setCategoriesOpen(false)} title="Manage Business Categories" size="md"
        footer={<><Button variant="secondary" onClick={() => setCategoriesOpen(false)} disabled={savingCategories}>Cancel</Button><Button loading={savingCategories} onClick={() => saveCategories(draftCategories)}>Save</Button></>}>
        <p className="text-sm text-gray-500 mb-4">Add or remove the categories that describe your business — this also updates the product categories available in Step 4.</p>
        <div className="flex flex-wrap gap-2">
          {allCategories.map((t) => (
            <button key={t} type="button" onClick={() => toggleDraft(t)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${draftCategories.includes(t) ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
};

export default CompanyStep;

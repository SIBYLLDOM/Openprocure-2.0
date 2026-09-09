import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Upload, ChevronDown, Plus, Trash2, Download, FileText } from 'lucide-react';
import {
  createVendor, updateVendor, getAvailableContacts, linkContact, unlinkContact,
  uploadVendorAttachment, downloadVendorAttachment, deleteVendorAttachment,
} from '../../../services/vendorsApi';
import type { VendorDetail, VendorRow, VendorContact, VendorAttachment, VendorBankAccount, AvailableContact } from '../../../services/vendorsApi';
import { Button, Modal, Select } from '../../../components/ui';
import { COUNTRIES, INDIA_STATES } from '../../../data/geo';
import { useToast } from '../../../context/ToastContext';

const INDUSTRY_OPTIONS = [
  '', 'Education', 'Healthcare', 'Manufacturing', 'IT & Software', 'Retail', 'Government', 'Construction',
  'Finance', 'Logistics', 'Hospitality', 'Other',
].map((v) => ({ value: v, label: v || '-Select an Industry-' }));

const countryOpts = [{ value: '', label: 'Select Country' }, ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))];

const formatSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
};

// Every section here is its own dropdown/accordion the user opens to fill
// and closes when done (explicit ask), including Basic Information — unlike
// the Client form, which keeps Basic Information always open since it's
// the only section with a required field there. Vendor has required fields
// (Business Name, Country) in Basic Info too, so it opens by default but
// still collapses like the rest.
const CollapsibleSection = ({ title, badge, defaultOpen, children }: { title: string; badge?: string; defaultOpen?: boolean; children: ReactNode }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${open ? 'bg-primary-50/60' : 'bg-white hover:bg-gray-50'}`}
      >
        <span className="text-[13px] font-bold text-gray-900 uppercase tracking-wide">
          {title} {badge && <span className="text-gray-400 font-normal normal-case ml-1">{badge}</span>}
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180 text-primary-600' : ''}`} />
      </button>
      {open && <div className="px-4 py-4 border-t border-gray-100">{children}</div>}
    </div>
  );
};

const emptyForm = {
  businessName: '', industry: '', country: '', city: '',
  gstin: '', pan: '', vendorType: 'Company' as 'Individual' | 'Company', taxTreatment: '',
  state: '', postalCode: '', streetAddress: '', displayName: '', email: '', phone: '', defaultDueDays: '',
};
const emptyBankAccount: VendorBankAccount = { accountHolderName: '', bankName: '', accountNumber: '', ifsc: '', branch: '' };

const VendorFormModal = ({ initial, onClose, onDone }: { initial?: VendorDetail; onClose: () => void; onDone: (v: VendorRow) => void }) => {
  const { show } = useToast();
  const [form, setForm] = useState(initial ? {
    businessName: initial.businessName, industry: initial.industry || '', country: initial.country || '', city: initial.city || '',
    gstin: initial.gstin || '', pan: initial.pan || '', vendorType: initial.vendorType, taxTreatment: initial.taxTreatment || '',
    state: initial.state || '', postalCode: initial.postalCode || '', streetAddress: initial.streetAddress || '', displayName: initial.displayName || '',
    email: initial.email || '', phone: initial.phone || '', defaultDueDays: initial.defaultDueDays ? String(initial.defaultDueDays) : '',
  } : emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);

  const [availableContacts, setAvailableContacts] = useState<AvailableContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [existingContactLinks, setExistingContactLinks] = useState<VendorContact[]>(initial?.contactLinks || []);
  const [stagedContactIds, setStagedContactIds] = useState<number[]>([]);

  const [existingAttachments, setExistingAttachments] = useState<VendorAttachment[]>(initial?.attachments || []);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const [bankAccounts, setBankAccounts] = useState<VendorBankAccount[]>(initial?.bankAccounts || []);
  const [ledgerChoice, setLedgerChoice] = useState<'none' | 'create' | 'link'>('none');

  useEffect(() => { getAvailableContacts().then((r) => setAvailableContacts(r.data)); }, []);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const linkedIds = new Set(existingContactLinks.map((l) => l.contact.id).concat(stagedContactIds));
  const unlinkedContacts = availableContacts.filter((c) => !linkedIds.has(c.id));

  const doLinkContact = () => {
    if (!selectedContactId) return;
    if (initial) {
      linkContact(initial.id, Number(selectedContactId)).then((r: any) => setExistingContactLinks((l) => [...l, r.data])).catch(() => show('Failed to link contact.', 'error'));
    } else {
      setStagedContactIds((ids) => [...ids, Number(selectedContactId)]);
    }
    setSelectedContactId('');
  };
  const doUnlinkExisting = (linkId: number) => {
    if (!initial) return;
    unlinkContact(initial.id, linkId).then(() => setExistingContactLinks((l) => l.filter((x) => x.id !== linkId))).catch(() => show('Failed to unlink.', 'error'));
  };
  const doUnstageContact = (contactId: number) => setStagedContactIds((ids) => ids.filter((id) => id !== contactId));

  const addAttachment = (file: File) => {
    if (initial) {
      uploadVendorAttachment(initial.id, file).then((r) => setExistingAttachments((a) => [...a, r.data])).catch(() => show('Upload failed.', 'error'));
    } else {
      setStagedFiles((f) => [...f, file]);
    }
  };
  const removeExistingAttachment = (id: number) => {
    if (!initial) return;
    deleteVendorAttachment(initial.id, id).then(() => setExistingAttachments((a) => a.filter((x) => x.id !== id))).catch(() => show('Failed to delete.', 'error'));
  };
  const removeStagedFile = (idx: number) => setStagedFiles((f) => f.filter((_, i) => i !== idx));

  const save = async () => {
    if (!form.businessName.trim() || !form.country) return;
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v as string); });
      if (bankAccounts.length) fd.append('bankAccounts', JSON.stringify(bankAccounts.filter((b) => b.accountHolderName || b.accountNumber)));
      if (logoFile) fd.append('logo', logoFile);
      const r = initial ? await updateVendor(initial.id, fd) : await createVendor(fd);
      if (!initial) {
        const newId = r.data.id;
        await Promise.all([
          ...stagedContactIds.map((cid) => linkContact(newId, cid)),
          ...stagedFiles.map((f) => uploadVendorAttachment(newId, f)),
        ]);
      }
      show(initial ? 'Vendor updated.' : 'Vendor added.', 'success');
      onDone(r.data);
    } catch (err: any) {
      show(err?.response?.data?.message || 'Failed to save vendor.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit Vendor' : 'Add New Vendor'} size="2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!form.businessName.trim() || !form.country} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <CollapsibleSection title="Basic Information" defaultOpen>
          <div className="flex items-center gap-4 mb-4">
            <button type="button" onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-primary-400 hover:text-primary-500 flex-shrink-0 overflow-hidden">
              {logoFile ? <img src={URL.createObjectURL(logoFile)} alt="logo" className="w-full h-full object-cover" /> : <Upload size={18} />}
            </button>
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
            <p className="text-xs text-gray-400">JPG or PNG, dimensions 1080x1080px, file size up to 20MB.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="label">Vendor's Business Name *</label>
              <input className="input" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Business Name (Required)" />
            </div>
            <Select label="Vendor Industry" value={form.industry} onChange={(e) => set('industry', e.target.value)} options={INDUSTRY_OPTIONS} />
            <Select label="Select Country *" value={form.country} onChange={(e) => set('country', e.target.value)} options={countryOpts} />
            <div>
              <label className="label">City/Town</label>
              <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="City/Town Name" />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Tax Information" badge="(optional)">
          <div className="grid sm:grid-cols-2 gap-3.5">
            <div>
              <label className="label">Business GSTIN</label>
              <input className="input" value={form.gstin} onChange={(e) => set('gstin', e.target.value)} placeholder="Business GSTIN (Optional)" />
            </div>
            <div>
              <label className="label">Business PAN Number</label>
              <input className="input" value={form.pan} onChange={(e) => set('pan', e.target.value)} placeholder="Business PAN Number (Optional)" />
            </div>
            <div>
              <label className="label">Vendor Type</label>
              <div className="inline-flex rounded-lg border border-gray-200 p-1">
                {(['Individual', 'Company'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => set('vendorType', t)} className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${form.vendorType === t ? 'bg-primary-950 text-white' : 'text-gray-600'}`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Tax Treatment</label>
              <input className="input" value={form.taxTreatment} onChange={(e) => set('taxTreatment', e.target.value)} placeholder="Select Tax Treatment" />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Address" badge="(optional)">
          <div className="grid sm:grid-cols-2 gap-3.5">
            {form.country === 'IN' ? (
              <Select label="State / Province" value={form.state} onChange={(e) => set('state', e.target.value)} options={[{ value: '', label: 'Select State / Province' }, ...INDIA_STATES.map((s) => ({ value: s, label: s }))]} />
            ) : (
              <div>
                <label className="label">State / Province</label>
                <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="State / Province" />
              </div>
            )}
            <div>
              <label className="label">Postal Code / Zip Code</label>
              <input className="input" value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} placeholder="Postal Code / Zip Code" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Street Address</label>
              <input className="input" value={form.streetAddress} onChange={(e) => set('streetAddress', e.target.value)} placeholder="Street Address" />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Linked Contacts" badge={`${existingContactLinks.length + stagedContactIds.length}`}>
          <div className="flex gap-2 mb-3">
            <Select wrapperClassName="flex-1" value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} options={[{ value: '', label: 'Select Contact to Link…' }, ...unlinkedContacts.map((c) => ({ value: String(c.id), label: c.name || `Contact #${c.id}` }))]} />
            <Button size="sm" disabled={!selectedContactId} onClick={doLinkContact}>Link</Button>
          </div>
          {existingContactLinks.length === 0 && stagedContactIds.length === 0 ? (
            <p className="text-sm text-gray-400">No contacts linked yet.</p>
          ) : (
            <div className="space-y-2">
              {existingContactLinks.map((l) => (
                <div key={l.id} className="rounded-lg border border-gray-100 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{l.contact.name || 'Unnamed'}</p>
                    <p className="text-xs text-gray-500">{l.contact.designation} {l.contact.email ? `· ${l.contact.email}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => doUnlinkExisting(l.id)} className="text-gray-300 hover:text-danger-600"><Trash2 size={14} /></button>
                </div>
              ))}
              {stagedContactIds.map((cid) => {
                const c = availableContacts.find((x) => x.id === cid);
                return (
                  <div key={`staged-${cid}`} className="rounded-lg border border-dashed border-primary-200 bg-primary-50/30 p-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">{c?.name || `Contact #${cid}`} <span className="text-[10px] font-normal text-primary-500 uppercase">pending save</span></p>
                    <button type="button" onClick={() => doUnstageContact(cid)} className="text-gray-300 hover:text-danger-600"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Additional Details" badge="(optional)">
          <div className="grid sm:grid-cols-2 gap-3.5">
            <div>
              <label className="label">Display Name</label>
              <input className="input" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="Display Name" />
            </div>
            <div>
              <label className="label">Default Due Date (Days)</label>
              <input className="input" value={form.defaultDueDays} onChange={(e) => set('defaultDueDays', e.target.value)} placeholder="e.g., 30" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Email" />
            </div>
            <div>
              <label className="label">Phone No.</label>
              <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91" />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Attachments" badge="(optional)">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Any supporting files for this vendor.</p>
            <button type="button" onClick={() => attachRef.current?.click()} className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1"><Upload size={12} /> Add Attachments</button>
            <input ref={attachRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addAttachment(f); e.target.value = ''; }} />
          </div>
          {existingAttachments.length === 0 && stagedFiles.length === 0 ? (
            <p className="text-sm text-gray-400">No attachments yet.</p>
          ) : (
            <div className="space-y-1.5">
              {existingAttachments.map((a) => (
                <div key={a.id} className="rounded-lg border border-gray-100 p-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-gray-800 truncate"><FileText size={13} className="text-gray-400 flex-shrink-0" /> {a.fileName} <span className="text-xs text-gray-400">{formatSize(a.fileSize)}</span></span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" onClick={() => downloadVendorAttachment(initial!.id, a.id, a.fileName)} className="p-1 text-gray-400 hover:text-primary-600"><Download size={14} /></button>
                    <button type="button" onClick={() => removeExistingAttachment(a.id)} className="p-1 text-gray-400 hover:text-danger-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {stagedFiles.map((f, idx) => (
                <div key={`staged-file-${idx}`} className="rounded-lg border border-dashed border-primary-200 bg-primary-50/30 p-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-gray-800 truncate"><FileText size={13} className="text-gray-400 flex-shrink-0" /> {f.name} <span className="text-[10px] font-normal text-primary-500 uppercase">pending save</span></span>
                  <button type="button" onClick={() => removeStagedFile(idx)} className="p-1 text-gray-400 hover:text-danger-600 flex-shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Bank Accounting Details" badge="(optional)">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Record the vendor's bank accounts for payments against purchases.</p>
            <button type="button" onClick={() => setBankAccounts((b) => [...b, { ...emptyBankAccount }])} className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1"><Plus size={12} /> Add Bank Account</button>
          </div>
          {bankAccounts.length === 0 ? (
            <p className="text-sm text-gray-400">No bank accounts added yet.</p>
          ) : (
            <div className="space-y-3">
              {bankAccounts.map((b, idx) => (
                <div key={idx} className="rounded-lg border border-gray-100 p-3 grid sm:grid-cols-2 gap-2">
                  <input className="input !py-1.5 !text-sm" placeholder="Account Holder Name" value={b.accountHolderName} onChange={(e) => setBankAccounts((bs) => bs.map((x, i) => (i === idx ? { ...x, accountHolderName: e.target.value } : x)))} />
                  <input className="input !py-1.5 !text-sm" placeholder="Bank Name" value={b.bankName} onChange={(e) => setBankAccounts((bs) => bs.map((x, i) => (i === idx ? { ...x, bankName: e.target.value } : x)))} />
                  <input className="input !py-1.5 !text-sm" placeholder="Account Number" value={b.accountNumber} onChange={(e) => setBankAccounts((bs) => bs.map((x, i) => (i === idx ? { ...x, accountNumber: e.target.value } : x)))} />
                  <input className="input !py-1.5 !text-sm" placeholder="IFSC Code" value={b.ifsc} onChange={(e) => setBankAccounts((bs) => bs.map((x, i) => (i === idx ? { ...x, ifsc: e.target.value } : x)))} />
                  <input className="input !py-1.5 !text-sm sm:col-span-2" placeholder="Branch" value={b.branch} onChange={(e) => setBankAccounts((bs) => bs.map((x, i) => (i === idx ? { ...x, branch: e.target.value } : x)))} />
                  <div className="sm:col-span-2 flex justify-end"><button type="button" onClick={() => setBankAccounts((bs) => bs.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-danger-600"><Trash2 size={14} /></button></div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Account Details" badge="(optional)">
          <p className="text-[11px] text-gray-400 mb-3">Ledger management isn't available in this app yet — this choice is not saved.</p>
          <div className="flex flex-col gap-2">
            {([['none', "Don't create"], ['create', 'Create new ledger'], ['link', 'Link an existing ledger']] as const).map(([val, lbl]) => (
              <label key={val} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="ledger" checked={ledgerChoice === val} onChange={() => setLedgerChoice(val)} className="w-3.5 h-3.5 accent-primary-600" />
                {lbl}
              </label>
            ))}
          </div>
        </CollapsibleSection>
      </div>
    </Modal>
  );
};

export default VendorFormModal;

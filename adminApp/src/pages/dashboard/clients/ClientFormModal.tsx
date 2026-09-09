import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Upload, ChevronDown, Plus, Trash2, Download, FileText } from 'lucide-react';
import {
  createClient, updateClient, addShippingDetail, deleteShippingDetail,
  uploadClientAttachment, downloadClientAttachment, deleteClientAttachment,
} from '../../../services/clientsApi';
import type { ClientDetail, ClientRow, ClientShippingDetail, ClientAttachment } from '../../../services/clientsApi';
import { Button, Modal, Select } from '../../../components/ui';
import { COUNTRIES, INDIA_STATES } from '../../../data/geo';
import { useToast } from '../../../context/ToastContext';

const formatSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
};

type StagedShipping = { name: string; country: string; state: string; city: string; postalCode: string; streetAddress: string };
const emptyShipping: StagedShipping = { name: '', country: '', state: '', city: '', postalCode: '', streetAddress: '' };

// Collapsed by default — only Basic Information stays open, since it's the
// only section with a required field; everything else is optional detail
// the user opts into rather than scrolling past every time.
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

const INDUSTRY_OPTIONS = [
  '', 'Education', 'Healthcare', 'Manufacturing', 'IT & Software', 'Retail', 'Government', 'Construction',
  'Finance', 'Logistics', 'Hospitality', 'Other',
].map((v) => ({ value: v, label: v || '-Select an Industry-' }));

const countryOpts = [{ value: '', label: 'Select Country' }, ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))];

const emptyForm = {
  businessName: '', clientKind: 'Client' as 'Prospect' | 'Client', industry: '', country: '', city: '',
  gstin: '', pan: '', clientType: 'Company' as 'Individual' | 'Company', taxTreatment: '',
  state: '', postalCode: '', streetAddress: '', businessAlias: '', email: '', phone: '', defaultDueDays: '',
};

const ClientFormModal = ({ initial, onClose, onDone }: { initial?: ClientDetail; onClose: () => void; onDone: (c: ClientRow) => void }) => {
  const { show } = useToast();
  const [form, setForm] = useState(initial ? {
    businessName: initial.businessName, clientKind: initial.clientKind, industry: initial.industry || '',
    country: initial.country || '', city: initial.city || '', gstin: initial.gstin || '', pan: initial.pan || '',
    clientType: initial.clientType, taxTreatment: initial.taxTreatment || '', state: initial.state || '',
    postalCode: initial.postalCode || '', streetAddress: initial.streetAddress || '', businessAlias: initial.businessAlias || '',
    email: initial.email || '', phone: initial.phone || '', defaultDueDays: initial.defaultDueDays ? String(initial.defaultDueDays) : '',
  } : emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);

  // In "Add Client" mode there's no client id yet, so shipping details and
  // attachments are staged locally and pushed to the server right after the
  // client itself is created. In "Edit" mode the id already exists, so these
  // hit the API directly (same pattern as the View Client drawer).
  const [existingShipping, setExistingShipping] = useState<ClientShippingDetail[]>(initial?.shippingDetails || []);
  const [stagedShipping, setStagedShipping] = useState<StagedShipping[]>([]);
  const [showShipForm, setShowShipForm] = useState(false);
  const [shipForm, setShipForm] = useState<StagedShipping>(emptyShipping);

  const [existingAttachments, setExistingAttachments] = useState<ClientAttachment[]>(initial?.attachments || []);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const addShipping = () => {
    if (!shipForm.name.trim()) return;
    if (initial) {
      addShippingDetail(initial.id, shipForm).then((r) => setExistingShipping((s) => [...s, r.data])).catch(() => show('Failed to add shipping detail.', 'error'));
    } else {
      setStagedShipping((s) => [...s, shipForm]);
    }
    setShipForm(emptyShipping);
    setShowShipForm(false);
  };
  const removeExistingShipping = (id: number) => {
    if (!initial) return;
    deleteShippingDetail(initial.id, id).then(() => setExistingShipping((s) => s.filter((x) => x.id !== id))).catch(() => show('Failed to remove.', 'error'));
  };
  const removeStagedShipping = (idx: number) => setStagedShipping((s) => s.filter((_, i) => i !== idx));

  const addAttachment = (file: File) => {
    if (initial) {
      uploadClientAttachment(initial.id, file).then((r) => setExistingAttachments((a) => [...a, r.data])).catch(() => show('Upload failed.', 'error'));
    } else {
      setStagedFiles((f) => [...f, file]);
    }
  };
  const removeExistingAttachment = (id: number) => {
    if (!initial) return;
    deleteClientAttachment(initial.id, id).then(() => setExistingAttachments((a) => a.filter((x) => x.id !== id))).catch(() => show('Failed to delete.', 'error'));
  };
  const removeStagedFile = (idx: number) => setStagedFiles((f) => f.filter((_, i) => i !== idx));

  const save = async () => {
    if (!form.businessName.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v as string); });
      if (logoFile) fd.append('logo', logoFile);
      const r = initial ? await updateClient(initial.id, fd) : await createClient(fd);
      if (!initial) {
        const newId = r.data.id;
        await Promise.all([
          ...stagedShipping.map((s) => addShippingDetail(newId, s)),
          ...stagedFiles.map((f) => uploadClientAttachment(newId, f)),
        ]);
      }
      show(initial ? 'Client updated.' : 'Client added.', 'success');
      onDone(r.data);
    } catch (err: any) {
      show(err?.response?.data?.message || 'Failed to save client.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit Client' : 'Add Client'} size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!form.businessName.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-6">
        {/* Basic Information */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wide mb-3">Basic Information</h3>
          <div className="flex items-center gap-4 mb-4">
            <button type="button" onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-primary-400 hover:text-primary-500 flex-shrink-0 overflow-hidden">
              {logoFile ? <img src={URL.createObjectURL(logoFile)} alt="logo" className="w-full h-full object-cover" /> : <Upload size={18} />}
            </button>
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
            <p className="text-xs text-gray-400">JPG or PNG, dimensions 1080x1080px, file size up to 20MB.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="label">Business Name *</label>
              <input className="input" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Business Name (Required)" />
            </div>
            <Select label="Select Client / Prospect" value={form.clientKind} onChange={(e) => set('clientKind', e.target.value as any)} options={[{ value: 'Client', label: 'Client' }, { value: 'Prospect', label: 'Prospect' }]} />
            <Select label="Client Industry" value={form.industry} onChange={(e) => set('industry', e.target.value)} options={INDUSTRY_OPTIONS} />
          </div>
        </section>

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
              <label className="label">Client Type</label>
              <div className="inline-flex rounded-lg border border-gray-200 p-1">
                {(['Individual', 'Company'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => set('clientType', t)} className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${form.clientType === t ? 'bg-primary-950 text-white' : 'text-gray-600'}`}>{t}</button>
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
            <Select label="Select Country" value={form.country} onChange={(e) => set('country', e.target.value)} options={countryOpts} />
            {form.country === 'IN' ? (
              <Select label="State / Province" value={form.state} onChange={(e) => set('state', e.target.value)} options={[{ value: '', label: 'Select State / Province' }, ...INDIA_STATES.map((s) => ({ value: s, label: s }))]} />
            ) : (
              <div>
                <label className="label">State / Province</label>
                <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="State / Province" />
              </div>
            )}
            <div>
              <label className="label">City/Town</label>
              <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="City/Town Name" />
            </div>
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

        <CollapsibleSection title="Additional Details" badge="(optional)">
          <div className="grid sm:grid-cols-2 gap-3.5">
            <div>
              <label className="label">Business Alias</label>
              <input className="input" value={form.businessAlias} onChange={(e) => set('businessAlias', e.target.value)} placeholder="Business Alias" />
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

        <CollapsibleSection title="Shipping Details" badge="(optional)">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Addresses used when shipping to this client.</p>
            <button type="button" onClick={() => setShowShipForm((o) => !o)} className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1"><Plus size={12} /> Add Shipping Details</button>
          </div>
          {showShipForm && (
            <div className="rounded-lg border border-gray-100 p-3 mb-3 grid grid-cols-2 gap-2">
              <input className="input !py-1.5 !text-sm" placeholder="Name" value={shipForm.name} onChange={(e) => setShipForm({ ...shipForm, name: e.target.value })} />
              <input className="input !py-1.5 !text-sm" placeholder="Country" value={shipForm.country} onChange={(e) => setShipForm({ ...shipForm, country: e.target.value })} />
              <input className="input !py-1.5 !text-sm" placeholder="City" value={shipForm.city} onChange={(e) => setShipForm({ ...shipForm, city: e.target.value })} />
              <input className="input !py-1.5 !text-sm" placeholder="Postal Code" value={shipForm.postalCode} onChange={(e) => setShipForm({ ...shipForm, postalCode: e.target.value })} />
              <input className="input !py-1.5 !text-sm col-span-2" placeholder="Street Address" value={shipForm.streetAddress} onChange={(e) => setShipForm({ ...shipForm, streetAddress: e.target.value })} />
              <div className="col-span-2 flex justify-end"><Button size="sm" onClick={addShipping}>Save</Button></div>
            </div>
          )}
          {existingShipping.length === 0 && stagedShipping.length === 0 ? (
            <p className="text-sm text-gray-400">No shipping details yet.</p>
          ) : (
            <div className="space-y-2">
              {existingShipping.map((s) => (
                <div key={s.id} className="rounded-lg border border-gray-100 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-500">{[s.streetAddress, s.city, s.country].filter(Boolean).join(', ')}</p>
                  </div>
                  <button type="button" onClick={() => removeExistingShipping(s.id)} className="text-gray-300 hover:text-danger-600"><Trash2 size={14} /></button>
                </div>
              ))}
              {stagedShipping.map((s, idx) => (
                <div key={`staged-${idx}`} className="rounded-lg border border-dashed border-primary-200 bg-primary-50/30 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{s.name} <span className="text-[10px] font-normal text-primary-500 uppercase">pending save</span></p>
                    <p className="text-xs text-gray-500">{[s.streetAddress, s.city, s.country].filter(Boolean).join(', ')}</p>
                  </div>
                  <button type="button" onClick={() => removeStagedShipping(idx)} className="text-gray-300 hover:text-danger-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Attachments" badge="(optional)">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Any supporting files for this client.</p>
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
                    <button type="button" onClick={() => downloadClientAttachment(initial!.id, a.id, a.fileName)} className="p-1 text-gray-400 hover:text-primary-600"><Download size={14} /></button>
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
      </div>
    </Modal>
  );
};

export default ClientFormModal;

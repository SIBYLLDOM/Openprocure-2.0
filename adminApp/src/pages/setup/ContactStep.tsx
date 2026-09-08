import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, User as UserIcon } from 'lucide-react';
import { Button, Input, PhoneInput, Select, Modal, EmptyState, Badge } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import * as setupApi from '../../services/setupProfileApi';
import type { PartnerProfileData, PartnerContact } from '../../types/setupProfile';

const CONTACT_TYPES = [
  { value: 'primary', label: 'Primary Contact' },
  { value: 'sales', label: 'Sales Contact' },
  { value: 'technical', label: 'Technical Contact' },
  { value: 'finance', label: 'Finance Contact' },
  { value: 'support', label: 'Support Contact' },
  { value: 'management', label: 'Management / Authorized Person' },
];
const DEPARTMENTS = [
  { value: '', label: 'Select department…' },
  { value: 'Sales', label: 'Sales' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Technical', label: 'Technical' },
  { value: 'Operations', label: 'Operations' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Procurement', label: 'Procurement' },
  { value: 'Human Resources', label: 'Human Resources' },
  { value: 'IT & Admin', label: 'IT & Admin' },
  { value: 'Management', label: 'Management' },
  { value: 'Other', label: 'Other' },
];
// Designation choices are scoped to the chosen department — picking Sales
// first, say, narrows the second dropdown to Sales-shaped job titles
// instead of one long undifferentiated list.
const DESIGNATIONS_BY_DEPARTMENT: Record<string, string[]> = {
  'Sales': ['Sales Executive', 'Sales Manager', 'Regional Sales Manager', 'Business Development Manager', 'Key Account Manager'],
  'Finance': ['Finance Executive', 'Accountant', 'Finance Manager', 'Financial Controller', 'CFO'],
  'Technical': ['Technical Engineer', 'Service Engineer', 'Technical Manager', 'R&D Engineer', 'Product Specialist'],
  'Operations': ['Operations Executive', 'Operations Manager', 'Supply Chain Manager', 'Logistics Manager'],
  'Marketing': ['Marketing Executive', 'Marketing Manager', 'Brand Manager', 'Digital Marketing Specialist'],
  'Procurement': ['Procurement Executive', 'Procurement Manager', 'Purchase Officer'],
  'Human Resources': ['HR Executive', 'HR Manager', 'Talent Acquisition Specialist'],
  'IT & Admin': ['IT Executive', 'System Administrator', 'IT Manager', 'Admin Executive'],
  'Management': ['Managing Director', 'CEO', 'Director', 'General Manager', 'Authorized Signatory'],
  'Other': ['Other'],
};
const COMM_PREFS = ['Email', 'Phone', 'WhatsApp', 'SMS'];

const emptyForm = { name: '', designation: '', department: '', email: '', mobile: '', altMobile: '', whatsapp: '', landline: '', contactType: 'sales', communicationPreferences: [] as string[] };

const designationOptions = (department: string) => {
  const list = DESIGNATIONS_BY_DEPARTMENT[department];
  if (!list) return [{ value: '', label: 'Select department first' }];
  return [{ value: '', label: 'Select designation…' }, ...list.map((d) => ({ value: d, label: d }))];
};

const ContactStep = ({ profile, onRefetch }: { profile: PartnerProfileData; onRefetch: () => void }) => {
  const { show } = useToast();
  const primary = profile.contacts.find((c) => c.isPrimary);
  const others = profile.contacts.filter((c) => !c.isPrimary);

  const [primaryForm, setPrimaryForm] = useState(emptyForm);
  useEffect(() => {
    if (primary) {
      setPrimaryForm({
        name: primary.name || '', designation: primary.designation || '', department: primary.department || '',
        email: primary.email || '', mobile: primary.mobile || '', altMobile: primary.altMobile || '',
        whatsapp: primary.whatsapp || '', landline: primary.landline || '', contactType: 'primary',
        communicationPreferences: primary.communicationPreferences ? primary.communicationPreferences.split(',') : [],
      });
    }
  }, [primary?.id]);

  // No explicit Save button for the primary contact — it persists on blur
  // instead, same pattern as Company Information.
  const persistPrimary = (next: typeof primaryForm) => {
    const payload = { ...next, isPrimary: true, communicationPreferences: next.communicationPreferences.join(',') };
    const call = primary ? setupApi.contactsApi.update(primary.id, payload) : setupApi.contactsApi.create(payload);
    call.then(onRefetch).catch(() => show('Failed to save.', 'error'));
  };
  const setPrimary = (patch: Partial<typeof primaryForm>) => setPrimaryForm((f) => ({ ...f, ...patch }));

  const togglePref = (p: string) => {
    const next = { ...primaryForm, communicationPreferences: primaryForm.communicationPreferences.includes(p) ? primaryForm.communicationPreferences.filter((x) => x !== p) : [...primaryForm.communicationPreferences, p] };
    setPrimaryForm(next);
    persistPrimary(next);
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerContact | null>(null);
  const [form, setForm] = useState({ ...emptyForm, contactType: 'sales' });
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, contactType: 'sales' }); setModalOpen(true); };
  const openEdit = (c: PartnerContact) => {
    setEditing(c);
    setForm({
      name: c.name || '', designation: c.designation || '', department: c.department || '', email: c.email || '',
      mobile: c.mobile || '', altMobile: c.altMobile || '', whatsapp: c.whatsapp || '', landline: c.landline || '',
      contactType: c.contactType || 'sales', communicationPreferences: c.communicationPreferences ? c.communicationPreferences.split(',') : [],
    });
    setModalOpen(true);
  };

  const saveContact = async () => {
    setSaving(true);
    try {
      const payload = { ...form, isPrimary: false, communicationPreferences: form.communicationPreferences.join(',') };
      if (editing) await setupApi.contactsApi.update(editing.id, payload);
      else await setupApi.contactsApi.create(payload);
      show('Contact saved.', 'success');
      setModalOpen(false);
      onRefetch();
    } catch (err: any) {
      show(err?.response?.data?.message ?? 'Failed to save contact.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeContact = async (id: number) => {
    try {
      await setupApi.contactsApi.remove(id);
      show('Contact removed.', 'success');
      onRefetch();
    } catch {
      show('Failed to remove contact.', 'error');
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-x-10 gap-y-8">
      {/* Left column — the primary contact, the thing every partner must fill */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Primary Contact</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Contact Person Name" placeholder="Full name" value={primaryForm.name} onChange={(e) => setPrimary({ name: e.target.value })} onBlur={() => persistPrimary(primaryForm)} icon={UserIcon} />
          <Select
            label="Department" value={primaryForm.department} options={DEPARTMENTS}
            onChange={(e) => { const next = { ...primaryForm, department: e.target.value, designation: '' }; setPrimaryForm(next); persistPrimary(next); }}
          />
          <Select
            label="Designation" value={primaryForm.designation} options={designationOptions(primaryForm.department)} disabled={!primaryForm.department}
            onChange={(e) => { const next = { ...primaryForm, designation: e.target.value }; setPrimaryForm(next); persistPrimary(next); }}
          />
          <Input label="Email Address" type="email" placeholder="name@company.com" value={primaryForm.email} onChange={(e) => setPrimary({ email: e.target.value })} onBlur={() => persistPrimary(primaryForm)} />
          <PhoneInput label="Mobile Number" value={primaryForm.mobile} onChange={(v) => setPrimary({ mobile: v })} onBlur={() => persistPrimary(primaryForm)} />
          <PhoneInput label="Alternate Mobile" value={primaryForm.altMobile} onChange={(v) => setPrimary({ altMobile: v })} onBlur={() => persistPrimary(primaryForm)} />
          <PhoneInput label="WhatsApp Number" value={primaryForm.whatsapp} onChange={(v) => setPrimary({ whatsapp: v })} onBlur={() => persistPrimary(primaryForm)} />
          <Input label="Landline Number" placeholder="e.g. 022-XXXXXXX" value={primaryForm.landline} onChange={(e) => setPrimary({ landline: e.target.value })} onBlur={() => persistPrimary(primaryForm)} />
        </div>
        <div className="mt-5 rounded-xl border border-gray-100 p-4">
          <label className="label mb-2.5">Communication Preferences</label>
          <div className="flex flex-wrap gap-5">
            {COMM_PREFS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" className="accent-primary-600" checked={primaryForm.communicationPreferences.includes(p)} onChange={() => togglePref(p)} /> {p}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Right column — secondary, optional additional contacts */}
      <div className="lg:border-l lg:border-gray-100 lg:pl-10 flex flex-col h-full">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Additional Contact Persons</h3>
            <p className="text-sm text-gray-500 mt-0.5">Sales, technical, finance, support, or management contacts.</p>
          </div>
          <Button size="sm" icon={Plus} onClick={openAdd} className="flex-shrink-0">Add Contact</Button>
        </div>
        <div className="rounded-xl border border-gray-100 p-4 flex-1 flex flex-col">
          {others.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState icon={UserIcon} title="No additional contacts yet" description="Add sales, technical, or finance contacts if relevant." />
            </div>
          ) : (
            <div className="space-y-2.5">
              {others.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3.5">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{c.name || 'Unnamed'} {c.contactType && <Badge status={CONTACT_TYPES.find((t) => t.value === c.contactType)?.label || c.contactType} variant="gray" className="ml-1" />}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{[c.designation, c.department, c.email, c.mobile].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-primary-600"><Pencil size={14} /></button>
                    <button onClick={() => removeContact(c.id)} className="p-1.5 text-gray-400 hover:text-danger-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title={editing ? 'Edit Contact' : 'Add Contact'} size="md"
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button loading={saving} onClick={saveContact}>Save</Button></>}>
        <div className="space-y-4">
          <Select label="Contact Type" value={form.contactType} onChange={(e) => setForm({ ...form, contactType: e.target.value })} options={CONTACT_TYPES} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Department" value={form.department} options={DEPARTMENTS} onChange={(e) => setForm({ ...form, department: e.target.value, designation: '' })} />
            <Select label="Designation" value={form.designation} options={designationOptions(form.department)} disabled={!form.department} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            <Input label="Email" type="email" placeholder="name@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <PhoneInput label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ContactStep;

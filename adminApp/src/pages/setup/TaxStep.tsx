import { useState } from 'react';
import { Plus, Pencil, Trash2, FileText, ExternalLink, ChevronDown, Check, UploadCloud } from 'lucide-react';
import { Button, Input, Select, Modal, Badge, FileUploadField } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { API_ORIGIN } from '../../utils/apiBase';
import * as setupApi from '../../services/setupProfileApi';
import type { PartnerProfileData, PartnerTaxRegistration } from '../../types/setupProfile';

// The five registrations almost every partner needs — shown as a fixed
// mandatory checklist so they're never buried among the "everything else"
// document types (see MORE_REG_TYPES below), which still cover the long
// tail via a type dropdown + a typed-in "Other" name.
const MANDATORY_REG_TYPES = ['PAN', 'GSTIN', 'CIN', 'MSME Registration', 'IEC'];
const MORE_REG_TYPES = ['TAN', 'Udyam Registration Number', 'Professional Tax Registration', 'Trade License', 'Other'];

const APPLICABILITY = [
  { value: 'optional', label: 'Optional' },
  { value: 'required', label: 'Required' },
  { value: 'not_applicable', label: 'Not Applicable' },
];
const applicabilityVariant = (a?: string | null) => (a === 'required' ? 'warning' : a === 'not_applicable' ? 'gray' : 'teal');

const emptyForm = { registrationType: MANDATORY_REG_TYPES[0], customType: '', registrationNumber: '', issueDate: '', expiryDate: '', issuingAuthority: '', applicability: 'optional' };

const TaxStep = ({ profile, onRefetch }: { profile: PartnerProfileData; onRefetch: () => void }) => {
  const { show } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerTaxRegistration | null>(null);
  const [lockType, setLockType] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const byType = (type: string) => profile.taxRegistrations.find((r) => r.registrationType === type);
  const otherRegs = profile.taxRegistrations.filter((r) => !MANDATORY_REG_TYPES.includes(r.registrationType || ''));

  const openMandatory = (type: string) => {
    const existing = byType(type);
    setLockType(type);
    if (existing) {
      setEditing(existing);
      setForm({
        registrationType: existing.registrationType || type, customType: '', registrationNumber: existing.registrationNumber || '',
        issueDate: existing.issueDate || '', expiryDate: existing.expiryDate || '', issuingAuthority: existing.issuingAuthority || '',
        applicability: existing.applicability || 'optional',
      });
      setMoreOpen(true);
    } else {
      setEditing(null);
      setForm({ ...emptyForm, registrationType: type });
      setMoreOpen(false);
    }
    setFile(null);
    setModalOpen(true);
  };

  const openAddOther = () => { setEditing(null); setLockType(null); setForm({ ...emptyForm, registrationType: MORE_REG_TYPES[0] }); setFile(null); setMoreOpen(false); setModalOpen(true); };
  const openEditOther = (r: PartnerTaxRegistration) => {
    setEditing(r);
    setLockType(null);
    setForm({
      registrationType: r.registrationType || MORE_REG_TYPES[0], customType: '', registrationNumber: r.registrationNumber || '',
      issueDate: r.issueDate || '', expiryDate: r.expiryDate || '', issuingAuthority: r.issuingAuthority || '',
      applicability: r.applicability || 'optional',
    });
    setFile(null);
    setMoreOpen(true);
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const registrationType = form.registrationType === 'Other' && form.customType.trim() ? form.customType.trim() : form.registrationType;
      const payload = { registrationType, registrationNumber: form.registrationNumber, issueDate: form.issueDate, expiryDate: form.expiryDate, issuingAuthority: form.issuingAuthority, applicability: form.applicability };
      if (editing) await setupApi.taxRegistrationsApi.update(editing.id, payload, file);
      else await setupApi.taxRegistrationsApi.create(payload, file);
      show('Registration saved.', 'success');
      setModalOpen(false);
      onRefetch();
    } catch (err: any) {
      show(err?.response?.data?.message ?? 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: number) => {
    try { await setupApi.taxRegistrationsApi.remove(id); show('Removed.', 'success'); onRefetch(); } catch { show('Failed to remove.', 'error'); }
  };

  return (
    <div>
      <div>
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Mandatory Registrations</h3>
        <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
          {MANDATORY_REG_TYPES.map((type) => {
            const reg = byType(type);
            const uploaded = !!reg?.documentUrl;
            return (
              <div key={type} className="flex items-center justify-between gap-3 p-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${uploaded ? 'bg-success-50 text-success-600' : 'bg-gray-50 text-gray-400'}`}>
                    {uploaded ? <Check size={16} /> : <FileText size={16} />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{type}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {reg ? [reg.registrationNumber, reg.issuingAuthority].filter(Boolean).join(' · ') || (uploaded ? 'Document uploaded' : 'Details saved, no document yet') : 'Not added yet'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {reg?.documentUrl && (
                    <a href={`${API_ORIGIN}${reg.documentUrl}`} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline hidden sm:inline-flex items-center gap-1">View <ExternalLink size={11} /></a>
                  )}
                  <Button size="sm" variant={uploaded ? 'secondary' : 'primary'} icon={uploaded ? Pencil : UploadCloud} onClick={() => openMandatory(type)}>
                    {uploaded ? 'Edit' : 'Upload'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Other Documents</h3>
          <Button size="sm" variant="secondary" icon={Plus} onClick={openAddOther}>Add Document</Button>
        </div>
        {otherRegs.length === 0 ? (
          <p className="text-sm text-gray-400">TAN, Udyam, trade licenses, or anything else that applies — add as needed.</p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {otherRegs.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-100 p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="w-10 h-10 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                    <FileText size={18} />
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditOther(r)} className="p-1.5 text-gray-400 hover:text-primary-600"><Pencil size={13} /></button>
                    <button onClick={() => remove(r.id)} className="p-1.5 text-gray-400 hover:text-danger-600"><Trash2 size={13} /></button>
                  </div>
                </div>
                <p className="font-semibold text-sm text-gray-900">{r.registrationType}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{[r.registrationNumber, r.issuingAuthority].filter(Boolean).join(' · ') || 'No details added'}</p>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  <Badge status={APPLICABILITY.find((a) => a.value === r.applicability)?.label || 'Optional'} variant={applicabilityVariant(r.applicability)} />
                  {r.documentUrl ? (
                    <a href={`${API_ORIGIN}${r.documentUrl}`} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1">Document <ExternalLink size={11} /></a>
                  ) : (
                    <span className="text-xs text-gray-300">No document</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title={lockType ? `Upload — ${lockType}` : editing ? 'Edit Document' : 'Add Document'} size="md"
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
        <div className="space-y-4">
          {/* Primary flow: pick the type (or it's fixed, for a mandatory row), upload the file */}
          {lockType ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary-50 text-primary-700 text-sm font-semibold">
              <FileText size={15} /> {lockType}
            </div>
          ) : (
            <>
              <Select label="Document Type" value={form.registrationType} onChange={(e) => setForm({ ...form, registrationType: e.target.value })} options={MORE_REG_TYPES.map((t) => ({ value: t, label: t }))} />
              {form.registrationType === 'Other' && (
                <Input label="Specify Document Type" placeholder="Type the document name…" value={form.customType} onChange={(e) => setForm({ ...form, customType: e.target.value })} />
              )}
            </>
          )}
          <FileUploadField label="Upload Document" file={file} onChange={setFile} hint="PDF, PNG or JPG" />

          <button type="button" onClick={() => setMoreOpen((o) => !o)} className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:underline">
            <ChevronDown size={13} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} /> {moreOpen ? 'Hide' : 'Add'} more details (optional)
          </button>

          {moreOpen && (
            <div className="space-y-4 pt-1">
              <Select label="Applicability" value={form.applicability} onChange={(e) => setForm({ ...form, applicability: e.target.value })} options={APPLICABILITY} />
              <Input label="Registration Number" placeholder="Enter registration number" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
              <Input label="Issuing Authority" placeholder="e.g. Ministry of Corporate Affairs" value={form.issuingAuthority} onChange={(e) => setForm({ ...form, issuingAuthority: e.target.value })} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Issue Date" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
                <Input label="Expiry Date" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default TaxStep;

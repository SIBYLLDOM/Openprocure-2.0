import { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, ExternalLink, AlertTriangle, ChevronDown, Check, UploadCloud } from 'lucide-react';
import { Button, Input, Select, Modal, FileUploadField } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { API_ORIGIN } from '../../utils/apiBase';
import * as setupApi from '../../services/setupProfileApi';
import type { PartnerProfileData, PartnerCertificate } from '../../types/setupProfile';

// The five certificates almost every partner is asked for — shown as a
// fixed mandatory checklist so they're never buried among the "everything
// else" document types (see MORE_CERT_TYPES below), which still cover the
// long tail via a type dropdown + a typed-in "Other" name.
const MANDATORY_CERT_TYPES = ['Certificate of Incorporation', 'GST Certificate', 'PAN Card', 'MSME Certificate', 'ISO 9001'];
const MORE_CERT_TYPES = [
  'Company Registration Certificate', 'Partnership Deed', 'LLP Certificate', 'Trade License', 'Udyam Registration Certificate',
  'TAN Certificate', 'IEC Certificate', 'ISO 13485', 'CE Certificate', 'BIS Certificate', 'RoHS', 'FDA Certification', 'Other',
];

const formatSize = (bytes?: number | null) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
};
const isExpired = (date?: string | null) => !!date && new Date(date) < new Date();

const emptyForm = { certificateType: MANDATORY_CERT_TYPES[0], customType: '', certificateName: '', certificateNumber: '', issuingAuthority: '', issueDate: '', expiryDate: '', remarks: '' };

const CertificatesStep = ({ profile, onRefetch }: { profile: PartnerProfileData; onRefetch: () => void }) => {
  const { show } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerCertificate | null>(null);
  const [lockType, setLockType] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const byType = (type: string) => profile.certificates.find((c) => c.certificateType === type);
  const otherCerts = profile.certificates.filter((c) => !MANDATORY_CERT_TYPES.includes(c.certificateType || ''));

  const openMandatory = (type: string) => {
    const existing = byType(type);
    setLockType(type);
    if (existing) {
      setEditing(existing);
      setForm({
        certificateType: existing.certificateType || type, customType: '', certificateName: existing.certificateName || '',
        certificateNumber: existing.certificateNumber || '', issuingAuthority: existing.issuingAuthority || '',
        issueDate: existing.issueDate || '', expiryDate: existing.expiryDate || '', remarks: existing.remarks || '',
      });
      setMoreOpen(true);
    } else {
      setEditing(null);
      setForm({ ...emptyForm, certificateType: type });
      setMoreOpen(false);
    }
    setFile(null);
    setModalOpen(true);
  };

  const openAddOther = () => { setEditing(null); setLockType(null); setForm({ ...emptyForm, certificateType: MORE_CERT_TYPES[0] }); setFile(null); setMoreOpen(false); setModalOpen(true); };
  const openEditOther = (c: PartnerCertificate) => {
    setEditing(c);
    setLockType(null);
    setForm({
      certificateType: c.certificateType || MORE_CERT_TYPES[0], customType: '', certificateName: c.certificateName || '',
      certificateNumber: c.certificateNumber || '', issuingAuthority: c.issuingAuthority || '',
      issueDate: c.issueDate || '', expiryDate: c.expiryDate || '', remarks: c.remarks || '',
    });
    setFile(null);
    setMoreOpen(true);
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const certificateType = form.certificateType === 'Other' && form.customType.trim() ? form.customType.trim() : form.certificateType;
      const payload = { certificateType, certificateName: form.certificateName, certificateNumber: form.certificateNumber, issuingAuthority: form.issuingAuthority, issueDate: form.issueDate, expiryDate: form.expiryDate, remarks: form.remarks };
      if (editing) await setupApi.certificatesApi.update(editing.id, payload, file);
      else await setupApi.certificatesApi.create(payload, file);
      show('Certificate saved.', 'success');
      setModalOpen(false);
      onRefetch();
    } catch (err: any) {
      show(err?.response?.data?.message ?? 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: number) => {
    try { await setupApi.certificatesApi.remove(id); show('Removed.', 'success'); onRefetch(); } catch { show('Failed to remove.', 'error'); }
  };

  return (
    <div>
      <div>
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Mandatory Certificates</h3>
        <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
          {MANDATORY_CERT_TYPES.map((type) => {
            const cert = byType(type);
            const uploaded = !!cert?.documentUrl;
            const expired = isExpired(cert?.expiryDate);
            return (
              <div key={type} className="flex items-center justify-between gap-3 p-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${uploaded ? 'bg-success-50 text-success-600' : 'bg-violet-50 text-violet-500'}`}>
                    {uploaded ? <Check size={16} /> : <ShieldCheck size={16} />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{type}</p>
                    {expired ? (
                      <p className="text-xs text-danger-600 flex items-center gap-1"><AlertTriangle size={11} /> Expired {cert?.expiryDate}</p>
                    ) : (
                      <p className="text-xs text-gray-500 truncate">
                        {cert ? [cert.certificateNumber, cert.issuingAuthority].filter(Boolean).join(' · ') || (uploaded ? 'Document uploaded' : 'Details saved, no document yet') : 'Not added yet'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {cert?.documentUrl && (
                    <a href={`${API_ORIGIN}${cert.documentUrl}`} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline hidden sm:inline-flex items-center gap-1">View <ExternalLink size={11} /></a>
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
        {otherCerts.length === 0 ? (
          <p className="text-sm text-gray-400">ISO 13485, CE, BIS, trade licenses, or anything else that applies — add as needed.</p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {otherCerts.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-100 p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck size={18} />
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditOther(c)} className="p-1.5 text-gray-400 hover:text-primary-600"><Pencil size={13} /></button>
                    <button onClick={() => remove(c.id)} className="p-1.5 text-gray-400 hover:text-danger-600"><Trash2 size={13} /></button>
                  </div>
                </div>
                <p className="font-semibold text-sm text-gray-900 truncate">{c.certificateType}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{[c.certificateName, c.certificateNumber, formatSize(c.fileSize)].filter(Boolean).join(' · ') || 'No details added'}</p>
                {isExpired(c.expiryDate) && <p className="text-xs text-danger-600 flex items-center gap-1 mt-1.5"><AlertTriangle size={12} /> Expired {c.expiryDate}</p>}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {c.documentUrl ? (
                    <a href={`${API_ORIGIN}${c.documentUrl}`} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1">Document <ExternalLink size={11} /></a>
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
          {/* Primary flow: pick the type (or it's fixed, for a mandatory row), name it, upload the file */}
          {lockType ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-violet-50 text-violet-700 text-sm font-semibold">
              <ShieldCheck size={15} /> {lockType}
            </div>
          ) : (
            <>
              <Select label="Document Type" value={form.certificateType} onChange={(e) => setForm({ ...form, certificateType: e.target.value })} options={MORE_CERT_TYPES.map((t) => ({ value: t, label: t }))} />
              {form.certificateType === 'Other' && (
                <Input label="Specify Document Type" placeholder="Type the document name…" value={form.customType} onChange={(e) => setForm({ ...form, customType: e.target.value })} />
              )}
            </>
          )}
          <Input label="Certificate Name" placeholder="e.g. ISO 9001:2015" value={form.certificateName} onChange={(e) => setForm({ ...form, certificateName: e.target.value })} />
          <FileUploadField label="Upload Document" file={file} onChange={setFile} hint="PDF, PNG or JPG" />

          <button type="button" onClick={() => setMoreOpen((o) => !o)} className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:underline">
            <ChevronDown size={13} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} /> {moreOpen ? 'Hide' : 'Add'} more details (optional)
          </button>

          {moreOpen && (
            <div className="space-y-4 pt-1">
              <Input label="Certificate Number" placeholder="Enter certificate number" value={form.certificateNumber} onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })} />
              <Input label="Issuing Authority" placeholder="e.g. Bureau Veritas" value={form.issuingAuthority} onChange={(e) => setForm({ ...form, issuingAuthority: e.target.value })} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Issue Date" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
                <Input label="Expiry Date" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
              <Input label="Remarks" placeholder="Any additional notes (optional)" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default CertificatesStep;

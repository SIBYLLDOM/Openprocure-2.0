import { useRef, useState } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';
import { uploadQuotationFile } from '../../../services/quotationsApi';
import type { QuotationRow, QuotationDocType } from '../../../services/quotationsApi';
import type { ClientRow } from '../../../services/clientsApi';
import { Button, Modal, Select } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';

interface Props { docType: QuotationDocType; label: string; clients: ClientRow[]; onClose: () => void; onDone: (q: QuotationRow) => void }

const UploadQuotationModal = ({ docType, label, clients, onClose, onDone }: Props) => {
  const { show } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [clientId, setClientId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('docType', docType);
      if (clientId) fd.append('clientId', clientId);
      if (poNumber) fd.append('poNumber', poNumber);
      fd.append('quotationDate', quotationDate);
      const r = await uploadQuotationFile(fd);
      show(`${label} uploaded.`, 'success');
      onDone(r.data);
    } catch (err: any) {
      show(err?.response?.data?.message || 'Upload failed.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Upload ${label}`} size="md" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!file} onClick={save}>Upload</Button></>}>
      <div className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary-400 bg-primary-50/40' : 'border-gray-200 hover:border-primary-300'}`}
        >
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-gray-800">
              <FileText size={18} className="text-primary-600" /> {file.name}
              <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-gray-400 hover:text-danger-600"><X size={14} /></button>
            </div>
          ) : (
            <>
              <UploadCloud size={26} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-semibold text-gray-600">Click to select or drop a file here</p>
              <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, JPG or PNG — up to 50MB</p>
            </>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3.5">
          <Select label="Client (optional)" value={clientId} onChange={(e) => setClientId(e.target.value)} options={[{ value: '', label: 'No client selected' }, ...clients.map((c) => ({ value: String(c.id), label: c.businessName }))]} />
          <div>
            <label className="label">{label} Date</label>
            <input type="date" className="input" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">PO Number (optional)</label>
            <input className="input" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO Number" />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default UploadQuotationModal;

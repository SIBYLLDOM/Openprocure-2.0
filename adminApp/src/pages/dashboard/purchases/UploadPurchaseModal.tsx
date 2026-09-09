import { useRef, useState } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';
import { uploadPurchaseFile } from '../../../services/purchasesApi';
import type { PurchaseRow } from '../../../services/purchasesApi';
import type { VendorRow } from '../../../services/vendorsApi';
import { Button, Modal, Select } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';

const UploadPurchaseModal = ({ vendors, onClose, onDone }: { vendors: VendorRow[]; onClose: () => void; onDone: (p: PurchaseRow) => void }) => {
  const { show } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [vendorId, setVendorId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (vendorId) fd.append('vendorId', vendorId);
      if (invoiceNo) fd.append('invoiceNo', invoiceNo);
      if (poNumber) fd.append('poNumber', poNumber);
      fd.append('purchaseDate', purchaseDate);
      const r = await uploadPurchaseFile(fd);
      show('Purchase uploaded.', 'success');
      onDone(r.data);
    } catch (err: any) {
      show(err?.response?.data?.message || 'Upload failed.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Upload Purchase" size="md" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!file} onClick={save}>Upload</Button></>}>
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
          <Select label="Vendor (optional)" value={vendorId} onChange={(e) => setVendorId(e.target.value)} options={[{ value: '', label: 'No vendor selected' }, ...vendors.map((v) => ({ value: String(v.id), label: v.businessName }))]} />
          <div>
            <label className="label">Purchase Date</label>
            <input type="date" className="input" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Invoice No (optional)</label>
            <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Vendor's invoice number" />
          </div>
          <div>
            <label className="label">PO Number (optional)</label>
            <input className="input" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO Number" />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default UploadPurchaseModal;

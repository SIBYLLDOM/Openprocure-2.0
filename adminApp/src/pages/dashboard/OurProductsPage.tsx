import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Upload, Pencil, Trash2, Package, FileText } from 'lucide-react';
import {
  getProducts, getProductOems, getApprovedAuthorizations, createProduct, updateProduct, deleteProduct,
  uploadCatalog, downloadCatalog,
} from '../../services/resellerProductApi';
import type { ResellerProductRow, ApprovedAuthorization } from '../../services/resellerProductApi';
import { Select, Button, Modal, StatCard } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';

const STATUS_OPTIONS = [{ value: '', label: 'All Products' }, { value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' }];

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A');
const isExpired = (validTo: string | null) => !!validTo && new Date(validTo) < new Date();

const emptyForm = { dealerAuthRequestId: '', authSerialNo: '', productName: '', decode: '', technicalSpecification: '', oemBy: '', validFrom: '', validTo: '' };

const ProductFormModal = ({ initial, approved, onClose, onDone }: { initial?: ResellerProductRow; approved: ApprovedAuthorization[]; onClose: () => void; onDone: () => void }) => {
  const { show } = useToast();
  const [form, setForm] = useState(initial ? {
    dealerAuthRequestId: initial.dealerAuthRequestId ? String(initial.dealerAuthRequestId) : '',
    authSerialNo: initial.authSerialNo || '', productName: initial.productName, decode: initial.decode || '',
    technicalSpecification: initial.technicalSpecification || '', oemBy: initial.oemBy || '',
    validFrom: initial.validFrom || '', validTo: initial.validTo || '',
  } : emptyForm);
  const [saving, setSaving] = useState(false);

  const linkOptions = useMemo(() => [{ value: '', label: "Don't link — enter manually" }, ...approved.map((a) => ({ value: String(a.id), label: `${a.refNo} — ${a.productName || 'Unnamed product'}` }))], [approved]);

  const applyLink = (id: string) => {
    setForm((f) => ({ ...f, dealerAuthRequestId: id }));
    const auth = approved.find((a) => String(a.id) === id);
    if (auth) {
      setForm((f) => ({ ...f, dealerAuthRequestId: id, authSerialNo: auth.refNo, productName: auth.productName || f.productName, oemBy: auth.oemBy || f.oemBy, validFrom: auth.validFrom, validTo: auth.validTo }));
    }
  };

  const save = async () => {
    if (!form.productName.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, dealerAuthRequestId: form.dealerAuthRequestId ? Number(form.dealerAuthRequestId) : undefined };
      if (initial) await updateProduct(initial.id, payload);
      else await createProduct(payload as any);
      show(initial ? 'Product updated.' : 'Product added.', 'success');
      onDone();
    } catch { show('Failed to save product.', 'error'); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit Product' : 'Add New Product'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!form.productName.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-3.5">
        {!initial && approved.length > 0 && (
          <div>
            <label className="label">Link to an Approved Authorization (optional)</label>
            <SearchableSelect className="w-full" value={form.dealerAuthRequestId} onChange={applyLink} options={linkOptions} placeholder="Don't link — enter manually" searchPlaceholder="Search…" />
            <p className="text-[11px] text-gray-400 mt-1">Prefills Auth Serial No., Product Name, OEM, and validity — still editable below.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className="label">Auth Serial No.</label>
            <input className="input" value={form.authSerialNo} onChange={(e) => setForm({ ...form, authSerialNo: e.target.value })} placeholder="e.g. 2026_auth_0001" />
          </div>
          <div>
            <label className="label">OEM By</label>
            <input className="input" value={form.oemBy} onChange={(e) => setForm({ ...form, oemBy: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="label">Product Name *</label>
            <input className="input" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
          </div>
          <div>
            <label className="label">Decode</label>
            <input className="input" value={form.decode} onChange={(e) => setForm({ ...form, decode: e.target.value })} placeholder="e.g. BA-47" />
          </div>
          <div>
            <label className="label">Valid From</label>
            <input type="date" className="input" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
          </div>
          <div>
            <label className="label">Expire Date</label>
            <input type="date" className="input" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="label">Technical Specification</label>
            <textarea rows={4} className="input" value={form.technicalSpecification} onChange={(e) => setForm({ ...form, technicalSpecification: e.target.value })} placeholder="Key specs, model details, compliance notes…" />
          </div>
        </div>
      </div>
    </Modal>
  );
};

const DeleteConfirm = ({ row, onClose, onDone }: { row: ResellerProductRow; onClose: () => void; onDone: () => void }) => {
  const { show } = useToast();
  const [deleting, setDeleting] = useState(false);
  const confirm = async () => {
    setDeleting(true);
    try { await deleteProduct(row.id); show('Product deleted.', 'success'); onDone(); } catch { show('Failed to delete.', 'error'); } finally { setDeleting(false); }
  };
  return (
    <Modal open onClose={onClose} title="Delete Product?" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={deleting} onClick={confirm}>Delete</Button></>}>
      <p className="text-sm text-gray-600">This permanently removes <strong className="text-gray-900">{row.productName}</strong> from Our Products.</p>
    </Modal>
  );
};

// Product Management > Our Products (reseller-only) — a catalog of products
// the reseller is set up to sell, optionally linked back to the
// Authorization Request that permitted it. "Upload Catalog" stores the
// document for later AI extraction (not implemented yet — needs the same
// local-Ollama setup used elsewhere in this app).
const OurProductsPage = () => {
  usePageHeader('Our Products', 'Products you handle, with authorization details and technical specifications.');
  const { show } = useToast();
  const [rows, setRows] = useState<ResellerProductRow[]>([]);
  const [oems, setOems] = useState<string[]>([]);
  const [approved, setApproved] = useState<ApprovedAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [oemBy, setOemBy] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ResellerProductRow | null>(null);
  const [deleting, setDeleting] = useState<ResellerProductRow | null>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);
  const catalogTargetRef = useRef<number | null>(null);

  const load = () => {
    setLoading(true);
    getProducts({ search, oemBy, status }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    getProductOems().then((r) => setOems(r.data));
    getApprovedAuthorizations().then((r) => setApproved(r.data));
  }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search, oemBy, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const oemOptions = useMemo(() => [{ value: '', label: 'All OEMs' }, ...oems.map((o) => ({ value: o, label: o }))], [oems]);

  const triggerCatalogUpload = (id: number) => { catalogTargetRef.current = id; catalogInputRef.current?.click(); };
  const handleCatalogFile = async (file: File) => {
    const id = catalogTargetRef.current;
    if (!id) return;
    setUploadingFor(id);
    try { await uploadCatalog(id, file); show('Catalog uploaded — AI extraction coming soon.', 'success'); load(); } catch { show('Upload failed.', 'error'); } finally { setUploadingFor(null); }
  };

  const activeCount = rows.filter((r) => !isExpired(r.validTo)).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Products" value={rows.length} icon={Package} accent="primary" />
        <StatCard label="Active" value={activeCount} icon={Package} accent="teal" />
        <StatCard label="Expired" value={rows.length - activeCount} icon={Package} accent="amber" />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by product name…" className="input w-full !pl-9" />
        </div>
        <SearchableSelect className="w-48" value={oemBy} onChange={setOemBy} options={oemOptions} placeholder="All OEMs" searchPlaceholder="Search OEMs…" />
        <Select wrapperClassName="w-40" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} />
        <Button size="sm" icon={Plus} onClick={() => setShowForm(true)}>Add New Product</Button>
      </div>

      <input ref={catalogInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCatalogFile(f); e.target.value = ''; }} />

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading products…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
            <Package size={26} className="text-gray-300" />
            No products yet — add one, or link an approved authorization.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Auth Serial No.</th>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">Decode</th>
                  <th className="px-4 py-3">Technical Specification</th>
                  <th className="px-4 py-3">OEM By</th>
                  <th className="px-4 py-3">Valid From</th>
                  <th className="px-4 py-3">Expire Date</th>
                  <th className="px-4 py-3">Catalog</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{r.authSerialNo || 'N/A'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{r.productName}</td>
                    <td className="px-4 py-3 text-gray-600">{r.decode || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[220px] truncate" title={r.technicalSpecification || ''}>{r.technicalSpecification || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.oemBy || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.validFrom)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={isExpired(r.validTo) ? 'text-danger-600 font-semibold' : 'text-gray-600'}>{fmtDate(r.validTo)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.catalogFileName ? (
                        <button onClick={() => downloadCatalog(r.id, r.catalogFileName!)} className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline">
                          <FileText size={12} /> View
                        </button>
                      ) : (
                        <button onClick={() => triggerCatalogUpload(r.id)} disabled={uploadingFor === r.id} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-primary-600">
                          <Upload size={12} /> {uploadingFor === r.id ? 'Uploading…' : 'Upload'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(r)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Pencil size={14} /></button>
                        <button onClick={() => setDeleting(r)} className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-md"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <ProductFormModal approved={approved} onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); load(); }} />}
      {editing && <ProductFormModal initial={editing} approved={approved} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      {deleting && <DeleteConfirm row={deleting} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); load(); }} />}
    </div>
  );
};

export default OurProductsPage;

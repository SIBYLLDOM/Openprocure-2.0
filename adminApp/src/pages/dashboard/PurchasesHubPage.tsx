import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, FileText, FileCheck2, FileClock, Download, Pencil, Trash2, MoreVertical, Eye, UploadCloud } from 'lucide-react';
import {
  getPurchases, deletePurchase, downloadPurchasePdf, downloadPurchaseFile, setPurchaseStatus, resolvePurchaseLogoUrl,
  getPurchaseStats, PURCHASE_STATUS_COLORS,
} from '../../services/purchasesApi';
import type { PurchaseRow } from '../../services/purchasesApi';
import { getVendors } from '../../services/vendorsApi';
import type { VendorRow } from '../../services/vendorsApi';
import { Select, Button, Pagination } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';
import NewPurchaseChoiceModal from './purchases/NewPurchaseChoiceModal';
import UploadPurchaseModal from './purchases/UploadPurchaseModal';
import CreatePurchaseWizard from './purchases/CreatePurchaseWizard';

const STATUS_OPTIONS = [{ value: '', label: 'All Statuses' }, { value: 'Draft', label: 'Draft' }, { value: 'Sent', label: 'Sent' }, { value: 'Accepted', label: 'Accepted' }, { value: 'Rejected', label: 'Rejected' }];

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

// Purchases > Purchases Hub — applies identically to OEM and Reseller
// logins. "+ New" offers a choice between building a purchase with the
// wizard or uploading a bill/file the partner already has, mirroring the
// Sales & Invoices document lists but keyed to Vendors instead of Clients.
const PurchasesHubPage = () => {
  usePageHeader('Purchases Hub', 'Record and track purchases made from your vendors.');
  const { show } = useToast();
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({ total: 0, draft: 0 });
  const [menuFor, setMenuFor] = useState<{ id: number; top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [showChoice, setShowChoice] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    getPurchases({ page, limit: 10, search, status, vendorId, dateFrom, dateTo }).then((r) => { setRows(r.data); setTotal(r.total); }).finally(() => setLoading(false));
    getPurchaseStats().then((r) => setStats({ total: r.total, draft: r.draft })).catch(() => {});
  };

  useEffect(() => { getVendors({ page: 1, limit: 100, status: 'Active' }).then((r) => setVendors(r.data)); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [page, search, status, vendorId, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuFor) return;
    const closeOnOutside = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null); };
    window.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('scroll', () => setMenuFor(null), true);
    return () => window.removeEventListener('mousedown', closeOnOutside);
  }, [menuFor]);

  const vendorOptions = useMemo(() => [{ value: '', label: 'All Vendors' }, ...vendors.map((v) => ({ value: String(v.id), label: v.businessName }))], [vendors]);

  const doDownload = (row: PurchaseRow) => {
    if (row.source === 'uploaded') downloadPurchaseFile(row.id, row.uploadedFileName || `${row.purchaseNo}`);
    else downloadPurchasePdf(row.id, row.purchaseNo);
    setMenuFor(null);
  };
  const doDelete = async (row: PurchaseRow) => {
    if (!window.confirm(`Delete purchase ${row.purchaseNo}? This cannot be undone.`)) return;
    try { await deletePurchase(row.id); show('Purchase deleted.', 'success'); load(); } catch { show('Failed to delete.', 'error'); }
    setMenuFor(null);
  };
  const doStatus = async (row: PurchaseRow, s: PurchaseRow['status']) => {
    try { await setPurchaseStatus(row.id, s); load(); } catch { show('Failed to update status.', 'error'); }
    setMenuFor(null);
  };

  const menuRow = menuFor ? rows.find((r) => r.id === menuFor.id) : null;
  const from = total === 0 ? 0 : (page - 1) * 10 + 1;
  const to = Math.min(page * 10, total);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm font-semibold text-gray-600">Showing {from} to {to} of {total} Purchase{total === 1 ? '' : 's'}</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 min-w-[160px]">
            <FileCheck2 size={16} className="text-primary-600 flex-shrink-0" />
            <span className="text-sm font-bold text-gray-900">{stats.total}</span>
            <span className="text-xs text-gray-500">Total Purchases</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 min-w-[160px]">
            <FileClock size={16} className="text-amber-600 flex-shrink-0" />
            <span className="text-sm font-bold text-gray-900">{stats.draft}</span>
            <span className="text-xs text-gray-500">Draft Purchases</span>
          </div>
          <Button size="sm" icon={Plus} onClick={() => setShowChoice(true)}>New</Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search by purchase no., invoice no. or PO number…" className="input w-full !pl-9" />
        </div>
        <SearchableSelect className="w-52" value={vendorId} onChange={(v) => { setPage(1); setVendorId(v); }} options={vendorOptions} placeholder="All Vendors" searchPlaceholder="Search…" />
        <Select wrapperClassName="w-36" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_OPTIONS} />
        <div className="flex items-center gap-1.5">
          <input type="date" className="input !w-auto" value={dateFrom} max={dateTo || undefined} onChange={(e) => { setPage(1); setDateFrom(e.target.value); }} />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" className="input !w-auto" value={dateTo} min={dateFrom || undefined} onChange={(e) => { setPage(1); setDateTo(e.target.value); }} />
          {(dateFrom || dateTo) && (
            <button type="button" onClick={() => { setPage(1); setDateFrom(''); setDateTo(''); }} className="text-xs font-semibold text-gray-400 hover:text-danger-600 ml-0.5">Clear</button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading purchases…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
            <FileText size={26} className="text-gray-300" />
            No purchases yet — record your first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Purchase No.</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-semibold text-gray-800">{r.purchaseNo}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-primary-50 text-primary-700 font-bold text-[10px] flex items-center justify-center overflow-hidden flex-shrink-0">
                          {r.vendor?.logoPath ? <img src={resolvePurchaseLogoUrl(r.vendor.logoPath)!} alt="" className="w-full h-full object-cover" /> : (r.vendor?.businessName || '-').charAt(0)}
                        </div>
                        <span className="text-gray-700">{r.vendor?.businessName || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(r.purchaseDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(r.dueDate)}</td>
                    <td className="px-4 py-3 text-gray-800 font-semibold">{r.source === 'uploaded' ? '-' : `${r.currency === 'INR' ? '₹' : r.currency} ${Number(r.grandTotal).toLocaleString('en-IN')}`}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${PURCHASE_STATUS_COLORS[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.source === 'uploaded' ? 'Uploaded' : 'Created'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => doDownload(r)} title={r.source === 'uploaded' ? 'Download File' : 'Download PDF'} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Download size={14} /></button>
                        {r.source === 'created' ? (
                          <button onClick={() => setEditingId(r.id)} title="Edit" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Pencil size={14} /></button>
                        ) : (
                          <button onClick={() => doDownload(r)} title="View" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Eye size={14} /></button>
                        )}
                        <button
                          onClick={(e) => {
                            if (menuFor?.id === r.id) { setMenuFor(null); return; }
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuFor({ id: r.id, top: rect.bottom + 4, left: rect.right - 176 });
                          }}
                          title="More"
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"
                        ><MoreVertical size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />
      </div>

      {menuFor && menuRow && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: menuFor.top, left: Math.max(8, menuFor.left) }} className="w-44 bg-white border border-gray-100 rounded-lg shadow-lg z-[100] py-1">
          {(['Draft', 'Sent', 'Accepted', 'Rejected'] as const).filter((s) => s !== menuRow.status).map((s) => (
            <button key={s} onClick={() => doStatus(menuRow, s)} className="w-full text-left px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">Mark as {s}</button>
          ))}
          <button onClick={() => doDelete(menuRow)} className="w-full text-left px-3.5 py-2 text-xs font-semibold text-danger-600 hover:bg-danger-50 flex items-center gap-1.5"><Trash2 size={12} /> Delete</button>
        </div>,
        document.body
      )}

      {showChoice && (
        <NewPurchaseChoiceModal
          onClose={() => setShowChoice(false)}
          onCreate={() => { setShowChoice(false); setShowWizard(true); }}
          onUpload={() => { setShowChoice(false); setShowUpload(true); }}
        />
      )}
      {showUpload && <UploadPurchaseModal vendors={vendors} onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load(); }} />}
      {showWizard && (
        <CreatePurchaseWizard
          vendors={vendors}
          onClose={() => setShowWizard(false)}
          onDone={() => { setShowWizard(false); load(); }}
          onVendorAdded={(v) => setVendors((vs) => [v, ...vs])}
        />
      )}
      {editingId !== null && (
        <CreatePurchaseWizard
          purchaseId={editingId}
          vendors={vendors}
          onClose={() => setEditingId(null)}
          onDone={() => { setEditingId(null); load(); }}
          onVendorAdded={(v) => setVendors((vs) => [v, ...vs])}
        />
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <UploadCloud size={12} /> Uploaded purchases are tracked as-is and served for download exactly as uploaded — they aren't editable in the wizard.
      </div>
    </div>
  );
};

export default PurchasesHubPage;

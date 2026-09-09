import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, FileText, FileCheck2, FileClock, Download, Pencil, Trash2, MoreVertical, Eye, UploadCloud, Send } from 'lucide-react';
import {
  getQuotations, deleteQuotation, downloadQuotationPdf, downloadQuotationFile, setQuotationStatus, resolveQuotationLogoUrl,
  getQuotationStats, emailQuotation, QUOTATION_STATUS_COLORS,
} from '../../services/quotationsApi';
import type { QuotationRow, QuotationDocType } from '../../services/quotationsApi';
import { getClients } from '../../services/clientsApi';
import type { ClientRow } from '../../services/clientsApi';
import { Select, Button, Pagination } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';
import NewQuotationChoiceModal from './quotations/NewQuotationChoiceModal';
import UploadQuotationModal from './quotations/UploadQuotationModal';
import CreateQuotationWizard from './quotations/CreateQuotationWizard';

const STATUS_OPTIONS = [{ value: '', label: 'All Statuses' }, { value: 'Draft', label: 'Draft' }, { value: 'Sent', label: 'Sent' }, { value: 'Accepted', label: 'Accepted' }, { value: 'Rejected', label: 'Rejected' }];

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

interface Props {
  docType: QuotationDocType;
  label: string; // "Quotation" / "Invoice" / "Proforma Invoice"
  labelPlural: string; // "Quotations" / "Invoices" / "Proforma Invoices"
  pageDescription: string;
  fromLabel?: string; // "Quotation From" / "Billed By" / "Delivered By"
  toLabel?: string; // "Quotation For" / "Billed To" / "Delivered To"
  dueDateLabel?: string; // "Valid Till Date" / "Due Date" — also drives the list's date column header
  showDueDate?: boolean; // false for Sales Order / Delivery Challan — no second date column on those
}

// Backs every Sales & Invoices document list (Quotations, Invoices,
// Proforma Invoice, Sales Order, Delivery Challan) — all five share this
// exact list/filter/create/upload/PDF/email feature set (per explicit
// instruction) but stay separate record sets, entirely via the `docType`
// passed in here and threaded through every API call. "+ New" offers a
// choice between building one with the wizard or uploading a file the
// partner already has.
const QuotationsListPage = ({ docType, label, labelPlural, pageDescription, fromLabel, toLabel, dueDateLabel, showDueDate = true }: Props) => {
  const dueDateColumnLabel = (dueDateLabel || 'Valid Till Date').replace(' Date', '');
  usePageHeader(labelPlural, pageDescription);
  const { show } = useToast();
  const [rows, setRows] = useState<QuotationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [clientId, setClientId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({ total: 0, draft: 0 });
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<{ id: number; top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [showChoice, setShowChoice] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    getQuotations({ docType, page, limit: 10, search, status, clientId, dateFrom, dateTo }).then((r) => { setRows(r.data); setTotal(r.total); }).finally(() => setLoading(false));
    getQuotationStats(docType).then((r) => setStats({ total: r.total, draft: r.draft })).catch(() => {});
  };

  useEffect(() => { getClients({ page: 1, limit: 100, status: 'Active' }).then((r) => setClients(r.data)); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [docType, page, search, status, clientId, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [docType]);

  useEffect(() => {
    if (!menuFor) return;
    const closeOnOutside = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null); };
    window.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('scroll', () => setMenuFor(null), true);
    return () => window.removeEventListener('mousedown', closeOnOutside);
  }, [menuFor]);

  const clientOptions = useMemo(() => [{ value: '', label: 'All Clients' }, ...clients.map((c) => ({ value: String(c.id), label: c.businessName }))], [clients]);

  const doDownload = (row: QuotationRow) => {
    if (row.source === 'uploaded') downloadQuotationFile(row.id, row.uploadedFileName || `${row.quotationNo}`);
    else downloadQuotationPdf(row.id, row.quotationNo);
    setMenuFor(null);
  };
  const doDelete = async (row: QuotationRow) => {
    if (!window.confirm(`Delete ${label.toLowerCase()} ${row.quotationNo}? This cannot be undone.`)) return;
    try { await deleteQuotation(row.id); show(`${label} deleted.`, 'success'); load(); } catch { show('Failed to delete.', 'error'); }
    setMenuFor(null);
  };
  const doStatus = async (row: QuotationRow, s: QuotationRow['status']) => {
    try { await setQuotationStatus(row.id, s); load(); } catch { show('Failed to update status.', 'error'); }
    setMenuFor(null);
  };
  const doShare = async (row: QuotationRow) => {
    if (!row.client) { show(`This ${label.toLowerCase()} has no linked client to email.`, 'error'); return; }
    setSendingId(row.id);
    try {
      await emailQuotation(row.id);
      show(`${label} emailed to ${row.client.businessName}.`, 'success');
    } catch (err: any) {
      show(err?.response?.data?.message || 'Failed to send email.', 'error');
    } finally { setSendingId(null); }
  };

  const menuRow = menuFor ? rows.find((r) => r.id === menuFor.id) : null;
  const from = total === 0 ? 0 : (page - 1) * 10 + 1;
  const to = Math.min(page * 10, total);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm font-semibold text-gray-600">Showing {from} to {to} of {total} {total === 1 ? label : labelPlural}</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 min-w-[160px]">
            <FileCheck2 size={16} className="text-primary-600 flex-shrink-0" />
            <span className="text-sm font-bold text-gray-900">{stats.total}</span>
            <span className="text-xs text-gray-500">Total {labelPlural}</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 min-w-[160px]">
            <FileClock size={16} className="text-amber-600 flex-shrink-0" />
            <span className="text-sm font-bold text-gray-900">{stats.draft}</span>
            <span className="text-xs text-gray-500">Draft {labelPlural}</span>
          </div>
          <Button size="sm" icon={Plus} onClick={() => setShowChoice(true)}>New</Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder={`Search by ${label.toLowerCase()} no. or PO number…`} className="input w-full !pl-9" />
        </div>
        <SearchableSelect className="w-52" value={clientId} onChange={(v) => { setPage(1); setClientId(v); }} options={clientOptions} placeholder="All Clients" searchPlaceholder="Search…" />
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
          <div className="py-16 text-center text-sm text-gray-400">Loading {labelPlural.toLowerCase()}…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
            <FileText size={26} className="text-gray-300" />
            No {labelPlural.toLowerCase()} yet — create your first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">{label} No.</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Date</th>
                  {showDueDate && <th className="px-4 py-3">{dueDateColumnLabel}</th>}
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-semibold text-gray-800">{r.quotationNo}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-primary-50 text-primary-700 font-bold text-[10px] flex items-center justify-center overflow-hidden flex-shrink-0">
                          {r.client?.logoPath ? <img src={resolveQuotationLogoUrl(r.client.logoPath)!} alt="" className="w-full h-full object-cover" /> : (r.client?.businessName || '-').charAt(0)}
                        </div>
                        <span className="text-gray-700">{r.client?.businessName || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(r.quotationDate)}</td>
                    {showDueDate && <td className="px-4 py-3 text-gray-600">{fmtDate(r.validTillDate)}</td>}
                    <td className="px-4 py-3 text-gray-800 font-semibold">{r.source === 'uploaded' ? '-' : `${r.currency === 'INR' ? '₹' : r.currency} ${Number(r.grandTotal).toLocaleString('en-IN')}`}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${QUOTATION_STATUS_COLORS[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.source === 'uploaded' ? 'Uploaded' : 'Created'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => doShare(r)}
                          disabled={sendingId === r.id || !r.client}
                          title={r.client ? `Email to ${r.client.businessName}` : 'No client linked'}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md disabled:opacity-40 disabled:pointer-events-none"
                        ><Send size={14} className={sendingId === r.id ? 'animate-pulse' : ''} /></button>
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
        <NewQuotationChoiceModal
          label={label}
          onClose={() => setShowChoice(false)}
          onCreate={() => { setShowChoice(false); setShowWizard(true); }}
          onUpload={() => { setShowChoice(false); setShowUpload(true); }}
        />
      )}
      {showUpload && <UploadQuotationModal docType={docType} label={label} clients={clients} onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load(); }} />}
      {showWizard && (
        <CreateQuotationWizard
          docType={docType}
          label={label}
          fromLabel={fromLabel}
          toLabel={toLabel}
          dueDateLabel={dueDateLabel}
          showDueDate={showDueDate}
          clients={clients}
          onClose={() => setShowWizard(false)}
          onDone={() => { setShowWizard(false); load(); }}
          onClientAdded={(c) => setClients((cs) => [c, ...cs])}
        />
      )}
      {editingId !== null && (
        <CreateQuotationWizard
          docType={docType}
          label={label}
          fromLabel={fromLabel}
          toLabel={toLabel}
          dueDateLabel={dueDateLabel}
          showDueDate={showDueDate}
          quotationId={editingId}
          clients={clients}
          onClose={() => setEditingId(null)}
          onDone={() => { setEditingId(null); load(); }}
          onClientAdded={(c) => setClients((cs) => [c, ...cs])}
        />
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <UploadCloud size={12} /> Uploaded {labelPlural.toLowerCase()} are tracked as-is and served for download exactly as uploaded — they aren't editable in the wizard.
      </div>
    </div>
  );
};

export default QuotationsListPage;

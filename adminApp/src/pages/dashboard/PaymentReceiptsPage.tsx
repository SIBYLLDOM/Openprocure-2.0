import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Receipt as ReceiptIcon, Pencil, Trash2, MoreVertical, FileCheck2, FileClock } from 'lucide-react';
import {
  getPaymentReceipts, deletePaymentReceipt, getPaymentReceiptStats, PAYMENT_RECEIPT_STATUS_COLORS,
} from '../../services/paymentReceiptsApi';
import type { PaymentReceiptRow, PaymentType } from '../../services/paymentReceiptsApi';
import { getClients } from '../../services/clientsApi';
import type { ClientRow } from '../../services/clientsApi';
import { Select, Button, Pagination } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';
import NewPaymentChoiceModal from './payments/NewPaymentChoiceModal';
import CreatePaymentReceiptWizard from './payments/CreatePaymentReceiptWizard';

const STATUS_OPTIONS = [{ value: '', label: 'All Statuses' }, { value: 'Draft', label: 'Draft' }, { value: 'Saved', label: 'Saved' }];
const TYPE_OPTIONS = [{ value: '', label: 'All Types' }, { value: 'receipt', label: 'Payment Receipt' }, { value: 'advance', label: 'Client Advance' }];

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const fmtMoney = (currency: string, n: string | number) => `${currency === 'INR' ? '₹' : currency} ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Sales & Invoices > Payment Receipts — applies identically to OEM and
// Reseller logins. "+ New" first asks whether this is a Payment Receipt
// (settled against real unpaid invoices) or a Client Advance (no invoice
// involved), then opens the matching wizard.
const PaymentReceiptsPage = () => {
  usePageHeader('Payment Receipts', 'Record payments received from clients and settle them against invoices.');
  const { show } = useToast();
  const [rows, setRows] = useState<PaymentReceiptRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [clientId, setClientId] = useState('');
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({ total: 0, draft: 0 });
  const [menuFor, setMenuFor] = useState<{ id: number; top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [showChoice, setShowChoice] = useState(false);
  const [wizardType, setWizardType] = useState<PaymentType | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    getPaymentReceipts({ page, limit: 10, search, status, paymentType, clientId }).then((r) => { setRows(r.data); setTotal(r.total); }).finally(() => setLoading(false));
    getPaymentReceiptStats().then((r) => setStats({ total: r.total, draft: r.draft })).catch(() => {});
  };

  useEffect(() => { getClients({ page: 1, limit: 100, status: 'Active' }).then((r) => setClients(r.data)); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [page, search, status, paymentType, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuFor) return;
    const closeOnOutside = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null); };
    window.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('scroll', () => setMenuFor(null), true);
    return () => window.removeEventListener('mousedown', closeOnOutside);
  }, [menuFor]);

  const clientOptions = useMemo(() => [{ value: '', label: 'All Clients' }, ...clients.map((c) => ({ value: String(c.id), label: c.businessName }))], [clients]);

  const doDelete = async (row: PaymentReceiptRow) => {
    if (!window.confirm(`Delete payment receipt ${row.receiptNo}? This cannot be undone.`)) return;
    try { await deletePaymentReceipt(row.id); show('Payment receipt deleted.', 'success'); load(); } catch { show('Failed to delete.', 'error'); }
    setMenuFor(null);
  };

  const menuRow = menuFor ? rows.find((r) => r.id === menuFor.id) : null;
  const from = total === 0 ? 0 : (page - 1) * 10 + 1;
  const to = Math.min(page * 10, total);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm font-semibold text-gray-600">Showing {from} to {to} of {total} Payment Receipt{total === 1 ? '' : 's'}</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 min-w-[160px]">
            <FileCheck2 size={16} className="text-primary-600 flex-shrink-0" />
            <span className="text-sm font-bold text-gray-900">{stats.total}</span>
            <span className="text-xs text-gray-500">Total Receipts</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 min-w-[160px]">
            <FileClock size={16} className="text-amber-600 flex-shrink-0" />
            <span className="text-sm font-bold text-gray-900">{stats.draft}</span>
            <span className="text-xs text-gray-500">Draft Receipts</span>
          </div>
          <Button size="sm" icon={Plus} onClick={() => setShowChoice(true)}>New</Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search by receipt no…" className="input w-full !pl-9" />
        </div>
        <SearchableSelect className="w-52" value={clientId} onChange={(v) => { setPage(1); setClientId(v); }} options={clientOptions} placeholder="All Clients" searchPlaceholder="Search…" />
        <Select wrapperClassName="w-40" value={paymentType} onChange={(e) => { setPage(1); setPaymentType(e.target.value); }} options={TYPE_OPTIONS} />
        <Select wrapperClassName="w-32" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_OPTIONS} />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading payment receipts…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
            <ReceiptIcon size={26} className="text-gray-300" />
            No payment receipts yet — record your first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Receipt No.</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Allocated</th>
                  <th className="px-4 py-3">Advance</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-semibold text-gray-800">{r.receiptNo}</td>
                    <td className="px-4 py-3 text-gray-700">{r.client?.businessName || r.receivedFrom || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.paymentType === 'advance' ? 'bg-amber-50 text-amber-700' : 'bg-primary-50 text-primary-700'}`}>{r.paymentType === 'advance' ? 'Client Advance' : 'Payment Receipt'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(r.receiptDate)}</td>
                    <td className="px-4 py-3 text-gray-800 font-semibold">{fmtMoney(r.currency, r.totalReceived)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtMoney(r.currency, r.totalAllocated)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtMoney(r.currency, r.advanceAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${PAYMENT_RECEIPT_STATUS_COLORS[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditingId(r.id)} title="Edit" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Pencil size={14} /></button>
                        <button
                          onClick={(e) => {
                            if (menuFor?.id === r.id) { setMenuFor(null); return; }
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuFor({ id: r.id, top: rect.bottom + 4, left: rect.right - 140 });
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
        <div ref={menuRef} style={{ position: 'fixed', top: menuFor.top, left: Math.max(8, menuFor.left) }} className="w-36 bg-white border border-gray-100 rounded-lg shadow-lg z-[100] py-1">
          <button onClick={() => doDelete(menuRow)} className="w-full text-left px-3.5 py-2 text-xs font-semibold text-danger-600 hover:bg-danger-50 flex items-center gap-1.5"><Trash2 size={12} /> Delete</button>
        </div>,
        document.body
      )}

      {showChoice && (
        <NewPaymentChoiceModal
          onClose={() => setShowChoice(false)}
          onSelect={(type) => { setShowChoice(false); setWizardType(type); }}
        />
      )}
      {wizardType && (
        <CreatePaymentReceiptWizard
          paymentType={wizardType}
          clients={clients}
          onClose={() => setWizardType(null)}
          onDone={() => { setWizardType(null); load(); }}
        />
      )}
      {editingId !== null && rows.find((r) => r.id === editingId) && (
        <CreatePaymentReceiptWizard
          paymentType={rows.find((r) => r.id === editingId)!.paymentType}
          receiptId={editingId}
          clients={clients}
          onClose={() => setEditingId(null)}
          onDone={() => { setEditingId(null); load(); }}
        />
      )}
    </div>
  );
};

export default PaymentReceiptsPage;

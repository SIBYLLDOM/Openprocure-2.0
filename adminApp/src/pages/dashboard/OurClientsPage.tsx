import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Download, Eye, Pencil, Archive, ArchiveRestore, MoreVertical, Building2 } from 'lucide-react';
import {
  getClients, setClientArchived, exportClientsCsv, getClient, resolveLogoUrl,
} from '../../services/clientsApi';
import type { ClientRow, ClientDetail } from '../../services/clientsApi';
import { Select, Button, Pagination, Modal } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { COUNTRIES } from '../../data/geo';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';
import ClientFormModal from './clients/ClientFormModal';
import ClientDetailDrawer from './clients/ClientDetailDrawer';

const KIND_OPTIONS = [{ value: '', label: 'All Types' }, { value: 'Client', label: 'Client' }, { value: 'Prospect', label: 'Prospect' }];
const STATUS_OPTIONS = [{ value: 'Active', label: 'Active' }, { value: 'Archived', label: 'Archived' }];

// Full master lists (same ones the Add Client form offers) rather than only
// the values already used by existing clients — a filter should let you
// pick any industry/country, not just ones that already have a match.
const ALL_INDUSTRIES = ['Education', 'Healthcare', 'Manufacturing', 'IT & Software', 'Retail', 'Government', 'Construction', 'Finance', 'Logistics', 'Hospitality', 'Other'];

const TrustScoreModal = ({ onClose }: { onClose: () => void }) => (
  <Modal open onClose={onClose} title="Trust Score" size="sm" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
    <p className="text-sm text-gray-500">No score available yet — trust scores are calculated from invoice and payment history, which this client doesn't have yet.</p>
  </Modal>
);

// Sales & Invoices > Our Clients — a partner's own client/prospect book.
// Applies identically to OEM and Reseller logins (per standing instruction).
const OurClientsPage = () => {
  usePageHeader('Our Clients', 'Manage your clients and prospects.');
  const { show } = useToast();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [clientKind, setClientKind] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState('Active');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClientDetail | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [trustScoreFor, setTrustScoreFor] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<{ id: number; top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    getClients({ page, limit: 10, search, clientKind, industry, country, status }).then((r) => { setRows(r.data); setTotal(r.total); }).finally(() => setLoading(false));
  };

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [page, search, clientKind, industry, country, status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuFor) return;
    const closeOnOutside = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null); };
    window.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('scroll', () => setMenuFor(null), true);
    return () => window.removeEventListener('mousedown', closeOnOutside);
  }, [menuFor]);

  const industryOptions = useMemo(() => [{ value: '', label: 'All Industries' }, ...ALL_INDUSTRIES.map((i) => ({ value: i, label: i }))], []);
  const countryOptions = useMemo(() => [{ value: '', label: 'All Countries' }, ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))], []);

  const toggleArchive = async (row: ClientRow) => {
    try { await setClientArchived(row.id, row.status !== 'Archived'); show(row.status === 'Archived' ? 'Client restored.' : 'Client archived.', 'success'); load(); } catch { show('Failed to update.', 'error'); } finally { setMenuFor(null); }
  };

  const openEdit = async (row: ClientRow) => {
    try { const r = await getClient(row.id); setEditing(r.data); } catch { show('Failed to load client.', 'error'); }
  };

  const menuRow = menuFor ? rows.find((r) => r.id === menuFor.id) : null;

  const from = total === 0 ? 0 : (page - 1) * 10 + 1;
  const to = Math.min(page * 10, total);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-600">
          Showing {from} to {to} of {total} Client{total === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={Download} onClick={exportClientsCsv}>Download CSV</Button>
          <Button size="sm" icon={Plus} onClick={() => setShowForm(true)}>Add Client</Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search by name, phone or email…" className="input w-full !pl-9" />
        </div>
        <Select wrapperClassName="w-36" value={clientKind} onChange={(e) => { setPage(1); setClientKind(e.target.value); }} options={KIND_OPTIONS} />
        <SearchableSelect className="w-48" value={industry} onChange={(v) => { setPage(1); setIndustry(v); }} options={industryOptions} placeholder="All Industries" searchPlaceholder="Search…" />
        <SearchableSelect className="w-44" value={country} onChange={(v) => { setPage(1); setCountry(v); }} options={countryOptions} placeholder="All Countries" searchPlaceholder="Search…" />
        <Select wrapperClassName="w-32" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_OPTIONS} />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading clients…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
            <Building2 size={26} className="text-gray-300" />
            No clients yet — add your first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Logo</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-700 font-bold text-xs flex items-center justify-center overflow-hidden">
                        {r.logoPath ? <img src={resolveLogoUrl(r.logoPath)!} alt="" className="w-full h-full object-cover" /> : r.businessName.charAt(0)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      <button onClick={() => setViewingId(r.id)} className="hover:text-primary-700 hover:underline text-left">{r.businessName}</button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.clientKind === 'Prospect' ? 'bg-amber-50 text-amber-700' : 'bg-primary-50 text-primary-700'}`}>{r.clientKind}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.industry || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.phone || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.email || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.country || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.status === 'Active' ? 'bg-success-50 text-success-700' : 'bg-gray-100 text-gray-500'}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewingId(r.id)} title="View Client" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Eye size={14} /></button>
                        <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Pencil size={14} /></button>
                        <button
                          onClick={(e) => {
                            if (menuFor?.id === r.id) { setMenuFor(null); return; }
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuFor({ id: r.id, top: rect.bottom + 4, left: rect.right - 192 });
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
        <div ref={menuRef} style={{ position: 'fixed', top: menuFor.top, left: Math.max(8, menuFor.left) }} className="w-48 bg-white border border-gray-100 rounded-lg shadow-lg z-[100] py-1">
          <button onClick={() => { setTrustScoreFor(menuRow.id); setMenuFor(null); }} className="w-full text-left px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">View Trust Score</button>
          <button onClick={() => toggleArchive(menuRow)} className="w-full text-left px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
            {menuRow.status === 'Archived' ? <><ArchiveRestore size={12} /> Restore</> : <><Archive size={12} /> Archive</>}
          </button>
        </div>,
        document.body
      )}

      {showForm && <ClientFormModal onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); load(); }} />}
      {editing && <ClientFormModal initial={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      {viewingId !== null && <ClientDetailDrawer clientId={viewingId} onClose={() => setViewingId(null)} onChanged={load} />}
      {trustScoreFor !== null && <TrustScoreModal onClose={() => setTrustScoreFor(null)} />}
    </div>
  );
};

export default OurClientsPage;

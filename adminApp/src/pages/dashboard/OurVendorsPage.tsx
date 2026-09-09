import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Download, Pencil, Archive, ArchiveRestore, MoreVertical, Truck } from 'lucide-react';
import {
  getVendors, setVendorArchived, exportVendorsCsv, getVendor, resolveVendorLogoUrl,
} from '../../services/vendorsApi';
import type { VendorRow, VendorDetail } from '../../services/vendorsApi';
import { Select, Button, Pagination } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { COUNTRIES } from '../../data/geo';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';
import VendorFormModal from './vendors/VendorFormModal';

const STATUS_OPTIONS = [{ value: 'Active', label: 'Active' }, { value: 'Archived', label: 'Archived' }];
const ALL_INDUSTRIES = ['Education', 'Healthcare', 'Manufacturing', 'IT & Software', 'Retail', 'Government', 'Construction', 'Finance', 'Logistics', 'Hospitality', 'Other'];

// Purchases & Expenses > Our Vendors — applies identically to OEM and
// Reseller logins. Mirrors Our Clients' list feature set on the purchase
// side of the ledger.
const OurVendorsPage = () => {
  usePageHeader('Our Vendors', 'Manage the vendors and suppliers you purchase from.');
  const { show } = useToast();
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState('Active');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VendorDetail | null>(null);
  const [menuFor, setMenuFor] = useState<{ id: number; top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    getVendors({ page, limit: 10, search, industry, country, status }).then((r) => { setRows(r.data); setTotal(r.total); }).finally(() => setLoading(false));
  };

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [page, search, industry, country, status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuFor) return;
    const closeOnOutside = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null); };
    window.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('scroll', () => setMenuFor(null), true);
    return () => window.removeEventListener('mousedown', closeOnOutside);
  }, [menuFor]);

  const industryOptions = useMemo(() => [{ value: '', label: 'All Industries' }, ...ALL_INDUSTRIES.map((i) => ({ value: i, label: i }))], []);
  const countryOptions = useMemo(() => [{ value: '', label: 'All Countries' }, ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))], []);

  const toggleArchive = async (row: VendorRow) => {
    try { await setVendorArchived(row.id, row.status !== 'Archived'); show(row.status === 'Archived' ? 'Vendor restored.' : 'Vendor archived.', 'success'); load(); } catch { show('Failed to update.', 'error'); } finally { setMenuFor(null); }
  };
  const openEdit = async (row: VendorRow) => {
    try { const r = await getVendor(row.id); setEditing(r.data); } catch { show('Failed to load vendor.', 'error'); }
  };

  const menuRow = menuFor ? rows.find((r) => r.id === menuFor.id) : null;
  const from = total === 0 ? 0 : (page - 1) * 10 + 1;
  const to = Math.min(page * 10, total);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-600">Showing {from} to {to} of {total} Vendor{total === 1 ? '' : 's'}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={Download} onClick={exportVendorsCsv}>Download CSV</Button>
          <Button size="sm" icon={Plus} onClick={() => setShowForm(true)}>Add Vendor</Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search by name, phone or email…" className="input w-full !pl-9" />
        </div>
        <SearchableSelect className="w-48" value={industry} onChange={(v) => { setPage(1); setIndustry(v); }} options={industryOptions} placeholder="All Industries" searchPlaceholder="Search…" />
        <SearchableSelect className="w-44" value={country} onChange={(v) => { setPage(1); setCountry(v); }} options={countryOptions} placeholder="All Countries" searchPlaceholder="Search…" />
        <Select wrapperClassName="w-32" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_OPTIONS} />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading vendors…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
            <Truck size={26} className="text-gray-300" />
            No vendors yet — add your first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Logo</th>
                  <th className="px-4 py-3">Name</th>
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
                        {r.logoPath ? <img src={resolveVendorLogoUrl(r.logoPath)!} alt="" className="w-full h-full object-cover" /> : r.businessName.charAt(0)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      <button onClick={() => openEdit(r)} className="hover:text-primary-700 hover:underline text-left">{r.businessName}</button>
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
                        <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Pencil size={14} /></button>
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
        <div ref={menuRef} style={{ position: 'fixed', top: menuFor.top, left: Math.max(8, menuFor.left) }} className="w-48 bg-white border border-gray-100 rounded-lg shadow-lg z-[100] py-1">
          <button onClick={() => toggleArchive(menuRow)} className="w-full text-left px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
            {menuRow.status === 'Archived' ? <><ArchiveRestore size={12} /> Restore</> : <><Archive size={12} /> Archive</>}
          </button>
        </div>,
        document.body
      )}

      {showForm && <VendorFormModal onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); load(); }} />}
      {editing && <VendorFormModal initial={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
    </div>
  );
};

export default OurVendorsPage;

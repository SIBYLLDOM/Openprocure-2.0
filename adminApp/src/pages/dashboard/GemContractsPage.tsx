import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Download, FileText, IndianRupee, CheckSquare, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getGemContracts, getContractCategories, getContractStates } from '../../services/ordersApi';
import type { ContractRow } from '../../services/ordersApi';
import { Select, Pagination, StatCard } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { usePageHeader } from '../../context/PageHeaderContext';

const DEPT_OPTIONS = [
  { value: '', label: 'All Divisions' },
  { value: 'diagno', label: 'Diagno' },
  { value: 'endo', label: 'Endo' },
];
const BUYING_MODE_OPTIONS = [
  { value: '', label: 'All Modes' },
  { value: 'Direct', label: 'Direct' },
  { value: 'Bid/RA', label: 'Bid/RA' },
];
const SORT_OPTIONS = [
  { value: 'contractDate-desc', label: 'Contract Date: Newest' },
  { value: 'contractDate-asc', label: 'Contract Date: Oldest' },
  { value: 'contractValue-desc', label: 'Contract Value: Highest' },
  { value: 'contractValue-asc', label: 'Contract Value: Lowest' },
];

// Formats like the original's Lakh/Crore display — Indian-market contract
// values regularly run into crores, and a plain toLocaleString reads worse
// at that scale than the Cr/L shorthand this audience expects.
const formatIndian = (v: number) => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

// Clone of the automation site's "GeM Contracts" page (/orders/gem-contracts)
// — a filterable, sortable, exportable list of every awarded GeM contract in
// the migrated `contracts` table.
const GemContractsPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [state, setState] = useState('');
  const [category, setCategory] = useState('');
  const [buyingMode, setBuyingMode] = useState('');
  const [contractDateFrom, setContractDateFrom] = useState('');
  const [contractDateTo, setContractDateTo] = useState('');
  const [sort, setSort] = useState('contractDate-desc');
  const [showFilters, setShowFilters] = useState(false);

  const [rows, setRows] = useState<ContractRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [states, setStates] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    getContractStates().then((r) => setStates(r.data)).catch(() => {});
    getContractCategories().then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      getGemContracts({ page, limit: 25, search, state, dept, category, buyingMode, contractDateFrom, contractDateTo, sort })
        .then((r) => { setRows(r.data); setTotal(r.total); setTotalValue(r.totalValue); })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [page, search, state, dept, category, buyingMode, contractDateFrom, contractDateTo, sort]);

  const stateOptions = useMemo(() => [{ value: '', label: 'All States' }, ...states.map((s) => ({ value: s, label: s }))], [states]);
  const categoryOptions = useMemo(() => [{ value: '', label: 'All Categories' }, ...categories.map((c) => ({ value: c, label: c }))], [categories]);

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  };
  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportToExcel = () => {
    const exportRows = selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : rows;
    const sheetData = exportRows.map((r, i) => ({
      'S No': i + 1,
      'Contract No': r.contract_no,
      'Bid No': r.bid_no,
      'Mode': r.buying_mode,
      'Status': r.order_status,
      'Contract Date': r.contract_date,
      'Zonal Head': r.zonal_head,
      'Hospital Name': r.hospital_name,
      'Hospital State': r.hospital_state,
      'Seller Name': r.seller_name,
      'Meril DB': r.meril_db,
      'Category': r.category_name,
      'Decode': r.decode_code,
      'Meril/Others': r.meril_or_others,
      'Qty': r.ordered_quantity,
      'Unit Price': r.unit_price,
      'Contract Value': r.total_value,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contracts');
    const label = selected.size > 0 ? 'Selected' : 'All';
    XLSX.writeFile(wb, `GeM-Contracts-${label}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  usePageHeader('GeM Contracts', 'Every awarded GeM contract sourced from the migrated automation data.');

  return (
    <div className="space-y-5">

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Contracts" value={total.toLocaleString('en-IN')} icon={FileText} accent="primary" />
        <StatCard label="Total Contract Value" value={formatIndian(totalValue)} icon={IndianRupee} accent="teal" />
        <StatCard label="Selected" value={selected.size} icon={CheckSquare} accent="violet" />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Search contract no, product, seller, hospital…"
            className="input w-full !pl-9"
          />
        </div>
        <Select wrapperClassName="w-44" value={sort} onChange={(e) => setSort(e.target.value)} options={SORT_OPTIONS} />
        <button
          onClick={() => setShowFilters((o) => !o)}
          className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2.5 rounded-lg border transition-colors ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          <SlidersHorizontal size={14} /> Filters
        </button>
        <button
          onClick={exportToExcel}
          disabled={rows.length === 0}
          className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2.5 rounded-lg bg-primary-950 text-white hover:bg-primary-900 transition-colors disabled:opacity-50"
        >
          <Download size={14} /> Export to Excel
        </button>
      </div>

      {showFilters && (
        <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-end gap-3">
          <Select wrapperClassName="w-40" value={dept} onChange={(e) => { setPage(1); setDept(e.target.value); }} options={DEPT_OPTIONS} />
          <SearchableSelect className="w-52" value={state} onChange={(v) => { setPage(1); setState(v); }} options={stateOptions} placeholder="All States" searchPlaceholder="Search states…" />
          <SearchableSelect className="w-64" value={category} onChange={(v) => { setPage(1); setCategory(v); }} options={categoryOptions} placeholder="All Categories" searchPlaceholder="Search categories…" />
          <Select wrapperClassName="w-36" value={buyingMode} onChange={(e) => { setPage(1); setBuyingMode(e.target.value); }} options={BUYING_MODE_OPTIONS} />
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar size={14} className="text-gray-400" />
            <input type="date" value={contractDateFrom} onChange={(e) => { setPage(1); setContractDateFrom(e.target.value); }} className="input !w-auto !py-1.5" />
            <span>to</span>
            <input type="date" value={contractDateTo} onChange={(e) => { setPage(1); setContractDateTo(e.target.value); }} className="input !w-auto !py-1.5" />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading contracts…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No contracts match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-3"><input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleSelectAll} /></th>
                  <th className="px-3 py-3">S.No</th>
                  <th className="px-4 py-3">Contract No</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Contract Date</th>
                  <th className="px-4 py-3">Zonal Head</th>
                  <th className="px-4 py-3">Hospital</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3">Meril DB</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Unit Price</th>
                  <th className="px-4 py-3">Contract Value</th>
                  <th className="px-4 py-3">Doc</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                    <td className="px-3 py-2.5 text-gray-500">{i + 1 + (page - 1) * 25}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{r.contract_no || 'N/A'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.buying_mode === 'Direct' ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'}`}>{r.buying_mode || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.order_status || 'N/A'}</td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.contract_date || 'N/A'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.zonal_head || 'N/A'}</td>
                    <td className="px-4 py-2.5 text-gray-800 max-w-[180px] truncate">{r.hospital_name || 'N/A'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.hospital_state || 'N/A'}</td>
                    <td className="px-4 py-2.5 text-gray-800 max-w-[160px] truncate">{r.seller_name || 'N/A'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.meril_db === 'YES' ? 'bg-success-50 text-success-700' : 'bg-gray-100 text-gray-600'}`}>{r.meril_db || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[160px] truncate">{r.category_name || 'N/A'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.ordered_quantity || 'N/A'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.unit_price ? `₹${Number(r.unit_price).toLocaleString('en-IN')}` : 'N/A'}</td>
                    <td className="px-4 py-2.5 font-bold text-primary-700 whitespace-nowrap">{r.total_value ? formatIndian(Number(r.total_value)) : 'N/A'}</td>
                    <td className="px-4 py-2.5">
                      {r.download_link ? (
                        <a href={r.download_link} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline"><Download size={14} /></a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalItems={total} pageSize={25} onPageChange={setPage} />
      </div>
    </div>
  );
};

export default GemContractsPage;

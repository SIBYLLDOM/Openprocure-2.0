import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Search, Plus, Download, Upload, Pencil, Trash2, Users2, SlidersHorizontal, X, Calendar } from 'lucide-react';
import {
  getContractDealers, getDealerStates, getDealerCategories, getDealerContracts,
  getDistributors, createDistributor, updateDistributor, deleteDistributor, importDistributors, createDistributor as addAsMyDistributor,
} from '../../services/dealersApi';
import type { ContractDealerRow, DealerContractRow, DistributorRow } from '../../services/dealersApi';
import { Select, Button, Modal, StatCard, Pagination } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';

const DEPT_OPTIONS = [{ value: '', label: 'All Divisions' }, { value: 'diagno', label: 'Diagno' }, { value: 'endo', label: 'Endo' }];
const SORT_OPTIONS = [
  { value: 'contracts-desc', label: 'Most Contracts' }, { value: 'contracts-asc', label: 'Least Contracts' },
  { value: 'value-desc', label: 'Highest Value' }, { value: 'value-asc', label: 'Lowest Value' },
  { value: 'name-asc', label: 'Name A-Z' }, { value: 'name-desc', label: 'Name Z-A' },
];
const ROWS_OPTIONS = [{ value: '10', label: 'Show 10' }, { value: '25', label: 'Show 25' }, { value: '50', label: 'Show 50' }, { value: '100', label: 'Show 100' }];

const formatIndian = (v: number) => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

const ContractsDrawer = ({ seller, onClose }: { seller: ContractDealerRow; onClose: () => void }) => {
  const [rows, setRows] = useState<DealerContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getDealerContracts(seller.sellerName).then((r) => setRows(r.data)).finally(() => setLoading(false)); }, [seller.sellerName]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-3xl h-full bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">{seller.sellerName}</h2>
            <p className="text-xs text-gray-500">{seller.sellerLocation || seller.sellerState}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-4 gap-4 p-6">
          <StatCard label="Total Contracts" value={seller.contractCount} icon={Users2} accent="primary" />
          <StatCard label="Total Value" value={formatIndian(seller.totalValue)} icon={Users2} accent="teal" />
          <StatCard label="State" value={seller.sellerState || 'N/A'} icon={Users2} accent="amber" />
          <StatCard label="Division" value={seller.dept || 'N/A'} icon={Users2} accent="violet" />
        </div>

        <div className="px-6 pb-6">
          {loading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading contracts…</p>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-3 py-2.5">Contract No</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Hospital</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5">Qty</th>
                    <th className="px-3 py-2.5">Value</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.contract_no || 'N/A'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.contract_date || 'N/A'}</td>
                      <td className="px-3 py-2.5 text-gray-800 max-w-[160px] truncate">{r.hospital_name || 'N/A'}</td>
                      <td className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate">{r.category_name || 'N/A'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{r.ordered_quantity || 'N/A'}</td>
                      <td className="px-3 py-2.5 font-semibold text-primary-700">{r.total_value ? formatIndian(Number(r.total_value)) : 'N/A'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.order_status || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Real-data "Dealer Management" report — clone of the automation site's
// Distributors.jsx: sellers already flagged meril_db='YES' at scrape time,
// aggregated by seller_name from the `contracts` table. See
// dealersController.js's getContractDealers.
const DealerReportSection = () => {
  const { show } = useToast();
  const [rows, setRows] = useState<ContractDealerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [states, setStates] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [dept, setDept] = useState('');
  const [category, setCategory] = useState('');
  const [contractDateFrom, setContractDateFrom] = useState('');
  const [contractDateTo, setContractDateTo] = useState('');
  const [sort, setSort] = useState('contracts-desc');
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [viewing, setViewing] = useState<ContractDealerRow | null>(null);

  useEffect(() => {
    getDealerStates().then((r) => setStates(r.data));
    getDealerCategories().then((r) => setCategories(r.data));
  }, []);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      getContractDealers({ page, limit, search, state, dept, category, contractDateFrom, contractDateTo, sort }).then((r) => { setRows(r.data); setTotal(r.total); }).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [page, limit, search, state, dept, category, contractDateFrom, contractDateTo, sort]);

  const stateOptions = useMemo(() => [{ value: '', label: 'All States' }, ...states.map((s) => ({ value: s, label: s }))], [states]);
  const categoryOptions = useMemo(() => [{ value: '', label: 'All Categories' }, ...categories.map((c) => ({ value: c, label: c }))], [categories]);

  const resetFilters = () => { setState(''); setDept(''); setCategory(''); setContractDateFrom(''); setContractDateTo(''); setPage(1); };

  const exportExcel = () => {
    const sheet = rows.map((r, i) => ({ '#': i + 1, 'Dealer / Seller Name': r.sellerName, State: r.sellerState, Location: r.sellerLocation, 'Contact No': r.sellerContactNo, Contracts: r.contractCount, 'Total Value': r.totalValue, Dept: r.dept }));
    const ws = XLSX.utils.json_to_sheet(sheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dealers');
    XLSX.writeFile(wb, `meril_dealers_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const addAsDistributor = async (r: ContractDealerRow) => {
    try {
      await addAsMyDistributor({ companyName: r.sellerName, contactNo: r.sellerContactNo || undefined, cityName: r.sellerLocation || undefined, state: r.sellerState || undefined });
      show(`${r.sellerName} added to your distributor list.`, 'success');
    } catch { show('Failed to add.', 'error'); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search dealer name…" className="input w-full !pl-9" />
        </div>
        <button onClick={() => setShowFilters((o) => !o)} className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2.5 rounded-lg border transition-colors ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          <SlidersHorizontal size={14} /> Filters
        </button>
        <Button size="sm" variant="secondary" icon={Download} onClick={exportExcel}>Export Excel</Button>
      </div>

      {showFilters && (
        <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
          <SearchableSelect className="w-52" value={state} onChange={(v) => { setPage(1); setState(v); }} options={stateOptions} placeholder="All States" searchPlaceholder="Search states…" />
          <Select wrapperClassName="w-40" value={dept} onChange={(e) => { setPage(1); setDept(e.target.value); }} options={DEPT_OPTIONS} />
          <SearchableSelect className="w-64" value={category} onChange={(v) => { setPage(1); setCategory(v); }} options={categoryOptions} placeholder="All Categories" searchPlaceholder="Search categories…" />
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar size={14} className="text-gray-400" />
            <input type="date" value={contractDateFrom} onChange={(e) => { setPage(1); setContractDateFrom(e.target.value); }} className="input !w-auto !py-1.5" />
            <span>to</span>
            <input type="date" value={contractDateTo} onChange={(e) => { setPage(1); setContractDateTo(e.target.value); }} className="input !w-auto !py-1.5" />
          </div>
          <button onClick={resetFilters} className="text-sm font-semibold text-gray-500 hover:text-primary-700">Reset Filters</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-600">{total.toLocaleString('en-IN')} dealers found</p>
        <div className="flex items-center gap-2">
          <Select wrapperClassName="w-32" value={String(limit)} onChange={(e) => { setPage(1); setLimit(Number(e.target.value)); }} options={ROWS_OPTIONS} />
          <Select wrapperClassName="w-44" value={sort} onChange={(e) => setSort(e.target.value)} options={SORT_OPTIONS} />
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading dealers…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No dealers match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Dealer / Seller Name</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Contact No.</th>
                  <th className="px-4 py-3">Contracts</th>
                  <th className="px-4 py-3">Total Value</th>
                  <th className="px-4 py-3">Dept</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.sellerName} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-gray-500">{i + 1 + (page - 1) * limit}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{r.sellerName}</td>
                    <td className="px-4 py-3 text-gray-600">{r.sellerState || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[220px] truncate">{r.sellerLocation || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.sellerContactNo || 'N/A'}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs font-bold">{r.contractCount}</span></td>
                    <td className="px-4 py-3 font-bold text-primary-700 whitespace-nowrap">{formatIndian(r.totalValue)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.dept === 'endo' ? 'bg-amber-50 text-amber-700' : 'bg-violet-50 text-violet-700'}`}>{r.dept}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => addAsDistributor(r)} title="Add to my distributor list" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Plus size={14} /></button>
                        <Button size="sm" onClick={() => setViewing(r)}>View Contracts</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalItems={total} pageSize={limit} onPageChange={setPage} />
      </div>

      {viewing && <ContractsDrawer seller={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
};

const emptyForm = { companyName: '', personName: '', contactNo: '', email: '', cityName: '', state: '', status: 'Active' as 'Active' | 'Inactive' };

const DistributorFormModal = ({ initial, onClose, onDone }: { initial?: DistributorRow; onClose: () => void; onDone: () => void }) => {
  const { show } = useToast();
  const [form, setForm] = useState(initial ? { companyName: initial.companyName, personName: initial.personName || '', contactNo: initial.contactNo || '', email: initial.email || '', cityName: initial.cityName || '', state: initial.state || '', status: initial.status } : emptyForm);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.companyName.trim()) return;
    setSaving(true);
    try {
      if (initial) await updateDistributor(initial.id, form);
      else await createDistributor(form);
      show(initial ? 'Distributor updated.' : 'Distributor added.', 'success');
      onDone();
    } catch { show('Failed to save distributor.', 'error'); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit Distributor' : 'Add Distributor'} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!form.companyName.trim()} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2">
          <label className="label">Company Name *</label>
          <input className="input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        </div>
        <div>
          <label className="label">Contact Person</label>
          <input className="input" value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })} />
        </div>
        <div>
          <label className="label">Contact No.</label>
          <input className="input" value={form.contactNo} onChange={(e) => setForm({ ...form, contactNo: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">City</label>
          <input className="input" value={form.cityName} onChange={(e) => setForm({ ...form, cityName: e.target.value })} />
        </div>
        <div>
          <label className="label">State</label>
          <input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
        </div>
        <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' })} options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} />
      </div>
    </Modal>
  );
};

const DeleteConfirm = ({ row, onClose, onDone }: { row: DistributorRow; onClose: () => void; onDone: () => void }) => {
  const { show } = useToast();
  const [deleting, setDeleting] = useState(false);
  const confirm = async () => {
    setDeleting(true);
    try { await deleteDistributor(row.id); show('Distributor deleted.', 'success'); onDone(); } catch { show('Failed to delete.', 'error'); } finally { setDeleting(false); }
  };
  return (
    <Modal open onClose={onClose} title="Delete Distributor?" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={deleting} onClick={confirm}>Delete</Button></>}>
      <p className="text-sm text-gray-600">This permanently removes <strong className="text-gray-900">{row.companyName}</strong> from your distributor list.</p>
    </Modal>
  );
};

// Your own curated distributor list — feeds the Authorization Letter
// page's dealer picker. Separate from the real dealer report above (see
// PartnerDistributor.js).
const MyDistributorsSection = () => {
  const { show } = useToast();
  const [rows, setRows] = useState<DistributorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DistributorRow | null>(null);
  const [deleting, setDeleting] = useState<DistributorRow | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const load = () => { setLoading(true); getDistributors({}).then((r) => setRows(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
        const r = await importDistributors(jsonRows);
        show(`Imported ${r.imported}, skipped ${r.skipped}.`, 'success');
        load();
      } catch { show('Import failed — check the file format.', 'error'); }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">My Distributors</h2>
          <p className="text-xs text-gray-500 mt-0.5">Used when generating Authorization Letters.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={Upload} onClick={() => importInputRef.current?.click()}>Import</Button>
          <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
          <Button size="sm" icon={Plus} onClick={() => setShowForm(true)}>Add Distributor</Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">None added yet — use the "+" on any dealer above, or add one manually.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Contact Person</th>
                  <th className="px-4 py-3">Contact No.</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-semibold text-gray-800">{r.companyName}</td>
                    <td className="px-4 py-3 text-gray-600">{r.personName || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.contactNo || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-600">{[r.cityName, r.state].filter(Boolean).join(', ') || 'N/A'}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.status === 'Active' ? 'bg-success-50 text-success-700' : 'bg-gray-100 text-gray-500'}`}>{r.status}</span></td>
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

      {showForm && <DistributorFormModal onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); load(); }} />}
      {editing && <DistributorFormModal initial={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      {deleting && <DeleteConfirm row={deleting} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); load(); }} />}
    </div>
  );
};

const DistributorsPage = () => {
  usePageHeader('Dealer Management', 'Registered dealers, distributors, and contract details.');
  return (
    <div className="space-y-8">
      <DealerReportSection />
      <MyDistributorsSection />
    </div>
  );
};

export default DistributorsPage;

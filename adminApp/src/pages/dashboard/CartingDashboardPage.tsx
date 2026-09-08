import { useEffect, useMemo, useState } from 'react';
import { PackageCheck, TrendingUp, Users2, ChevronUp, ChevronDown, Map as MapIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  getCartingSellers, getCartingStates, getCartingCategories, getCartingKpi, getCartingPivot, getCartingMap,
} from '../../services/ordersApi';
import { Select, StatCard } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { usePageHeader } from '../../context/PageHeaderContext';

const DEPT_OPTIONS = [{ value: '', label: 'All Divisions' }, { value: 'diagno', label: 'Diagno' }, { value: 'endo', label: 'Endo' }];
const BUYING_MODE_OPTIONS = [{ value: '', label: 'All Modes' }, { value: 'Direct', label: 'Direct' }, { value: 'Bid/RA', label: 'Bid/RA' }];
const YEAR_OPTIONS = [{ value: '', label: 'All Years' }, { value: '2024', label: '2024' }, { value: '2025', label: '2025' }, { value: '2026', label: '2026' }];
const MONTH_OPTIONS = [
  { value: '', label: 'All Months' },
  ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => ({ value: String(i + 1), label: m })),
];

const formatIndian = (v: number) => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

type SortKey = 'state' | 'month' | 'meril' | 'others' | 'total';
type SortDir = 'asc' | 'desc' | null;

// Clone of the automation site's "Carting Dashboard" (/orders/carting-dashboard)
// — filters + KPI cards + a sortable state/month pivot table, all Meril vs
// Others splits derived from contracts.meril_or_others (see
// backend/controllers/ordersController.js for why that replaces the
// original's `dealers`-table join, which was never migrated).
//
// The original rendered an India choropleth map here (react-simple-maps) —
// that library doesn't support React 19 (peer dep caps at 18), so the same
// state-level Meril/Others split is shown as a ranked bar chart instead via
// the already-installed recharts.
const CartingDashboardPage = () => {
  const [buyingMode, setBuyingMode] = useState('');
  const [dept, setDept] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [seller, setSeller] = useState('');
  const [state, setState] = useState('');
  const [category, setCategory] = useState('');

  const [sellers, setSellers] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [kpi, setKpi] = useState<{ total: number; meril: number; others: number } | null>(null);
  const [pivot, setPivot] = useState<{ state: string; month: string | null; total: number; meril: number; others: number }[]>([]);
  const [mapData, setMapData] = useState<{ state: string; total: number; meril: number; others: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<'pivot' | 'map' | null>(null);

  useEffect(() => {
    getCartingSellers().then((r) => setSellers(r.data)).catch(() => {});
    getCartingStates().then((r) => setStates(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    getCartingCategories(dept || undefined).then((r) => setCategories(r.data)).catch(() => {});
  }, [dept]);

  const filters = useMemo(() => ({ buyingMode, dept, month, year, seller, state, category }), [buyingMode, dept, month, year, seller, state, category]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getCartingKpi(filters), getCartingPivot(filters), getCartingMap(filters)])
      .then(([k, p, m]) => { setKpi(k.data); setPivot(p.data); setMapData(m.data); })
      .finally(() => setLoading(false));
  }, [filters]);

  const sellerOptions = useMemo(() => [{ value: '', label: 'All Sellers' }, ...sellers.map((s) => ({ value: s, label: s }))], [sellers]);
  const stateOptions = useMemo(() => [{ value: '', label: 'All States' }, ...states.map((s) => ({ value: s, label: s }))], [states]);
  const categoryOptions = useMemo(() => [{ value: '', label: 'All Categories' }, ...categories.map((c) => ({ value: c, label: c }))], [categories]);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('desc'); return; }
    setSortDir((prev) => (prev === 'desc' ? 'asc' : prev === 'asc' ? null : 'desc'));
  };

  const sortedPivot = useMemo(() => {
    if (!sortDir) return pivot;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...pivot].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [pivot, sortKey, sortDir]);

  const topStates = useMemo(() => mapData.slice(0, 12), [mapData]);

  const SortHeader = ({ label, sortK }: { label: string; sortK: SortKey }) => (
    <button onClick={() => toggleSort(sortK)} className="flex items-center gap-1 hover:text-gray-700">
      {label}
      {sortKey === sortK && sortDir === 'asc' && <ChevronUp size={12} />}
      {sortKey === sortK && sortDir === 'desc' && <ChevronDown size={12} />}
    </button>
  );

  usePageHeader('Endo & Diagno Carting Dashboard', 'Meril vs. Others carting split across states and months, from awarded GeM contract data.');

  return (
    <div className="space-y-5">

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-end gap-3">
        <Select wrapperClassName="w-36" value={buyingMode} onChange={(e) => setBuyingMode(e.target.value)} options={BUYING_MODE_OPTIONS} />
        <Select wrapperClassName="w-36" value={dept} onChange={(e) => setDept(e.target.value)} options={DEPT_OPTIONS} />
        <Select wrapperClassName="w-32" value={month} onChange={(e) => setMonth(e.target.value)} options={MONTH_OPTIONS} />
        <Select wrapperClassName="w-28" value={year} onChange={(e) => setYear(e.target.value)} options={YEAR_OPTIONS} />
        <SearchableSelect className="w-56" value={seller} onChange={setSeller} options={sellerOptions} placeholder="All Sellers" searchPlaceholder="Search sellers…" />
        <SearchableSelect className="w-48" value={state} onChange={setState} options={stateOptions} placeholder="All States" searchPlaceholder="Search states…" />
        <SearchableSelect className="w-56" value={category} onChange={setCategory} options={categoryOptions} placeholder="All Categories" searchPlaceholder="Search categories…" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Carting" value={loading || !kpi ? '…' : formatIndian(kpi.total)} icon={PackageCheck} accent="primary" />
        <StatCard label="Meril Carting" value={loading || !kpi ? '…' : formatIndian(kpi.meril)} icon={TrendingUp} accent="teal" />
        <StatCard label="Others Carting" value={loading || !kpi ? '…' : formatIndian(kpi.others)} icon={Users2} accent="amber" />
      </div>

      <div className={`grid gap-5 ${expanded ? 'grid-cols-1' : 'lg:grid-cols-2'}`}>
        {expanded !== 'map' && (
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-[13px] font-bold text-gray-900">State &amp; Month Pivot</h2>
              <button onClick={() => setExpanded((e) => (e === 'pivot' ? null : 'pivot'))} className="text-xs font-semibold text-primary-600 hover:underline">
                {expanded === 'pivot' ? 'Collapse' : 'Expand'}
              </button>
            </div>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5"><SortHeader label="State" sortK="state" /></th>
                    <th className="px-4 py-2.5"><SortHeader label="Month" sortK="month" /></th>
                    <th className="px-4 py-2.5"><SortHeader label="Meril" sortK="meril" /></th>
                    <th className="px-4 py-2.5"><SortHeader label="Others" sortK="others" /></th>
                    <th className="px-4 py-2.5"><SortHeader label="Total" sortK="total" /></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
                  ) : sortedPivot.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No data for these filters.</td></tr>
                  ) : (
                    sortedPivot.map((r, i) => (
                      <tr key={`${r.state}-${r.month}-${i}`} className="border-t border-gray-50">
                        <td className="px-4 py-2.5 text-gray-800">{r.state}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.month || 'N/A'}</td>
                        <td className="px-4 py-2.5 text-teal-700 font-semibold">{formatIndian(r.meril)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{formatIndian(r.others)}</td>
                        <td className="px-4 py-2.5 font-bold text-primary-700">{formatIndian(r.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {expanded !== 'pivot' && (
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5"><MapIcon size={14} /> Top States by Value</h2>
              <button onClick={() => setExpanded((e) => (e === 'map' ? null : 'map'))} className="text-xs font-semibold text-primary-600 hover:underline">
                {expanded === 'map' ? 'Collapse' : 'Expand'}
              </button>
            </div>
            <div className="px-4 pb-4" style={{ height: expanded === 'map' ? 520 : 380 }}>
              {loading ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">Loading…</div>
              ) : topStates.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">No data for these filters.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topStates} layout="vertical" margin={{ left: 24, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-gray-100)" />
                    <XAxis type="number" tickFormatter={(v) => formatIndian(v)} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="state" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatIndian(v)} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {topStates.map((_, i) => <Cell key={i} fill="var(--color-primary-600)" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartingDashboardPage;

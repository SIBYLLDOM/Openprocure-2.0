import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Search, Calendar, SlidersHorizontal, Building2 } from 'lucide-react';
import { getTenders, getTenderFilters, getTenderSubCategories } from '../../services/tenderApi';
import type { TenderRow } from '../../services/tenderApi';
import { Select, Pagination } from '../../components/ui';
import TenderRowCard from './TenderRowCard';
import { usePageHeader } from '../../context/PageHeaderContext';

const DIVISION_TABS = ['Both', 'Diagno', 'Endo'] as const;
const TENDER_TYPES = ['GEM', 'Open'] as const;
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];
const SORT_OPTIONS = [
  { value: '', label: 'Closing Soonest' },
  { value: 'endDateLatest', label: 'Closing Latest' },
  { value: 'startDateLatest', label: 'Start Date: Newest' },
  { value: 'startDateOldest', label: 'Start Date: Oldest' },
];

// Module-scoped caches — survive unmount/remount when the user flips
// between the Dashboard and Tenders nav items, so coming back to the same
// filters shows the last-known list instantly instead of a spinner every
// time. Still refetches quietly underneath to stay current.
const listCache = new Map<string, { data: TenderRow[]; total: number; source: 'gem' | 'open' }>();
let filtersCache: { states: string[]; departments: string[] } | null = null;
let subCatCache: string[] | null = null;

const TendersListPage = () => {
  const { name, id } = useParams();
  const base = `/${window.location.pathname.split('/')[1]}/${name}/${id}/tenders`;

  const [division, setDivision] = useState<(typeof DIVISION_TABS)[number]>('Both');
  const [tenderType, setTenderType] = useState<(typeof TENDER_TYPES)[number]>('GEM');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'closed' | 'all'>('active');
  const [state, setState] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [sort, setSort] = useState('');
  const [perfectCat, setPerfectCat] = useState<'perfect' | 'all'>('perfect');
  const [subCats, setSubCats] = useState<string[]>([]);
  const [closingFrom, setClosingFrom] = useState('');
  const [closingTo, setClosingTo] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const dept = division === 'Both' ? '' : division;
  const cacheKey = JSON.stringify({ page, search, status, state, dept, tenderType, departmentName, sort, perfectCat, subCats, closingFrom, closingTo });
  const initialCached = listCache.get(cacheKey);
  const [rows, setRows] = useState<TenderRow[]>(initialCached?.data ?? []);
  const [total, setTotal] = useState(initialCached?.total ?? 0);
  const [source, setSource] = useState<'gem' | 'open'>(initialCached?.source ?? 'gem');
  const [loading, setLoading] = useState(!initialCached);
  const [states, setStates] = useState<string[]>(filtersCache?.states ?? []);
  const [subCatOptions, setSubCatOptions] = useState<string[]>(subCatCache ?? []);

  useEffect(() => {
    getTenderFilters().then((r) => { filtersCache = { states: r.states, departments: r.departments }; setStates(r.states); }).catch(() => {});
    getTenderSubCategories().then((r) => { subCatCache = r.subCategories; setSubCatOptions(r.subCategories); }).catch(() => {});
  }, []);

  // Sub-categories and "Perfect Match" only make sense for GEM — Open tenders
  // don't carry that classification data.
  useEffect(() => { if (tenderType === 'Open') { setSubCats([]); setPerfectCat('perfect'); } }, [tenderType]);

  useEffect(() => {
    const cached = listCache.get(cacheKey);
    if (!cached) setLoading(true);
    const t = setTimeout(() => {
      getTenders({ page, limit: 20, search, status, state, dept, tenderType, departmentName, sort, perfectCat, subCat: subCats.join(','), closingFrom, closingTo })
        .then((r) => {
          listCache.set(cacheKey, { data: r.data, total: r.total, source: r.source });
          setRows(r.data);
          setTotal(r.total);
          setSource(r.source);
        })
        .finally(() => setLoading(false));
    }, cached ? 0 : 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, status, state, dept, tenderType, departmentName, sort, perfectCat, subCats, closingFrom, closingTo]);

  const toggleSubCat = (s: string) => { setPage(1); setSubCats((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])); };
  const isOpen = source === 'open';

  usePageHeader('Tenders', `${total.toLocaleString('en-IN')} tender${total === 1 ? '' : 's'} matching your filters.`);

  return (
    <div className="space-y-5">
      {/* Division tabs + tender-type toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {DIVISION_TABS.map((d) => (
            <button
              key={d}
              onClick={() => { setPage(1); setDivision(d); }}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${division === d ? 'bg-primary-950 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {TENDER_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => { setPage(1); setTenderType(t); }}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${tenderType === t ? 'bg-primary-950 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {t === 'GEM' ? 'GeM' : 'Open (CPPP)'}
            </button>
          ))}
        </div>
      </div>

      {/* Primary filter row */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Search by bid number, item, or department…"
            className="input w-full !pl-9"
          />
        </div>
        <Select wrapperClassName="w-36" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as any); }} options={STATUS_OPTIONS} />
        <Select wrapperClassName="w-44" value={state} onChange={(e) => { setPage(1); setState(e.target.value); }} options={[{ value: '', label: 'All States' }, ...states.map((s) => ({ value: s, label: s }))]} />
        <Select wrapperClassName="w-48" value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }} options={SORT_OPTIONS} />
        <button
          onClick={() => setShowMoreFilters((o) => !o)}
          className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2.5 rounded-lg border transition-colors ${showMoreFilters ? 'bg-primary-50 border-primary-200 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          <SlidersHorizontal size={14} /> More Filters
        </button>
      </div>

      {/* Expandable filter row */}
      {showMoreFilters && (
        <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={departmentName}
                onChange={(e) => { setPage(1); setDepartmentName(e.target.value); }}
                placeholder="Filter by organisation / department name…"
                className="input w-full !pl-9"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar size={14} className="text-gray-400" />
              Closing
              <input type="date" value={closingFrom} onChange={(e) => { setPage(1); setClosingFrom(e.target.value); }} className="input !w-auto !py-1.5" />
              <span>to</span>
              <input type="date" value={closingTo} onChange={(e) => { setPage(1); setClosingTo(e.target.value); }} className="input !w-auto !py-1.5" />
            </div>
            {!isOpen && (
              <div className="inline-flex rounded-lg border border-gray-200 p-1">
                {(['perfect', 'all'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPage(1); setPerfectCat(p); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${perfectCat === p ? 'bg-primary-950 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    {p === 'perfect' ? 'Perfect Match' : 'All Matches'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isOpen && subCatOptions.length > 0 && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Sub-Categories</label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {subCatOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleSubCat(s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${subCats.includes(s) ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">Loading tenders…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">No tenders match your filters.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((t, i) => (
            <TenderRowCard
              key={t.bid_number}
              tender={t}
              serialNumber={i + 1 + (page - 1) * 20}
              isOpen={isOpen}
              basePath={base}
              onMarkedNotRelevant={(bidNumber) => setRows((prev) => prev.filter((r) => r.bid_number !== bidNumber))}
            />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <Pagination page={page} totalItems={total} pageSize={20} onPageChange={setPage} />
      </div>
    </div>
  );
};

export default TendersListPage;

// src/pages/Tenders/TenderTracker.jsx
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Search, RefreshCw, AlertCircle, Loader2, DollarSign, FileSpreadsheet } from 'lucide-react';
import '../../assets/css/TenderTracker.css';

const CURRENCY_KEYS = new Set(['emdAmt', 'l1Price', 'l2Price', 'l3Price']);

// Fields with no source-of-truth table — the user fills these in by hand.
const EDITABLE_KEYS = new Set([
  'zh', 'flsp', 'dbHoDpNp', 'dbName', 'sapMaterialCode', 'emdAmt',
  'finalRemarks', 'zm', 'hoPerson', 'zone', 'feedbackResponse',
]);

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// Static dropdown option sets. ZH/FLSP options are dynamic (fetched from the field-team
// roster) and passed in separately since they depend on live data.
const SELECT_OPTIONS = {
  state: INDIAN_STATES,
  dbHoDpNp: ['DB', 'HO', 'DP', 'NP'],
  zone: ['NR', 'ER', 'WR', 'SR'],
};

const NO_REMARKS_VALUE = '__blank__';

const COLUMNS = [
  { key: 'sno', label: 'S.No' },
  { key: 'tenderNo', label: 'Tender No' },
  { key: 'fyYear', label: 'FY Year' },
  { key: 'state', label: 'State' },
  { key: 'zh', label: 'ZH' },
  { key: 'flsp', label: 'FLSP' },
  { key: 'location', label: 'Location' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'dbHoDpNp', label: 'DB/ HO/ DP/ NP' },
  { key: 'dbName', label: 'DB Name' },
  { key: 'sapMaterialCode', label: 'SAP Material Code' },
  { key: 'emdAmt', label: 'EMD Amt' },
  { key: 'l1Company', label: 'L1 Company Name' },
  { key: 'l1Price', label: 'L1 Quoted Price' },
  { key: 'l2Company', label: 'L2 Company Name' },
  { key: 'l2Price', label: 'L2 Quoted Price' },
  { key: 'l3Company', label: 'L3 Company Name' },
  { key: 'l3Price', label: 'L3 Quoted Price' },
  { key: 'finalRemarks', label: 'Final Remarks' },
  { key: 'zm', label: 'ZM' },
  { key: 'hoPerson', label: 'HO Person' },
  { key: 'zone', label: 'Zone (NR/ER/WR/SR)' },
  { key: 'feedbackResponse', label: 'Feedback Response - Strategy (July)' },
];

const formatCurrency = (value) => {
  const num = Number(value);
  if (!value || Number.isNaN(num)) return null;
  return `₹${num.toLocaleString('en-IN')}`;
};

const REMARK_TONE = {
  won: 'tone-success',
  award: 'tone-success',
  lost: 'tone-danger',
  disqualified: 'tone-danger',
  evaluation: 'tone-pending',
  'not evaluated': 'tone-pending',
};

const remarkTone = (value) => {
  if (!value) return '';
  const v = value.toLowerCase();
  const key = Object.keys(REMARK_TONE).find((k) => v.includes(k));
  return key ? REMARK_TONE[key] : '';
};

const PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 350;

const DEPT_OPTIONS = [
  { value: 'all', label: 'All Depts' },
  { value: 'endo', label: 'Endo' },
  { value: 'diagno', label: 'Diagno' },
];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'gem', label: 'GeM' },
  { value: 'open', label: 'Open' },
];

// Click-to-edit cell for fields with no backing source (ZH/FLSP correction, DB info,
// SAP code, EMD override, remarks, ZM/HO person, zone override, feedback strategy).
const EditableCell = memo(function EditableCell({ value, onSave, renderDisplay }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value || ''); }, [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value || '')) onSave(next);
  };

  const cancel = () => {
    setDraft(value || '');
    setEditing(false);
  };

  if (!editing) {
    return (
      <td className="editable-cell" onClick={() => setEditing(true)} title="Click to edit">
        {value ? (renderDisplay ? renderDisplay(value) : value) : <span className="editable-placeholder">+ Add</span>}
      </td>
    );
  }

  return (
    <td className="editable-cell editing">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
      />
    </td>
  );
});

// Select-type editable cell (DB/HO/DP/NP, Zone) needs its own options list per column.
const EditableSelectCell = memo(function EditableSelectCell({ value, onSave, options }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const selectRef = useRef(null);

  useEffect(() => { setDraft(value || ''); }, [value]);
  useEffect(() => {
    if (editing) selectRef.current?.focus();
  }, [editing]);

  const commit = (next) => {
    setEditing(false);
    if (next !== (value || '')) onSave(next);
  };

  if (!editing) {
    return (
      <td className="editable-cell" onClick={() => setEditing(true)} title="Click to edit">
        {value || <span className="editable-placeholder">+ Add</span>}
      </td>
    );
  }

  return (
    <td className="editable-cell editing">
      <select
        ref={selectRef}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
        onBlur={() => setEditing(false)}
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  );
});

const TenderRow = memo(function TenderRow({ row, onFieldSave, rosterOptions }) {
  return (
    <tr>
      {COLUMNS.map((col) => {
        if (col.key === 'sno') {
          return <td key={col.key} className="sno-cell">{row.sno}</td>;
        }
        if (col.key === 'tenderNo') {
          return (
            <td key={col.key} className="tender-no-cell">
              <span className={`source-badge source-${(row.source || '').toLowerCase()}`}>{row.source}</span>
              {row.tenderNo}
            </td>
          );
        }

        if (col.key === 'zh' || col.key === 'flsp') {
          return (
            <EditableSelectCell
              key={col.key}
              value={row[col.key]}
              options={rosterOptions[col.key]}
              onSave={(val) => onFieldSave(row.tenderNo, row.source, col.key, val)}
            />
          );
        }

        if (SELECT_OPTIONS[col.key]) {
          return (
            <EditableSelectCell
              key={col.key}
              value={row[col.key]}
              options={SELECT_OPTIONS[col.key]}
              onSave={(val) => onFieldSave(row.tenderNo, row.source, col.key, val)}
            />
          );
        }

        if (col.key === 'finalRemarks') {
          return (
            <EditableCell
              key={col.key}
              value={row.finalRemarks}
              onSave={(val) => onFieldSave(row.tenderNo, row.source, col.key, val)}
              renderDisplay={(val) => <span className={`remark-pill ${remarkTone(val)}`}>{val}</span>}
            />
          );
        }

        if (col.key === 'emdAmt') {
          return (
            <EditableCell
              key={col.key}
              value={row.emdAmt}
              onSave={(val) => onFieldSave(row.tenderNo, row.source, col.key, val)}
              renderDisplay={(val) => formatCurrency(val) || val}
            />
          );
        }

        if (EDITABLE_KEYS.has(col.key)) {
          return (
            <EditableCell
              key={col.key}
              value={row[col.key]}
              onSave={(val) => onFieldSave(row.tenderNo, row.source, col.key, val)}
            />
          );
        }

        if (CURRENCY_KEYS.has(col.key)) {
          const val = formatCurrency(row[col.key]);
          return <td key={col.key}>{val || <span className="empty-dash">—</span>}</td>;
        }
        const val = row[col.key];
        return <td key={col.key}>{val || <span className="empty-dash">—</span>}</td>;
      })}
    </tr>
  );
});

const SkeletonRow = ({ index }) => (
  <tr className="skeleton-row" style={{ animationDelay: `${index * 40}ms` }}>
    {COLUMNS.map((col) => (
      <td key={col.key}><span className="skeleton-bar" /></td>
    ))}
  </tr>
);

const TenderTracker = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  const token = () => localStorage.getItem('token');

  const [rows, setRows] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dept, setDept] = useState('all');
  const [source, setSource] = useState('all');
  const [onlyWithPricing, setOnlyWithPricing] = useState(false);
  const [remarksFilter, setRemarksFilter] = useState('');
  const [remarkOptions, setRemarkOptions] = useState([]);
  const [rosterOptions, setRosterOptions] = useState({ zh: [], flsp: [] });
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const sentinelRef = useRef(null);
  const requestIdRef = useRef(0);

  // Load the field-team roster (for ZH/FLSP dropdowns) and known Final Remarks values once.
  useEffect(() => {
    const authHeaders = { Authorization: `Bearer ${token()}` };

    fetch(`${API_BASE}/prebid/zone-members`, { headers: authHeaders })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return;
        const uniqSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
        setRosterOptions({
          zh: uniqSorted(data.members.filter((m) => m.role === 'Leader').map((m) => m.name)),
          flsp: uniqSorted(data.members.filter((m) => m.role === 'FLSP').map((m) => m.name)),
        });
      })
      .catch((e) => console.error('Error fetching field-team roster:', e));

    fetch(`${API_BASE}/tender-tracker/remark-options`, { headers: authHeaders })
      .then((r) => r.json())
      .then((data) => { if (data.success) setRemarkOptions(data.options || []); })
      .catch((e) => console.error('Error fetching remark options:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce free-text search so we're not firing a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchPage = useCallback(async (pageNum, isReset) => {
    const requestId = ++requestIdRef.current;
    if (isReset) setLoadingInitial(true);
    else setLoadingMore(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: pageNum,
        limit: PAGE_SIZE,
        dept,
        source,
        onlyWithPricing: onlyWithPricing ? 'true' : 'false',
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (remarksFilter) params.set('remarks', remarksFilter);

      const res = await fetch(`${API_BASE}/tender-tracker?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to load tender tracker data');
      }

      // A newer request (filter/search change) has already started — discard this stale response.
      if (requestId !== requestIdRef.current) return;

      setRows((prev) => (isReset ? (data.data || []) : [...prev, ...(data.data || [])]));
      setTotal(data.total || 0);
      setHasMore(pageNum < (data.totalPages || 1));
      setPage(pageNum);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching tender tracker:', e);
      setError(e.message || 'Failed to load tender tracker data');
      if (isReset) setRows([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingInitial(false);
        setLoadingMore(false);
      }
    }
  }, [API_BASE, dept, source, debouncedSearch, onlyWithPricing, remarksFilter]);

  // Reset and reload from page 1 whenever filters or the debounced search term change.
  useEffect(() => {
    setHasMore(true);
    fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept, source, debouncedSearch, onlyWithPricing, remarksFilter]);

  // Infinite scroll: observe a sentinel below the table and load the next page as it comes into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingInitial) {
          fetchPage(page + 1, false);
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadingInitial, page, fetchPage]);

  const [exporting, setExporting] = useState(false);

  // Export the currently-filtered view (not just the loaded rows) as an Excel workbook.
  const handleExport = useCallback(async () => {
    setExporting(true);
    setError('');
    try {
      const params = new URLSearchParams({ dept, source, onlyWithPricing: onlyWithPricing ? 'true' : 'false' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (remarksFilter) params.set('remarks', remarksFilter);

      const res = await fetch(`${API_BASE}/tender-tracker/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error('Failed to export tender tracker data');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tender_tracker_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error exporting tender tracker:', e);
      setError('Failed to export to Excel — please retry.');
    } finally {
      setExporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE, dept, source, debouncedSearch, onlyWithPricing, remarksFilter]);

  // Save a manually-entered/corrected field. Updates the row optimistically, then persists it.
  const handleFieldSave = useCallback(async (tenderNo, rowSource, field, value) => {
    setRows((prev) => prev.map((r) => (
      r.tenderNo === tenderNo && r.source === rowSource ? { ...r, [field]: value } : r
    )));

    try {
      const res = await fetch(`${API_BASE}/tender-tracker/override`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ tenderNo, source: rowSource, [field]: value }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save');
    } catch (e) {
      console.error('Error saving tender tracker field:', e);
      setError(`Failed to save your change for ${tenderNo} — please retry.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE]);

  return (
    <div className="tender-tracker-page">
      <div className="tender-tracker-header">
        <div>
          <h2>Tender Tracker</h2>
          <p className="tender-tracker-subtitle">
            {total > 0
              ? `${rows.length} of ${total} relevant tender${total === 1 ? '' : 's'} loaded`
              : 'Live view of relevant GeM and Open tenders'}
          </p>
        </div>

        <div className="tender-tracker-actions">
          <div className="tender-tracker-search">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search tender no, customer, state..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="tender-tracker-refresh"
            onClick={() => fetchPage(1, true)}
            title="Refresh"
          >
            <RefreshCw size={16} className={loadingInitial ? 'spin' : ''} />
          </button>
          <button
            type="button"
            className="tender-tracker-export"
            onClick={handleExport}
            disabled={exporting}
            title="Export the current filtered view to Excel"
          >
            {exporting ? <Loader2 size={16} className="spin" /> : <FileSpreadsheet size={16} />}
            {exporting ? 'Exporting...' : 'Export to Excel'}
          </button>
        </div>
      </div>

      <div className="tender-tracker-filters">
        <div className="filter-group">
          <span className="filter-group-label">Dept</span>
          <div className="filter-chip-row">
            {DEPT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`filter-chip ${dept === opt.value ? 'active' : ''}`}
                onClick={() => setDept(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Source</span>
          <div className="filter-chip-row">
            {SOURCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`filter-chip ${source === opt.value ? 'active' : ''}`}
                onClick={() => setSource(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Pricing</span>
          <div className="filter-chip-row">
            <button
              type="button"
              className={`filter-chip filter-chip-icon ${onlyWithPricing ? 'active' : ''}`}
              onClick={() => setOnlyWithPricing((v) => !v)}
              title="Show only tenders with L1/L2/L3 quoted price data"
            >
              <DollarSign size={13} /> L1/L2/L3 available
            </button>
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Final Remarks</span>
          <select
            className="filter-select"
            value={remarksFilter}
            onChange={(e) => setRemarksFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value={NO_REMARKS_VALUE}>Blank / Not set</option>
            {remarkOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="tender-tracker-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="tender-tracker-table-wrapper">
        <table className="tender-tracker-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingInitial ? (
              Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} index={i} />)
            ) : rows.length === 0 ? (
              <tr>
                <td className="state-cell" colSpan={COLUMNS.length}>No relevant tenders found for the selected filters.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <TenderRow
                  key={`${row.source}-${row.tenderNo}`}
                  row={row}
                  onFieldSave={handleFieldSave}
                  rosterOptions={rosterOptions}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loadingInitial && rows.length > 0 && (
        <div className="tender-tracker-scroll-status">
          {loadingMore ? (
            <span className="loading-more">
              <Loader2 size={16} className="spin" /> Loading more tenders...
            </span>
          ) : hasMore ? (
            <span className="scroll-hint">Scroll down for more</span>
          ) : (
            <span className="scroll-end">You've reached the end — all {total} tenders loaded</span>
          )}
        </div>
      )}

      <div ref={sentinelRef} className="tender-tracker-sentinel" />
    </div>
  );
};

export default TenderTracker;

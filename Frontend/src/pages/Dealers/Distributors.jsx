// src/pages/Dealers/Distributors.jsx
// Route: /dealers/distributors
// Data source: contracts WHERE meril_db = 'YES' — aggregated by seller_name

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

const API = import.meta.env.VITE_API_BASE_URL;
const token = () => localStorage.getItem('token');
const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  n == null || n === '' ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const fmtCr = (n) => {
  const v = parseFloat(n) || 0;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${fmt(v)}`;
};

const INDIAN_STATES = [
  'All States','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha',
  'Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Jammu and Kashmir','Chandigarh',
];

// ─── Main Component ────────────────────────────────────────────────────────────
const Distributors = () => {
  // ── Data states
  const [dealers, setDealers] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Search / filter states
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [filters, setFilters] = useState({
    state: 'All States',
    dept: 'All',
    category: '',
    dateFrom: '',
    dateTo: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);

  // ── Pagination & sort
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortBy, setSortBy] = useState('contract_count-desc');

  // ── Detail drawer
  const [drawerDealer, setDrawerDealer] = useState(null);
  const [drawerContracts, setDrawerContracts] = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const searchRef = useRef(null);
  const suggestTimer = useRef(null);

  // ── Fetch autocomplete suggestions
  useEffect(() => {
    clearTimeout(suggestTimer.current);
    if (searchInput.trim().length < 2) { setSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const r = await fetch(
          `${API}/contracts/dealers/suggestions?q=${encodeURIComponent(searchInput)}`,
          { headers: authHeaders() }
        );
        const d = await r.json();
        setSuggestions(d.success ? d.data : []);
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
      finally { setSuggestLoading(false); }
    }, 300);
  }, [searchInput]);

  // ── Debounce main search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(selectedSeller || searchInput);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, selectedSeller]);

  // ── Load categories
  useEffect(() => {
    const load = async () => {
      try {
        const p = filters.dept !== 'All' ? `?departmentType=${filters.dept}` : '';
        const r = await fetch(`${API}/contracts/meta/categories${p}`, { headers: authHeaders() });
        const d = await r.json();
        if (d.success) setCategoryOptions(d.data.map(x => x.value || x));
      } catch {}
    };
    load();
  }, [filters.dept]);

  // ── Build query params
  const buildParams = useCallback((extra = {}) => {
    const [sf, so] = sortBy.split('-');
    const p = new URLSearchParams({
      page: currentPage,
      limit: rowsPerPage,
      sortBy: sf,
      sortOrder: so || 'desc',
      ...extra,
    });
    if (debouncedSearch) p.append('sellerName', debouncedSearch);
    if (filters.state !== 'All States') p.append('state', filters.state);
    if (filters.dept !== 'All') p.append('dept', filters.dept);
    if (filters.category) p.append('category', filters.category);
    if (filters.dateFrom) p.append('dateFrom', filters.dateFrom);
    if (filters.dateTo) p.append('dateTo', filters.dateTo);
    return p;
  }, [currentPage, rowsPerPage, sortBy, debouncedSearch, filters]);

  // ── Fetch dealers list
  useEffect(() => {
    const fetch_ = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `${API}/contracts/dealers?${buildParams()}`,
          { headers: authHeaders() }
        );
        const d = await r.json();
        if (d.success) {
          setDealers(d.data);
          setTotalRecords(d.total || 0);
          setTotalPages(d.totalPages || 1);
        } else {
          setError(d.message || 'Failed to load dealers');
        }
      } catch {
        setError('Network error — could not load dealers');
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [buildParams]);

  // ── Open detail drawer
  const openDrawer = async (dealer) => {
    setDrawerDealer(dealer);
    setDrawerContracts([]);
    setDrawerLoading(true);
    try {
      const p = new URLSearchParams({ seller_name: dealer.seller_name, limit: 100 });
      const r = await fetch(`${API}/contracts?${p}`, { headers: authHeaders() });
      const d = await r.json();
      if (d.success) setDrawerContracts(d.data);
    } catch {}
    setDrawerLoading(false);
  };

  // ── Export
  const handleExport = () => {
    const rows = dealers.map((d, i) => ({
      '#': i + 1,
      'Seller Name': d.seller_name,
      'State': d.seller_state || '—',
      'Location': d.seller_location || '—',
      'Contact': d.seller_contact_no || '—',
      'Contracts': d.contract_count,
      'Total Value': d.total_value,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dealers');
    XLSX.writeFile(wb, `meril_dealers_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── Suggestion select
  const selectSuggestion = (name) => {
    setSearchInput(name);
    setSelectedSeller(name);
    setShowSuggestions(false);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSelectedSeller('');
    setSuggestions([]);
    setShowSuggestions(false);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({ state: 'All States', dept: 'All', category: '', dateFrom: '', dateTo: '' });
    setCurrentPage(1);
  };

  const activeFilterCount = [
    filters.state !== 'All States',
    filters.dept !== 'All',
    !!filters.category,
    !!filters.dateFrom || !!filters.dateTo,
  ].filter(Boolean).length;

  // ── Pagination helpers
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) pages.push(i);
    else if (Math.abs(i - currentPage) === 2) pages.push('…');
  }
  const dedupPages = pages.filter((v, i, a) => a[i - 1] !== v);

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {/* ── Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Dealer Management</h1>
          <p style={s.subtitle}>
            Manage and view all registered dealers, distributors, and contract details
          </p>
        </div>
        <div style={s.headerActions}>
          <button style={s.btnOutline} onClick={handleExport}>
            <span>📊</span> Export Excel
          </button>
        </div>
      </div>

      {/* ── Search bar with autocomplete */}
      <div style={s.searchCard}>
        <div style={s.searchWrap} ref={searchRef}>
          <span style={s.searchIcon}>🔍</span>
          <input
            style={s.searchInput}
            type="text"
            placeholder="Search dealer name… (e.g. Medi Era)"
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); setSelectedSeller(''); }}
            onFocus={() => suggestions.length && setShowSuggestions(true)}
            autoComplete="off"
            id="dealer-search"
          />
          {suggestLoading && <span style={s.spinnerInline}>⏳</span>}
          {searchInput && (
            <button style={s.clearBtn} onClick={clearSearch} title="Clear search">✕</button>
          )}

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <ul style={s.suggestions}>
              {suggestions.map((s_, i) => (
                <li
                  key={i}
                  style={s.suggestionItem}
                  onMouseDown={() => selectSuggestion(s_)}
                >
                  <span style={s.suggIcon}>🏢</span>
                  <span>{s_}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Filter toggle */}
        <button
          style={{ ...s.btnOutline, position: 'relative', gap: 6 }}
          onClick={() => setShowFilters(v => !v)}
        >
          ⚙️ Filters
          {activeFilterCount > 0 && (
            <span style={s.filterBadge}>{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* ── Filter panel */}
      {showFilters && (
        <div style={s.filterPanel}>
          <div style={s.filterGrid}>
            <div style={s.filterField}>
              <label style={s.filterLabel}>State</label>
              <select style={s.filterSelect} value={filters.state}
                onChange={e => { setFilters(f => ({ ...f, state: e.target.value })); setCurrentPage(1); }}>
                {INDIAN_STATES.map(st => <option key={st}>{st}</option>)}
              </select>
            </div>
            <div style={s.filterField}>
              <label style={s.filterLabel}>Department</label>
              <select style={s.filterSelect} value={filters.dept}
                onChange={e => { setFilters(f => ({ ...f, dept: e.target.value, category: '' })); setCurrentPage(1); }}>
                <option value="All">All</option>
                <option value="diagno">Diagno</option>
                <option value="endo">Endo</option>
              </select>
            </div>
            <div style={s.filterField}>
              <label style={s.filterLabel}>Category</label>
              <select style={s.filterSelect} value={filters.category}
                onChange={e => { setFilters(f => ({ ...f, category: e.target.value })); setCurrentPage(1); }}>
                <option value="">All Categories</option>
                {categoryOptions.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={s.filterField}>
              <label style={s.filterLabel}>Contract Date From</label>
              <input type="date" style={s.filterSelect} value={filters.dateFrom}
                onChange={e => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setCurrentPage(1); }} />
            </div>
            <div style={s.filterField}>
              <label style={s.filterLabel}>Contract Date To</label>
              <input type="date" style={s.filterSelect} value={filters.dateTo}
                onChange={e => { setFilters(f => ({ ...f, dateTo: e.target.value })); setCurrentPage(1); }} />
            </div>
            <div style={{ ...s.filterField, justifyContent: 'flex-end', alignItems: 'flex-end', display: 'flex' }}>
              <button style={s.clearFiltersBtn} onClick={clearFilters}>Clear Filters</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats bar */}
      <div style={s.statsBar}>
        <span style={s.statItem}>
          <strong>{totalRecords.toLocaleString()}</strong> dealers found
        </span>
        <div style={s.tableControls}>
          <select style={s.controlSelect} value={rowsPerPage}
            onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>Show {n}</option>)}
          </select>
          <select style={s.controlSelect} value={sortBy}
            onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}>
            <option value="contract_count-desc">Most Contracts ↓</option>
            <option value="contract_count-asc">Least Contracts ↑</option>
            <option value="total_value-desc">Highest Value ↓</option>
            <option value="total_value-asc">Lowest Value ↑</option>
            <option value="seller_name-asc">Name A–Z</option>
            <option value="seller_name-desc">Name Z–A</option>
          </select>
        </div>
      </div>

      {/* ── Table */}
      <div style={s.tableCard}>
        {error ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            <div style={{ color: '#dc2626', fontWeight: 600 }}>{error}</div>
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
              The <code>/api/contracts/dealers</code> endpoint may not exist yet — see instructions below.
            </div>
          </div>
        ) : loading ? (
          <div style={s.emptyState}>
            <div style={s.spinner} />
            <div style={{ color: '#6b7280', marginTop: 12 }}>Loading dealers…</div>
          </div>
        ) : dealers.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 600, color: '#374151' }}>No dealers found</div>
            <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
              Try a different search or clear the filters
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['#', 'Dealer / Seller Name', 'State', 'Location', 'Contact No.', 'Contracts', 'Total Value', 'Dept', 'Action'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dealers.map((d, i) => (
                  <tr key={i} style={s.tr} onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#f9fafb'}>
                    <td style={{ ...s.td, color: '#9ca3af', width: 40 }}>
                      {(currentPage - 1) * rowsPerPage + i + 1}
                    </td>
                    <td style={{ ...s.td, minWidth: 220 }}>
                      <div style={s.dealerName}>{d.seller_name || '—'}</div>
                      {d.seller_email && (
                        <div style={s.dealerSub}>{d.seller_email}</div>
                      )}
                    </td>
                    <td style={s.td}>
                      <span style={s.statePill}>{d.seller_state || '—'}</span>
                    </td>
                    <td style={{ ...s.td, color: '#4b5563', fontSize: 12 }}>{d.seller_location || '—'}</td>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{d.seller_contact_no || '—'}</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <span style={s.contractCount}>{d.contract_count}</span>
                    </td>
                    <td style={{ ...s.td, fontWeight: 600, color: '#065f46' }}>
                      {fmtCr(d.total_value)}
                    </td>
                    <td style={s.td}>
                      <span style={d.dept === 'endo' ? s.pillEndo : s.pillDiagno}>
                        {d.dept === 'endo' ? 'Endo' : 'Diagno'}
                      </span>
                    </td>
                    <td style={s.td}>
                      <button style={s.viewBtn} onClick={() => openDrawer(d)}>
                        View Contracts
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div style={s.pagination}>
          <span style={{ color: '#6b7280', fontSize: 13 }}>
            Page {currentPage} of {totalPages} · {totalRecords.toLocaleString()} dealers
          </span>
          <div style={s.paginationBtns}>
            <button style={s.pageBtn} disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>← Prev</button>
            {dedupPages.map((p, i) =>
              p === '…' ? (
                <span key={`ellipsis-${i}`} style={{ padding: '0 4px', color: '#9ca3af' }}>…</span>
              ) : (
                <button key={p} style={p === currentPage ? s.pageBtnActive : s.pageBtn}
                  onClick={() => setCurrentPage(p)}>{p}</button>
              )
            )}
            <button style={s.pageBtn} disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Detail Drawer */}
      {drawerDealer && (
        <div style={s.overlay} onClick={() => setDrawerDealer(null)}>
          <div style={s.drawer} onClick={e => e.stopPropagation()}>
            {/* Drawer header */}
            <div style={s.drawerHeader}>
              <div>
                <div style={s.drawerTitle}>{drawerDealer.seller_name}</div>
                <div style={s.drawerSub}>
                  {[drawerDealer.seller_location, drawerDealer.seller_state].filter(Boolean).join(', ')} ·{' '}
                  {drawerDealer.seller_contact_no || 'No contact'}
                </div>
              </div>
              <button style={s.closeBtn} onClick={() => setDrawerDealer(null)}>✕</button>
            </div>

            {/* KPI row */}
            <div style={s.kpiRow}>
              <div style={s.kpiCard}>
                <div style={s.kpiLabel}>Total Contracts</div>
                <div style={s.kpiValue}>{drawerDealer.contract_count}</div>
              </div>
              <div style={s.kpiCard}>
                <div style={s.kpiLabel}>Total Value</div>
                <div style={{ ...s.kpiValue, color: '#065f46' }}>{fmtCr(drawerDealer.total_value)}</div>
              </div>
              <div style={s.kpiCard}>
                <div style={s.kpiLabel}>State</div>
                <div style={s.kpiValue}>{drawerDealer.seller_state || '—'}</div>
              </div>
              <div style={s.kpiCard}>
                <div style={s.kpiLabel}>Department</div>
                <div style={s.kpiValue}>{drawerDealer.dept === 'endo' ? 'Endo' : 'Diagno'}</div>
              </div>
            </div>

            {/* Contracts list */}
            <div style={s.drawerBody}>
              <div style={s.drawerSectionTitle}>All Contracts</div>
              {drawerLoading ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>Loading…</div>
              ) : drawerContracts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>No contracts found</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ ...s.table, fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['#', 'Contract No', 'Date', 'Hospital', 'State', 'Category', 'Product', 'Qty', 'Value', 'Status'].map(h => (
                          <th key={h} style={{ ...s.th, fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {drawerContracts.map((c, i) => (
                        <tr key={c.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                          <td style={{ ...s.td, color: '#9ca3af', fontSize: 11 }}>{i + 1}</td>
                          <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                            {c.contract_no || '—'}
                          </td>
                          <td style={{ ...s.td, whiteSpace: 'nowrap', fontSize: 11 }}>{c.contract_date || '—'}</td>
                          <td style={{ ...s.td, minWidth: 140, fontSize: 11 }}>{c.hospital_name || c.organization_name || '—'}</td>
                          <td style={{ ...s.td, fontSize: 11 }}>{c.hospital_state || '—'}</td>
                          <td style={{ ...s.td, fontSize: 11 }}>{c.category_name || '—'}</td>
                          <td style={{ ...s.td, maxWidth: 160, fontSize: 11 }}>{c.product || '—'}</td>
                          <td style={{ ...s.td, textAlign: 'right', fontSize: 11 }}>{c.ordered_quantity || '—'}</td>
                          <td style={{ ...s.td, fontWeight: 600, color: '#065f46', whiteSpace: 'nowrap', fontSize: 11 }}>
                            {fmtCr(c.total_value)}
                          </td>
                          <td style={s.td}>
                            <span style={c.order_status === 'Completed' ? s.pillActive : s.pillPending}>
                              {c.order_status || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page: { padding: '0', fontFamily: "'Inter', 'Segoe UI', sans-serif", color: '#111827' },

  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 20, flexWrap: 'wrap', gap: 12,
  },
  h1: { fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 },
  subtitle: { fontSize: 13, color: '#6b7280', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 6 },
  badge: { background: '#dcfce7', color: '#166534', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid #bbf7d0' },
  headerActions: { display: 'flex', gap: 8 },

  btnOutline: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db',
    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
    transition: 'all 0.15s',
  },

  searchCard: {
    display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center',
  },
  searchWrap: {
    flex: 1, position: 'relative', display: 'flex', alignItems: 'center',
    background: '#fff', border: '1.5px solid #d1d5db', borderRadius: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  searchIcon: { padding: '0 10px', fontSize: 16, color: '#9ca3af', flexShrink: 0 },
  searchInput: {
    flex: 1, border: 'none', outline: 'none', fontSize: 14, padding: '11px 0',
    background: 'transparent', color: '#111827',
  },
  spinnerInline: { padding: '0 10px', fontSize: 14 },
  clearBtn: {
    padding: '0 12px', background: 'none', border: 'none', cursor: 'pointer',
    color: '#9ca3af', fontSize: 14, flexShrink: 0,
  },
  suggestions: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, listStyle: 'none',
    margin: 0, padding: '4px 0', maxHeight: 240, overflowY: 'auto',
  },
  suggestionItem: {
    padding: '10px 14px', cursor: 'pointer', fontSize: 13, color: '#111827',
    display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s',
  },
  suggIcon: { fontSize: 14 },

  filterPanel: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
    padding: '16px 20px', marginBottom: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 },
  filterField: { display: 'flex', flexDirection: 'column', gap: 4 },
  filterLabel: { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  filterSelect: {
    padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7,
    fontSize: 13, outline: 'none', background: '#fff', color: '#111827',
  },
  filterBadge: {
    position: 'absolute', top: -6, right: -6,
    background: '#084f9a', color: '#fff', borderRadius: 10,
    fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: '16px',
  },
  clearFiltersBtn: {
    padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db',
    borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#6b7280',
  },

  statsBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10, flexWrap: 'wrap', gap: 8,
  },
  statItem: { fontSize: 13, color: '#6b7280' },
  tableControls: { display: 'flex', gap: 8 },
  controlSelect: {
    padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 7,
    fontSize: 12, background: '#fff', color: '#374151', outline: 'none',
  },

  tableCard: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 16,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5,
    background: '#f8fafc', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
  },
  td: { padding: '12px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' },
  tr: { transition: 'background 0.1s', cursor: 'default' },

  dealerName: { fontWeight: 600, color: '#111827', fontSize: 13 },
  dealerSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  statePill: {
    display: 'inline-block', padding: '3px 8px', background: '#eff6ff',
    color: '#1d4ed8', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
  },
  contractCount: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: '#f0f9ff', color: '#0369a1', borderRadius: 20,
    fontSize: 12, fontWeight: 700, padding: '2px 10px', border: '1px solid #bae6fd',
  },
  pillEndo: { background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  pillDiagno: { background: '#f3e8ff', color: '#6b21a8', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  pillActive: { background: '#dcfce7', color: '#166534', padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  pillPending: { background: '#fef9c3', color: '#854d0e', padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 600 },

  viewBtn: {
    padding: '5px 12px', background: '#084f9a', color: '#fff', border: 'none',
    borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  emptyState: {
    textAlign: 'center', padding: '60px 20px', color: '#6b7280',
  },
  spinner: {
    width: 32, height: 32, border: '3px solid #e5e7eb',
    borderTop: '3px solid #084f9a', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', margin: '0 auto',
  },

  pagination: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: 8,
  },
  paginationBtns: { display: 'flex', gap: 4, alignItems: 'center' },
  pageBtn: {
    padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6,
    background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151',
  },
  pageBtnActive: {
    padding: '6px 12px', border: '1px solid #084f9a', borderRadius: 6,
    background: '#084f9a', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 700,
  },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
    display: 'flex', justifyContent: 'flex-end',
  },
  drawer: {
    width: '75vw', maxWidth: 960, height: '100vh', background: '#fff',
    display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
  },
  drawerHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 24px', background: '#084f9a', flexShrink: 0,
  },
  drawerTitle: { fontSize: 17, fontWeight: 700, color: '#fff' },
  drawerSub: { fontSize: 12, color: '#bfdbfe', marginTop: 4 },
  closeBtn: { background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' },

  kpiRow: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 0, borderBottom: '1px solid #e5e7eb', flexShrink: 0,
  },
  kpiCard: { padding: '14px 20px', borderRight: '1px solid #e5e7eb' },
  kpiLabel: { fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 18, fontWeight: 700, color: '#111827', marginTop: 4 },

  drawerBody: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
  drawerSectionTitle: { fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
};

export default Distributors;
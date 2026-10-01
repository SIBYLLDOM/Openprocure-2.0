import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import "../../assets/css/CompareBidders.css";

const fmt = (n) => "₹ " + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pct = (n) => (Number(n) || 0).toFixed(1) + "%";
const diff = (a, b) => b ? ((a - b) / b) * 100 : 0;

/* ── Text highlight ── */
const Hl = ({ text = "", q = "" }) => {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="dc-hl">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
};

/* ══ Reusable Paginator component ══
   Shows: « Prev  [1] [2] [3]  Next »
   Always shows up to 3 page buttons centred around current page.
*/
const PAGE_SIZE = 10;

const Paginator = ({ total, page, onPage }) => {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;

  /* build window of 3 pages around current */
  let start = Math.max(1, page - 1);
  let end = Math.min(totalPages, start + 2);
  if (end - start < 2) start = Math.max(1, end - 2);
  const pages = [];
  for (let p = start; p <= end; p++) pages.push(p);

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="dc-pg-bar">
      <span className="dc-pg-info">{from}–{to} of {total}</span>
      <div className="dc-pg-controls">
        <button className="dc-pg-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>
          ← Prev
        </button>
        {start > 1 && <span className="dc-pg-ellipsis">…</span>}
        {pages.map(p => (
          <button
            key={p}
            className={`dc-pg-btn dc-pg-num${p === page ? " dc-pg-active" : ""}`}
            onClick={() => onPage(p)}
          >{p}</button>
        ))}
        {end < totalPages && <span className="dc-pg-ellipsis">…</span>}
        <button className="dc-pg-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages}>
          Next →
        </button>
      </div>
    </div>
  );
};

/* ══ Searchable Dropdown ══ */
const DCDropdown = ({ sellers, value, onChange, placeholder, accentClass }) => {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const rootRef = useRef(null);

  const filtered = useMemo(
    () => q.trim() ? sellers.filter(s => s.toLowerCase().includes(q.toLowerCase())) : sellers,
    [q, sellers]
  );
  useEffect(() => { setQ(value || ""); }, [value]);
  useEffect(() => {
    const h = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) { setOpen(false); setQ(value || ""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [value]);
  useEffect(() => { if (idx >= 0 && listRef.current) listRef.current.children[idx]?.scrollIntoView({ block: "nearest" }); }, [idx]);

  const select = useCallback((name) => { onChange(name); setQ(name); setOpen(false); setIdx(-1); }, [onChange]);

  const onKey = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); setIdx(0); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (idx >= 0 && filtered[idx]) select(filtered[idx]); }
    else if (e.key === "Escape") { setOpen(false); setQ(value || ""); inputRef.current?.blur(); }
  };

  return (
    <div className={`dc-dd-root ${accentClass || ""}`} ref={rootRef}>
      <div className={`dc-dd-wrap${open ? " dc-dd-open" : ""}`}>
        <svg className="dc-dd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" />
        </svg>
        <input ref={inputRef} className="dc-dd-input" type="text" placeholder={placeholder} value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); setIdx(0); }}
          onFocus={() => { setOpen(true); setIdx(0); }} onKeyDown={onKey} autoComplete="off" />
        {q && <button className="dc-dd-clear" onClick={() => { setQ(""); setOpen(true); inputRef.current?.focus(); }} tabIndex={-1}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>}
        <svg className={`dc-dd-chev${open ? " dc-dd-chev-up" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          onClick={() => { setOpen(o => !o); inputRef.current?.focus(); }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <ul className="dc-dd-list" ref={listRef} role="listbox">
          {filtered.length === 0
            ? <li className="dc-dd-empty">No results for "<strong>{q}</strong>"</li>
            : filtered.map((name, i) => (
              <li key={name} className={`dc-dd-item${name === value ? " dc-dd-sel" : ""}${i === idx ? " dc-dd-hov" : ""}`}
                onMouseEnter={() => setIdx(i)} onMouseDown={e => { e.preventDefault(); select(name); }}>
                <span className="dc-dd-text"><Hl text={name} q={q === value ? "" : q} /></span>
                {name === value && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════ */
const DocumentsComparison = () => {
  const [sellers, setSellers] = useState([]);
  const [selA, setSelA] = useState("");
  const [selB, setSelB] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sellLoad, setSellLoad] = useState(true);
  const [error, setError] = useState(null);
  const [compared, setCompared] = useState(false);

  /* pagination state — resets when new comparison loaded */
  const [statePage, setStatePage] = useState(1);
  const [contractPage, setContractPage] = useState(1);
  const [pricePage, setPricePage] = useState(1);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL}/competitors/list`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(r => r.json())
      .then(j => setSellers(j.data || []))
      .catch(() => setError("Cannot connect to server. Check backend is running."))
      .finally(() => setSellLoad(false));
  }, []);

  const same = selA && selB && selA === selB;
  const canCompare = selA && selB && !same;

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true); setError(null); setData(null); setCompared(false);
    setStatePage(1); setContractPage(1); setPricePage(1);   // reset pages on new comparison
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/competitors/compare-detailed?seller1=${encodeURIComponent(selA)}&seller2=${encodeURIComponent(selB)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load comparison data.");
      setData(json); setCompared(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  /* paginated slices */
  const stateSlice = useMemo(() => (data?.stateComparison || []).slice((statePage - 1) * PAGE_SIZE, statePage * PAGE_SIZE), [data, statePage]);
  const contractSlice = useMemo(() => (data?.recentContracts || []).slice((contractPage - 1) * PAGE_SIZE, contractPage * PAGE_SIZE), [data, contractPage]);
  const priceSlice = useMemo(() => (data?.priceComparison || []).slice((pricePage - 1) * PAGE_SIZE, pricePage * PAGE_SIZE), [data, pricePage]);

  return (
    <div className="dc-page">

      {/* ── Header ── */}
      <div className="dc-header">
        <div className="dc-header-inner">
          <div>
            <h1 className="dc-title">Competitor Documents Comparison</h1>
            <p className="dc-subtitle">Strategic intelligence · Select two competitors to begin head-to-head analysis</p>
          </div>
          {compared && data && (
            <div className="dc-versus-badge">
              <span className="dc-vs-name dc-vs-a">{data.seller1.name}</span>
              <span className="dc-vs-label">VS</span>
              <span className="dc-vs-name dc-vs-b">{data.seller2.name}</span>
            </div>
          )}
        </div>
      </div>

      <div className="dc-body">

        {/* ── Selection ── */}
        <div className="dc-select-section">
          {sellLoad ? <div className="dc-dd-skeleton" /> : (
            <div className="dc-select-grid">
              <div className="dc-select-slot dc-slot-a">
                <div className="dc-slot-stripe dc-stripe-a" />
                <div className="dc-slot-content">
                  <div className="dc-slot-label"><span className="dc-slot-badge dc-badge-a-tag">A</span>Competitor A</div>
                  <DCDropdown sellers={sellers} value={selA} onChange={setSelA} placeholder="Search Competitor A…" accentClass="dc-accent-a" />
                </div>
              </div>
              <div className="dc-select-center"><div className="dc-vs-circle">VS</div></div>
              <div className="dc-select-slot dc-slot-b">
                <div className="dc-slot-stripe dc-stripe-b" />
                <div className="dc-slot-content">
                  <div className="dc-slot-label"><span className="dc-slot-badge dc-badge-b-tag">B</span>Competitor B</div>
                  <DCDropdown sellers={sellers} value={selB} onChange={setSelB} placeholder="Search Competitor B…" accentClass="dc-accent-b" />
                </div>
              </div>
            </div>
          )}
          {same && <div className="dc-validation-msg">⚠️ Please select two <strong>different</strong> competitors to compare.</div>}
          <div className="dc-compare-btn-row">
            <button className={`dc-compare-btn${!canCompare || loading ? " dc-btn-disabled" : ""}`} onClick={handleCompare} disabled={!canCompare || loading}>
              {loading
                ? <><span className="dc-btn-spinner" /> Analyzing…</>
                : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> Run Comparison</>
              }
            </button>
            {!canCompare && !same && <span className="dc-btn-hint">Select both competitors to enable comparison</span>}
          </div>
        </div>

        {/* ── Error ── */}
        {error && <div className="dc-error-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          {error}
        </div>}

        {/* ── Loading ── */}
        {loading && <div className="dc-loading-state"><div className="dc-loader-orb" /><p>Running analysis…</p></div>}

        {/* ── Empty ── */}
        {!loading && !compared && !error && (
          <div className="dc-empty-state">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#c7d2fe" strokeWidth="1.5"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            <p className="dc-empty-title">No analysis yet</p>
            <p className="dc-empty-sub">Select two competitors above and click <strong>Run Comparison</strong></p>
          </div>
        )}

        {/* ══ Results ══ */}
        {compared && data && (
          <div className="dc-results">

            {/* Legend */}
            <div className="dc-legend">
              <span className="dc-legend-dot dc-dot-a" /><span className="dc-legend-name">{data.seller1.name}</span>
              <span className="dc-legend-sep">|</span>
              <span className="dc-legend-dot dc-dot-b" /><span className="dc-legend-name">{data.seller2.name}</span>
            </div>

            {/* ── KPI Battle ── */}
            <div className="dc-section">
              <div className="dc-section-title">Performance Overview</div>
              <div className="dc-kpi-grid">
                {[
                  { label: "Total Contracts", a: data.seller1.totalContracts, b: data.seller2.totalContracts, format: n => Number(n).toLocaleString("en-IN") },
                  { label: "Total Revenue", a: data.seller1.totalRevenue, b: data.seller2.totalRevenue, format: fmt },
                  { label: "Avg Contract Value", a: data.seller1.avgValue, b: data.seller2.avgValue, format: fmt },
                  { label: "Direct Supply %", a: data.seller1.directPercent, b: data.seller2.directPercent, format: pct },
                ].map(({ label, a, b, format }) => {
                  const aW = a >= b; const bW = b >= a;
                  const leader = a > b ? "A" : b > a ? "B" : null;
                  return (
                    <div className="dc-kpi-card" key={label}>
                      <div className="dc-kpi-label">{label}</div>
                      <div className="dc-kpi-row">
                        <div className={`dc-kpi-side dc-side-a${aW ? " dc-winner" : " dc-loser"}`}>
                          <span className="dc-kpi-tag">A</span><span className="dc-kpi-val">{format(a)}</span>
                        </div>
                        <span className="dc-kpi-vs">VS</span>
                        <div className={`dc-kpi-side dc-side-b${bW ? " dc-winner" : " dc-loser"}`}>
                          <span className="dc-kpi-tag">B</span><span className="dc-kpi-val">{format(b)}</span>
                        </div>
                      </div>
                      {leader && <div className={`dc-kpi-badge dc-badge-${leader.toLowerCase()}`}>
                        {leader === "A" ? data.seller1.name.split(" ")[0] : data.seller2.name.split(" ")[0]} leads
                      </div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Price Comparison ── */}
            <div className="dc-section">
              <div className="dc-section-title">Product-Level Price Comparison</div>
              <div className="dc-card">
                <div className="dc-card-header">
                  <span className="dc-card-title">Avg Unit Price — Shared Products</span>
                  <span className="dc-card-sub">{data.priceComparison.length} products</span>
                </div>
                <div className="dc-table-wrap">
                  <table className="dc-table">
                    <thead><tr>
                      <th>Product</th><th>Brand</th>
                      <th><span className="dc-th-badge dc-th-a">A</span> {data.seller1.name.split(" ")[0]}</th>
                      <th><span className="dc-th-badge dc-th-b">B</span> {data.seller2.name.split(" ")[0]}</th>
                      <th>Δ Difference</th>
                    </tr></thead>
                    <tbody>
                      {data.priceComparison.length === 0
                        ? <tr><td colSpan={5} className="dc-td-empty">No products found</td></tr>
                        : priceSlice.map((row, i) => {
                          const d = diff(row.seller1_avg_price, row.seller2_avg_price);
                          return (
                            <tr key={i}>
                              <td className="dc-td-bold">{row.product}</td>
                              <td>{row.brand}</td>
                              <td className="dc-mono">{fmt(row.seller1_avg_price)}</td>
                              <td className="dc-mono">{fmt(row.seller2_avg_price)}</td>
                              <td><span className={`dc-diff-pill${d < 0 ? " dc-diff-green" : " dc-diff-red"}`}>{d < 0 ? "▼" : "▲"} {Math.abs(d).toFixed(1)}%</span></td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <Paginator total={data.priceComparison.length} page={pricePage} onPage={setPricePage} />
              </div>
            </div>

            {/* ── State Penetration + Recent Contracts ── */}
            <div className="dc-two-col">

              {/* State Penetration — paginated */}
              <div className="dc-card">
                <div className="dc-card-header">
                  <span className="dc-card-title">State Penetration</span>
                  <span className="dc-card-sub">{data.stateComparison.length} states</span>
                </div>
                <div className="dc-table-wrap">
                  <table className="dc-table">
                    <thead><tr>
                      <th>State</th>
                      <th><span className="dc-th-badge dc-th-a">A</span> Revenue</th>
                      <th><span className="dc-th-badge dc-th-b">B</span> Revenue</th>
                    </tr></thead>
                    <tbody>
                      {data.stateComparison.length === 0
                        ? <tr><td colSpan={3} className="dc-td-empty">No state data</td></tr>
                        : stateSlice.map((row, i) => {
                          const aW = row.seller1_revenue >= row.seller2_revenue;
                          return (
                            <tr key={i}>
                              <td className="dc-td-bold">{row.state}</td>
                              <td className={aW ? "dc-cell-win" : ""}>{fmt(row.seller1_revenue)}</td>
                              <td className={!aW ? "dc-cell-win" : ""}>{fmt(row.seller2_revenue)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <Paginator total={data.stateComparison.length} page={statePage} onPage={setStatePage} />
              </div>

              {/* Recent Contracts — paginated */}
              <div className="dc-card">
                <div className="dc-card-header">
                  <span className="dc-card-title">Recent Contracts</span>
                  <span className="dc-card-sub">Latest {data.recentContracts.length} orders</span>
                </div>
                <div className="dc-table-wrap">
                  <table className="dc-table">
                    <thead><tr><th>Seller</th><th>State</th><th>Brand</th><th>Total Value</th><th>Date</th></tr></thead>
                    <tbody>
                      {data.recentContracts.length === 0
                        ? <tr><td colSpan={5} className="dc-td-empty">No recent contracts</td></tr>
                        : contractSlice.map((row, i) => {
                          const isA = row.seller_name === data.seller1.name;
                          return (
                            <tr key={i}>
                              <td><span className={`dc-seller-tag ${isA ? "dc-tag-a" : "dc-tag-b"}`}>{isA ? "A" : "B"}</span><span className="dc-contract-no">{row.contract_no}</span></td>
                              <td>{row.state}</td><td>{row.brand}</td>
                              <td className="dc-td-green">{fmt(row.total_value)}</td>
                              <td className="dc-mono dc-muted">{row.contract_date}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <Paginator total={data.recentContracts.length} page={contractPage} onPage={setContractPage} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentsComparison;
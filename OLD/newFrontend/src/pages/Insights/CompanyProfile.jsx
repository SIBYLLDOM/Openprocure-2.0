import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { fetchContracts, fetchSellers } from "../../services/contractsApi";
import '../../assets/css/CompanyProfile.css';

/* ─── helpers ────────────────────────────────────────── */
const toNum = (val) => parseFloat(String(val ?? "0").replace(/,/g, "")) || 0;
const fmt = (n) => "₹ " + toNum(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/* ─── highlight matched text ─────────────────────────── */
const Highlight = ({ text, query }) => {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="dd-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
};

/* =====================================================
   PAGINATOR COMPONENT
   ===================================================== */
const PAGE_SIZE = 10;

const Paginator = ({ total, page, onPage }) => {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;

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

/* =====================================================
   SEARCHABLE COMPETITOR DROPDOWN
   ===================================================== */
const CompetitorSearch = ({ sellers, value, onChange }) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);

  /* filtered list */
  const filtered = useMemo(
    () =>
      query.trim()
        ? sellers.filter((s) =>
          s.toLowerCase().includes(query.toLowerCase())
        )
        : sellers,
    [query, sellers]
  );

  /* sync display when parent value changes externally */
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  /* close on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery(value || ""); // reset partial search
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value]);

  /* scroll active item into view */
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx];
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  const select = useCallback(
    (name) => {
      onChange(name);
      setQuery(name);
      setOpen(false);
      setActiveIdx(-1);
    },
    [onChange]
  );

  const handleKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      setActiveIdx(0);
      return;
    }
    if (!open) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIdx >= 0 && filtered[activeIdx]) select(filtered[activeIdx]);
        break;
      case "Escape":
        setOpen(false);
        setQuery(value || "");
        setActiveIdx(-1);
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  };

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    setActiveIdx(0);
  };

  const handleClear = () => {
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div className="dd-root" ref={containerRef}>
      {/* Input */}
      <div className={`dd-input-wrap ${open ? "dd-open" : ""}`}>
        {/* Search icon */}
        <svg className="dd-icon-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="22" y2="22" />
        </svg>

        <input
          ref={inputRef}
          className="dd-input"
          type="text"
          placeholder="Search competitor / seller name…"
          value={query}
          onChange={handleInputChange}
          onFocus={() => { setOpen(true); setActiveIdx(0); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck="false"
          aria-haspopup="listbox"
          aria-expanded={open}
        />

        {/* Clear button */}
        {query && (
          <button className="dd-clear-btn" onClick={handleClear} title="Clear search" tabIndex={-1}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Chevron */}
        <svg
          className={`dd-chevron ${open ? "dd-chevron-up" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          onClick={() => { setOpen((o) => !o); inputRef.current?.focus(); }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Count badge */}
      {open && (
        <div className="dd-count-badge">
          {filtered.length} of {sellers.length} competitors
        </div>
      )}

      {/* Dropdown list */}
      {open && (
        <ul className="dd-list" ref={listRef} role="listbox">
          {filtered.length === 0 ? (
            <li className="dd-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" width="18" height="18">
                <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" />
              </svg>
              No results for "<strong>{query}</strong>"
            </li>
          ) : (
            filtered.map((name, i) => (
              <li
                key={name}
                role="option"
                aria-selected={name === value}
                className={`dd-item
                  ${name === value ? "dd-item-selected" : ""}
                  ${i === activeIdx ? "dd-item-active" : ""}
                `}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); select(name); }}
              >
                <span className="dd-item-text">
                  <Highlight text={name} query={query === value ? "" : query} />
                </span>
                {name === value && (
                  <svg className="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

/* =====================================================
   PORTFOLIO TRACKING — Live DB Integration
   ===================================================== */
const PortfolioTracking = () => {
  /* ── State ── */
  const [sellers, setSellers] = useState([]);
  const [selectedCompetitor, setSelected] = useState("");
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contractsLoading, setContractsLoading] = useState(false);

  /* ── Pagination State ── */
  const [statePage, setStatePage] = useState(1);
  const [brandPage, setBrandPage] = useState(1);
  const [productPage, setProductPage] = useState(1);

  /* ── Load seller list on mount ── */
  useEffect(() => {
    const loadSellers = async () => {
      try {
        const data = await fetchSellers();
        setSellers(data);
        if (data.length > 0) setSelected(data[0]);
      } catch (err) {
        setError("Could not connect to server. Check that the backend is running on port 5000.");
      } finally {
        setLoading(false);
      }
    };
    loadSellers();
  }, []);

  /* ── Load contracts whenever selected competitor changes ── */
  useEffect(() => {
    if (!selectedCompetitor) return;
    const loadContracts = async () => {
      setContractsLoading(true);
      setStatePage(1);
      setBrandPage(1);
      setProductPage(1);
      try {
        const data = await fetchContracts({ seller_name: selectedCompetitor });
        setContracts(data);
        setError(null);
      } catch (err) {
        setError("Failed to load contract data.");
      } finally {
        setContractsLoading(false);
      }
    };
    loadContracts();
  }, [selectedCompetitor]);

  /* ── Dynamic Calculations ── */
  const metrics = useMemo(() => {
    if (contracts.length === 0) return {
      totalContracts: 0, totalRevenue: 0, avgValue: 0,
      statesCovered: 0, brandsSupplied: 0, directPercent: 0,
      stateData: [], brandData: [], productData: [], directCount: 0, dealerCount: 0
    };

    const totalRevenue = contracts.reduce((s, c) => s + toNum(c.total_value), 0);
    const avgValue = totalRevenue / contracts.length;
    const statesCovered = new Set(contracts.map(c => c.state).filter(Boolean)).size;
    const brandsSupplied = new Set(contracts.map(c => c.brand).filter(Boolean)).size;
    const directCount = contracts.filter(c => c.buying_mode === "Direct").length;
    const directPercent = (directCount / contracts.length) * 100;

    const stateMap = {};
    contracts.forEach(c => {
      const st = c.state || "Unknown";
      if (!stateMap[st]) stateMap[st] = { count: 0, revenue: 0 };
      stateMap[st].count++;
      stateMap[st].revenue += toNum(c.total_value);
    });

    const brandMap = {};
    contracts.forEach(c => {
      const br = c.brand || "Unknown";
      if (!brandMap[br]) brandMap[br] = { count: 0, revenue: 0 };
      brandMap[br].count++;
      brandMap[br].revenue += toNum(c.total_value);
    });

    const productMap = {};
    contracts.forEach(c => {
      const key = `${c.product}-${c.brand}`;
      if (!productMap[key]) {
        productMap[key] = { name: c.product, brand: c.brand, qty: 0, revenue: 0 };
      }
      productMap[key].qty += toNum(c.ordered_quantity);
      productMap[key].revenue += toNum(c.total_value);
    });

    return {
      totalContracts: contracts.length,
      totalRevenue, avgValue, statesCovered, brandsSupplied, directPercent,
      stateData: Object.entries(stateMap).map(([state, d]) => ({ state, ...d })).sort((a, b) => b.revenue - a.revenue),
      brandData: Object.entries(brandMap).map(([brand, d]) => ({ brand, ...d })).sort((a, b) => b.revenue - a.revenue),
      productData: Object.values(productMap).map(p => ({ ...p, avgPrice: p.qty ? p.revenue / p.qty : 0 })).sort((a, b) => b.revenue - a.revenue),
      directCount,
      dealerCount: contracts.length - directCount,
    };
  }, [contracts]);

  /* ── Paginated Slices ── */
  const stateSlice = useMemo(() => (metrics.stateData || []).slice((statePage - 1) * PAGE_SIZE, statePage * PAGE_SIZE), [metrics.stateData, statePage]);
  const brandSlice = useMemo(() => (metrics.brandData || []).slice((brandPage - 1) * PAGE_SIZE, brandPage * PAGE_SIZE), [metrics.brandData, brandPage]);
  const productSlice = useMemo(() => (metrics.productData || []).slice((productPage - 1) * PAGE_SIZE, productPage * PAGE_SIZE), [metrics.productData, productPage]);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="bid-result-container portfolio-tracking-page">
        <div className="bid-result-header">
          <h1 className="page-title">Competitor Portfolio Tracking</h1>
        </div>
        <div style={{ textAlign: "center", padding: "5rem 2rem" }}>
          <div className="spinner" />
          <p style={{ marginTop: "1.5rem", color: "#6c757d", fontWeight: 600 }}>loading...</p>
        </div>
      </div>
    );
  }

  if (error && sellers.length === 0) {
    return (
      <div className="bid-result-container portfolio-tracking-page">
        <div className="bid-result-header">
          <h1 className="page-title">Competitor Portfolio Tracking</h1>
        </div>
        <div className="results-summary" style={{ borderLeftColor: "#dc3545", background: "#fff5f5" }}>
          ⚠️ {error}
        </div>
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div className="bid-result-container portfolio-tracking-page">

      {/* ── Page Header ── */}
      <div className="bid-result-header">
        <h1 className="page-title">Competitor Portfolio Tracking</h1>
      </div>

      {/* ── Filters ── */}
      <div className="filters-section">

        {/* Searchable Dropdown */}
        <CompetitorSearch
          sellers={sellers}
          value={selectedCompetitor}
          onChange={setSelected}
        />

        {/* Status Row */}
        <div className="filters-row" style={{ marginTop: "1rem" }}>
          <div className="active-badge">
            <span className={`dot${contractsLoading ? " dot-loading" : ""}`} />
            Analyzing:&nbsp;<strong>{selectedCompetitor || "—"}</strong>
            {contractsLoading && <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem" }}>Loading…</span>}
          </div>
          <div style={{ flex: 1 }} />
          <span className="dd-result-pill">
            {contractsLoading ? "…" : `${metrics.totalContracts} contracts found`}
          </span>
          <button
            className="clear-filters-btn"
            onClick={() => {
              setSelected("");
              setContracts([]);
              setStatePage(1);
              setBrandPage(1);
              setProductPage(1);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="results-summary" style={{ borderLeftColor: "#dc3545", background: "#fff5f5", marginBottom: "1.5rem" }}>
          ⚠️ {error}
        </div>
      )}

      <div className="portfolio-main">
        {/* ── KPI Cards ── */}
        <div className="portfolio-kpi-grid">
          <div className="p-kpi-card p-blue">
            <span className="p-kpi-label">Total Contracts</span>
            <span className="p-kpi-value">{metrics.totalContracts}</span>
          </div>
          <div className="p-kpi-card p-blue">
            <span className="p-kpi-label">Total Revenue</span>
            <span className="p-kpi-value">{fmt(metrics.totalRevenue)}</span>
          </div>
          <div className="p-kpi-card p-blue">
            <span className="p-kpi-label">Avg Contract Value</span>
            <span className="p-kpi-value">{fmt(metrics.avgValue)}</span>
          </div>
          <div className="p-kpi-card p-blue">
            <span className="p-kpi-label">States Covered</span>
            <span className="p-kpi-value">{metrics.statesCovered}</span>
          </div>
          <div className="p-kpi-card p-blue">
            <span className="p-kpi-label">Brands Supplied</span>
            <span className="p-kpi-value">{metrics.brandsSupplied}</span>
          </div>
          <div className="p-kpi-card p-blue">
            <span className="p-kpi-label">Direct Supply %</span>
            <span className="p-kpi-value">{metrics.directPercent.toFixed(1)}%</span>
          </div>
        </div>

        {/* ── Revenue Breakdown ── */}
        <div className="breakdown-grid">
          <div className="p-card">
            <div className="p-card-header">State-wise Revenue</div>
            <div className="portfolio-table-wrapper">
              <table className="portfolio-table">
                <thead><tr><th>State</th><th>Contracts</th><th>Total Revenue</th></tr></thead>
                <tbody>
                  {metrics.stateData.length === 0
                    ? <tr><td colSpan={3} className="td-empty">No data</td></tr>
                    : stateSlice.map(row => (
                      <tr key={row.state}>
                        <td>{row.state}</td>
                        <td>{row.count}</td>
                        <td className="bold">{fmt(row.revenue)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Paginator total={metrics.stateData.length} page={statePage} onPage={setStatePage} />
          </div>

          <div className="p-card">
            <div className="p-card-header">Brand-wise Market Penetration</div>
            <div className="portfolio-table-wrapper">
              <table className="portfolio-table">
                <thead><tr><th>Brand</th><th>Contracts</th><th>Revenue Contribution</th></tr></thead>
                <tbody>
                  {metrics.brandData.length === 0
                    ? <tr><td colSpan={3} className="td-empty">No data</td></tr>
                    : brandSlice.map(row => (
                      <tr key={row.brand}>
                        <td>{row.brand}</td>
                        <td>{row.count}</td>
                        <td className="bold">{fmt(row.revenue)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Paginator total={metrics.brandData.length} page={brandPage} onPage={setBrandPage} />
          </div>
        </div>

        {/* ── Product Strength ── */}
        <div className="p-card full-width">
          <div className="p-card-header">Product Market Strength &amp; Pricing Analysis</div>
          <div className="portfolio-table-wrapper">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>Product Description</th>
                  <th>Brand</th>
                  <th className="center">Qty Sold</th>
                  <th>Revenue Generated</th>
                  <th>Avg Unit Price</th>
                </tr>
              </thead>
              <tbody>
                {metrics.productData.length === 0
                  ? <tr><td colSpan={5} className="td-empty">No data</td></tr>
                  : productSlice.map((row, i) => (
                    <tr key={i}>
                      <td className="bold">{row.name}</td>
                      <td>{row.brand}</td>
                      <td className="center">{row.qty}</td>
                      <td className="bold green-text">{fmt(row.revenue)}</td>
                      <td>{fmt(row.avgPrice)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Paginator total={metrics.productData.length} page={productPage} onPage={setProductPage} />
        </div>


      </div>
    </div>
  );
};

export default PortfolioTracking;
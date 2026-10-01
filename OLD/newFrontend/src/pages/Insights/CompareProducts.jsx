import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import '../../assets/css/CompareProducts.css';

const toNum = (val) => parseFloat(String(val ?? "0").replace(/,/g, "")) || 0;
const fmt = (n) => "₹ " + toNum(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const num = (n) => toNum(n).toLocaleString("en-IN");

/* ── Match highlight ── */
const Highlight = ({ text, query }) => {
    if (!query) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return <>
        {text.slice(0, idx)}
        <mark className="pc-dd-highlight">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
    </>;
};

/* ══ Searchable Dropdown — mirrors CompetitorSearch style ══ */
const ProductSearch = ({ products, value, onChange }) => {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const containerRef = useRef(null);

    const filtered = useMemo(
        () => query.trim()
            ? products.filter(p => p.toLowerCase().includes(query.toLowerCase()))
            : products,
        [query, products]
    );

    useEffect(() => { setQuery(value || ""); }, [value]);

    useEffect(() => {
        const h = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false); setQuery(value || "");
            }
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [value]);

    useEffect(() => {
        if (activeIdx >= 0 && listRef.current)
            listRef.current.children[activeIdx]?.scrollIntoView({ block: "nearest" });
    }, [activeIdx]);

    const select = useCallback((name) => {
        onChange(name); setQuery(name); setOpen(false); setActiveIdx(-1);
    }, [onChange]);

    const handleKeyDown = (e) => {
        if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); setActiveIdx(0); return; }
        if (!open) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); if (activeIdx >= 0 && filtered[activeIdx]) select(filtered[activeIdx]); }
        else if (e.key === "Escape") { setOpen(false); setQuery(value || ""); inputRef.current?.blur(); }
    };

    return (
        <div className="pc-dd-root" ref={containerRef}>
            <div className={`pc-dd-input-wrap${open ? " pc-dd-open" : ""}`}>
                <svg className="pc-dd-icon-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" />
                </svg>
                <input
                    ref={inputRef}
                    className="pc-dd-input"
                    type="text"
                    placeholder="Search or select a product…"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(0); }}
                    onFocus={() => { setOpen(true); setActiveIdx(0); }}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                />
                {query && (
                    <button className="pc-dd-clear-btn" tabIndex={-1}
                        onClick={() => { setQuery(""); setOpen(true); inputRef.current?.focus(); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                )}
                <svg
                    className={`pc-dd-chevron${open ? " pc-dd-chevron-up" : ""}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    onClick={() => { setOpen(o => !o); inputRef.current?.focus(); }}>
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </div>
            {open && filtered.length > 0 && (
                <div className="pc-dd-count-badge">{filtered.length} of {products.length} products</div>
            )}
            {open && (
                <ul className="pc-dd-list" ref={listRef} role="listbox">
                    {filtered.length === 0
                        ? <li className="pc-dd-empty">No results for "<strong>{query}</strong>"</li>
                        : filtered.map((name, i) => (
                            <li key={name}
                                className={`pc-dd-item${name === value ? " pc-dd-item-selected" : ""}${i === activeIdx ? " pc-dd-item-active" : ""}`}
                                onMouseEnter={() => setActiveIdx(i)}
                                onMouseDown={e => { e.preventDefault(); select(name); }}>
                                <span className="pc-dd-item-text">
                                    <Highlight text={name} query={query === value ? "" : query} />
                                </span>
                                {name === value && (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </li>
                        ))}
                </ul>
            )}
        </div>
    );
};

/* ── Market share bar ── */
const ShareBar = ({ pct: p }) => (
    <div className="pc-bar-wrap">
        <div className="pc-bar-fill" style={{ width: `${Math.min(p, 100)}%` }} />
        <span className="pc-bar-label">{Number(p).toFixed(1)}%</span>
    </div>
);

/* ══ MAIN PAGE ══ */
const ProductComparison = () => {
    const [products, setProducts] = useState([]);
    const [product, setProduct] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [prodLoad, setProdLoad] = useState(true);
    const [error, setError] = useState(null);
    const [dataLoading, setDataLoading] = useState(false);

    /* fetch product list once */
    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/competitors/products/list`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
            .then(r => r.json())
            .then(j => setProducts(j.data || []))
            .catch(() => setError("Cannot connect to backend."))
            .finally(() => setProdLoad(false));
    }, []);

    /* fetch data when product selected */
    useEffect(() => {
        if (!product) { setData(null); return; }
        setDataLoading(true); setError(null); setData(null);
        fetch(`${import.meta.env.VITE_API_BASE_URL}/competitors/products/intelligence?product=${encodeURIComponent(product)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
            .then(r => r.json())
            .then(j => { if (!j.success) throw new Error(j.error || "Failed"); setData(j); })
            .catch(err => setError(err.message))
            .finally(() => setDataLoading(false));
    }, [product]);

    const avg = data?.priceRange?.avgMarketPrice || 0;
    const totalBrandRev = useMemo(
        () => (data?.brandDistribution || []).reduce((s, b) => s + b.revenue, 0), [data]
    );

    /* ── Loading skeleton (initial product list load) ── */
    if (prodLoad) {
        return (
            <div className="bid-result-container product-comparison-page">
                <div className="bid-result-header">
                    <h1 className="page-title">Product selling Intelligence</h1>
                </div>
                <div style={{ textAlign: "center", padding: "5rem 2rem" }}>
                    <div className="spinner" />
                    <p style={{ marginTop: "1.5rem", color: "#6c757d", fontWeight: 600 }}>Loading products…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bid-result-container product-comparison-page">

            {/* ── Header ── */}
            <div className="bid-result-header">
                <h1 className="page-title">Product selling Intelligence</h1>
                <p className="pc-subtitle">Product-Level Market &amp; Pricing Comparison</p>
            </div>

            {/* ── Selector ── */}
            <div className="filters-section">
                <div className="filters-row" style={{ alignItems: "center", gap: "1.5rem" }}>
                    <div className="pc-selector-label" style={{ flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" />
                        </svg>
                        Select Product to Analyse
                    </div>

                    <div style={{ flex: 1, minWidth: "250px" }}>
                        <ProductSearch products={products} value={product} onChange={setProduct} />
                    </div>

                    <div className="active-badge" style={{ flexShrink: 0 }}>
                        <span className={`dot${dataLoading ? " dot-loading" : ""}`} />
                        Analysing:&nbsp;<strong>{product ? product : "—"}</strong>
                        {dataLoading && <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem" }}>Loading…</span>}
                    </div>

                    {data && (
                        <span className="dd-result-pill" style={{ flexShrink: 0 }}>
                            {data.competitorStats.length} competitors · {data.recentContracts.length} contracts
                        </span>
                    )}
                </div>
            </div>

            {/* ── Error ── */}
            {error && (
                <div className="results-summary" style={{ borderLeftColor: "#dc3545", background: "#fff5f5", marginBottom: "1.5rem" }}>
                    ⚠️ {error}
                </div>
            )}

            {/* ── Loading data ── */}
            {dataLoading && (
                <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
                    <div className="spinner" />
                    <p style={{ marginTop: "1.5rem", color: "#6c757d", fontWeight: 600 }}>Loading product intelligence…</p>
                </div>
            )}

            {/* ── No product selected ── */}
            {!dataLoading && !data && !error && (
                <div style={{ textAlign: "center", padding: "4rem 2rem", color: "#6c757d" }}>
                    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#c7d2fe" strokeWidth="1.5">
                        <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
                        <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                    </svg>
                    <p style={{ marginTop: "1.25rem", fontWeight: 600, color: "#4a5568" }}>No product selected</p>
                    <p style={{ marginTop: "0.4rem", fontSize: "0.88rem" }}>Search and select a product above to load competitive insights</p>
                </div>
            )}

            {/* ══ RESULTS ══ */}
            {data && !dataLoading && (
                <div className="portfolio-main">

                    {/* ── 1. KPI Cards ── */}
                    <div className="portfolio-kpi-grid pc-kpi-4col">
                        <div className="p-kpi-card p-blue">
                            <span className="p-kpi-label">Total Market Revenue</span>
                            <span className="p-kpi-value">{fmt(data.totalMarketRevenue)}</span>
                        </div>
                        <div className="p-kpi-card p-blue">
                            <span className="p-kpi-label">Total Market Quantity</span>
                            <span className="p-kpi-value">{num(data.totalMarketQty)} units</span>
                        </div>
                        <div className="p-kpi-card p-blue">
                            <span className="p-kpi-label">Avg Market Price</span>
                            <span className="p-kpi-value">{fmt(data.priceRange.avgMarketPrice)}</span>
                        </div>
                        <div className="p-kpi-card p-blue">
                            <span className="p-kpi-label">Price Range</span>
                            <span className="p-kpi-value" style={{ fontSize: "1rem" }}>
                                {fmt(data.priceRange.minPrice)} – {fmt(data.priceRange.maxPrice)}
                            </span>
                        </div>
                    </div>

                    {/* ── 2. Competitor Performance ── */}
                    <div className="p-card full-width">
                        <div className="p-card-header">
                            Competitor Performance — {data.product}
                            <span className="pc-sub-badge">{data.competitorStats.length} active sellers</span>
                        </div>
                        <div className="portfolio-table-wrapper">
                            <table className="portfolio-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Seller Name</th>
                                        <th>Contracts</th>
                                        <th>Qty Sold</th>
                                        <th>Revenue</th>
                                        <th>Avg Unit Price</th>
                                        <th>Market Share</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.competitorStats.length === 0
                                        ? <tr><td colSpan={7} className="td-empty">No competitor data found</td></tr>
                                        : data.competitorStats.map((r, i) => (
                                            <tr key={r.seller_name} className={i === 0 ? "pc-top-row" : ""}>
                                                <td style={{ color: "#6c757d", fontWeight: 700 }}>{i + 1}</td>
                                                <td className="bold">
                                                    {i === 0 && <span className="pc-crown">👑</span>}
                                                    {r.seller_name}
                                                </td>
                                                <td>{num(r.totalContracts)}</td>
                                                <td>{num(r.totalQty)}</td>
                                                <td className="bold green-text">{fmt(r.totalRevenue)}</td>
                                                <td>{fmt(r.avgUnitPrice)}</td>
                                                <td><ShareBar pct={r.marketSharePercent} /></td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── 3. Brand Distribution + Price Intelligence ── */}
                    <div className="breakdown-grid">

                        {/* Brand Distribution */}
                        <div className="p-card">
                            <div className="p-card-header">
                                Brand Distribution
                                <span className="pc-sub-badge">{data.brandDistribution.length} brands</span>
                            </div>
                            <div className="portfolio-table-wrapper">
                                <table className="portfolio-table">
                                    <thead>
                                        <tr><th>Brand</th><th>Total Revenue</th><th>Quantity</th><th>Revenue Share</th></tr>
                                    </thead>
                                    <tbody>
                                        {data.brandDistribution.length === 0
                                            ? <tr><td colSpan={4} className="td-empty">No brand data</td></tr>
                                            : data.brandDistribution.map((r, i) => {
                                                const share = totalBrandRev > 0 ? (r.revenue / totalBrandRev) * 100 : 0;
                                                return (
                                                    <tr key={r.brand} className={i === 0 ? "pc-top-row" : ""}>
                                                        <td className="bold">{r.brand}</td>
                                                        <td className="bold green-text">{fmt(r.revenue)}</td>
                                                        <td>{num(r.qty)}</td>
                                                        <td><ShareBar pct={share} /></td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Price Intelligence */}
                        <div className="p-card">
                            <div className="p-card-header">
                                Price Intelligence
                                <span className="pc-sub-badge">Avg: {fmt(avg)}</span>
                            </div>
                            {/* Min / Avg / Max summary */}
                            <div className="pc-price-row">
                                <div className="pc-price-stat">
                                    <span className="pc-price-stat-lbl">MIN PRICE</span>
                                    <span className="pc-price-stat-val pc-price-green">{fmt(data.priceRange.minPrice)}</span>
                                </div>
                                <div className="pc-price-stat pc-price-stat-mid">
                                    <span className="pc-price-stat-lbl">AVG PRICE</span>
                                    <span className="pc-price-stat-val pc-price-blue">{fmt(avg)}</span>
                                </div>
                                <div className="pc-price-stat">
                                    <span className="pc-price-stat-lbl">MAX PRICE</span>
                                    <span className="pc-price-stat-val pc-price-red">{fmt(data.priceRange.maxPrice)}</span>
                                </div>
                            </div>
                            <div className="portfolio-table-wrapper">
                                <table className="portfolio-table">
                                    <thead>
                                        <tr><th>Seller</th><th>Avg Unit Price</th><th>vs Market Avg</th></tr>
                                    </thead>
                                    <tbody>
                                        {data.competitorStats.length === 0
                                            ? <tr><td colSpan={3} className="td-empty">No price data</td></tr>
                                            : data.competitorStats.map(r => {
                                                const delta = avg > 0 ? ((r.avgUnitPrice - avg) / avg) * 100 : 0;
                                                const below = delta <= 0;
                                                return (
                                                    <tr key={r.seller_name}>
                                                        <td className="bold">{r.seller_name}</td>
                                                        <td>{fmt(r.avgUnitPrice)}</td>
                                                        <td>
                                                            <span className={`pc-delta-pill${below ? " pc-delta-green" : " pc-delta-red"}`}>
                                                                {below ? "▼" : "▲"} {Math.abs(delta).toFixed(1)}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* ── 4. Recent Contracts ── */}
                    <div className="p-card full-width">
                        <div className="p-card-header">
                            Recent Contracts — {data.product}
                            <span className="pc-sub-badge">Latest {data.recentContracts.length} orders</span>
                        </div>
                        <div className="portfolio-table-wrapper">
                            <table className="portfolio-table">
                                <thead>
                                    <tr>
                                        <th>Contract No</th>
                                        <th>Seller</th>
                                        <th>State</th>
                                        <th>Total Value</th>
                                        <th>Unit Price</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.recentContracts.length === 0
                                        ? <tr><td colSpan={6} className="td-empty">No recent contracts</td></tr>
                                        : data.recentContracts.map((r, i) => (
                                            <tr key={i}>
                                                <td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.8rem", color: "#0a62bb" }}>{r.contract_no}</td>
                                                <td className="bold">{r.seller_name}</td>
                                                <td>{r.state}</td>
                                                <td className="bold green-text">{fmt(r.total_value)}</td>
                                                <td>{fmt(r.unit_price)}</td>
                                                <td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.8rem", color: "#6c757d" }}>{r.contract_date}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default ProductComparison;

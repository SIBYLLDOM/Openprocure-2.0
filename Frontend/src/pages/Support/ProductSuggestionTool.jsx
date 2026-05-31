// src/pages/Support/ProductSuggestionTool.jsx
// Route: /support/product-suggestion

import React, { useState, useRef, useCallback } from "react";
import "./ProductSuggestionTool.css";

// ── API Base ──────────────────────────────────────────────────────────────────
// The FastAPI (api.py) runs on port 5163 — POST /analyze
const ANALYZER_BASE = "https://fileupload.openprocure.ai";

// ── Helpers ───────────────────────────────────────────────────────────────────
const statusColor = (status) => {
    if (!status) return "status-na";
    const s = status.toLowerCase();
    if (s === "complied") return "status-complied";
    if (s === "deviation") return "status-deviation";
    return "status-na";
};

const scoreColor = (score) => {
    if (score >= 0.85) return "score-excellent";
    if (score >= 0.65) return "score-good";
    return "score-low";
};

// ── Component ─────────────────────────────────────────────────────────────────
const ProductSuggestionTool = () => {
    // Form state
    const [email, setEmail] = useState("");
    const [files, setFiles] = useState([]); // [{file, label}]
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    // Process state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null); // API response

    // Result view
    const [activeTab, setActiveTab] = useState("products"); // products | deviations | letter
    const [expandedDeviations, setExpandedDeviations] = useState({});
    const letterRef = useRef(null);

    // ── File handling ─────────────────────────────────────────────────────────
    const addFiles = useCallback((newFiles) => {
        const arr = Array.from(newFiles).map((f) => ({ file: f, label: "atc" }));
        setFiles((prev) => {
            const merged = [...prev, ...arr];
            // First file auto-label as bid doc if none is set
            if (merged.length > 0 && prev.length === 0) {
                merged[0].label = "bid";
            }
            return merged;
        });
    }, []);

    const handleDrop = useCallback(
        (e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        },
        [addFiles]
    );

    const handleFileInput = (e) => {
        if (e.target.files.length) addFiles(e.target.files);
    };

    const removeFile = (idx) =>
        setFiles((prev) => prev.filter((_, i) => i !== idx));

    const setFileLabel = (idx, label) =>
        setFiles((prev) =>
            prev.map((f, i) => (i === idx ? { ...f, label } : f))
        );

    // ── Submission ────────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setResult(null);

        if (files.length === 0) {
            setError("Please upload at least one document.");
            return;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError("Please enter a valid email address.");
            return;
        }

        // Order files: bid doc first, then ATCs
        const bidFiles = files.filter((f) => f.label === "bid");
        const atcFiles = files.filter((f) => f.label !== "bid");

        if (bidFiles.length === 0) {
            setError("Please mark one file as the Bid Document.");
            return;
        }

        const formData = new FormData();
        // email sent as a custom header / query — api.py doesn't use it,
        // but we store it for potential future use
        formData.append("email", email);
        [...bidFiles, ...atcFiles].forEach(({ file }) =>
            formData.append("files", file)
        );

        setLoading(true);
        try {
            const res = await fetch(`${ANALYZER_BASE}/analyze`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Server error ${res.status}: ${text}`);
            }

            const data = await res.json();
            setResult(data);
            setActiveTab("products");
            setExpandedDeviations({});
        } catch (err) {
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setFiles([]);
        setEmail("");
        setResult(null);
        setError(null);
    };

    // ── Render helpers ────────────────────────────────────────────────────────
    const renderUploadZone = () => (
        <div
            className={`pst-dropzone ${isDragging ? "dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            aria-label="Upload documents"
        >
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv,.txt,.json"
                className="pst-hidden-input"
                onChange={handleFileInput}
            />
            <div className="pst-dropzone-icon">📂</div>
            <p className="pst-dropzone-primary">
                Drag & drop files here, or <span className="pst-link">browse</span>
            </p>
            <p className="pst-dropzone-hint">
                Supports PDF, XLSX, XLS, CSV, TXT, JSON
            </p>
        </div>
    );

    const renderFileList = () => (
        <div className="pst-file-list">
            {files.map((f, idx) => (
                <div key={idx} className="pst-file-item">
                    <span className="pst-file-icon">
                        {f.file.name.endsWith(".pdf") ? "📄" : "📊"}
                    </span>
                    <span className="pst-file-name" title={f.file.name}>
                        {f.file.name}
                    </span>
                    <span className="pst-file-size">
                        ({(f.file.size / 1024).toFixed(1)} KB)
                    </span>
                    <select
                        className={`pst-label-select ${f.label === "bid" ? "label-bid" : "label-atc"}`}
                        value={f.label}
                        onChange={(e) => setFileLabel(idx, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <option value="bid">Bid Document ★</option>
                        <option value="atc">ATC / Supporting</option>
                    </select>
                    <button
                        className="pst-remove-btn"
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        title="Remove file"
                        type="button"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );

    const renderProductCard = (item) => {
        const pct = Math.round((item.relevancy_score || 0) * 100);
        return (
            <div key={item.item} className="pst-product-card">
                <div className="pst-product-header">
                    <span className="pst-product-badge">{item.item}</span>
                    <span className={`pst-score-badge ${scoreColor(item.relevancy_score || 0)}`}>
                        {pct}% Match
                    </span>
                </div>

                <div className="pst-product-meta">
                    <div className="pst-meta-row">
                        <span className="pst-meta-label">Tender Item</span>
                        <span className="pst-meta-value">{item.tender_item_name || "—"}</span>
                    </div>
                    <div className="pst-meta-row">
                        <span className="pst-meta-label">Category</span>
                        <span className="pst-meta-value">{item.item_category || "—"}</span>
                    </div>
                    <div className="pst-meta-row">
                        <span className="pst-meta-label">Suggested Product</span>
                        <span className="pst-meta-value pst-product-name">
                            {item.product_name || "—"}
                        </span>
                    </div>
                    <div className="pst-meta-row">
                        <span className="pst-meta-label">Product Code</span>
                        <span className="pst-meta-value pst-code">{item.product_code || "—"}</span>
                    </div>
                    <div className="pst-meta-row">
                        <span className="pst-meta-label">Product File</span>
                        <span className="pst-meta-value pst-small">
                            {item.selected_file?.split("/").pop() || "—"}
                        </span>
                    </div>
                </div>

                <div className="pst-score-bar-wrap">
                    <div className="pst-score-bar">
                        <div
                            className={`pst-score-fill ${scoreColor(item.relevancy_score || 0)}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <span className="pst-score-label">{pct}% Relevancy</span>
                </div>
            </div>
        );
    };

    const renderDeviationTable = (itemKey, rows) => {
        const isOpen = expandedDeviations[itemKey];
        return (
            <div key={itemKey} className="pst-deviation-block">
                <button
                    className="pst-deviation-header"
                    onClick={() =>
                        setExpandedDeviations((prev) => ({ ...prev, [itemKey]: !prev[itemKey] }))
                    }
                    type="button"
                >
                    <span className="pst-deviation-key">{itemKey}</span>
                    <span className="pst-deviation-count">{rows.length} specs</span>
                    <span className={`pst-chevron ${isOpen ? "open" : ""}`}>▾</span>
                </button>

                {isOpen && (
                    <div className="pst-deviation-table-wrap">
                        <table className="pst-deviation-table">
                            <thead>
                                <tr>
                                    <th>Specification</th>
                                    <th>Tender Requirement</th>
                                    <th>Product Offered</th>
                                    <th>Status</th>
                                    <th>Reason / Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, ri) => (
                                    <tr key={ri} className={statusColor(row.status)}>
                                        <td className="pst-spec-name">{row.specification}</td>
                                        <td>{row.tender_requirement}</td>
                                        <td>{row.product_offered}</td>
                                        <td>
                                            <span className={`pst-status-pill ${statusColor(row.status)}`}>
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="pst-small">
                                            {row.reason}
                                            {row.remarks && <span className="pst-remarks"> · {row.remarks}</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    // ── Deviation Letter ──────────────────────────────────────────────────────
    const handlePrintLetter = () => {
        const content = letterRef.current;
        if (!content) return;
        const win = window.open("", "_blank");
        win.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Deviation Letter — Meril Life Sciences</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #111;
           padding: 30px 40px; }
    .letter-header { display: flex; align-items: center;
                     border-bottom: 3px solid #1a6496; padding-bottom: 14px;
                     margin-bottom: 20px; gap: 16px; }
    .letter-logo  { font-size: 28px; font-weight: 900; color: #1a6496;
                    letter-spacing: -1px; }
    .letter-logo span { color: #e74c3c; }
    .letter-sub   { font-size: 9pt; color: #555; }
    .letter-meta  { margin-bottom: 18px; line-height: 1.8; font-size: 10.5pt; }
    .letter-subject { font-size: 12pt; font-weight: 700; text-decoration: underline;
                      margin-bottom: 14px; }
    .letter-body  { margin-bottom: 16px; line-height: 1.7; }
    .item-section { margin-bottom: 24px; page-break-inside: avoid; }
    .item-title   { font-size: 11pt; font-weight: 700; background: #1a6496;
                    color: #fff; padding: 6px 10px; border-radius: 4px;
                    margin-bottom: 8px; }
    .product-info { margin-bottom: 8px; font-size: 10pt; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px;
            font-size: 9.5pt; }
    th  { background: #e8f0f8; padding: 6px 8px; text-align: left;
          border: 1px solid #bcd; font-weight: 700; }
    td  { padding: 5px 8px; border: 1px solid #dde; vertical-align: top; }
    .s-complied  { color: #1a7a4a; font-weight: 700; }
    .s-deviation { color: #c0392b; font-weight: 700; }
    .s-na        { color: #666; }
    .signature   { margin-top: 40px; }
    @media print {
      body { padding: 0; }
      button { display: none; }
    }
  </style>
</head>
<body>${content.innerHTML}</body>
</html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
    };

    const renderDeviationLetter = () => {
        const products = result.suggested_products || [];
        const devs = result.deviation_tables || {};
        const today = new Date().toLocaleDateString("en-IN",
            { day: "2-digit", month: "long", year: "numeric" });
        const dept = result.dept || "";
        const category = result.item_category || "";

        return (
            <div className="pst-letter-wrap">
                {/* Print button */}
                <div className="pst-letter-toolbar">
                    <span className="pst-letter-hint">
                        Preview of the Deviation Letter. Click Print to save as PDF.
                    </span>
                    <button
                        className="pst-print-btn"
                        onClick={handlePrintLetter}
                        type="button"
                    >
                        🖨️ Print / Save as PDF
                    </button>
                </div>

                {/* Letter content */}
                <div className="pst-letter" ref={letterRef}>
                    {/* Letterhead */}
                    <div className="letter-header">
                        <div>
                            <div className="letter-logo">
                                MERIL<span>.</span>
                            </div>
                            <div className="letter-sub">
                                Meril Life Sciences Pvt Ltd · Muktanand Marg, Chala,
                                Valsad – 396 001, Gujarat, India
                            </div>
                        </div>
                    </div>

                    {/* Date + To */}
                    <div className="letter-meta">
                        <div><strong>Date:</strong> {today}</div>
                        <div><strong>To,</strong><br />
                            The Tender Authority<br />
                            [Organisation Name]<br />
                            [Address]
                        </div>
                    </div>

                    {/* Subject */}
                    <div className="letter-subject">
                        Subject: Deviation Statement for Tender –
                        {dept ? ` ${dept}` : ""}{category ? ` / ${category}` : ""}
                    </div>

                    {/* Opening */}
                    <div className="letter-body">
                        Dear Sir / Madam,<br /><br />
                        With reference to the above-mentioned tender, we, Meril Life Sciences
                        Pvt Ltd, hereby submit the following deviation statement for the
                        products offered against the specified requirements.
                    </div>

                    {/* Per-item section */}
                    {products.map((p, idx) => {
                        const devRows = devs[p.item] || [];
                        const complied = devRows.filter(r => r.status === "Complied").length;
                        const deviation = devRows.filter(r => r.status === "Deviation").length;
                        return (
                            <div key={p.item} className="item-section">
                                <div className="item-title">
                                    Item {idx + 1}: {p.tender_item_name || p.item}
                                </div>

                                <div className="product-info">
                                    <strong>Suggested Product:</strong> {p.product_name || "—"} &nbsp;|
                                    &nbsp;<strong>Code:</strong> {p.product_code || "—"} &nbsp;|
                                    &nbsp;<strong>Category:</strong> {p.item_category || "—"} &nbsp;|
                                    &nbsp;<strong>Match:</strong> {Math.round((p.relevancy_score || 0) * 100)}%
                                </div>

                                {devRows.length > 0 ? (
                                    <>
                                        <div className="product-info">
                                            Complied: <strong>{complied}</strong> &nbsp;
                                            Deviation: <strong>{deviation}</strong> &nbsp;
                                            Not Specified: <strong>{devRows.length - complied - deviation}</strong>
                                        </div>
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: "20%" }}>Specification</th>
                                                    <th style={{ width: "22%" }}>Tender Requirement</th>
                                                    <th style={{ width: "22%" }}>Product Offered</th>
                                                    <th style={{ width: "10%" }}>Status</th>
                                                    <th>Reason / Remarks</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {devRows.map((row, ri) => (
                                                    <tr key={ri}>
                                                        <td><strong>{row.specification}</strong></td>
                                                        <td>{row.tender_requirement}</td>
                                                        <td>{row.product_offered}</td>
                                                        <td className={
                                                            row.status === "Complied" ? "s-complied"
                                                                : row.status === "Deviation" ? "s-deviation"
                                                                    : "s-na"
                                                        }>{row.status}</td>
                                                        <td>
                                                            {row.reason}
                                                            {row.remarks && <><br /><em>{row.remarks}</em></>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </>
                                ) : (
                                    <div className="product-info" style={{ color: "#888" }}>
                                        No specification data available for this item.
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Closing */}
                    <div className="letter-body" style={{ marginTop: "24px" }}>
                        We confirm that all deviations mentioned above are minor in nature
                        and do not affect the performance and reliability of the offered
                        products. We are committed to providing the best quality products
                        meeting the intent of the tender specifications.
                    </div>

                    {/* Signature */}
                    <div className="signature">
                        <div>Yours faithfully,</div>
                        <br />
                        <div style={{
                            borderTop: "1px solid #333", width: "220px",
                            paddingTop: "6px", marginTop: "40px"
                        }}>
                            <strong>Authorised Signatory</strong><br />
                            Meril Life Sciences Pvt Ltd
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderResults = () => {
        if (!result.relevant) {
            return (
                <div className="pst-not-relevant">
                    <div className="pst-nr-icon">⚠️</div>
                    <h3>Not Relevant</h3>
                    <p>{result.reason || "The uploaded tender does not match Meril's product categories."}</p>
                    <button className="pst-reset-btn" onClick={reset} type="button">
                        Try Another Document
                    </button>
                </div>
            );
        }

        const products = result.suggested_products || [];
        const deviations = result.deviation_tables || {};
        const deviationKeys = Object.keys(deviations);

        return (
            <div className="pst-results">
                {/* Summary bar */}
                <div className="pst-summary-bar">
                    <div className="pst-summary-chip">
                        <span className="pst-summary-icon">✅</span>
                        <span>Relevant Tender</span>
                    </div>
                    {result.dept && (
                        <div className="pst-summary-chip">
                            <span className="pst-summary-icon">🏢</span>
                            <span>Dept: {result.dept}</span>
                        </div>
                    )}
                    {result.no_of_items > 0 && (
                        <div className="pst-summary-chip">
                            <span className="pst-summary-icon">📋</span>
                            <span>{result.no_of_items} Item{result.no_of_items !== 1 ? "s" : ""}</span>
                        </div>
                    )}
                    {result.item_category && (
                        <div className="pst-summary-chip">
                            <span className="pst-summary-icon">🏷️</span>
                            <span>{result.item_category}</span>
                        </div>
                    )}
                    <button className="pst-reset-btn pst-reset-small" onClick={reset} type="button">
                        ↩ New Analysis
                    </button>
                </div>

                {/* Tab bar */}
                <div className="pst-tab-bar">
                    <button
                        className={`pst-tab ${activeTab === "products" ? "active" : ""}`}
                        onClick={() => setActiveTab("products")}
                        type="button"
                    >
                        🧬 Suggested Products ({products.length})
                    </button>
                    <button
                        className={`pst-tab ${activeTab === "deviations" ? "active" : ""}`}
                        onClick={() => setActiveTab("deviations")}
                        type="button"
                    >
                        📊 Deviation Tables ({deviationKeys.length})
                    </button>
                    <button
                        className={`pst-tab ${activeTab === "letter" ? "active" : ""}`}
                        onClick={() => setActiveTab("letter")}
                        type="button"
                    >
                        📝 Deviation Letter
                    </button>
                </div>

                {/* Products tab */}
                {activeTab === "products" && (
                    <div className="pst-products-grid">
                        {products.length === 0 ? (
                            <div className="pst-empty">No product suggestions were generated.</div>
                        ) : (
                            products.map(renderProductCard)
                        )}
                    </div>
                )}

                {/* Deviations tab */}
                {activeTab === "deviations" && (
                    <div className="pst-deviations-list">
                        {deviationKeys.length === 0 ? (
                            <div className="pst-empty">No deviation data was generated.</div>
                        ) : (
                            deviationKeys.map((key) => renderDeviationTable(key, deviations[key]))
                        )}
                    </div>
                )}

                {/* Deviation Letter tab */}
                {activeTab === "letter" && renderDeviationLetter()}
            </div>
        );
    };

    // ── Main render ───────────────────────────────────────────────────────────
    return (
        <div className="pst-page">
            {/* Page header */}
            <div className="pst-page-header">
                <div className="pst-header-left">
                    <h1 className="pst-page-title">
                        <span className="pst-title-icon">🔬</span>
                        Product Suggestion Tool
                    </h1>
                    <p className="pst-page-desc">
                        Upload your tender documents and enter your email. Our AI will analyse
                        the documents, suggest matching Meril products and generate a full
                        deviation table for each item.
                    </p>
                </div>
            </div>

            <div className="pst-body">
                {/* ── Left: Upload Form ── */}
                {!result && (
                    <div className="pst-form-panel">
                        <form onSubmit={handleSubmit} className="pst-form" noValidate>

                            {/* Email */}
                            <div className="pst-form-group">
                                <label className="pst-label" htmlFor="pst-email">
                                    📧 Your Email Address
                                </label>
                                <input
                                    id="pst-email"
                                    type="email"
                                    className="pst-input"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                                <span className="pst-field-hint">
                                    Results will be referenced against this email.
                                </span>
                            </div>

                            {/* Upload zone */}
                            <div className="pst-form-group">
                                <label className="pst-label">
                                    📂 Upload Documents
                                </label>
                                <p className="pst-field-hint pst-hint-top">
                                    First file should be your <strong>Bid Document</strong>. All others are ATC / supporting.
                                    Use the dropdown next to each file to change its role.
                                </p>
                                {renderUploadZone()}
                                {files.length > 0 && renderFileList()}
                            </div>

                            {error && (
                                <div className="pst-error-banner">
                                    ⚠️ {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                className="pst-submit-btn"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <span className="pst-spinner" />
                                        Analysing Documents…
                                    </>
                                ) : (
                                    "🚀 Analyse & Get Suggestions"
                                )}
                            </button>
                        </form>

                        {/* Instructions card */}
                        <div className="pst-instructions">
                            <h3>How it works</h3>
                            <ol>
                                <li><strong>Upload</strong> your Bid Document and any ATC / supplementary files.</li>
                                <li><strong>Mark</strong> the primary file as <em>Bid Document ★</em> using the dropdown.</li>
                                <li><strong>Enter</strong> your email address.</li>
                                <li>Click <strong>Analyse</strong> — our AI will read every document, classify relevancy, and match products.</li>
                                <li>Review <strong>Suggested Products</strong> and the <strong>Deviation Table</strong> for each item.</li>
                            </ol>
                        </div>
                    </div>
                )}

                {/* ── Right: Results ── */}
                {loading && !result && (
                    <div className="pst-loading-panel">
                        <div className="pst-loading-animation">
                            <div className="pst-pulse-ring" />
                            <div className="pst-loading-icon">🔬</div>
                        </div>
                        <h3>Analysing your documents…</h3>
                        <p>This may take 30–90 seconds depending on document size.</p>
                        <div className="pst-loading-steps">
                            <div className="pst-step active">📤 Uploading files to AI</div>
                            <div className="pst-step">📑 Evaluating tender relevancy</div>
                            <div className="pst-step">🧬 Matching products</div>
                            <div className="pst-step">📊 Generating deviation tables</div>
                        </div>
                    </div>
                )}

                {result && !loading && renderResults()}
            </div>
        </div>
    );
};

export default ProductSuggestionTool;

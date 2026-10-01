// src/pages/Archive/ArchivePage.jsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Package, Boxes } from 'lucide-react';
import '../../assets/css/TendersPage.css';




const calculateDaysLeft = (endDateStr) => {
    if (!endDateStr) return 0;

    const computeDiff = (endDate) => {
        const now = new Date();
        const nowIST = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        const startOfTodayIST = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate());
        const startOfEndDayIST = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        const diffMs = startOfEndDayIST - startOfTodayIST;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    };

    // Open tender format: DD-Mon-YYYY HH:MM AM/PM (e.g. "15-Jun-2026 01:00 PM")
    const openMatch = endDateStr.match(
        /(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{1,2}):(\d{2}) (AM|PM)/i
    );
    if (openMatch) {
        const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        let [, dd, mon, yyyy, hh, min, meridian] = openMatch;
        dd = +dd; yyyy = +yyyy; hh = +hh; min = +min;
        const mm = MONTHS[mon.toLowerCase()];
        if (mm === undefined) return 0;
        if (meridian.toUpperCase() === 'PM' && hh !== 12) hh += 12;
        if (meridian.toUpperCase() === 'AM' && hh === 12) hh = 0;
        const endDate = new Date(Date.UTC(yyyy, mm, dd, hh - 5, min - 30));
        return computeDiff(endDate);
    }

    // GEM format: DD-MM-YYYY hh:mm AM/PM (e.g. "22-06-2026 9:00 AM")
    const gemMatch = endDateStr.match(
        /(\d{2})-(\d{2})-(\d{4}) (\d{1,2}):(\d{2}) (AM|PM)/i
    );
    if (!gemMatch) return 0;

    let [, dd, mm, yyyy, hh, min, meridian] = gemMatch;
    dd = Number(dd); mm = Number(mm) - 1; yyyy = Number(yyyy);
    hh = Number(hh); min = Number(min);
    if (meridian.toUpperCase() === 'PM' && hh !== 12) hh += 12;
    if (meridian.toUpperCase() === 'AM' && hh === 12) hh = 0;
    const endDate = new Date(Date.UTC(yyyy, mm, dd, hh - 5, min - 30));
    return computeDiff(endDate);
};

const DUMMY_STATUS_HISTORY = [
    { status: 'Proceed', remarks: 'Initial review completed', createdDate: '2025-01-15', updatedDate: '2025-01-15' },
    { status: 'Win', remarks: 'Tender awarded successfully', createdDate: '2025-02-10', updatedDate: '2025-02-10' },
    { status: 'On-Hold', remarks: 'Awaiting documentation', createdDate: '2025-01-20', updatedDate: '2025-01-22' },
];

const GenericTableModal = ({ title, data, onClose }) => {
    // Helper to parse JSON strings recursively or handle raw objects
    const parseData = (input) => {
        if (!input) return { type: 'empty' };

        // Case 0: Structured Corrigendum data { raw_full_text, entries: [...] }
        // Each entry may carry a download_url for the corrigendum PDF - render
        // that as a real Download button instead of dumping the raw JSON blob.
        let structured = input;
        if (typeof structured === 'string') {
            try { structured = JSON.parse(structured); } catch { structured = null; }
        }
        if (structured && typeof structured === 'object' && Array.isArray(structured.entries)) {
            const corrHeaders = ['Modified On', 'Bid Extended To', 'Bid Opening Date', 'Download'];
            const corrRows = structured.entries.map(e => ([
                e.modified_on || '-',
                e.bid_extended_to || '-',
                e.bid_opening_date || '-',
                e.download_url || null
            ]));
            return { type: 'corrigendum_entries', headers: corrHeaders, rows: corrRows };
        }

        // Case 1: Raw Content String (Scraped Text)
        if (input.content && typeof input.content === 'string') {
            const lines = input.content.split('\n').map(l => l.trim()).filter(l => l);
            const metadata = [];
            let headers = [];
            const rows = [];
            let tableStarted = false;

            lines.forEach(line => {
                // Simple heuristic: Line with tabs is likely a table row
                if (line.includes('\t')) {
                    const cells = line.split('\t');
                    if (!tableStarted) {

                        // Assume first tabbed line is header if it contains specific keywords or just take it as header
                        headers = cells;
                        tableStarted = true;
                    } else {
                        rows.push(cells);
                    }
                } else {
                    // Metadata lines (before table) or "Close" etc.
                    // Filter out generic UI text
                    if (!['×', 'Print', 'Close', 'Publish Representations'].includes(line)) {
                        metadata.push(line);
                    }
                }
            });

            return { type: 'parsed_text', metadata, headers, rows };
        }

        // Case 2: Standard Array of Objects
        let rows = [];
        if (Array.isArray(input)) rows = input;
        else if (typeof input === 'object') rows = [input];

        // Check if it's a JSON string disguised as object/string
        if (typeof input === 'string') {
            try {
                const parsed = JSON.parse(input);
                rows = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                return { type: 'empty' };
            }
        }

        if (rows.length === 0) return { type: 'empty' };
        return { type: 'json_array', rows, headers: Object.keys(rows[0]) };
    };

    const { type, metadata, headers, rows } = parseData(data);

    if (type === 'empty') return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body" style={{ overflowY: 'auto', padding: '20px' }}>

                    {/* Metadata Section for Parsed Text — render "Label: Value" lines as an
                        aligned two-column list; plain lines (disclaimers etc.) as full-width text. */}
                    {type === 'parsed_text' && metadata && metadata.length > 0 && (
                        <div className="modal-metadata-panel">
                            {metadata.map((line, i) => {
                                const m = line.match(/^([^:]{1,40}):\s*(.+)$/);
                                if (m) {
                                    return (
                                        <div key={i} className="modal-metadata-row">
                                            <span className="modal-metadata-label">{m[1]}</span>
                                            <span className="modal-metadata-value">{m[2]}</span>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={i} className="modal-metadata-note">
                                        {line}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="products-table-wrapper" style={{ overflowX: 'auto' }}>
                        <table className="products-table">
                            <thead>
                                <tr>
                                    {headers.map((h, i) => <th key={i}>{h.replace(/_/g, ' ').toUpperCase()}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, i) => (
                                    <tr key={i}>
                                        {type === 'json_array' ? (
                                            headers.map((h, j) => (
                                                <td key={j}>{typeof row[h] === 'object' ? JSON.stringify(row[h]) : row[h]}</td>
                                            ))
                                        ) : type === 'corrigendum_entries' ? (
                                            row.map((cell, j) => (
                                                <td key={j}>
                                                    {j === row.length - 1 ? (
                                                        cell ? (
                                                            <a
                                                                href={cell}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="btn-download-corrigendum"
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: '#084f9a', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontSize: '13px' }}
                                                            >
                                                                Download
                                                            </a>
                                                        ) : '-'
                                                    ) : cell}
                                                </td>
                                            ))
                                        ) : (
                                            // Parsed text rows are arrays of strings
                                            row.map((cell, j) => <td key={j}>{cell}</td>)
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn-cancel" style={{ width: '100%', background: '#084f9a', color: 'white' }}>Close</button>
                </div>
            </div>
        </div>
    );
};

const TenderStatusModal = ({ tender, onClose }) => {
    const [formData, setFormData] = useState({
        status: 'proceed',
        remark: ''
    });
    const [statusHistory, setStatusHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Fetch status history on component mount
    useEffect(() => {
        const fetchStatusHistory = async () => {
            try {
                setLoading(true);
                setError(null);

                const token = localStorage.getItem('token');
                const response = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/tenders/${tender.T_ID.replace(/\//g, '_')}/status/history`,
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );

                const data = await response.json();

                if (data.success) {
                    setStatusHistory(data.data || []);
                } else {
                    setError(data.message || 'Failed to fetch status history');
                }
            } catch (err) {
                console.error('Error fetching status history:', err);
                setError('Failed to fetch status history');
            } finally {
                setLoading(false);
            }
        };

        if (tender?.T_ID) {
            fetchStatusHistory();
        }
    }, [tender?.T_ID]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            setSubmitting(true);
            setError(null);

            const token = localStorage.getItem('token');
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/tenders/${tender.T_ID.replace(/\//g, '_')}/status`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        status: formData.status,
                        remarks: formData.remark
                    })
                }
            );

            const data = await response.json();

            if (data.success) {
                // Add the new status to the history
                setStatusHistory(prev => [data.data, ...prev]);

                // Reset form
                setFormData({ status: 'proceed', remark: '' });

                alert(`Status updated successfully for Tender ${tender.T_ID}`);
            } else {
                setError(data.message || 'Failed to update status');
            }
        } catch (err) {
            console.error('Error updating status:', err);
            setError('Failed to update status');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Tender Status - {tender.T_ID}</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <form onSubmit={handleSubmit} className="status-form">
                    {error && (
                        <div className="error-message" style={{ color: '#dc3545', marginBottom: '15px', padding: '10px', backgroundColor: '#f8d7da', borderRadius: '4px' }}>
                            {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="tender-status">Tender Status:</label>
                        <select
                            id="tender-status"
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            className="form-select"
                            disabled={submitting}
                        >
                            <option value="proceed">Proceed</option>
                            <option value="win">Win</option>
                            <option value="lose">Lose</option>
                            <option value="on-hold">On-Hold</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="remark">Remark:</label>
                        <textarea
                            id="remark"
                            value={formData.remark}
                            onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                            className="form-textarea"
                            rows="4"
                            placeholder="Enter your remarks here..."
                            disabled={submitting}
                        />
                    </div>

                    <button type="submit" className="btn-submit" disabled={submitting}>
                        {submitting ? 'Submitting...' : 'Submit'}
                    </button>
                </form>

                <div className="status-history">
                    <h3>Status History</h3>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '20px' }}>Loading status history...</div>
                    ) : statusHistory.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No status history available</div>
                    ) : (
                        <table className="history-table">
                            <thead>
                                <tr>
                                    <th>Tender Status</th>
                                    <th>Remarks</th>
                                    <th>Created Date</th>
                                    <th>Updated Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {statusHistory.map((record, idx) => (
                                    <tr key={idx}>
                                        <td><span className={`status-badge ${record.status.toLowerCase()}`}>{record.status}</span></td>
                                        <td>{record.remarks || '-'}</td>
                                        <td>{new Date(record.created_date).toLocaleDateString()}</td>
                                        <td>{new Date(record.updated_date).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

const TenderRow = ({ tender, serialNumber, onAction, onToggleInterest, onMarkNotRelevant }) => {

    const [showCorrigendumOptions, setShowCorrigendumOptions] = useState(false);
    const [showRepresentationModal, setShowRepresentationModal] = useState(false);
    const [showCorrigendumModal, setShowCorrigendumModal] = useState(false);
    const [showNotRelevantConfirm, setShowNotRelevantConfirm] = useState(false);
    const [markingNotRelevant, setMarkingNotRelevant] = useState(false);
    const [notRelevantReason, setNotRelevantReason] = useState('');


    const formatValue = (value) => {
        if (!value) return '';
        if (typeof value !== 'number' || isNaN(value)) return `₹ ${value}`;
        if (value >= 100) return `₹ ${(value / 100).toFixed(2)} CR.`;
        return `₹ ${value.toFixed(2)} L.`;
    };

    const daysLeft = calculateDaysLeft(tender.endDate);


    const toTenderUrlId = (tenderId) => {
        // Open tender IDs use underscores natively, but need slashes normalized
        // in case any slip through. GEM bid numbers use slashes natively (e.g.
        // "GEM/2024/B/1234567") and must be kept intact — encodeURIComponent
        // at the call site escapes the slash safely for routing.
        return tender.isOpenTender ? (tenderId || '').split('/').join('_') : (tenderId || '');
    };

    return (
        <div className="tender-row-compact">

            <div className="tender-main-info">
                {tender.isOpenTender ? (
                    /* ── Open Tender Layout ── */
                    <>
                        <div className="tender-header-line">
                            <b><div className="tender-serial" style={{ fontSize: '12pt' }}>{serialNumber}.</div></b>
                            <span className="tender-id-bold" style={{ fontSize: '12pt' }}>Tender ID: {tender.T_ID}</span>
                            {tender.refNo && (
                                <span style={{ fontSize: '11pt', color: '#555', fontWeight: 600 }}>
                                    Ref No: {tender.refNo}
                                </span>
                            )}
                            <b><span className="tender-date" style={{ fontSize: '12pt' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                Start: {tender.startDate || 'N/A'}
                            </span></b>
                            <b><span className="tender-date" style={{ fontSize: '12pt', marginLeft: '10px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                </svg>
                                End: {tender.endDate}
                                <span className="days-left-badge" style={{ fontSize: '8pt' }}>{daysLeft} Days Left</span>
                            </span></b>
                        </div>

                        <span style={{ height: '2pt' }}></span>
                        <Link
                            to={`/tenders/tenderdetails/${encodeURIComponent(toTenderUrlId(tender.T_ID))}`}
                            className="tender-title-link" style={{ fontSize: '11.8pt', color: 'black' }}
                            target="_blank" rel="noopener noreferrer"
                        >
                            {tender.title}
                        </Link>

                        {tender.organisationChain && (
                            <div style={{
                                fontSize: '11pt', color: '#084f9a', fontWeight: 600,
                                marginTop: '8px', lineHeight: 1.4
                            }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: 'middle' }}>
                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                                </svg>
                                {tender.organisationChain}
                            </div>
                        )}
                        {!tender.organisationChain && tender.department && (
                            <div style={{
                                fontSize: '11pt', color: '#084f9a', fontWeight: 600,
                                marginTop: '8px', display: 'flex', alignItems: 'center', gap: '5px'
                            }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                                </svg>
                                {tender.department}
                            </div>
                        )}
                    </>
                ) : (
                    /* ── GEM Tender Layout ── */
                    <>
                        <div className="tender-header-line">
                            <b><div className="tender-serial" style={{ fontSize: "10pt" }}>{serialNumber}.</div></b>
                            <span className="tender-id-bold" style={{ fontSize: "10pt" }}>Bid No: {tender.T_ID}</span>
                            <span className="tender-value-bold" style={{ fontSize: "10pt" }}>{formatValue(tender.value)}</span>
                            <b><span className="tender-date" style={{ fontSize: "10pt" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                Start: {(() => {
                                    if (!tender.startDate) return 'N/A';
                                    const dateMatch = tender.startDate.match(/(?:\d{2}[-\/]\d{2}[-\/]\d{4}|\d{4}[-\/]\d{2}[-\/]\d{2})(?: \d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?)?/);
                                    return dateMatch ? dateMatch[0] : tender.startDate;
                                })()}
                            </span></b>
                            <b><span className="tender-date" style={{ fontSize: "10pt" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                </svg>
                                End: {tender.endDate} <span className="days-left-badge" style={{ fontSize: "7.5pt" }}>{daysLeft} Days Left</span>
                            </span></b>
                            <b><span className="tender-emd" style={{ fontSize: "10pt" }}>EMD: {
                                tender.isScheduleBased
                                    ? <span style={{ color: '#007bff' }}>Schedule based Value</span>
                                    : (tender.emd > 0 ? `₹ ${tender.emd.toLocaleString()}` : 'N/A')
                            }</span></b>
                            <b><span className="tender-emd" style={{ fontSize: "10pt" }}>Est. Value: {tender.estimatedBidValue ? `₹ ${tender.estimatedBidValue.toLocaleString('en-IN')}` : 'N/A'}</span></b>
                        </div>

                        <span style={{ height: "2pt" }}></span>
                        <Link
                            to={`/tenders/tenderdetails/${encodeURIComponent(toTenderUrlId(tender.T_ID))}`}
                            className="tender-title-link" style={{ fontSize: "11.8pt", color: 'black' }}
                            target="_blank" rel="noopener noreferrer"
                        >
                            {tender.title} {tender.qty ? ` | QTY: ${tender.qty}` : ''}
                        </Link>
                        <span style={{ height: "2pt" }}></span>

                        <div className="tender-location-line" style={{
                            fontWeight: 755, fontSize: '12pt',
                            display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', color: '#084f9a'
                        }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                            </svg>
                            {tender.organisationName || tender.officeName
                                ? [tender.organisationName, tender.officeName].filter(Boolean).join(', ')
                                : tender.department}
                        </div>

                        {tender.keyword && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                                {tender.keyword.split(',').slice(0, 5).map((kw, i) => (
                                    <span key={i} style={{
                                        fontSize: '9pt', background: '#eef3fb', color: '#084f9a',
                                        border: '1px solid #c7d9f5', borderRadius: '4px',
                                        padding: '1px 7px', fontWeight: 600, letterSpacing: '0.01em'
                                    }}>
                                        {kw.trim()}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>


            <div className="tender-actions-block">

                {/* Top right button aligned with EMD */}
                <div className="tender-corrigendum-row">
                    {(() => {
                        const hasData = (data) => {
                            if (!data) return false;
                            if (Array.isArray(data)) return data.length > 0;
                            if (typeof data === 'object') return Object.keys(data).length > 0;
                            return false;
                        };

                        const hasRep = hasData(tender.Representation_json);
                        const hasCorr = hasData(tender.Corrigendum_json);

                        if (!hasRep && !hasCorr) {
                            if (!showCorrigendumOptions) {
                                return (
                                    <button
                                        className="tender-corrigendum-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowCorrigendumOptions(true);
                                        }}
                                    >
                                        View Corrigendum / Representation
                                    </button>
                                );
                            } else {
                                return (
                                    <button className="tender-corrigendum-btn" disabled style={{ opacity: 0.6, cursor: 'not-allowed', background: '#e5e7eb', color: '#666' }}>
                                        No Data Found
                                    </button>
                                );
                            }
                        }

                        if (hasRep && !hasCorr) {
                            return (
                                <button
                                    className="tender-corrigendum-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowRepresentationModal(true);
                                    }}
                                >
                                    View Representation
                                </button>
                            );
                        }

                        if (!hasRep && hasCorr) {
                            return (
                                <button
                                    className="tender-corrigendum-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowCorrigendumModal(true);
                                    }}
                                >
                                    View Corrigendum
                                </button>
                            );
                        }

                        // Both available
                        return !showCorrigendumOptions ? (
                            <button
                                className="tender-corrigendum-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowCorrigendumOptions(true);
                                }}
                            >
                                View Corrigendum / Representation
                            </button>
                        ) : (
                            <div className="tender-corrigendum-actions">
                                <button
                                    className="tender-corrigendum-subbtn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowRepresentationModal(true);
                                    }}
                                >
                                    View Representation
                                </button>

                                <button
                                    className="tender-corrigendum-subbtn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowCorrigendumModal(true);
                                    }}
                                >
                                    View Corrigendum
                                </button>
                            </div>
                        );
                    })()}
                </div>


                {/* Action buttons row */}
                <div className="tender-actions-icons-row">

                    <button
                        onClick={(e) => { e.stopPropagation(); onAction('status', tender); }}
                        className="action-icon-btn"
                        title="Tender status"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 11 12 14 22 4" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleInterest(tender.T_ID); }}
                        className={`action-icon-btn ${tender.interested ? 'interested-active' : ''}`}
                        title="Mark interested"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={tender.interested ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); onAction('assign', tender.T_ID); }}
                        className="action-icon-btn"
                        title="Assign tender"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); onAction('download', tender); }}
                        className="action-icon-btn"
                        title="Open in new tab"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>

                    <Link
                        to={`/tenders/tenderdetails/${encodeURIComponent(toTenderUrlId(tender.T_ID))}`}
                        className="action-icon-btn"
                        title="View tender details"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    </Link>

                    <button
                        onClick={(e) => { e.stopPropagation(); setShowNotRelevantConfirm(true); }}
                        className="action-icon-btn"
                        title="Mark as not relevant"
                        style={{ color: '#dc2626' }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>

                </div>
            </div>

            {showNotRelevantConfirm && (
                <div
                    onClick={() => setShowNotRelevantConfirm(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 2000,
                        background: 'rgba(0,0,0,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#fff', borderRadius: '12px',
                            boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
                            width: '420px', maxWidth: '90vw', padding: '28px 24px'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <span style={{
                                width: '40px', height: '40px', borderRadius: '50%',
                                background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </span>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111' }}>
                                Mark as Not Relevant?
                            </h3>
                        </div>
                        <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#555', lineHeight: 1.5 }}>
                            You are marking <strong>{tender.T_ID}</strong> as not relevant. Your name and reason will be recorded.
                        </p>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                                Reason <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <textarea
                                autoFocus
                                placeholder="Why is this tender not relevant? (e.g. wrong category, out of scope, already participated…)"
                                value={notRelevantReason}
                                onChange={e => setNotRelevantReason(e.target.value)}
                                rows={3}
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    padding: '10px 12px', borderRadius: '8px',
                                    border: '1.5px solid #e5e7eb', fontSize: '14px',
                                    resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                                    lineHeight: 1.5, color: '#111'
                                }}
                                onFocus={e => { e.target.style.borderColor = '#084f9a'; }}
                                onBlur={e => { e.target.style.borderColor = '#e5e7eb'; }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setShowNotRelevantConfirm(false); setNotRelevantReason(''); }}
                                style={{
                                    padding: '9px 18px', background: '#f3f4f6', color: '#555',
                                    border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                disabled={markingNotRelevant || !notRelevantReason.trim()}
                                onClick={async () => {
                                    if (!notRelevantReason.trim()) return;
                                    setMarkingNotRelevant(true);
                                    try {
                                        const token = localStorage.getItem('token');
                                        const res = await fetch(
                                            `${import.meta.env.VITE_API_BASE_URL}/tenders/${encodeURIComponent(tender.T_ID)}/not-relevant`,
                                            {
                                                method: 'PATCH',
                                                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ reason: notRelevantReason.trim() })
                                            }
                                        );
                                        if (res.ok) {
                                            setShowNotRelevantConfirm(false);
                                            setNotRelevantReason('');
                                            onMarkNotRelevant(tender.T_ID);
                                        } else {
                                            alert('Failed to mark as not relevant. Please try again.');
                                        }
                                    } catch {
                                        alert('Network error. Please try again.');
                                    } finally {
                                        setMarkingNotRelevant(false);
                                    }
                                }}
                                style={{
                                    padding: '9px 18px',
                                    background: markingNotRelevant || !notRelevantReason.trim() ? '#f87171' : '#dc2626',
                                    color: '#fff', border: 'none', borderRadius: '8px',
                                    fontWeight: 600, fontSize: '14px',
                                    cursor: markingNotRelevant || !notRelevantReason.trim() ? 'not-allowed' : 'pointer',
                                    opacity: !notRelevantReason.trim() ? 0.6 : 1
                                }}
                            >
                                {markingNotRelevant ? 'Marking…' : 'Yes, Mark Not Relevant'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showRepresentationModal && (
                <GenericTableModal
                    title="Representation Details"
                    data={tender.Representation_json}
                    onClose={() => setShowRepresentationModal(false)}
                />
            )}

            {showCorrigendumModal && (
                <GenericTableModal
                    title="Corrigendum Details"
                    data={tender.Corrigendum_json}
                    onClose={() => setShowCorrigendumModal(false)}
                />
            )}

        </div >
    );
};



const TenderSkeleton = () => {
    return (
        <div className="tender-row-compact shimmer">
            <div className="shimmer-line title"></div>
            <div className="shimmer-line short"></div>
            <div className="shimmer-line"></div>
        </div>
    );
};


export default function ArchivePage() {
    const [refreshKey, setRefreshKey] = useState(0);
    const [sortOrder, setSortOrder] = useState('startDateLatest');
    const [tenders, setTenders] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [selectedTender, setSelectedTender] = useState(null);
    const [activeTab, setActiveTab] = useState(
        () => sessionStorage.getItem('tenders_activeTab') || 'Diagno'
    );
    const [tenderType, setTenderType] = useState(
        () => sessionStorage.getItem('tenders_tenderType') || 'GEM'
    );

    // Filter states
    const [searchKeyword, setSearchKeyword] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [departmentName, setDepartmentName] = useState('');
    const [departmentOptions, setDepartmentOptions] = useState([]);
    const [showDeptPopup, setShowDeptPopup] = useState(false);
    const [deptSearch, setDeptSearch] = useState('');
    const [stateFilter, setStateFilter] = useState('');
    const [stateOptions, setStateOptions] = useState([]);
    const [showStatePopup, setShowStatePopup] = useState(false);
    const [stateSearch, setStateSearch] = useState('');
    const [closingFrom, setClosingFrom] = useState('');
    const [closingTo, setClosingTo] = useState('');
    const [preBidFrom, setPreBidFrom] = useState('');
    const [preBidTo, setPreBidTo] = useState('');
    // dept is derived from activeTab — no separate state needed
    const [perfectCat, setPerfectCat] = useState('perfect'); // 'perfect' | 'open'
    const [subCats, setSubCats] = useState([]); // selected sub-categories (multi)
    const [subCatOptions, setSubCatOptions] = useState([]); // fetched sub-cats
    const [subCatLoading, setSubCatLoading] = useState(false); // loading state
    const [showSubCatPopup, setShowSubCatPopup] = useState(false); // popup toggle
    const [subCatSearch, setSubCatSearch] = useState(''); // search inside popup

    // Export states
    const [showExportPopup, setShowExportPopup] = useState(false);
    const [exportStartDateFrom, setExportStartDateFrom] = useState('');
    const [exportStartDateTo, setExportStartDateTo] = useState('');

    // Endo pipeline state
    const [endoLoopRunning, setEndoLoopRunning] = useState(false);

    const scrapedQueriesRef = useRef(new Set());
    const pollIntervalRef = useRef(null);

    // Debounce search input — wait 300ms after user stops typing before firing fetch
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchKeyword), 300);
        return () => clearTimeout(timer);
    }, [searchKeyword]);

    useEffect(() => {
        sessionStorage.setItem('tenders_activeTab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        sessionStorage.setItem('tenders_tenderType', tenderType);
    }, [tenderType]);

    useEffect(() => {
        const fetchTenders = async (isRetry = false) => {
            try {
                setLoading(true);
                const token = localStorage.getItem('token');

                const params = new URLSearchParams({
                    page: 1,
                    // 360 Division has ~45k active rows — fetching/rendering all of them at once
                    // freezes the page, so cap it to a fast, renderable batch.
                    limit: activeTab === '360' ? 200 : 10000,
                    sort: sortOrder,
                    archived: 'false',
                    search: debouncedSearch,
                    departmentName: departmentName,
                    closingFrom: closingFrom,
                    closingTo: closingTo,
                    preBidFrom: preBidFrom,
                    preBidTo: preBidTo,
                    dept: activeTab,
                    perfectCat: perfectCat,
                    subCat: subCats.join(','),
                    tenderType: tenderType,
                    state: stateFilter
                });

                const res = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/tenders?${params.toString()}`,
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );

                const data = await res.json();

                // Fallback Logic: Try fetching tender metadata first, then trigger scraping
                if (
                    (!data.data || data.data.length === 0) && // No results found
                    searchKeyword &&                          // User is searching for something
                    !scrapedQueriesRef.current.has(searchKeyword) && // We haven't scraped this yet
                    !isRetry &&                               // Not a retry call
                    tenderType === 'GEM'                      // Only scrape for GEM tenders
                ) {
                    console.log(`No results found for "${searchKeyword}". Attempting fallback fetch...`);

                    // Step 1: Try to fetch basic tender metadata from fallback API
                    try {
                        const FALLBACK_API = import.meta.env.VITE_FALLBACK_TENDER_API || 'http://localhost:5080';
                        const fallbackRes = await fetch(`${FALLBACK_API}/get/tender?bid_no=${encodeURIComponent(searchKeyword.trim())}`);

                        if (fallbackRes.ok) {
                            const fallbackData = await fallbackRes.json();

                            if (fallbackData.status === 'success' && fallbackData.bid_number) {
                                console.log('Fallback API returned tender metadata:', fallbackData);

                                // Create temporary tender object with fetched metadata
                                const tempTender = {
                                    T_ID: fallbackData.bid_number,
                                    title: "⏳ Fetching full details...",
                                    department: "Loading...",
                                    startDate: "N/A",
                                    endDate: "N/A",
                                    qty: 0,
                                    value: 0,
                                    interested: false,
                                    detail_url: fallbackData.detail_url || '',
                                    ra_no: fallbackData.ra_no || '',
                                    Representation_json: fallbackData.representation,
                                    Corrigendum_json: fallbackData.corrigendum,
                                    location: '—',
                                    state: '—',
                                    emd: 0,
                                    status: 'Fetching...'
                                };

                                // Display the tender immediately
                                setTenders([tempTender]);
                                setTotalCount(1);

                                console.log('Displaying temporary tender. Triggering background scraping...');
                            }
                        } else {
                            console.warn('Fallback API failed:', fallbackRes.status);
                        }
                    } catch (fallbackErr) {
                        console.error('Failed to call fallback tender API:', fallbackErr);
                    }

                    // Step 2: Trigger background scraping (regardless of fallback API success)
                    try {
                        const SCRAPER_API = import.meta.env.VITE_SCRAPER_API || 'http://localhost:5080';

                        const scrapeRes = await fetch(`${SCRAPER_API}/scrape`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                query: searchKeyword.trim()
                            })
                        });

                        const scrapeData = await scrapeRes.json();

                        if (scrapeRes.ok && scrapeData.status === 'success') {
                            console.log('Scraping completed:', scrapeData.message);

                            scrapedQueriesRef.current.add(searchKeyword);

                            console.log('Polling for tender to appear in database...');
                            let attempts = 0;
                            const maxAttempts = 15;

                            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                            pollIntervalRef.current = setInterval(async () => {
                                attempts++;
                                console.log(`Polling attempt ${attempts}/${maxAttempts}...`);

                                try {
                                    const pollRes = await fetch(
                                        `${import.meta.env.VITE_API_BASE_URL}/tenders?${new URLSearchParams({
                                            page: 1,
                                            limit: 1,
                                            search: searchKeyword,
                                            archived: 'true'
                                        })}`,
                                        {
                                            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                                        }
                                    );

                                    const pollData = await pollRes.json();

                                    if (pollData.data && pollData.data.length > 0) {
                                        console.log('✅ Tender found in database! Refreshing...');
                                        clearInterval(pollIntervalRef.current);
                                        pollIntervalRef.current = null;
                                        setRefreshKey(prev => prev + 1);
                                    }
                                    else if (attempts >= maxAttempts) {
                                        console.warn('⏱️ Polling timeout. Forcing refresh anyway.');
                                        clearInterval(pollIntervalRef.current);
                                        pollIntervalRef.current = null;
                                        setRefreshKey(prev => prev + 1);
                                    }
                                } catch (pollErr) {
                                    console.error('Polling error:', pollErr);
                                }
                            }, 2000);

                            return;
                        }
                        else {
                            console.warn('Scraping failed:', scrapeData);
                        }


                        if (scrapeRes.ok) {
                            console.log("Scraping successful. Retrying fetch...");
                            scrapedQueriesRef.current.add(searchKeyword);
                            await fetchTenders(true);
                            return;
                        } else {
                            console.warn("Scraping failed with status:", scrapeRes.status);
                        }
                    } catch (scrapeErr) {
                        console.error("Failed to call scraping service:", scrapeErr);
                    }
                }

                const tendersData = (data.data || []).map(t => {
                    let emdAmount = 0;
                    let preBidDate = null;
                    let preBidTime = null;
                    let extractedTitle = null;
                    let estimatedBidValue = null;
                    let scheduleCount = 0; // Track number of schedules (based on EMDs found)
                    const processedRows = new Set(); // Deduplication for multi-page tables

                    // Parse the embedded JSON if available (Optimized: No extra API call)
                    if (t.json_details) {
                        try {
                            let json = t.json_details;
                            if (typeof json === 'string') {
                                json = JSON.parse(json);
                            }

                            const pages = Array.isArray(json.pages) ? json.pages : [];

                            pages.forEach(page => {
                                (page.tables || []).forEach(table => {
                                    // Detect pre-bid table
                                    const isPreBidTable = table.some(row =>
                                        row.some(cell =>
                                            cell && String(cell).toLowerCase().includes("pre-bid")
                                        )
                                    );

                                    if (isPreBidTable && table.length >= 2) {
                                        const headerRow = table[0];
                                        const valueRow = table[1];

                                        headerRow.forEach((header, idx) => {
                                            if (!header) return;
                                            const h = String(header).toLowerCase();
                                            const value = valueRow[idx];

                                            if (h.includes("pre-bid")) {
                                                // Validate date format (DD-MM-YYYY or similar)
                                                // Avoid picking up addresses like "Cats Building..."
                                                const dateRegex = /\d{2}[-\/]\d{2}[-\/]\d{4}/;

                                                if (dateRegex.test(value)) {
                                                    if (value?.includes(' ')) {
                                                        const parts = value.split(' ');
                                                        preBidDate = parts[0];
                                                        preBidTime = parts.slice(1).join(' ');
                                                    } else {
                                                        preBidDate = value;
                                                    }
                                                }
                                            }
                                        });
                                    }

                                    // Regular key-value rows
                                    table.forEach(([key, value]) => {
                                        if (!key || !value) return;

                                        // Deduplication check
                                        const rowId = String(key).trim().toLowerCase() + '|||' + String(value).trim().toLowerCase();
                                        if (processedRows.has(rowId)) return;
                                        processedRows.add(rowId);

                                        const k = String(key).toLowerCase();

                                        if (k.includes("emd") || k.includes("earnest money")) {
                                            const clean = String(value)
                                                .replace(/,/g, '')
                                                .replace(/[^\d.]/g, '');
                                            // Sum up EMD amounts (e.g. Schedule 1, Schedule 2...)
                                            const val = Number(clean);
                                            if (!isNaN(val)) {
                                                emdAmount += val;
                                                scheduleCount++;
                                            }
                                        }

                                        // Extract Estimated Bid Value
                                        if (k.includes("estimated") || k.includes("bid value") || k.includes("approximate value")) {
                                            const clean = String(value)
                                                .replace(/,/g, '')
                                                .replace(/[^\d.]/g, '');
                                            estimatedBidValue = Number(clean) || estimatedBidValue;
                                        }

                                        if (
                                            !preBidDate &&
                                            (k.includes("pre bid") || k.includes("pre-bid"))
                                        ) {
                                            const dateRegex = /\d{2}[-\/]\d{2}[-\/]\d{4}/;
                                            if (dateRegex.test(value)) {
                                                if (value.includes(' ')) {
                                                    const parts = value.split(' ');
                                                    preBidDate = parts[0];
                                                    preBidTime = parts.slice(1).join(' ');
                                                } else {
                                                    preBidDate = value;
                                                }
                                            }
                                        }

                                        // Extract title/items if database title is empty
                                        if (!extractedTitle && (!t.title || t.title.trim() === '')) {
                                            if (k.includes("item category") || k.includes("boq title") || k.includes("items")) {
                                                extractedTitle = String(value).trim();
                                            }
                                        }
                                    });
                                });
                            });

                        } catch (parseErr) {
                            console.error('Error parsing embedded JSON details:', parseErr);
                        }
                    }

                    const preBidDisplay = preBidDate
                        ? `${preBidDate}${preBidTime ? ' ' + preBidTime : ''}`
                        : null;

                    return {
                        T_ID: t.T_ID,
                        refNo: t.ref_no || null,
                        organisationChain: t.organisation_chain || null,
                        organisationName: t.organisationName || null,
                        officeName: t.officeName || null,
                        title: extractedTitle || t.title,
                        department: t.department,
                        startDate: preBidDisplay || t.startDate || t.start_date,
                        endDate: t.end_date,
                        qty: Number(t.qty) || 0,
                        value: Number(t.value) || 0,
                        interested: t.interested,
                        detail_url: t.detail_url,
                        location: '—',
                        state: '—',
                        emd: emdAmount || Number(t.emd) || 0,
                        estimatedBidValue: estimatedBidValue || Number(t.estimatedBidValue) || 0,
                        status: 'Closed',
                        Representation_json: t.Representation_json,
                        Corrigendum_json: t.Corrigendum_json,
                        isScheduleBased: scheduleCount > 1,
                        keyword: t.keyword || null,
                        isOpenTender: tenderType === 'Open'
                    };
                });

                setTenders(tendersData);
                setTotalCount(typeof data.total === 'number' ? data.total : tendersData.length);

                // Removed: fetchEMDAmounts(tendersData); (Optimized away)
            } catch (err) {
                console.error('Failed to fetch tenders', err);
            } finally {
                if (!isRetry) {
                    setLoading(false);
                }
            }
        };

        fetchTenders();

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        };
    }, [sortOrder, debouncedSearch, departmentName, stateFilter, closingFrom, closingTo, preBidFrom, preBidTo, activeTab, perfectCat, subCats, refreshKey, tenderType]);

    // Fetch sub-category options from product_categories table
    useEffect(() => {
        setSubCatOptions([]);
        setSubCats([]);
        setShowSubCatPopup(false);
        setSubCatLoading(true);
        const token = localStorage.getItem('token');
        const deptParam = activeTab === 'Endo' ? 'endo' : activeTab === '360' ? '360' : 'diagnostic';
        const typeParam = perfectCat === 'open' ? 'Open' : 'Perfect';
        fetch(`${import.meta.env.VITE_API_BASE_URL}/tenders/subcats?dept=${deptParam}&type=${typeParam}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) setSubCatOptions(data.data || []);
            })
            .catch(err => console.error('Failed to fetch sub-cats:', err))
            .finally(() => setSubCatLoading(false));
    }, [perfectCat, activeTab]);

    // Fetch endo loop status when Endo + Open Category is active
    useEffect(() => {
        if (activeTab !== 'Endo' || perfectCat !== 'open') return;
        const ENDO_SERVER = import.meta.env.VITE_ENDO_PIPELINE_URL || 'http://localhost:5170';
        fetch(`${ENDO_SERVER}/api/endo-loop/status`)
            .then(r => r.json())
            .then(data => setEndoLoopRunning(!!data.running))
            .catch(() => {});
    }, [activeTab, perfectCat]);

    // Fetch department options on mount
    useEffect(() => {
        const fetchDepartments = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/tenders/departments`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    setDepartmentOptions(data.data);
                }
            } catch (err) {
                console.error("Failed to fetch departments:", err);
            }
        };
        fetchDepartments();
    }, []);

    // Fetch state options whenever the GEM/Open tab changes
    useEffect(() => {
        const fetchStates = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/tenders/states?tenderType=${tenderType}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    setStateOptions(data.data);
                }
            } catch (err) {
                console.error("Failed to fetch states:", err);
            }
        };
        fetchStates();
    }, [tenderType]);


    const sortedTenders = useMemo(() => {
        return [...tenders].sort((a, b) =>
            sortOrder === 'asc' ? a.value - b.value : b.value - a.value
        );
    }, [tenders, sortOrder]);

    const handleAction = (action, tender) => {
        if (action === 'download') {
            if (tender.detail_url) {
                window.open(tender.detail_url, '_blank', 'noopener,noreferrer');
            } else {
                alert('Detail URL not available');
            }
            return;
        }

        if (action === 'status') {
            setSelectedTender(tender);
            setShowStatusModal(true);
            return;
        }

        console.log(`Action: ${action}`, tender);
    };


    const handleToggleInterest = async (tid) => {
        try {
            const token = localStorage.getItem('token');

            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/tenders/${tid.replace(/\//g, '_')}/interest`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (data.success) {
                // Update the local state with the new interest status
                setTenders(prev =>
                    prev.map(t =>
                        t.T_ID === tid ? { ...t, interested: data.data.is_interested === 1 } : t
                    )
                );

                // Show success message
                console.log(data.message);
            } else {
                // Show error message
                console.error('Failed to toggle interest:', data.message);
                alert(data.message || 'Failed to update interest status');
            }
        } catch (err) {
            console.error('Failed to toggle interest', err);
            alert('Failed to update interest status. Please try again.');
        }
    };

    const handleMarkNotRelevant = (tid) => {
        setTenders(prev => prev.filter(t => t.T_ID !== tid));
    };


    const handleClearFilters = () => {
        setSearchKeyword('');
        setDebouncedSearch('');
        setDepartmentName('');
        setDeptSearch('');
        setStateFilter('');
        setStateSearch('');
        setClosingFrom('');
        setClosingTo('');
        setPreBidFrom('');
        setPreBidTo('');
        setPerfectCat('perfect');
        setSubCats([]);
        setSubCatOptions([]);
        setShowSubCatPopup(false);
        setSubCatSearch('');
    };

    const handleSearch = () => {
        setRefreshKey(prev => prev + 1);
    };

    const handleExport = async () => {
        if (!exportStartDateFrom || !exportStartDateTo) {
            alert('Please select both start and end dates for the export.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({
                startDateFrom: exportStartDateFrom,
                startDateTo: exportStartDateTo,
                tenderType: tenderType,
                search: searchKeyword,
                departmentName: departmentName,
                closingFrom: closingFrom,
                closingTo: closingTo,
                preBidFrom: preBidFrom,
                preBidTo: preBidTo,
                dept: activeTab,
                perfectCat: perfectCat,
                subCat: subCats.join(',')
            });

            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/tenders/export?${params.toString()}`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || 'Export failed');
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tenders_export_${exportStartDateFrom}_to_${exportStartDateTo}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setShowExportPopup(false);
        } catch (err) {
            console.error('Export Error:', err);
            alert(`Failed to export tenders: ${err.message}`);
        }
    };

    const handleToggleEndoLoop = async () => {
        const ENDO_SERVER = import.meta.env.VITE_ENDO_PIPELINE_URL || 'http://localhost:5170';
        const endpoint = endoLoopRunning ? 'stop' : 'start';
        try {
            const res = await fetch(`${ENDO_SERVER}/api/endo-loop/${endpoint}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) setEndoLoopRunning(!endoLoopRunning);
            else alert(data.error || `Failed to ${endpoint} endo pipeline`);
        } catch (err) {
            alert(`Could not reach Endo Pipeline server: ${err.message}`);
        }
    };

    return (
        <div className="archive-page">
            <header className="archive-page-header">
                <h1>Active Tenders</h1>
            </header>

            {/* Category Tabs + Tender Type Filter — single row */}
            <div className="category-tabs-modern">
                <button
                    className={`tab-modern ${activeTab === 'Diagno' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Diagno')}
                >
                    <Activity size={20} />
                    <span>Diagnostic Division</span>
                    <div className="tab-indicator"></div>
                </button>
                <button
                    className={`tab-modern ${activeTab === 'Endo' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Endo')}
                >
                    <Package size={20} />
                    <span>EndoSurgery Division</span>
                    <div className="tab-indicator"></div>
                </button>
                <button
                    className={`tab-modern ${activeTab === '360' ? 'active' : ''}`}
                    onClick={() => setActiveTab('360')}
                >
                    <Boxes size={20} />
                    <span>360 Division</span>
                    <div className="tab-indicator"></div>
                </button>

            </div>

            <div className="archive-search-filter-section">
                <div className="archive-search-bar-container">
                    {/* Tender type selector */}
                    <div className="tender-type-pills" style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                            className={`tender-type-pill ${tenderType === 'GEM' ? 'active gem' : ''}`}
                            onClick={() => { setTenderType('GEM'); setTenders([]); setLoading(true); }}
                        >
                            GEM
                        </button>
                        <button
                            className={`tender-type-pill ${tenderType === 'Open' ? 'active open' : ''}`}
                            onClick={() => {
                                setTenderType('Open');
                                setPerfectCat('perfect');
                                setSubCats([]);
                                setTenders([]);
                                setLoading(true);
                            }}
                        >
                            Open
                        </button>
                    </div>

                    <div className="archive-search-input-wrapper">
                        <svg className="archive-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                        </svg>
                        <input
                            type="text"
                            placeholder={tenderType === 'Open' ? 'Search open tenders…' : 'Search GEM tenders…'}
                            value={searchKeyword}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSearchKeyword(val);
                                if (val && sortOrder !== 'relevance') setSortOrder('relevance');
                                if (!val) setSortOrder('startDateLatest');
                            }}
                            className="archive-main-search-input"
                        />
                    </div>

                    <button
                        className="archive-filter-toggle-btn"
                        onClick={() => setShowExportPopup(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, paddingRight: '12px' }}
                        title="Export to Excel"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Export
                    </button>
                    <button
                        className="archive-filter-toggle-btn"
                        onClick={() => setShowFilters(prev => !prev)}
                        title="Toggle Filters"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                </div>

                {/* Export Popup Modal */}
                {showExportPopup && (
                    <div className="modal-overlay" onClick={() => setShowExportPopup(false)} style={{ zIndex: 3000 }}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', borderRadius: '12px' }}>
                            <div className="modal-header" style={{ padding: '20px', backgroundColor: '#084f9a', color: 'white', borderRadius: '12px 12px 0 0' }}>
                                <h3 style={{ margin: 0, fontSize: '18px', color: 'white' }}>Export Tenders</h3>
                                <button className="modal-close" onClick={() => setShowExportPopup(false)} style={{ color: 'white', fontSize: '24px' }}>&times;</button>
                            </div>
                            <div style={{ padding: '24px' }}>
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px', fontWeight: 'bold' }}>Start Date (From)</label>
                                    <input
                                        type="date"
                                        className="archive-filter-input"
                                        style={{ width: '100%', boxSizing: 'border-box' }}
                                        value={exportStartDateFrom}
                                        onChange={(e) => setExportStartDateFrom(e.target.value)}
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: '24px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px', fontWeight: 'bold' }}>Start Date (To)</label>
                                    <input
                                        type="date"
                                        className="archive-filter-input"
                                        style={{ width: '100%', boxSizing: 'border-box' }}
                                        value={exportStartDateTo}
                                        onChange={(e) => setExportStartDateTo(e.target.value)}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={() => setShowExportPopup(false)}
                                        style={{ padding: '10px 16px', background: '#e5e7eb', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleExport}
                                        style={{ padding: '10px 16px', background: '#084f9a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                            <polyline points="7 10 12 15 17 10"></polyline>
                                            <line x1="12" y1="15" x2="12" y2="3"></line>
                                        </svg>
                                        Download Excel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className={`archive-filters-panel ${showFilters ? 'show' : ''}`}>
                    <div className="archive-filters-grid">
                        <div className="archive-filter-input-wrapper" style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowDeptPopup(p => !p)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #e5e7eb',
                                    background: departmentName ? '#084f9a' : '#fff',
                                    color: departmentName ? '#fff' : '#666',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    height: '36px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {departmentName || 'Department Name'}
                                </span>
                                <span>▾</span>
                            </button>

                            {showDeptPopup && (
                                <div
                                    onClick={() => setShowDeptPopup(false)}
                                    style={{
                                        position: 'fixed',
                                        inset: 0,
                                        zIndex: 1000,
                                        background: 'rgba(0,0,0,0.45)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <div
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                            background: '#fff',
                                            borderRadius: '12px',
                                            boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
                                            width: '420px',
                                            maxWidth: '90vw',
                                            maxHeight: '80vh',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
                                            background: '#084f9a', borderRadius: '12px 12px 0 0'
                                        }}>
                                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>
                                                Select Department
                                            </span>
                                            <button
                                                onClick={() => { setShowDeptPopup(false); setDeptSearch(''); }}
                                                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}
                                            >×</button>
                                        </div>

                                        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb' }}>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <svg style={{ position: 'absolute', left: '10px', opacity: 0.4, pointerEvents: 'none' }}
                                                    width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#084f9a" strokeWidth="2.5">
                                                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                                                </svg>
                                                <input
                                                    type="text"
                                                    placeholder="Search departments..."
                                                    value={deptSearch}
                                                    onChange={e => setDeptSearch(e.target.value)}
                                                    autoFocus
                                                    style={{
                                                        width: '100%', padding: '8px 32px 8px 34px',
                                                        borderRadius: '7px', border: '1.5px solid #e5e7eb',
                                                        fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                                                    }}
                                                />
                                                {deptSearch && (
                                                    <button onClick={() => setDeptSearch('')}
                                                        style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '16px', lineHeight: 1 }}
                                                    >&times;</button>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: '12px',
                                                padding: '10px 20px', cursor: 'pointer', fontSize: '14px',
                                                background: departmentName === '' ? '#eef3fb' : 'transparent',
                                                fontWeight: departmentName === '' ? 600 : 400,
                                                borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s'
                                            }}>
                                                <input
                                                    type="radio"
                                                    name="deptRadio"
                                                    checked={departmentName === ''}
                                                    onChange={() => {
                                                        setDepartmentName('');
                                                        setShowDeptPopup(false);
                                                        setDeptSearch('');
                                                    }}
                                                    style={{ accentColor: '#084f9a', width: '16px', height: '16px', flexShrink: 0 }}
                                                />
                                                All Departments
                                            </label>
                                            {departmentOptions
                                                .filter(d => d.toLowerCase().includes(deptSearch.toLowerCase()))
                                                .map((d, i) => (
                                                    <label key={i} style={{
                                                        display: 'flex', alignItems: 'center', gap: '12px',
                                                        padding: '10px 20px', cursor: 'pointer', fontSize: '14px',
                                                        background: departmentName === d ? '#eef3fb' : 'transparent',
                                                        fontWeight: departmentName === d ? 600 : 400,
                                                        borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s'
                                                    }}>
                                                        <input
                                                            type="radio"
                                                            name="deptRadio"
                                                            checked={departmentName === d}
                                                            onChange={() => {
                                                                setDepartmentName(d);
                                                                setShowDeptPopup(false);
                                                                setDeptSearch('');
                                                            }}
                                                            style={{ accentColor: '#084f9a', width: '16px', height: '16px', flexShrink: 0 }}
                                                        />
                                                        {d}
                                                    </label>
                                                ))}
                                        </div>

                                        <div style={{
                                            padding: '14px 20px', borderTop: '1px solid #e5e7eb',
                                            display: 'flex', gap: '10px', justifyContent: 'flex-end'
                                        }}>
                                            <button
                                                onClick={() => { setShowDeptPopup(false); setDeptSearch(''); }}
                                                style={{
                                                    padding: '8px 18px', background: '#f3f4f6', color: '#555',
                                                    border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer'
                                                }}
                                            >Cancel</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="archive-filter-input-wrapper" style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowStatePopup(p => !p)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #e5e7eb',
                                    background: stateFilter ? '#084f9a' : '#fff',
                                    color: stateFilter ? '#fff' : '#666',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    height: '36px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {stateFilter || 'State'}
                                </span>
                                <span>▾</span>
                            </button>

                            {showStatePopup && (
                                <div
                                    onClick={() => setShowStatePopup(false)}
                                    style={{
                                        position: 'fixed',
                                        inset: 0,
                                        zIndex: 1000,
                                        background: 'rgba(0,0,0,0.45)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <div
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                            background: '#fff',
                                            borderRadius: '12px',
                                            boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
                                            width: '420px',
                                            maxWidth: '90vw',
                                            maxHeight: '80vh',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
                                            background: '#084f9a', borderRadius: '12px 12px 0 0'
                                        }}>
                                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>
                                                Select State
                                            </span>
                                            <button
                                                onClick={() => { setShowStatePopup(false); setStateSearch(''); }}
                                                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}
                                            >×</button>
                                        </div>

                                        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb' }}>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <svg style={{ position: 'absolute', left: '10px', opacity: 0.4, pointerEvents: 'none' }}
                                                    width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#084f9a" strokeWidth="2.5">
                                                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                                                </svg>
                                                <input
                                                    type="text"
                                                    placeholder="Search states..."
                                                    value={stateSearch}
                                                    onChange={e => setStateSearch(e.target.value)}
                                                    autoFocus
                                                    style={{
                                                        width: '100%', padding: '8px 32px 8px 34px',
                                                        borderRadius: '7px', border: '1.5px solid #e5e7eb',
                                                        fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                                                    }}
                                                />
                                                {stateSearch && (
                                                    <button onClick={() => setStateSearch('')}
                                                        style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '16px', lineHeight: 1 }}
                                                    >&times;</button>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: '12px',
                                                padding: '10px 20px', cursor: 'pointer', fontSize: '14px',
                                                background: stateFilter === '' ? '#eef3fb' : 'transparent',
                                                fontWeight: stateFilter === '' ? 600 : 400,
                                                borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s'
                                            }}>
                                                <input
                                                    type="radio"
                                                    name="stateRadio"
                                                    checked={stateFilter === ''}
                                                    onChange={() => {
                                                        setStateFilter('');
                                                        setShowStatePopup(false);
                                                        setStateSearch('');
                                                    }}
                                                    style={{ accentColor: '#084f9a', width: '16px', height: '16px', flexShrink: 0 }}
                                                />
                                                All States
                                            </label>
                                            {stateOptions
                                                .filter(s => s.toLowerCase().includes(stateSearch.toLowerCase()))
                                                .map((s, i) => (
                                                    <label key={i} style={{
                                                        display: 'flex', alignItems: 'center', gap: '12px',
                                                        padding: '10px 20px', cursor: 'pointer', fontSize: '14px',
                                                        background: stateFilter === s ? '#eef3fb' : 'transparent',
                                                        fontWeight: stateFilter === s ? 600 : 400,
                                                        borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s'
                                                    }}>
                                                        <input
                                                            type="radio"
                                                            name="stateRadio"
                                                            checked={stateFilter === s}
                                                            onChange={() => {
                                                                setStateFilter(s);
                                                                setShowStatePopup(false);
                                                                setStateSearch('');
                                                            }}
                                                            style={{ accentColor: '#084f9a', width: '16px', height: '16px', flexShrink: 0 }}
                                                        />
                                                        {s}
                                                    </label>
                                                ))}
                                        </div>

                                        <div style={{
                                            padding: '14px 20px', borderTop: '1px solid #e5e7eb',
                                            display: 'flex', gap: '10px', justifyContent: 'flex-end'
                                        }}>
                                            <button
                                                onClick={() => { setShowStatePopup(false); setStateSearch(''); }}
                                                style={{
                                                    padding: '8px 18px', background: '#f3f4f6', color: '#555',
                                                    border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer'
                                                }}
                                            >Cancel</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="archive-filter-input-wrapper">
                            <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>Closing From</label>
                            <input type="date" value={closingFrom} onChange={(e) => setClosingFrom(e.target.value)} className="archive-filter-input" />
                        </div>
                        <div className="archive-filter-input-wrapper">
                            <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>Closing To</label>
                            <input type="date" value={closingTo} onChange={(e) => setClosingTo(e.target.value)} className="archive-filter-input" />
                        </div>
                        {tenderType === 'GEM' && (<>
                        <div className="archive-filter-input-wrapper">
                            <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>Pre-bid From</label>
                            <input type="date" value={preBidFrom} onChange={(e) => setPreBidFrom(e.target.value)} className="archive-filter-input" />
                        </div>
                        <div className="archive-filter-input-wrapper">
                            <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>Pre-bid To</label>
                            <input type="date" value={preBidTo} onChange={(e) => setPreBidTo(e.target.value)} className="archive-filter-input" />
                        </div>
                        </>)}
                    </div>

                    {tenderType === 'GEM' && (
                    <div className="archive-filters-row">
                        <div className="archive-filter-group">
                            <span className="archive-filter-label">Category Type:</span>
                            <button
                                style={{
                                    background: perfectCat === 'perfect' ? '#084f9a' : '#e5e7eb',
                                    color: perfectCat === 'perfect' ? '#fff' : '#333',
                                    border: 'none', borderRadius: '6px', padding: '4px 14px',
                                    cursor: 'pointer', fontWeight: 600, fontSize: '13px'
                                }}
                                onClick={() => setPerfectCat('perfect')}
                            >Perfect Category</button>
                            <button
                                style={{
                                    background: perfectCat === 'open' ? '#084f9a' : '#e5e7eb',
                                    color: perfectCat === 'open' ? '#fff' : '#333',
                                    border: 'none', borderRadius: '6px', padding: '4px 14px',
                                    cursor: 'pointer', fontWeight: 600, fontSize: '13px'
                                }}
                                onClick={() => setPerfectCat('open')}
                            >Open Category</button>
                        </div>
                    </div>
                    )}

                    {tenderType === 'GEM' && perfectCat === 'perfect' && (
                        <div className="archive-filters-row">
                            <div className="archive-filter-group" style={{ position: 'relative' }}>
                                <span className="archive-filter-label">Sub-Category:</span>
                                <button
                                    onClick={() => !subCatLoading && subCatOptions.length > 0 && setShowSubCatPopup(p => !p)}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '6px',
                                        border: '1.5px solid #084f9a',
                                        background: subCats.length > 0 ? '#084f9a' : '#fff',
                                        color: subCats.length > 0 ? '#fff' : '#084f9a',
                                        fontWeight: 600,
                                        fontSize: '13px',
                                        cursor: subCatLoading || subCatOptions.length === 0 ? 'not-allowed' : 'pointer',
                                        minWidth: '180px',
                                        textAlign: 'left',
                                        opacity: subCatLoading ? 0.6 : 1,
                                    }}
                                >
                                    {subCatLoading
                                        ? 'Loading…'
                                        : subCats.length === 0
                                            ? `All Sub-Categories (${subCatOptions.length}) ▾`
                                            : `${subCats.length} selected ▾`}
                                </button>

                                {showSubCatPopup && (
                                    /* Full-screen overlay backdrop */
                                    <div
                                        onClick={() => setShowSubCatPopup(false)}
                                        style={{
                                            position: 'fixed',
                                            inset: 0,
                                            zIndex: 1000,
                                            background: 'rgba(0,0,0,0.45)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        {/* Modal card */}
                                        <div
                                            onClick={e => e.stopPropagation()}
                                            style={{
                                                background: '#fff',
                                                borderRadius: '12px',
                                                boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
                                                width: '420px',
                                                maxWidth: '90vw',
                                                maxHeight: '80vh',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            {/* Header */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '16px 20px',
                                                borderBottom: '1px solid #e5e7eb',
                                                background: '#084f9a',
                                                borderRadius: '12px 12px 0 0'
                                            }}>
                                                <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>
                                                    Select Sub-Categories
                                                </span>
                                                <button
                                                    onClick={() => setShowSubCatPopup(false)}
                                                    style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}
                                                >×</button>
                                            </div>

                                            {/* Search box */}
                                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb' }}>
                                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                    <svg style={{ position: 'absolute', left: '10px', opacity: 0.4, pointerEvents: 'none' }}
                                                        width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#084f9a" strokeWidth="2.5">
                                                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                                                    </svg>
                                                    <input
                                                        type="text"
                                                        placeholder="Search sub-categories..."
                                                        value={subCatSearch}
                                                        onChange={e => setSubCatSearch(e.target.value)}
                                                        autoFocus
                                                        style={{
                                                            width: '100%',
                                                            padding: '8px 32px 8px 34px',
                                                            borderRadius: '7px',
                                                            border: '1.5px solid #e5e7eb',
                                                            fontSize: '13px',
                                                            outline: 'none',
                                                            boxSizing: 'border-box'
                                                        }}
                                                    />
                                                    {subCatSearch && (
                                                        <button onClick={() => setSubCatSearch('')}
                                                            style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '16px', lineHeight: 1 }}
                                                        >&times;</button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Select All / Clear */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '10px 20px',
                                                borderBottom: '1px solid #e5e7eb',
                                                background: '#f8faff'
                                            }}>
                                                <button
                                                    onClick={() => setSubCats([...subCatOptions])}
                                                    style={{ fontSize: '13px', color: '#084f9a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                                                >✔ Select All</button>
                                                <span style={{ color: '#ddd' }}>|</span>
                                                <button
                                                    onClick={() => setSubCats([])}
                                                    style={{ fontSize: '13px', color: '#e53e3e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                                                >✕ Clear</button>
                                                {subCats.length > 0 && (
                                                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#084f9a', fontWeight: 600, background: '#eef3fb', borderRadius: '20px', padding: '2px 10px' }}>
                                                        {subCats.length} selected
                                                    </span>
                                                )}
                                            </div>

                                            {/* Checklist */}
                                            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
                                                {subCatOptions
                                                    .filter(cat => cat.toLowerCase().includes(subCatSearch.toLowerCase()))
                                                    .map((cat, i) => (
                                                        <label key={i} style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '12px',
                                                            padding: '10px 20px',
                                                            cursor: 'pointer',
                                                            fontSize: '14px',
                                                            background: subCats.includes(cat) ? '#eef3fb' : 'transparent',
                                                            fontWeight: subCats.includes(cat) ? 600 : 400,
                                                            borderBottom: '1px solid #f3f4f6',
                                                            transition: 'background 0.15s'
                                                        }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={subCats.includes(cat)}
                                                                onChange={() => {
                                                                    setSubCats(prev =>
                                                                        prev.includes(cat)
                                                                            ? prev.filter(c => c !== cat)
                                                                            : [...prev, cat]
                                                                    );
                                                                }}
                                                                style={{ accentColor: '#084f9a', width: '16px', height: '16px', flexShrink: 0 }}
                                                            />
                                                            {cat}
                                                        </label>
                                                    ))}
                                            </div>

                                            {/* Footer */}
                                            <div style={{
                                                padding: '14px 20px',
                                                borderTop: '1px solid #e5e7eb',
                                                display: 'flex',
                                                gap: '10px'
                                            }}>
                                                <button
                                                    onClick={() => setShowSubCatPopup(false)}
                                                    style={{
                                                        flex: 1, padding: '10px',
                                                        background: '#084f9a', color: '#fff',
                                                        border: 'none', borderRadius: '8px',
                                                        fontWeight: 700, fontSize: '14px', cursor: 'pointer'
                                                    }}
                                                >Apply Filter</button>
                                                <button
                                                    onClick={() => { setSubCats([]); setShowSubCatPopup(false); }}
                                                    style={{
                                                        padding: '10px 18px',
                                                        background: '#f3f4f6', color: '#555',
                                                        border: 'none', borderRadius: '8px',
                                                        fontWeight: 600, fontSize: '14px', cursor: 'pointer'
                                                    }}
                                                >Cancel</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="archive-filters-actions">
                        <button className="archive-btn-search" onClick={handleSearch}>Search</button>
                        <button className="archive-btn-clear" onClick={handleClearFilters}>Clear</button>
                        {tenderType === 'GEM' && activeTab === 'Endo' && perfectCat === 'open' && (
                            <button
                                onClick={handleToggleEndoLoop}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: endoLoopRunning ? '#dc3545' : '#198754',
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}
                                title={endoLoopRunning ? 'Stop Endo background pipeline' : 'Start Endo background pipeline (2 concurrent)'}
                            >
                                <span style={{ fontSize: '10px' }}>{endoLoopRunning ? '⏹' : '▶'}</span>
                                {endoLoopRunning ? 'Stop Endo Pipeline' : 'Run Endo Pipeline'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="archive-sort-section">
                <div className="archive-results-count">
                    {totalCount} {tenderType} tenders found
                    {totalCount > sortedTenders.length ? ` (showing ${sortedTenders.length})` : ''}
                </div>
                <div className="archive-sort-controls">
                    <label htmlFor="archive-sort-select">Sort By:</label>
                    <select id="archive-sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="archive-sort-select">
                        <option value="relevance">Most Relevant</option>
                        <option value="startDateLatest">Bid Start Date - Latest First</option>
                        <option value="startDateOldest">Bid Start Date - Oldest First</option>
                        <option value="endDateLatest">Bid End Date - Latest First</option>
                        <option value="endDateOldest">Bid End Date - Oldest First</option>
                    </select>
                </div>
            </div>

            <div className="tenders-list-compact">
                {loading
                    ? Array.from({ length: 10 }).map((_, i) => (
                        <TenderSkeleton key={i} />
                    ))
                    : sortedTenders.map((tender, index) => (
                        <TenderRow
                            key={tender.T_ID}
                            tender={tender}
                            serialNumber={index + 1}
                            onAction={handleAction}
                            onToggleInterest={handleToggleInterest}
                            onMarkNotRelevant={handleMarkNotRelevant}
                        />
                    ))}
            </div>


            {sortedTenders.length === 0 && !loading && (
                <div className="archive-no-results">No {tenderType} tenders found matching your filters.</div>
            )}

            {showStatusModal && selectedTender && (
                <TenderStatusModal
                    tender={selectedTender}
                    onClose={() => {
                        setShowStatusModal(false);
                        setSelectedTender(null);
                    }}
                />
            )}
        </div>
    );
}
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Clock, FileText, FileSignature, CheckCircle2, ExternalLink, Table2, Eye, Maximize2, Minimize2, XCircle, AlertTriangle, ThumbsUp } from 'lucide-react';

/**
 * Approval queue.
 *
 * A Tender Admin sees requests raised by Tender Executives in their own
 * department (division AND source must both match — enforced server-side in
 * approvals.controller.js). Admin sees every request. A Tender Executive
 * landing here sees only their own requests, read-only.
 */

const TYPE_LABEL = {
    tender_proceed: { label: 'Mark as Proceed', Icon: CheckCircle2 },
    representation: { label: 'Representation', Icon: FileSignature },
    document: { label: 'Document finalisation', Icon: FileText },
    process_decode: { label: 'Process Decode sheet', Icon: Table2 },
};

// Where a multi-stage request currently sits. Process Decode runs
// Sales -> Zonal Head -> Finance; everything else is a single stage.
const STAGE_LABEL = {
    zonal_head: { text: 'With Zonal Head', color: '#0369a1' },
    finance: { text: 'With Finance', color: '#7c3aed' },
    tender_admin: { text: 'With Tender Admin', color: '#d97706' },
};

const STATUSES = ['pending', 'approved', 'rejected'];

// Bid numbers contain slashes, which cannot sit in a path segment — the app
// swaps them for underscores and TenderDetails swaps them back.
/** Participation mode carried on a Process Decode payload, if present. */
const participationOf = (request) => {
    let p = request.payload;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return null; } }
    if (!p?.participation) return null;
    return p.participation === 'distributor'
        ? { label: 'Distributor', detail: p.distributorName || 'not named', color: '#7c3aed' }
        : { label: 'Direct', detail: null, color: '#0d9488' };
};

const tenderPath = (bidNumber) =>
    `/tenders/tenderdetails/${encodeURIComponent((bidNumber || '').replace(/\//g, '_'))}`;


/**
 * Submitted Process Decode sheet.
 *
 * Read-only once decided. While the request is still pending and the viewer is
 * the current approver, the cells are editable and can be saved back onto the
 * request — so a Zonal Head can correct a rate before approving instead of
 * rejecting over a typo.
 */
const SheetViewer = ({ request, canEdit, onSaved, onApprove, onReject, onClose }) => {
    // 17 columns do not fit a dialog on most screens, so the viewer can be
    // expanded to the full viewport. Available to every role, not just Finance.
    const [full, setFull] = useState(false);
    let payload = request.payload;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = null; }
    }
    const [rows, setRows] = useState(payload?.rows || []);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState(null);

    const setCell = (ri, key, value) =>
        setRows(prev => prev.map((r, i) => (i === ri ? { ...r, [key]: value } : r)));

    // Per-product verdict. Finance ticks or crosses each line; a cross needs a
    // comment, and those comments are what gets sent back to Sales and the
    // Zonal Head. Stored on the row so they travel with the sheet.
    const setVerdict = (ri, verdict) =>
        setRows(prev => prev.map((r, i) => (
            i === ri
                ? { ...r, review: verdict, review_comment: verdict === 'ok' ? '' : (r.review_comment || '') }
                : r
        )));

    const rejectedLines = rows
        .map((r, i) => ({ ...r, idx: i }))
        .filter(r => r.review === 'no');
    const missingComment = rejectedLines.some(r => !String(r.review_comment || '').trim());
    const reviewedCount = rows.filter(r => r.review === 'ok' || r.review === 'no').length;

    /** Sends the sheet back with the per-line comments attached. */
    const sendBack = async () => {
        if (!rejectedLines.length) { setSavedMsg('Cross at least one line to send it back'); return; }
        if (missingComment) { setSavedMsg('Every crossed line needs a comment'); return; }
        const ok = await saveSheet(true);
        if (!ok) { setSavedMsg('Could not save — nothing was sent back'); return; }
        const summary = rejectedLines
            .map(r => `${r.item || r.code || `Line ${r.idx + 1}`}: ${r.review_comment}`)
            .join(' | ');
        onReject?.(summary);
    };

    /** Persists the edited rows onto the request. Returns true on success. */
    const saveSheet = async (quiet = false) => {
        setSaving(true);
        if (!quiet) setSavedMsg(null);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/approvals/${request.id}/payload`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ payload: { ...payload, rows } }),
            });
            const json = await res.json();
            if (!quiet) setSavedMsg(json.success ? 'Changes saved' : (json.message || 'Could not save'));
            if (json.success) onSaved?.();
            return !!json.success;
        } catch {
            setSavedMsg('Could not reach the server');
            return false;
        } finally {
            setSaving(false);
        }
    };

    /**
     * Finance's third option: correct the rates and approve in one step, so a
     * price fix does not have to go back to Sales for a resubmission.
     */
    const saveAndApprove = async () => {
        const ok = await saveSheet(true);
        if (!ok) { setSavedMsg('Could not save — nothing was approved'); return; }
        onApprove?.('Updated pricing and approved');
    };
    // Dealer economics only exist on a distributor bid — hide them on a direct
    // one rather than showing three permanently empty columns.
    const dealerOnly = ['netRate', 'margin', 'quoteRate'];
    const cols = [
        ['sl', 'Sl'], ['tenderSl', 'Tender Sl.'], ['item', 'Surgical Item List'],
        ['addlSpec', 'Additional Specs'], ['qty', 'Qty'], ['code', 'Code'],
        ['relevancy', 'Relavancy'], ['deviation', 'Deviation/Remark'], ['brand', 'Brand'],
        ['packing', 'Packing'], ['gst', 'GST %'], ['hsn', 'HSN'], ['mrp', 'MRP/Box'],
        ['netRate', 'Net Rate'], ['margin', 'Margin'], ['quoteRate', 'Rate To Quote'],
        ['ourSpec', 'Our specification'],
    ].filter(([k]) => payload?.participation === 'distributor' || !dealerOnly.includes(k));

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px',
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: '#fff',
                borderRadius: full ? 0 : '12px',
                width: full ? '100vw' : 'min(1400px, 100%)',
                height: full ? '100vh' : undefined,
                maxHeight: full ? '100vh' : '92vh',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e6ecf5', display: 'flex', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Process Decode sheet</h3>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                            {request.bid_number}
                            {payload?.ratesFor ? ` · Rates for ${payload.ratesFor}` : ''}
                            {` · ${rows.length} item${rows.length === 1 ? '' : 's'}`}
                            {canEdit ? ` · ${reviewedCount}/${rows.length} checked` : ''}
                            {payload?.participation === 'distributor'
                                ? ` · Distributor participation — ${payload.distributorName || 'not named'}`
                                : payload?.participation === 'direct' ? ' · Direct participation' : ''}
                        </div>
                    </div>
                    <a
                        href={`/Admin/sheet/${request.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Open in a new tab"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px', marginRight: '10px',
                            fontSize: '12.5px', fontWeight: 600, color: '#084f9a', textDecoration: 'none',
                        }}
                    >
                        <ExternalLink size={14} /> New tab
                    </a>
                    <button
                        onClick={() => setFull(f => !f)}
                        title={full ? 'Exit full screen' : 'Full screen'}
                        style={{
                            border: 'none', background: 'none', cursor: 'pointer', color: '#64748b',
                            marginRight: '10px', display: 'inline-flex', alignItems: 'center',
                        }}
                    >
                        {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    {canEdit && (
                        <>
                            {savedMsg && <span style={{ fontSize: '12px', color: '#15803d', marginRight: '10px' }}>{savedMsg}</span>}
                            <button
                                onClick={sendBack}
                                disabled={saving || !rejectedLines.length}
                                title={rejectedLines.length ? 'Send the crossed lines back to Sales and the Zonal Head' : 'Cross a line first'}
                                style={{
                                    border: '1px solid #fecaca', background: rejectedLines.length ? '#fef2f2' : '#f8fafc',
                                    color: rejectedLines.length ? '#dc2626' : '#cbd5e1', cursor: rejectedLines.length ? 'pointer' : 'not-allowed',
                                    borderRadius: '7px', padding: '7px 14px', fontSize: '12.5px',
                                    fontWeight: 600, marginRight: '8px',
                                }}
                            >
                                Send back ({rejectedLines.length})
                            </button>
                            <button
                                onClick={saveAndApprove}
                                disabled={saving}
                                style={{
                                    border: 'none', background: '#15803d', color: '#fff', cursor: 'pointer',
                                    borderRadius: '7px', padding: '7px 14px', fontSize: '12.5px',
                                    fontWeight: 600, marginRight: '8px',
                                }}
                            >
                                {saving ? 'Working…' : 'Update & Approve'}
                            </button>
                            <button
                                onClick={() => saveSheet()}
                                disabled={saving}
                                style={{
                                    border: 'none', background: '#084f9a', color: '#fff', cursor: 'pointer',
                                    borderRadius: '7px', padding: '7px 14px', fontSize: '12.5px',
                                    fontWeight: 600, marginRight: '10px',
                                }}
                            >
                                {saving ? 'Saving…' : 'Save changes'}
                            </button>
                        </>
                    )}
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                        <X size={19} />
                    </button>
                </div>
                <div style={{ overflow: 'auto', flex: 1 }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
                        <thead>
                            <tr>
                                {canEdit && (
                                    <th style={{
                                        position: 'sticky', top: 0, left: 0, zIndex: 3, background: '#eef5f3',
                                        border: '1px solid #dbe3ef', padding: '7px 8px', fontSize: '11px',
                                        fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap',
                                    }}>Check</th>
                                )}
                                {cols.map(([k, label]) => (
                                    <th key={k} style={{
                                        position: 'sticky', top: 0, background: '#f1f5fb', border: '1px solid #dbe3ef',
                                        padding: '7px 8px', fontSize: '11px', fontWeight: 700, color: '#334155',
                                        textAlign: 'left', whiteSpace: 'nowrap',
                                    }}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <React.Fragment key={i}>
                                <tr style={r.review === 'no' ? { background: '#fef2f2' } : r.review === 'ok' ? { background: '#f6fdf8' } : undefined}>
                                {canEdit && (
                                    <td style={{
                                        border: '1px solid #e4eaf3', padding: '4px 6px', whiteSpace: 'nowrap',
                                        position: 'sticky', left: 0, background: 'inherit', zIndex: 1,
                                    }}>
                                        <button
                                            onClick={() => setVerdict(i, 'ok')}
                                            title="Price is fine"
                                            style={{
                                                border: '1px solid', borderColor: r.review === 'ok' ? '#15803d' : '#dbe3ef',
                                                background: r.review === 'ok' ? '#15803d' : '#fff',
                                                color: r.review === 'ok' ? '#fff' : '#94a3b8',
                                                borderRadius: '6px', cursor: 'pointer', padding: '3px 6px', marginRight: '4px',
                                            }}
                                        >
                                            <Check size={13} />
                                        </button>
                                        <button
                                            onClick={() => setVerdict(i, 'no')}
                                            title="Query this price"
                                            style={{
                                                border: '1px solid', borderColor: r.review === 'no' ? '#dc2626' : '#dbe3ef',
                                                background: r.review === 'no' ? '#dc2626' : '#fff',
                                                color: r.review === 'no' ? '#fff' : '#94a3b8',
                                                borderRadius: '6px', cursor: 'pointer', padding: '3px 6px',
                                            }}
                                        >
                                            <X size={13} />
                                        </button>
                                    </td>
                                )}
                                {cols.map(([k]) => (
                                    <td key={k} style={{ border: '1px solid #e4eaf3', padding: 0, color: '#0f172a' }}>
                                        {canEdit ? (
                                            <input
                                                value={r[k] ?? ''}
                                                onChange={e => setCell(i, k, e.target.value)}
                                                style={{
                                                    width: '100%', border: 'none', outline: 'none', background: 'transparent',
                                                    padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box',
                                                }}
                                            />
                                        ) : (
                                            <span style={{ display: 'block', padding: '5px 8px' }}>{r[k] ?? ''}</span>
                                        )}
                                    </td>
                                ))}
                                </tr>
                                {canEdit && r.review === 'no' && (
                                    <tr>
                                        <td colSpan={cols.length + 1} style={{ border: '1px solid #e4eaf3', background: '#fff7f7', padding: '6px 10px' }}>
                                            <input
                                                value={r.review_comment || ''}
                                                onChange={e => setCell(i, 'review_comment', e.target.value)}
                                                autoFocus
                                                placeholder="What is wrong with this price? (required)"
                                                style={{
                                                    width: '100%', border: `1px solid ${String(r.review_comment || '').trim() ? '#fecaca' : '#f87171'}`,
                                                    borderRadius: '6px', padding: '6px 9px', fontSize: '12px',
                                                    fontFamily: 'inherit', boxSizing: 'border-box',
                                                }}
                                            />
                                        </td>
                                    </tr>
                                )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                    {rows.length === 0 && (
                        <p style={{ padding: '20px', color: '#94a3b8', fontSize: '13px' }}>This request has no sheet data attached.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

const Approvals = () => {
    const [status, setStatus] = useState('pending');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [role, setRole] = useState(null);
    const [sheet, setSheet] = useState(null); // Process Decode sheet being viewed
    const [ackingId, setAckingId] = useState(null);

    /** Confirms the caller has seen an approver's changes. */
    const acknowledge = async (id) => {
        setAckingId(id);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/approvals/${id}/acknowledge`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            const json = await res.json();
            if (!json.success) alert(json.message || 'Could not acknowledge');
            await load();
        } catch { alert('Could not reach the server'); } finally { setAckingId(null); }
    };

    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        })
            .then(r => r.json())
            .then(d => { if (d.success) setRole(d.user.role); })
            .catch(() => { });
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/approvals?status=${status}`,
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            const json = await res.json();
            setRows(json.success ? json.data : []);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => { load(); }, [load]);

    // Rejection needs a comment (the server enforces this too), so it goes
    // through a dialog rather than window.prompt.
    const [rejecting, setRejecting] = useState(null); // the request being rejected
    const [rejectNote, setRejectNote] = useState('');

    const decide = async (id, decision, note = '') => {
        setBusyId(id);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/approvals/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ decision, note }),
            });
            const json = await res.json();
            if (!json.success) alert(json.message || 'Failed to record decision');
            else { setRejecting(null); setRejectNote(''); }
            await load();
        } catch {
            alert('Could not reach the server');
        } finally {
            setBusyId(null);
        }
    };

    // A request is only actionable while it sits at *this* role's stage. A
    // Process Decode sheet stays `pending` after the Zonal Head approves it —
    // it just moves to Finance — so status alone is not enough to decide by.
    const STAGE_FOR_ROLE = {
        'Zonal Head': 'zonal_head',
        'Finance Team': 'finance',
        'Tender Admin': 'tender_admin',
    };
    const canActOn = (r) => {
        if (r.status !== 'pending') return false;
        if (role === 'Admin') return true;
        const stage = STAGE_FOR_ROLE[role];
        if (!stage) return false;              // Sales / Tender Executive never decide
        return !r.stage || r.stage === stage;  // older rows have no stage recorded
    };

    return (
        <div className="admin-dashboard">
            <header className="archive-page-header">
                <h1>Approvals</h1>
            </header>

            <div className="tender-type-pills" style={{ display: 'flex', gap: '4px', margin: '16px 0' }}>
                {STATUSES.map(s => (
                    <button
                        key={s}
                        className={`tender-type-pill ${status === s ? 'active gem' : ''}`}
                        onClick={() => setStatus(s)}
                        style={{ textTransform: 'capitalize' }}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {loading && <p style={{ color: '#64748b' }}>Loading…</p>}

            {!loading && rows.length === 0 && (
                <p style={{ color: '#64748b' }}>
                    No {status} requests{status === 'pending' ? ' — nothing is waiting on you.' : '.'}
                </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {rows.map(r => {
                    const meta = TYPE_LABEL[r.type] || { label: r.type, Icon: Clock };
                    const { Icon } = meta;
                    return (
                        <div
                            key={r.id}
                            style={{
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                                padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px',
                            }}
                        >
                            <Icon size={20} style={{ color: '#084f9a', flexShrink: 0 }} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                    {meta.label}
                                    <span style={{ fontWeight: 400, color: '#64748b' }}> — </span>
                                    <Link
                                        to={tenderPath(r.bid_number)}
                                        title="Open tender details"
                                        style={{
                                            fontWeight: 600, color: '#084f9a', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                                    >
                                        {r.bid_number}
                                        <ExternalLink size={12} style={{ opacity: 0.7 }} />
                                    </Link>
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                    {r.requested_by_name || 'Unknown'}
                                    {r.division ? ` · ${r.division}` : ''}{r.source ? `-${r.source}` : ''}
                                    {' · '}{new Date(r.created_at).toLocaleString()}
                                    {r.reference ? ` · ${r.reference}` : ''}
                                </div>
                                {r.status === 'pending' && r.stage && STAGE_LABEL[r.stage] && (
                                    <span style={{
                                        display: 'inline-block', marginTop: '5px', fontSize: '10.5px',
                                        fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase',
                                        color: STAGE_LABEL[r.stage].color,
                                        background: `${STAGE_LABEL[r.stage].color}14`,
                                        border: `1px solid ${STAGE_LABEL[r.stage].color}33`,
                                        padding: '2px 8px', borderRadius: '999px',
                                    }}>{STAGE_LABEL[r.stage].text}</span>
                                )}
                                {participationOf(r) && (
                                    <span style={{
                                        display: 'inline-block', marginTop: '5px', marginLeft: '8px',
                                        fontSize: '10.5px', fontWeight: 700, letterSpacing: '.02em',
                                        textTransform: 'uppercase',
                                        color: participationOf(r).color,
                                        background: `${participationOf(r).color}14`,
                                        border: `1px solid ${participationOf(r).color}33`,
                                        padding: '2px 8px', borderRadius: '999px',
                                    }}>
                                        {participationOf(r).label}
                                        {participationOf(r).detail ? ` · ${participationOf(r).detail}` : ''}
                                    </span>
                                )}
                                {r.type === 'process_decode' && r.payload && (
                                    <button
                                        onClick={() => setSheet(r)}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            marginTop: '6px', marginLeft: r.stage ? '8px' : 0,
                                            border: '1px solid #d8e0ec', background: '#fff', cursor: 'pointer',
                                            borderRadius: '6px', padding: '3px 9px', fontSize: '11.5px',
                                            fontWeight: 600, color: '#084f9a',
                                        }}
                                    >
                                        <Eye size={12} /> View sheet
                                    </button>
                                )}
                                {r.remarks && (
                                    <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                                        “{r.remarks}”
                                    </div>
                                )}
                                {r.status !== 'pending' && (
                                    <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                                        {r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.decided_by_name || '—'}
                                        {r.decision_note ? ` · ${r.decision_note}` : ''}
                                    </div>
                                )}
                                {r.status === 'approved' && r.approver_modified ? (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '7px', marginTop: '6px',
                                        fontSize: '11.5px', fontWeight: 600,
                                        color: r.ack_required ? '#b45309' : '#15803d',
                                    }}>
                                        <AlertTriangle size={13} />
                                        {r.ack_required
                                            ? 'Approved with changes — awaiting acknowledgement'
                                            : 'Approved with changes — acknowledged'}
                                    </div>
                                ) : null}
                            </div>

                            {r.status === 'approved' && r.ack_required && (
                                <button
                                    onClick={() => acknowledge(r.id)}
                                    disabled={ackingId === r.id}
                                    style={{
                                        border: 'none', background: '#b45309', color: '#fff', cursor: 'pointer',
                                        borderRadius: '7px', padding: '7px 13px', fontSize: '12.5px',
                                        fontWeight: 600, flexShrink: 0, display: 'inline-flex',
                                        alignItems: 'center', gap: '6px',
                                    }}
                                >
                                    <ThumbsUp size={13} /> {ackingId === r.id ? 'Saving…' : 'Acknowledge'}
                                </button>
                            )}
                            {canActOn(r) && (
                                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                    <button
                                        className="btn-secondary"
                                        disabled={busyId === r.id}
                                        onClick={() => decide(r.id, 'approved')}
                                        style={{ color: '#15803d' }}
                                    >
                                        <Check size={16} /> Approve
                                    </button>
                                    <button
                                        className="btn-secondary"
                                        disabled={busyId === r.id}
                                        onClick={() => { setRejecting(r); setRejectNote(''); }}
                                        style={{ color: '#dc2626' }}
                                    >
                                        <X size={16} /> Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {sheet && (
                <SheetViewer
                    request={sheet}
                    canEdit={canActOn(sheet)}
                    onSaved={load}
                    onApprove={(note) => { decide(sheet.id, 'approved', note); setSheet(null); }}
                    onReject={(note) => { decide(sheet.id, 'rejected', note); setSheet(null); }}
                    onClose={() => setSheet(null)}
                />
            )}

            {rejecting && (
                <div
                    onClick={() => setRejecting(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1200,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
                    }}
                >
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: '12px', width: 'min(460px, 100%)', padding: '20px 22px',
                    }}>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                            Reject request
                        </h3>
                        <p style={{ margin: '4px 0 14px', fontSize: '12.5px', color: '#64748b' }}>
                            {TYPE_LABEL[rejecting.type]?.label || rejecting.type} — {rejecting.bid_number}
                        </p>

                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>
                            Reason <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <textarea
                            value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)}
                            rows={4}
                            autoFocus
                            placeholder="Tell them what needs to change"
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: '9px',
                                border: '1.5px solid #e2e8f0', fontSize: '13px', fontFamily: 'inherit',
                                resize: 'vertical', boxSizing: 'border-box',
                            }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                            <button
                                onClick={() => setRejecting(null)}
                                style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => decide(rejecting.id, 'rejected', rejectNote)}
                                disabled={!rejectNote.trim() || busyId === rejecting.id}
                                style={{
                                    padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: rejectNote.trim() ? 'pointer' : 'not-allowed',
                                    background: rejectNote.trim() ? '#dc2626' : '#fca5a5', color: '#fff', fontSize: '13px', fontWeight: 600,
                                }}
                            >
                                {busyId === rejecting.id ? 'Rejecting…' : 'Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Approvals;

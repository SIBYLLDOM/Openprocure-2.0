import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { IndianRupee, FileSpreadsheet, ExternalLink, Clock, CheckCircle2, XCircle } from 'lucide-react';

/**
 * Finance worklist (module 1).
 *
 * Sales enters the pricing on the Process Decode sheet; Finance's job is to
 * review it and approve / reject / correct-and-approve. That review happens in
 * the approvals sheet viewer, so this page deliberately does NOT offer a second
 * pricing editor — it would be a parallel copy of the same numbers.
 *
 * What it does give Finance is the thing Approvals does not: a per-tender view
 * of what is waiting on them, what the quoted value works out to, and whether
 * anything is missing before it can be costed.
 */

const money = (n) =>
    `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

/**
 * Works the decode rows into a quoted value, mirroring the Process Decode
 * sheet: rate to quote (or net rate + margin) × qty, plus GST.
 * Used for the at-a-glance figure only — the sheet remains the source of truth.
 */
const summarise = (rows = []) => {
    let value = 0;
    let missing = 0;
    for (const r of rows) {
        const qty = num(r.qty) || 1;                       // blank qty is treated as 1
        const rate = num(r.quoteRate) || (num(r.netRate) + num(r.margin));
        if (!num(r.qty) || !rate) missing += 1;
        const taxable = rate * qty;
        value += taxable + taxable * (num(r.gst) / 100);
    }
    return { value: Math.round(value), missing, items: rows.length };
};

const STAGE_CHIP = {
    finance: { text: 'Awaiting your review', color: '#7c3aed' },
    zonal_head: { text: 'With Zonal Head', color: '#0369a1' },
};

const Pricing = () => {
    const navigate = useNavigate();
    const API = import.meta.env.VITE_API_BASE_URL;
    const authHeaders = useMemo(() => ({
        Authorization: `Bearer ${localStorage.getItem('token')}`,
    }), []);

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            // Pull the decode requests directly — the same list the approvals
            // page reads, so the two can never disagree.
            const res = await fetch(`${API}/approvals?status=${filter === 'pending' ? 'pending' : filter}&type=process_decode`, { headers: authHeaders });
            const json = await res.json();
            setRows(json.success ? json.data : []);
        } catch { setRows([]); } finally { setLoading(false); }
    }, [API, authHeaders, filter]);

    useEffect(() => { load(); }, [load]);

    const parsed = rows.map(r => {
        let p = r.payload;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        return { ...r, payloadObj: p, summary: summarise(p?.rows || []) };
    });

    const totalValue = parsed.reduce((s, r) => s + r.summary.value, 0);
    const awaiting = parsed.filter(r => r.stage === 'finance' && r.status === 'pending').length;
    const incomplete = parsed.filter(r => r.summary.missing > 0).length;

    return (
        <div className="admin-dashboard">
            <header className="archive-page-header">
                <h1>Finance — Tender Pricing</h1>
            </header>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '6px 0 16px' }}>
                Pricing entered by Sales, for your review. Open a sheet to approve, reject,
                or correct the rates and approve.
            </p>

            {/* Summary tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', marginBottom: '18px' }}>
                {[
                    { label: 'Awaiting your review', value: awaiting, color: '#7c3aed', Icon: Clock },
                    { label: 'Total quoted value', value: money(totalValue), color: '#0f766e', Icon: IndianRupee },
                    { label: 'Sheets with gaps', value: incomplete, color: '#d97706', Icon: XCircle },
                ].map((tile) => (
                    <div key={tile.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '13px 15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: tile.color, fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                            <tile.Icon size={14} /> {tile.label}
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginTop: '5px' }}>{tile.value}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '4px', marginBottom: '14px' }}>
                {['pending', 'approved', 'rejected'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`tender-type-pill ${filter === f ? 'active gem' : ''}`}
                        style={{ textTransform: 'capitalize' }}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {loading && <p style={{ color: '#94a3b8', fontSize: '13px' }}>Loading…</p>}

            {!loading && parsed.length === 0 && (
                <div style={{ padding: '26px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '10px', background: '#fafbfc' }}>
                    <FileSpreadsheet size={22} style={{ color: '#cbd5e1' }} />
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginTop: '8px' }}>Nothing {filter} right now</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                        Sheets arrive here once a Zonal Head approves them.
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {parsed.map(r => {
                    const chip = STAGE_CHIP[r.stage];
                    return (
                        <div key={r.id} style={{
                            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                            padding: '13px 15px', display: 'flex', alignItems: 'center', gap: '13px',
                        }}>
                            <IndianRupee size={19} style={{ color: '#0f766e', flexShrink: 0 }} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13.5px' }}>{r.bid_number}</div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                    {r.requested_by_name || 'Unknown'} · {r.summary.items} item{r.summary.items === 1 ? '' : 's'}
                                    {r.payloadObj?.participation === 'distributor'
                                        ? ` · Distributor: ${r.payloadObj.distributorName || 'not named'}`
                                        : r.payloadObj?.participation === 'direct' ? ' · Direct' : ''}
                                    {r.summary.value > 0 ? ` · ${money(r.summary.value)}` : ''}
                                </div>
                                {r.summary.missing > 0 && (
                                    <div style={{ fontSize: '11.5px', color: '#b45309', marginTop: '3px' }}>
                                        {r.summary.missing} line{r.summary.missing === 1 ? '' : 's'} missing a quantity or rate
                                    </div>
                                )}
                            </div>

                            {chip && r.status === 'pending' && (
                                <span style={{
                                    fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.02em',
                                    color: chip.color, background: `${chip.color}14`, border: `1px solid ${chip.color}33`,
                                    padding: '2px 9px', borderRadius: '999px', flexShrink: 0,
                                }}>{chip.text}</span>
                            )}
                            {r.status !== 'pending' && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 600,
                                    color: r.status === 'approved' ? '#15803d' : '#dc2626', flexShrink: 0,
                                }}>
                                    {r.status === 'approved' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                    {r.status === 'approved' ? 'Approved' : 'Rejected'}
                                </span>
                            )}

                            <a
                                href={`/Admin/sheet/${r.id}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Open the full sheet in a new tab"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0,
                                    fontSize: '12.5px', fontWeight: 600, color: '#084f9a', textDecoration: 'none',
                                }}
                            >
                                <ExternalLink size={14} /> Sheet
                            </a>

                            <button
                                onClick={() => navigate('/Admin/approvals')}
                                style={{
                                    border: 'none', background: '#084f9a', color: '#fff', cursor: 'pointer',
                                    borderRadius: '7px', padding: '7px 14px', fontSize: '12.5px', fontWeight: 600, flexShrink: 0,
                                }}
                            >
                                Review
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Pricing;

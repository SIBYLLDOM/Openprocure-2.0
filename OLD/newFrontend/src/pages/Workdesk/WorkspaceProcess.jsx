import React, { useState, useEffect, useCallback } from 'react';
import { ListChecks, Check, Clock, AlertTriangle, Zap, SkipForward } from 'lucide-react';

/**
 * Per-tender process tracker with TAT.
 *
 * Steps come from the process matrix, filtered to the tender's participation
 * mode. Each step's TAT clock starts when the previous step completed, so a
 * breach points at the step that actually stalled.
 *
 * Steps the system already records (product matching, decode approval, pricing,
 * document reading) tick themselves and are labelled "auto"; the rest are
 * marked by hand.
 */

const STATUS = {
    done: { label: 'Done', color: '#15803d', bg: '#dcfce7' },
    in_progress: { label: 'In progress', color: '#0369a1', bg: '#e0f2fe' },
    skipped: { label: 'Skipped', color: '#64748b', bg: '#f1f5f9' },
    pending: { label: 'Pending', color: '#64748b', bg: '#f8fafc' },
};

const fmtElapsed = (mins) => {
    if (mins === null || mins === undefined) return '—';
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
};

const WorkspaceProcess = ({ tenderId }) => {
    const API = import.meta.env.VITE_API_BASE_URL;
    const bid = String(tenderId || '').replace(/\//g, '_');

    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);

    const load = useCallback(async () => {
        if (!bid) return;
        setLoading(true);
        try {
            const res = await fetch(`${API}/process/${encodeURIComponent(bid)}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            const json = await res.json();
            if (json.success) setState(json);
        } catch { /* keep whatever was shown */ } finally { setLoading(false); }
    }, [API, bid]);

    useEffect(() => { load(); }, [load]);

    const mark = async (code, status) => {
        setBusy(code);
        try {
            await fetch(`${API}/process/${encodeURIComponent(bid)}/${code}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ status }),
            });
            await load();
        } catch { /* best effort */ } finally { setBusy(null); }
    };

    if (loading) return <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading process…</p>;
    if (!state) return <p style={{ color: '#b91c1c', fontSize: 13 }}>Could not load the process tracker.</p>;

    const { summary, data, participation, flow, canMark } = state;
    const flowLabel = `${flow === 'gem' ? 'GeM' : 'Open tender'} · ${participation === 'distributor' ? 'with distributor' : 'Meril direct'}`;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <ListChecks size={20} style={{ color: '#2563eb' }} />
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>Process Tracker</h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 16px' }}>
                {flowLabel}
                {!participation && ' (assumed — the mode is set when the decode sheet is submitted)'}
                {" · TAT runs from the previous step's completion, except where a step names its own anchor."}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
                {[
                    { label: 'Completed', value: `${summary.done}/${summary.total}`, color: '#15803d' },
                    { label: 'Remaining', value: summary.total - summary.done, color: '#0369a1' },
                    { label: 'TAT breached', value: summary.overdue, color: summary.overdue ? '#dc2626' : '#64748b' },
                ].map(t => (
                    <div key={t.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '11px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: t.color }}>{t.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginTop: 3 }}>{t.value}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {data.map(step => {
                    const cfg = STATUS[step.status] || STATUS.pending;
                    const breached = step.overdue && step.status !== 'done';
                    return (
                        <div key={step.code} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                            background: '#fff', borderRadius: 9,
                            border: `1px solid ${breached ? '#fecaca' : '#e2e8f0'}`,
                            borderLeft: `3px solid ${breached ? '#dc2626' : cfg.color}`,
                        }}>
                            <div style={{
                                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: cfg.bg, color: cfg.color,
                            }}>
                                {step.status === 'done' ? <Check size={14} />
                                    : breached ? <AlertTriangle size={14} /> : <Clock size={14} />}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                    {step.name}
                                    {step.auto && (
                                        <span title="Completed automatically from recorded activity" style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10,
                                            fontWeight: 700, color: '#7c3aed', background: '#f3e8ff',
                                            padding: '1px 6px', borderRadius: 999,
                                        }}><Zap size={9} /> AUTO</span>
                                    )}
                                </div>
                                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                                    {step.owner_role || '—'}
                                    {' · TAT '}{step.tat_label || 'not fixed'}
                                    {step.anchor_step ? ` (from step ${step.anchor_step})` : ''}
                                    {step.elapsed_minutes !== null && ` · elapsed ${fmtElapsed(step.elapsed_minutes)}`}
                                    {` · step ${step.step_no}`}
                                </div>
                            </div>

                            <span style={{
                                fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.02em',
                                color: breached ? '#dc2626' : cfg.color,
                                background: breached ? '#fee2e2' : cfg.bg,
                                padding: '2px 9px', borderRadius: 999, flexShrink: 0,
                            }}>{breached ? 'TAT breached' : cfg.label}</span>

                            {canMark && step.status !== 'done' && !step.auto && (
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                    <button
                                        onClick={() => mark(step.code, 'done')}
                                        disabled={busy === step.code}
                                        style={{
                                            border: 'none', background: '#15803d', color: '#fff', cursor: 'pointer',
                                            borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                        }}
                                    ><Check size={12} /> Done</button>
                                    <button
                                        onClick={() => mark(step.code, 'skipped')}
                                        disabled={busy === step.code}
                                        title="Not applicable to this tender"
                                        style={{
                                            border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
                                            cursor: 'pointer', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 600,
                                        }}
                                    ><SkipForward size={12} /></button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WorkspaceProcess;

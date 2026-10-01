import React, { useState, useEffect, useCallback } from 'react';
import {
    Clock, CheckCircle2, XCircle, FileSignature, IndianRupee,
    Flag, FolderOpen, AlarmClock, Filter,
} from 'lucide-react';

/**
 * Tender Timeline — every recorded event for one tender in a single feed:
 * the tender's own dates, status changes, each approval and each stage
 * decision on it, pricing edits, and workspace activity.
 *
 * The merge happens server-side (timeline.controller.js) because the events
 * live in six different tables with inconsistent date formats.
 */

const KIND = {
    tender: { label: 'Tender', color: '#0369a1', Icon: Flag },
    deadline: { label: 'Deadline', color: '#dc2626', Icon: AlarmClock },
    status: { label: 'Status', color: '#0d9488', Icon: CheckCircle2 },
    approval: { label: 'Submitted', color: '#7c3aed', Icon: FileSignature },
    approved: { label: 'Approved', color: '#15803d', Icon: CheckCircle2 },
    rejected: { label: 'Sent back', color: '#dc2626', Icon: XCircle },
    pricing: { label: 'Pricing', color: '#b45309', Icon: IndianRupee },
    workspace: { label: 'Workspace', color: '#64748b', Icon: FolderOpen },
};

/** Dates arrive as ISO strings or dd-mm-yyyy — render both. */
const formatWhen = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }
    return String(value);
};

const WorkspaceTimeline = ({ tenderId }) => {
    const API = import.meta.env.VITE_API_BASE_URL;
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [kinds, setKinds] = useState([]);   // empty = show everything

    const load = useCallback(async () => {
        if (!tenderId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `${API}/timeline/${encodeURIComponent(String(tenderId).replace(/\//g, '_'))}`,
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            const json = await res.json();
            if (json.success) setEvents(json.data || []);
            else setError(json.message || 'Could not load the timeline');
        } catch {
            setError('Could not reach the server');
        } finally {
            setLoading(false);
        }
    }, [API, tenderId]);

    useEffect(() => { load(); }, [load]);

    const present = [...new Set(events.map(e => e.kind))];
    const shown = kinds.length ? events.filter(e => kinds.includes(e.kind)) : events;

    const toggleKind = (k) =>
        setKinds(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <Clock size={20} style={{ color: '#2563eb' }} />
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                    Tender Timeline
                </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 16px' }}>
                Everything recorded for {tenderId} — submissions, approvals, status changes, pricing and deadlines.
            </p>

            {present.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    <Filter size={13} style={{ color: '#94a3b8' }} />
                    {present.map(k => {
                        const meta = KIND[k] || { label: k, color: '#64748b' };
                        const on = kinds.includes(k);
                        return (
                            <button
                                key={k}
                                onClick={() => toggleKind(k)}
                                style={{
                                    border: `1px solid ${on ? meta.color : '#e2e8f0'}`,
                                    background: on ? `${meta.color}14` : '#fff',
                                    color: on ? meta.color : '#64748b',
                                    borderRadius: '999px', padding: '3px 11px', fontSize: '11.5px',
                                    fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                {meta.label}
                            </button>
                        );
                    })}
                    {kinds.length > 0 && (
                        <button
                            onClick={() => setKinds([])}
                            style={{ border: 'none', background: 'none', color: '#084f9a', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}
                        >
                            Clear
                        </button>
                    )}
                </div>
            )}

            {loading && <p style={{ color: '#94a3b8', fontSize: '13px' }}>Loading timeline…</p>}
            {error && <p style={{ color: '#b91c1c', fontSize: '13px' }}>{error}</p>}

            {!loading && !error && shown.length === 0 && (
                <div style={{ padding: '26px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '10px', background: '#fafbfc' }}>
                    <Clock size={22} style={{ color: '#cbd5e1' }} />
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginTop: '8px' }}>Nothing recorded yet</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                        Events appear as the tender moves through the workflow.
                    </div>
                </div>
            )}

            {shown.map((e, i) => {
                const meta = KIND[e.kind] || { label: e.kind, color: '#64748b', Icon: Clock };
                const EventIcon = meta.Icon || Clock;
                const last = i === shown.length - 1;
                return (
                    <div key={i} style={{ display: 'flex', gap: '13px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{
                                width: '30px', height: '30px', borderRadius: '50%',
                                background: `${meta.color}14`, border: `1.5px solid ${meta.color}40`,
                                color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <EventIcon size={14} />
                            </div>
                            {!last && <div style={{ width: '1.5px', flex: 1, minHeight: '18px', background: '#e9eef5' }} />}
                        </div>

                        <div style={{ paddingBottom: last ? 0 : '18px', flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#0f172a' }}>{e.title}</span>
                                <span style={{
                                    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em',
                                    color: meta.color, background: `${meta.color}14`, padding: '1px 7px', borderRadius: '999px',
                                }}>{meta.label}</span>
                            </div>
                            {e.detail && (
                                <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '3px', whiteSpace: 'pre-line' }}>
                                    {e.detail}
                                </div>
                            )}
                            {e.meta?.reference && (
                                <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>{e.meta.reference}</div>
                            )}
                            <div style={{ fontSize: '11.5px', color: '#a3b0c2', marginTop: '3px' }}>{formatWhen(e.at)}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default WorkspaceTimeline;

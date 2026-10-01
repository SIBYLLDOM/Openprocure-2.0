import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Check, ExternalLink, Clock, CheckCircle2, Undo2 } from 'lucide-react';

/**
 * Tender document reading sign-off, shown in the Workdesk Documents tab.
 *
 * Once Finance has settled the pricing, the tender team reads the GeM bid
 * document, the ATC and any additional specifications, and records that they
 * have. Reads are per person — several people may need to read the same
 * document and we want to know who did.
 *
 * Visible to everyone so the team can see progress; only Admin, Tender Admin
 * and Tender Executive can tick items (enforced server-side too).
 */

const DocumentReadChecklist = ({ tenderId }) => {
    const API = import.meta.env.VITE_API_BASE_URL;
    const bidNumber = String(tenderId || '').replace(/_/g, '/');

    const [docs, setDocs] = useState([]);
    const [pricingDone, setPricingDone] = useState(false);
    const [canMark, setCanMark] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);

    const load = useCallback(async () => {
        if (!bidNumber) return;
        setLoading(true);
        try {
            const res = await fetch(
                `${API}/document-reads/${encodeURIComponent(bidNumber.replace(/\//g, '_'))}`,
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            const json = await res.json();
            if (json.success) {
                setDocs(json.data || []);
                setPricingDone(!!json.pricingDone);
                setCanMark(!!json.canMark);
            }
        } catch { /* leave the section empty rather than breaking the tab */ }
        finally { setLoading(false); }
    }, [API, bidNumber]);

    useEffect(() => { load(); }, [load]);

    const toggle = async (doc) => {
        setBusy(doc.type);
        const path = `${API}/document-reads/${encodeURIComponent(bidNumber.replace(/\//g, '_'))}`;
        try {
            if (doc.read_by_me) {
                await fetch(`${path}/${doc.type}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                });
            } else {
                await fetch(path, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('token')}`,
                    },
                    body: JSON.stringify({ docType: doc.type }),
                });
            }
            await load();
        } catch { /* best effort */ } finally { setBusy(null); }
    };

    if (loading) return null;

    const readCount = docs.filter(d => d.readers.length > 0).length;

    return (
        <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: '16px 18px', marginBottom: 20,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <BookOpen size={18} style={{ color: '#0369a1' }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                    Document Reading
                </h3>
                <span style={{
                    fontSize: 11, fontWeight: 700, color: readCount === docs.length ? '#15803d' : '#64748b',
                    background: readCount === docs.length ? '#dcfce7' : '#f1f5f9',
                    padding: '2px 8px', borderRadius: 999,
                }}>{readCount}/{docs.length} read</span>
            </div>

            <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 14px' }}>
                {pricingDone
                    ? 'Pricing is finalised — read each document and mark it off before bidding.'
                    : 'These become due once Finance has settled the pricing. You can read ahead.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {docs.map(doc => {
                    const done = doc.readers.length > 0;
                    return (
                        <div key={doc.type} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
                            border: `1px solid ${doc.read_by_me ? '#bbf7d0' : '#e2e8f0'}`,
                            background: doc.read_by_me ? '#f6fdf8' : '#fff', borderRadius: 9,
                        }}>
                            <div style={{
                                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: done ? '#dcfce7' : '#f1f5f9',
                                color: done ? '#15803d' : '#94a3b8',
                            }}>
                                {done ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>{doc.label}</div>
                                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                                    {doc.readers.length
                                        ? `Read by ${doc.readers.map(r => r.name).filter(Boolean).join(', ')}`
                                        : 'Not read yet'}
                                </div>
                            </div>

                            {doc.url ? (
                                <a
                                    href={doc.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                                        fontSize: 12.5, fontWeight: 600, color: '#084f9a', textDecoration: 'none',
                                    }}
                                >
                                    <ExternalLink size={13} /> Open
                                </a>
                            ) : (
                                <span style={{ fontSize: 11.5, color: '#cbd5e1', flexShrink: 0 }}>No link found</span>
                            )}

                            {canMark && (
                                <button
                                    onClick={() => toggle(doc)}
                                    disabled={busy === doc.type}
                                    style={{
                                        border: doc.read_by_me ? '1px solid #d1d5db' : 'none',
                                        background: doc.read_by_me ? '#fff' : '#15803d',
                                        color: doc.read_by_me ? '#64748b' : '#fff',
                                        borderRadius: 7, padding: '7px 13px', fontSize: 12.5, fontWeight: 600,
                                        cursor: 'pointer', flexShrink: 0,
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                >
                                    {doc.read_by_me ? <><Undo2 size={13} /> Undo</> : <><Check size={13} /> Mark as read</>}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DocumentReadChecklist;

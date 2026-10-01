import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';

/**
 * Full-page Process Decode sheet, opened in its own tab from the Approvals
 * viewer. The sheet has 17 columns, which no dialog shows comfortably — here it
 * gets the whole window.
 *
 * Read-only by design: editing stays in the dialog (and in the Process Decode
 * modal) where the approve/reject context lives. This is for reading the
 * numbers across, which is what a second tab is for.
 *
 * Open to every role that can see the request — the API already scopes which
 * requests each role may fetch.
 */

const ALL_COLS = [
    ['sl', 'Sl'], ['tenderSl', 'Tender Sl.'], ['item', 'Surgical Item List'],
    ['addlSpec', 'Additional Specifications'], ['qty', 'Qty'], ['code', 'Code'],
    ['relevancy', 'Relavancy'], ['deviation', 'Deviation / Remark'], ['brand', 'Brand'],
    ['packing', 'Packing'], ['gst', 'GST %'], ['hsn', 'HSN Codes'], ['mrp', 'MRP/Box'],
    ['netRate', 'Net Rate'], ['margin', 'Margin'], ['quoteRate', 'Rate To Quote'],
    ['ourSpec', 'Our specification'],
];

// Dealer economics apply to distributor bids only.
const DEALER_ONLY = ['netRate', 'margin', 'quoteRate'];
const columnsFor = (participation) => (participation === 'distributor'
    ? ALL_COLS
    : ALL_COLS.filter(([k]) => !DEALER_ONLY.includes(k)));

const SheetPage = () => {
    const { requestId } = useParams();
    const [request, setRequest] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const API = import.meta.env.VITE_API_BASE_URL;
        // There is no single-request endpoint, so read from the caller's own
        // list — which conveniently also enforces who may see what.
        Promise.all(['pending', 'approved', 'rejected'].map(status =>
            fetch(`${API}/approvals?status=${status}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            }).then(r => r.json()).catch(() => ({ data: [] }))
        ))
            .then(results => {
                const all = results.flatMap(r => r.data || []);
                const found = all.find(r => String(r.id) === String(requestId));
                if (found) setRequest(found);
                else setError('That request was not found, or you do not have access to it.');
            })
            .catch(() => setError('Could not reach the server'));
    }, [requestId]);

    if (error) {
        return <div style={{ padding: '40px', color: '#b91c1c', fontSize: '14px' }}>{error}</div>;
    }
    if (!request) {
        return <div style={{ padding: '40px', color: '#94a3b8', fontSize: '14px' }}>Loading sheet…</div>;
    }

    let payload = request.payload;
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = null; } }
    const rows = payload?.rows || [];
    const COLS = columnsFor(payload?.participation);

    return (
        <div style={{ padding: '18px 22px', background: '#fff', minHeight: '100vh' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <FileSpreadsheet size={20} style={{ color: '#0f766e' }} />
                <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                    Process Decode sheet
                </h1>
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '16px' }}>
                {request.bid_number}
                {payload?.ratesFor ? ` · Rates for ${payload.ratesFor}` : ''}
                {` · ${rows.length} item${rows.length === 1 ? '' : 's'}`}
                {payload?.participation === 'distributor'
                    ? ` · Distributor participation — ${payload.distributorName || 'not named'}`
                    : payload?.participation === 'direct' ? ' · Direct participation' : ''}
                {request.requested_by_name ? ` · Submitted by ${request.requested_by_name}` : ''}
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #e4eaf3', borderRadius: '8px' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '12.5px', width: '100%' }}>
                    <thead>
                        <tr>
                            {COLS.map(([k, label]) => (
                                <th key={k} style={{
                                    position: 'sticky', top: 0, background: '#f1f5fb', border: '1px solid #dbe3ef',
                                    padding: '8px 10px', fontSize: '11.5px', fontWeight: 700, color: '#334155',
                                    textAlign: 'left', whiteSpace: 'nowrap',
                                }}>{label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} style={{ background: i % 2 ? '#fbfcfe' : '#fff' }}>
                                {COLS.map(([k]) => (
                                    <td key={k} style={{ border: '1px solid #e4eaf3', padding: '7px 10px', color: '#0f172a', verticalAlign: 'top' }}>
                                        {r[k] ?? ''}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {rows.length === 0 && (
                <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '14px' }}>
                    This request has no sheet data attached.
                </p>
            )}
        </div>
    );
};

export default SheetPage;

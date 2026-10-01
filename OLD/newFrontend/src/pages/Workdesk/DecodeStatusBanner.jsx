import React, { useState, useEffect, useCallback } from 'react';
import { Clock, CheckCircle2, XCircle, RefreshCw, Eye, AlertTriangle, ThumbsUp } from 'lucide-react';
import ProcessDecodeModal from '../Tenders/ProcessDecodeModal';

/**
 * Process Decode / pricing status for the tender, shown in the Workdesk.
 *
 * The point is that a rejection should not be a dead end: when Finance sends a
 * sheet back, Sales and the Zonal Head can re-apply from here without hunting
 * for the deviations page. Finance sees the same banner with a review action,
 * so they can act from the Workdesk too.
 *
 * The sheet itself is the existing ProcessDecodeModal — same component, same
 * rules — rather than a second editor that could drift from it.
 */

const DecodeStatusBanner = ({ tenderId }) => {
    const API = import.meta.env.VITE_API_BASE_URL;
    const bidNumber = (tenderId || '').replace(/_/g, '/');

    const [request, setRequest] = useState(null);
    const [role, setRole] = useState(null);
    const [userId, setUserId] = useState(null);
    const [deviations, setDeviations] = useState(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [acking, setAcking] = useState(false);

    /** Confirms this user has seen the approver's changes. */
    const acknowledge = async () => {
        if (!request) return;
        setAcking(true);
        try {
            await fetch(`${API}/approvals/${request.id}/acknowledge`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            await load();
        } catch { /* best effort */ } finally { setAcking(false); }
    };

    useEffect(() => {
        try {
            const u = JSON.parse(localStorage.getItem('user')) || {};
            setRole(u.role || null);
            setUserId(u.id || null);
        } catch { /* not signed in properly — banner stays hidden */ }
    }, []);

    const load = useCallback(async () => {
        if (!bidNumber) return;
        setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
            // Newest first across all three states, so the banner reflects the
            // current position rather than an old attempt.
            const results = await Promise.all(['pending', 'rejected', 'approved'].map(status =>
                fetch(`${API}/approvals?status=${status}&type=process_decode`, { headers })
                    .then(r => r.json()).catch(() => ({ data: [] }))
            ));
            const mine = results
                .flatMap(r => r.data || [])
                .filter(r => r.bid_number === bidNumber || r.bid_number === bidNumber.replace(/\//g, '_'))
                .sort((a, b) => b.id - a.id);
            setRequest(mine[0] || null);
        } catch { setRequest(null); } finally { setLoading(false); }
    }, [API, bidNumber]);

    useEffect(() => { load(); }, [load]);

    /** The modal seeds from the deviation tables, so fetch them before opening. */
    const openSheet = async () => {
        if (!deviations) {
            try {
                const res = await fetch(`${API}/tenders/${encodeURIComponent(bidNumber)}/deviations`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                });
                const json = await res.json();
                setDeviations(json.success ? {
                    tables: json.data || {},
                    productCodes: json.productCodes || {},
                    relevancyScores: json.relevancyScores || {},
                } : { tables: {}, productCodes: {}, relevancyScores: {} });
            } catch {
                setDeviations({ tables: {}, productCodes: {}, relevancyScores: {} });
            }
        }
        setOpen(true);
    };

    if (loading || !bidNumber) return null;

    const isSubmitterSide = ['Sales', 'Zonal Head'].includes(role);
    const isFinance = role === 'Finance Team' || role === 'Admin';

    // Nothing submitted yet — only worth prompting the people who would submit.
    if (!request) {
        if (!isSubmitterSide) return null;
        return (
            <>
                <Banner
                    tone="neutral"
                    Icon={Clock}
                    title="No Process Decode sheet submitted yet"
                    body="Prepare the sheet and send it for approval."
                    action={{ label: 'Open sheet', Icon: Eye, onClick: openSheet }}
                />
                {open && deviations && (
                    <ProcessDecodeModal
                        bidNumber={bidNumber}
                        deviations={deviations.tables}
                        productCodes={deviations.productCodes}
                        relevancyScores={deviations.relevancyScores}
                        onClose={() => { setOpen(false); load(); }}
                    />
                )}
            </>
        );
    }

    const mine = request.requested_by === userId;
    let tone = 'neutral';
    let Icon = Clock;
    let title = '';
    let body = '';
    let action = null;

    if (request.status === 'rejected') {
        tone = 'danger';
        Icon = XCircle;
        title = `Sent back by ${request.decided_by_name || 'the reviewer'}`;
        body = request.decision_note || 'No reason was given.';
        // Re-applying is the whole point of this banner.
        if (isSubmitterSide) {
            action = { label: 'Revise & re-apply', Icon: RefreshCw, onClick: openSheet };
        }
    } else if (request.status === 'approved') {
        const acks = Array.isArray(request.acknowledgements) ? request.acknowledgements
            : (request.acknowledgements ? JSON.parse(request.acknowledgements) : []);
        const iAcked = acks.some(a => a.user_id === userId);

        if (request.ack_required && isSubmitterSide && !iAcked) {
            // Approved, but the approver changed the numbers first — the people
            // who own them have to confirm they have seen the revision.
            tone = 'warn';
            Icon = AlertTriangle;
            title = 'Approved with changes — your acknowledgement is needed';
            body = `${request.decided_by_name || 'The approver'} edited the pricing before approving.`
                + (request.decision_note ? ` Note: ${request.decision_note}` : '');
            action = { label: acking ? 'Saving…' : 'Review & acknowledge', Icon: ThumbsUp, onClick: acknowledge };
        } else {
            tone = 'ok';
            Icon = CheckCircle2;
            title = request.approver_modified ? 'Approved with changes' : 'Process Decode approved';
            body = [
                request.decision_note ? `Note: ${request.decision_note}` : 'Pricing has been signed off.',
                acks.length ? `Acknowledged by ${acks.map(a => a.name).filter(Boolean).join(', ')}.` : null,
            ].filter(Boolean).join(' ');
            action = { label: 'View sheet', Icon: Eye, onClick: openSheet };
        }
    } else {
        tone = 'warn';
        Icon = Clock;
        const where = request.stage === 'finance' ? 'the Finance Team'
            : request.stage === 'zonal_head' ? 'the Zonal Head' : 'an approver';
        title = `Awaiting approval from ${where}`;
        body = mine
            ? 'You can still edit the sheet until it is decided.'
            : `Submitted by ${request.requested_by_name || 'a team member'}.`;

        const myStage = { 'Zonal Head': 'zonal_head', 'Finance Team': 'finance' }[role];
        const canReview = role === 'Admin' || (myStage && request.stage === myStage && !mine);
        if (canReview) action = { label: 'Review pricing', Icon: Eye, onClick: openSheet };
        else if (mine) action = { label: 'Open sheet', Icon: Eye, onClick: openSheet };
        else if (isFinance) action = { label: 'View sheet', Icon: Eye, onClick: openSheet };
    }

    return (
        <>
            <Banner tone={tone} Icon={Icon} title={title} body={body} action={action} />
            {open && deviations && (
                <ProcessDecodeModal
                    bidNumber={bidNumber}
                    deviations={deviations.tables}
                    productCodes={deviations.productCodes}
                    relevancyScores={deviations.relevancyScores}
                    onClose={() => { setOpen(false); load(); }}
                />
            )}
        </>
    );
};

const TONES = {
    neutral: { bg: '#f8fafc', border: '#e2e8f0', fg: '#475569' },
    warn: { bg: '#fffbeb', border: '#fde68a', fg: '#b45309' },
    danger: { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' },
    ok: { bg: '#f0fdf4', border: '#bbf7d0', fg: '#15803d' },
};

const Banner = (props) => {
    const { tone, title, body, action } = props;
    const BannerIcon = props.Icon;
    const t = TONES[tone] || TONES.neutral;
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 16px',
            padding: '12px 16px', borderRadius: '10px',
            background: t.bg, border: `1px solid ${t.border}`,
        }}>
            <BannerIcon size={18} style={{ color: t.fg, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: t.fg }}>{title}</div>
                <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '2px' }}>{body}</div>
            </div>
            {action && (
                <button
                    onClick={action.onClick}
                    style={{
                        border: 'none', background: '#084f9a', color: '#fff', cursor: 'pointer',
                        borderRadius: '7px', padding: '8px 15px', fontSize: '12.5px', fontWeight: 600,
                        display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0,
                    }}
                >
                    <action.Icon size={14} /> {action.label}
                </button>
            )}
        </div>
    );
};

export default DecodeStatusBanner;

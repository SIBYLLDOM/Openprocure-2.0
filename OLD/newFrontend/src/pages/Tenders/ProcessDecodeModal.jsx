import React, { useState, useMemo, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { X, Download, Plus, Trash2, RotateCcw, Save, Send, Clock, CheckCircle2, Check, XCircle } from 'lucide-react';

/**
 * Process Decode — the rate-working sheet.
 *
 * An editable, Excel-shaped grid seeded from the tender's deviation analysis:
 * one row per tender item, with the item description, chosen product code,
 * relevancy and deviation remarks filled in, and the commercial columns (brand,
 * packing, GST, rates) left for the user to complete.
 *
 * Edits are kept in localStorage per bid number, so a half-finished sheet
 * survives a reload — there is no backend table for this yet.
 */

const COLUMNS = [
  { key: 'sl', label: 'Sl No.', width: 58, readOnly: true },
  { key: 'tenderSl', label: 'Tender Sl. No.', width: 96 },
  { key: 'item', label: 'Surgical Item List', width: 240 },
  { key: 'addlSpec', label: 'Additional Specifications', width: 230 },
  { key: 'qty', label: 'Tender Qty', width: 88, align: 'right' },
  { key: 'code', label: 'Code', width: 120 },
  { key: 'relevancy', label: 'Relavancy', width: 90, align: 'right' },
  { key: 'deviation', label: 'Deviation/ Remark', width: 240 },
  { key: 'brand', label: 'Brand', width: 120 },
  { key: 'packing', label: 'Packing', width: 100 },
  { key: 'gst', label: 'GST %', width: 74, align: 'right' },
  { key: 'hsn', label: 'HSN Codes', width: 110 },
  { key: 'mrp', label: 'MRP/Box (Incl. Tax)', width: 130, align: 'right' },
  { key: 'netRate', label: 'Net Rate to dealer (Excl. of GST)', width: 150, align: 'right' },
  { key: 'margin', label: 'Dealer Margin/ Liasoning', width: 140, align: 'right' },
  { key: 'quoteRate', label: 'Rate To Quote Per Box (Excl. of GST)', width: 160, align: 'right', computed: true },
  { key: 'ourSpec', label: 'Our specification', width: 220 },
];

// Dealer economics only apply when we bid through a distributor. On a direct
// bid there is no dealer, so these columns are hidden rather than left blank.
const DEALER_ONLY = ['netRate', 'margin', 'quoteRate'];

const blankRow = (sl) => ({
  sl, tenderSl: '', item: '', addlSpec: '', qty: '', code: '', relevancy: '',
  deviation: '', brand: '', packing: '', gst: '', hsn: '', mrp: '',
  netRate: '', margin: '', quoteRate: '', ourSpec: '',
});

const num = (v) => {
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Rate to quote = net dealer rate + margin, unless the user overrides it. */
const computeQuote = (row) => {
  if (row.quoteRate !== '' && row.quoteRate !== null && row.quoteRate !== undefined) return row.quoteRate;
  const base = num(row.netRate);
  if (!base) return '';
  return (base + num(row.margin)).toFixed(2);
};

/** Builds the initial sheet from the deviation tables. */
const seedRows = (deviations, productCodes, relevancyScores) => {
  const keys = Object.keys(deviations || {}).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return na - nb;
  });

  if (!keys.length) return [blankRow(1)];

  return keys.map((key, i) => {
    const rows = deviations[key] || [];
    const deviationsOnly = rows.filter(r => (r.status || '').toLowerCase() === 'deviation');

    // The tender requirement is repeated on each row; take the first non-empty.
    const requirement = rows.find(r => r.tender_requirement)?.tender_requirement || '';
    const offered = rows.find(r => r.product_offered)?.product_offered || '';
    const specs = [...new Set(rows.map(r => r.specification).filter(Boolean))].join('; ');
    const remarks = deviationsOnly.map(r => r.reason || r.specification).filter(Boolean).join(' | ');

    return {
      ...blankRow(i + 1),
      tenderSl: key.replace(/\D/g, '') || String(i + 1),
      item: requirement,
      addlSpec: specs,
      code: productCodes?.[key] || '',
      relevancy: relevancyScores?.[key] ?? '',
      deviation: remarks || (rows.length ? 'Complied' : ''),
      ourSpec: offered,
    };
  });
};

const ProcessDecodeModal = ({ bidNumber, deviations, productCodes, relevancyScores, onClose }) => {
  const storageKey = `process_decode_${bidNumber}`;

  const seeded = useMemo(
    () => seedRows(deviations, productCodes, relevancyScores),
    [deviations, productCodes, relevancyScores]
  );

  // A previously saved working copy for this bid, if any. Read once at mount
  // via the state initializer rather than in an effect, so there is no
  // seeded-then-replaced flash.
  const cached = (() => {
    try {
      const raw = localStorage.getItem(`process_decode_${bidNumber}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.rows) && parsed.rows.length ? parsed : null;
    } catch {
      return null; // corrupt cache — fall back to the seeded sheet
    }
  })();

  const [rows, setRows] = useState(() => cached?.rows || seeded);
  const [ratesFor, setRatesFor] = useState(() => cached?.ratesFor || '');
  const [ref, setRef] = useState(() => cached?.ref || bidNumber || '');
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState(null); // { tone, text }
  // The caller's own still-pending submission for this bid, if any. While one
  // exists the sheet can still be edited, but not submitted again — edits are
  // pushed onto the existing request so the approver sees the current version.
  const [pending, setPending] = useState(null);
  // A submission from someone else that is currently this user's to decide.
  const [toDecide, setToDecide] = useState(null);
  // Someone else's submission that is pending but past this user's stage.
  const [elsewhere, setElsewhere] = useState(null);
  // Newest request for this bid, whatever its status — drives read-only mode.
  const [latest, setLatest] = useState(null);
  const [deciding, setDeciding] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  // Participation mode travels with the sheet: Sales must say whether we bid
  // directly or through a distributor, and name the distributor if so.
  const [participation, setParticipation] = useState(() => cached?.participation || 'direct');
  const [distributorId, setDistributorId] = useState(() => cached?.distributorId || '');
  const [distributors, setDistributors] = useState([]);
  // The most recent rejection for this bid, so a resubmission starts from the
  // reason it was sent back rather than a blank slate.
  const [lastRejection, setLastRejection] = useState(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const loadPending = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      // All three states, because the newest request decides what this modal
      // is: a draft to submit, a submission to review, or a decided sheet to
      // read. Looking only at `pending` made an approved sheet look unsent.
      const results = await Promise.all(['pending', 'rejected', 'approved'].map(st =>
        fetch(`${API_BASE_URL}/approvals?status=${st}&type=process_decode`, { headers })
          .then(r => r.json()).catch(() => ({ data: [] }))
      ));
      const data = { success: true, data: results.flatMap(r => r.data || []) };

      const forThisBid = (data.data || []).filter(
        r => r.bid_number === bidNumber || r.bid_number === bidNumber.replace(/\//g, '_')
      );

      // An approver's pending list also contains their reportees' requests, so
      // split by who raised it: only the caller's OWN submission blocks the
      // Submit button; someone else's may be theirs to decide on.
      let me = {};
      try { me = JSON.parse(localStorage.getItem('user')) || {}; } catch { me = {}; }

      // ...and only while it is actually at their stage. After a Zonal Head
      // approves, the sheet stays pending but moves to Finance — it is no
      // longer theirs to act on, so the buttons must go.
      const stageForRole = {
        'Zonal Head': 'zonal_head',
        'Finance Team': 'finance',
        'Tender Admin': 'tender_admin',
      }[me.role];
      const actionable = (r) =>
        me.role === 'Admin' || (stageForRole && r.stage === stageForRole);

      // Newest wins: a re-application supersedes whatever came before it.
      const newest = [...forThisBid].sort((a, b) => b.id - a.id)[0] || null;
      setLatest(newest);

      const stillOpen = forThisBid.filter(r => r.status === 'pending');
      const others = stillOpen.filter(r => r.requested_by !== me.id);
      setPending(stillOpen.find(r => r.requested_by === me.id) || null);
      setToDecide(others.find(actionable) || null);
      // Someone else's request that has moved on — shown as status, not action.
      setElsewhere(others.find(r => !actionable(r)) || null);

      // Only surface a rejection if it is the current state of play; an older
      // one that has since been re-applied and approved is history.
      setLastRejection(newest && newest.status === 'rejected' ? newest : null);

      // For a decided or in-flight sheet, show what was actually submitted
      // rather than this browser's local draft.
      if (newest && newest.status !== 'rejected') {
        let p = newest.payload;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        if (p?.rows?.length) {
          setRows(p.rows);
          if (p.ratesFor !== undefined) setRatesFor(p.ratesFor || '');
          if (p.participation) setParticipation(p.participation);
          if (p.distributorId !== undefined) setDistributorId(p.distributorId || '');
        }
      }
    } catch { /* non-critical — Submit stays available */ }
  }, [API_BASE_URL, bidNumber]);

  /**
   * Correct the rates and approve in one step. Sales enters the pricing; the
   * reviewer's third option is to fix it rather than send it back.
   */
  const updateAndApprove = async () => {
    if (!toDecide) return;
    setDeciding(true);
    setSubmitState(null);
    try {
      const res = await fetch(`${API_BASE_URL}/approvals/${toDecide.id}/payload`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          payload: { ratesFor, ref, rows, participation, distributorId: distributorId || null },
        }),
      });
      const saved = await res.json();
      if (!saved.success) {
        setSubmitState({ tone: 'err', text: saved.message || 'Could not save your changes' });
        setDeciding(false);
        return;
      }
    } catch {
      setSubmitState({ tone: 'err', text: 'Could not reach the server' });
      setDeciding(false);
      return;
    }
    setDeciding(false);
    await decide('approved', 'Updated pricing and approved');
  };

  /** Approve or reject the submission currently sitting with this user. */
  const decide = async (decision, noteOverride) => {
    if (!toDecide) return;
    if (decision === 'rejected' && !rejectNote.trim()) {
      setSubmitState({ tone: 'err', text: 'A comment is required when rejecting.' });
      return;
    }
    setDeciding(true);
    setSubmitState(null);
    try {
      const res = await fetch(`${API_BASE_URL}/approvals/${toDecide.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ decision, note: noteOverride ?? rejectNote }),
      });
      const data = await res.json();
      setSubmitState({
        tone: data.success ? 'ok' : 'err',
        text: data.message || (data.success ? 'Decision recorded' : 'Could not record the decision'),
      });
      if (data.success) {
        setRejectNote('');
        setShowReject(false);
        await loadPending();
      }
    } catch {
      setSubmitState({ tone: 'err', text: 'Could not reach the server' });
    } finally {
      setDeciding(false);
    }
  };

  useEffect(() => { loadPending(); }, [loadPending]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/distributors`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then(d => setDistributors(Array.isArray(d) ? d : (d.data || [])))
      .catch(() => { /* dropdown just stays empty */ });
  }, [API_BASE_URL]);


  /**
   * Sends the sheet for approval. Sales routes to their Zonal Head, who on
   * approval forwards it to Finance; a Zonal Head's own sheet goes straight to
   * Finance. The routing is decided server-side from the submitter's role.
   */
  const submitForApproval = async () => {
    if (!rows.length) return;
    if (participation === 'distributor' && !distributorId) {
      setSubmitState({ tone: 'err', text: 'Select the distributor before submitting.' });
      return;
    }
    setSubmitting(true);
    setSubmitState(null);
    try {
      const res = await fetch(`${API_BASE_URL}/approvals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          type: 'process_decode',
          bidNumber,
          reference: ratesFor || null,
          remarks: `Process Decode sheet — ${rows.length} item${rows.length === 1 ? '' : 's'}`,
          payload: {
            ratesFor, ref, rows,
            participation,
            distributorId: participation === 'distributor' ? distributorId : null,
            distributorName: participation === 'distributor'
              ? (distributors.find(d => String(d.id) === String(distributorId))?.company_name || null)
              : null,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        persist(rows);
        setSubmitState({ tone: 'ok', text: data.message || 'Sent for approval' });
        await loadPending();
      } else {
        setSubmitState({ tone: 'err', text: data.message || 'Could not submit the sheet' });
      }
    } catch {
      setSubmitState({ tone: 'err', text: 'Could not reach the server' });
    } finally {
      setSubmitting(false);
    }
  };

  const persist = useCallback((nextRows, nextRatesFor = ratesFor, nextRef = ref) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        rows: nextRows, ratesFor: nextRatesFor, ref: nextRef, participation, distributorId,
      }));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch { /* quota — not critical */ }

    // Keep the approver's copy current while the request is still open.
    if (pending?.id) {
      fetch(`${API_BASE_URL}/approvals/${pending.id}/payload`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          payload: {
            ratesFor: nextRatesFor, ref: nextRef, rows: nextRows,
            participation,
            distributorId: participation === 'distributor' ? distributorId : null,
            distributorName: participation === 'distributor'
              ? (distributors.find(d => String(d.id) === String(distributorId))?.company_name || null)
              : null,
          },
          remarks: `Process Decode sheet — ${nextRows.length} item${nextRows.length === 1 ? '' : 's'}`,
        }),
      }).catch(() => { /* best effort */ });
    }
  }, [storageKey, ratesFor, ref, pending, API_BASE_URL, participation, distributorId, distributors]);

  const setCell = (rowIdx, key, value) => {
    setRows(prev => {
      const next = prev.map((r, i) => (i === rowIdx ? { ...r, [key]: value } : r));
      return next;
    });
  };

  const addRow = () => setRows(prev => [...prev, blankRow(prev.length + 1)]);

  const removeRow = (idx) => setRows(prev =>
    prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sl: i + 1 }))
  );

  const resetSheet = () => {
    if (!window.confirm('Discard your edits and rebuild the sheet from the deviation analysis?')) return;
    setRows(seeded);
    localStorage.removeItem(storageKey);
  };

  const exportExcel = () => {
    const aoa = [
      [`Rates for ${ratesFor}`],
      [`Ref : ${ref}`],
      [],
      columns.map(c => c.label),
      ...rows.map(r => columns.map(c => (c.key === 'quoteRate' ? computeQuote(r) : r[c.key] ?? ''))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = columns.map(c => ({ wpx: c.width }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Process Decode');
    XLSX.writeFile(wb, `ProcessDecode_${(bidNumber || 'tender').replace(/\//g, '_')}.xlsx`);
  };

  const columns = participation === 'distributor'
    ? COLUMNS
    : COLUMNS.filter(c => !DEALER_ONLY.includes(c.key));

  // An APPROVED sheet is a record, not a draft: no submitting, no editing.
  // A rejected one stays fully editable — re-applying is the whole point.
  const decided = !!(latest && latest.status === 'approved' && !toDecide);
  const readOnly = decided;

  const totalQuote = rows.reduce((sum, r) => sum + num(computeQuote(r)), 0);

  const inputStyle = (col) => ({
    width: '100%', border: 'none', outline: 'none', background: 'transparent',
    fontSize: '12px', padding: '5px 6px', color: '#0f172a', boxSizing: 'border-box',
    textAlign: col.align || 'left', fontFamily: 'inherit',
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px',
      }}
    >
      <style>{`
        .pd-cell:focus { background:#eef5ff; box-shadow: inset 0 0 0 2px #084f9a33 }
        .pd-row:hover .pd-del { opacity: 1 }
        .pd-btn { border:none; cursor:pointer; border-radius:7px; font-size:12.5px; font-weight:600;
                  padding:8px 13px; display:inline-flex; align-items:center; gap:6px }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '12px', width: 'min(1500px, 100%)', maxHeight: '94vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 60px -15px rgba(15,23,42,.4)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e6ecf5', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 700, color: '#0f172a' }}>Process Decode</h3>
            <div style={{ display: 'flex', gap: '14px', marginTop: '7px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
                <span style={{ fontWeight: 600 }}>Rates for</span>
                <input
                  value={ratesFor}
                  onChange={e => setRatesFor(e.target.value)}
                  placeholder="Customer / hospital name"
                  style={{ border: '1px solid #d8e0ec', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', minWidth: '230px' }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
                <span style={{ fontWeight: 600 }}>Ref :</span>
                <input
                  value={ref}
                  onChange={e => setRef(e.target.value)}
                  style={{ border: '1px solid #d8e0ec', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', minWidth: '210px' }}
                />
              </label>

              {/* Participation mode rides along with the sheet so the Zonal
                  Head and Finance see how we intend to bid. */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
                <span style={{ fontWeight: 600 }}>Participation</span>
                <select
                  value={participation}
                  onChange={e => { setParticipation(e.target.value); if (e.target.value === 'direct') setDistributorId(''); }}
                  disabled={!!pending}
                  style={{ border: '1px solid #d8e0ec', borderRadius: '6px', padding: '4px 8px', fontSize: '12px' }}
                >
                  <option value="direct">Direct Participation</option>
                  <option value="distributor">Distributor Participation</option>
                </select>
              </label>

              {participation === 'distributor' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
                  <span style={{ fontWeight: 600 }}>Distributor <span style={{ color: '#dc2626' }}>*</span></span>
                  <select
                    value={distributorId}
                    onChange={e => setDistributorId(e.target.value)}
                    disabled={!!pending}
                    style={{
                      border: `1px solid ${distributorId ? '#d8e0ec' : '#fca5a5'}`,
                      borderRadius: '6px', padding: '4px 8px', fontSize: '12px', minWidth: '230px',
                    }}
                  >
                    <option value="">Select distributor…</option>
                    {distributors.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.company_name}{d.state ? ` — ${d.state}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            {saved && <span style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 600 }}>Saved</span>}
            {!readOnly && (
              <>
                <button className="pd-btn" onClick={() => persist(rows)} style={{ background: '#eef3fb', color: '#084f9a' }}>
                  <Save size={14} /> Save
                </button>
                <button className="pd-btn" onClick={resetSheet} style={{ background: '#f8fafc', color: '#64748b' }} title="Rebuild from deviation analysis">
                  <RotateCcw size={14} /> Reset
                </button>
              </>
            )}
            <button className="pd-btn" onClick={exportExcel} style={{ background: '#eef7f0', color: '#15803d' }}>
              <Download size={14} /> Export Excel
            </button>
            {decided ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: latest.status === 'approved' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${latest.status === 'approved' ? '#bbf7d0' : '#fecaca'}`,
                color: latest.status === 'approved' ? '#15803d' : '#b91c1c',
                borderRadius: '7px', padding: '7px 12px', fontSize: '12.5px', fontWeight: 600,
              }}>
                {latest.status === 'approved' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {latest.status === 'approved'
                  ? (latest.approver_modified ? 'Approved with changes' : 'Approved')
                  : 'Sent back'}
              </span>
            ) : toDecide ? (
              // This sheet is someone else's, waiting on the current user — so
              // they get the decision, not a status chip.
              <>
                <button
                  className="pd-btn"
                  onClick={() => decide('approved')}
                  disabled={deciding}
                  style={{ background: deciding ? '#94a3b8' : '#15803d', color: '#fff' }}
                >
                  <Check size={14} /> {deciding ? 'Working…' : 'Approve'}
                </button>
                <button
                  className="pd-btn"
                  onClick={updateAndApprove}
                  disabled={deciding}
                  style={{ background: deciding ? '#94a3b8' : '#0f766e', color: '#fff' }}
                  title="Save your edits to the sheet and approve it"
                >
                  <Save size={14} /> Update &amp; Approve
                </button>
                <button
                  className="pd-btn"
                  onClick={() => setShowReject(v => !v)}
                  disabled={deciding}
                  style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                >
                  <XCircle size={14} /> Reject
                </button>
              </>
            ) : elsewhere ? (
              // Pending, but not at this user's stage — status only, no buttons.
              // The label describes where the sheet actually is rather than
              // assuming this viewer is the one who moved it along.
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: '#f1f5f9', border: '1px solid #dbe3ef', color: '#475569',
                borderRadius: '7px', padding: '7px 12px', fontSize: '12.5px', fontWeight: 600,
              }}>
                <Clock size={14} />
                {elsewhere.stage === 'finance' ? 'With Finance Team'
                  : elsewhere.stage === 'zonal_head' ? 'With Zonal Head'
                    : 'Awaiting approval'}
              </span>
            ) : pending ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309',
                borderRadius: '7px', padding: '7px 12px', fontSize: '12.5px', fontWeight: 600,
              }}>
                <Clock size={14} />
                {pending.stage === 'finance' ? 'Awaiting Finance approval' : 'Awaiting Zonal Head approval'}
              </span>
            ) : (
              <button
                className="pd-btn"
                onClick={submitForApproval}
                disabled={submitting}
                style={{ background: submitting ? '#94a3b8' : '#084f9a', color: '#fff' }}
              >
                {submitting ? <Clock size={14} /> : <Send size={14} />}
                {submitting ? 'Submitting…' : 'Submit for Approval'}
              </button>
            )}
            <button onClick={onClose} aria-label="Close"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
              <X size={19} />
            </button>
          </div>
        </div>

        {!pending && !toDecide && lastRejection && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-start', margin: '10px 18px 0',
            padding: '10px 12px', borderRadius: '9px', fontSize: '12.5px',
            background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
          }}>
            <XCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              <b>Sent back{lastRejection.decided_by_name ? ` by ${lastRejection.decided_by_name}` : ''}:</b>{' '}
              {lastRejection.decision_note || 'No reason given.'}
              <br />
              Revise the sheet below and submit again.
            </span>
          </div>
        )}

        {toDecide && (
          <div style={{ margin: '10px 18px 0' }}>
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'flex-start',
              padding: '10px 12px', borderRadius: '9px', fontSize: '12.5px',
              background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af',
            }}>
              <Clock size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>
                Submitted by <b>{toDecide.requested_by_name || 'a team member'}</b> for your approval.
                You can correct any cell before approving — edits are saved onto the submission.
              </span>
            </div>

            {showReject && (
              <div style={{ marginTop: '8px' }}>
                <textarea
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="Reason for rejection (required)"
                  style={{
                    width: '100%', padding: '9px 11px', borderRadius: '9px', fontSize: '12.5px',
                    border: '1.5px solid #fecaca', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                  <button className="pd-btn" onClick={() => { setShowReject(false); setRejectNote(''); }}
                    style={{ background: '#f8fafc', color: '#64748b' }}>Cancel</button>
                  <button className="pd-btn" onClick={() => decide('rejected')}
                    disabled={!rejectNote.trim() || deciding}
                    style={{ background: rejectNote.trim() ? '#dc2626' : '#fca5a5', color: '#fff' }}>
                    Confirm reject
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {pending && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-start', margin: '10px 18px 0',
            padding: '10px 12px', borderRadius: '9px', fontSize: '12.5px',
            background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
          }}>
            <Clock size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              This sheet is with your{' '}
              <b>{pending.stage === 'finance' ? 'Finance Team' : 'Zonal Head'}</b> for approval.
              You can still edit it until they decide — your changes are saved to the
              submission automatically.
            </span>
          </div>
        )}

        {submitState && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center', margin: '10px 18px 0',
            padding: '9px 12px', borderRadius: '9px', fontSize: '12.5px',
            background: submitState.tone === 'ok' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${submitState.tone === 'ok' ? '#bbf7d0' : '#fecaca'}`,
            color: submitState.tone === 'ok' ? '#15803d' : '#b91c1c',
          }}>
            {submitState.tone === 'ok' ? <CheckCircle2 size={15} /> : <Clock size={15} />}
            {submitState.text}
          </div>
        )}

        {/* Grid */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '100%' }}>
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c.key} style={{
                    position: 'sticky', top: 0, zIndex: 2, background: '#f1f5fb',
                    border: '1px solid #dbe3ef', padding: '7px 8px', fontSize: '11px',
                    fontWeight: 700, color: '#334155', textAlign: 'left',
                    minWidth: c.width, whiteSpace: 'normal', lineHeight: 1.3,
                  }}>{c.label}</th>
                ))}
                <th style={{
                  position: 'sticky', top: 0, zIndex: 2, background: '#f1f5fb',
                  border: '1px solid #dbe3ef', width: '34px',
                }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="pd-row">
                  {columns.map(col => (
                    <td key={col.key} style={{
                      border: '1px solid #e4eaf3', padding: 0,
                      background: col.readOnly ? '#fafbfd' : '#fff',
                    }}>
                      {col.readOnly ? (
                        <div style={{ ...inputStyle(col), color: '#64748b' }}>{row.sl}</div>
                      ) : (
                        <input
                          className="pd-cell"
                          value={col.key === 'quoteRate' ? computeQuote(row) : (row[col.key] ?? '')}
                          onChange={e => setCell(ri, col.key, e.target.value)}
                          onBlur={() => { if (!readOnly) persist(rows); }}
                          readOnly={readOnly}
                          style={inputStyle(col)}
                          placeholder={col.computed ? 'auto' : ''}
                        />
                      )}
                    </td>
                  ))}
                  <td style={{ border: '1px solid #e4eaf3', textAlign: 'center' }}>
                    <button
                      className="pd-del"
                      onClick={() => removeRow(ri)}
                      title="Remove row"
                      style={{
                        border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626',
                        opacity: 0, transition: 'opacity .12s', padding: '4px',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 18px', borderTop: '1px solid #e6ecf5', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', background: '#fbfcfe',
        }}>
          {!readOnly ? (
            <button className="pd-btn" onClick={addRow} style={{ background: '#eef3fb', color: '#084f9a' }}>
              <Plus size={14} /> Add row
            </button>
          ) : <span />}
          <div style={{ fontSize: '12px', color: '#475569' }}>
            {rows.length} item{rows.length === 1 ? '' : 's'}
            {participation === 'distributor' && totalQuote > 0 && (
              <> · Total rate to quote: <b style={{ color: '#0f172a' }}>
                ₹{totalQuote.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </b></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessDecodeModal;

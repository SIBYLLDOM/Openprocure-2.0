import React, { useEffect, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('token');
  return fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}

function fmtDate(d) {
  if (!d) return 'Never';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

/** "3 minutes ago" reads better than a timestamp for "did this run recently?". */
function ago(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/* A run walks these in order; showing the stage stops a long run looking stuck. */
const STAGE_LABEL = {
  listings: 'Scraping listings…',
  import: 'Importing…',
  classify: 'Classifying…',
  review: 'Reviewing doubtful…',
  details: 'Fetching details…',
  documents: 'Downloading documents…',
  sync: 'Publishing…',
  done: 'Done',
};

/** "in 4h 12m" — a countdown answers "when will this refresh?" better than a timestamp. */
function until(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'due now';
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return h ? `in ${h}h ${m}m` : `in ${m}m`;
}

const STATUS = {
  ok:          { bg: '#dcfce7', color: '#15803d', label: 'OK' },
  running:     { bg: '#dbeafe', color: '#1d4ed8', label: 'Running' },
  failed:      { bg: '#fee2e2', color: '#b91c1c', label: 'Failed' },
  interrupted: { bg: '#fef3c7', color: '#a16207', label: 'Interrupted' },
  never:       { bg: '#f1f5f9', color: '#64748b', label: 'Never run' },
};

function Badge({ status }) {
  const s = STATUS[status] || STATUS.never;
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 999, padding: '2px 10px',
      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

export default function ScrapersDashboard() {
  const [rows, setRows] = useState([]);
  const [orchestratorUp, setOrchestratorUp] = useState(true);
  const [meta, setMeta] = useState({ schedule: null, nextRunAt: null, documents: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState('');
  const [history, setHistory] = useState({ portal: null, runs: [] });

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/scrapers`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || 'Failed to load');
      setRows(j.data || []);
      setOrchestratorUp(j.orchestratorUp !== false);
      setMeta({ schedule: j.schedule, nextRunAt: j.nextRunAt, documents: j.documents });
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while anything is running so the row updates itself; stay quiet
  // otherwise rather than hammering the API on an idle screen.
  useEffect(() => {
    const anyRunning = rows.some(r => r.running || r.last_status === 'running')
      || (meta.documents?.totals?.pending > 0);
    if (!anyRunning) return undefined;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [rows, meta, load]);

  const runOne = async (portal, label) => {
    setBusy(b => ({ ...b, [portal]: true }));
    try {
      const res = await authFetch(`${API_BASE}/scrapers/${encodeURIComponent(portal)}/run`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || 'Failed to start');
      setError('');
      // Optimistic: the row shows Running before the next poll confirms it.
      setRows(rs => rs.map(r => (r.portal === portal ? { ...r, running: true, last_status: 'running' } : r)));
      setTimeout(load, 3000);
    } catch (e) {
      setError(`${label}: ${e.message}`);
    } finally {
      setBusy(b => ({ ...b, [portal]: false }));
    }
  };

  const showHistory = async (portal) => {
    if (history.portal === portal) return setHistory({ portal: null, runs: [] });
    const res = await authFetch(`${API_BASE}/scrapers/${encodeURIComponent(portal)}/runs`);
    const j = await res.json();
    setHistory({ portal, runs: j.data || [] });
    return undefined;
  };

  const totalFound = rows.reduce((a, r) => a + (r.tenders_found || 0), 0);
  const totalDiagno = rows.reduce((a, r) => a + (r.diagno_held || 0), 0);
  const totalEndo = rows.reduce((a, r) => a + (r.endo_held || 0), 0);
  const totalDocsPending = rows.reduce((a, r) => a + (r.docs_pending || 0), 0);
  const totalHeld = rows.reduce((a, r) => a + (r.tenders_held || 0), 0);
  const neverRun = rows.filter(r => !r.last_run_at).length;

  const th = { textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px',
    color: '#64748b', fontWeight: 600, padding: '10px 12px', borderBottom: '1px solid #e2e8f0' };
  const td = { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 14 };

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Scrapers</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
        Every tender portal, when it last ran and what it found for us. Running a
        portal scrapes its listings, classifies them, then fetches details and
        documents for the Endo and Diagno tenders only. You get a notification
        when it finishes — this takes several minutes per portal.
      </p>

      {!orchestratorUp && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '10px 14px',
          borderRadius: 8, fontSize: 13, margin: '12px 0' }}>
          Scraper service is not reachable, so the Run buttons will not work.
          Start it with <code>node autopilot.js --serve</code> on the scraper host.
          The history below is still accurate.
        </div>
      )}
      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px',
          borderRadius: 8, fontSize: 13, margin: '12px 0' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '14px 0' }}>
        <div style={{ flex: '1 1 240px', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px', color: '#64748b', fontWeight: 600 }}>
            Automatic sweep
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>
            {meta.schedule || 'not scheduled'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {meta.nextRunAt ? `Next run ${until(meta.nextRunAt)} · ${fmtDate(meta.nextRunAt)}` : '—'}
          </div>
        </div>

        <div style={{ flex: '1 1 240px', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px', color: '#64748b', fontWeight: 600 }}>
            Document downloader
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4,
            color: meta.documents?.running ? '#15803d' : '#b91c1c' }}>
            {meta.documents ? (meta.documents.running ? 'Running' : 'Stopped') : 'Unknown'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {meta.documents?.totals
              ? `${meta.documents.totals.pending || 0} pending · ${meta.documents.totals.done || 0} done`
                + ` · ${meta.documents.totals.files || 0} files`
                + (meta.documents.totals.unavailable ? ` · ${meta.documents.totals.unavailable} unavailable` : '')
              : 'no queue information'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, margin: '16px 0', fontSize: 13, color: '#475569' }}>
        <span><b>{rows.length}</b> portals</span>
        <span><b style={{ color: '#1d4ed8' }}>{totalDiagno.toLocaleString('en-IN')}</b> Diagno</span>
        <span><b style={{ color: '#15803d' }}>{totalEndo.toLocaleString('en-IN')}</b> Endo</span>
        <span><b style={{ color: totalDocsPending ? '#b45309' : '#15803d' }}>{totalDocsPending}</b> documents pending</span>
        <span>{totalHeld.toLocaleString('en-IN')} tenders held</span>
        {neverRun > 0 && <span><b>{neverRun}</b> never run</span>}
      </div>

      {loading ? <p style={{ color: '#64748b' }}>Loading…</p> : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'right', width: 44 }}>S.No</th>
                <th style={th}>State</th>
                <th style={th}>Last run</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Total tenders</th>
                <th style={{ ...th, textAlign: 'right' }}>Diagno</th>
                <th style={{ ...th, textAlign: 'right' }}>Endo</th>
                <th style={{ ...th, textAlign: 'right' }}>Docs pending</th>
                <th style={{ ...th, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const running = r.running || r.last_status === 'running';
                const short = r.tenders_expected > 0 && r.tenders_found < r.tenders_expected;
                const num = (v) => (v || 0).toLocaleString('en-IN');
                return (
                  <React.Fragment key={r.portal}>
                    <tr>
                      <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{idx + 1}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{r.state || r.label}</div>
                        <div style={{ color: '#94a3b8', fontSize: 12 }}>
                          {r.platform} · {r.script}
                        </div>
                      </td>
                      <td style={td}>
                        <div>{fmtDate(r.last_run_at)}</div>
                        {r.last_run_at && (
                          <div style={{ color: '#94a3b8', fontSize: 12 }}>
                            {ago(r.last_run_at)}{r.last_triggered_by ? ` · ${r.last_triggered_by}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <Badge status={running ? 'running' : (r.last_status || 'never')} />
                        {running && r.stage && (
                          <div style={{ color: '#1d4ed8', fontSize: 12, marginTop: 3 }}>
                            {STAGE_LABEL[r.stage] || r.stage}
                          </div>
                        )}
                        {short && !running && (
                          <div style={{ color: '#b45309', fontSize: 12, marginTop: 3 }}>
                            {num(r.tenders_found)} of {num(r.tenders_expected)} expected
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {num(r.tenders_held)}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        fontWeight: r.diagno_held > 0 ? 700 : 400,
                        color: r.diagno_held > 0 ? '#1d4ed8' : '#94a3b8' }}>
                        {num(r.diagno_held)}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        fontWeight: r.endo_held > 0 ? 700 : 400,
                        color: r.endo_held > 0 ? '#15803d' : '#94a3b8' }}>
                        {num(r.endo_held)}
                      </td>
                      {/* Zero is a real, reassuring answer here — everything is
                          downloaded — so it is shown as 0 rather than a dash. */}
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{
                          fontWeight: r.docs_pending > 0 ? 700 : 400,
                          color: r.docs_pending > 0 ? '#b45309' : '#15803d',
                        }}>{num(r.docs_pending)}</span>
                        {r.docs_unavailable > 0 && (
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            {num(r.docs_unavailable)} unavailable
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => showHistory(r.portal)}
                          style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
                            padding: '6px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 }}
                        >History</button>
                        <button
                          onClick={() => runOne(r.portal, r.label)}
                          disabled={running || busy[r.portal] || !orchestratorUp || !r.enabled}
                          style={{
                            background: running || !orchestratorUp ? '#e2e8f0' : '#1f4e8c',
                            color: running || !orchestratorUp ? '#94a3b8' : '#fff',
                            border: 0, borderRadius: 6, padding: '6px 14px', fontSize: 12,
                            fontWeight: 600, cursor: running || !orchestratorUp ? 'default' : 'pointer',
                          }}
                        >{running ? 'Running…' : 'Scrap now'}</button>
                      </td>
                    </tr>
                    {history.portal === r.portal && (
                      <tr>
                        <td colSpan={9} style={{ background: '#f8fafc', padding: '10px 16px' }}>
                          {history.runs.length === 0 ? (
                            <span style={{ color: '#94a3b8', fontSize: 13 }}>No runs recorded yet.</span>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead><tr>
                                <th style={th}>Started</th><th style={th}>Status</th>
                                <th style={{ ...th, textAlign: 'right' }}>Scanned</th>
                                <th style={{ ...th, textAlign: 'right' }}>Endo/Diagno</th>
                                <th style={{ ...th, textAlign: 'right' }}>Docs</th>
                                <th style={th}>By</th><th style={th}>Note</th>
                              </tr></thead>
                              <tbody>
                                {history.runs.map(h => (
                                  <tr key={h.id}>
                                    <td style={td}>{fmtDate(h.started_at)}</td>
                                    <td style={td}><Badge status={h.status} /></td>
                                    <td style={{ ...td, textAlign: 'right' }}>{h.items_done ?? 0}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{h.relevant_found ?? 0}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{h.docs_downloaded ?? 0}</td>
                                    <td style={{ ...td, color: '#64748b' }}>{h.triggered_by || 'schedule'}</td>
                                    <td style={{ ...td, color: '#b45309', fontSize: 12 }}>{h.error || ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

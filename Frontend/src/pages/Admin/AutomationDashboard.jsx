import React, { useEffect, useState, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtUptime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('token');
  return fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  running:    { bg: '#dcfce7', color: '#16a34a', dot: '#16a34a' },
  starting:   { bg: '#fef9c3', color: '#ca8a04', dot: '#ca8a04' },
  restarting: { bg: '#fef9c3', color: '#ca8a04', dot: '#ca8a04' },
  idle:       { bg: '#eff6ff', color: '#3b82f6', dot: '#3b82f6' },
  offline:    { bg: '#f1f5f9', color: '#94a3b8', dot: '#cbd5e1' },
  stopped:    { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
  crashed:    { bg: '#fee2e2', color: '#dc2626', dot: '#dc2626' },
  queued:     { bg: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6' },
  done:       { bg: '#dcfce7', color: '#16a34a', dot: '#16a34a' },
  failed:     { bg: '#fee2e2', color: '#dc2626', dot: '#dc2626' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.stopped;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: c.bg, color: c.color,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {status?.toUpperCase()}
    </span>
  );
}

// ── Service card ──────────────────────────────────────────────────────────────
function ServiceCard({ svcKey, info, onRestart, restarting }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '20px 22px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      borderLeft: `4px solid ${STATUS_COLORS[info.status]?.dot || '#94a3b8'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 2 }}>{info.label}</div>
          <StatusBadge status={info.status} />
        </div>
        {svcKey !== 'loop' && (
          <button
            onClick={() => onRestart(svcKey)}
            disabled={restarting === svcKey}
            style={{
              padding: '5px 14px', fontSize: 12, fontWeight: 600, border: 'none',
              borderRadius: 6, cursor: restarting === svcKey ? 'not-allowed' : 'pointer',
              background: restarting === svcKey ? '#e2e8f0' : '#084f9a',
              color: restarting === svcKey ? '#94a3b8' : '#fff',
            }}
          >
            {restarting === svcKey ? 'Restarting…' : '↺ Restart'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12, color: '#6b7280' }}>
        {info.pid && <span>PID: <b style={{ color: '#374151' }}>{info.pid}</b></span>}
        {info.uptime > 0 && <span>Uptime: <b style={{ color: '#374151' }}>{fmtUptime(info.uptime)}</b></span>}
        {info.restartCount > 0 && <span>Restarts: <b style={{ color: '#dc2626' }}>{info.restartCount}</b></span>}
        {info.startedAt && <span>Started: <b style={{ color: '#374151' }}>{fmtDate(info.startedAt)}</b></span>}
      </div>
    </div>
  );
}

// ── Log modal ─────────────────────────────────────────────────────────────────
function LogModal({ name, lines, onClose }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [lines]);
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#0f172a', borderRadius: 10, width: '80vw', maxWidth: 900,
        maxHeight: '75vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 18px', borderBottom: '1px solid #1e293b',
        }}>
          <span style={{ color: '#94a3b8', fontSize: 13, fontFamily: 'monospace' }}>
            logs / {name}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#94a3b8',
            fontSize: 20, cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 18px' }}>
          {(lines || []).length === 0
            ? <p style={{ color: '#475569', fontFamily: 'monospace', fontSize: 12 }}>No logs yet.</p>
            : (lines || []).map((l, i) => (
                <div key={i} style={{
                  fontFamily: 'monospace', fontSize: 11.5, color: l.includes('ERR') ? '#f87171' : '#94a3b8',
                  whiteSpace: 'pre-wrap', lineHeight: 1.6, marginBottom: 2,
                }}>{l}</div>
              ))
          }
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function AutomationDashboard() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [restarting, setRestarting] = useState(null);
  const [triggering, setTriggering] = useState(null);
  const [logModal,   setLogModal]   = useState(null); // { name, lines }
  const timerRef = useRef(null);

  const load = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const res  = await authFetch(`${API_BASE}/automation/status`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError('Cannot reach orchestrator. Make sure orchestrator.js is running.');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    timerRef.current = setInterval(() => load(false), 10000);
    return () => clearInterval(timerRef.current);
  }, []);

  const handleRestart = async (name) => {
    setRestarting(name);
    try {
      await authFetch(`${API_BASE}/automation/service/${name}/restart`, { method: 'POST' });
    } finally {
      setTimeout(() => { setRestarting(null); load(); }, 2000);
    }
  };

  const handleRunScraper = async (name) => {
    setTriggering(name);
    try {
      const res  = await authFetch(`${API_BASE}/automation/scraper/${name}/run`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) alert(json.error || 'Could not start scraper');
    } finally {
      setTimeout(() => { setTriggering(null); load(); }, 1500);
    }
  };

  const handleViewLogs = async (name) => {
    try {
      const res  = await authFetch(`${API_BASE}/automation/logs/${name}`);
      const json = await res.json();
      setLogModal({ name, lines: json.lines || [] });
    } catch {
      setLogModal({ name, lines: ['[Error loading logs]'] });
    }
  };

  const { services = {}, scrapers = {}, nextScheduledAt, scheduleTimes = [], scraperOrder = [], activeScraperRunning } = data || {};

  const SERVICE_ORDER = [
    { key: 'server',    icon: '⚙️' },
    { key: 'loop',      icon: '🔄' },
    { key: 'nicfilter', icon: '🔍' },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1e293b' }}>Automation Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
            24/7 service health · Scraper schedule · Manual controls
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {nextScheduledAt && (
            <span style={{ fontSize: 12, color: '#6b7280', background: '#f1f5f9', padding: '6px 12px', borderRadius: 6 }}>
              Next auto-run: <b style={{ color: '#084f9a' }}>{fmtDate(nextScheduledAt)}</b>
            </span>
          )}
          <button
            onClick={() => load(true)}
            style={{ padding: '8px 18px', background: '#084f9a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '14px 18px', marginBottom: 20, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && !data ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div style={{ width: 36, height: 36, border: '4px solid #dbeafe', borderTopColor: '#084f9a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <>
          {/* ── 24/7 Services ── */}
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
              24/7 Services
              <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>auto-restarts on crash</span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              {SERVICE_ORDER.map(({ key, icon }) => {
                const info = services[key];
                if (!info) return null;
                return (
                  <div key={key} style={{ position: 'relative' }}>
                    <ServiceCard
                      svcKey={key}
                      info={{ ...info, label: `${icon} ${info.label}` }}
                      onRestart={handleRestart}
                      restarting={restarting}
                    />
                    <button
                      onClick={() => handleViewLogs(key)}
                      style={{
                        position: 'absolute', bottom: 14, right: 14,
                        background: 'none', border: '1px solid #e2e8f0', borderRadius: 5,
                        padding: '3px 9px', fontSize: 11, color: '#6b7280', cursor: 'pointer',
                      }}
                    >
                      Logs
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Schedule info ── */}
          <section style={{ marginBottom: 28 }}>
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 18px', fontSize: 13, color: '#0369a1' }}>
              <b>Scheduled runs:</b> {scheduleTimes.join(' · ')}
              {activeScraperRunning && (
                <span style={{ marginLeft: 16, background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  Running: {activeScraperRunning}
                </span>
              )}
            </div>
          </section>

          {/* ── Scrapers table ── */}
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🕷️</span> Scrapers
              <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>always-on servers · sleep when idle · wake on schedule</span>
            </h2>
            <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Scraper', 'Status', 'Last Run', 'Finished', 'Exit', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(scraperOrder.length > 0 ? scraperOrder : Object.entries(scrapers).map(([name, info]) => ({ name, label: info.label }))).map(({ name, label }) => {
                      const s = scrapers[name] || {};
                      const isThisRunning = activeScraperRunning === name;
                      const anyRunning    = !!activeScraperRunning;
                      return (
                        <tr key={name}
                          style={{ borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                          <td style={{ padding: '11px 14px', fontWeight: 600, color: '#1e293b' }}>
                            {label || name}
                            {isThisRunning && (
                              <span style={{ marginLeft: 8, width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                            )}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <StatusBadge status={s.status || 'idle'} />
                          </td>
                          <td style={{ padding: '11px 14px', color: '#6b7280', fontSize: 12 }}>{fmtDate(s.lastRunAt)}</td>
                          <td style={{ padding: '11px 14px', color: '#6b7280', fontSize: 12 }}>{fmtDate(s.lastFinishedAt)}</td>
                          <td style={{ padding: '11px 14px' }}>
                            {s.lastExitCode !== null && s.lastExitCode !== undefined
                              ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: s.lastExitCode === 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                                  {s.lastExitCode}
                                </span>
                              : <span style={{ color: '#d1d5db' }}>—</span>
                            }
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => handleRunScraper(name)}
                                disabled={anyRunning || triggering === name}
                                style={{
                                  padding: '4px 12px', fontSize: 11, fontWeight: 600,
                                  border: 'none', borderRadius: 5, cursor: anyRunning ? 'not-allowed' : 'pointer',
                                  background: anyRunning ? '#f1f5f9' : '#084f9a',
                                  color: anyRunning ? '#9ca3af' : '#fff',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {triggering === name ? '…' : '▶ Run Now'}
                              </button>
                              <button
                                onClick={() => handleViewLogs(`scraper-${name}`)}
                                style={{
                                  padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                  border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer',
                                  background: '#fff', color: '#6b7280',
                                }}
                              >
                                Logs
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {logModal && (
        <LogModal name={logModal.name} lines={logModal.lines} onClose={() => setLogModal(null)} />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

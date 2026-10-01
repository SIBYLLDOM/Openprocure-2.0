import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : null;

const fmt = (sec) => {
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// Get first/last day of current month as YYYY-MM-DD
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const monthEnd = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};
const weekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
};

const PRESETS = [
  { label: 'Today',      from: () => today(),      to: () => today() },
  { label: 'This Week',  from: () => weekStart(),   to: () => today() },
  { label: 'This Month', from: () => monthStart(),  to: () => monthEnd() },
];

const Card = ({ label, value, color = '#084f9a', icon }) => (
  <div style={{
    background: '#fff', borderRadius: 12, padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex',
    alignItems: 'center', gap: 16, borderLeft: `4px solid ${color}`,
  }}>
    <div style={{ fontSize: 32 }}>{icon}</div>
    <div>
      <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  const colors = { open: '#dc2626', in_progress: '#d97706', resolved: '#16a34a', closed: '#6b7280' };
  return (
    <span style={{
      background: colors[status] + '22', color: colors[status],
      padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    }}>{status?.replace('_', ' ').toUpperCase()}</span>
  );
};

export default function MonitorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState('This Month');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [customFrom, setCustomFrom] = useState(monthStart());
  const [customTo, setCustomTo] = useState(monthEnd());
  const [showCustom, setShowCustom] = useState(false);

  const load = async (f = from, t = to) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/monitoring/dashboard?from=${f}&to=${t}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(from, to); }, []);

  const applyPreset = (preset) => {
    const f = preset.from();
    const t = preset.to();
    setFrom(f); setTo(t);
    setActivePreset(preset.label);
    setShowCustom(false);
    load(f, t);
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    setFrom(customFrom); setTo(customTo);
    setActivePreset('Custom');
    load(customFrom, customTo);
  };

  const { stats, ticketStats = {}, userActivity = [], recentLogins = [] } = data || {};
  const ticketTotal = Object.values(ticketStats).reduce((a, b) => a + b, 0);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1e293b' }}>Monitor Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Real-time user activity &amp; system health</p>
        </div>
        <button onClick={() => load(from, to)} style={{ padding: '8px 18px', background: '#084f9a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          ↻ Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <Card label="Active Right Now" value={stats?.activeNow ?? 0} color="#16a34a" icon="🟢" />
        <Card label="Logins Today" value={stats?.loginsToday ?? 0} color="#084f9a" icon="📅" />
        <Card label="Logins This Week" value={stats?.loginsWeek ?? 0} color="#7c3aed" icon="📊" />
        <Card label="Avg Session Time" value={`${stats?.avgSessionMinutes ?? 0}m`} color="#d97706" icon="⏱️" />
        <Card label="Total Tickets" value={ticketTotal} color="#dc2626" icon="🎫" />
      </div>

      {/* Ticket Breakdown */}
      {ticketTotal > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Support Ticket Breakdown</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(ticketStats).map(([status, count]) => (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusBadge status={status} />
                <span style={{ fontWeight: 700, fontSize: 16 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Activity Table — shows today's login status */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>User Activity — Today's Status</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Name', 'Email', 'Role', 'Logged In Today', 'Last Login'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {userActivity.map(u => {
                const loginTime = fmtTime(u.today_login_time);
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{u.name}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{u.email}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{u.role}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {loginTime ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>Yes</span>
                          <span style={{ color: '#6b7280', fontSize: 12 }}>at {loginTime}</span>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d1d5db', display: 'inline-block' }} />
                          <span style={{ color: '#9ca3af', fontWeight: 600 }}>No</span>
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{fmtDate(u.last_login)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!userActivity.length && <p style={{ textAlign: 'center', color: '#6b7280', padding: 20 }}>No users found.</p>}
        </div>
      </div>

      {/* Login History with date filter */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        {/* Filter bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
            Login History
            <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
              {recentLogins.length} records · {from} → {to}
            </span>
          </h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                style={{
                  padding: '5px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: activePreset === p.label ? '#084f9a' : '#f1f5f9',
                  color: activePreset === p.label ? '#fff' : '#374151',
                }}>
                {p.label}
              </button>
            ))}
            <button onClick={() => setShowCustom(!showCustom)}
              style={{
                padding: '5px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: activePreset === 'Custom' ? '#084f9a' : '#f1f5f9',
                color: activePreset === 'Custom' ? '#fff' : '#374151',
              }}>
              Custom
            </button>
          </div>
        </div>

        {/* Custom date picker */}
        {showCustom && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, padding: '12px 14px', background: '#f8fafc', borderRadius: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>From</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>To</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
            </div>
            <button onClick={applyCustom}
              style={{ padding: '5px 14px', background: '#084f9a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Apply
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 32, height: 32, border: '4px solid #dbeafe', borderTopColor: '#084f9a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['User', 'Email', 'Role', 'IP Address', 'Login Time', 'Duration'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLogins.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{l.name || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{l.email}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{l.role}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }}>{l.ip_address || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{fmtDate(l.logged_in_at)}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#084f9a' }}>{fmt(l.duration_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recentLogins.length && <p style={{ textAlign: 'center', color: '#6b7280', padding: 20 }}>No logins in this period.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

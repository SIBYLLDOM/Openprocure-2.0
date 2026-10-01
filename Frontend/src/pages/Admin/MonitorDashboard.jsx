import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar, BarChart3, Clock, Ticket, RefreshCw, Search,
  ChevronLeft, ChevronRight, Wifi, MapPin,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const PAGE_SIZE = 10;

// ── Corporate design tokens — reused across every element on this page ──────
const C = {
  navy: '#0a2540', ink: '#0f172a', slate: '#475569', muted: '#64748b',
  border: '#e2e8f0', borderStrong: '#cbd5e1', panel: '#ffffff', wash: '#f4f7fb',
  blue: '#0b5cab', blueDark: '#083e77', blueSoft: '#eaf2fb',
  green: '#0f7a41', greenSoft: '#e8f6ee',
  red: '#b91c1c', redSoft: '#fdecec',
  amber: '#a15c00', amberSoft: '#fdf3e3',
};

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

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const monthEnd = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); };
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); };

const PRESETS = [
  { label: 'Today',      from: () => today(),      to: () => today() },
  { label: 'This Week',  from: () => weekStart(),   to: () => today() },
  { label: 'This Month', from: () => monthStart(),  to: () => monthEnd() },
];

// ── Shared building blocks ───────────────────────────────────────────────────

const PageHeader = ({ title, subtitle, onRefresh, refreshing }) => (
  <div style={{
    background: `linear-gradient(120deg, ${C.blueDark} 0%, ${C.blue} 100%)`,
    borderRadius: 14, padding: '24px 28px', marginBottom: 22,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14,
    boxShadow: '0 10px 24px -12px rgba(8,62,119,0.45)',
  }}>
    <div>
      <h1 style={{ margin: 0, fontSize: 23, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{title}</h1>
      <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,0.78)', fontSize: 13 }}>{subtitle}</p>
    </div>
    {onRefresh && (
      <button onClick={onRefresh} disabled={refreshing} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 18px', background: '#fff', color: C.blueDark, border: 'none',
        borderRadius: 8, cursor: refreshing ? 'default' : 'pointer', fontSize: 13, fontWeight: 700,
      }}>
        <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.9s linear infinite' : 'none' }} />
        Refresh
      </button>
    )}
  </div>
);

const StatCard = ({ label, value, icon, tone = 'blue' }) => {
  const Icon = icon;
  const tones = {
    blue: { fg: C.blue, bg: C.blueSoft }, green: { fg: C.green, bg: C.greenSoft },
    red: { fg: C.red, bg: C.redSoft }, amber: { fg: C.amber, bg: C.amberSoft }, navy: { fg: C.navy, bg: '#eef1f6' },
  };
  const t = tones[tone] || tones.blue;
  return (
    <div style={{
      background: C.panel, borderRadius: 12, padding: '18px 20px', border: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 9, background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} strokeWidth={2.2} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 23, fontWeight: 800, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    </div>
  );
};

const RoleTag = ({ role }) => (
  <span style={{
    display: 'inline-block', padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700,
    background: C.blueSoft, color: C.blueDark, border: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  }}>{role}</span>
);

const Panel = ({ title, subtitle, right, children }) => (
  <div style={{ background: C.panel, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
    {title && (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        padding: '18px 22px', borderBottom: `1px solid ${C.border}`, background: C.wash,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink }}>{title}</h3>
          {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12, color: C.muted }}>{subtitle}</p>}
        </div>
        {right}
      </div>
    )}
    <div style={{ padding: '18px 22px' }}>{children}</div>
  </div>
);

const fieldBase = {
  padding: '9px 12px', border: `1px solid ${C.borderStrong}`, borderRadius: 8, fontSize: 13,
  outline: 'none', background: '#fff', color: C.ink,
};

const SearchInput = ({ value, onChange, placeholder }) => (
  <div style={{ position: 'relative', minWidth: 230 }}>
    <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ ...fieldBase, paddingLeft: 32, width: '100%', boxSizing: 'border-box' }} />
  </div>
);

const Select = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{ ...fieldBase, cursor: 'pointer' }}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const PresetBtn = ({ active, children, ...props }) => (
  <button {...props} style={{
    padding: '9px 14px', border: `1px solid ${active ? C.blue : C.borderStrong}`, borderRadius: 8, cursor: 'pointer',
    fontSize: 12.5, fontWeight: 700, background: active ? C.blue : '#fff', color: active ? '#fff' : C.slate,
  }}>{children}</button>
);

const Pagination = ({ page, setPage, total, pageSize = PAGE_SIZE }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 12.5, color: C.muted }}>Showing <b style={{ color: C.ink }}>{start}–{end}</b> of <b style={{ color: C.ink }}>{total}</b></span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: `1px solid ${C.borderStrong}`, borderRadius: 7, background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12.5, color: C.slate, opacity: page === 1 ? 0.45 : 1, fontWeight: 600 }}>
          <ChevronLeft size={14} /> Prev
        </button>
        <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 700, padding: '0 4px' }}>{page} / {pages}</span>
        <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: `1px solid ${C.borderStrong}`, borderRadius: 7, background: '#fff', cursor: page === pages ? 'not-allowed' : 'pointer', fontSize: 12.5, color: C.slate, opacity: page === pages ? 0.45 : 1, fontWeight: 600 }}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

const th = { padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' };
const td = { padding: '12px 16px', fontSize: 13.5 };

// A proper, spacious filter bar — its own full-width card with labeled
// fields, instead of controls crammed into a panel header corner.
const Field = ({ label, children, grow }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: grow ? '2 1 280px' : '1 1 170px', minWidth: grow ? 260 : 150 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>
    {children}
  </div>
);

const FilterBar = ({ children, resultCount, totalCount }) => (
  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 14 }}>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {children}
    </div>
    {resultCount !== undefined && (
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 12.5, color: C.muted }}>
        Showing <b style={{ color: C.ink }}>{resultCount}</b> of <b style={{ color: C.ink }}>{totalCount}</b> records
      </div>
    )}
  </div>
);

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MonitorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState('This Month');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [customFrom, setCustomFrom] = useState(monthStart());
  const [customTo, setCustomTo] = useState(monthEnd());
  const [showCustom, setShowCustom] = useState(false);

  const [activitySearch, setActivitySearch] = useState('');
  const [activityRole, setActivityRole] = useState('all');
  const [activityLoginFilter, setActivityLoginFilter] = useState('all');
  const [activityPage, setActivityPage] = useState(1);

  const [loginSearch, setLoginSearch] = useState('');
  const [loginRole, setLoginRole] = useState('all');
  const [loginPage, setLoginPage] = useState(1);

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
    const f = preset.from(); const t = preset.to();
    setFrom(f); setTo(t); setActivePreset(preset.label); setShowCustom(false);
    load(f, t);
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    setFrom(customFrom); setTo(customTo); setActivePreset('Custom');
    load(customFrom, customTo);
  };

  const { stats, ticketStats = {}, userActivity = [], recentLogins = [] } = data || {};
  const ticketTotal = Object.values(ticketStats).reduce((a, b) => a + b, 0);

  const roleOptions = useMemo(() => {
    const roles = new Set([...userActivity.map(u => u.role), ...recentLogins.map(l => l.role)].filter(Boolean));
    return ['all', ...[...roles].sort()];
  }, [userActivity, recentLogins]);

  const filteredActivity = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    return userActivity.filter(u => {
      const matchesQ = !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
      const matchesRole = activityRole === 'all' || u.role === activityRole;
      const matchesLogin = activityLoginFilter === 'all'
        || (activityLoginFilter === 'yes' && !!u.today_login_time)
        || (activityLoginFilter === 'no' && !u.today_login_time);
      return matchesQ && matchesRole && matchesLogin;
    });
  }, [userActivity, activitySearch, activityRole, activityLoginFilter]);

  useEffect(() => { setActivityPage(1); }, [activitySearch, activityRole, activityLoginFilter]);
  const activityPageRows = filteredActivity.slice((activityPage - 1) * PAGE_SIZE, activityPage * PAGE_SIZE);

  const filteredLogins = useMemo(() => {
    const q = loginSearch.trim().toLowerCase();
    return recentLogins.filter(l => {
      const matchesQ = !q || (l.name || '').toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q);
      const matchesRole = loginRole === 'all' || l.role === loginRole;
      return matchesQ && matchesRole;
    });
  }, [recentLogins, loginSearch, loginRole]);

  useEffect(() => { setLoginPage(1); }, [loginSearch, loginRole, recentLogins]);
  const loginPageRows = filteredLogins.slice((loginPage - 1) * PAGE_SIZE, loginPage * PAGE_SIZE);

  return (
    <div style={{ width: '100%', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <PageHeader title="Monitor Dashboard" subtitle="Real-time user activity and system health, end to end" onRefresh={() => load(from, to)} refreshing={loading} />

      {/* Stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
        <StatCard label="Active Right Now" value={stats?.activeNow ?? 0} icon={Wifi} tone="green" />
        <StatCard label="Logins Today" value={stats?.loginsToday ?? 0} icon={Calendar} tone="blue" />
        <StatCard label="Logins This Week" value={stats?.loginsWeek ?? 0} icon={BarChart3} tone="navy" />
        <StatCard label="Avg Session Time" value={`${stats?.avgSessionMinutes ?? 0}m`} icon={Clock} tone="amber" />
        <StatCard label="Total Tickets" value={ticketTotal} icon={Ticket} tone="red" />
      </div>

      {/* User Activity */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 700, color: C.ink }}>User Activity — Today&apos;s Status</h2>
        <FilterBar resultCount={filteredActivity.length} totalCount={userActivity.length}>
          <Field label="Search" grow>
            <SearchInput value={activitySearch} onChange={setActivitySearch} placeholder="Search by name or email…" />
          </Field>
          <Field label="Role">
            <Select value={activityRole} onChange={setActivityRole} options={roleOptions.map(r => ({ value: r, label: r === 'all' ? 'All Roles' : r }))} />
          </Field>
          <Field label="Login Status">
            <Select value={activityLoginFilter} onChange={setActivityLoginFilter} options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'yes', label: 'Logged in today' },
              { value: 'no', label: 'Not logged in today' },
            ]} />
          </Field>
          {(activitySearch || activityRole !== 'all' || activityLoginFilter !== 'all') && (
            <button onClick={() => { setActivitySearch(''); setActivityRole('all'); setActivityLoginFilter('all'); }}
              style={{ padding: '9px 16px', background: C.wash, color: C.slate, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, height: 38 }}>
              Clear
            </button>
          )}
        </FilterBar>
        <Panel>
          <div style={{ overflowX: 'auto', margin: '-18px -22px 0', padding: '0 22px 4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.navy }}>
                  {['Name', 'Email', 'Role', 'Logged In Today', 'Last Login'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {activityPageRows.map((u, i) => {
                  const loginTime = fmtTime(u.today_login_time);
                  return (
                    <tr key={u.id} style={{ background: i % 2 ? C.wash : '#fff', borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ ...td, fontWeight: 700, color: C.ink }}>{u.name}</td>
                      <td style={{ ...td, color: C.slate }}>{u.email}</td>
                      <td style={td}><RoleTag role={u.role} /></td>
                      <td style={td}>
                        {loginTime ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
                            <span style={{ color: C.green, fontWeight: 700 }}>Yes</span>
                            <span style={{ color: C.muted, fontSize: 12 }}>at {loginTime}</span>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.borderStrong, display: 'inline-block' }} />
                            <span style={{ color: C.muted, fontWeight: 700 }}>No</span>
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, color: C.slate }}>{fmtDate(u.last_login)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredActivity.length && <p style={{ textAlign: 'center', color: C.muted, padding: 28 }}>No users match your filters.</p>}
          </div>
          <Pagination page={activityPage} setPage={setActivityPage} total={filteredActivity.length} />
        </Panel>
      </div>

      {/* Login History */}
      <h2 style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 700, color: C.ink }}>Login History</h2>
      <FilterBar resultCount={filteredLogins.length} totalCount={recentLogins.length}>
        <Field label="Search" grow>
          <SearchInput value={loginSearch} onChange={setLoginSearch} placeholder="Search by name or email…" />
        </Field>
        <Field label="Role">
          <Select value={loginRole} onChange={setLoginRole} options={roleOptions.map(r => ({ value: r, label: r === 'all' ? 'All Roles' : r }))} />
        </Field>
        <Field label="Date Range">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <PresetBtn key={p.label} active={activePreset === p.label} onClick={() => applyPreset(p)}>{p.label}</PresetBtn>
            ))}
            <PresetBtn active={activePreset === 'Custom'} onClick={() => setShowCustom(!showCustom)}>Custom</PresetBtn>
          </div>
        </Field>
        {(loginSearch || loginRole !== 'all') && (
          <button onClick={() => { setLoginSearch(''); setLoginRole('all'); }}
            style={{ padding: '9px 16px', background: C.wash, color: C.slate, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, height: 38 }}>
            Clear
          </button>
        )}
      </FilterBar>
      <Panel subtitle={`${from} → ${to}`}>
        {showCustom && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, padding: '14px 16px', background: C.wash, borderRadius: 9, border: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>From</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...fieldBase, padding: '6px 9px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>To</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...fieldBase, padding: '6px 9px' }} />
            </div>
            <button onClick={applyCustom} style={{ padding: '7px 16px', background: C.blue, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>Apply</button>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div style={{ width: 30, height: 30, border: `3px solid ${C.blueSoft}`, borderTopColor: C.blue, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ overflowX: 'auto', margin: '0 -22px', padding: '0 22px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.navy }}>
                  {['User', 'Email', 'Role', 'IP Address', 'Login Time', 'Duration'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loginPageRows.map((l, i) => (
                  <tr key={l.id} style={{ background: i % 2 ? C.wash : '#fff', borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ ...td, fontWeight: 700, color: C.ink }}>{l.name || '—'}</td>
                    <td style={{ ...td, color: C.slate }}>{l.email}</td>
                    <td style={td}><RoleTag role={l.role} /></td>
                    <td style={{ ...td, color: C.slate }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'monospace', fontSize: 12 }}>
                        <MapPin size={11} style={{ color: C.muted }} />{l.ip_address || '—'}
                      </span>
                    </td>
                    <td style={{ ...td, color: C.slate }}>{fmtDate(l.logged_in_at)}</td>
                    <td style={{ ...td, fontWeight: 700, color: C.blue }}>{fmt(l.duration_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredLogins.length && <p style={{ textAlign: 'center', color: C.muted, padding: 28 }}>No logins match your filters.</p>}
          </div>
        )}
        <Pagination page={loginPage} setPage={setLoginPage} total={filteredLogins.length} />
      </Panel>
    </div>
  );
}

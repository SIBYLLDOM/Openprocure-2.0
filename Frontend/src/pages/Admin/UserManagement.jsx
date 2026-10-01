import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Users, UserCheck, UserX, FileText, ChevronLeft, ChevronRight, Search,
  Plus, X, KeyRound, ShieldCheck, Trash2, Pencil, Power, Download,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const PAGE_SIZE = 10;

const ROLES = ['Admin', 'Tender Admin', 'Office Administrator', 'Tender Executive', 'Zonal Head', 'Sales', 'Finance Team', 'Legal', 'Documentation'];
const STATE_SCOPED_ROLES = ['Zonal Head', 'Sales'];
const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];
const DEPARTMENTS = ['Endo', 'Diagno', '360'];
const FIELDS = ['GEM', 'Open'];

// ── Corporate design tokens — matches Monitor Dashboard ─────────────────────
const C = {
  navy: '#0a2540', ink: '#0f172a', slate: '#475569', muted: '#64748b',
  border: '#e2e8f0', borderStrong: '#cbd5e1', panel: '#ffffff', wash: '#f4f7fb',
  blue: '#0b5cab', blueDark: '#083e77', blueSoft: '#eaf2fb',
  green: '#0f7a41', greenSoft: '#e8f6ee',
  red: '#b91c1c', redSoft: '#fdecec',
  amber: '#a15c00', amberSoft: '#fdf3e3',
};

const fieldBase = {
  padding: '9px 12px', border: `1px solid ${C.borderStrong}`, borderRadius: 8, fontSize: 13,
  outline: 'none', background: '#fff', color: C.ink,
};

const RoleBadge = ({ role }) => (
  <span style={{
    display: 'inline-block', padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700,
    background: C.blueSoft, color: C.blueDark, border: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  }}>{role}</span>
);

const PageHeader = ({ title, subtitle, action }) => (
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
    {action}
  </div>
);

const StatCard = ({ label, value, icon, tone = 'blue' }) => {
  const Icon = icon;
  const tones = {
    blue: { fg: C.blue, bg: C.blueSoft }, green: { fg: C.green, bg: C.greenSoft },
    red: { fg: C.red, bg: C.redSoft }, navy: { fg: C.navy, bg: '#eef1f6' },
  };
  const t = tones[tone] || tones.blue;
  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: '18px 20px', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
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

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,37,64,0.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    onClick={onClose}>
    <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 24px 60px -15px rgba(10,37,64,.45)' }}
      onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.ink }}>{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 2, display: 'flex' }}><X size={20} /></button>
      </div>
      {children}
    </div>
  </div>
);

const Input = ({ label, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 5 }}>{label}</label>
    <input {...props} style={{ ...fieldBase, width: '100%', boxSizing: 'border-box' }} />
  </div>
);

const Select = ({ label, options, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 5 }}>{label}</label>}
    <select {...props} style={{ ...fieldBase, width: '100%', cursor: 'pointer' }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const ToolbarSelect = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{ ...fieldBase, width: '100%', cursor: 'pointer' }}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

// A proper, spacious filter bar — its own full-width card with labeled
// fields, instead of controls crammed into a single cramped inline row.
const Field = ({ label, children, grow }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: grow ? '2 1 280px' : '1 1 170px', minWidth: grow ? 260 : 150 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>
    {children}
  </div>
);

const FilterBar = ({ children, resultCount, totalCount }) => (
  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 18 }}>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {children}
    </div>
    {resultCount !== undefined && (
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 12.5, color: C.muted }}>
        Showing <b style={{ color: C.ink }}>{resultCount}</b> of <b style={{ color: C.ink }}>{totalCount}</b> users
      </div>
    )}
  </div>
);

const MultiSelect = ({ label, options, value = [], onChange, placeholder }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (opt) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else onChange([...value, opt]);
  };

  return (
    <div style={{ marginBottom: 14, position: 'relative' }} ref={ref}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 5 }}>{label}</label>
      <div onClick={() => setOpen(o => !o)} style={{
        minHeight: 38, padding: '6px 10px', border: `1px solid ${C.borderStrong}`, borderRadius: 8,
        cursor: 'pointer', background: '#fff', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
      }}>
        {value.length === 0 && <span style={{ color: '#9ca3af', fontSize: 13 }}>{placeholder || 'Select...'}</span>}
        {value.map(v => (
          <span key={v} style={{ background: C.blueSoft, color: C.blueDark, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            {v}
            <span onClick={e => { e.stopPropagation(); toggle(v); }} style={{ cursor: 'pointer', lineHeight: 1 }}>×</span>
          </span>
        ))}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${C.borderStrong}`, borderRadius: 8, zIndex: 200, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 20px rgba(10,37,64,0.15)', marginTop: 3 }}>
          {options.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.background = C.wash}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} style={{ cursor: 'pointer' }} />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const Btn = ({ onClick, color = C.blue, children, disabled, icon, type = 'button' }) => {
  const Icon = icon;
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '9px 18px', background: disabled ? '#cbd5e1' : color, color: '#fff',
      border: 'none', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{Icon && <Icon size={14} />}{children}</button>
  );
};

const IconBtn = ({ onClick, title, bg, fg, icon, label }) => {
  const Icon = icon;
  return (
    <button onClick={onClick} title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
      background: bg, color: fg, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700,
    }}>
      <Icon size={12.5} />{label}
    </button>
  );
};

export default function UserManagement() {
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; } })();
  const isZonalHead = currentUser.role === 'Zonal Head';
  const isAdmin = currentUser.role === 'Admin';

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [newPwd, setNewPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Tender Admin', departments: [], fields: [], states: [] });
  const [editForm, setEditForm] = useState({});

  const token = () => localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` };

  const load = async (p = page, q = search, r = roleFilter, s = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: PAGE_SIZE, search: q });
      if (r) params.set('role', r);
      if (s) params.set('status', s);
      const res = await fetch(`${API_BASE}/users?${params.toString()}`, { headers });
      const json = await res.json();
      if (json.success) { setUsers(json.data); setTotal(json.total); }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(page, search, roleFilter, statusFilter); }, [page, roleFilter, statusFilter]);

  const doSearch = (e) => {
    e.preventDefault();
    setPage(1);
    load(1, search, roleFilter, statusFilter);
  };

  const resetFilters = () => {
    setSearch(''); setRoleFilter(''); setStatusFilter(''); setPage(1);
    load(1, '', '', '');
  };

  const [exporting, setExporting] = useState(false);

  // Exports every user matching the CURRENT filters, not just the page on
  // screen — a fresh unlimited-page-size request with the same search/role/
  // status params `load()` uses, so this always matches exactly what's
  // showing (minus pagination). With no filters applied at all, that's the
  // full user list, same server-side scoping (Zonal Head/Tender Admin/etc.)
  // as everywhere else in this page.
  const exportUsers = async () => {
    setExporting(true);
    setMsg('');
    try {
      const params = new URLSearchParams({ page: 1, limit: 100000, search });
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${API_BASE}/users?${params.toString()}`, { headers });
      const json = await res.json();
      if (!json.success) { setMsg(json.message || 'Failed to export users.'); return; }

      const rows = json.data.map(u => ({
        Name: u.name,
        Email: u.email,
        Role: u.role,
        Department: (u.departments || []).join(', '),
        Field: (u.fields || []).join(', '),
        'Working States': (u.states || []).join(', '),
        Status: u.status || 'Inactive',
        'Last Login': u.last_login ? new Date(u.last_login).toLocaleString('en-IN') : '',
        Created: u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wpx: 160 }, { wpx: 220 }, { wpx: 140 }, { wpx: 140 }, { wpx: 100 },
        { wpx: 200 }, { wpx: 90 }, { wpx: 150 }, { wpx: 110 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Users');

      const hasFilters = search || roleFilter || statusFilter;
      const suffix = hasFilters ? '_filtered' : '_all';
      XLSX.writeFile(wb, `users${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      setMsg('Could not reach the server.');
    } finally {
      setExporting(false);
    }
  };

  const createUser = async () => {
    if (!form.name || !form.email || !form.password) return setMsg('Fill all fields.');
    setSaving(true); setMsg('');
    try {
      const res = await fetch(`${API_BASE}/users`, { method: 'POST', headers, body: JSON.stringify(form) });
      const json = await res.json();
      if (json.success) { setCreateOpen(false); setForm({ name: '', email: '', password: '', role: 'Tender Admin', departments: [], fields: [], states: [] }); load(1); }
      else setMsg(json.message || 'Failed.');
    } finally { setSaving(false); }
  };

  const updateUser = async () => {
    setSaving(true); setMsg('');
    try {
      const res = await fetch(`${API_BASE}/users/${editUser.id}`, { method: 'PUT', headers, body: JSON.stringify(editForm) });
      const json = await res.json();
      if (json.success) { setEditUser(null); load(page); }
      else setMsg(json.message || 'Failed.');
    } finally { setSaving(false); }
  };

  const resetPassword = async () => {
    if (!newPwd) return setMsg('Enter a new password.');
    setSaving(true); setMsg('');
    try {
      const res = await fetch(`${API_BASE}/users/${resetUser.id}/reset-password`, { method: 'PUT', headers, body: JSON.stringify({ newPassword: newPwd }) });
      const json = await res.json();
      if (json.success) { setResetUser(null); setNewPwd(''); setMsg('Password reset.'); }
      else setMsg(json.message || 'Failed.');
    } finally { setSaving(false); }
  };

  const toggleActive = async (u) => {
    const newStatus = u.status === 'Active' ? 'Inactive' : 'Active';
    await fetch(`${API_BASE}/users/${u.id}`, { method: 'PUT', headers, body: JSON.stringify({ status: newStatus }) });
    load(page);
  };

  const deletePermanently = async (u) => {
    const typed = window.prompt(
      `This permanently deletes "${u.name}" (${u.email}). This cannot be undone.\n\nType DELETE to confirm:`
    );
    if (typed !== 'DELETE') return;
    setMsg('');
    try {
      const res = await fetch(`${API_BASE}/users/${u.id}/permanent`, { method: 'DELETE', headers });
      const json = await res.json();
      if (json.success) { setMsg('User permanently deleted.'); load(page); }
      else setMsg(json.message || 'Failed to delete user.');
    } catch {
      setMsg('Could not reach the server.');
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeCount = users.filter(u => u.status === 'Active').length;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const th = { padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' };
  const td = { padding: '12px 16px', fontSize: 13.5 };

  return (
    <div style={{ width: '100%', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <PageHeader
        title={isZonalHead ? 'My Team' : 'User Management'}
        subtitle={isZonalHead ? `${total} Sales users in your covering states` : 'Create, edit, and manage every account in one place'}
        action={!isZonalHead && <Btn onClick={() => setCreateOpen(true)} icon={Plus}>Create User</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 18 }}>
        <StatCard label="Total (this page)" value={total} icon={Users} tone="blue" />
        <StatCard label="Active (this page)" value={activeCount} icon={UserCheck} tone="green" />
        <StatCard label="Inactive (this page)" value={users.length - activeCount} icon={UserX} tone="red" />
        <StatCard label="Page" value={`${page} / ${pages}`} icon={FileText} tone="navy" />
      </div>

      {msg && (
        <div style={{ background: C.greenSoft, color: C.green, padding: '11px 16px', borderRadius: 9, marginBottom: 16, fontSize: 13, fontWeight: 700, border: `1px solid ${C.green}22` }}>
          {msg}
        </div>
      )}

      <form onSubmit={doSearch}>
        <FilterBar>
          <Field label="Search" grow>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
                style={{ ...fieldBase, width: '100%', boxSizing: 'border-box', paddingLeft: 32 }} />
            </div>
          </Field>
          {!isZonalHead && (
            <Field label="Role">
              <ToolbarSelect value={roleFilter} onChange={v => { setRoleFilter(v); setPage(1); }}
                options={[{ value: '', label: 'All Roles' }, ...ROLES.map(r => ({ value: r, label: r }))]} />
            </Field>
          )}
          <Field label="Status">
            <ToolbarSelect value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }}
              options={[{ value: '', label: 'All Statuses' }, { value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} />
          </Field>
          <Btn onClick={doSearch}>Search</Btn>
          {(search || roleFilter || statusFilter) && (
            <button type="button" onClick={resetFilters} style={{ padding: '9px 16px', background: C.wash, color: C.slate, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, height: 38 }}>
              Clear
            </button>
          )}
          <Btn onClick={exportUsers} disabled={exporting} color={C.green} icon={Download}>
            {exporting ? 'Exporting...' : (search || roleFilter || statusFilter) ? 'Export Filtered' : 'Export All'}
          </Btn>
        </FilterBar>
      </form>

      <div style={{ background: C.panel, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.navy }}>
                {['Name', 'Email', 'Role', 'Department', 'Field', 'Status', 'Last Login', 'Created', 'Actions'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 44, textAlign: 'center', color: C.muted }}>Loading...</td></tr>
              ) : users.map((u, i) => (
                <tr key={u.id} style={{ background: i % 2 ? C.wash : '#fff', borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ ...td, fontWeight: 700, color: C.ink }}>{u.name}</td>
                  <td style={{ ...td, color: C.slate }}>{u.email}</td>
                  <td style={td}><RoleBadge role={u.role} /></td>
                  <td style={td}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(u.departments || []).length === 0
                        ? <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                        : (u.departments || []).map((d, di) => (
                            <span key={`${d}-${di}`} style={{ background: '#f1ebfb', color: '#6d28d9', padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{d}</span>
                          ))
                      }
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(u.fields || []).length === 0
                        ? <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                        : (u.fields || []).map((f, fi) => (
                            <span key={`${f}-${fi}`} style={{ background: C.greenSoft, color: C.green, padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{f}</span>
                          ))
                      }
                    </div>
                  </td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: u.status === 'Active' ? C.green : C.red, fontWeight: 700, fontSize: 12 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: u.status === 'Active' ? C.green : C.red, display: 'inline-block' }} />
                      {u.status || 'Inactive'}
                    </span>
                  </td>
                  <td style={{ ...td, color: C.slate }}>{u.last_login ? new Date(u.last_login).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td style={{ ...td, color: C.slate }}>{u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <IconBtn icon={Pencil} label="Edit" bg={C.blueSoft} fg={C.blueDark}
                        onClick={() => { setEditUser(u); setEditForm({ name: u.name, email: u.email, role: u.role, departments: u.departments || [], fields: u.fields || [], states: u.states || [] }); }} />
                      <IconBtn icon={KeyRound} label="Pwd" bg={C.amberSoft} fg={C.amber}
                        onClick={() => { setResetUser(u); setNewPwd(''); }} />
                      <IconBtn icon={Power} label={u.status === 'Active' ? 'Disable' : 'Enable'}
                        bg={u.status === 'Active' ? C.redSoft : C.greenSoft} fg={u.status === 'Active' ? C.red : C.green}
                        onClick={() => toggleActive(u)} />
                      {isAdmin && u.id !== currentUser.id && (
                        <IconBtn icon={Trash2} label="Delete" bg={C.navy} fg="#fff" title="Permanently delete this account"
                          onClick={() => deletePermanently(u)} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !users.length && <p style={{ textAlign: 'center', color: C.muted, padding: 34 }}>No users found.</p>}
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>Showing <b style={{ color: C.ink }}>{rangeStart}–{rangeEnd}</b> of <b style={{ color: C.ink }}>{total}</b></span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: `1px solid ${C.borderStrong}`, borderRadius: 7, background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12.5, color: C.slate, opacity: page === 1 ? 0.45 : 1, fontWeight: 600 }}>
              <ChevronLeft size={14} /> Prev
            </button>
            <span style={{ padding: '0 6px', fontSize: 13, fontWeight: 700, color: C.ink }}>{page} / {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: `1px solid ${C.borderStrong}`, borderRadius: 7, background: '#fff', cursor: page === pages ? 'not-allowed' : 'pointer', fontSize: 12.5, color: C.slate, opacity: page === pages ? 0.45 : 1, fontWeight: 600 }}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {createOpen && (
        <Modal title="Create New User" onClose={() => setCreateOpen(false)}>
          <Input label="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Enter name" />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
          <Input label="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" />
          <Select label="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} options={ROLES} />
          <MultiSelect label="Department" options={DEPARTMENTS} value={form.departments} onChange={v => setForm(f => ({ ...f, departments: v }))} placeholder="Select departments..." />
          <MultiSelect label="Field" options={FIELDS} value={form.fields} onChange={v => setForm(f => ({ ...f, fields: v }))} placeholder="Select fields..." />
          {STATE_SCOPED_ROLES.includes(form.role) && (
            <MultiSelect label="Working States" options={STATES} value={form.states} onChange={v => setForm(f => ({ ...f, states: v }))} placeholder="Select states..." />
          )}
          {msg && <p style={{ color: C.red, fontSize: 12, margin: '0 0 10px', fontWeight: 600 }}>{msg}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setCreateOpen(false)} style={{ padding: '9px 16px', border: `1px solid ${C.borderStrong}`, borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.slate }}>Cancel</button>
            <Btn onClick={createUser} disabled={saving}>{saving ? 'Saving...' : 'Create User'}</Btn>
          </div>
        </Modal>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <Modal title={`Edit — ${editUser.name}`} onClose={() => setEditUser(null)}>
          <Input label="Full Name" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Email" type="email" value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
          {isZonalHead ? (
            <div style={{ marginBottom: 14 }}><RoleBadge role={editForm.role} /></div>
          ) : (
            <Select label="Role" value={editForm.role || 'Tender Admin'} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} options={ROLES} />
          )}
          <MultiSelect label="Department" options={DEPARTMENTS} value={editForm.departments || []} onChange={v => setEditForm(f => ({ ...f, departments: v }))} placeholder="Select departments..." />
          <MultiSelect label="Field" options={FIELDS} value={editForm.fields || []} onChange={v => setEditForm(f => ({ ...f, fields: v }))} placeholder="Select fields..." />
          {STATE_SCOPED_ROLES.includes(editForm.role) && !isZonalHead && (
            <MultiSelect label="Working States" options={STATES} value={editForm.states || []} onChange={v => setEditForm(f => ({ ...f, states: v }))} placeholder="Select states..." />
          )}
          {msg && <p style={{ color: C.red, fontSize: 12, margin: '0 0 10px', fontWeight: 600 }}>{msg}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setEditUser(null)} style={{ padding: '9px 16px', border: `1px solid ${C.borderStrong}`, borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.slate }}>Cancel</button>
            <Btn onClick={updateUser} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Btn>
          </div>
        </Modal>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <Modal title={`Reset Password — ${resetUser.name}`} onClose={() => setResetUser(null)}>
          <Input label="New Password" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Enter new password" />
          {msg && <p style={{ color: C.red, fontSize: 12, margin: '0 0 10px', fontWeight: 600 }}>{msg}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setResetUser(null)} style={{ padding: '9px 16px', border: `1px solid ${C.borderStrong}`, borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.slate }}>Cancel</button>
            <Btn onClick={resetPassword} disabled={saving} color={C.amber} icon={ShieldCheck}>{saving ? 'Saving...' : 'Reset Password'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

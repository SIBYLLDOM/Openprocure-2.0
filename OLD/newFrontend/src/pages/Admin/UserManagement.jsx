import React, { useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const ROLES = ['Admin', 'Tender Admin', 'Tender Executive', 'Zonal Head', 'Sales', 'Finance Team', 'Legal', 'Documentation'];

// Only Sales and Zonal Head are limited to states; the states picker is hidden
// for every other role so it cannot be set where it has no effect.
const STATE_SCOPED_ROLES = ['Zonal Head', 'Sales'];

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];
const DEPARTMENTS = ['Endo', 'Diagno'];
const FIELDS = ['GEM', 'Open'];

const RoleBadge = ({ role }) => {
  const colors = { Admin: '#7c3aed', 'Tender Admin': '#d97706', 'Tender Executive': '#0d9488', 'Zonal Head': '#0369a1', Sales: '#be185d', 'Finance Team': '#0f766e', Legal: '#7c3aed', Documentation: '#0891b2' };
  const bg = colors[role] || '#6b7280';
  return <span style={{ background: bg + '22', color: bg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{role}</span>;
};

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    onClick={onClose}>
    <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 480, position: 'relative' }}
      onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const Input = ({ label, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
    <input {...props} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' }} />
  </div>
);

const Select = ({ label, options, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
    <select {...props} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, background: '#fff', outline: 'none' }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
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
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <div onClick={() => setOpen(o => !o)} style={{
        minHeight: 38, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 7,
        cursor: 'pointer', background: '#fff', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
      }}>
        {value.length === 0 && <span style={{ color: '#9ca3af', fontSize: 13 }}>{placeholder || 'Select...'}</span>}
        {value.map(v => (
          <span key={v} style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            {v}
            <span onClick={e => { e.stopPropagation(); toggle(v); }} style={{ cursor: 'pointer', lineHeight: 1 }}>×</span>
          </span>
        ))}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, zIndex: 200, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', marginTop: 2 }}>
          {options.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
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

const Btn = ({ onClick, color = '#084f9a', children, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: '8px 16px', background: disabled ? '#d1d5db' : color, color: '#fff',
    border: 'none', borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
  }}>{children}</button>
);

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
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

  const load = async (p = 1, q = search) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users?page=${p}&limit=15&search=${encodeURIComponent(q)}`, { headers });
      const json = await res.json();
      if (json.success) { setUsers(json.data); setTotal(json.total); }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(page, search); }, [page]);

  const doSearch = (e) => {
    e.preventDefault();
    setPage(1);
    load(1, search);
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

  const pages = Math.ceil(total / 15);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>User Management</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{total} total users</p>
        </div>
        <Btn onClick={() => setCreateOpen(true)}>+ Create User</Btn>
      </div>

      {msg && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{msg}</div>}

      <form onSubmit={doSearch} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email..."
          style={{ flex: 1, padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' }} />
        <Btn onClick={doSearch}>Search</Btn>
      </form>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Name', 'Email', 'Role', 'Department', 'Field', 'Status', 'Created', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading...</td></tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{u.email}</td>
                <td style={{ padding: '10px 14px' }}><RoleBadge role={u.role} /></td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(u.departments || []).length === 0
                      ? <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                      : (u.departments || []).map((d, di) => (
                          <span key={`${d}-${di}`} style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{d}</span>
                        ))
                    }
                  </div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(u.fields || []).length === 0
                      ? <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                      : (u.fields || []).map((f, fi) => (
                          <span key={`${f}-${fi}`} style={{ background: '#dcfce7', color: '#166534', padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{f}</span>
                        ))
                    }
                  </div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ color: u.status === 'Active' ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 12 }}>
                    {u.status || 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setEditUser(u); setEditForm({ name: u.name, email: u.email, role: u.role, departments: u.departments || [], fields: u.fields || [], states: u.states || [] }); }}
                      style={{ padding: '4px 10px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Edit</button>
                    <button onClick={() => { setResetUser(u); setNewPwd(''); }}
                      style={{ padding: '4px 10px', background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Pwd</button>
                    <button onClick={() => toggleActive(u)}
                      style={{ padding: '4px 10px', background: u.status === 'Active' ? '#fee2e2' : '#dcfce7', color: u.status === 'Active' ? '#b91c1c' : '#166534', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      {u.status === 'Active' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !users.length && <p style={{ textAlign: 'center', color: '#6b7280', padding: 30 }}>No users found.</p>}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>←</button>
          <span style={{ padding: '6px 12px', fontSize: 13 }}>Page {page} / {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: page === pages ? 'not-allowed' : 'pointer' }}>→</button>
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
          {msg && <p style={{ color: '#dc2626', fontSize: 12, margin: '0 0 10px' }}>{msg}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setCreateOpen(false)} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <Btn onClick={createUser} disabled={saving}>{saving ? 'Saving...' : 'Create User'}</Btn>
          </div>
        </Modal>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <Modal title={`Edit — ${editUser.name}`} onClose={() => setEditUser(null)}>
          <Input label="Full Name" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Email" type="email" value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
          <Select label="Role" value={editForm.role || 'Tender Admin'} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} options={ROLES} />
          <MultiSelect label="Department" options={DEPARTMENTS} value={editForm.departments || []} onChange={v => setEditForm(f => ({ ...f, departments: v }))} placeholder="Select departments..." />
          <MultiSelect label="Field" options={FIELDS} value={editForm.fields || []} onChange={v => setEditForm(f => ({ ...f, fields: v }))} placeholder="Select fields..." />
          {STATE_SCOPED_ROLES.includes(editForm.role) && (
            <MultiSelect label="Working States" options={STATES} value={editForm.states || []} onChange={v => setEditForm(f => ({ ...f, states: v }))} placeholder="Select states..." />
          )}
          {msg && <p style={{ color: '#dc2626', fontSize: 12, margin: '0 0 10px' }}>{msg}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setEditUser(null)} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <Btn onClick={updateUser} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Btn>
          </div>
        </Modal>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <Modal title={`Reset Password — ${resetUser.name}`} onClose={() => setResetUser(null)}>
          <Input label="New Password" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Enter new password" />
          {msg && <p style={{ color: '#dc2626', fontSize: 12, margin: '0 0 10px' }}>{msg}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setResetUser(null)} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <Btn onClick={resetPassword} disabled={saving} color="#d97706">{saving ? 'Saving...' : 'Reset Password'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

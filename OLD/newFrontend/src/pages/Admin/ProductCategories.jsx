import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const DEPTS = ['diagnostic', 'endo', 'analyser', 'rapid_elisa', 'reagents', 'system_packs'];
const CAT_TYPES = ['Perfect', 'Open'];

const TypeBadge = ({ type }) => (
  <span style={{
    background: type === 'Perfect' ? '#dcfce7' : '#fef3c7',
    color: type === 'Perfect' ? '#166534' : '#92400e',
    padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
  }}>{type}</span>
);

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    onClick={onClose}>
    <div style={{ background: '#fff', borderRadius: 12, padding: 26, width: '100%', maxWidth: 460 }}
      onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const inp = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' };
const sel = { ...inp, background: '#fff', cursor: 'pointer' };

export default function ProductCategories() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [deptFilter, setDeptFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({ dept: 'diagnostic', keywords: '', category: 'Perfect' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const LIMIT = 20;

  const load = async (p = page, d = deptFilter, t = typeFilter, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: LIMIT });
      if (d !== 'all') params.set('dept', d);
      if (t !== 'all') params.set('category', t);
      if (q.trim()) params.set('search', q.trim());
      const res = await fetch(`${API_BASE}/product-categories?${params}`, { headers });
      const j = await res.json();
      if (j.success) { setRows(j.data); setTotal(j.total); }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(1, deptFilter, typeFilter, search); }, [deptFilter, typeFilter]);
  useEffect(() => { load(page, deptFilter, typeFilter, search); }, [page]);

  const doSearch = (e) => { e.preventDefault(); setPage(1); load(1, deptFilter, typeFilter, search); };

  const save = async (isEdit) => {
    if (!form.keywords.trim()) return setMsg('Keywords cannot be empty.');
    setSaving(true); setMsg('');
    try {
      const url = isEdit ? `${API_BASE}/product-categories/${editRow.id}` : `${API_BASE}/product-categories`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers, body: JSON.stringify(form) });
      const j = await res.json();
      if (j.success) {
        setCreateOpen(false); setEditRow(null);
        setForm({ dept: 'diagnostic', keywords: '', category: 'Perfect' });
        load(page, deptFilter, typeFilter, search);
      } else { setMsg(j.message || 'Failed.'); }
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    await fetch(`${API_BASE}/product-categories/${id}`, { method: 'DELETE', headers });
    load(page, deptFilter, typeFilter, search);
  };

  const pages = Math.ceil(total / LIMIT);

  const FormBody = ({ isEdit }) => (
    <>
      <div style={{ marginBottom: 13 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Department</label>
        <select style={sel} value={form.dept} onChange={e => setForm(f => ({ ...f, dept: e.target.value }))}>
          {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 13 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Keywords / Category Name</label>
        <textarea style={{ ...inp, resize: 'vertical', minHeight: 70 }} value={form.keywords}
          onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))}
          placeholder="e.g. Immunoassay Analyzer (V2)" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Type</label>
        <select style={sel} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          <option value="Perfect">Perfect</option>
          <option value="Open">Open</option>
        </select>
      </div>
      {msg && <p style={{ color: '#dc2626', fontSize: 12, margin: '0 0 10px' }}>{msg}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => { setCreateOpen(false); setEditRow(null); }}
          style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
        <button onClick={() => save(isEdit)} disabled={saving}
          style={{ padding: '8px 18px', background: saving ? '#d1d5db' : '#084f9a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create'}
        </button>
      </div>
    </>
  );

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Product Categories</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{total} entries · keywords for product matching</p>
        </div>
        <button onClick={() => { setForm({ dept: 'diagnostic', keywords: '', category: 'Perfect' }); setMsg(''); setCreateOpen(true); }}
          style={{ padding: '9px 18px', background: '#084f9a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Add Entry
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, background: '#fff', outline: 'none' }}>
          <option value="all">All Departments</option>
          {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, background: '#fff', outline: 'none' }}>
          <option value="all">All Types</option>
          <option value="Perfect">Perfect</option>
          <option value="Open">Open</option>
        </select>
        <form onSubmit={doSearch} style={{ display: 'flex', gap: 6, flex: 1 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search keywords..."
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', minWidth: 180 }} />
          <button type="submit"
            style={{ padding: '8px 16px', background: '#084f9a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Search
          </button>
        </form>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['#', 'Department', 'Keywords / Category Name', 'Type', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading...</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 11 }}>{(page - 1) * LIMIT + i + 1}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{r.dept}</span>
                </td>
                <td style={{ padding: '10px 14px', fontWeight: 500, maxWidth: 420 }}>{r.keywords}</td>
                <td style={{ padding: '10px 14px' }}><TypeBadge type={r.category} /></td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setEditRow(r); setForm({ dept: r.dept, keywords: r.keywords, category: r.category }); setMsg(''); }}
                      style={{ padding: '4px 10px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Edit</button>
                    <button onClick={() => del(r.id)}
                      style={{ padding: '4px 10px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !rows.length && <p style={{ textAlign: 'center', color: '#6b7280', padding: 30 }}>No entries found.</p>}
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

      {createOpen && (
        <Modal title="Add Entry" onClose={() => setCreateOpen(false)}>
          <FormBody isEdit={false} />
        </Modal>
      )}
      {editRow && (
        <Modal title={`Edit — #${editRow.id}`} onClose={() => setEditRow(null)}>
          <FormBody isEdit={true} />
        </Modal>
      )}
    </div>
  );
}

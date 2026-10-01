import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const STATUS_COLORS = { open: '#dc2626', in_progress: '#d97706', resolved: '#16a34a', closed: '#6b7280' };
const PRIORITY_COLORS = { high: '#dc2626', medium: '#d97706', low: '#16a34a' };

const Badge = ({ val, colorMap }) => {
  const c = colorMap[val] || '#6b7280';
  return <span style={{ background: c + '22', color: c, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{val?.replace('_', ' ').toUpperCase()}</span>;
};

export default function MyTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', image: null });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [viewTicket, setViewTicket] = useState(null);

  const token = localStorage.getItem('token');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/support`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json();
      if (j.success) setTickets(j.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.title.trim() || !form.description.trim()) return setMsg({ text: 'Title and description are required.', ok: false });
    setSubmitting(true); setMsg({ text: '', ok: false });
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('priority', form.priority);
      if (form.image) fd.append('image', form.image);

      const res = await fetch(`${API_BASE}/support`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const j = await res.json();
      if (j.success) {
        setMsg({ text: 'Ticket submitted successfully! Our team will review it shortly.', ok: true });
        setForm({ title: '', description: '', priority: 'medium', image: null });
        setShowForm(false);
        load();
      } else {
        setMsg({ text: j.message || 'Failed to submit ticket.', ok: false });
      }
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>My Support Tickets</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Submit issues or questions to our team</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setMsg({ text: '', ok: false }); }}
          style={{ padding: '9px 18px', background: showForm ? '#6b7280' : '#084f9a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          {showForm ? 'Cancel' : '+ New Ticket'}
        </button>
      </div>

      {msg.text && (
        <div style={{ background: msg.ok ? '#dcfce7' : '#fee2e2', color: msg.ok ? '#166534' : '#b91c1c', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {msg.text}
        </div>
      )}

      {/* New Ticket Form */}
      {showForm && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Submit a New Ticket</h3>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Brief summary of your issue"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe your issue in detail..."
              rows={5}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, background: '#fff', outline: 'none' }}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Attach Image (optional)</label>
              <input type="file" accept="image/*"
                onChange={e => setForm(f => ({ ...f, image: e.target.files[0] || null }))}
                style={{ width: '100%', padding: '6px 0', fontSize: 13 }} />
              {form.image && <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>{form.image.name}</p>}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setShowForm(false)}
              style={{ padding: '9px 18px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={submit} disabled={submitting}
              style={{ padding: '9px 20px', background: submitting ? '#d1d5db' : '#084f9a', color: '#fff', border: 'none', borderRadius: 7, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
              {submitting ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>
        </div>
      )}

      {/* Tickets List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: 32, height: 32, border: '4px solid #dbeafe', borderTopColor: '#084f9a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
          <p style={{ color: '#6b7280', margin: 0 }}>No tickets yet. Submit one if you need help!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tickets.map(t => (
            <div key={t.id} style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
              onClick={() => setViewTicket(viewTicket?.id === t.id ? null : t)}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>
                    <span style={{ color: '#9ca3af', marginRight: 6, fontSize: 12 }}>#{t.id}</span>{t.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(t.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                  <Badge val={t.priority} colorMap={PRIORITY_COLORS} />
                  <Badge val={t.status} colorMap={STATUS_COLORS} />
                </div>
              </div>

              {viewTicket?.id === t.id && (
                <div style={{ marginTop: 14, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                  <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{t.description}</p>
                  {t.image_path && (
                    <img src={`${API_BASE.replace('/api', '')}/${t.image_path}`} alt="attachment"
                      style={{ marginTop: 12, maxWidth: '100%', maxHeight: 300, borderRadius: 8, border: '1px solid #e5e7eb', display: 'block' }} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

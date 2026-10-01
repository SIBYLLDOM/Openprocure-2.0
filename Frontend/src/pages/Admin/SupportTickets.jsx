import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const STATUSES = ['all', 'open', 'in_progress', 'resolved', 'closed'];
const STATUS_COLORS = { open: '#dc2626', in_progress: '#d97706', resolved: '#16a34a', closed: '#6b7280' };
const PRIORITY_COLORS = { high: '#dc2626', medium: '#d97706', low: '#16a34a' };

const Badge = ({ val, colorMap }) => {
  const c = colorMap[val] || '#6b7280';
  return <span style={{ background: c + '22', color: c, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{val?.replace('_', ' ').toUpperCase()}</span>;
};

const Modal = ({ ticket, onClose, onStatusChange }) => {
  const [status, setStatus] = useState(ticket.status);
  const [saving, setSaving] = useState(false);
  const [imgError, setImgError] = useState(false);

  const imageUrl = ticket.image_path ? `${API_BASE.replace('/api', '')}${ticket.image_path}` : null;

  const downloadImage = async () => {
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = ticket.image_path.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/support/${ticket.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const j = await res.json();
      if (j.success) onStatusChange(ticket.id, status);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 580, maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{ticket.title}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
              #{ticket.id} · {ticket.user_name} ({ticket.user_email}) · {new Date(ticket.created_at).toLocaleDateString('en-IN')}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <Badge val={ticket.status} colorMap={STATUS_COLORS} />
          <Badge val={ticket.priority} colorMap={PRIORITY_COLORS} />
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
          {ticket.description}
        </div>

        {ticket.image_path && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Attached Image</p>
            {!imgError && (
              <img
                src={imageUrl}
                alt="ticket attachment"
                style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 8 }}
                onError={() => setImgError(true)}
              />
            )}
            {imgError && (
              <div style={{ fontSize: 12, color: '#9ca3af', padding: '10px 0' }}>Preview unavailable.</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={imageUrl} target="_blank" rel="noopener noreferrer"
                style={{ padding: '6px 14px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                View Full Image
              </a>
              <button onClick={downloadImage}
                style={{ padding: '6px 14px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Download
              </button>
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Update Status</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={status} onChange={e => setStatus(e.target.value)}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, background: '#fff', outline: 'none' }}>
              {STATUSES.filter(s => s !== 'all').map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <button onClick={save} disabled={saving || status === ticket.status}
              style={{ padding: '8px 16px', background: saving || status === ticket.status ? '#d1d5db' : '#084f9a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function SupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [mailing, setMailing] = useState(false);
  const [mailMsg, setMailMsg] = useState(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const load = async (p = 1, st = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 15 });
      if (st !== 'all') params.set('status', st);
      const res = await fetch(`${API_BASE}/support?${params}`, { headers });
      const j = await res.json();
      if (j.success) { setTickets(j.data); setTotal(j.total); }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(page, statusFilter); }, [page, statusFilter]);

  const handleStatusChange = (id, newStatus) => {
    setTickets(ts => ts.map(t => t.id === id ? { ...t, status: newStatus } : t));
    if (selected?.id === id) setSelected(s => ({ ...s, status: newStatus }));
  };

  const pages = Math.ceil(total / 15);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Support Tickets</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{total} total tickets</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (statusFilter !== 'all') params.set('status', statusFilter);
              const url = `${API_BASE}/support/export?${params}`;
              const a = document.createElement('a');
              a.href = url;
              a.setAttribute('download', '');
              // attach auth header via fetch + blob
              fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
                .then(r => r.blob())
                .then(blob => {
                  a.href = URL.createObjectURL(blob);
                  a.download = `support_tickets.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(a.href);
                });
            }}
            style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Export Excel
          </button>
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (statusFilter !== 'all') params.set('status', statusFilter);
              const url = `${API_BASE}/support/export-pdf?${params}`;
              fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
                .then(r => r.blob())
                .then(blob => {
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = 'support_tickets.pdf';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(a.href);
                });
            }}
            style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Export PDF
          </button>
          <button
            disabled={mailing}
            onClick={async () => {
              setMailing(true); setMailMsg(null);
              try {
                const params = new URLSearchParams({ to: 'stevejerald632@gmail.com' });
                if (statusFilter !== 'all') params.set('status', statusFilter);
                const res = await fetch(`${API_BASE}/support/mail-pdf?${params}`, {
                  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                });
                const j = await res.json();
                setMailMsg({ ok: j.success, text: j.message });
              } catch { setMailMsg({ ok: false, text: 'Failed to send email.' }); }
              finally { setMailing(false); setTimeout(() => setMailMsg(null), 5000); }
            }}
            style={{ padding: '6px 14px', background: mailing ? '#d1d5db' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, cursor: mailing ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            {mailing ? 'Sending...' : 'Mail PDF'}
          </button>
          {STATUSES.map(s => (
            <button key={s} onClick={() => { setPage(1); setStatusFilter(s); }}
              style={{
                padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: statusFilter === s ? '#084f9a' : '#f1f5f9',
                color: statusFilter === s ? '#fff' : '#374151',
              }}>
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {mailMsg && (
        <div style={{ background: mailMsg.ok ? '#dcfce7' : '#fee2e2', color: mailMsg.ok ? '#166534' : '#b91c1c', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {mailMsg.text}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['#', 'Title', 'Submitted by', 'Priority', 'Status', 'Date', 'Action'].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading...</td></tr>
            ) : tickets.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 12 }}>#{t.id}</td>
                <td style={{ padding: '10px 14px', fontWeight: 600, maxWidth: 240 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                </td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>
                  <div style={{ fontWeight: 500 }}>{t.user_name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{t.user_email}</div>
                </td>
                <td style={{ padding: '10px 14px' }}><Badge val={t.priority} colorMap={PRIORITY_COLORS} /></td>
                <td style={{ padding: '10px 14px' }}><Badge val={t.status} colorMap={STATUS_COLORS} /></td>
                <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 12 }}>{new Date(t.created_at).toLocaleDateString('en-IN')}</td>
                <td style={{ padding: '10px 14px' }}>
                  <button onClick={() => setSelected(t)}
                    style={{ padding: '4px 12px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !tickets.length && <p style={{ textAlign: 'center', color: '#6b7280', padding: 30 }}>No tickets found.</p>}
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

      {selected && <Modal ticket={selected} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} />}
    </div>
  );
}

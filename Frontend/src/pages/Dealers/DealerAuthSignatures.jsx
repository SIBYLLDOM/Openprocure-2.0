// src/pages/Dealers/DealerAuthSignatures.jsx
// Route: /dealers/signatures
//
// Pending Signatures — Legal Team and Admin (Ravi Kiran) both land here to
// sign a Dealer Authorization Letter via emailed OTP, in that fixed order.
// A completed letter's signed PDF is downloadable from here too.

import { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../../config/api';

const STATUS_LABEL = {
  pending_legal: { label: 'Awaiting Legal Signature', color: '#92400e', bg: '#fef3c7' },
  pending_admin: { label: 'Awaiting Admin Signature', color: '#1d4ed8', bg: '#dbeafe' },
  completed: { label: 'Fully Signed', color: '#166534', bg: '#dcfce7' },
};

const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }) + ' IST';
  } catch { return ''; }
};

const styles = {
  page: { padding: '1.5rem', maxWidth: 960, margin: '0 auto' },
  card: { background: '#fff', borderRadius: 10, padding: '1.25rem 1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', marginBottom: '1rem' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' },
  pill: (bg, color) => ({ background: bg, color, borderRadius: 999, padding: '0.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 700 }),
  btn: (bg) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }),
  ghostBtn: { background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  input: { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem', letterSpacing: '0.2em', textAlign: 'center', width: 160 },
};

export default function DealerAuthSignatures() {
  const token = localStorage.getItem('token');
  const authHeader = { Authorization: `Bearer ${token}` };

  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem('user')); } catch { /* ignore */ }
  const role = currentUser?.role;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [otpModeId, setOtpModeId] = useState(null); // request id currently showing the OTP input
  const [otpValue, setOtpValue] = useState('');
  const [sendingOtpId, setSendingOtpId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [actionMsg, setActionMsg] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dealer-auth-letters`, { headers: authHeader });
      const json = await res.json();
      if (json.success) setRequests(json.data);
      else setError(json.message || 'Failed to load signature requests');
    } catch (e) {
      setError('Failed to load signature requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const myStage = (r) => {
    if (r.status === 'pending_legal' && role === 'Legal') return 'legal';
    if (r.status === 'pending_admin' && (role === 'Admin' || role === 'Tender Admin' || role === 'Office Administrator')) return 'admin';
    return null;
  };

  const handleSendOtp = async (r) => {
    setSendingOtpId(r.id);
    setActionMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/dealer-auth-letters/${r.id}/send-otp`, {
        method: 'POST', headers: authHeader,
      });
      const json = await res.json();
      if (!json.success) { alert(json.message || 'Failed to send OTP'); return; }
      setOtpModeId(r.id);
      setOtpValue('');
      setActionMsg(json.message);
    } catch (e) {
      alert('Failed to send OTP: ' + e.message);
    } finally {
      setSendingOtpId(null);
    }
  };

  const handleVerifyOtp = async (r) => {
    if (!otpValue.trim()) return;
    setVerifyingId(r.id);
    try {
      const res = await fetch(`${API_BASE_URL}/dealer-auth-letters/${r.id}/verify-otp`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpValue.trim() }),
      });
      const json = await res.json();
      if (!json.success) { alert(json.message || 'Invalid OTP'); return; }
      setOtpModeId(null);
      setOtpValue('');
      setActionMsg('');
      fetchRequests();
    } catch (e) {
      alert('Failed to verify OTP: ' + e.message);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDownload = async (r) => {
    setDownloadingId(r.id);
    try {
      const res = await fetch(`${API_BASE_URL}/dealer-auth-letters/${r.id}/pdf`, { headers: authHeader });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Authorization_Letter_${r.company_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) return <div style={styles.page}>Loading…</div>;

  return (
    <div style={styles.page}>
      <h2 style={{ marginBottom: '0.25rem' }}>Pending Signatures</h2>
      <p style={{ color: '#6b7280', marginTop: 0, marginBottom: '1.5rem' }}>
        Dealer Authorization Letters awaiting a Legal or Admin OTP signature.
      </p>

      {error && <div style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</div>}

      {requests.length === 0 && !error && (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem 0' }}>Nothing here right now.</div>
      )}

      {requests.map((r) => {
        const statusCfg = STATUS_LABEL[r.status] || {};
        const stage = myStage(r);
        return (
          <div key={r.id} style={styles.card}>
            <div style={styles.row}>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>{r.company_name}</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                  {r.division} · Submitted {fmtDate(r.created_at)}
                </p>
                {r.legal_signed_at && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#166534' }}>✓ Legal signed {fmtDate(r.legal_signed_at)}</p>
                )}
                {r.admin_signed_at && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#166534' }}>✓ Admin signed {fmtDate(r.admin_signed_at)}</p>
                )}
              </div>
              <span style={styles.pill(statusCfg.bg, statusCfg.color)}>{statusCfg.label || r.status}</span>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {stage && otpModeId !== r.id && (
                <button
                  onClick={() => handleSendOtp(r)}
                  disabled={sendingOtpId === r.id}
                  style={styles.btn('#2563eb')}
                >
                  {sendingOtpId === r.id ? 'Sending OTP…' : `Send OTP to my email & Sign`}
                </button>
              )}

              {stage && otpModeId === r.id && (
                <>
                  <input
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit OTP"
                    style={styles.input}
                    maxLength={6}
                  />
                  <button
                    onClick={() => handleVerifyOtp(r)}
                    disabled={verifyingId === r.id || otpValue.length !== 6}
                    style={styles.btn('#166534')}
                  >
                    {verifyingId === r.id ? 'Verifying…' : 'Verify & Sign'}
                  </button>
                  <button onClick={() => { setOtpModeId(null); setOtpValue(''); }} style={styles.ghostBtn}>Cancel</button>
                  {actionMsg && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{actionMsg}</span>}
                </>
              )}

              {r.status === 'completed' && (
                <button
                  onClick={() => handleDownload(r)}
                  disabled={downloadingId === r.id}
                  style={styles.btn('#7c3aed')}
                >
                  {downloadingId === r.id ? 'Downloading…' : '⬇ Download Signed PDF'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const Section = ({ title, children }) => (
  <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
    <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e5e7eb', paddingBottom: 10 }}>{title}</h3>
    {children}
  </div>
);

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);

const inp = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px',
  border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none',
};

const Btn = ({ onClick, color = '#084f9a', disabled, children }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: '9px 20px', background: disabled ? '#d1d5db' : color, color: '#fff',
    border: 'none', borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
  }}>{children}</button>
);

const Alert = ({ msg, ok }) => msg ? (
  <div style={{ background: ok ? '#dcfce7' : '#fee2e2', color: ok ? '#166534' : '#b91c1c', padding: '9px 14px', borderRadius: 7, fontSize: 13, marginBottom: 14 }}>{msg}</div>
) : null;

export default function Profile() {
  const [profile, setProfile] = useState(null);

  const [nameForm, setNameForm] = useState({ name: '' });
  const [nameMsg, setNameMsg] = useState({ text: '', ok: false });
  const [nameSaving, setNameSaving] = useState(false);

  const [emailForm, setEmailForm] = useState({ email: '', currentPassword: '' });
  const [emailMsg, setEmailMsg] = useState({ text: '', ok: false });
  const [emailSaving, setEmailSaving] = useState(false);

  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwdMsg, setPwdMsg] = useState({ text: '', ok: false });
  const [pwdSaving, setPwdSaving] = useState(false);

  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API_BASE}/users/me`, { headers })
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setProfile(j.data);
          setNameForm({ name: j.data.name });
          setEmailForm(f => ({ ...f, email: j.data.email }));
        }
      });
  }, []);

  const saveName = async () => {
    if (!nameForm.name.trim()) return setNameMsg({ text: 'Name cannot be empty.', ok: false });
    setNameSaving(true); setNameMsg({ text: '', ok: false });
    try {
      const res = await fetch(`${API_BASE}/users/me/profile`, {
        method: 'PUT', headers,
        body: JSON.stringify({ name: nameForm.name }),
      });
      const j = await res.json();
      if (j.success) {
        setNameMsg({ text: 'Name updated successfully.', ok: true });
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...u, name: nameForm.name }));
      } else {
        setNameMsg({ text: j.message || 'Failed.', ok: false });
      }
    } finally { setNameSaving(false); }
  };

  const saveEmail = async () => {
    if (!emailForm.email || !emailForm.currentPassword) return setEmailMsg({ text: 'Fill all fields.', ok: false });
    setEmailSaving(true); setEmailMsg({ text: '', ok: false });
    try {
      const res = await fetch(`${API_BASE}/users/me/profile`, {
        method: 'PUT', headers,
        body: JSON.stringify({ email: emailForm.email, currentPassword: emailForm.currentPassword }),
      });
      const j = await res.json();
      if (j.success) {
        setEmailMsg({ text: 'Email updated. Please log in again.', ok: true });
        setEmailForm(f => ({ ...f, currentPassword: '' }));
      } else {
        setEmailMsg({ text: j.message || 'Failed.', ok: false });
      }
    } finally { setEmailSaving(false); }
  };

  const savePwd = async () => {
    if (!pwdForm.currentPassword || !pwdForm.newPassword) return setPwdMsg({ text: 'Fill all fields.', ok: false });
    if (pwdForm.newPassword !== pwdForm.confirm) return setPwdMsg({ text: 'Passwords do not match.', ok: false });
    if (pwdForm.newPassword.length < 6) return setPwdMsg({ text: 'Min 6 characters.', ok: false });
    setPwdSaving(true); setPwdMsg({ text: '', ok: false });
    try {
      const res = await fetch(`${API_BASE}/users/me/password`, {
        method: 'PUT', headers,
        body: JSON.stringify({ currentPassword: pwdForm.currentPassword, newPassword: pwdForm.newPassword }),
      });
      const j = await res.json();
      if (j.success) {
        setPwdMsg({ text: 'Password changed successfully.', ok: true });
        setPwdForm({ currentPassword: '', newPassword: '', confirm: '' });
      } else {
        setPwdMsg({ text: j.message || 'Failed.', ok: false });
      }
    } finally { setPwdSaving(false); }
  };

  if (!profile) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 36, height: 36, border: '4px solid #dbeafe', borderTopColor: '#084f9a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#1e293b' }}>My Profile</h1>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 13 }}>
        {profile.email} &nbsp;·&nbsp;
        <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{profile.role}</span>
      </p>

      {/* Change Name */}
      <Section title="Display Name">
        <Alert msg={nameMsg.text} ok={nameMsg.ok} />
        <Field label="Full Name">
          <input style={inp} value={nameForm.name} onChange={e => setNameForm({ name: e.target.value })} placeholder="Your full name" />
        </Field>
        <Btn onClick={saveName} disabled={nameSaving}>{nameSaving ? 'Saving...' : 'Save Name'}</Btn>
      </Section>

      {/* Change Email */}
      <Section title="Change Email Address">
        <Alert msg={emailMsg.text} ok={emailMsg.ok} />
        <Field label="New Email">
          <input style={inp} type="email" value={emailForm.email} onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))} />
        </Field>
        <Field label="Current Password (required to change email)">
          <input style={inp} type="password" value={emailForm.currentPassword} onChange={e => setEmailForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="Confirm with your password" />
        </Field>
        <Btn onClick={saveEmail} disabled={emailSaving} color="#7c3aed">{emailSaving ? 'Saving...' : 'Update Email'}</Btn>
      </Section>

      {/* Change Password */}
      <Section title="Change Password">
        <Alert msg={pwdMsg.text} ok={pwdMsg.ok} />
        <Field label="Current Password">
          <input style={inp} type="password" value={pwdForm.currentPassword} onChange={e => setPwdForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="Your current password" />
        </Field>
        <Field label="New Password">
          <input style={inp} type="password" value={pwdForm.newPassword} onChange={e => setPwdForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="At least 6 characters" />
        </Field>
        <Field label="Confirm New Password">
          <input style={inp} type="password" value={pwdForm.confirm} onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Repeat new password" />
        </Field>
        <Btn onClick={savePwd} disabled={pwdSaving} color="#d97706">{pwdSaving ? 'Saving...' : 'Change Password'}</Btn>
      </Section>
    </div>
  );
}

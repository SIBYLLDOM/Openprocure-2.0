import React, { useState, useEffect } from 'react';
import '../assets/css/login.css';
import Logo from '../assets/img/logo.png';
import { Link } from 'react-router-dom';
import API_BASE_URL from '../config/api';

const ResetPassword = () => {
  const token = new URLSearchParams(window.location.search).get('token');

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [invalidMessage, setInvalidMessage] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setInvalidMessage('No reset token provided.');
      return;
    }
    fetch(`${API_BASE_URL}/auth/reset-password/verify?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        setValid(!!data.valid);
        if (!data.valid) setInvalidMessage(data.message || 'This reset link is invalid.');
      })
      .catch(() => setInvalidMessage('Could not verify this reset link. Please try again.'))
      .finally(() => setChecking(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Failed to reset password.');
        return;
      }
      setDone(true);
    } catch {
      setError('Server error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="right-section" style={{ width: '100%' }}>
        <div className="login-form-container">
          <img src={Logo} alt="Logo" style={{ alignContent: 'center' }} className="LogoDesign" />
          <h2>Reset Password</h2>
          <p className="subtitle">Tender System</p>

          {checking ? (
            <p style={{ textAlign: 'center', color: '#6b7280', marginTop: '24px' }}>
              Checking your link…
            </p>
          ) : done ? (
            <div className="success-message">
              <div className="success-icon">✓</div>
              <h3>Password Updated</h3>
              <p>You can now log in with your new password.</p>
              <Link to="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                Go to Login
              </Link>
            </div>
          ) : !valid ? (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <p style={{ color: '#dc2626', fontWeight: 600 }}>{invalidMessage}</p>
              <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '8px' }}>
                Ask your admin for a fresh reset link, or{' '}
                <Link to="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                  go back to Login
                </Link>.
              </p>
            </div>
          ) : (
            <form className="login-form" onSubmit={handleSubmit}>
              {error && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b',
                  borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '12px',
                }}>
                  {error}
                </div>
              )}

              <div className="form-group">
                <label>New Password</label>
                <div className="password-input">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      {showPassword ? (
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      ) : (
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="login-btn" disabled={submitting}>
                {submitting ? 'Updating…' : 'Set New Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

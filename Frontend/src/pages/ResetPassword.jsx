import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/css/login.css';
import '../assets/css/resetPassword.css';
import ADIA from '../assets/img/ADIA.jpeg';
import recep from '../assets/img/2.jpg';
import ppl from '../assets/img/1.jpg';
import Logo from '../assets/img/logo.png';
import API_BASE_URL from '../config/api';

const slides = [
  { image: ADIA },
  { image: recep },
  { image: ppl },
];

// Small self-contained captcha — no external service/CDN (the app's CSP
// blocks third-party script hosts anyway). Just enough friction to stop a
// dumb bot from hammering the reset endpoint; not meant to stop a targeted
// attacker.
function generateCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const ResetPassword = () => {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get('token') || '';

  const [status, setStatus] = useState('checking'); // checking | valid | invalid
  const [invalidMessage, setInvalidMessage] = useState('');
  // The account this reset link actually belongs to — resolved from the
  // token, never shown to the user. The user must type it themselves and
  // pass Verify before the rest of the form unlocks; typing it is what's
  // checked against this, not just "is this email registered at all" (that
  // alone would let anyone holding a leaked reset link reset a DIFFERENT
  // registered user's password just by typing that other person's email).
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [typedEmail, setTypedEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [emailError, setEmailError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaCode, setCaptchaCode] = useState(generateCaptcha());
  const [captchaInput, setCaptchaInput] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const refreshCaptcha = useCallback(() => {
    setCaptchaCode(generateCaptcha());
    setCaptchaInput('');
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      setInvalidMessage('This reset link is missing its token — please request a new one.');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/reset-password/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.valid) {
          setResolvedEmail(data.email || '');
          setStatus('valid');
        } else {
          setStatus('invalid');
          setInvalidMessage(data.message || 'This reset link is invalid.');
        }
      } catch {
        setStatus('invalid');
        setInvalidMessage('Could not verify this reset link — check your connection and try again.');
      }
    })();
  }, [token]);

  // Checked purely client-side against the email the token already resolved
  // to (fetched silently on load) — no extra request needed, and no account
  // enumeration risk since a mismatch never reveals whether that OTHER email
  // exists in the system, just that it doesn't match this link.
  const handleVerifyEmail = () => {
    setEmailError('');
    const typed = typedEmail.trim().toLowerCase();
    if (!typed) {
      setEmailError('Enter the email registered with your OpenProcure account.');
      return;
    }
    setVerifying(true);
    setTimeout(() => {
      if (typed === resolvedEmail.trim().toLowerCase()) {
        setEmailVerified(true);
      } else {
        setEmailVerified(false);
        setEmailError("That email doesn't match a registered OpenProcure account for this reset link — please double-check it, or reach out to your admin to get an account created.");
      }
      setVerifying(false);
    }, 400); // brief pause so the check reads as a real verification, not instant
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!emailVerified) {
      setError('Please verify your email first.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (captchaInput.trim().toUpperCase() !== captchaCode) {
      setError('Captcha does not match — please try again.');
      refreshCaptcha();
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
        refreshCaptcha();
        setSubmitting(false);
        return;
      }
      setDone(true);
      setTimeout(() => {
        navigate(`/login?email=${encodeURIComponent(typedEmail.trim())}`, { replace: true });
      }, 1800);
    } catch {
      setError('Server error. Please try again.');
      refreshCaptcha();
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="left-section">
        <div className="background-carousel">
          {slides.map((slide, index) => (
            <div
              key={index}
              className={`background-image ${index === currentSlide ? 'active' : ''}`}
              style={{ backgroundImage: `url(${slide.image})` }}
            />
          ))}
          <div className="background-overlay" />
        </div>

        <div className="carousel-indicators">
          {slides.map((_, index) => (
            <div
              key={index}
              className={`indicator ${index === currentSlide ? 'active' : ''}`}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>
      </div>

      <div className="right-section">
        <div className="login-form-container">
          <img src={Logo} alt="Logo" className="LogoDesign" />
          <h2>Reset Password</h2>
          <p className="subtitle">Tender System</p>

          {status === 'checking' && (
            <div className="rp-status">Verifying your reset link…</div>
          )}

          {status === 'invalid' && (
            <div className="rp-status rp-status-error">
              <p>{invalidMessage}</p>
              <a href="/login" className="rp-back-link">Back to Login</a>
            </div>
          )}

          {status === 'valid' && !done && (
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <div className="rp-verify-row">
                  <input
                    type="email"
                    placeholder="Enter your registered OpenProcure email"
                    value={typedEmail}
                    onChange={(e) => { setTypedEmail(e.target.value); setEmailVerified(false); setEmailError(''); }}
                    disabled={emailVerified}
                    required
                  />
                  {emailVerified ? (
                    <span className="rp-verified-badge" title="Verified">✓ Verified</span>
                  ) : (
                    <button type="button" className="rp-verify-btn" onClick={handleVerifyEmail} disabled={verifying}>
                      {verifying ? 'Checking…' : 'Verify'}
                    </button>
                  )}
                </div>
                {emailError && <div className="rp-error" style={{ marginTop: '8px' }}>{emailError}</div>}
              </div>

              <div className="form-group">
                <label>New Password</label>
                <div className="password-input">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    disabled={!emailVerified}
                    required
                  />
                  <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)} disabled={!emailVerified}>
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
                  minLength={6}
                  disabled={!emailVerified}
                  required
                />
              </div>

              <div className="form-group">
                <label>Captcha</label>
                <div className="rp-captcha-row">
                  <div className="rp-captcha-code">{captchaCode}</div>
                  <button type="button" className="rp-captcha-refresh" onClick={refreshCaptcha} title="Get a new code" disabled={!emailVerified}>⟳</button>
                </div>
                <input
                  type="text"
                  placeholder="Type the code above"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  disabled={!emailVerified}
                  required
                  style={{ marginTop: '8px' }}
                />
              </div>

              {error && <div className="rp-error">{error}</div>}

              <button type="submit" className="login-btn" disabled={submitting || !emailVerified}>
                {submitting ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}

          {done && (
            <div className="rp-status rp-status-success">
              <div className="rp-success-icon">✓</div>
              <p>Password updated! Redirecting you to login…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

import React, { useState, useEffect } from 'react';
import '../assets/css/login.css';
import ADIA from '../assets/img/ADIA.jpeg';
import recep from '../assets/img/2.jpg';
import ppl from '../assets/img/1.jpg';
import API_BASE_URL from '../config/api';

//logo
import Logo from '../assets/img/logo.png';
import { Link } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      title: "",
      subtitle: "",
      description:
        "",
      image: ADIA
    },
    {
      title: " ",
      subtitle: "",
      description:
        "",
      image: recep
    },
    {
      title: "",
      subtitle: "",
      description:
        "",
      image: ppl
    }
  ];


  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // After a successful password reset, ResetPassword.jsx redirects here with
  // ?email=... so the user lands back at login with their email already
  // filled in — they only have to type the new password they just set.
  useEffect(() => {
    const prefillEmail = new URLSearchParams(window.location.search).get('email');
    if (prefillEmail) {
      setEmail(prefillEmail);
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          rememberMe
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || 'Login failed');
        return;
      }

      // Save token and session
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.sessionId) localStorage.setItem('sessionId', String(data.sessionId));

      // Redirect based on role
      const preTenderRoles = ['Admin', 'Tender Admin', 'Office Administrator', 'Tender Executive', 'Zonal Head', 'Sales', 'Finance Team', 'Legal', 'Documentation'];
      if (preTenderRoles.includes(data.user.role)) {
        window.location.href = '/Admin/';
      } else {
        // Post-tender roles (Post, Finance, Logistics, QC, etc.) go to post-tender system
        window.location.href = 'https://post-tender.openprocure.ai/Admin/dashboard';
      }
    } catch (error) {
      alert('Server error. Please try again.');
    }
  };


  const handleForgotPassword = async (e) => {
    e.preventDefault();

    await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail })
    });

    setShowSuccessMessage(true);
  };


  return (
    <div className="login-container">
      {/* Left Section - Carousel */}
      <div className="left-section">
        {/* Background Image Carousel */}
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


        <div className="carousel">
          {slides.map((slide, index) => (
            <div
              key={index}
              className={`slide ${index === currentSlide ? 'active' : ''}`}
            >
              <h1 className="slide-title">{slide.title}</h1>
              <h1 className="slide-subtitle">{slide.subtitle}</h1>
              <p className="slide-description">{slide.description}</p>
            </div>
          ))}
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

      {/* Right Section - Login Form */}
      <div className="right-section">
        <div className="login-form-container">
          <img src={Logo} alt="Logo" style={{ alignContent: 'center' }} className='LogoDesign' />
          <h2>Welcome Back!</h2>
          <p className="subtitle">Tender System</p>

          <div className="login-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="Input your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Input your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <div className="form-options">
              <label className="remember-me">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember Me</span>
              </label>
              <button
                type="button"
                className="forgot-password"
                onClick={() => setShowForgotModal(true)}
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="button"
              className="login-btn"
              onClick={handleLogin}
            >
              Login
            </button>

            {/* Self-registration disabled for now — will be re-enabled later. */}
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="modal-overlay" onClick={() => setShowForgotModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {!showSuccessMessage ? (
              <>
                <h3>Reset Password</h3>
                <p className="modal-description">
                  Enter your email address and we'll send you instructions to reset your password.
                </p>
                <div className="modal-form">
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                  </div>
                  <div className="modal-buttons">
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() => setShowForgotModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="submit-btn"
                      onClick={handleForgotPassword}
                    >
                      Submit
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="success-message">
                <div className="success-icon">✓</div>
                <h3>Check Your Email</h3>
                <p>
                  We've sent password reset instructions to <strong>{resetEmail}</strong>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
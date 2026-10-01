import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../assets/css/login.css';
import ADIA from '../assets/img/ADIA.jpeg';
import recep from '../assets/img/2.jpg';
import ppl from '../assets/img/1.jpg';
import Logo from '../assets/img/logo.png';
import API_BASE_URL from '../config/api';

const DEPARTMENTS = [
    { value: 'Endo', label: 'EndoSurgery' },
    { value: 'Diagno', label: 'Diagnostic' },
    { value: '360', label: '360' },
];

const FIELDS = [
    { value: 'GEM', label: 'GEM' },
    { value: 'Open', label: 'Open Tender' },
];

const INDIA_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa',
    'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
    'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
    'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

// All roles - pre-tender system roles & post-tender system roles
const ALL_ROLES = [
    { value: 'Tender Admin', label: 'Tender Admin', system: 'Pre-Tender' },
    { value: 'Tender Executive', label: 'Tender Executive', system: 'Pre-Tender' },
    { value: 'Zonal Head', label: 'Zonal Head', system: 'Pre-Tender' },
    { value: 'Sales', label: 'Sales', system: 'Pre-Tender' },
    { value: 'Finance Team', label: 'Finance Team', system: 'Post-Tender' },
    { value: 'Legal', label: 'Legal (DSC / authorization)', system: 'Pre-Tender' },
    { value: 'Documentation', label: 'Documentation / Ops', system: 'Pre-Tender' },
    { value: 'Admin', label: 'Admin', system: 'Pre-Tender' },
];

const Register = () => {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [role, setRole] = useState('');
    const [states, setStates] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [fields, setFields] = useState([]);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);

    const slides = [
        { image: ADIA },
        { image: recep },
        { image: ppl },
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % slides.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    const handleRegister = async (e) => {
        e.preventDefault();

        if (!name || !email || !password || !confirmPassword || !role) {
            alert('Please fill in all fields.');
            return;
        }

        const isScopedRole = role === 'Sales' || role === 'Zonal Head';
        if (isScopedRole && states.length === 0) {
            alert('Select at least one state you cover.');
            return;
        }
        if (isScopedRole && departments.length === 0) {
            alert('Select at least one department you cover.');
            return;
        }
        if (isScopedRole && fields.length === 0) {
            alert('Select at least one field (GEM/Open) you cover.');
            return;
        }

        if (password !== confirmPassword) {
            alert('Passwords do not match.');
            return;
        }

        if (password.length < 6) {
            alert('Password must be at least 6 characters.');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, email, password, role,
                    states: isScopedRole ? states : undefined,
                    departments: isScopedRole ? departments : undefined,
                    fields: isScopedRole ? fields : undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                alert(data.message || 'Registration failed.');
                return;
            }

            alert('Account created successfully! You can now log in.');
            navigate('/login');
        } catch (error) {
            alert('Server error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const EyeIcon = ({ open }) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            {open ? (
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            )}
        </svg>
    );

    return (
        <div className="login-container">
            {/* Left Section - Carousel */}
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

            {/* Right Section - Register Form */}
            <div className="right-section">
                <div className="login-form-container">
                    <img src={Logo} alt="Logo" className="LogoDesign" />
                    <h2>Create Account</h2>
                    <p className="subtitle">Fill in your details to register</p>

                    <div className="login-form">
                        {/* Full Name */}
                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                type="text"
                                placeholder="Enter your full name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        {/* Email */}
                        <div className="form-group">
                            <label>Email</label>
                            <input
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        {/* Role Selection */}
                        <div className="form-group">
                            <label>Role</label>
                            <select
                                value={role}
                                onChange={(e) => {
                                setRole(e.target.value);
                                if (e.target.value !== 'Sales' && e.target.value !== 'Zonal Head') {
                                    setStates([]);
                                    setDepartments([]);
                                    setFields([]);
                                }
                            }}
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    border: '1.5px solid #d1d5db',
                                    borderRadius: '10px',
                                    fontSize: '14px',
                                    background: '#fff',
                                    color: role ? '#111' : '#9ca3af',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    appearance: 'auto',
                                }}
                            >
                                <option value="" disabled>Select your role</option>
                                <optgroup label="── Pre-Tender System">
                                    {ALL_ROLES.filter(r => r.system === 'Pre-Tender').map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="── Post-Tender System">
                                    {ALL_ROLES.filter(r => r.system === 'Post-Tender').map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </optgroup>
                            </select>
                            {role && (
                                <small style={{ marginTop: '4px', display: 'block', color: '#6b7280', fontSize: '12px' }}>
                                    System: <strong style={{ color: ALL_ROLES.find(r => r.value === role)?.system === 'Pre-Tender' ? '#2563eb' : '#7c3aed' }}>
                                        {ALL_ROLES.find(r => r.value === role)?.system}
                                    </strong>
                                </small>
                            )}
                        </div>

                        {/* Department (Sales / Zonal Head) */}
                        {(role === 'Sales' || role === 'Zonal Head') && (
                            <div className="form-group">
                                <label>Department ({departments.length} selected)</label>
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                    {DEPARTMENTS.map(d => {
                                        const checked = departments.includes(d.value);
                                        return (
                                            <label
                                                key={d.value}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '14px',
                                                    color: '#111',
                                                    cursor: 'pointer',
                                                    padding: '8px 14px',
                                                    border: '1.5px solid #d1d5db',
                                                    borderRadius: '10px',
                                                    background: checked ? '#eff6ff' : '#fff',
                                                    borderColor: checked ? '#2563eb' : '#d1d5db',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setDepartments(prev =>
                                                            checked ? prev.filter(x => x !== d.value) : [...prev, d.value]
                                                        );
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                {d.label}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Field / Tender source (Sales / Zonal Head) */}
                        {(role === 'Sales' || role === 'Zonal Head') && (
                            <div className="form-group">
                                <label>Tender field you cover ({fields.length} selected)</label>
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                    {FIELDS.map(f => {
                                        const checked = fields.includes(f.value);
                                        return (
                                            <label
                                                key={f.value}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '14px',
                                                    color: '#111',
                                                    cursor: 'pointer',
                                                    padding: '8px 14px',
                                                    border: '1.5px solid #d1d5db',
                                                    borderRadius: '10px',
                                                    background: checked ? '#eff6ff' : '#fff',
                                                    borderColor: checked ? '#2563eb' : '#d1d5db',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setFields(prev =>
                                                            checked ? prev.filter(x => x !== f.value) : [...prev, f.value]
                                                        );
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                {f.label}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* States (Sales / Zonal Head) */}
                        {(role === 'Sales' || role === 'Zonal Head') && (
                            <div className="form-group">
                                <label>States you cover ({states.length} selected)</label>
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, 1fr)',
                                        gap: '6px 12px',
                                        maxHeight: '220px',
                                        overflowY: 'auto',
                                        padding: '10px 12px',
                                        border: '1.5px solid #d1d5db',
                                        borderRadius: '10px',
                                        background: '#fff',
                                    }}
                                >
                                    {INDIA_STATES.map(st => {
                                        const checked = states.includes(st);
                                        return (
                                            <label
                                                key={st}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '13px',
                                                    color: '#111',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setStates(prev =>
                                                            checked ? prev.filter(s => s !== st) : [...prev, st]
                                                        );
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                {st}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Password */}
                        <div className="form-group">
                            <label>Password</label>
                            <div className="password-input">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Minimum 6 characters"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
                                    <EyeIcon open={showPassword} />
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div className="form-group">
                            <label>Confirm Password</label>
                            <div className="password-input">
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    placeholder="Re-enter your password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    style={{
                                        borderColor: confirmPassword && confirmPassword !== password ? '#ef4444' : undefined,
                                    }}
                                />
                                <button type="button" className="toggle-password" onClick={() => setShowConfirm(!showConfirm)}>
                                    <EyeIcon open={showConfirm} />
                                </button>
                            </div>
                            {confirmPassword && confirmPassword !== password && (
                                <small style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                                    Passwords do not match
                                </small>
                            )}
                        </div>

                        {/* Submit */}
                        <button
                            type="button"
                            className="login-btn"
                            onClick={handleRegister}
                            disabled={loading}
                            style={{ opacity: loading ? 0.7 : 1 }}
                        >
                            {loading ? 'Creating Account...' : 'Create Account'}
                        </button>

                        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px', color: '#6b7280' }}>
                            Already have an account?{' '}
                            <Link to="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                                Login
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;

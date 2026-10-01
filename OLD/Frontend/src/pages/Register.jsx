import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../assets/css/login.css';
import ADIA from '../assets/img/ADIA.jpeg';
import recep from '../assets/img/2.jpg';
import ppl from '../assets/img/1.jpg';
import Logo from '../assets/img/logo.png';
import API_BASE_URL from '../config/api';

// All roles - pre-tender system roles & post-tender system roles
const ALL_ROLES = [
    { value: 'pre-tender', label: 'Pre-Tender (Tender Team)', system: 'Pre-Tender' },
    { value: 'Admin', label: 'Admin', system: 'Pre-Tender' },
    { value: 'Management', label: 'Management', system: 'Pre-Tender' },
    { value: 'Sales', label: 'Sales', system: 'Pre-Tender' },
    { value: 'Tender', label: 'Tender Executive', system: 'Pre-Tender' },
    { value: 'Post', label: 'Post-Tender Executive', system: 'Post-Tender' },
    { value: 'Finance', label: 'Finance', system: 'Post-Tender' },
    { value: 'Logistics', label: 'Logistics', system: 'Post-Tender' },
    { value: 'QC', label: 'Quality Control (QC)', system: 'Post-Tender' },
];

// Sales accounts are state-scoped — see backend utils/userScope.js. Standard
// Indian states + UTs list, so picks match what the rest of the app expects.
const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
    'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
    'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
    'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
    'Ladakh', 'Lakshadweep', 'Puducherry',
];

// The two independent axes a Sales account is scoped by, alongside states —
// see backend utils/userScope.js. Matching is AND across axes.
const DEPARTMENTS = ['Endo', 'Diagno'];
const FIELDS = ['GEM', 'Open'];

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

        if (role === 'Sales' && states.length === 0) {
            alert('Select at least one state you cover.');
            return;
        }

        if (role === 'Sales' && departments.length === 0) {
            alert('Select at least one department (Endo/Diagno) you cover.');
            return;
        }

        if (role === 'Sales' && fields.length === 0) {
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
                    ...(role === 'Sales' ? { states, departments, fields } : {}),
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
                                onChange={(e) => setRole(e.target.value)}
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

                        {/* Department covered (Endo/Diagno) — Sales only */}
                        {role === 'Sales' && (
                            <div className="form-group">
                                <label>Department You Cover</label>
                                <div style={{ display: 'flex', gap: '16px', padding: '4px 0' }}>
                                    {DEPARTMENTS.map(dep => (
                                        <label
                                            key={dep}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                fontSize: '13px', color: '#374151', cursor: 'pointer',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={departments.includes(dep)}
                                                onChange={(e) => {
                                                    setDepartments(prev =>
                                                        e.target.checked
                                                            ? [...prev, dep]
                                                            : prev.filter(d => d !== dep)
                                                    );
                                                }}
                                            />
                                            {dep}
                                        </label>
                                    ))}
                                </div>
                                {departments.length === 0 && (
                                    <small style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                                        Select at least one department
                                    </small>
                                )}
                            </div>
                        )}

                        {/* Field covered (GEM/Open) — Sales only */}
                        {role === 'Sales' && (
                            <div className="form-group">
                                <label>Field You Cover</label>
                                <div style={{ display: 'flex', gap: '16px', padding: '4px 0' }}>
                                    {FIELDS.map(fld => (
                                        <label
                                            key={fld}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                fontSize: '13px', color: '#374151', cursor: 'pointer',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={fields.includes(fld)}
                                                onChange={(e) => {
                                                    setFields(prev =>
                                                        e.target.checked
                                                            ? [...prev, fld]
                                                            : prev.filter(f => f !== fld)
                                                    );
                                                }}
                                            />
                                            {fld}
                                        </label>
                                    ))}
                                </div>
                                {fields.length === 0 && (
                                    <small style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                                        Select at least one field
                                    </small>
                                )}
                            </div>
                        )}

                        {/* States covered — Sales only */}
                        {role === 'Sales' && (
                            <div className="form-group">
                                <label>
                                    States You Cover
                                    {states.length > 0 && (
                                        <span style={{ color: '#2563eb', fontWeight: 600 }}> ({states.length} selected)</span>
                                    )}
                                </label>
                                <div
                                    style={{
                                        maxHeight: '160px', overflowY: 'auto',
                                        border: '1.5px solid #d1d5db', borderRadius: '10px',
                                        padding: '10px 14px', background: '#fff',
                                    }}
                                >
                                    {INDIAN_STATES.map(st => (
                                        <label
                                            key={st}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                padding: '4px 0', fontSize: '13px', color: '#374151',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={states.includes(st)}
                                                onChange={(e) => {
                                                    setStates(prev =>
                                                        e.target.checked
                                                            ? [...prev, st]
                                                            : prev.filter(s => s !== st)
                                                    );
                                                }}
                                            />
                                            {st}
                                        </label>
                                    ))}
                                </div>
                                {states.length === 0 && (
                                    <small style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                                        Select at least one state
                                    </small>
                                )}
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

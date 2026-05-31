import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const SearchableSelect = ({ label, name, options, value, onChange, placeholder, required }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [customValue, setCustomValue] = useState('');
    const containerRef = useRef(null);

    const filteredOptions = options.filter(opt =>
        opt.toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleOptionClick = (opt) => {
        onChange({ target: { name, value: opt } });
        setIsOpen(false);
        setSearchTerm('');
    };

    const handleCustomSubmit = (e) => {
        if (e.key === 'Enter' && customValue.trim()) {
            e.preventDefault();
            handleOptionClick(customValue.trim());
            setCustomValue('');
        }
    };

    const useCustomValue = () => {
        if (customValue.trim()) {
            handleOptionClick(customValue.trim());
            setCustomValue('');
        }
    };

    return (
        <div className="searchable-select-container" ref={containerRef} style={{ position: 'relative', marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>{label}</label>
            <div
                style={{
                    padding: '10px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff'
                }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span>{value || placeholder}</span>
                <span>{isOpen ? '▴' : '▾'}</span>
            </div>

            {isOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #ccc', borderRadius: '4px', marginTop: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                        <input
                            type="text"
                            placeholder="Search existing..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                    </div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '200px', overflowY: 'auto' }}>
                        {filteredOptions.map((opt, i) => (
                            <li key={i} onClick={() => handleOptionClick(opt)} style={{ padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid #eee' }} onMouseOver={(e) => e.target.style.background = '#f5f5f5'} onMouseOut={(e) => e.target.style.background = 'transparent'}>
                                {opt}
                            </li>
                        ))}
                        {filteredOptions.length === 0 && searchTerm && (
                            <li style={{ padding: '10px 15px', color: '#888' }}>No matches found for "{searchTerm}"</li>
                        )}
                    </ul>
                    <div style={{ padding: '8px', borderTop: '1px solid #eee', background: '#fafafa' }}>
                        <div style={{ fontSize: '12px', color: '#888', textAlign: 'center', margin: '4px 0 8px' }}>OR TYPE CUSTOM</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="Type your own place..."
                                value={customValue}
                                onChange={(e) => setCustomValue(e.target.value)}
                                onKeyDown={handleCustomSubmit}
                                style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                            <button
                                type="button"
                                onClick={useCustomValue}
                                disabled={!customValue.trim()}
                                style={{ padding: '8px 12px', background: '#084f9a', color: '#fff', border: 'none', borderRadius: '4px', cursor: customValue.trim() ? 'pointer' : 'not-allowed', opacity: customValue.trim() ? 1 : 0.6 }}
                            >
                                Choose
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {required && !value && <input type="hidden" required value="" />}
        </div>
    );
};

const SuccessModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', paddingBottom: '40px', borderRadius: '8px', textAlign: 'center', maxWidth: '400px', width: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#dcfce3', color: '#22c55e', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 20px' }}>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '32px', height: '32px' }}>
                        <path d="M7 13L10 16L17 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    </svg>
                </div>
                <h2 style={{ marginTop: 0, color: '#1a1a1a' }}>Submission Successful!</h2>
                <p style={{ color: '#666', lineHeight: 1.5, marginBottom: '24px' }}>Your visit feedback has been accurately stored in the system database.</p>
                <button onClick={onClose} style={{ padding: '10px 24px', background: '#084f9a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', cursor: 'pointer', fontWeight: 500 }}>
                    Great, thanks!
                </button>
            </div>
        </div>
    );
};

const FLSPAttendance = () => {
    const { tokenId } = useParams();
    const navigate = useNavigate();

    const getTodayDate = () => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    };

    const initialFormState = {
        date: getTodayDate(),
        time: '09:00',
        state: '',
        place: '',
        personName: '',
        designation: '',
        remarks: '',
        tokenId: tokenId || '',
        latitude: null,
        longitude: null
    };

    const [formData, setFormData] = useState(initialFormState);
    const [submitted, setSubmitted] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [availablePlaces, setAvailablePlaces] = useState([]);
    const [loading, setLoading] = useState(false);
    const [locationStatus, setLocationStatus] = useState('Fetching location...');

    useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setFormData(prev => ({
                        ...prev,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    }));
                    setLocationStatus('Location captured automatically ✓');
                },
                (error) => {
                    console.error("Error obtaining location:", error);
                    setLocationStatus('Unable to capture location! Please enable location services.');
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        } else {
            setLocationStatus('Geolocation is not supported by your browser.');
        }
    }, []);

    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    const INDIAN_STATES_AND_UTS = [
        "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
        "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
        "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
        "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
        "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
        "Uttar Pradesh", "Uttarakhand", "West Bengal",
        "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
        "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
    ];

    useEffect(() => {
        if (formData.state) {
            // Placeholder for actual places fetch if needed for your system, but the user code had an /api/places
            // For now, since they can type whatever they want using SearchableSelect custom value, it's safe to provide empty
            setAvailablePlaces([]);
        } else {
            setAvailablePlaces([]);
        }
    }, [formData.state]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const newData = { ...prev, [name]: value };
            if (name === 'state') {
                newData.place = '';
            }
            return newData;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/prebid/attendance`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Success:', result);
                setSubmitted(true);
                setShowModal(true);
                setFormData(initialFormState);
                setTimeout(() => setSubmitted(false), 3000);
            } else {
                const errorData = await response.json();
                console.error('Submission failed:', errorData.message);
                alert(errorData.message || 'Failed to save feedback.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error connecting to the backend. Please ensure the server is started.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main style={{ padding: '40px', minHeight: '100vh', background: '#f5f7fa', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            <div style={{ background: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', maxWidth: '800px', width: '100%' }}>
                <h1 style={{ marginTop: 0, color: '#1a1a1a', fontSize: '28px', marginBottom: '8px' }}>Site Visit Feedback</h1>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <p style={{ color: '#666', margin: 0, fontSize: '16px' }}>Please provide your visit details and feedback.</p>
                    <div style={{
                        fontSize: '13px',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        background: locationStatus.includes('✓') ? '#dcfce3' : '#fee2e2',
                        color: locationStatus.includes('✓') ? '#166534' : '#991b1b',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        {locationStatus.includes('✓') ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        )}
                        {locationStatus}
                    </div>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }} htmlFor="date">Date of Visit</label>
                            <input
                                type="date"
                                id="date"
                                name="date"
                                value={formData.date}
                                onChange={handleChange}
                                required
                                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }} htmlFor="time">Time of Visit</label>
                            <input
                                type="time"
                                id="time"
                                name="time"
                                value={formData.time}
                                onChange={handleChange}
                                required
                                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                            />
                        </div>

                        <SearchableSelect
                            label="State"
                            name="state"
                            options={INDIAN_STATES_AND_UTS}
                            value={formData.state}
                            onChange={handleChange}
                            placeholder="Select State"
                            required={true}
                        />

                        <SearchableSelect
                            label="Place of Visit"
                            name="place"
                            options={availablePlaces}
                            value={formData.place}
                            onChange={handleChange}
                            placeholder="Select or Type Place"
                            required={true}
                        />

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }} htmlFor="personName">Visited Person Name</label>
                            <input
                                type="text"
                                id="personName"
                                name="personName"
                                placeholder="Enter full name"
                                value={formData.personName}
                                onChange={handleChange}
                                required
                                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }} htmlFor="designation">Designation</label>
                            <input
                                type="text"
                                id="designation"
                                name="designation"
                                placeholder="Enter designation"
                                value={formData.designation}
                                onChange={handleChange}
                                required
                                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }} htmlFor="remarks">Feedback / Remarks</label>
                        <textarea
                            id="remarks"
                            name="remarks"
                            placeholder="Provide your detailed feedback/remarks about the visit..."
                            rows="6"
                            value={formData.remarks}
                            onChange={handleChange}
                            required
                            style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }}
                        ></textarea>
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
                        <button type="button" onClick={() => navigate('/tenders')} style={{ padding: '12px 24px', background: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} style={{ padding: '12px 24px', background: submitted ? '#28a745' : '#084f9a', color: 'white', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '16px', transition: 'background-color 0.3s' }}>
                            {loading ? 'Submitting...' : submitted ? '✓ Feedback Recorded' : 'Submit Feedback/Remarks'}
                        </button>
                    </div>
                </form>
            </div>
            <SuccessModal isOpen={showModal} onClose={() => { setShowModal(false); navigate('/tenders'); }} />
        </main>
    );
};

export default FLSPAttendance;

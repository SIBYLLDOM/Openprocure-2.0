import React, { useState, useEffect, useRef } from 'react';

const ShareDeviationModal = ({ onClose, tenderId, shareType = 'deviation' }) => {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
    const cleanBidNumber = tenderId.replace(/_/g, '/');
    const endpoint = shareType === 'suggestions' ? 'share-suggestions' : shareType === 'tender' ? 'share-tender' : 'share-deviation';
    const modalTitle = shareType === 'suggestions' ? 'Share Suggested Products' : shareType === 'tender' ? 'Share Tender Details' : 'Share Deviation Analysis';

    // Pre-populated from existing prebid_meeting
    const [prebidFlsp, setPrebidFlsp] = useState([]);
    const [prebidZoneHead, setPrebidZoneHead] = useState([]);

    // Zone/State picker for additional recipients
    const [zones, setZones] = useState([]);
    const [states, setStates] = useState([]);
    const [zoneHeads, setZoneHeads] = useState([]);
    const [flsps, setFlsps] = useState([]);
    const [selectedZone, setSelectedZone] = useState('');
    const [selectedState, setSelectedState] = useState('');

    // Selected recipients (email strings)
    const [selectedEmails, setSelectedEmails] = useState(new Set());
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [loadingTeam, setLoadingTeam] = useState(true);
    const [loadingZone, setLoadingZone] = useState(false);

    // Manually-entered email addresses (not from the FLSP/Zone Head lists)
    const [customEmails, setCustomEmails] = useState([]);
    const [emailInput, setEmailInput] = useState('');
    const [emailError, setEmailError] = useState('');

    // Team suggestions — the caller's own division's other Tender Admins /
    // Tender Executives (e.g. a Tender Executive sees their Tender Admin and
    // fellow Executives; a Tender Admin sees their division's Executives).
    const [teamSuggestions, setTeamSuggestions] = useState([]);
    const [loadingTeamSuggestions, setLoadingTeamSuggestions] = useState(true);

    // Maps FLSP email → their Zonal Manager email(s) for auto-CC logic
    const managersByFlsp = useRef({});

    // Fetch existing prebid team and zones on mount
    useEffect(() => {
        const init = async () => {
            try {
                const [teamRes, zonesRes] = await Promise.all([
                    fetch(`${API_BASE}/tenders/${encodeURIComponent(cleanBidNumber)}/prebid-team`, {
                        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                    }),
                    fetch(`${API_BASE}/prebid/zones`)
                ]);
                const teamData = await teamRes.json();
                const zonesData = await zonesRes.json();

                if (teamData.success) {
                    const flspList = teamData.flsp || [];
                    const zoneHeadList = teamData.zoneHead || [];
                    setPrebidFlsp(flspList);
                    setPrebidZoneHead(zoneHeadList);
                    // Map each pre-bid FLSP to the zone heads of this tender
                    flspList.forEach(f => {
                        managersByFlsp.current[f] = zoneHeadList;
                    });
                    // Pre-select all existing team members
                    const preSelected = new Set([...flspList, ...zoneHeadList]);
                    setSelectedEmails(preSelected);
                }
                if (zonesData.success) setZones(zonesData.zones);
            } catch (e) {
                console.error('Error loading share modal data:', e);
            } finally {
                setLoadingTeam(false);
            }
        };
        init();

        const loadTeamSuggestions = async () => {
            try {
                const res = await fetch(`${API_BASE}/tenders/team-suggestions`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                const data = await res.json();
                if (data.success) setTeamSuggestions(data.data);
            } catch (e) {
                console.error('Error loading team suggestions:', e);
            } finally {
                setLoadingTeamSuggestions(false);
            }
        };
        loadTeamSuggestions();
    }, []);

    // Fetch states + zone heads when zone changes
    useEffect(() => {
        setSelectedState('');
        setStates([]);
        setZoneHeads([]);
        setFlsps([]);
        if (!selectedZone) return;

        const fetch_ = async () => {
            setLoadingZone(true);
            try {
                const [statesRes, headsRes] = await Promise.all([
                    fetch(`${API_BASE}/prebid/states?zone=${encodeURIComponent(selectedZone)}`),
                    fetch(`${API_BASE}/prebid/zone-heads?zone=${encodeURIComponent(selectedZone)}`)
                ]);
                const statesData = await statesRes.json();
                const headsData = await headsRes.json();
                if (statesData.success) setStates(statesData.states);
                if (headsData.success) setZoneHeads(headsData.zoneHeads);
            } catch (e) {
                console.error('Error fetching zone data:', e);
            } finally {
                setLoadingZone(false);
            }
        };
        fetch_();
    }, [selectedZone]);

    // Fetch FLSPs when state changes
    useEffect(() => {
        setFlsps([]);
        if (!selectedState) return;

        const fetch_ = async () => {
            setLoadingZone(true);
            try {
                const res = await fetch(`${API_BASE}/prebid/flsp?state=${encodeURIComponent(selectedState)}`);
                const data = await res.json();
                if (data.success) {
                    setFlsps(data.flsps);
                    // Map each FLSP in this zone/state to the zone heads for auto-CC
                    const managerEmails = zoneHeads.map(h => h.email_id);
                    data.flsps.forEach(f => {
                        managersByFlsp.current[f.email_id] = managerEmails;
                    });
                }
            } catch (e) {
                console.error('Error fetching FLSPs:', e);
            } finally {
                setLoadingZone(false);
            }
        };
        fetch_();
    }, [selectedState]);

    const toggleEmail = (email) => {
        setSelectedEmails(prev => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    };

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const addCustomEmail = () => {
        const email = emailInput.trim().toLowerCase();
        if (!email) return;
        if (!EMAIL_RE.test(email)) {
            setEmailError('Enter a valid email address.');
            return;
        }
        if (selectedEmails.has(email)) {
            setEmailError('This email is already added.');
            return;
        }
        setCustomEmails(prev => [...prev, email]);
        setSelectedEmails(prev => new Set(prev).add(email));
        setEmailInput('');
        setEmailError('');
    };

    const removeCustomEmail = (email) => {
        setCustomEmails(prev => prev.filter(e => e !== email));
        setSelectedEmails(prev => {
            const next = new Set(prev);
            next.delete(email);
            return next;
        });
    };

    const buildCC = (recipients) => {
        const userEmail = (() => { try { return JSON.parse(localStorage.getItem('user'))?.email || ''; } catch { return ''; } })();
        const ccSet = new Set();
        if (userEmail) ccSet.add(userEmail);
        recipients.forEach(email => {
            const managers = managersByFlsp.current[email] || [];
            managers.forEach(m => ccSet.add(m));
        });
        // Remove any email already in TO so it doesn't appear twice
        recipients.forEach(r => ccSet.delete(r));
        return [...ccSet].filter(Boolean);
    };

    const handleSend = async () => {
        const recipients = [...selectedEmails];
        if (recipients.length === 0) {
            alert('Please select at least one recipient.');
            return;
        }
        const cc = buildCC(recipients);
        setSending(true);
        try {
            const res = await fetch(
                `${API_BASE}/tenders/${encodeURIComponent(cleanBidNumber)}/${endpoint}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ recipients, cc, message })
                }
            );
            const data = await res.json();
            if (data.success) {
                alert(`✅ ${data.message}`);
                onClose();
            } else {
                alert(`❌ ${data.message || 'Failed to send.'}`);
            }
        } catch (e) {
            console.error('Error sharing deviation:', e);
            alert('❌ Error sending. Please try again.');
        } finally {
            setSending(false);
        }
    };

    const chipStyle = (selected) => ({
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 12px', borderRadius: '6px',
        border: `1px solid ${selected ? '#3b82f6' : '#d1d5db'}`,
        background: selected ? '#eff6ff' : '#f9fafb',
        cursor: 'pointer', marginBottom: '6px',
        transition: 'all 0.15s',
    });

    const label = (tag, email, name) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px',
                    background: tag === 'FLSP' ? '#dbeafe' : '#fce7f3',
                    color: tag === 'FLSP' ? '#1d4ed8' : '#be185d',
                }}>{tag}</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{name || email}</span>
            </span>
            {name && <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '36px' }}>{email}</span>}
        </div>
    );

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}
            onClick={onClose}
        >
            <div
                style={{ background: '#fff', borderRadius: '12px', width: '520px', maxWidth: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>{modalTitle}</h2>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>{cleanBidNumber}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>×</button>
                </div>

                {/* Body */}
                <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>

                    {/* Existing pre-bid team */}
                    <div style={{ marginBottom: '20px' }}>
                        <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                            Pre-Bid Team {loadingTeam ? '(loading…)' : ''}
                        </p>
                        {!loadingTeam && prebidFlsp.length === 0 && prebidZoneHead.length === 0 && (
                            <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>No pre-bid team assigned yet. Use the picker below to select recipients.</p>
                        )}
                        {prebidZoneHead.map(email => (
                            <div key={email} style={chipStyle(selectedEmails.has(email))} onClick={() => toggleEmail(email)}>
                                <input type="checkbox" checked={selectedEmails.has(email)} onChange={() => toggleEmail(email)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                {label('Zonal Manager', email, '')}
                            </div>
                        ))}
                        {prebidFlsp.map(email => (
                            <div key={email} style={chipStyle(selectedEmails.has(email))} onClick={() => toggleEmail(email)}>
                                <input type="checkbox" checked={selectedEmails.has(email)} onChange={() => toggleEmail(email)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                {label('FLSP', email, '')}
                            </div>
                        ))}
                    </div>

                    {/* Zone / State picker for additional recipients */}
                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginBottom: '16px' }}>
                        <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Add More Recipients</p>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <select
                                value={selectedZone}
                                onChange={e => setSelectedZone(e.target.value)}
                                style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                            >
                                <option value="">— Zone —</option>
                                {zones.map(z => <option key={z} value={z}>{z}</option>)}
                            </select>
                            <select
                                value={selectedState}
                                onChange={e => setSelectedState(e.target.value)}
                                disabled={!selectedZone}
                                style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', opacity: !selectedZone ? 0.5 : 1 }}
                            >
                                <option value="">— State —</option>
                                {states.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        {loadingZone && <p style={{ fontSize: '12px', color: '#9ca3af', margin: '4px 0' }}>Loading…</p>}

                        {/* Zone heads */}
                        {zoneHeads.map(h => (
                            <div key={h.emp_id} style={chipStyle(selectedEmails.has(h.email_id))} onClick={() => toggleEmail(h.email_id)}>
                                <input type="checkbox" checked={selectedEmails.has(h.email_id)} onChange={() => toggleEmail(h.email_id)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                {label('Zonal Manager', h.email_id, h.name)}
                            </div>
                        ))}

                        {/* FLSPs */}
                        {flsps.map(f => (
                            <div key={f.emp_id} style={chipStyle(selectedEmails.has(f.email_id))} onClick={() => toggleEmail(f.email_id)}>
                                <input type="checkbox" checked={selectedEmails.has(f.email_id)} onChange={() => toggleEmail(f.email_id)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                {label('FLSP', f.email_id, f.name)}
                            </div>
                        ))}
                    </div>

                    {/* Team suggestions — your own division's other Tender Admins / Tender Executives */}
                    {!loadingTeamSuggestions && teamSuggestions.length > 0 && (
                        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginBottom: '16px' }}>
                            <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Your Team</p>
                            {teamSuggestions.map(u => (
                                <div key={u.id} style={chipStyle(selectedEmails.has(u.email))} onClick={() => toggleEmail(u.email)}>
                                    <input type="checkbox" checked={selectedEmails.has(u.email)} onChange={() => toggleEmail(u.email)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                    {label(u.role === 'Tender Admin' ? 'Admin' : 'Executive', u.email, u.name)}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add recipient by typing an email address */}
                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginBottom: '16px' }}>
                        <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Add Recipient by Email</p>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                            <input
                                type="email"
                                value={emailInput}
                                onChange={e => { setEmailInput(e.target.value); setEmailError(''); }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomEmail(); } }}
                                placeholder="name@example.com"
                                style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                            <button
                                type="button"
                                onClick={addCustomEmail}
                                style={{ padding: '8px 16px', background: '#084f9a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                            >
                                + Add
                            </button>
                        </div>
                        {emailError && <p style={{ color: '#dc2626', fontSize: '12px', margin: '0 0 8px' }}>{emailError}</p>}
                        {customEmails.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {customEmails.map(email => (
                                    <span key={email} style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '4px 8px', borderRadius: '14px', background: '#eff6ff',
                                        border: '1px solid #3b82f6', fontSize: '12px', color: '#1d4ed8', fontWeight: 500,
                                    }}>
                                        {email}
                                        <button
                                            type="button"
                                            onClick={() => removeCustomEmail(email)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', fontSize: '14px', lineHeight: 1, padding: 0 }}
                                            aria-label={`Remove ${email}`}
                                        >×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Optional message */}
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                            Additional Note <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                        </label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={3}
                            placeholder="Add a note to include in the email…"
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
                        {selectedEmails.size} recipient{selectedEmails.size !== 1 ? 's' : ''} selected
                    </span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={onClose}
                            disabled={sending}
                            style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={sending || selectedEmails.size === 0}
                            style={{
                                padding: '8px 20px', background: '#084f9a', color: '#fff', border: 'none',
                                borderRadius: '6px', cursor: (sending || selectedEmails.size === 0) ? 'not-allowed' : 'pointer',
                                fontWeight: 600, opacity: (sending || selectedEmails.size === 0) ? 0.6 : 1
                            }}
                        >
                            {sending ? 'Sending…' : '📧 Send'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShareDeviationModal;

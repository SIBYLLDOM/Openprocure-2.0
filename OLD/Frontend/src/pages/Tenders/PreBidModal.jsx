import React, { useState, useEffect } from 'react';

const PreBidModal = ({ onClose, bidNumber, tenderDetails = {} }) => {
    const [zones, setZones] = useState([]);
    const [states, setStates] = useState([]);
    const [zoneHeads, setZoneHeads] = useState([]);
    const [flsps, setFlsps] = useState([]);

    const [selectedZone, setSelectedZone] = useState('');
    const [selectedState, setSelectedState] = useState('');
    const [selectedZoneHead, setSelectedZoneHead] = useState(null);
    const [selectedFLSPs, setSelectedFLSPs] = useState([]);

    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [teamRemarks, setTeamRemarks] = useState('');

    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    // Fetch distinct zones on mount
    useEffect(() => {
        const fetchZones = async () => {
            try {
                const res = await fetch(`${API_BASE}/prebid/zones`);
                const data = await res.json();
                if (data.success) {
                    setZones(data.zones);
                }
            } catch (error) {
                console.error('Error fetching zones:', error);
            }
        };
        fetchZones();
    }, [API_BASE]);

    // Fetch states and zone heads when zone changes
    useEffect(() => {
        setSelectedState('');
        setStates([]);
        setSelectedZoneHead(null);
        setZoneHeads([]);

        if (!selectedZone) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const [statesRes, headsRes] = await Promise.all([
                    fetch(`${API_BASE}/prebid/states?zone=${encodeURIComponent(selectedZone)}`),
                    fetch(`${API_BASE}/prebid/zone-heads?zone=${encodeURIComponent(selectedZone)}`)
                ]);

                const statesData = await statesRes.json();
                const headsData = await headsRes.json();

                if (statesData.success) setStates(statesData.states);
                if (headsData.success) {
                    setZoneHeads(headsData.zoneHeads);
                    // Auto-select if there's only one head? Usually good UX, or just leave blank.
                    if (headsData.zoneHeads.length === 1) {
                        setSelectedZoneHead(headsData.zoneHeads[0]);
                    }
                }
            } catch (error) {
                console.error('Error fetching zone dependent data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [selectedZone, API_BASE]);

    // Fetch FLSPs when state changes
    useEffect(() => {
        setFlsps([]);
        setSelectedFLSPs([]);

        if (!selectedState) return;

        const fetchFlsp = async () => {
            setLoading(true);
            try {
                const res = await fetch(`${API_BASE}/prebid/flsp?state=${encodeURIComponent(selectedState)}`);
                const data = await res.json();
                if (data.success) {
                    setFlsps(data.flsps);
                }
            } catch (error) {
                console.error('Error fetching FLSPs:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchFlsp();
    }, [selectedState, API_BASE]);

    const handleFLSPToggle = (flsp) => {
        const exists = selectedFLSPs.find(f => f.emp_id === flsp.emp_id);
        if (exists) {
            setSelectedFLSPs(prev => prev.filter(f => f.emp_id !== flsp.emp_id));
        } else {
            setSelectedFLSPs(prev => [...prev, flsp]);
        }
    };

    const handleSendInvite = async () => {
        // Collect emails
        const toEmails = [];
        const ccEmails = [];

        if (selectedZoneHead && selectedZoneHead.email_id) {
            ccEmails.push(selectedZoneHead.email_id);
        }
        selectedFLSPs.forEach(f => {
            if (f.email_id) toEmails.push(f.email_id);
        });

        if (toEmails.length === 0 && ccEmails.length === 0) {
            alert('Please select at least one recipient with a valid email.');
            return;
        }

        setSending(true);
        try {
            const cleanBid = bidNumber.replace(/_/g, '/');

            // Extract meeting details if available from tender (otherwise backend has defaults)
            const meetingDetails = {
                date: tenderDetails?.meetingDate || '13-02-2026',
                time: tenderDetails?.meetingTime || '11:00:00',
                link: 'https://meet.google.com/ndh-eiqc-xjb'
            };

            const res = await fetch(`${API_BASE}/prebid/send-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toEmails,
                    ccEmails,
                    bidNumber: cleanBid,
                    meetingDetails,
                    teamRemarks
                })
            });

            const data = await res.json();
            if (data.success) {
                alert('Invites sent successfully!');
                onClose();
            } else {
                alert('Failed to send invites: ' + (data.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error sending invites:', error);
            alert('An error occurred while sending invites.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', padding: '24px', borderRadius: '12px', background: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#1a1a1a', fontSize: '1.25rem', borderBottom: '1px solid #eaeaea', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                    Assign Pre-Bid Meeting
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', lineHeight: '1' }}>&times;</button>
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Zone Dropdown */}
                    <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Zone</label>
                        <select
                            value={selectedZone}
                            onChange={(e) => setSelectedZone(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', outline: 'none' }}
                        >
                            <option value="">-- Select Zone --</option>
                            {zones.map(z => <option key={z} value={z}>{z}</option>)}
                        </select>
                    </div>

                    {/* Zone Head Auto-populate/Dropdown */}
                    {selectedZone && (
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Zone Head</label>
                            <select
                                value={selectedZoneHead ? selectedZoneHead.emp_id : ''}
                                onChange={(e) => {
                                    const head = zoneHeads.find(h => h.emp_id === e.target.value);
                                    setSelectedZoneHead(head || null);
                                }}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', outline: 'none', background: '#f9fafb' }}
                            >
                                <option value="">-- Select Zone Head --</option>
                                {zoneHeads.map(h => <option key={h.emp_id} value={h.emp_id}>{h.name} ({h.email_id})</option>)}
                            </select>
                        </div>
                    )}

                    {/* State Dropdown */}
                    {selectedZone && (
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>State</label>
                            <select
                                value={selectedState}
                                onChange={(e) => setSelectedState(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', outline: 'none' }}
                            >
                                <option value="">-- Select State --</option>
                                {states.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    )}

                    {/* FLSP Multi-select */}
                    {selectedState && (
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Field Level Sales Personnel (FLSP)</label>
                            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px', background: '#f9fafb' }}>
                                {loading && flsps.length === 0 ? (
                                    <p style={{ margin: 0, padding: '8px', color: '#6b7280', fontSize: '13px' }}>Loading FLSPs...</p>
                                ) : flsps.length === 0 ? (
                                    <p style={{ margin: 0, padding: '8px', color: '#6b7280', fontSize: '13px' }}>No FLSPs found for this state.</p>
                                ) : (
                                    flsps.map(f => (
                                        <div key={f.emp_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', borderBottom: '1px solid #eee' }}>
                                            <input
                                                type="checkbox"
                                                id={`flsp-${f.emp_id}`}
                                                checked={!!selectedFLSPs.find(sf => sf.emp_id === f.emp_id)}
                                                onChange={() => handleFLSPToggle(f)}
                                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                            />
                                            <label htmlFor={`flsp-${f.emp_id}`} style={{ cursor: 'pointer', fontSize: '14px', color: '#374151', userSelect: 'none', flex: 1 }}>
                                                <strong>{f.name}</strong> <span style={{ color: '#6b7280', fontSize: '12px' }}>({f.email_id})</span>
                                            </label>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Team Remarks */}
                    <div style={{ marginTop: '16px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Team Remarks (Optional)</label>
                        <textarea
                            value={teamRemarks}
                            onChange={(e) => setTeamRemarks(e.target.value)}
                            rows="3"
                            placeholder="Add any remarks for the pre-bid strategy..."
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', outline: 'none', resize: 'vertical' }}
                        />
                    </div>
                </div>

                {/* Footer Buttons */}
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #eaeaea', paddingTop: '16px' }}>
                    <button
                        onClick={onClose}
                        disabled={sending}
                        style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSendInvite}
                        disabled={sending || (!selectedZoneHead && selectedFLSPs.length === 0)}
                        style={{ padding: '8px 24px', background: '#084f9a', color: 'white', border: 'none', borderRadius: '6px', cursor: (sending || (!selectedZoneHead && selectedFLSPs.length === 0)) ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: (sending || (!selectedZoneHead && selectedFLSPs.length === 0)) ? 0.7 : 1 }}
                    >
                        {sending ? 'Sending...' : 'Send Invite'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PreBidModal;

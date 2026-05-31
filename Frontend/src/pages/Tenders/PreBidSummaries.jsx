import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Download, Eye, MapPin } from 'lucide-react';
import '../../assets/css/TendersPage.css'; // Reusing table styles

const PreBidSummaries = () => {
    const [summaries, setSummaries] = useState([]);
    const [flattenedData, setFlattenedData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedRemark, setSelectedRemark] = useState(null);
    const navigate = useNavigate();

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8082/api';

    useEffect(() => {
        fetchSummaries();
    }, []);

    const fetchSummaries = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE_URL}/prebid/all-summaries`);
            if (!res.ok) throw new Error('Failed to fetch prebid summaries.');
            const data = await res.json();
            if (data.success) {
                setSummaries(data.data);
                processFlattenedData(data.data);
            } else {
                throw new Error(data.message || 'Unknown error');
            }
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const processFlattenedData = (rawData) => {
        let flatList = [];
        let sno = 1;

        rawData.forEach(tender => {
            // 1. Add Team Remark as its own row (if we want to track the original team note)
            if (tender.team_remarks) {
                flatList.push({
                    sno: sno++,
                    date: tender.prebid_date || 'N/A',
                    bidNumber: tender.bid_no,
                    zone: tender.zone || 'N/A',
                    location: 'N/A',
                    state: tender.state || 'N/A',
                    visitedPerson: 'Internal Team',
                    position: 'N/A',
                    flsp: 'N/A',
                    remarks: tender.team_remarks,
                    isTeam: true,
                    latitude: null,
                    longitude: null
                });
            }

            // 2. Add each FLSP Visit as a separate row
            if (tender.flsp_visits && tender.flsp_visits.length > 0) {
                tender.flsp_visits.forEach(visit => {
                    flatList.push({
                        sno: sno++,
                        date: new Date(visit.visit_date).toLocaleDateString() || 'N/A',
                        bidNumber: tender.bid_no,
                        zone: tender.zone || 'N/A',
                        location: visit.place || 'N/A',
                        state: visit.state || 'N/A',
                        visitedPerson: visit.person_name || 'N/A',
                        position: visit.designation || 'N/A',
                        flsp: 'Yes', // Indicates it was an FLSP visit
                        remarks: visit.remarks || 'No remarks provided.',
                        isTeam: false,
                        latitude: visit.latitude,
                        longitude: visit.longitude
                    });
                });
            }
        });

        setFlattenedData(flatList);
    };

    const exportAllToExcel = () => {
        if (flattenedData.length === 0) {
            alert("No data available to export.");
            return;
        }

        const excelData = flattenedData.map(row => ({
            'S.No': row.sno,
            'Date': row.date,
            'Bid Number': row.bidNumber,
            'Zone': row.zone,
            'Location': row.location,
            'State': row.state,
            'Visited Person': row.visitedPerson,
            'Position': row.position,
            'FLSP': row.flsp,
            'Remarks': row.remarks
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "PreBid_Summaries");
        XLSX.writeFile(wb, `PreBid_Summaries_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="tenders-page" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ color: '#084f9a', margin: 0 }}>Pre-Bid Meeting Summaries</h1>

                <button
                    className="search-btn"
                    onClick={exportAllToExcel}
                    disabled={loading || flattenedData.length === 0}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: '#28a745', border: 'none', padding: '10px 20px',
                        color: 'white', borderRadius: '8px', cursor: 'pointer',
                        opacity: (loading || flattenedData.length === 0) ? 0.6 : 1
                    }}
                >
                    <Download size={18} />
                    Export All to Excel
                </button>
            </div>

            {loading ? (
                <div className="loading-state">Loading summaries...</div>
            ) : error ? (
                <div className="error-message">{error}</div>
            ) : flattenedData.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666', background: '#f8f9fa', borderRadius: '8px' }}>
                    No pre-bid meetings have been scheduled or recorded yet.
                </div>
            ) : (
                <div className="table-wrapper">
                    <table className="tenders-table" style={{ fontSize: '0.9rem' }}>
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Date</th>
                                <th>Bid Number</th>
                                <th>Zone</th>
                                <th>State</th>
                                <th>Location</th>
                                <th>Visited Person</th>
                                <th>Position</th>
                                <th>FLSP</th>
                                <th style={{ textAlign: 'center' }}>Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {flattenedData.map((row) => (
                                <tr key={row.sno} style={{ background: row.isTeam ? '#f8f9fa' : 'white' }}>
                                    <td>{row.sno}</td>
                                    <td>{row.date}</td>
                                    <td style={{ fontWeight: '500', color: '#084f9a' }}>
                                        <div
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => navigate(`/tender/${encodeURIComponent(row.bidNumber.replace(/\\/ / g, '_'))}`)}
                                            title="View Tender Details"
                                        >
                                            {row.bidNumber}
                                        </div>
                                    </td>
                                    <td>{row.zone}</td>
                                    <td>{row.state}</td>
                                    <td>
                                        {row.location}
                                        {row.latitude && row.longitude && (
                                            <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ marginLeft: '6px', color: '#ea4335', display: 'inline-flex', alignItems: 'center' }}
                                                title="View GPS Location on Google Maps"
                                            >
                                                <MapPin size={14} />
                                            </a>
                                        )}
                                    </td>
                                    <td>{row.visitedPerson}</td>
                                    <td>{row.position}</td>
                                    <td>{row.flsp}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button
                                            title="View Remarks"
                                            style={{
                                                background: '#eef2fc', border: '1px solid #c2d5f8',
                                                color: '#084f9a', padding: '4px 12px',
                                                borderRadius: '4px', cursor: 'pointer',
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                fontSize: '0.85rem', fontWeight: '500'
                                            }}
                                            onClick={() => setSelectedRemark({ title: `Remarks - ${row.visitedPerson}`, text: row.remarks })}
                                        >
                                            <Eye size={14} /> View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Remarks Modal Overlay */}
            {selectedRemark && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
                    <div style={{ background: 'white', padding: '25px', borderRadius: '12px', width: '500px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '1.25rem', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                            {selectedRemark.title}
                        </h3>
                        <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef', whiteSpace: 'pre-wrap', color: '#333', maxHeight: '50vh', overflowY: 'auto', lineHeight: '1.5' }}>
                            {selectedRemark.text}
                        </div>
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setSelectedRemark(null)}
                                style={{ padding: '8px 20px', background: '#084f9a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PreBidSummaries;

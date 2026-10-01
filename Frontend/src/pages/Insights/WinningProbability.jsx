import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const WinningProbability = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedRAStatus, setSelectedRAStatus] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [selectedState, setSelectedState] = useState('all');
  const [stateOptions, setStateOptions] = useState([]);
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [bidsData, setBidsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State options — same list /Admin/tenders uses, merged across GeM + Open
  // since this page shows both sources together.
  useEffect(() => {
    const fetchStates = async () => {
      try {
        const token = localStorage.getItem('token');
        const [gemRes, openRes] = await Promise.all([
          fetch(`${API_BASE}/tenders/states?tenderType=GEM`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/tenders/states?tenderType=Open`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const [gemJson, openJson] = await Promise.all([gemRes.json(), openRes.json()]);
        const merged = new Set([...(gemJson.data || []), ...(openJson.data || [])]);
        setStateOptions([...merged].sort());
      } catch (err) {
        console.error('Failed to fetch states:', err);
      }
    };
    fetchStates();
  }, []);

  // Fetch data from backend
  useEffect(() => {
    fetchBidsData();
  }, [searchTerm, selectedStatus, selectedRAStatus, selectedDepartment, selectedSource, selectedState, startDateFilter, endDateFilter]);

  const fetchBidsData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      // Build query parameters
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedStatus && selectedStatus !== 'all') params.append('bid_status', selectedStatus);
      if (selectedRAStatus && selectedRAStatus !== 'all') params.append('bid_ra_status', selectedRAStatus);
      if (selectedDepartment && selectedDepartment !== 'all') params.append('department', selectedDepartment);
      if (selectedSource && selectedSource !== 'all') params.append('source', selectedSource);
      if (selectedState && selectedState !== 'all') params.append('state', selectedState);
      if (startDateFilter) params.append('start_date', startDateFilter);
      if (endDateFilter) params.append('end_date', endDateFilter);

      const url = `${API_BASE}/gem-bids${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const result = await response.json();

      if (result.success) {
        setBidsData(result.data);
      } else {
        setError(result.message || 'Failed to fetch data');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching gem bids:', err);
    } finally {
      setLoading(false);
    }
  };


  // Backend handles all filtering, use bidsData directly
  const filteredData = bidsData;

  const parseDate = (dateStr) => {
    // Parse date format: '15-12-2025 4:06 PM'
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('-');
    const day = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1;
    const year = parseInt(dateParts[2]);
    return new Date(year, month, day);
  };



  const [savingNoteId, setSavingNoteId] = useState(null);

  const saveNote = async (bid, patch) => {
    const bidNo = bid.bid_no;
    setSavingNoteId(bid.id);
    // Optimistic update so typing feels immediate.
    setBidsData(rows => rows.map(r => r.id === bid.id ? { ...r, ...patch } : r));
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/gem-bids/${encodeURIComponent(bidNo)}/notes`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ra_date: patch.ra_date !== undefined ? patch.ra_date : bid.ra_date,
          remarks: patch.user_remarks !== undefined ? patch.user_remarks : bid.user_remarks,
        }),
      });
    } catch (e) {
      console.error('Failed to save note:', e);
    } finally {
      setSavingNoteId(null);
    }
  };

  const formatDateCell = (value) => {
    if (!value) return '-';
    // start_date/end_date/opening_date come back in different shapes
    // depending on source (varchar 'DD-Mon-YYYY...' for Open, ISO for GeM).
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleDateString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Awarded': return '#22c55e';
      case 'Evaluation': return '#f59e0b';
      case 'Not Evaluated': return '#6b7280';
      case 'Rejected': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#084f9a', marginBottom: '0.5rem' }}>
          Participated Tenders
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
          Track and analyze all tenders you've participated in with real-time status, insights, and performance metrics.
        </p>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <input
          type="text"
          placeholder="Search by bid number or RA number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '0.95rem',
            outline: 'none',
            transition: 'border-color 0.2s'
          }}
          onFocus={(e) => e.target.style.borderColor = '#084f9a'}
          onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
        alignItems: 'end'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Bid Status</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9rem',
              backgroundColor: 'white',
              cursor: 'pointer',
              outline: 'none',
              height: '44px'
            }}
          >
            <option value="all">All Bid Status</option>
            <option value="Not Evaluated">Not Evaluated</option>
            <option value="Evaluation">Evaluation</option>
            <option value="Awarded">Awarded</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>RA Status</label>
          <select
            value={selectedRAStatus}
            onChange={(e) => setSelectedRAStatus(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9rem',
              backgroundColor: 'white',
              cursor: 'pointer',
              outline: 'none',
              height: '44px'
            }}
          >
            <option value="all">All RA Status</option>
            <option value="Active">Active</option>
            <option value="Closed">Closed</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>State</label>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9rem',
              backgroundColor: 'white',
              cursor: 'pointer',
              outline: 'none',
              height: '44px'
            }}
          >
            <option value="all">All States</option>
            {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Department</label>
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9rem',
              backgroundColor: 'white',
              cursor: 'pointer',
              outline: 'none',
              height: '44px'
            }}
          >
            <option value="all">All Departments</option>
            <option value="diagno">Diagno</option>
            <option value="endo">Endo</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Source</label>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9rem',
              backgroundColor: 'white',
              cursor: 'pointer',
              outline: 'none',
              height: '44px'
            }}
          >
            <option value="all">All Sources</option>
            <option value="gem">GeM</option>
            <option value="open">Open</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Start Date From</label>
          <input
            type="date"
            value={startDateFilter}
            onChange={(e) => setStartDateFilter(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9rem',
              backgroundColor: 'white',
              cursor: 'pointer',
              outline: 'none',
              height: '44px'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>End Date Until</label>
          <input
            type="date"
            value={endDateFilter}
            onChange={(e) => setEndDateFilter(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9rem',
              backgroundColor: 'white',
              cursor: 'pointer',
              outline: 'none',
              height: '44px'
            }}
          />
        </div>

        <button
          onClick={() => {
            setSearchTerm('');
            setSelectedStatus('all');
            setSelectedRAStatus('all');
            setSelectedDepartment('all');
            setSelectedSource('all');
            setSelectedState('all');
            setStartDateFilter('');
            setEndDateFilter('');
          }}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#084f9a',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            cursor: 'pointer',
            fontWeight: '500',
            transition: 'background-color 0.2s',
            height: '44px',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#063d7a'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#084f9a'}
        >
          Reset Filters
        </button>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#084f9a' }}>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>S.No</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>Bid No</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>State</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>RA Date</th>
                <th style={{ padding: '1rem', textAlign: 'center', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>QTY</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>Opening Date</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>Status</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((bid, index) => (
                <tr
                  key={bid.id}
                  style={{
                    backgroundColor: index % 2 === 0 ? '#f8fafc' : 'white',
                    borderBottom: '1px solid #e2e8f0',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8fafc' : 'white'}
                >
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569' }}>{index + 1}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#084f9a', fontWeight: '500' }}>{bid.bid_no}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569' }}>{bid.state || '-'}</td>
                  <td style={{ padding: '0.5rem 1rem' }}>
                    <input
                      type="date"
                      defaultValue={bid.ra_date ? String(bid.ra_date).slice(0, 10) : ''}
                      onBlur={(e) => {
                        const v = e.target.value || null;
                        if (v !== (bid.ra_date ? String(bid.ra_date).slice(0, 10) : null)) saveNote(bid, { ra_date: v });
                      }}
                      disabled={savingNoteId === bid.id}
                      style={{ padding: '0.4rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', width: '135px' }}
                    />
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569', textAlign: 'center', fontWeight: '500' }}>{bid.quantity ?? '-'}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569' }}>{formatDateCell(bid.opening_date)}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      backgroundColor: `${getStatusColor(bid.bid_status)}20`,
                      color: getStatusColor(bid.bid_status),
                      whiteSpace: 'nowrap'
                    }}>
                      {bid.bid_status}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 1rem' }}>
                    <input
                      type="text"
                      defaultValue={bid.user_remarks || ''}
                      placeholder="Add a remark…"
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== (bid.user_remarks || '')) saveNote(bid, { user_remarks: v });
                      }}
                      disabled={savingNoteId === bid.id}
                      style={{ padding: '0.4rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', width: '200px', boxSizing: 'border-box' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredData.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            <p style={{ fontSize: '1rem' }}>No bids found matching your filters</p>
          </div>
        )}
      </div>

      {loading && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#084f9a' }}>
          <p style={{ fontSize: '1rem', fontWeight: '500' }}>Loading bids data...</p>
        </div>
      )}

      {error && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#ef4444' }}>
          <p style={{ fontSize: '1rem', fontWeight: '500' }}>Error: {error}</p>
          <button
            onClick={fetchBidsData}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.5rem',
              backgroundColor: '#084f9a',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <p style={{ color: '#64748b', fontSize: '0.875rem', textAlign: 'center' }}>
            Showing {filteredData.length} of {bidsData.length} bids
          </p>
        </div>
      )}
    </div>
  );
};

export default WinningProbability;
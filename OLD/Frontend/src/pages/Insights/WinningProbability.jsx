import React, { useState, useEffect } from 'react';

const WinningProbability = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedRAStatus, setSelectedRAStatus] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [bidsData, setBidsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch data from backend
  useEffect(() => {
    fetchBidsData();
  }, [searchTerm, selectedStatus, selectedRAStatus, selectedDepartment, startDateFilter, endDateFilter]);

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
      if (startDateFilter) params.append('start_date', startDateFilter);
      if (endDateFilter) params.append('end_date', endDateFilter);

      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
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
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>Bid Number</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>RA Number</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>Status</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>RA Status</th>
                <th style={{ padding: '1rem', textAlign: 'center', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>Quantity</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>Start Date</th>
                <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>End Date</th>
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
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#084f9a', fontWeight: '500' }}>{bid.bid_no}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569' }}>{bid.ra_no}</td>
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
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      backgroundColor: bid.bid_ra_status === 'Active' ? '#22c55e20' : '#6b728020',
                      color: bid.bid_ra_status === 'Active' ? '#22c55e' : '#6b7280',
                      whiteSpace: 'nowrap'
                    }}>
                      {bid.bid_ra_status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569', textAlign: 'center', fontWeight: '500' }}>{bid.quantity}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569' }}>{bid.start_date}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569' }}>{bid.end_date}</td>
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
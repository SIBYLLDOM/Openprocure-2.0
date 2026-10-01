import React, { useState, useEffect } from 'react';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import '../../assets/css/Incident.css';

const IncidentDashboard = () => {
  const [incidents, setIncidents] = useState([]);
  const [statusStats, setStatusStats] = useState([]);
  const [severityStats, setSeverityStats] = useState([]);
  const [dateStats, setDateStats] = useState([]); // New state for Line Chart
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [division, setDivision] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalIncidents, setTotalIncidents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const itemsPerPage = 10;

  useEffect(() => {
    fetchIncidents();
  }, [currentPage, severityFilter, statusFilter, searchTerm, division]);

  // Separate effect for stats to load them initially or when filters change (optional)
  // For now, let's load stats based on the current full dataset or a separate stats endpoint if we had one.
  // Since we are paginating, we can't calculate full stats from 'incidents' array alone.
  // We might want to fetch all stats or just show stats for current page.
  // Let's stick to current page stats or implement a separate stats API call later.
  // For now, I'll calculate stats from the current page data to avoid errors,
  // OR ideally, we should have an API endpoint for stats.
  // Let's keep it simple and calculate based on fetched page, acknowledging it's partial data.
  useEffect(() => {
    if (incidents.length > 0) {
      calculateStats(incidents);
    }
  }, [incidents]);

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');

      const params = new URLSearchParams({
        page: currentPage,
        limit: itemsPerPage,
        search: searchTerm,
        severity: severityFilter,
        status: statusFilter,
        division: division,
        sortBy: 'incident_date',
        sortOrder: 'desc'
      });

      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/incidents?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (data.success) {
        // Map database fields to component expectation (Capitalized keys)
        const mappedData = data.data.map(item => ({
          ...item,
          Incident_ID: item.incident_id,
          Severity: item.severity,
          Status: item.status,
          Reason: item.reason,
          Product_Category: item.product_category,
          Organisation_Name: item.organisation_name,
          Incident_Date: item.incident_date,
          Last_Modified_Date: item.last_modified_date
        }));

        setIncidents(mappedData);
        setTotalPages(data.totalPages);
        setTotalIncidents(data.total);
      } else {
        setError(data.message || 'Failed to fetch incidents');
      }
    } catch (err) {
      console.error('Error fetching incidents:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data) => {
    // Status Stats
    const statusCount = {};
    data.forEach(incident => {
      const status = incident.Status || 'Unknown';
      statusCount[status] = (statusCount[status] || 0) + 1;
    });
    const statsArray = Object.keys(statusCount).map(status => ({
      status: status,
      count: statusCount[status]
    }));
    setStatusStats(statsArray);

    // Severity Stats for Pie Chart
    const severityCount = {};
    data.forEach(incident => {
      const sev = incident.Severity || 'Unknown';
      severityCount[sev] = (severityCount[sev] || 0) + 1;
    });
    const sevArray = Object.keys(severityCount).map(sev => ({
      name: sev,
      value: severityCount[sev]
    }));
    setSeverityStats(sevArray);

    // Date Stats for Line Chart
    const dateCount = {};
    data.forEach(incident => {
      // Date (assuming format DD/MM/YYYY or similar string)
      const date = incident.Incident_Date || 'Unknown';
      dateCount[date] = (dateCount[date] || 0) + 1;
    });

    const dateArray = Object.keys(dateCount).map(date => ({
      date: date,
      count: dateCount[date]
    })).sort((a, b) => {
      // Simple parser for DD/MM/YYYY
      if (a.date === 'Unknown') return -1;
      if (b.date === 'Unknown') return 1;
      const partsA = a.date.split('/');
      const partsB = b.date.split('/');
      if (partsA.length === 3 && partsB.length === 3) {
        const dateA = new Date(partsA[2], partsA[1] - 1, partsA[0]);
        const dateB = new Date(partsB[2], partsB[1] - 1, partsB[0]);
        return dateA - dateB;
      }
      return a.date.localeCompare(b.date);
    });
    setDateStats(dateArray);
  };

  const getSeverityClass = (severity) => {
    const s = severity?.toLowerCase();
    if (s === 'grave' || s === 'critical') return 'severity-critical';
    if (s === 'serious' || s === 'high') return 'severity-high';
    if (s === 'medium') return 'severity-medium';
    return 'severity-low';
  };

  const getStatusClass = (status) => {
    const s = status?.toLowerCase();
    if (s?.includes('rejected')) return 'status-rejected';
    if (s?.includes('closed') || s?.includes('resolved')) return 'status-closed';
    if (s?.includes('progress') || s?.includes('working')) return 'status-progress';
    return 'status-pending'; // Default for open/pending
  };

  const uniqueSeverities = ['All', 'Critical', 'High', 'Medium', 'Low'];
  const uniqueStatuses = ['All', 'Pending', 'In Progress', 'Closed', 'Resolved', 'Open'];

  // Colors for Pie Chart
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  // Note: These counts will only reflect the current page due to server-side pagination.
  // To get accurate total counts, we would need a dedicated stats endpoint.
  const respondedIncidents = incidents.filter(i => i.Status && !i.Status.toLowerCase().includes('open')).length;
  const notRespondedIncidents = incidents.filter(i => i.Status && i.Status.toLowerCase().includes('open')).length;

  return (
    <div className="incident-dashboard">
      <div className="dashboard-container">
        <div className="stats-grid">
          <div className="stat-card stat-card-primary">
            <div className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="stat-content">
              <p className="stat-label">Total Incidents</p>
              <h3 className="stat-value">{totalIncidents}</h3>
            </div>
          </div>

          <div className="stat-card stat-card-success">
            <div className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="stat-content">
              <p className="stat-label">Responded (Page)</p>
              <h3 className="stat-value">{respondedIncidents}</h3>
            </div>
          </div>

          <div className="stat-card stat-card-warning">
            <div className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="stat-content">
              <p className="stat-label">Not Responded (Page)</p>
              <h3 className="stat-value">{notRespondedIncidents}</h3>
            </div>
          </div>

          <div className="stat-card stat-card-info">
            <div className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <div className="stat-content">
              <p className="stat-label">Filtered Results</p>
              <h3 className="stat-value">{totalIncidents}</h3>
            </div>
          </div>
        </div>

        {/* GRAPHS ROW 1: Bar Chart + Pie Chart */}
        <div className="graphs-row">
          <div className="chart-section">
            <h2 className="section-title">Incident Status Distribution</h2>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={statusStats}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                  <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-section">
            <h2 className="section-title">Severity Breakdown</h2>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={severityStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {severityStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* GRAPHS ROW 2: Line Chart (Full Width) */}
        <div className="chart-section" style={{ marginBottom: '2rem' }}>
          <h2 className="section-title">Incident Trends Over Time</h2>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dateStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} name="Incidents" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="filters-section">
          <div className="filters-wrapper">
            <div className="search-wrapper">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search incidents by ID, reason, organisation..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="search-input"
              />
            </div>

            <div className="division-toggle">
              <button
                className={`toggle-btn ${division === 'Diagno' ? 'active' : ''}`}
                onClick={() => { setDivision('Diagno'); setCurrentPage(1); }}
              >
                Diagno
              </button>
              <button
                className={`toggle-btn ${division === 'Endo' ? 'active' : ''}`}
                onClick={() => { setDivision('Endo'); setCurrentPage(1); }}
              >
                Endo
              </button>
            </div>
          </div>

          <div className="filter-controls">
            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="All">All Severities</option>
              {uniqueSeverities.filter(s => s !== 'All').map(severity => (
                <option key={severity} value={severity}>{severity}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="All">All Statuses</option>
              {uniqueStatuses.filter(s => s !== 'All').map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>

            <button
              onClick={() => {
                setSearchTerm('');
                setSeverityFilter('All');
                setStatusFilter('All');
                setCurrentPage(1);
              }}
              className="btn-reset"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="table-section">
        <div className="table-header">
          <h2 className="section-title">Incidents List</h2>
          <div className="table-info">
            {loading ? 'Loading...' : `Showing ${(currentPage - 1) * itemsPerPage + 1} - ${Math.min(currentPage * itemsPerPage, totalIncidents)} of ${totalIncidents} incidents`}
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>Loading incidents...</div>
          ) : error ? (
            <div style={{ padding: '20px', color: 'red', textAlign: 'center' }}>{error}</div>
          ) : (
            <table className="incidents-table">
              <thead>
                <tr>
                  <th>Incident ID</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Product Category</th>
                  <th>Organisation</th>
                  <th>Incident Date</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length > 0 ? (
                  incidents.map((incident, index) => (
                    <tr key={index}>
                      <td className="incident-id" data-label="Incident ID">#{incident.Incident_ID}</td>
                      <td data-label="Severity">
                        <span className={`severity-badge ${getSeverityClass(incident.Severity)}`}>
                          {incident.Severity || 'N/A'}
                        </span>
                      </td>
                      <td data-label="Status">
                        <span className={`status-badge ${getStatusClass(incident.Status)}`}>
                          {incident.Status || 'N/A'}
                        </span>
                      </td>
                      <td className="reason-cell" data-label="Reason" title={incident.Reason}>{incident.Reason || 'N/A'}</td>
                      <td data-label="Product Category">{incident.Product_Category || 'N/A'}</td>
                      <td data-label="Organisation">{incident.Organisation_Name || 'N/A'}</td>
                      <td data-label="Incident Date">{incident.Incident_Date || 'N/A'}</td>
                      <td data-label="Last Modified">{incident.Last_Modified_Date || 'N/A'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>No incidents found</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {!loading && totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              Previous
            </button>

            <div className="pagination-numbers">
              {[...Array(totalPages)].map((_, index) => {
                // Logic to show limited page numbers if needed, but for now showing all
                // if totalPages is huge, we might need a better pagination UI component
                if (totalPages > 10 && Math.abs(currentPage - (index + 1)) > 3 && index + 1 !== 1 && index + 1 !== totalPages) {
                  if (index + 1 === currentPage - 4 || index + 1 === currentPage + 4) return <span key={index}>...</span>;
                  return null;
                }

                return (
                  <button
                    key={index + 1}
                    onClick={() => paginate(index + 1)}
                    className={`pagination-number ${currentPage === index + 1 ? 'active' : ''}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default IncidentDashboard;
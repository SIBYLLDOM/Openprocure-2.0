// src/pages/Dealers/Distributors.jsx
// Route: /dealers/distributors

import { useState, useMemo } from 'react';
import '../../assets/css/Distributors.css';
const Distributors = () => {
  // Dummy data - at least 12 rows
  const [allDistributors] = useState([
    { id: 1, companyName: 'MedSupply India Pvt Ltd', personName: 'Rajesh Kumar', contactNo: '+91-9876543210', email: 'rajesh@medsupply.in', cityName: 'Mumbai', state: 'Maharashtra', registrationDate: '2023-01-15', status: 'Active' },
    { id: 2, companyName: 'HealthCare Distributors', personName: 'Priya Sharma', contactNo: '+91-9876543211', email: 'priya@healthcare.in', cityName: 'Delhi', state: 'Delhi', registrationDate: '2023-02-20', status: 'Active' },
    { id: 3, companyName: 'Global Medical Solutions', personName: 'Amit Patel', contactNo: '+91-9876543212', email: 'amit@globalmeds.in', cityName: 'Ahmedabad', state: 'Gujarat', registrationDate: '2023-03-10', status: 'Inactive' },
    { id: 4, companyName: 'Sunrise Pharma Traders', personName: 'Sunita Reddy', contactNo: '+91-9876543213', email: 'sunita@sunrise.in', cityName: 'Hyderabad', state: 'Telangana', registrationDate: '2023-04-05', status: 'Active' },
    { id: 5, companyName: 'Metro Medical Supplies', personName: 'Vikram Singh', contactNo: '+91-9876543214', email: 'vikram@metro.in', cityName: 'Bangalore', state: 'Karnataka', registrationDate: '2023-05-18', status: 'Active' },
    { id: 6, companyName: 'Eastern Healthcare Ltd', personName: 'Ananya Das', contactNo: '+91-9876543215', email: 'ananya@eastern.in', cityName: 'Kolkata', state: 'West Bengal', registrationDate: '2023-06-22', status: 'Active' },
    { id: 7, companyName: 'Southern Medical Corp', personName: 'Karthik Iyer', contactNo: '+91-9876543216', email: 'karthik@southern.in', cityName: 'Chennai', state: 'Tamil Nadu', registrationDate: '2023-07-11', status: 'Active' },
    { id: 8, companyName: 'Northern Distributors', personName: 'Manpreet Kaur', contactNo: '+91-9876543217', email: 'manpreet@northern.in', cityName: 'Chandigarh', state: 'Punjab', registrationDate: '2023-08-30', status: 'Inactive' },
    { id: 9, companyName: 'Coastal Medical Trading', personName: 'Arjun Nair', contactNo: '+91-9876543218', email: 'arjun@coastal.in', cityName: 'Kochi', state: 'Kerala', registrationDate: '2023-09-14', status: 'Active' },
    { id: 10, companyName: 'Central Healthcare Hub', personName: 'Neha Gupta', contactNo: '+91-9876543219', email: 'neha@central.in', cityName: 'Indore', state: 'Madhya Pradesh', registrationDate: '2023-10-07', status: 'Active' },
    { id: 11, companyName: 'Western Medical Enterprises', personName: 'Rohan Desai', contactNo: '+91-9876543220', email: 'rohan@western.in', cityName: 'Pune', state: 'Maharashtra', registrationDate: '2023-11-19', status: 'Active' },
    { id: 12, companyName: 'Prime Healthcare Solutions', personName: 'Kavita Joshi', contactNo: '+91-9876543221', email: 'kavita@prime.in', cityName: 'Jaipur', state: 'Rajasthan', registrationDate: '2023-12-03', status: 'Active' },
  ]);

  const [quickSearch, setQuickSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortOrder, setSortOrder] = useState('asc');

  // Advanced filters
  const [filters, setFilters] = useState({
    companyName: '',
    personName: '',
    contactNo: '',
    email: '',
    cityName: '',
    state: '',
    regDateFrom: '',
    regDateTo: '',
    status: ''
  });

  const [appliedFilters, setAppliedFilters] = useState(filters);

  // Filter and search logic
  const filteredData = useMemo(() => {
    let data = [...allDistributors];

    // Apply quick search (live)
    if (quickSearch.trim()) {
      const search = quickSearch.toLowerCase();
      data = data.filter(d =>
        d.companyName.toLowerCase().includes(search) ||
        d.personName.toLowerCase().includes(search) ||
        d.contactNo.toLowerCase().includes(search) ||
        d.email.toLowerCase().includes(search) ||
        d.cityName.toLowerCase().includes(search)
      );
    }

    // Apply advanced filters
    if (appliedFilters.companyName) {
      data = data.filter(d => d.companyName.toLowerCase().includes(appliedFilters.companyName.toLowerCase()));
    }
    if (appliedFilters.personName) {
      data = data.filter(d => d.personName.toLowerCase().includes(appliedFilters.personName.toLowerCase()));
    }
    if (appliedFilters.contactNo) {
      data = data.filter(d => d.contactNo.includes(appliedFilters.contactNo));
    }
    if (appliedFilters.email) {
      data = data.filter(d => d.email.toLowerCase().includes(appliedFilters.email.toLowerCase()));
    }
    if (appliedFilters.cityName) {
      data = data.filter(d => d.cityName.toLowerCase().includes(appliedFilters.cityName.toLowerCase()));
    }
    if (appliedFilters.state) {
      data = data.filter(d => d.state === appliedFilters.state);
    }
    if (appliedFilters.status) {
      data = data.filter(d => d.status === appliedFilters.status);
    }
    if (appliedFilters.regDateFrom) {
      data = data.filter(d => d.registrationDate >= appliedFilters.regDateFrom);
    }
    if (appliedFilters.regDateTo) {
      data = data.filter(d => d.registrationDate <= appliedFilters.regDateTo);
    }

    // Sort by company name
    data.sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.companyName.localeCompare(b.companyName);
      } else {
        return b.companyName.localeCompare(a.companyName);
      }
    });

    return data;
  }, [allDistributors, quickSearch, appliedFilters, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    const emptyFilters = {
      companyName: '',
      personName: '',
      contactNo: '',
      email: '',
      cityName: '',
      state: '',
      regDateFrom: '',
      regDateTo: '',
      status: ''
    };
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setCurrentPage(1);
  };

  const handleExport = () => {
    console.log('Exporting to Excel:', filteredData);
    // Mock CSV generation
    const csv = [
      ['#', 'Company Name', 'Person Name', 'Contact No', 'Email', 'City', 'State', 'Registration Date', 'Status'],
      ...filteredData.map((d, i) => [
        i + 1,
        d.companyName,
        d.personName,
        d.contactNo,
        d.email,
        d.cityName,
        d.state,
        d.registrationDate,
        d.status
      ])
    ].map(row => row.join(',')).join('\n');
    console.log('CSV Data:\n', csv);
  };

  return (
    <div className="distributors-page">
      <div className="page-header">
        <h1>Dealers / Distributors</h1>
        <p>Manage and view all registered distributors and their contact information</p>
      </div>

      <div className="content-card">
        {/* Quick Search */}
        <div className="quick-search-bar">
          <label htmlFor="quick-search" className="visually-hidden">Quick search</label>
          <input
            id="quick-search"
            type="text"
            placeholder="Search distributors..."
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            className="search-input"
          />
          <button
            className="toggle-filters-btn"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
          >
            {showFilters ? '▲ Hide Filters' : '▼ Advanced Filters'}
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="filters-panel">
            <div className="filters-grid">
              <div className="filter-field">
                <label htmlFor="filter-company">Company Name</label>
                <input
                  id="filter-company"
                  type="text"
                  value={filters.companyName}
                  onChange={(e) => setFilters({ ...filters, companyName: e.target.value })}
                />
              </div>
              <div className="filter-field">
                <label htmlFor="filter-person">Person Name</label>
                <input
                  id="filter-person"
                  type="text"
                  value={filters.personName}
                  onChange={(e) => setFilters({ ...filters, personName: e.target.value })}
                />
              </div>
              <div className="filter-field">
                <label htmlFor="filter-contact">Contact No</label>
                <input
                  id="filter-contact"
                  type="text"
                  value={filters.contactNo}
                  onChange={(e) => setFilters({ ...filters, contactNo: e.target.value })}
                />
              </div>
              <div className="filter-field">
                <label htmlFor="filter-email">Email Id</label>
                <input
                  id="filter-email"
                  type="text"
                  value={filters.email}
                  onChange={(e) => setFilters({ ...filters, email: e.target.value })}
                />
              </div>
              <div className="filter-field">
                <label htmlFor="filter-city">City Name</label>
                <input
                  id="filter-city"
                  type="text"
                  value={filters.cityName}
                  onChange={(e) => setFilters({ ...filters, cityName: e.target.value })}
                />
              </div>
              <div className="filter-field">
                <label htmlFor="filter-state">State</label>
                <select
                  id="filter-state"
                  value={filters.state}
                  onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                >
                  <option value="">All States</option>
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Delhi">Delhi</option>
                  <option value="Gujarat">Gujarat</option>
                  <option value="Karnataka">Karnataka</option>
                  <option value="Tamil Nadu">Tamil Nadu</option>
                  <option value="West Bengal">West Bengal</option>
                  <option value="Telangana">Telangana</option>
                  <option value="Kerala">Kerala</option>
                  <option value="Punjab">Punjab</option>
                  <option value="Rajasthan">Rajasthan</option>
                  <option value="Madhya Pradesh">Madhya Pradesh</option>
                </select>
              </div>
              <div className="filter-field">
                <label htmlFor="filter-date-from">Registration From</label>
                <input
                  id="filter-date-from"
                  type="date"
                  value={filters.regDateFrom}
                  onChange={(e) => setFilters({ ...filters, regDateFrom: e.target.value })}
                />
              </div>
              <div className="filter-field">
                <label htmlFor="filter-date-to">Registration To</label>
                <input
                  id="filter-date-to"
                  type="date"
                  value={filters.regDateTo}
                  onChange={(e) => setFilters({ ...filters, regDateTo: e.target.value })}
                />
              </div>
              <div className="filter-field">
                <label htmlFor="filter-status">Status</label>
                <select
                  id="filter-status"
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                  <option value="">All</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="filters-actions">
              <button className="btn-primary" onClick={handleApplyFilters}>Search</button>
              <button className="btn-secondary" onClick={handleResetFilters}>Reset</button>
            </div>
          </div>
        )}

        {/* Table Controls */}
        <div className="table-controls">
          <div className="left-controls">
            <label htmlFor="rows-per-page" className="visually-hidden">Rows per page</label>
            <select
              id="rows-per-page"
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rows-select"
            >
              <option value={10}>Show 10</option>
              <option value={25}>Show 25</option>
              <option value={50}>Show 50</option>
            </select>
            <label htmlFor="sort-order" className="visually-hidden">Sort order</label>
            <select
              id="sort-order"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="sort-select"
            >
              <option value="asc">Name A-Z</option>
              <option value="desc">Name Z-A</option>
            </select>
          </div>
          <button className="btn-export" onClick={handleExport}>
            📊 Export to Excel
          </button>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="data-table" aria-label="Dealers table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Company Name</th>
                <th scope="col">Person Name</th>
                <th scope="col">Contact No.</th>
                <th scope="col">Email Id</th>
                <th scope="col">City Name</th>
                <th scope="col" className="action-col">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length > 0 ? (
                paginatedData.map((distributor, index) => (
                  <tr key={distributor.id}>
                    <td>{(currentPage - 1) * rowsPerPage + index + 1}</td>
                    <td>{distributor.companyName}</td>
                    <td>{distributor.personName}</td>
                    <td>{distributor.contactNo}</td>
                    <td>{distributor.email}</td>
                    <td>{distributor.cityName}</td>
                    <td className="action-col">
                      <button
                        className="action-btn view"
                        onClick={() => console.log('View distributor:', distributor)}
                        aria-label={`View ${distributor.companyName}`}
                        title="View"
                      >
                        👁️
                      </button>
                      <button
                        className="action-btn edit"
                        onClick={() => console.log('Edit distributor:', distributor)}
                        aria-label={`Edit ${distributor.companyName}`}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => console.log('Delete distributor:', distributor)}
                        aria-label={`Delete ${distributor.companyName}`}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="no-data">No distributors found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="pagination">
          <div className="pagination-info">
            Page {currentPage} of {totalPages || 1} ({filteredData.length} results)
          </div>
          <div className="pagination-controls">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              ← Prev
            </button>
            {[...Array(totalPages)].map((_, i) => {
              const page = i + 1;
              if (
                page === 1 ||
                page === totalPages ||
                (page >= currentPage - 1 && page <= currentPage + 1)
              ) {
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={currentPage === page ? 'active' : ''}
                    aria-label={`Page ${page}`}
                    aria-current={currentPage === page ? 'page' : undefined}
                  >
                    {page}
                  </button>
                );
              } else if (page === currentPage - 2 || page === currentPage + 2) {
                return <span key={page}>...</span>;
              }
              return null;
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              aria-label="Next page"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Distributors;
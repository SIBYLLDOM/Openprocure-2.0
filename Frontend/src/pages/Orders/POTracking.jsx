// File: src/pages/Orders/POTracking.jsx
// Route: /orders/po-tracking

import React, { useState } from 'react';
import '../../assets/css/POTracking.css';

const POTracking = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    supplier: '',
  });

  const rowsPerPage = 10;

  // Dummy PO tracking data
  const [allPOs] = useState([
    {
      id: 1,
      poNo: 'PO-2024-001',
      tenderId: 'TND-001',
      supplier: 'Meril Life Sciences',
      poDate: '10-01-2024',
      expectedDelivery: '10-03-2024',
      receivedQty: 50,
      pendingQty: 0,
      status: 'Closed',
    },
    {
      id: 2,
      poNo: 'PO-2024-002',
      tenderId: 'TND-002',
      supplier: 'Apollo Medical Supplies',
      poDate: '15-01-2024',
      expectedDelivery: '15-03-2024',
      receivedQty: 60,
      pendingQty: 40,
      status: 'Partially Received',
    },
    {
      id: 3,
      poNo: 'PO-2024-003',
      tenderId: 'TND-003',
      supplier: 'Surgical Systems India',
      poDate: '20-01-2024',
      expectedDelivery: '20-04-2024',
      receivedQty: 0,
      pendingQty: 25,
      status: 'Open',
    },
    {
      id: 4,
      poNo: 'PO-2024-004',
      tenderId: 'TND-004',
      supplier: 'MedTech Solutions',
      poDate: '25-01-2024',
      expectedDelivery: '25-03-2024',
      receivedQty: 75,
      pendingQty: 0,
      status: 'Closed',
    },
    {
      id: 5,
      poNo: 'PO-2024-005',
      tenderId: 'TND-005',
      supplier: 'Meril Cardiovascular',
      poDate: '01-02-2024',
      expectedDelivery: '01-05-2024',
      receivedQty: 15,
      pendingQty: 15,
      status: 'Partially Received',
    },
    {
      id: 6,
      poNo: 'PO-2024-006',
      tenderId: 'TND-006',
      supplier: 'Healthcare Equipment Ltd',
      poDate: '05-02-2024',
      expectedDelivery: '05-04-2024',
      receivedQty: 0,
      pendingQty: 200,
      status: 'Open',
    },
    {
      id: 7,
      poNo: 'PO-2024-007',
      tenderId: 'TND-007',
      supplier: 'Meril Diagnostics',
      poDate: '10-02-2024',
      expectedDelivery: '10-04-2024',
      receivedQty: 500,
      pendingQty: 0,
      status: 'Closed',
    },
    {
      id: 8,
      poNo: 'PO-2024-008',
      tenderId: 'TND-008',
      supplier: 'Precision Medical Inc',
      poDate: '15-02-2024',
      expectedDelivery: '15-03-2024',
      receivedQty: 100,
      pendingQty: 50,
      status: 'Partially Received',
    },
    {
      id: 9,
      poNo: 'PO-2024-009',
      tenderId: 'TND-009',
      supplier: 'Meril Neuro',
      poDate: '20-02-2024',
      expectedDelivery: '20-06-2024',
      receivedQty: 0,
      pendingQty: 15,
      status: 'Open',
    },
    {
      id: 10,
      poNo: 'PO-2024-010',
      tenderId: 'TND-010',
      supplier: 'Advanced Surgical Systems',
      poDate: '25-02-2024',
      expectedDelivery: '25-04-2024',
      receivedQty: 40,
      pendingQty: 0,
      status: 'Closed',
    },
  ]);

  const [filteredPOs, setFilteredPOs] = useState(allPOs);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSearch = () => {
    let filtered = [...allPOs];

    if (filters.search) {
      filtered = filtered.filter(po =>
        po.poNo.toLowerCase().includes(filters.search.toLowerCase()) ||
        po.supplier.toLowerCase().includes(filters.search.toLowerCase()) ||
        po.tenderId.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    if (filters.status) {
      filtered = filtered.filter(po => po.status === filters.status);
    }

    if (filters.supplier) {
      filtered = filtered.filter(po =>
        po.supplier.toLowerCase().includes(filters.supplier.toLowerCase())
      );
    }

    setFilteredPOs(filtered);
    setCurrentPage(1);
    console.log('PO Search applied:', filters);
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      status: '',
      supplier: '',
    });
    setFilteredPOs(allPOs);
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(filteredPOs.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentPOs = filteredPOs.slice(startIndex, endIndex);

  const getStatusClass = (status) => {
    switch (status) {
      case 'Closed': return 'status-closed';
      case 'Partially Received': return 'status-partial';
      case 'Open': return 'status-open';
      default: return '';
    }
  };

  const handleView = (po) => {
    console.log('View PO:', po);
  };

  const handleDownload = (po) => {
    console.log('Download PO:', po);
  };

  return (
    <div className="po-tracking-page">
      <div className="page-header">
        <h1>PO Tracking</h1>
        <p className="page-description">Monitor purchase order status and deliveries</p>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 11H15M9 15H12M3 7H21M5 21H19C20.1046 21 21 20.1046 21 19V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V19C3 20.1046 3.89543 21 5 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="card-content">
            <div className="card-label">Total POs</div>
            <div className="card-value">{allPOs.length}</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="card-content">
            <div className="card-label">Closed</div>
            <div className="card-value">{allPOs.filter(po => po.status === 'Closed').length}</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon orange">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="card-content">
            <div className="card-label">Partially Received</div>
            <div className="card-value">{allPOs.filter(po => po.status === 'Partially Received').length}</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon red">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="card-content">
            <div className="card-label">Open</div>
            <div className="card-value">{allPOs.filter(po => po.status === 'Open').length}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-container">
        <div className="search-filter">
          <input
            type="text"
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            placeholder="Search by PO no, supplier, or tender ID..."
            aria-label="Search POs"
          />
        </div>

        <div className="quick-filters">
          <div className="filter-field">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">All Status</option>
              <option value="Open">Open</option>
              <option value="Partially Received">Partially Received</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="supplier">Supplier</label>
            <input
              type="text"
              id="supplier"
              name="supplier"
              value={filters.supplier}
              onChange={handleFilterChange}
              placeholder="Supplier name"
            />
          </div>

          <div className="filter-buttons">
            <button className="btn-search" onClick={handleSearch}>Search</button>
            <button className="btn-clear" onClick={handleClearFilters}>Clear</button>
          </div>
        </div>
      </div>

      {/* PO Table */}
      <div className="po-table-wrapper">
        <table className="po-table" aria-label="Purchase Orders Tracking Table">
          <thead>
            <tr>
              <th>PO No</th>
              <th>Tender ID</th>
              <th>Supplier</th>
              <th>PO Date</th>
              <th>Expected Delivery</th>
              <th>Received Qty</th>
              <th>Pending Qty</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPOs.map((po) => (
              <tr key={po.id}>
                <td className="po-number">{po.poNo}</td>
                <td>{po.tenderId}</td>
                <td>{po.supplier}</td>
                <td>{po.poDate}</td>
                <td>{po.expectedDelivery}</td>
                <td className="qty-received">{po.receivedQty}</td>
                <td className="qty-pending">{po.pendingQty}</td>
                <td>
                  <span className={`po-status-badge ${getStatusClass(po.status)}`}>
                    {po.status}
                  </span>
                </td>
                <td>
                  <div className="po-actions">
                    <button
                      className="action-icon-btn"
                      onClick={() => handleView(po)}
                      aria-label="View PO"
                      title="View"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 3C4.5 3 1.7 5.6 1 8c.7 2.4 3.5 5 7 5s6.3-2.6 7-5c-.7-2.4-3.5-5-7-5z" stroke="currentColor" strokeWidth="1.5"/>
                        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
                      </svg>
                    </button>
                    <button
                      className="action-icon-btn"
                      onClick={() => handleDownload(po)}
                      aria-label="Download PO"
                      title="Download"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 10V2M8 10L5 7M8 10l3-3M2 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="po-pagination">
        <div className="po-pagination-info">
          Showing {startIndex + 1} to {Math.min(endIndex, filteredPOs.length)} of {filteredPOs.length} entries
        </div>
        <div className="po-pagination-btns">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          {[...Array(totalPages)].map((_, i) => (
            <button
              key={i + 1}
              className={currentPage === i + 1 ? 'active' : ''}
              onClick={() => setCurrentPage(i + 1)}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default POTracking;
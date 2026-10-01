// File: src/pages/Orders/WorkOrders.jsx
// Route: /orders/work-orders

import React, { useState } from 'react';
import '../../assets/css/WorkOrders.css';

const WorkOrders = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    state: '',
    vendor: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });

  const rowsPerPage = 10;

  // Dummy work orders data
  const [allWorkOrders] = useState([
    {
      id: 1,
      workOrderNo: 'WO-2024-001',
      tenderId: 'TND-001',
      vendor: 'Meril Life Sciences',
      issueDate: '05-01-2024',
      deliveryDate: '05-03-2024',
      status: 'In Progress',
      value: 625000,
    },
    {
      id: 2,
      workOrderNo: 'WO-2024-002',
      tenderId: 'TND-002',
      vendor: 'Apollo Medical Supplies',
      issueDate: '10-01-2024',
      deliveryDate: '10-02-2024',
      status: 'Completed',
      value: 850000,
    },
    {
      id: 3,
      workOrderNo: 'WO-2024-003',
      tenderId: 'TND-003',
      vendor: 'Surgical Systems India',
      issueDate: '15-01-2024',
      deliveryDate: '15-04-2024',
      status: 'In Progress',
      value: 1125000,
    },
    {
      id: 4,
      workOrderNo: 'WO-2024-004',
      tenderId: 'TND-004',
      vendor: 'MedTech Solutions',
      issueDate: '20-01-2024',
      deliveryDate: '20-03-2024',
      status: 'Delayed',
      value: 487500,
    },
    {
      id: 5,
      workOrderNo: 'WO-2024-005',
      tenderId: 'TND-005',
      vendor: 'Meril Cardiovascular',
      issueDate: '25-01-2024',
      deliveryDate: '25-05-2024',
      status: 'In Progress',
      value: 2550000,
    },
    {
      id: 6,
      workOrderNo: 'WO-2024-006',
      tenderId: 'TND-006',
      vendor: 'Healthcare Equipment Ltd',
      issueDate: '01-02-2024',
      deliveryDate: '01-03-2024',
      status: 'Completed',
      value: 700000,
    },
    {
      id: 7,
      workOrderNo: 'WO-2024-007',
      tenderId: 'TND-007',
      vendor: 'Meril Diagnostics',
      issueDate: '05-02-2024',
      deliveryDate: '05-04-2024',
      status: 'In Progress',
      value: 225000,
    },
    {
      id: 8,
      workOrderNo: 'WO-2024-008',
      tenderId: 'TND-008',
      vendor: 'Precision Medical Inc',
      issueDate: '10-02-2024',
      deliveryDate: '10-03-2024',
      status: 'Pending',
      value: 375000,
    },
    {
      id: 9,
      workOrderNo: 'WO-2024-009',
      tenderId: 'TND-009',
      vendor: 'Meril Neuro',
      issueDate: '15-02-2024',
      deliveryDate: '15-06-2024',
      status: 'In Progress',
      value: 1875000,
    },
    {
      id: 10,
      workOrderNo: 'WO-2024-010',
      tenderId: 'TND-010',
      vendor: 'Advanced Surgical Systems',
      issueDate: '20-02-2024',
      deliveryDate: '20-04-2024',
      status: 'Completed',
      value: 1400000,
    },
  ]);

  const [filteredOrders, setFilteredOrders] = useState(allWorkOrders);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSearch = () => {
    let filtered = [...allWorkOrders];

    if (filters.search) {
      filtered = filtered.filter(order =>
        order.workOrderNo.toLowerCase().includes(filters.search.toLowerCase()) ||
        order.vendor.toLowerCase().includes(filters.search.toLowerCase()) ||
        order.tenderId.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    if (filters.vendor) {
      filtered = filtered.filter(order =>
        order.vendor.toLowerCase().includes(filters.vendor.toLowerCase())
      );
    }

    if (filters.status) {
      filtered = filtered.filter(order => order.status === filters.status);
    }

    setFilteredOrders(filtered);
    setCurrentPage(1);
    console.log('Search applied:', filters);
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      state: '',
      vendor: '',
      status: '',
      dateFrom: '',
      dateTo: '',
    });
    setFilteredOrders(allWorkOrders);
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentOrders = filteredOrders.slice(startIndex, endIndex);

  const getStatusClass = (status) => {
    switch (status) {
      case 'Completed': return 'status-completed';
      case 'In Progress': return 'status-progress';
      case 'Delayed': return 'status-delayed';
      case 'Pending': return 'status-pending';
      default: return '';
    }
  };

  const handleView = (order) => {
    console.log('View work order:', order);
  };

  const handleDownload = (order) => {
    console.log('Download work order:', order);
  };

  return (
    <div className="work-orders-page">
      <div className="page-header">
        <h1>Work Orders</h1>
        <p className="page-description">Track and manage all work orders issued for tenders</p>
      </div>

      {/* Filters Section */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            placeholder="Search by work order no, vendor, or tender ID..."
            aria-label="Search work orders"
          />
        </div>

        <div className="filters-row">
          <div className="filter-item">
            <label htmlFor="state">State</label>
            <select
              id="state"
              name="state"
              value={filters.state}
              onChange={handleFilterChange}
            >
              <option value="">All States</option>
              <option value="Delhi">Delhi</option>
              <option value="Maharashtra">Maharashtra</option>
              <option value="Tamil Nadu">Tamil Nadu</option>
              <option value="Karnataka">Karnataka</option>
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="vendor">Vendor</label>
            <input
              type="text"
              id="vendor"
              name="vendor"
              value={filters.vendor}
              onChange={handleFilterChange}
              placeholder="Enter vendor name"
            />
          </div>

          <div className="filter-item">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">All Status</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Delayed">Delayed</option>
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="dateFrom">Date From</label>
            <input
              type="date"
              id="dateFrom"
              name="dateFrom"
              value={filters.dateFrom}
              onChange={handleFilterChange}
            />
          </div>

          <div className="filter-item">
            <label htmlFor="dateTo">Date To</label>
            <input
              type="date"
              id="dateTo"
              name="dateTo"
              value={filters.dateTo}
              onChange={handleFilterChange}
            />
          </div>

          <div className="filter-actions">
            <button className="btn-primary" onClick={handleSearch}>Search</button>
            <button className="btn-secondary" onClick={handleClearFilters}>Clear</button>
          </div>
        </div>
      </div>

      {/* Work Orders Table */}
      <div className="table-container">
        <table className="work-orders-table" aria-label="Work Orders Table">
          <thead>
            <tr>
              <th>Work Order No</th>
              <th>Tender ID</th>
              <th>Vendor</th>
              <th>Issue Date</th>
              <th>Delivery Date</th>
              <th>Status</th>
              <th>Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentOrders.map((order) => (
              <tr key={order.id}>
                <td className="font-medium">{order.workOrderNo}</td>
                <td>{order.tenderId}</td>
                <td>{order.vendor}</td>
                <td>{order.issueDate}</td>
                <td>{order.deliveryDate}</td>
                <td>
                  <span className={`status-badge ${getStatusClass(order.status)}`}>
                    {order.status}
                  </span>
                </td>
                <td className="font-medium">₹{order.value.toLocaleString('en-IN')}</td>
                <td>
                  <div className="action-btns">
                    <button
                      className="icon-button"
                      onClick={() => handleView(order)}
                      aria-label="View work order"
                      title="View"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 3C4.5 3 1.7 5.6 1 8c.7 2.4 3.5 5 7 5s6.3-2.6 7-5c-.7-2.4-3.5-5-7-5z" stroke="currentColor" strokeWidth="1.5"/>
                        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
                      </svg>
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => handleDownload(order)}
                      aria-label="Download work order"
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
      <div className="pagination-wrapper">
        <div className="pagination-info">
          Showing {startIndex + 1} to {Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length} entries
        </div>
        <div className="pagination-controls">
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

export default WorkOrders;
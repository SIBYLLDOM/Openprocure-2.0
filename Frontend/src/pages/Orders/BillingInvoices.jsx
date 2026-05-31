// src/pages/Orders/BillingInvoices.jsx
// Route: /orders/billing-invoices

import React, { useState, useMemo } from 'react';
import '../../assets/css/BillingInvoices.css';

// Dummy invoice data
const INITIAL_INVOICES = [
  {
    id: 1,
    invoiceNo: 'INV-2024-001',
    tenderId: 'TID001',
    vendor: 'Meril Life Sciences',
    invoiceDate: '2024-01-20',
    dueDate: '2024-02-19',
    amount: 12500000,
    status: 'Paid',
    state: 'Gujarat'
  },
  {
    id: 2,
    invoiceNo: 'INV-2024-002',
    tenderId: 'TID002',
    vendor: 'Endologix Medical',
    invoiceDate: '2024-02-25',
    dueDate: '2024-03-27',
    amount: 13500000,
    status: 'Unpaid',
    state: 'Maharashtra'
  },
  {
    id: 3,
    invoiceNo: 'INV-2024-003',
    tenderId: 'TID003',
    vendor: 'Sahajanand Medical Tech',
    invoiceDate: '2024-03-15',
    dueDate: '2024-04-14',
    amount: 11250000,
    status: 'Paid',
    state: 'Gujarat'
  },
  {
    id: 4,
    invoiceNo: 'INV-2024-004',
    tenderId: 'TID004',
    vendor: 'Translumina Therapeutics',
    invoiceDate: '2024-04-22',
    dueDate: '2024-05-22',
    amount: 17000000,
    status: 'Overdue',
    state: 'Karnataka'
  },
  {
    id: 5,
    invoiceNo: 'INV-2024-005',
    tenderId: 'TID005',
    vendor: 'Meril Life Sciences',
    invoiceDate: '2024-05-25',
    dueDate: '2024-06-24',
    amount: 8000000,
    status: 'Unpaid',
    state: 'Gujarat'
  },
  {
    id: 6,
    invoiceNo: 'INV-2024-006',
    tenderId: 'TID006',
    vendor: 'Vascular Concepts Ltd',
    invoiceDate: '2024-06-12',
    dueDate: '2024-07-12',
    amount: 12800000,
    status: 'Paid',
    state: 'Tamil Nadu'
  },
  {
    id: 7,
    invoiceNo: 'INV-2024-007',
    tenderId: 'TID007',
    vendor: 'Meril Life Sciences',
    invoiceDate: '2024-07-18',
    dueDate: '2024-08-17',
    amount: 33000000,
    status: 'Overdue',
    state: 'Gujarat'
  },
  {
    id: 8,
    invoiceNo: 'INV-2024-008',
    tenderId: 'TID008',
    vendor: 'Intact Medical',
    invoiceDate: '2024-08-22',
    dueDate: '2024-09-21',
    amount: 3000000,
    status: 'Unpaid',
    state: 'Delhi'
  },
  {
    id: 9,
    invoiceNo: 'INV-2024-009',
    tenderId: 'TID009',
    vendor: 'SMT Healthcare',
    invoiceDate: '2024-09-15',
    dueDate: '2024-10-15',
    amount: 14400000,
    status: 'Paid',
    state: 'Gujarat'
  },
  {
    id: 10,
    invoiceNo: 'INV-2024-010',
    tenderId: 'TID010',
    vendor: 'Meril Life Sciences',
    invoiceDate: '2024-10-28',
    dueDate: '2024-11-27',
    amount: 14250000,
    status: 'Overdue',
    state: 'Gujarat'
  },
  {
    id: 11,
    invoiceNo: 'INV-2024-011',
    tenderId: 'TID011',
    vendor: 'Cordis Healthcare',
    invoiceDate: '2024-11-08',
    dueDate: '2024-12-08',
    amount: 22500000,
    status: 'Unpaid',
    state: 'Karnataka'
  },
  {
    id: 12,
    invoiceNo: 'INV-2024-012',
    tenderId: 'TID012',
    vendor: 'Meril Life Sciences',
    invoiceDate: '2024-12-03',
    dueDate: '2025-01-02',
    amount: 22500000,
    status: 'Paid',
    state: 'Gujarat'
  }
];

const BillingInvoices = () => {
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(10);
  
  // Filter states
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    status: 'All',
    vendor: 'All',
    state: 'All'
  });

  // Compute summary statistics
  const summary = useMemo(() => {
    const total = invoices.length;
    const paid = invoices.filter(inv => inv.status === 'Paid').length;
    const unpaidAmount = invoices
      .filter(inv => inv.status === 'Unpaid')
      .reduce((sum, inv) => sum + inv.amount, 0);
    const overdue = invoices.filter(inv => inv.status === 'Overdue').length;

    return { total, paid, unpaidAmount, overdue };
  }, [invoices]);

  // Filter logic
  const filteredInvoices = useMemo(() => {
    let result = [...invoices];

    // Search filter
if (searchText.trim()) {
  const search = searchText.toLowerCase();
  result = result.filter(inv =>
    inv.invoiceNo.toLowerCase().includes(search) ||
    inv.vendor.toLowerCase().includes(search) ||
    inv.tenderId.toLowerCase().includes(search)
  );
}

// Date range filter
if (filters.dateFrom) {
  result = result.filter(inv => inv.invoiceDate >= filters.dateFrom);
}
if (filters.dateTo) {
  result = result.filter(inv => inv.invoiceDate <= filters.dateTo);
}

// Status filter
if (filters.status !== 'All') {
  result = result.filter(inv => inv.status === filters.status);
}

// Vendor filter
if (filters.vendor !== 'All') {
  result = result.filter(inv => inv.vendor === filters.vendor);
}

// State filter
if (filters.state !== 'All') {
  result = result.filter(inv => inv.state === filters.state);
}

return result;
}, [invoices, searchText, filters]);
// Pagination
const totalPages = Math.ceil(filteredInvoices.length / rowsPerPage);
const paginatedInvoices = filteredInvoices.slice(
(currentPage - 1) * rowsPerPage,
currentPage * rowsPerPage
);
// Get unique vendors and states for filter dropdowns
const vendors = ['All', ...new Set(INITIAL_INVOICES.map(inv => inv.vendor))];
const states = ['All', ...new Set(INITIAL_INVOICES.map(inv => inv.state))];
const handleSearch = () => {
setCurrentPage(1);
console.log('Search filters applied:', filters);
};
const handleClearFilters = () => {
setSearchText('');
setFilters({
dateFrom: '',
dateTo: '',
status: 'All',
vendor: 'All',
state: 'All'
});
setCurrentPage(1);
};
const handleView = (invoiceId) => {
console.log('View invoice:', invoiceId);
};
const handleDownload = (invoiceId) => {
console.log('Download invoice:', invoiceId);
};
const handleMarkPaid = (invoiceId) => {
setInvoices(prevInvoices =>
prevInvoices.map(inv =>
inv.id === invoiceId ? { ...inv, status: 'Paid' } : inv
)
);
console.log('Marked as paid:', invoiceId);
};
const handleExport = () => {
console.log('Exporting invoices:', paginatedInvoices);
const headers = ['Invoice No', 'Tender ID', 'Vendor', 'Invoice Date', 'Due Date', 'Amount', 'Status'];
const csv = [
headers.join(','),
...paginatedInvoices.map(inv => [
inv.invoiceNo, inv.tenderId, inv.vendor, inv.invoiceDate, inv.dueDate, inv.amount, inv.status
].join(','))
].join('\n');
console.log(csv);
};
return (
<div className="billing-invoices-page">
<div className="page-header">
<h1>Billing & Invoices</h1>
<p>Manage billing, invoices, and payment tracking</p>
</div>
  {/* Summary Cards */}
  <div className="summary-cards">
    <div className="summary-card">
      <div className="summary-icon">📄</div>
      <div className="summary-content">
        <div className="summary-label">Total Invoices</div>
        <div className="summary-value">{summary.total}</div>
      </div>
    </div>
    <div className="summary-card">
      <div className="summary-icon">✅</div>
      <div className="summary-content">
        <div className="summary-label">Paid Invoices</div>
        <div className="summary-value">{summary.paid}</div>
      </div>
    </div>
    <div className="summary-card">
      <div className="summary-icon">💰</div>
      <div className="summary-content">
        <div className="summary-label">Unpaid Amount</div>
        <div className="summary-value">₹{(summary.unpaidAmount / 10000000).toFixed(2)}Cr</div>
      </div>
    </div>
    <div className="summary-card">
      <div className="summary-icon">⚠️</div>
      <div className="summary-content">
        <div className="summary-label">Overdue Invoices</div>
        <div className="summary-value">{summary.overdue}</div>
      </div>
    </div>
  </div>

  {/* Search and Filters */}
  <div className="filters-card">
    <div className="filters-row-top">
      <input
        type="text"
        className="search-input"
        placeholder="Search by Invoice No, Vendor, or Tender ID..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        aria-label="Search invoices"
      />
      <button className="btn-export" onClick={handleExport}>
        Export to Excel
      </button>
    </div>

    <div className="filters-grid">
      <div className="filter-group">
        <label htmlFor="dateFrom">Date From</label>
        <input
          id="dateFrom"
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
        />
      </div>

      <div className="filter-group">
        <label htmlFor="dateTo">Date To</label>
        <input
          id="dateTo"
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
        />
      </div>

      <div className="filter-group">
        <label htmlFor="status">Status</label>
        <select
          id="status"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="All">All</option>
          <option value="Paid">Paid</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Overdue">Overdue</option>
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="vendor">Vendor</label>
        <select
          id="vendor"
          value={filters.vendor}
          onChange={(e) => setFilters({ ...filters, vendor: e.target.value })}
        >
          {vendors.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="state">State</label>
        <select
          id="state"
          value={filters.state}
          onChange={(e) => setFilters({ ...filters, state: e.target.value })}
        >
          {states.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>

    <div className="filter-actions">
      <button className="btn-search" onClick={handleSearch}>Search</button>
      <button className="btn-clear" onClick={handleClearFilters}>Clear Filters</button>
    </div>
  </div>

  {/* Invoices Table */}
  <div className="table-wrapper">
    <table className="invoices-table" aria-label="Billing and Invoices table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Invoice No</th>
          <th scope="col">Tender ID</th>
          <th scope="col">Vendor</th>
          <th scope="col">Invoice Date</th>
          <th scope="col">Due Date</th>
          <th scope="col">Amount</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {paginatedInvoices.map((invoice, index) => (
          <tr key={invoice.id}>
            <td>{(currentPage - 1) * rowsPerPage + index + 1}</td>
            <td>{invoice.invoiceNo}</td>
            <td>{invoice.tenderId}</td>
            <td>{invoice.vendor}</td>
            <td>{invoice.invoiceDate}</td>
            <td>{invoice.dueDate}</td>
            <td>₹{invoice.amount.toLocaleString()}</td>
            <td>
              <span className={`status-badge status-${invoice.status.toLowerCase()}`}>
                {invoice.status}
              </span>
            </td>
            <td>
              <div className="action-buttons">
                <button
                  className="btn-action btn-view"
                  onClick={() => handleView(invoice.id)}
                  aria-label="View invoice"
                >
                  View
                </button>
                <button
                  className="btn-action btn-download"
                  onClick={() => handleDownload(invoice.id)}
                  aria-label="Download invoice"
                >
                  Download
                </button>
                {invoice.status !== 'Paid' && (
                  <button
                    className="btn-action btn-mark-paid"
                    onClick={() => handleMarkPaid(invoice.id)}
                    aria-label="Mark as paid"
                  >
                    Mark Paid
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {/* Pagination */}
  <div className="pagination">
    <div className="pagination-info">
      Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, filteredInvoices.length)} of {filteredInvoices.length} entries
    </div>
    <div className="pagination-controls">
      <button
        className="btn-page"
        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
        disabled={currentPage === 1}
      >
        Previous
      </button>
      {[...Array(totalPages)].map((_, i) => {
        const page = i + 1;
        if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
          return (
            <button
              key={page}
              className={`btn-page ${currentPage === page ? 'active' : ''}`}
              onClick={() => setCurrentPage(page)}
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
        className="btn-page"
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
export default BillingInvoices;
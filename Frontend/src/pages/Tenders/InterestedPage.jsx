// src/pages/Archive/ArchivePage.jsx
// Usage:
// import ArchivePage from 'src/pages/Archive/ArchivePage';
// <Route path="/archive" element={<ArchivePage/>} />

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import '../../assets/css/InterestedPage.css';

const DUMMY_ARCHIVED_TENDERS = [
  { T_ID: 'T111', title: 'Highway Expansion Project Phase 2', startDate: '2025-01-01', endDate: '2025-02-15', department: 'PWD', location: 'Mumbai', state: 'Maharashtra', value: 65000, emd: 13000000, qty: 1, interested: true },
  { T_ID: 'T222', title: 'Metro Rail Station Development', startDate: '2025-01-10', endDate: '2025-03-01', department: 'Transport', location: 'Delhi', state: 'Delhi', value: 95000, emd: 19000000, qty: 3, status: 'Awarded', interested: true },
  { T_ID: 'T333', title: 'Smart City Infrastructure', startDate: '2025-01-05', endDate: '2025-02-28', department: 'Municipal', location: 'Bangalore', state: 'Karnataka', value: 42000, emd: 8500000, qty: 1, status: 'Closed', interested: true },
  { T_ID: 'T444', title: 'Medical Equipment Supply', startDate: '2025-01-12', endDate: '2025-03-20', department: 'Health', location: 'Chennai', state: 'Tamil Nadu', value: 18500, emd: 3700000, qty: 75, status: 'Awarded', interested: true },
  { T_ID: 'T555', title: 'Heritage Building Restoration', startDate: '2025-01-03', endDate: '2025-02-25', department: 'Culture', location: 'Kolkata', state: 'West Bengal', value: 12000, emd: 2400000, qty: 2, status: 'Closed', interested: true },
  { T_ID: 'T666', title: 'Flyover Construction Project', startDate: '2025-01-08', endDate: '2025-02-18', department: 'PWD', location: 'Hyderabad', state: 'Telangana', value: 78000, emd: 15600000, qty: 1, status: 'Awarded', interested: true },
  { T_ID: 'T777', title: 'Public Park Development', startDate: '2025-01-15', endDate: '2025-03-30', department: 'Municipal', location: 'Pune', state: 'Maharashtra', value: 8500, emd: 1700000, qty: 5, status: 'Closed', interested: true },
  { T_ID: 'T888', title: 'IT Modernization', startDate: '2025-01-10', endDate: '2025-03-05', department: 'Technology', location: 'Ahmedabad', state: 'Gujarat', value: 22000, emd: 4400000, qty: 1, status: 'Awarded', interested: true },
  {
    T_ID: 'T999',
    title: 'Design, engineering, procurement for construction of trauma centre level II by converting into trauma centre level I (Apex Trauma Centre – 200 bedded) at Lala Lajpat Rai Hospital campus affiliated to Government Medical College, Kanpur Nagar on EPC mode, U.P., India.',
    startDate: '2025-01-02',
    endDate: '2025-02-28',
    department: 'Transport',
    location: 'Jaipur',
    state: 'Rajasthan',
    value: 125000,
    emd: 25000000,
    qty: 50,
    status: 'Awarded',
    interested: true
  },
  { T_ID: 'T1010', title: 'Waste Treatment Plant', startDate: '2025-01-20', endDate: '2025-04-10', department: 'Environment', location: 'Surat', state: 'Gujarat', value: 35000, emd: 7000000, qty: 1, status: 'Closed', interested: true },
];


const DUMMY_STATUS_HISTORY = [
  { status: 'Proceed', remarks: 'Initial review completed', createdDate: '2025-01-15', updatedDate: '2025-01-15' },
  { status: 'Win', remarks: 'Tender awarded successfully', createdDate: '2025-02-10', updatedDate: '2025-02-10' },
  { status: 'On-Hold', remarks: 'Awaiting documentation', createdDate: '2025-01-20', updatedDate: '2025-01-22' },
];

const TenderStatusModal = ({ tender, onClose }) => {
  const [formData, setFormData] = useState({
    status: 'proceed',
    remark: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Status Update:', { tenderId: tender.T_ID, ...formData });
    alert(`Status updated for Tender ${tender.T_ID}`);
    // In real app, you would update the backend here
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tender Status - {tender.T_ID}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="status-form">
          <div className="form-group">
            <label htmlFor="tender-status">Tender Status:</label>
            <select
              id="tender-status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="form-select"
            >
              <option value="proceed">Proceed</option>
              <option value="win">Win</option>
              <option value="lose">Lose</option>
              <option value="on-hold">On-Hold</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="remark">Remark:</label>
            <textarea
              id="remark"
              value={formData.remark}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
              className="form-textarea"
              rows="4"
              placeholder="Enter your remarks here..."
            />
          </div>

          <button type="submit" className="btn-submit">Submit</button>
        </form>

        <div className="status-history">
          <h3>Status History</h3>
          <table className="history-table">
            <thead>
              <tr>
                <th>Tender Status</th>
                <th>Remarks</th>
                <th>Created Date</th>
                <th>Updated Date</th>
              </tr>
            </thead>
            <tbody>
              {DUMMY_STATUS_HISTORY.map((record, idx) => (
                <tr key={idx}>
                  <td><span className={`status-badge ${record.status.toLowerCase()}`}>{record.status}</span></td>
                  <td>{record.remarks}</td>
                  <td>{record.createdDate}</td>
                  <td>{record.updatedDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const TenderRow = ({ tender, serialNumber, onAction, onToggleInterest }) => {
  const calculateDaysLeft = (endDate) => {
    if (!endDate) return 0;
    const end = new Date(endDate);
    if (isNaN(end.getTime())) return 0;
    const today = new Date();
    const utc1 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const utc2 = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    const diffDays = Math.ceil((utc2 - utc1) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const formatValue = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return `₹ ${value}`;
    if (value >= 100) return `₹ ${(value / 100).toFixed(2)} CR.`;
    return `₹ ${value.toFixed(2)} L.`;
  };

  const daysLeft = calculateDaysLeft(tender.endDate);

  return (
    <div className="tender-row-compact">
      
      <div className="tender-main-info">
        <div className="tender-header-line">
        <b><div className="tender-serial" style={{ fontSize: "14pt"}}>{serialNumber}.</div></b>

          <span className="tender-id-bold" style={{ fontSize: "14pt"}}>Tender Id - {tender.T_ID}</span>
          <span className="tender-value-bold" style={{ fontSize: "14pt"}}>{formatValue(tender.value)}</span>
          <b><span className="tender-date" style={{ fontSize: "14pt"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {tender.endDate} <span className="days-left-badge" style={{ fontSize: "9pt"}}>{daysLeft} Days Left</span>
          </span></b>
          <b><span className="tender-emd" style={{ fontSize: "13pt"}}>EMD: ₹ {tender.emd.toLocaleString()}</span></b>
        </div>
        <span style={{height: "2pt"}}></span>
        <Link
          to={`/tenders/tenderdetails/${encodeURIComponent(tender.T_ID)}`}
          className="tender-title-link" style={{ fontSize: "13.8pt", color: 'black'}}
        >
          {tender.title}
        </Link>
        <span style={{height: "2pt"}}></span>

        <div className="tender-location-line"  style={{
    fontWeight: 755,
    fontSize: '12pt',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '8px',
    color: '#084f9a'
  }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          {tender.department} - {tender.location}, {tender.state}
        </div>
      </div>

      <div className="tender-actions-compact">
        <button
          onClick={(e) => { e.stopPropagation(); onAction('info', tender.T_ID); }}
          aria-label="Additional info"
          title="Additional info"
          className="action-icon-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onAction('boq', tender.T_ID); }}
          aria-label="BOQ details"
          title="BOQ details"
          className="action-icon-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onAction('status', tender); }}
          aria-label="Tender status"
          title="Tender status"
          className="action-icon-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleInterest(tender.T_ID); }}
          aria-label="Mark interested"
          title="Mark interested"
          className={`action-icon-btn ${tender.interested ? 'interested-active' : ''}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={tender.interested ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onAction('assign', tender.T_ID); }}
          aria-label="Assign tender"
          title="Assign tender"
          className="action-icon-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onAction('download', tender.T_ID); }}
          aria-label="Download"
          title="Download"
          className="action-icon-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  const remainingPages = Math.max(0, totalPages - currentPage);

  return (
    <div className="archive-pagination" role="navigation" aria-label="Archive pagination">
      <div className="archive-pagination-info">
        Page {currentPage} of {totalPages}
        <span className="archive-remaining">Remaining pages: {remainingPages}</span>
      </div>
      <button
        className="archive-btn-next"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  );
};

export default function ArchivePage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState('desc');
  const [tenders, setTenders] = useState(DUMMY_ARCHIVED_TENDERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedTender, setSelectedTender] = useState(null);

  // Filter states
  const [searchKeyword, setSearchKeyword] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [city, setCity] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [tenderStatus, setTenderStatus] = useState('');
  const [tenderId, setTenderId] = useState('');
  const [quantityOperator, setQuantityOperator] = useState('>=');
  const [quantityValue, setQuantityValue] = useState('');
  const [valueOperator, setValueOperator] = useState('=');
  const [valueFrom, setValueFrom] = useState('');
  const [valueTo, setValueTo] = useState('');
  const [valueUnit, setValueUnit] = useState('Lakh');

  const itemsPerPage = 10;

  const filteredTenders = useMemo(() => {
    return tenders.filter(tender => {
      if (searchKeyword) {
        const q = searchKeyword.toLowerCase();
        if (!tender.title.toLowerCase().includes(q) && !tender.T_ID.toLowerCase().includes(q)) {
          return false;
        }
      }

      if (referenceNumber && !tender.T_ID.toLowerCase().includes(referenceNumber.toLowerCase())) {
        return false;
      }

      if (selectedState && tender.state !== selectedState) {
        return false;
      }

      if (city && !tender.location.toLowerCase().includes(city.toLowerCase())) {
        return false;
      }

      if (departmentName && !tender.department.toLowerCase().includes(departmentName.toLowerCase())) {
        return false;
      }

      if (tenderStatus && tender.status !== tenderStatus) {
        return false;
      }

      if (tenderId && !tender.T_ID.toLowerCase().includes(tenderId.toLowerCase())) {
        return false;
      }

      if (quantityValue) {
        const qty = parseInt(quantityValue, 10);
        if (!isNaN(qty)) {
          if (quantityOperator === '>=' && tender.qty < qty) return false;
          if (quantityOperator === '<=' && tender.qty > qty) return false;
          if (quantityOperator === '=' && tender.qty !== qty) return false;
        }
      }

      if (valueFrom) {
        const multiplier = valueUnit === 'Lakh' ? 1 : 100;
        const fromVal = parseFloat(valueFrom) * multiplier;
        if (!isNaN(fromVal)) {
          if (valueOperator === '=' && tender.value !== fromVal) return false;
          if (valueOperator === '>=' && tender.value < fromVal) return false;
          if (valueOperator === '<=' && tender.value > fromVal) return false;

          if (valueTo && valueOperator === '=') {
            const toVal = parseFloat(valueTo) * multiplier;
            if (!isNaN(toVal) && (tender.value < fromVal || tender.value > toVal)) return false;
          }
        }
      }

      return true;
    });
  }, [tenders, searchKeyword, referenceNumber, selectedState, city, departmentName, tenderStatus, tenderId, quantityOperator, quantityValue, valueOperator, valueFrom, valueTo, valueUnit]);

  const sortedTenders = useMemo(() => {
    const sorted = [...filteredTenders].sort((a, b) => {
      return sortOrder === 'asc' ? a.value - b.value : b.value - a.value;
    });
    return sorted;
  }, [filteredTenders, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedTenders.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentTenders = sortedTenders.slice(startIndex, startIndex + itemsPerPage);

  const handleAction = (action, tenderData) => {
    if (action === 'status') {
      setSelectedTender(tenderData);
      setShowStatusModal(true);
    } else if (action === 'download') {
      alert(`Downloading archived tender ${tenderData} (mock)`);
      console.log(`Download Archived Tender: ${tenderData}`);
    } else {
      console.log(`Action: ${action} on Archived Tender: ${tenderData}`);
    }
  };

  const handleToggleInterest = (tid) => {
    setTenders(prevTenders =>
      prevTenders.map(t =>
        t.T_ID === tid ? { ...t, interested: !t.interested } : t
      )
    );
    console.log(`Toggled interest for Archived Tender: ${tid}`);
  };

  const handleClearFilters = () => {
    setSearchKeyword('');
    setReferenceNumber('');
    setSelectedState('');
    setCity('');
    setDepartmentName('');
    setTenderStatus('');
    setTenderId('');
    setQuantityOperator('>=');
    setQuantityValue('');
    setValueOperator('=');
    setValueFrom('');
    setValueTo('');
    setValueUnit('Lakh');
    setCurrentPage(1);
  };

  const handleSearch = () => {
    setCurrentPage(1);
    console.log('Archive search executed with filters');
  };

  return (
    <div className="archive-page">
      <header className="archive-page-header">
        <h1>Interested Tenders</h1>
      </header>

      <div className="archive-search-filter-section">
        <div className="archive-search-bar-container">
          <div className="archive-search-input-wrapper">
            <svg className="archive-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Interested Tenders Filter"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="archive-main-search-input"
            />
          </div>

          <button
            className="archive-filter-toggle-btn"
            onClick={() => setShowFilters(prev => !prev)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>

        <div className={`archive-filters-panel ${showFilters ? 'show' : ''}`}>
          <div className="archive-filters-grid">
            <input type="text" placeholder="Search By Keywords" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} className="archive-filter-input" />
            <input type="text" placeholder="Reference Number" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="archive-filter-input" />
            <select value={selectedState} onChange={(e) => setSelectedState(e.target.value)} className="archive-filter-select">
              <option value="">Select State</option>
              <option value="Maharashtra">Maharashtra</option>
              <option value="Delhi">Delhi</option>
              <option value="Karnataka">Karnataka</option>
              <option value="Tamil Nadu">Tamil Nadu</option>
              <option value="West Bengal">West Bengal</option>
              <option value="Telangana">Telangana</option>
              <option value="Gujarat">Gujarat</option>
              <option value="Rajasthan">Rajasthan</option>
              <option value="Uttar Pradesh">Uttar Pradesh</option>
            </select>
            <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="archive-filter-input" />
            <input type="text" placeholder="Department Name" value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} className="archive-filter-input" />
            <select className="archive-filter-select"><option value="">Assign By</option></select>
            <select className="archive-filter-select"><option value="">Assign To</option></select>
            <input type="text" placeholder="Tender Id" value={tenderId} onChange={(e) => setTenderId(e.target.value)} className="archive-filter-input" />
            <input type="text" placeholder="Website" className="archive-filter-input" />
            <div className="archive-filter-input date-range"><input type="text" placeholder="Closing From → Closing To" /></div>
            <select className="archive-filter-select"><option value="">Ownership</option></select>
            <div className="archive-filter-input date-range"><input type="text" placeholder="Pre-bid From → Pre-bid To" /></div>
            <select className="archive-filter-select"><option value="">Select Mail Type</option></select>
            <input type="text" placeholder="Last Updated Date" className="archive-filter-input" />
          </div>

          <div className="archive-filters-row">
            <div className="archive-filter-group">
              <span className="archive-filter-label">Quantity:</span>
              <select value={quantityOperator} onChange={(e) => setQuantityOperator(e.target.value)} className="archive-filter-select-sm">
                <option value=">=">&gt;=</option>
                <option value="<=">&lt;=</option>
                <option value="=">=</option>
              </select>
              <input type="number" placeholder="Enter Quantity" value={quantityValue} onChange={(e) => setQuantityValue(e.target.value)} className="archive-filter-input-sm" />
            </div>

            <div className="archive-filter-group">
              <span className="archive-filter-label">Tender Value:</span>
              <select value={valueOperator} onChange={(e) => setValueOperator(e.target.value)} className="archive-filter-select-sm">
                <option value="=">=</option>
                <option value=">=">&gt;=</option>
                <option value="<=">&lt;=</option>
              </select>
              <input type="number" placeholder="Value" value={valueFrom} onChange={(e) => setValueFrom(e.target.value)} className="archive-filter-input-sm" />
              <select value={valueUnit} onChange={(e) => setValueUnit(e.target.value)} className="archive-filter-select-sm">
                <option value="Lakh">Lakh</option>
                <option value="Crore">Crore</option>
              </select>
              <input type="number" placeholder="To" value={valueTo} onChange={(e) => setValueTo(e.target.value)} className="archive-filter-input-sm" />
              <select className="archive-filter-select-sm"><option value="Lakh">Lakh</option><option value="Crore">Crore</option></select>
            </div>
          </div>

          <div className="archive-filters-row">
            <div className="archive-filter-group">
              <span className="archive-filter-label">GeM / Non GeM:</span>
              <label className="archive-radio-label"><input type="radio" name="gem" defaultChecked /><span>All</span></label>
              <label className="archive-radio-label"><input type="radio" name="gem" /><span>GeM</span></label>
              <label className="archive-radio-label"><input type="radio" name="gem" /><span>Non GeM</span></label>
            </div>
            <div className="archive-filter-group">
              <span className="archive-filter-label">MSME Exemption:</span>
              <label className="archive-checkbox-label"><input type="checkbox" /></label>
            </div>
            <div className="archive-filter-group">
              <span className="archive-filter-label">Startup Exemption:</span>
              <label className="archive-radio-label"><input type="radio" name="startup" defaultChecked /><span>All</span></label>
              <label className="archive-radio-label"><input type="radio" name="startup" /><span>Yes</span></label>
              <label className="archive-radio-label"><input type="radio" name="startup" /><span>No</span></label>
            </div>
            <div className="archive-filter-group">
              <span className="archive-filter-label">Manual Entry:</span>
              <label className="archive-checkbox-label"><input type="checkbox" /></label>
            </div>
          </div>

          <div className="archive-filters-actions">
            <button className="archive-btn-search" onClick={handleSearch}>Search</button>
            <button className="archive-btn-clear" onClick={handleClearFilters}>Clear</button>
          </div>
        </div>
      </div>

      <div className="archive-sort-section">
        <div className="archive-results-count">{sortedTenders.length} Interested tenders found</div>
        <div className="archive-sort-controls">
          <label htmlFor="archive-sort-select">Sort by Value:</label>
          <select id="archive-sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="archive-sort-select">
            <option value="desc">Highest First</option>
            <option value="asc">Lowest First</option>
          </select>
        </div>
      </div>

      <div className="tenders-list-compact">
        {currentTenders.map((tender, index) => (
          <TenderRow
            key={tender.T_ID}
            tender={tender}
            serialNumber={startIndex + index + 1}
            onAction={handleAction}
            onToggleInterest={handleToggleInterest}
          />
        ))}
      </div>

      {sortedTenders.length === 0 && (
        <div className="archive-no-results">No archived tenders found matching your filters.</div>
      )}

      {sortedTenders.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(p) => setCurrentPage(Math.min(Math.max(1, p), totalPages))}
        />
      )}

      {showStatusModal && selectedTender && (
        <TenderStatusModal
          tender={selectedTender}
          onClose={() => {
            setShowStatusModal(false);
            setSelectedTender(null);
          }}
        />
      )}
    </div>
  );
}
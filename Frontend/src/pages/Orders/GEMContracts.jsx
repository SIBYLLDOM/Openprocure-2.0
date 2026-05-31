// src/pages/Orders/GEMContracts.jsx
// Route: /orders/gem-contracts

import React, { useState, useMemo } from 'react';
import '../../assets/css/GEMContracts.css';

// Dummy data
const INITIAL_CONTRACTS = [
  {
    id: 1,
    month: 'Jan 2024',
    contractNo: 'GEM/2024/B/4567890',
    contractDate: '2024-01-15',
    zonalHead: 'North Zone',
    hospitalName: 'AIIMS Delhi',
    hospitalState: 'Delhi',
    sellerName: 'Meril Medical Solutions',
    sellerState: 'Gujarat',
    category: 'Cardiology',
    decode: 'Stents - Drug Eluting',
    merilOthers: 'MERIL',
    companyName: 'Meril Life Sciences',
    orderedQty: 500,
    unitPrice: 25000,
    contractValue: 12500000,
    referenceNo: 'REF2024001',
    city: 'New Delhi',
    department: 'Cardiology Dept',
    status: 'Awarded',
    tenderId: 'TID001',
    website: 'gem.gov.in',
    closingDate: '2024-01-10',
    ownership: 'Government',
    preBidDate: '2024-01-05',
    mailType: 'Email',
    lastUpdated: '2024-01-20',
    isGem: true,
    isMsme: true,
    isStartup: false,
    isManualEntry: false
  },
  {
    id: 2,
    month: 'Feb 2024',
    contractNo: 'GEM/2024/B/4567891',
    contractDate: '2024-02-20',
    zonalHead: 'South Zone',
    hospitalName: 'Apollo Hospital',
    hospitalState: 'Tamil Nadu',
    sellerName: 'Endologix India',
    sellerState: 'Maharashtra',
    category: 'Orthopedics',
    decode: 'Joint Replacement',
    merilOthers: 'OTHERS',
    companyName: 'Endologix Medical',
    orderedQty: 300,
    unitPrice: 45000,
    contractValue: 13500000,
    referenceNo: 'REF2024002',
    city: 'Chennai',
    department: 'Ortho Dept',
    status: 'Open',
    tenderId: 'TID002',
    website: 'gem.gov.in',
    closingDate: '2024-02-15',
    ownership: 'Private',
    preBidDate: '2024-02-10',
    mailType: 'Portal',
    lastUpdated: '2024-02-25',
    isGem: true,
    isMsme: false,
    isStartup: true,
    isManualEntry: false
  },
  {
    id: 3,
    month: 'Mar 2024',
    contractNo: 'GEM/2024/B/4567892',
    contractDate: '2024-03-10',
    zonalHead: 'West Zone',
    hospitalName: 'Kokilaben Hospital',
    hospitalState: 'Maharashtra',
    sellerName: 'Sahajanand Medical',
    sellerState: 'Gujarat',
    category: 'Cardiology',
    decode: 'Angioplasty Balloons',
    merilOthers: 'MERIL',
    companyName: 'Sahajanand Medical Tech',
    orderedQty: 750,
    unitPrice: 15000,
    contractValue: 11250000,
    referenceNo: 'REF2024003',
    city: 'Mumbai',
    department: 'Interventional Cardiology',
    status: 'Closed',
    tenderId: 'TID003',
    website: 'gem.gov.in',
    closingDate: '2024-03-05',
    ownership: 'Private',
    preBidDate: '2024-02-28',
    mailType: 'Email',
    lastUpdated: '2024-03-15',
    isGem: false,
    isMsme: true,
    isStartup: false,
    isManualEntry: true
  },
  {
    id: 4,
    month: 'Apr 2024',
    contractNo: 'GEM/2024/B/4567893',
    contractDate: '2024-04-18',
    zonalHead: 'East Zone',
    hospitalName: 'Medical College Kolkata',
    hospitalState: 'West Bengal',
    sellerName: 'Translumina Medical',
    sellerState: 'Karnataka',
    category: 'Neurology',
    decode: 'Neurovascular Devices',
    merilOthers: 'OTHERS',
    companyName: 'Translumina Therapeutics',
    orderedQty: 200,
    unitPrice: 85000,
    contractValue: 17000000,
    referenceNo: 'REF2024004',
    city: 'Kolkata',
    department: 'Neurosurgery',
    status: 'Awarded',
    tenderId: 'TID004',
    website: 'gem.gov.in',
    closingDate: '2024-04-12',
    ownership: 'Government',
    preBidDate: '2024-04-05',
    mailType: 'Portal',
    lastUpdated: '2024-04-22',
    isGem: true,
    isMsme: false,
    isStartup: false,
    isManualEntry: false
  },
  {
    id: 5,
    month: 'May 2024',
    contractNo: 'GEM/2024/B/4567894',
    contractDate: '2024-05-22',
    zonalHead: 'North Zone',
    hospitalName: 'PGI Chandigarh',
    hospitalState: 'Chandigarh',
    sellerName: 'Meril Medical Solutions',
    sellerState: 'Gujarat',
    category: 'Cardiology',
    decode: 'PTCA Guide Wires',
    merilOthers: 'MERIL',
    companyName: 'Meril Life Sciences',
    orderedQty: 1000,
    unitPrice: 8000,
    contractValue: 8000000,
    referenceNo: 'REF2024005',
    city: 'Chandigarh',
    department: 'Cath Lab',
    status: 'Open',
    tenderId: 'TID005',
    website: 'gem.gov.in',
    closingDate: '2024-05-30',
    ownership: 'Government',
    preBidDate: '2024-05-15',
    mailType: 'Email',
    lastUpdated: '2024-05-25',
    isGem: true,
    isMsme: true,
    isStartup: true,
    isManualEntry: false
  },
  {
    id: 6,
    month: 'Jun 2024',
    contractNo: 'GEM/2024/B/4567895',
    contractDate: '2024-06-08',
    zonalHead: 'South Zone',
    hospitalName: 'Manipal Hospital',
    hospitalState: 'Karnataka',
    sellerName: 'Vascular Concepts',
    sellerState: 'Tamil Nadu',
    category: 'Vascular Surgery',
    decode: 'Peripheral Stents',
    merilOthers: 'OTHERS',
    companyName: 'Vascular Concepts Ltd',
    orderedQty: 400,
    unitPrice: 32000,
    contractValue: 12800000,
    referenceNo: 'REF2024006',
    city: 'Bangalore',
    department: 'Vascular Surgery',
    status: 'Closed',
    tenderId: 'TID006',
    website: 'eprocure.gov.in',
    closingDate: '2024-06-03',
    ownership: 'Private',
    preBidDate: '2024-05-28',
    mailType: 'Portal',
    lastUpdated: '2024-06-12',
    isGem: false,
    isMsme: false,
    isStartup: false,
    isManualEntry: false
  },
  {
    id: 7,
    month: 'Jul 2024',
    contractNo: 'GEM/2024/B/4567896',
    contractDate: '2024-07-15',
    zonalHead: 'West Zone',
    hospitalName: 'Jaslok Hospital',
    hospitalState: 'Maharashtra',
    sellerName: 'Meril Medical Solutions',
    sellerState: 'Gujarat',
    category: 'Cardiology',
    decode: 'Bioresorbable Stents',
    merilOthers: 'MERIL',
    companyName: 'Meril Life Sciences',
    orderedQty: 600,
    unitPrice: 55000,
    contractValue: 33000000,
    referenceNo: 'REF2024007',
    city: 'Mumbai',
    department: 'Cardiology',
    status: 'Awarded',
    tenderId: 'TID007',
    website: 'gem.gov.in',
    closingDate: '2024-07-10',
    ownership: 'Private',
    preBidDate: '2024-07-05',
    mailType: 'Email',
    lastUpdated: '2024-07-18',
    isGem: true,
    isMsme: true,
    isStartup: false,
    isManualEntry: false
  },
  {
    id: 8,
    month: 'Aug 2024',
    contractNo: 'GEM/2024/B/4567897',
    contractDate: '2024-08-20',
    zonalHead: 'East Zone',
    hospitalName: 'Fortis Hospital',
    hospitalState: 'West Bengal',
    sellerName: 'Intact Vascular',
    sellerState: 'Delhi',
    category: 'Radiology',
    decode: 'Imaging Contrast',
    merilOthers: 'OTHERS',
    companyName: 'Intact Medical',
    orderedQty: 250,
    unitPrice: 12000,
    contractValue: 3000000,
    referenceNo: 'REF2024008',
    city: 'Kolkata',
    department: 'Radiology Dept',
    status: 'Open',
    tenderId: 'TID008',
    website: 'gem.gov.in',
    closingDate: '2024-08-28',
    ownership: 'Private',
    preBidDate: '2024-08-15',
    mailType: 'Portal',
    lastUpdated: '2024-08-22',
    isGem: true,
    isMsme: false,
    isStartup: true,
    isManualEntry: true
  },
  {
    id: 9,
    month: 'Sep 2024',
    contractNo: 'GEM/2024/B/4567898',
    contractDate: '2024-09-12',
    zonalHead: 'North Zone',
    hospitalName: 'Max Hospital',
    hospitalState: 'Delhi',
    sellerName: 'SMT Medical',
    sellerState: 'Gujarat',
    category: 'Orthopedics',
    decode: 'Trauma Implants',
    merilOthers: 'OTHERS',
    companyName: 'SMT Healthcare',
    orderedQty: 800,
    unitPrice: 18000,
    contractValue: 14400000,
    referenceNo: 'REF2024009',
    city: 'New Delhi',
    department: 'Trauma Center',
    status: 'Awarded',
    tenderId: 'TID009',
    website: 'gem.gov.in',
    closingDate: '2024-09-08',
    ownership: 'Private',
    preBidDate: '2024-09-01',
    mailType: 'Email',
    lastUpdated: '2024-09-15',
    isGem: false,
    isMsme: true,
    isStartup: false,
    isManualEntry: false
  },
  {
    id: 10,
    month: 'Oct 2024',
    contractNo: 'GEM/2024/B/4567899',
    contractDate: '2024-10-25',
    zonalHead: 'South Zone',
    hospitalName: 'CMC Vellore',
    hospitalState: 'Tamil Nadu',
    sellerName: 'Meril Medical Solutions',
    sellerState: 'Gujarat',
    category: 'Cardiology',
    decode: 'Rotablation Devices',
    merilOthers: 'MERIL',
    companyName: 'Meril Life Sciences',
    orderedQty: 150,
    unitPrice: 95000,
    contractValue: 14250000,
    referenceNo: 'REF2024010',
    city: 'Vellore',
    department: 'Cardiology',
    status: 'Closed',
    tenderId: 'TID010',
    website: 'gem.gov.in',
    closingDate: '2024-10-20',
    ownership: 'Government',
    preBidDate: '2024-10-12',
    mailType: 'Portal',
    lastUpdated: '2024-10-28',
    isGem: true,
    isMsme: true,
    isStartup: false,
    isManualEntry: false
  },
  {
    id: 11,
    month: 'Nov 2024',
    contractNo: 'GEM/2024/B/4567900',
    contractDate: '2024-11-05',
    zonalHead: 'West Zone',
    hospitalName: 'Ruby Hall Clinic',
    hospitalState: 'Maharashtra',
    sellerName: 'Cordis Medical',
    sellerState: 'Karnataka',
    category: 'Neurology',
    decode: 'Flow Diverters',
    merilOthers: 'OTHERS',
    companyName: 'Cordis Healthcare',
    orderedQty: 180,
    unitPrice: 125000,
    contractValue: 22500000,
    referenceNo: 'REF2024011',
    city: 'Pune',
    department: 'Neuro Intervention',
    status: 'Open',
    tenderId: 'TID011',
    website: 'gem.gov.in',
    closingDate: '2024-11-15',
    ownership: 'Private',
    preBidDate: '2024-10-30',
    mailType: 'Email',
    lastUpdated: '2024-11-08',
    isGem: true,
    isMsme: false,
    isStartup: false,
    isManualEntry: false
  },
  {
    id: 12,
    month: 'Dec 2024',
    contractNo: 'GEM/2024/B/4567901',
    contractDate: '2024-12-01',
    zonalHead: 'North Zone',
    hospitalName: 'Safdarjung Hospital',
    hospitalState: 'Delhi',
    sellerName: 'Meril Medical Solutions',
    sellerState: 'Gujarat',
    category: 'Cardiology',
    decode: 'IVUS Systems',
    merilOthers: 'MERIL',
    companyName: 'Meril Life Sciences',
    orderedQty: 50,
    unitPrice: 450000,
    contractValue: 22500000,
    referenceNo: 'REF2024012',
    city: 'New Delhi',
    department: 'Cardiac Cath Lab',
    status: 'Awarded',
    tenderId: 'TID012',
    website: 'gem.gov.in',
    closingDate: '2024-11-25',
    ownership: 'Government',
    preBidDate: '2024-11-18',
    mailType: 'Portal',
    lastUpdated: '2024-12-03',
    isGem: true,
    isMsme: true,
    isStartup: true,
    isManualEntry: false
  }
];

const STATES = [
  'All States', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Chandigarh'
];

const GEMContracts = () => {
  const [contracts, setContracts] = useState([]);
  const [selectedContracts, setSelectedContracts] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState('contractDate-desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalPages, setTotalPages] = useState(1);

  // Search and filter states
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filters, setFilters] = useState({
    referenceNo: '',
    state: 'All States',
    departmentType: 'All',
    department: '',
    assignBy: 'All',
    assignTo: 'All',
    mailType: 'All',
    qtyOperator: '>=',
    qtyValue: '',
    valueOperator: '>=',
    valueFrom: '',
    valueTo: '',
    valueUnit: 'Lakh'
  });

  // Fetch contracts from API
  React.useEffect(() => {
    const fetchContracts = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('token');
        const [sortField, sortOrder] = sortBy.split('-');

        // Build query params
        const params = new URLSearchParams({
          page: currentPage,
          limit: rowsPerPage,
          sortBy: sortField === 'contractDate' ? 'contract_date' : sortField === 'contractValue' ? 'total_value' : 'contract_date',
          sortOrder: sortOrder || 'desc'
        });

        if (searchKeyword) params.append('search', searchKeyword);
        if (filters.referenceNo) params.append('referenceNo', filters.referenceNo);
        if (filters.state !== 'All States') params.append('state', filters.state);
        if (filters.departmentType !== 'All') params.append('departmentType', filters.departmentType);
        if (filters.department) params.append('department', filters.department);

        // Quantity Filter
        if (filters.qtyValue) {
          params.append('qtyValue', filters.qtyValue);
          params.append('qtyOperator', filters.qtyOperator);
        }

        // Value Filter
        if (filters.valueFrom || filters.valueTo) {
          if (filters.valueFrom) params.append('valueFrom', filters.valueFrom);
          if (filters.valueTo) params.append('valueTo', filters.valueTo);
          params.append('valueUnit', filters.valueUnit);
          params.append('valueOperator', filters.valueOperator);
        }

        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL}/contracts?${params}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        const data = await response.json();

        if (data.success) {
          // Map API response to component format
          const mappedContracts = data.data.map(contract => ({
            id: contract.id,
            contractNo: contract.contract_no || 'N/A',
            contractDate: contract.contract_date || 'N/A',
            hospitalName: contract.organization_name || 'N/A',
            hospitalState: contract.state || 'N/A',
            seller_name: contract.seller_name || 'N/A',  // Seller Name from database
            merilDB: contract.is_meril_db || 'No', // Meril DB check
            sellerState: contract.state || 'N/A',  // Seller State → state
            category: contract.category_name || 'N/A',
            product: contract.product || 'N/A',
            brand: contract.brand || 'N/A',
            merilOthers: (contract.brand && contract.brand.toLowerCase().includes('meril')) ? 'MERIL' : 'OTHERS',
            companyName: contract.brand || 'N/A',  // Company Name → brand
            model: contract.model || 'N/A',
            decode: contract.product || 'N/A',  // Decode → product
            orderedQty: parseInt(contract.ordered_quantity) || 0,
            unitPrice: parseFloat(contract.price) || 0,
            contractValue: parseFloat(contract.total_value?.replace(/,/g, '')) || 0,
            department: contract.buyer_department || 'N/A',
            status: contract.order_status || 'N/A',
            buyerDeptOrg: contract.buyer_dept_org || 'N/A',
            buyerDesignation: contract.buyer_designation || 'N/A',
            officeZone: contract.office_zone || 'N/A',
            buyingMode: contract.buying_mode || 'N/A',
            downloadLink: contract.download_link || ''
          }));

          setContracts(mappedContracts);
          setTotalPages(data.totalPages || 1);
        } else {
          setError(data.message || 'Failed to fetch contracts');
        }
      } catch (err) {
        console.error('Error fetching contracts:', err);
        setError('Failed to fetch contracts');
      } finally {
        setLoading(false);
      }
    };

    fetchContracts();
  }, [currentPage, rowsPerPage, sortBy, searchKeyword, filters.referenceNo, filters.state, filters.departmentType, filters.department, filters.qtyValue, filters.qtyOperator, filters.valueFrom, filters.valueTo, filters.valueUnit, filters.valueOperator]);

  // Handle checkbox selection
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedContracts(contracts.map(c => c.id));
    } else {
      setSelectedContracts([]);
    }
  };

  const handleSelectContract = (id) => {
    setSelectedContracts(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  // Since filtering and pagination are now handled by backend,
  // we just use the contracts directly
  const filteredContracts = contracts;
  const sortedContracts = contracts;
  const paginatedContracts = contracts;

  const handleSearch = () => {
    setCurrentPage(1);
    console.log('Filters applied:', filters);
  };

  const handleClearFilters = () => {
    setFilters({
      referenceNo: '',
      state: 'All States',
      departmentType: 'All',
      department: '',
      assignBy: 'All',
      assignTo: 'All',
      mailType: 'All',
      qtyOperator: '>=',
      qtyValue: '',
      valueOperator: '>=',
      valueFrom: '',
      valueTo: '',
      valueUnit: 'Lakh'
    });
    setSearchKeyword('');
    setCurrentPage(1);
  };

  const handleExportToExcel = () => {
    console.log('Exporting to Excel:', paginatedContracts);
    // Generate CSV
    const headers = ['Month', 'Contract No', 'Contract Date', 'Zonal Head', 'Hospital Name',
      'Hospital State', 'Seller Name', 'Seller State', 'Category', 'Decode', 'MERIL/OTHERS',
      'Company Name', 'Ordered Qty', 'Unit Price', 'Contract Value'];
    const csv = [
      headers.join(','),
      ...paginatedContracts.map(c => [
        c.month, c.contractNo, c.contractDate, c.zonalHead, c.hospitalName, c.hospitalState,
        c.sellerName, c.sellerState, c.category, c.decode, c.merilOthers, c.companyName,
        c.orderedQty, c.unitPrice, c.contractValue
      ].join(','))
    ].join('\n');
    console.log(csv);
  };

  const handleView = (id) => console.log('View contract:', id);
  const handleEdit = (id) => console.log('Edit contract:', id);
  const handleCopy = (id) => console.log('Copy contract:', id);
  const handleDownload = (id) => console.log('Download contract:', id);

  return (
    <div className="gem-contracts-page">
      <div className="page-header">
        <h1>GeM Contracts</h1>
        <p>Manage and track all Government e-Marketplace contracts</p>
      </div>

      {/* Search and Filter Section */}
      <div className="search-filter-card">
        <div className="search-row">
          <input
            type="text"
            className="search-input"
            placeholder="Search by Contract No, Company Name, Category, Decode..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            aria-label="Search contracts"
          />
          <div className="search-actions">
            <button
              className="btn-toggle-filters"
              onClick={() => setShowFilters(!showFilters)}
              aria-label="Toggle filters"
            >
              {showFilters ? '▲' : '▼'} Filters
            </button>
            <button className="btn-export" onClick={handleExportToExcel}>
              Export to Excel
            </button>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {/* Advanced Filters Panel */}
        <div className={`filters-panel ${showFilters ? 'show' : ''}`}>

          <div className="filters-grid">
            <div className="filter-group">
              <label>Reference Number</label>
              <input
                type="text"
                value={filters.referenceNo}
                onChange={(e) => setFilters({ ...filters, referenceNo: e.target.value })}
              />
            </div>

            <div className="filter-group">
              <label>State</label>
              <select
                value={filters.state}
                onChange={(e) => setFilters({ ...filters, state: e.target.value })}
              >
                {STATES.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Department Type</label>
              <select
                value={filters.departmentType}
                onChange={(e) => setFilters({ ...filters, departmentType: e.target.value })}
              >
                <option value="All">All</option>
                <option value="Diagno">Diagno</option>
                <option value="Endo">Endo</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Department Name</label>
              <input
                type="text"
                value={filters.department}
                onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              />
            </div>

            <div className="filter-group">
              <label>Quantity</label>
              <div className="filter-compound">
                <select
                  value={filters.qtyOperator}
                  onChange={(e) => setFilters({ ...filters, qtyOperator: e.target.value })}
                >
                  <option value=">=">&gt;=</option>
                  <option value="<=">&lt;=</option>
                  <option value="=">=</option>
                </select>
                <input
                  type="number"
                  placeholder="Value"
                  value={filters.qtyValue}
                  onChange={(e) => setFilters({ ...filters, qtyValue: e.target.value })}
                />
              </div>
            </div>

            <div className="filter-group">
              <label>Tender Value</label>
              <div className="filter-compound">
                <select
                  value={filters.valueOperator}
                  onChange={(e) => setFilters({ ...filters, valueOperator: e.target.value })}
                >
                  <option value=">=">&gt;=</option>
                  <option value="<=">&lt;=</option>
                  <option value="=">=</option>
                </select>
                <input
                  type="number"
                  placeholder="From"
                  value={filters.valueFrom}
                  onChange={(e) => setFilters({ ...filters, valueFrom: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="To"
                  value={filters.valueTo}
                  onChange={(e) => setFilters({ ...filters, valueTo: e.target.value })}
                />
                <select
                  value={filters.valueUnit}
                  onChange={(e) => setFilters({ ...filters, valueUnit: e.target.value })}
                >
                  <option value="Lakh">Lakh</option>
                  <option value="Crore">Crore</option>
                </select>
              </div>
            </div>
          </div>

          <div className="filter-actions">
            <button className="btn-search" onClick={handleSearch}>Search</button>
            <button className="btn-clear" onClick={handleClearFilters}>Clear Filters</button>
          </div>

        </div>

      </div>

      {/* Table Controls */}
      <div className="table-controls">
        <div className="table-controls-left">
          <label htmlFor="rowsPerPage">Show</label>
          <select
            id="rowsPerPage"
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span>rows</span>
        </div>
        <div className="table-controls-right">
          <label htmlFor="sortBy">Sort by:</label>
          <select
            id="sortBy"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="contractDate-desc">Contract Date (Newest)</option>
            <option value="contractDate-asc">Contract Date (Oldest)</option>
            <option value="contractValue-desc">Contract Value (High to Low)</option>
            <option value="contractValue-asc">Contract Value (Low to High)</option>
          </select>
        </div>
      </div>

      {/* Contracts Table */}
      <div className="table-wrapper">
        <table className="contracts-table" aria-label="GeM Contracts table">
          <thead>
            <tr>
              <th scope="col">
                <input
                  type="checkbox"
                  checked={selectedContracts.length === paginatedContracts.length && paginatedContracts.length > 0}
                  onChange={handleSelectAll}
                  aria-label="Select all contracts"
                />
              </th>
              <th scope="col">S No</th>
              <th scope="col">Contract No</th>
              <th scope="col">Bid/Direct</th>
              <th scope="col">Contract Date</th>
              <th scope="col">Zonal Head</th>
              <th scope="col">Hospital Name</th>
              <th scope="col">Hospital State</th>
              <th scope="col">Seller Name</th>
              <th scope="col">Meril DB</th>
              <th scope="col">Seller State</th>
              <th scope="col">Category</th>
              <th scope="col">Decode</th>
              <th scope="col">MERIL/OTHERS</th>
              <th scope="col">Company Name</th>
              <th scope="col">Qty (Pcs)</th>
              <th scope="col">Unit Price</th>
              <th scope="col">Contract Value</th>
            </tr>
          </thead>
          <tbody>
            {paginatedContracts.map((contract, index) => (
              <tr key={contract.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedContracts.includes(contract.id)}
                    onChange={() => handleSelectContract(contract.id)}
                    aria-label={`Select contract ${contract.contractNo}`}
                  />
                </td>
                <td>{(currentPage - 1) * rowsPerPage + index + 1}</td>
                <td>{contract.contractNo}</td>
                <td>{contract.buyingMode}</td>
                <td>{contract.contractDate}</td>
                <td>{contract.zonalHead}</td>
                <td>{contract.hospitalName}</td>
                <td>{contract.hospitalState}</td>
                <td>{contract.seller_name}</td>
                <td>{contract.merilDB}</td>
                <td>{contract.sellerState}</td>
                <td>{contract.category}</td>
                <td>{contract.decode}</td>
                <td>{contract.merilOthers}</td>
                <td>{contract.companyName}</td>
                <td>{contract.orderedQty}</td>
                <td>₹{contract.unitPrice.toLocaleString()}</td>
                <td>₹{contract.contractValue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <div className="pagination-info">
          Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, sortedContracts.length)} of {sortedContracts.length} entries
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
export default GEMContracts;
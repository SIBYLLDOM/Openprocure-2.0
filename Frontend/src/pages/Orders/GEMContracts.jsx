// src/pages/Orders/GEMContracts.jsx
// Route: /orders/gem-contracts

import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import '../../assets/css/GEMContracts.css';
import SearchableSelect from '../../components/common/SearchableSelect';

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
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollSentinelRef = React.useRef(null);
  const [categoryOptions, setCategoryOptions] = useState([]);

  // Search and filter states
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({
    state: 'All States',
    departmentType: 'All',
    category: '',
    assignBy: 'All',
    assignTo: 'All',
    mailType: 'All',
    contractDateFrom: '',
    contractDateTo: ''
  });

  // Load distinct category names for the Category filter dropdown — scoped to
  // the selected Department Type, so Endo only lists Endo categories and vice versa
  React.useEffect(() => {
    const fetchCategories = async () => {
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams();
        if (filters.departmentType !== 'All') params.append('departmentType', filters.departmentType);
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/contracts/meta/categories?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) setCategoryOptions(data.data);
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCategories();
  }, [filters.departmentType]);

  // Selected category no longer belongs to the newly chosen department — clear it
  React.useEffect(() => {
    if (filters.category && categoryOptions.length && !categoryOptions.includes(filters.category)) {
      setFilters(f => ({ ...f, category: '' }));
    }
  }, [categoryOptions]);

  // Debounce search input so we don't hit the API on every keystroke
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchKeyword);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // Builds the query params shared by the paginated fetch and the export
  const buildFilterParams = (extra = {}) => {
    const [sortField, sortOrder] = sortBy.split('-');
    const params = new URLSearchParams({
      sortBy: sortField === 'contractDate' ? 'contract_date' : sortField === 'contractValue' ? 'total_value' : 'contract_date',
      sortOrder: sortOrder || 'desc',
      ...extra
    });

    if (debouncedSearch) params.append('search', debouncedSearch);
    if (filters.state !== 'All States') params.append('state', filters.state);
    if (filters.departmentType !== 'All') params.append('departmentType', filters.departmentType);
    if (filters.category) params.append('category', filters.category);
    if (filters.contractDateFrom) params.append('contractDateFrom', filters.contractDateFrom);
    if (filters.contractDateTo) params.append('contractDateTo', filters.contractDateTo);

    return params;
  };

  // Maps a raw API contract row to the component's shape
  const mapContract = (contract) => ({
    id: contract.id,
    contractNo: contract.contract_no || 'N/A',
    contractDate: contract.contract_date || 'N/A',
    zonalHead: contract.zonal_head || 'N/A',
    hospitalName: contract.hospital_name || contract.organization_name || 'N/A',
    hospitalState: contract.hospital_state || 'N/A',
    seller_name: contract.seller_name || 'N/A',  // Seller Name from database
    merilDB: contract.meril_db || contract.is_meril_db || 'No', // Meril DB check
    sellerState: contract.seller_state || 'N/A',
    category: contract.category_name || 'N/A',
    product: contract.product || 'N/A',
    brand: contract.brand || 'N/A',
    merilOthers: contract.meril_or_others
      || ((contract.brand && contract.brand.toLowerCase().includes('meril')) ? 'MERIL' : 'OTHERS'),
    companyName: contract.company_name || contract.brand || 'N/A',
    model: contract.model || 'N/A',
    decode: contract.decode_code || contract.product || 'N/A',
    orderedQty: parseInt(contract.ordered_quantity) || 0,
    unitPrice: parseFloat(contract.unit_price ?? contract.price) || 0,
    contractValue: parseFloat(String(contract.total_value ?? '').replace(/,/g, '')) || 0,
    department: contract.buyer_department || 'N/A',
    status: contract.order_status || 'N/A',
    buyerDeptOrg: contract.buyer_dept_org || 'N/A',
    buyerDesignation: contract.buyer_designation || 'N/A',
    officeZone: contract.office_zone || 'N/A',
    buyingMode: contract.buying_mode || 'N/A',
    downloadLink: contract.download_link || '',
    pdfLink: contract.pdf_link || ''
  });

  // Fetches one page and either replaces the list (a fresh filter/sort/search)
  // or appends it (infinite scroll asked for another batch).
  const fetchContractsPage = async (page, { append } = {}) => {
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      const params = buildFilterParams({ page, limit: rowsPerPage });

      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/contracts?${params}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      const data = await response.json();

      if (data.success) {
        setContracts(prev => append ? [...prev, ...data.data.map(mapContract)] : data.data.map(mapContract));
        setTotalPages(data.totalPages || 1);
        setTotalRecords(data.total || 0);
        setTotalValue(data.totalValue || 0);
        setCurrentPage(page);
      } else {
        setError(data.message || 'Failed to fetch contracts');
      }
    } catch (err) {
      console.error('Error fetching contracts:', err);
      setError('Failed to fetch contracts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Any filter/sort/search/page-size change starts over from page 1 and
  // replaces the list — infinite scroll only appends on top of that.
  React.useEffect(() => {
    fetchContractsPage(1, { append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsPerPage, sortBy, debouncedSearch, filters.state, filters.departmentType, filters.category, filters.contractDateFrom, filters.contractDateTo]);

  // Infinite scroll: load the next page once the sentinel below the table
  // comes into view, as long as there's more and nothing is already loading.
  React.useEffect(() => {
    const el = scrollSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && !loadingMore && currentPage < totalPages) {
        fetchContractsPage(currentPage + 1, { append: true });
      }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, totalPages, loading, loadingMore, rowsPerPage, sortBy, debouncedSearch, filters.state, filters.departmentType, filters.category, filters.contractDateFrom, filters.contractDateTo]);

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
      state: 'All States',
      departmentType: 'All',
      category: '',
      assignBy: 'All',
      assignTo: 'All',
      mailType: 'All',
      contractDateFrom: '',
      contractDateTo: ''
    });
    setSearchKeyword('');
    setCurrentPage(1);
  };

  const handleExportToExcel = async () => {
    setIsExporting(true);
    try {
      const token = localStorage.getItem('token');
      const params = buildFilterParams({ page: 1, limit: 100000 });

      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/contracts?${params}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch contracts for export');
      }

      const rows = data.data.map(mapContract).map(c => ({
        'Contract No': c.contractNo,
        'Bid/Direct': c.buyingMode,
        'Status': c.status,
        'Contract Date': c.contractDate,
        'Zonal Head': c.zonalHead,
        'Hospital Name': c.hospitalName,
        'Hospital State': c.hospitalState,
        'Seller Name': c.seller_name,
        'Meril DB': c.merilDB,
        'Seller State': c.sellerState,
        'Category': c.category,
        'Decode': c.decode,
        'MERIL/OTHERS': c.merilOthers,
        'Company Name': c.companyName,
        'Qty (Pcs)': c.orderedQty,
        'Unit Price': c.unitPrice,
        'Contract Value': c.contractValue,
        'PDF Link': c.pdfLink
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'GeM Contracts');

      const filterTag = activeFilterCount > 0 ? 'Filtered' : 'All';
      const dateTag = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `GeM-Contracts-${filterTag}-${dateTag}.xlsx`);
    } catch (err) {
      console.error('Error exporting contracts:', err);
      setError('Failed to export contracts to Excel');
    } finally {
      setIsExporting(false);
    }
  };

  // Compact Indian numbering (Lakh/Crore) — a summed total across many
  // contracts is routinely in the crores, where a plain comma-grouped number
  // is hard to read at a glance.
  const formatCompactINR = (value) => {
    const n = Number(value) || 0;
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
  };

  const handleView = (id) => console.log('View contract:', id);
  const handleEdit = (id) => console.log('Edit contract:', id);
  const handleCopy = (id) => console.log('Copy contract:', id);
  const handleDownload = (id) => console.log('Download contract:', id);

  const statusSlug = (status) =>
    String(status || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'unknown';

  const activeFilterCount = [
    filters.state !== 'All States' ? filters.state : '',
    filters.departmentType !== 'All' ? filters.departmentType : '',
    filters.department,
    filters.contractDateFrom,
    filters.contractDateTo,
  ].filter(Boolean).length;

  return (
    <div className="gem-contracts-page">
      <div className="page-header">
        <div>
          <h1>GeM Contracts</h1>
          <p>Manage and track all Government e-Marketplace contracts</p>
        </div>
        <div className="page-header-stats">
          <div className="header-stat">
            <span className="header-stat-value">{totalRecords.toLocaleString()}</span>
            <span className="header-stat-label">Total Contracts</span>
          </div>
          <div className="header-stat">
            <span className="header-stat-value">{formatCompactINR(totalValue)}</span>
            <span className="header-stat-label">Total Contract Value</span>
          </div>
          <div className="header-stat">
            <span className="header-stat-value">{selectedContracts.length}</span>
            <span className="header-stat-label">Selected</span>
          </div>
        </div>
      </div>

      {/* Search and Filter Section */}
      <div className="search-filter-card">
        <div className="search-row">
          <div className="search-input-wrap">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search by Contract No, Company Name, Category, Decode..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              aria-label="Search contracts"
            />
            {searchKeyword && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearchKeyword('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <div className="search-actions">
            <button
              className={`btn-toggle-filters ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              aria-label="Toggle filters"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Filters
              {activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}
              <span className={`chevron ${showFilters ? 'open' : ''}`}>▾</span>
            </button>
            <button className="btn-export" onClick={handleExportToExcel} disabled={isExporting}>
              {isExporting ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {isExporting ? 'Exporting…' : 'Export to Excel'}
            </button>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        <div className={`filters-panel ${showFilters ? 'show' : ''}`}>

          <div className="filters-row">
            <div className="filter-group">
              <label>State</label>
              <SearchableSelect
                label="State"
                value={filters.state}
                onChange={(val) => setFilters({ ...filters, state: val || 'All States' })}
                options={STATES}
                placeholder="All States"
                searchPlaceholder="Search states..."
              />
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
              <label>Category</label>
              <SearchableSelect
                label="Category"
                value={filters.category}
                onChange={(val) => setFilters({ ...filters, category: val })}
                options={categoryOptions}
                placeholder="All Categories"
                searchPlaceholder="Search categories..."
                emptyLabel="No matching categories"
              />
            </div>

            <div className="filter-group">
              <label>Contract Date</label>
              <div className="filter-compound">
                <input
                  type="date"
                  placeholder="From"
                  value={filters.contractDateFrom}
                  onChange={(e) => setFilters({ ...filters, contractDateFrom: e.target.value })}
                />
                <input
                  type="date"
                  placeholder="To"
                  value={filters.contractDateTo}
                  onChange={(e) => setFilters({ ...filters, contractDateTo: e.target.value })}
                />
              </div>
            </div>

            <div className="filter-actions">
              <button className="btn-search" onClick={handleSearch}>Search</button>
              <button className="btn-clear" onClick={handleClearFilters}>Clear Filters</button>
            </div>
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
              <th scope="col">Status</th>
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
              <th scope="col" className="col-num">Qty (Pcs)</th>
              <th scope="col" className="col-num">Unit Price</th>
              <th scope="col" className="col-num">Contract Value</th>
              <th scope="col">Download</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={20} className="table-status-cell">
                  <span className="spinner" aria-hidden="true" /> Loading contracts…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={20} className="table-status-cell table-status-error">{error}</td>
              </tr>
            )}
            {!loading && !error && paginatedContracts.length === 0 && (
              <tr>
                <td colSpan={20} className="table-status-cell">No contracts found for the current filters</td>
              </tr>
            )}
            {!loading && !error && paginatedContracts.map((contract, index) => (
              <tr key={contract.id} className={selectedContracts.includes(contract.id) ? 'row-selected' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedContracts.includes(contract.id)}
                    onChange={() => handleSelectContract(contract.id)}
                    aria-label={`Select contract ${contract.contractNo}`}
                  />
                </td>
                <td className="col-muted">{index + 1}</td>
                <td className="col-mono">{contract.contractNo}</td>
                <td>
                  <span className={`tag tag-mode-${statusSlug(contract.buyingMode)}`}>{contract.buyingMode}</span>
                </td>
                <td>
                  <span className={`status-badge status-${statusSlug(contract.status)}`}>{contract.status}</span>
                </td>
                <td className="col-muted">{contract.contractDate}</td>
                <td>{contract.zonalHead}</td>
                <td>{contract.hospitalName}</td>
                <td>{contract.hospitalState}</td>
                <td>{contract.seller_name}</td>
                <td>
                  <span className={`tag tag-${contract.merilDB === 'Yes' ? 'yes' : 'no'}`}>{contract.merilDB}</span>
                </td>
                <td>{contract.sellerState}</td>
                <td>{contract.category}</td>
                <td>{contract.decode}</td>
                <td>
                  <span className={`tag tag-${contract.merilOthers === 'MERIL' ? 'meril' : 'others'}`}>{contract.merilOthers}</span>
                </td>
                <td>{contract.companyName}</td>
                <td className="col-num">{contract.orderedQty.toLocaleString()}</td>
                <td className="col-num">₹{contract.unitPrice.toLocaleString()}</td>
                <td className="col-num col-emphasis">₹{contract.contractValue.toLocaleString()}</td>
                <td>
                  {contract.pdfLink ? (
                    <a
                      href={contract.pdfLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-download"
                      aria-label={`Download contract file for ${contract.contractNo}`}
                    >
                      Download
                    </a>
                  ) : (
                    <span className="col-muted">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Infinite scroll: loads the next batch automatically as this comes into view */}
      <div className="pagination">
        <div className="pagination-info">
          {totalRecords === 0
            ? 'No entries found'
            : `Showing ${contracts.length} of ${totalRecords} entries`}
        </div>
      </div>
      <div ref={scrollSentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0' }}>
        {loadingMore && (
          <span className="spinner" aria-hidden="true" />
        )}
        {!loadingMore && currentPage >= totalPages && contracts.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--muted, #6b7280)' }}>All contracts loaded</span>
        )}
      </div>
    </div>
  );
};
export default GEMContracts;
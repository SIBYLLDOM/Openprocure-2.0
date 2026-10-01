// src/pages/Dealers/Distributors.jsx
// Route: /dealers/distributors

import { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import '../../assets/css/Distributors.css';
import API_BASE_URL from '../../config/api';

// ─── Meril DB Certificate HTML ────────────────────────────────────────────────
const buildCertificateHtml = (dealer) => {
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const refNo = `MERIL/CERT/${String(dealer.id).padStart(4, '0')}/${today.getFullYear()}`;
  const location = [dealer.cityName, dealer.state].filter(Boolean).join(', ');
  const regDate = dealer.registrationDate
    ? new Date(dealer.registrationDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  return `
    <div style="text-align:right;margin-bottom:18px;font-size:10.5pt;">
      <strong>Ref No:</strong> ${refNo}<br />
      <strong>Date:</strong> ${formattedDate}
    </div>

    <h3 style="text-align:center;text-decoration:underline;font-size:13pt;margin-bottom:24px;">
      TO WHOM IT MAY CONCERN
    </h3>

    <p style="font-size:11pt;line-height:1.8;">
      This is to certify that <strong>M/s ${dealer.companyName}</strong>,
      ${location ? `located at ${location},` : ''} is an authorized Dealer / Distributor of
      <strong>Meril Diagnostics Pvt. Ltd.</strong> for the sale, supply and service of Meril
      branded diagnostic products and instruments.
    </p>

    <p style="font-size:11pt;line-height:1.8;">
      The said dealer is duly registered with us and has been associated with Meril Diagnostics
      Pvt. Ltd. since <strong>${regDate}</strong>. They are authorized to represent our products
      before Government departments, hospitals, institutions, and tender inviting authorities.
    </p>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:10.5pt;">
      <tbody>
        <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6;border:1px solid #d1d5db;width:36%;">Authorized Dealer / Distributor</th><td style="padding:8px 12px;border:1px solid #d1d5db;">${dealer.companyName || '—'}</td></tr>
        <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6;border:1px solid #d1d5db;">Contact Person</th><td style="padding:8px 12px;border:1px solid #d1d5db;">${dealer.personName || '—'}</td></tr>
        <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6;border:1px solid #d1d5db;">Contact Number</th><td style="padding:8px 12px;border:1px solid #d1d5db;">${dealer.contactNo || '—'}</td></tr>
        <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6;border:1px solid #d1d5db;">Email ID</th><td style="padding:8px 12px;border:1px solid #d1d5db;">${dealer.email || '—'}</td></tr>
        <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6;border:1px solid #d1d5db;">City / State</th><td style="padding:8px 12px;border:1px solid #d1d5db;">${location || '—'}</td></tr>
        <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6;border:1px solid #d1d5db;">Registration Date</th><td style="padding:8px 12px;border:1px solid #d1d5db;">${regDate}</td></tr>
        <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6;border:1px solid #d1d5db;">Status</th><td style="padding:8px 12px;border:1px solid #d1d5db;">${dealer.status || 'Active'}</td></tr>
      </tbody>
    </table>

    <p style="font-size:11pt;line-height:1.8;">
      This certificate is issued on request of the dealer for submission to Government / institutional
      tender authorities as proof of authorized dealership. It is valid for the current financial year
      unless revoked in writing by Meril Diagnostics Pvt. Ltd.
    </p>

    <p style="margin-top:24px;font-size:11pt;">Thanking you,</p>
    <p style="font-weight:700;margin-top:18px;font-size:11pt;">Authorised Signatory</p>
    <p style="font-size:11pt;">Meril Diagnostics Pvt. Ltd.</p>
  `;
};

const formatDate = (d) => (d ? String(d).slice(0, 10) : '');

const emptyForm = {
  companyName: '', personName: '', contactNo: '', email: '',
  cityName: '', state: '', registrationDate: '', status: 'Active'
};

const Distributors = () => {
  const [allDistributors, setAllDistributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const token = localStorage.getItem('token');
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const fetchDistributors = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`${API_BASE_URL}/distributors`, {
        headers: authHeaders
      });
      const json = await res.json();
      if (json.success) {
        setAllDistributors(json.data);
      } else {
        setLoadError(json.message || 'Failed to load distributors');
      }
    } catch {
      setLoadError('Failed to load distributors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDistributors();
  }, []);

  // View / Edit / Delete state
  const [viewRow, setViewRow] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  // Manual Add state
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const openAdd = () => {
    setAddForm(emptyForm);
    setAddError('');
    setAddOpen(true);
  };

  const handleAddDealer = async () => {
    const required = ['companyName', 'personName', 'contactNo', 'email', 'cityName', 'state', 'registrationDate'];
    if (required.some((field) => !addForm[field].trim())) {
      setAddError('Please fill in all fields.');
      return;
    }
    setAddSaving(true);
    setAddError('');
    try {
      const res = await fetch(`${API_BASE_URL}/distributors`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(addForm)
      });
      const json = await res.json();
      if (json.success) {
        setAddOpen(false);
        fetchDistributors();
      } else {
        setAddError(json.message || 'Failed to add dealer');
      }
    } catch {
      setAddError('Failed to add dealer');
    } finally {
      setAddSaving(false);
    }
  };

  // Certificate state
  const [certDealer, setCertDealer] = useState(null);
  const [certDownloading, setCertDownloading] = useState(false);
  const certBodyRef = useRef(null);

  const openEdit = (distributor) => {
    setEditRow(distributor);
    setEditForm({
      companyName: distributor.companyName || '',
      personName: distributor.personName || '',
      contactNo: distributor.contactNo || '',
      email: distributor.email || '',
      cityName: distributor.cityName || '',
      state: distributor.state || '',
      registrationDate: formatDate(distributor.registrationDate),
      status: distributor.status || 'Active'
    });
    setSaveError('');
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`${API_BASE_URL}/distributors/${editRow.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(editForm)
      });
      const json = await res.json();
      if (json.success) {
        setEditRow(null);
        fetchDistributors();
      } else {
        setSaveError(json.message || 'Failed to update distributor');
      }
    } catch {
      setSaveError('Failed to update distributor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (distributor) => {
    if (!window.confirm(`Delete "${distributor.companyName}"? This cannot be undone.`)) return;
    setDeletingId(distributor.id);
    try {
      const res = await fetch(`${API_BASE_URL}/distributors/${distributor.id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      const json = await res.json();
      if (json.success) {
        setAllDistributors(prev => prev.filter(d => d.id !== distributor.id));
      } else {
        alert(json.message || 'Failed to delete distributor');
      }
    } catch {
      alert('Failed to delete distributor');
    } finally {
      setDeletingId(null);
    }
  };

  // Certificate download handler
  const handleDownloadCertificate = async () => {
    if (!certDealer || !certBodyRef.current) return;
    setCertDownloading(true);
    try {
      const token = localStorage.getItem('token');
      const title = `Meril_Certificate_${certDealer.companyName.replace(/[^\w-]/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
      const res = await fetch(`${API_BASE_URL}/doc-prep/export-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, html_content: certBodyRef.current.innerHTML })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to generate certificate: ' + err.message);
    } finally {
      setCertDownloading(false);
    }
  };

  const [quickSearch, setQuickSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortOrder, setSortOrder] = useState('asc');

  // Search and sort logic
  const filteredData = useMemo(() => {
    let data = [...allDistributors];

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

    data.sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.companyName.localeCompare(b.companyName);
      } else {
        return b.companyName.localeCompare(a.companyName);
      }
    });

    return data;
  }, [allDistributors, quickSearch, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handleExport = () => {
    const rows = filteredData.map((d, i) => ({
      '#': i + 1,
      'Company Name': d.companyName,
      'Person Name': d.personName,
      'Contact No': d.contactNo,
      'Email': d.email,
      'City': d.cityName,
      'State': d.state,
      'Registration Date': formatDate(d.registrationDate),
      'Status': d.status
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 4 }, { wch: 28 }, { wch: 20 }, { wch: 16 },
      { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Distributors');
    XLSX.writeFile(workbook, `distributors_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Maps flexible CSV header variants onto our field names
  const HEADER_MAP = {
    companyname: 'companyName',
    company: 'companyName',
    personname: 'personName',
    person: 'personName',
    contactno: 'contactNo',
    'contactno.': 'contactNo',
    contact: 'contactNo',
    emailid: 'email',
    email: 'email',
    cityname: 'cityName',
    city: 'cityName'
  };

  const normalizeHeader = (h) => String(h || '').trim().toLowerCase().replace(/\s+/g, '');

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setImportMsg('');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const rows = rawRows.map((raw) => {
        const mapped = {};
        Object.keys(raw).forEach((key) => {
          const field = HEADER_MAP[normalizeHeader(key)];
          if (field) mapped[field] = String(raw[key]).trim();
        });
        return mapped;
      }).filter((r) => r.companyName || r.personName || r.contactNo || r.email || r.cityName);

      if (!rows.length) {
        setImportMsg('No valid rows found in the file.');
        return;
      }

      const res = await fetch(`${API_BASE_URL}/distributors/import`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ rows })
      });
      const json = await res.json();
      if (json.success) {
        setImportMsg(`Imported ${json.imported} distributor(s)${json.skipped ? `, skipped ${json.skipped} invalid row(s)` : ''}.`);
        fetchDistributors();
      } else {
        setImportMsg(json.message || 'Import failed.');
      }
    } catch {
      setImportMsg('Failed to read/import the file.');
    } finally {
      setImporting(false);
    }
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
        </div>

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {importMsg && <span style={{ fontSize: 12, color: '#374151' }}>{importMsg}</span>}
            <button className="btn-export" onClick={openAdd}>
              ➕ Add Dealer
            </button>
            <label className="btn-export" style={{ margin: 0, cursor: importing ? 'default' : 'pointer', opacity: importing ? 0.6 : 1 }}>
              {importing ? 'Importing...' : '📥 Import CSV'}
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleImportFile}
                disabled={importing}
                style={{ display: 'none' }}
              />
            </label>
            <button className="btn-export" onClick={handleExport}>
              📊 Export to Excel
            </button>
          </div>
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
              {loading ? (
                <tr>
                  <td colSpan="7" className="no-data">Loading distributors...</td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan="7" className="no-data">{loadError}</td>
                </tr>
              ) : paginatedData.length > 0 ? (
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
                        onClick={() => setViewRow(distributor)}
                        aria-label={`View ${distributor.companyName}`}
                        title="View"
                      >
                        👁️
                      </button>
                      <button
                        className="action-btn edit"
                        onClick={() => openEdit(distributor)}
                        aria-label={`Edit ${distributor.companyName}`}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => handleDelete(distributor)}
                        disabled={deletingId === distributor.id}
                        aria-label={`Delete ${distributor.companyName}`}
                        title="Delete"
                      >
                        🗑️
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => setCertDealer(distributor)}
                        aria-label={`Generate certificate for ${distributor.companyName}`}
                        title="Generate Certificate"
                        style={{
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          borderRadius: 6,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        🏅 Certificate
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

      {/* View Modal */}
      {viewRow && (
        <div style={overlayStyle} onClick={() => setViewRow(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{viewRow.companyName}</h3>
              <button onClick={() => setViewRow(null)} style={closeBtnStyle}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
              <ViewField label="Person Name" value={viewRow.personName} />
              <ViewField label="Contact No" value={viewRow.contactNo} />
              <ViewField label="Email" value={viewRow.email} />
              <ViewField label="City" value={viewRow.cityName} />
              <ViewField label="State" value={viewRow.state} />
              <ViewField label="Registration Date" value={formatDate(viewRow.registrationDate)} />
              <ViewField label="Status" value={viewRow.status} />
            </div>
          </div>
        </div>
      )}

      {/* Add Dealer Modal */}
      {addOpen && (
        <div style={overlayStyle} onClick={() => setAddOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Add Dealer</h3>
              <button onClick={() => setAddOpen(false)} style={closeBtnStyle}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <EditField label="Company Name" value={addForm.companyName} onChange={(v) => setAddForm(f => ({ ...f, companyName: v }))} />
              <EditField label="Person Name" value={addForm.personName} onChange={(v) => setAddForm(f => ({ ...f, personName: v }))} />
              <EditField label="Contact No" value={addForm.contactNo} onChange={(v) => setAddForm(f => ({ ...f, contactNo: v }))} />
              <EditField label="Email" value={addForm.email} onChange={(v) => setAddForm(f => ({ ...f, email: v }))} />
              <EditField label="City" value={addForm.cityName} onChange={(v) => setAddForm(f => ({ ...f, cityName: v }))} />
              <EditField label="State" value={addForm.state} onChange={(v) => setAddForm(f => ({ ...f, state: v }))} />
              <EditField label="Registration Date" type="date" value={addForm.registrationDate} onChange={(v) => setAddForm(f => ({ ...f, registrationDate: v }))} />
              <div>
                <label style={fieldLabelStyle}>Status</label>
                <select
                  style={inputStyle}
                  value={addForm.status}
                  onChange={(e) => setAddForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            {addError && <p style={{ color: '#dc2626', fontSize: 12, margin: '12px 0 0' }}>{addError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setAddOpen(false)} style={cancelBtnStyle}>Cancel</button>
              <button onClick={handleAddDealer} disabled={addSaving} style={saveBtnStyle(addSaving)}>
                {addSaving ? 'Saving...' : 'Add Dealer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editRow && (
        <div style={overlayStyle} onClick={() => setEditRow(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Edit Distributor</h3>
              <button onClick={() => setEditRow(null)} style={closeBtnStyle}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <EditField label="Company Name" value={editForm.companyName} onChange={(v) => setEditForm(f => ({ ...f, companyName: v }))} />
              <EditField label="Person Name" value={editForm.personName} onChange={(v) => setEditForm(f => ({ ...f, personName: v }))} />
              <EditField label="Contact No" value={editForm.contactNo} onChange={(v) => setEditForm(f => ({ ...f, contactNo: v }))} />
              <EditField label="Email" value={editForm.email} onChange={(v) => setEditForm(f => ({ ...f, email: v }))} />
              <EditField label="City" value={editForm.cityName} onChange={(v) => setEditForm(f => ({ ...f, cityName: v }))} />
              <EditField label="State" value={editForm.state} onChange={(v) => setEditForm(f => ({ ...f, state: v }))} />
              <EditField label="Registration Date" type="date" value={editForm.registrationDate} onChange={(v) => setEditForm(f => ({ ...f, registrationDate: v }))} />
              <div>
                <label style={fieldLabelStyle}>Status</label>
                <select
                  style={inputStyle}
                  value={editForm.status}
                  onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            {saveError && <p style={{ color: '#dc2626', fontSize: 12, margin: '12px 0 0' }}>{saveError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setEditRow(null)} style={cancelBtnStyle}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving} style={saveBtnStyle(saving)}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Certificate Modal ─────────────────────────────────────────── */}
      {certDealer && (
        <div style={overlayStyle} onClick={() => setCertDealer(null)}>
          <div
            style={{ ...modalStyle, maxWidth: 780, width: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 24px', borderBottom: '1px solid #e5e7eb',
              background: '#084f9a', borderRadius: '12px 12px 0 0',
            }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>🏅 Meril DB Certificate</div>
                <div style={{ color: '#bfdbfe', fontSize: 12, marginTop: 2 }}>{certDealer.companyName}</div>
              </div>
              <button onClick={() => setCertDealer(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* Scrollable letter body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
              <div
                ref={certBodyRef}
                contentEditable
                suppressContentEditableWarning
                style={{
                  fontFamily: "'Times New Roman', Times, serif",
                  fontSize: '11pt', lineHeight: '1.7', color: '#1a1a1a', outline: 'none',
                }}
                dangerouslySetInnerHTML={{ __html: buildCertificateHtml(certDealer) }}
              />
            </div>

            {/* Footer actions */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              padding: '14px 24px', borderTop: '1px solid #e5e7eb', background: '#f9fafb',
              borderRadius: '0 0 12px 12px',
            }}>
              <button
                onClick={() => setCertDealer(null)}
                style={cancelBtnStyle}
              >
                Close
              </button>
              <button
                onClick={handleDownloadCertificate}
                disabled={certDownloading}
                style={{
                  padding: '9px 22px',
                  background: certDownloading ? '#9ca3af' : '#084f9a',
                  color: '#fff', border: 'none', borderRadius: 7,
                  cursor: certDownloading ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: certDownloading ? 'none' : '0 1px 4px rgba(8,79,154,0.3)',
                }}
              >
                {certDownloading ? '⏳ Generating…' : '⬇ Download PDF (Official Letterhead)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ViewField = ({ label, value }) => (
  <div>
    <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{label}</div>
    <div style={{ fontWeight: 500 }}>{value || '—'}</div>
  </div>
);

const EditField = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label style={fieldLabelStyle}>{label}</label>
    <input
      type={type}
      style={inputStyle}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
  display: 'flex', alignItems: 'center', justifyContent: 'center'
};
const modalStyle = {
  background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto'
};
const modalHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 };
const closeBtnStyle = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' };
const fieldLabelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' };
const cancelBtnStyle = { padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 13 };
const saveBtnStyle = (saving) => ({ padding: '8px 18px', background: saving ? '#d1d5db' : '#084f9a', color: '#fff', border: 'none', borderRadius: 7, cursor: saving ? 'default' : 'pointer', fontSize: 13, fontWeight: 600 });

export default Distributors;
import React, { useState, useMemo } from "react";
import "../../assets/css/OEMs.css";

const OEMs = () => {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");

  const [oemList, setOemList] = useState([]);

  const [formData, setFormData] = useState({
    tenderId: "",
    tenderNo: "",
    departmentName: "",
    dealerName: "",
    authorizationDate: "",
    reminderDate: "",
    authLetterBrief: "",
    followupRemarks: "",
    departmentAddress: "",
    followupDate: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = () => {
    setOemList([...oemList, formData]);
    setShowModal(false);
    setFormData({
      tenderId: "",
      tenderNo: "",
      departmentName: "",
      dealerName: "",
      authorizationDate: "",
      reminderDate: "",
      authLetterBrief: "",
      followupRemarks: "",
      departmentAddress: "",
      followupDate: "",
    });
  };

  /* ================= SEARCH ================= */
  const filteredOEMs = useMemo(() => {
    if (!search.trim()) return oemList;

    const keyword = search.toLowerCase();
    return oemList.filter(
      (item) =>
        item.tenderId.toLowerCase().includes(keyword) ||
        item.dealerName.toLowerCase().includes(keyword) ||
        item.departmentName.toLowerCase().includes(keyword)
    );
  }, [search, oemList]);

  /* ================= EXPORT ================= */
  const exportToExcel = () => {
    if (filteredOEMs.length === 0) return;

    const headers = [
      "Tender ID",
      "Tender No",
      "Dealer Name",
      "Department Name",
      "Authorization Date",
      "Followup Date",
    ];

    const rows = filteredOEMs.map((item) => [
      item.tenderId,
      item.tenderNo,
      item.dealerName,
      item.departmentName,
      item.authorizationDate,
      item.followupDate,
    ]);

    const csvContent =
      [headers, ...rows].map((row) => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "OEM_List.csv";
    a.click();

    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="oem-page">
      {/* Header */}
      <div className="oem-header">
        <h2>OEM</h2>
        <div className="oem-header-right">
          <span className="org-name">Meril Endo ▾</span>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Create OEM
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card search-card">
        <div className="search-bar">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span>▾</span>
        </div>
      </div>

      {/* Export */}
      <div className="export-row">
        <button
          className={`btn-export ${filteredOEMs.length === 0 ? "disabled" : ""}`}
          onClick={exportToExcel}
          disabled={filteredOEMs.length === 0}
        >
          ⬇ Export To Excel
        </button>
      </div>

      {/* Table */}
      <div className="card table-card">
        <table className="oem-table">
          <thead>
            <tr>
              <th>#</th>
              <th>TENDER ID</th>
              <th>DEALER NAME</th>
              <th>AUTHORIZATION DATE</th>
              <th>FOLLOWUP DATE</th>
              <th>DEPARTMENT NAME</th>
              <th>STATUS</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filteredOEMs.length === 0 ? (
              <tr>
                <td colSpan="8" className="no-data">
                  No data found
                </td>
              </tr>
            ) : (
              filteredOEMs.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{item.tenderId}</td>
                  <td>{item.dealerName}</td>
                  <td>{item.authorizationDate}</td>
                  <td>{item.followupDate}</td>
                  <td>{item.departmentName}</td>
                  <td>Active</td>
                  <td>—</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ================= MODAL ================= */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Create OEM</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <Input label="Tender Id*" name="tenderId" value={formData.tenderId} onChange={handleChange} />
                <Input label="Tender No*" name="tenderNo" value={formData.tenderNo} onChange={handleChange} />
                <Input label="Department Name*" name="departmentName" value={formData.departmentName} onChange={handleChange} />
                <Input label="Dealer Name*" name="dealerName" value={formData.dealerName} onChange={handleChange} />
                <DateInput label="Authorization Date*" name="authorizationDate" value={formData.authorizationDate} onChange={handleChange} />
                <DateInput label="Reminder Date*" name="reminderDate" value={formData.reminderDate} onChange={handleChange} />
                <Textarea label="Authorization Letter Brief" name="authLetterBrief" value={formData.authLetterBrief} onChange={handleChange} />
                <Textarea label="Followup Remarks" name="followupRemarks" value={formData.followupRemarks} onChange={handleChange} />
                <Textarea label="Department Address" name="departmentAddress" value={formData.departmentAddress} onChange={handleChange} />
                <DateInput label="Followup Date*" name="followupDate" value={formData.followupDate} onChange={handleChange} />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={handleSubmit}>Submit</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ===== Reusable Inputs ===== */
const Input = ({ label, ...props }) => (
  <div className="form-group">
    <label>{label}</label>
    <input type="text" {...props} />
  </div>
);

const DateInput = ({ label, ...props }) => (
  <div className="form-group">
    <label>{label}</label>
    <input type="date" {...props} />
  </div>
);

const Textarea = ({ label, ...props }) => (
  <div className="form-group">
    <label>{label}</label>
    <textarea {...props}></textarea>
  </div>
);

export default OEMs;

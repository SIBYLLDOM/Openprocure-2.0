import React, { useState } from "react";
import "../../assets/css/CompetitorAnalysis.css";


const DUMMY_DATA = [
  {
    name: "Gobind Industries Private Limited",
    participated: 1921,
    awarded: 0,
    lost: 0,
    tba: 1921,
    state: "Delhi",
    category: "Cardiology",
    ownership: "Private",
    date: "2023-06-12",
  },
  {
    name: "Ojha Production",
    participated: 1467,
    awarded: 0,
    lost: 0,
    tba: 1467,
    state: "Maharashtra",
    category: "Orthopedics",
    ownership: "Private",
    date: "2023-04-20",
  },
  {
    name: "Indicon Agro Industries LLP",
    participated: 1455,
    awarded: 0,
    lost: 0,
    tba: 1455,
    state: "Tamil Nadu",
    category: "Cardiology",
    ownership: "Government",
    date: "2023-02-10",
  },
];

const CompetitorAnalysis = () => {
  const [search, setSearch] = useState("");
  const [shortlisted, setShortlisted] = useState([]);

  // ✅ NEW FILTER STATES (ADDED)
  const [filters, setFilters] = useState({
    state: "",
    category: "",
    ownership: "",
    dateFrom: "",
    dateTo: "",
  });

  // ✅ UPDATED FILTER LOGIC (EXTENDED, NOT REPLACED)
  const filteredData = DUMMY_DATA.filter((item) => {
    if (!item.name.toLowerCase().includes(search.toLowerCase())) return false;

    if (filters.state && item.state !== filters.state) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.ownership && item.ownership !== filters.ownership) return false;

    if (filters.dateFrom && new Date(item.date) < new Date(filters.dateFrom))
      return false;
    if (filters.dateTo && new Date(item.date) > new Date(filters.dateTo))
      return false;

    return true;
  });

  const toggleShortlist = (company) => {
    setShortlisted((prev) =>
      prev.includes(company)
        ? prev.filter((c) => c !== company)
        : [...prev, company]
    );
  };

  return (
    <div className="competitor-page">
      {/* Header */}
      <div className="competitor-header">
        <h2>Competitor Analysis</h2>
        <input
          type="text"
          placeholder="Competitors Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="competitor-search"
        />
      </div>

      {/* ✅ ADDED: COMPETITORS SEARCH FILTER PANEL */}
      <div className="card">
        <div className="filter-grid">
          <select
            value={filters.state}
            onChange={(e) =>
              setFilters({ ...filters, state: e.target.value })
            }
          >
            <option value="">State</option>
            <option>Delhi</option>
            <option>Maharashtra</option>
            <option>Tamil Nadu</option>
          </select>

          <select
            value={filters.category}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value })
            }
          >
            <option value="">Category</option>
            <option>Cardiology</option>
            <option>Orthopedics</option>
          </select>

          <select
            value={filters.ownership}
            onChange={(e) =>
              setFilters({ ...filters, ownership: e.target.value })
            }
          >
            <option value="">Ownership</option>
            <option>Private</option>
            <option>Government</option>
          </select>

          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) =>
              setFilters({ ...filters, dateFrom: e.target.value })
            }
          />

          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) =>
              setFilters({ ...filters, dateTo: e.target.value })
            }
          />
        </div>

        <div className="filter-actions">
          <button
            className="btn-clear"
            onClick={() =>
              setFilters({
                state: "",
                category: "",
                ownership: "",
                dateFrom: "",
                dateTo: "",
              })
            }
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* ================= BIDDERS ================= */}
      <div className="card">
        <div className="card-title">Bidders (1.42 Lac)</div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Participated Tender</th>
                <th>Awarded Tender</th>
                <th>Lost Tender</th>
                <th>Result TBA</th>
                <th>Shortlist</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, index) => (
                <tr key={index}>
                  <td>{item.name}</td>
                  <td>{item.participated}</td>
                  <td>{item.awarded}</td>
                  <td>{item.lost}</td>
                  <td>{item.tba}</td>
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={shortlisted.includes(item.name)}
                      onChange={() => toggleShortlist(item.name)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= LOWER TABLES ================= */}
      <div className="two-column">
        {/* Competitor Companies */}
        <div className="card">
          <div className="card-title">
            Competitors (Of I-Sourcing)
          </div>

          <div className="table-wrapper">
            <table className="data-table small">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Participated</th>
                  <th>Awarded</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={index}>
                    <td>{item.name}</td>
                    <td>{item.participated}</td>
                    <td>{item.awarded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Shortlisted Companies */}
        <div className="card">
          <div className="card-title">
            Shortlisted Competitors ({shortlisted.length})
          </div>

          <div className="table-wrapper">
            <table className="data-table small">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Participated</th>
                  <th>Awarded</th>
                  <th>Lost</th>
                  <th>Result TBA</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {shortlisted.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="no-data">
                      No shortlisted competitors
                    </td>
                  </tr>
                ) : (
                  shortlisted.map((name, index) => {
                    const c = DUMMY_DATA.find(
                      (item) => item.name === name
                    );
                    return (
                      <tr key={index}>
                        <td>{c.name}</td>
                        <td>{c.participated}</td>
                        <td>{c.awarded}</td>
                        <td>{c.lost}</td>
                        <td>{c.tba}</td>
                        <td className="center">
                          <button
                            className="remove-btn"
                            onClick={() => toggleShortlist(name)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompetitorAnalysis;

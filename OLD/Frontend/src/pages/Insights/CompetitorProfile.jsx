import React, { useState, useRef, useEffect } from "react";
import { MapPin, Building2, Landmark, FileText, ExternalLink, ChevronDown, Search } from "lucide-react";
import '../../assets/css/CompetitorProfile.css';

const companies = [
  {
    name: "I-Sourcing Technologies Private Limited",
    participated: { count: 12, value: "₹ 46.57 Lac" },
    awarded: { count: 1, value: "₹ 44.84 K" },
    lost: { count: 5, value: "₹ 46.13 Lac" },
    tba: { count: 6, value: "₹ 0" },
    states: [
      { state: "Delhi", published: 16905, participated: 2, awarded: 1 },
      { state: "Maharashtra", published: 195894, participated: 2, awarded: 0 },
      { state: "West Bengal", published: 235299, participated: 2, awarded: 0 }
    ],
    ownership: {
      central: 7,
      corporation: 2,
      psu: 3,
      state: 1
    },
    departments: [
      { name: "Ministry of Defence", count: 4 },
      { name: "Central Ordnance Depot", count: 3 },
      { name: "Defence Canteen", count: 2 }
    ],
    monthlyData: [
      { month: "Sep '22", participated: 1000, awarded: 0 },
      { month: "Oct '22", participated: 0, awarded: 0 },
      { month: "Nov '22", participated: 0, awarded: 0 },
      { month: "Dec '22", participated: 1, awarded: 0 },
      { month: "Jan '23", participated: 0, awarded: 0 },
      { month: "Feb '23", participated: 0, awarded: 0 }
    ],
    resultStages: {
      technical: 46.7,
      financial: 33.3,
      aoc: 20
    },
    tenders: [
      { id: "241351", title: "Supply of Military Equipment", location: "New Delhi", dept: "Ministry of Defence", ownership: "Central Government", stage: "Financial", date: "23-06-2023", value: "₹ 4.6 Cr", status: "participated" },
      { id: "242352", title: "Construction of Army Barracks", location: "Mumbai", dept: "Defence Canteen", ownership: "Central Government", stage: "Technical", date: "15-07-2023", value: "₹ 2.3 Cr", status: "awarded" },
      { id: "243353", title: "IT Infrastructure Setup", location: "Kolkata", dept: "Central Ordnance Depot", ownership: "Central Government", stage: "AOC", date: "08-08-2023", value: "₹ 1.8 Cr", status: "lost" },
      { id: "244354", title: "Vehicle Procurement", location: "Delhi", dept: "Ministry of Defence", ownership: "Central Government", stage: "Financial", date: "22-09-2023", value: "₹ 5.2 Cr", status: "tba" },
      { id: "245355", title: "Medical Supplies", location: "Chennai", dept: "Defence Canteen", ownership: "Central Government", stage: "Technical", date: "10-10-2023", value: "₹ 3.1 Cr", status: "participated" }
    ]
  },
  {
    name: "Ojha Production",
    participated: { count: 9, value: "₹ 32.10 Lac" },
    awarded: { count: 2, value: "₹ 1.2 Cr" },
    lost: { count: 4, value: "₹ 15.8 Lac" },
    tba: { count: 3, value: "₹ 0" },
    states: [
      { state: "Gujarat", published: 18022, participated: 3, awarded: 2 },
      { state: "Rajasthan", published: 9044, participated: 2, awarded: 0 }
    ],
    ownership: {
      central: 4,
      corporation: 1,
      psu: 2,
      state: 2
    },
    departments: [
      { name: "Public Works Dept", count: 3 },
      { name: "Municipal Corporation", count: 2 }
    ],
    monthlyData: [
      { month: "Sep '22", participated: 0, awarded: 0 },
      { month: "Oct '22", participated: 1, awarded: 0 },
      { month: "Nov '22", participated: 0, awarded: 0 },
      { month: "Dec '22", participated: 1, awarded: 1 }
    ],
    resultStages: {
      technical: 55.6,
      financial: 22.2,
      aoc: 22.2
    },
    tenders: [
      { id: "241451", title: "Road Construction Project", location: "Ahmedabad", dept: "Public Works Dept", ownership: "State Government", stage: "Technical", date: "12-05-2023", value: "₹ 8.5 Cr", status: "awarded" },
      { id: "242452", title: "Bridge Repair Work", location: "Jaipur", dept: "Municipal Corporation", ownership: "Corporation", stage: "Financial", date: "20-06-2023", value: "₹ 6.2 Cr", status: "participated" },
      { id: "243453", title: "Water Supply System", location: "Surat", dept: "Public Works Dept", ownership: "State Government", stage: "AOC", date: "05-07-2023", value: "₹ 4.7 Cr", status: "lost" }
    ]
  },
  {
    name: "Tech Solutions India Ltd",
    participated: { count: 15, value: "₹ 85.20 Lac" },
    awarded: { count: 4, value: "₹ 3.5 Cr" },
    lost: { count: 8, value: "₹ 42.10 Lac" },
    tba: { count: 3, value: "₹ 0" },
    states: [
      { state: "Karnataka", published: 25000, participated: 5, awarded: 2 },
      { state: "Tamil Nadu", published: 18000, participated: 3, awarded: 1 }
    ],
    ownership: {
      central: 5,
      corporation: 3,
      psu: 4,
      state: 3
    },
    departments: [
      { name: "IT Department", count: 5 },
      { name: "Digital Services", count: 3 }
    ],
    monthlyData: [
      { month: "Sep '22", participated: 2, awarded: 0 },
      { month: "Oct '22", participated: 1, awarded: 1 },
      { month: "Nov '22", participated: 3, awarded: 0 },
      { month: "Dec '22", participated: 2, awarded: 1 }
    ],
    resultStages: {
      technical: 40.0,
      financial: 35.0,
      aoc: 25.0
    },
    tenders: [
      { id: "251451", title: "Cloud Infrastructure Setup", location: "Bangalore", dept: "IT Department", ownership: "State Government", stage: "Technical", date: "15-04-2023", value: "₹ 12.5 Cr", status: "awarded" },
      { id: "252452", title: "Smart City IoT Deployment", location: "Chennai", dept: "Digital Services", ownership: "Corporation", stage: "Financial", date: "28-05-2023", value: "₹ 8.2 Cr", status: "participated" }
    ]
  }
];

// Searchable Dropdown Component
const SearchableSelect = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="searchable-select" ref={dropdownRef}>
      <div className="select-input" onClick={() => setIsOpen(!isOpen)}>
        <span>{value}</span>
        <ChevronDown size={18} className={`arrow ${isOpen ? 'arrow-open' : ''}`} />
      </div>

      {isOpen && (

        <div className="select-dropdown">

          <div className="select-search-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="select-search"
              placeholder="Search company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="select-options">
            {filteredOptions.map((opt, i) => (
              <div
                key={i}
                className={`select-option ${opt === value ? "selected" : ""}`}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                  setSearch("");
                }}
              >
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Pie Chart Component
const PieChart = ({ data }) => {
  const total = data.technical + data.financial + data.aoc;
  const colors = ['#3b82f6', '#10b981', '#f59e0b'];
  const values = [data.technical, data.financial, data.aoc];

  let currentAngle = -90;
  const cx = 110;
  const cy = 110;
  const radius = 85;

  return (
    <>
      {values.map((value, i) => {
        const percentage = (value / total) * 100;
        const angle = (percentage / 100) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;

        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        const x1 = cx + radius * Math.cos(startRad);
        const y1 = cy + radius * Math.sin(startRad);
        const x2 = cx + radius * Math.cos(endRad);
        const y2 = cy + radius * Math.sin(endRad);

        const largeArc = angle > 180 ? 1 : 0;

        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

        currentAngle = endAngle;

        return (
          <path
            key={i}
            d={path}
            fill={colors[i]}
            stroke="#fff"
            strokeWidth="2"
          />
        );
      })}
      <text x={cx} y={cy - 5} textAnchor="middle" fill="#0f172a" fontSize="20" fontWeight="bold">
        {data.technical.toFixed(1)}%
      </text>
      <text x={cx} y={cy + 15} textAnchor="middle" fill="#64748b" fontSize="12">
        Technical
      </text>
    </>
  );
};

const CompetitorProfile = () => {
  const [companyList, setCompanyList] = useState([]);
  const [selectedBrandName, setSelectedBrandName] = useState("");
  const [competitorData, setCompetitorData] = useState(null); // Initialize as null
  const [activeTab, setActiveTab] = useState("participated");

  useEffect(() => {
    fetchCompanies();
  }, []);

  // Fetch data when brand name changes
  useEffect(() => {
    if (selectedBrandName) {
      fetchCompanyStats(selectedBrandName);
    } else if (companyList.length > 0) {
      // Default to first company if nothing selected
      setSelectedBrandName(companyList[0]);
    } else {
      // Fallback to static data default if no API list
      setCompetitorData(companies[0]);
      setSelectedBrandName(companies[0].name);
    }
  }, [selectedBrandName, companyList]); // Rerun when list loads or selection changes

  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/competitors/brands`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setCompanyList(data.data.map(item => item.value));
        // Set first item as default if not already set
        if (!selectedBrandName && data.data.length > 0) {
          setSelectedBrandName(data.data[0].value);
        }
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchCompanyStats = async (brandName) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/competitors/stats?brand=${encodeURIComponent(brandName)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setCompetitorData(data.data);
      }
    } catch (error) {
      console.error('Error fetching company stats:', error);
    }
  };

  const filteredTenders = competitorData && competitorData.tenders ? competitorData.tenders.filter(
    tender => tender.status === activeTab
  ) : [];

  if (!competitorData) return <div className="loading-state">Loading Competitor Data...</div>;

  return (
    <div className="competitor-profile-page">
      {/* HEADER */}
      <div className="profile-header">
        <h2>Company Profile</h2>
        <SearchableSelect
          value={selectedBrandName}
          onChange={(name) => setSelectedBrandName(name)}
          options={companyList.length > 0 ? companyList : companies.map(c => c.name)}
        />
      </div>

      {/* KPI CARDS */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <h4>Participated Tenders</h4>
          <p>{competitorData.participated.count} Tender</p>
          <span>{competitorData.participated.value}</span>
        </div>

        <div className="kpi-card">
          <h4>Awarded Tenders</h4>
          <p>{competitorData.awarded.count} Tender</p>
          <span>{competitorData.awarded.value}</span>
        </div>

        <div className="kpi-card">
          <h4>Lost Tenders</h4>
          <p>{competitorData.lost.count} Tender</p>
          <span>{competitorData.lost.value}</span>
        </div>

        <div className="kpi-card">
          <h4>Result TBA</h4>
          <p>{competitorData.tba.count} Tender</p>
          <span>{competitorData.tba.value}</span>
        </div>
      </div>

      {/* CHARTS GRID */}
      <div className="charts-grid">
        {/* TOP DEPARTMENTS */}
        <div className="card">
          <h3>Top Departments</h3>
          <div className="dept-list">
            {competitorData.departments.map((dept, i) => (
              <div key={i} className="dept-row">
                <span className="dept-name">{dept.name}</span>
                <div className="dept-track">
                  <div
                    className="dept-fill"
                    style={{ width: `${dept.count * 20}%` }}
                  />
                </div>
                <span className="dept-count">{dept.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* MONTHLY TREND */}
        <div className="card">
          <h3>Monthly Participation Trend</h3>
          <div className="trend-line">
            {competitorData.monthlyData.map((m, i) => (
              <div key={i} className="trend-point">
                <div
                  className="dot"
                  style={{ bottom: `${m.participated * 10}%` }}
                  title={`${m.participated} tenders`}
                />
                <span className="month-label">{m.month.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* PIE CHART */}
        <div className="card">
          <h3>Result Stages</h3>
          <div className="pie-container">
            <svg width="220" height="220" viewBox="0 0 220 220">
              <PieChart data={competitorData.resultStages} />
            </svg>
            <div className="pie-legend">
              <div className="legend-item">
                <div className="legend-color technical-color" />
                <span>Technical</span>
              </div>
              <div className="legend-item">
                <div className="legend-color financial-color" />
                <span>Financial</span>
              </div>
              <div className="legend-item">
                <div className="legend-color aoc-color" />
                <span>AOC</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LOWER SECTION */}
      <div className="profile-lower">
        {/* STATE TABLE */}
        <div className="card">
          <h3>State Wise Result</h3>
          <table className="state-table">
            <thead>
              <tr>
                <th>State Name</th>
                <th>Published</th>
                <th>Participated</th>
                <th>Awarded</th>
              </tr>
            </thead>
            <tbody>
              {competitorData.states.map((s, i) => (
                <tr key={i}>
                  <td>{s.state}</td>
                  <td>{s.published.toLocaleString()}</td>
                  <td>{s.participated}</td>
                  <td>{s.awarded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* OWNERSHIP */}
        <div className="card">
          <h3>Tendering Ownership</h3>
          <div className="ownership-list">
            {Object.entries(competitorData.ownership).map(([key, val]) => (
              <div className="ownership-row" key={key}>
                <span className="ownership-label">
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </span>
                <div className="ownership-bar">
                  <div
                    className="ownership-fill"
                    style={{ width: `${val * 10}%` }}
                  />
                </div>
                <span className="ownership-value">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* TENDER RESULTS */}
        <div className="card tender-results-card">
          <div className="tender-results-header">
            <h3>Company Tender Results</h3>
            <div className="result-tabs">
              <button
                className={`tab ${activeTab === "participated" ? "active" : ""}`}
                onClick={() => setActiveTab("participated")}
              >
                Participated
              </button>
              <button
                className={`tab ${activeTab === "awarded" ? "active" : ""}`}
                onClick={() => setActiveTab("awarded")}
              >
                Awarded
              </button>
              <button
                className={`tab ${activeTab === "lost" ? "active" : ""}`}
                onClick={() => setActiveTab("lost")}
              >
                Lost
              </button>
              <button
                className={`tab ${activeTab === "tba" ? "active" : ""}`}
                onClick={() => setActiveTab("tba")}
              >
                Result TBA
              </button>
            </div>
          </div>

          <div className="tender-result-list">
            {filteredTenders.length > 0 ? (
              filteredTenders.map((tender, i) => (
                <div key={i} className="tender-item">
                  <div className="tender-left">
                    <div className="tender-id">Tender ID: {tender.id}</div>
                    <div className="tender-title">{tender.title}</div>
                    <div className="tender-meta">
                      <span className="meta-item">
                        <MapPin size={14} />
                        {tender.location}
                      </span>
                      <span className="meta-item">
                        <Building2 size={14} />
                        {tender.dept}
                      </span>
                      <span className="meta-item">
                        <Landmark size={14} />
                        {tender.ownership}
                      </span>
                    </div>
                  </div>
                  <div className="tender-right">
                    <span className="stage-badge">{tender.stage}</span>
                    <span className="tender-date">{tender.date}</span>
                    <span className="tender-value">{tender.value}</span>
                    <div className="tender-actions">
                      <button className="icon-btn" title="View Document">
                        <FileText size={16} />
                      </button>
                      <button className="icon-btn" title="External Link">
                        <ExternalLink size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-data">No tenders found for this category</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompetitorProfile;
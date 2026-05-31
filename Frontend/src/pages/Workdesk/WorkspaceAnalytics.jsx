import React, { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Search,
  DollarSign,
  Users,
  ArrowUpRight,
  FileText,
  Package,
  Star,
} from "lucide-react";

const WorkspaceAnalytics = () => {
  const [searchCompetitor, setSearchCompetitor] = useState("");

  const competitors = [
    { id: 1, name: "Alpha Industries", marketShare: "32%", growth: "+6.2%", rating: 4.5 },
    { id: 2, name: "Nova Solutions", marketShare: "26%", growth: "+4.9%", rating: 4.2 },
    { id: 3, name: "TechPrime", marketShare: "18%", growth: "+2.4%", rating: 3.9 },
    { id: 4, name: "Vision Corp", marketShare: "11%", growth: "+1.1%", rating: 3.7 },
  ];

  const suggestedProducts = [
    { id: 1, name: "AI Workflow Optimizer", demand: "High", trend: "+18%", category: "Automation" },
    { id: 2, name: "Smart Procurement Suite", demand: "Moderate", trend: "+9%", category: "Procurement" },
    { id: 3, name: "Cloud Tender Manager", demand: "Very High", trend: "+23%", category: "Tendering" },
  ];

  const pricing = [
    { product: "AI Workflow Optimizer", competitorPrice: "$1200", recommended: "$1099" },
    { product: "Procurement Suite", competitorPrice: "$1500", recommended: "$1390" },
    { product: "Tender Manager Pro", competitorPrice: "$900", recommended: "$849" },
  ];

  const filteredCompetitors = competitors.filter((c) =>
    c.name.toLowerCase().includes(searchCompetitor.toLowerCase())
  );

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#f3f6fb", padding: "2rem" }}>
      
      {/* CONTAINER */}
      <div style={{ maxWidth: "1400px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "2rem" }}>

        {/* PAGE HEADER */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <BarChart3 size={30} color="#2563eb" />
          <h1 style={{ margin: 0, fontWeight: 600, color: "#1f2937" }}>Analytics Dashboard</h1>
        </div>

        {/* SUMMARY ROW */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "1.25rem",
          }}
        >
          <SummaryCard title="Total Competitors" value="4" icon={<Users size={24} />} />
          <SummaryCard title="Suggested Products" value="3" icon={<Package size={24} />} />
          <SummaryCard title="Pricing Insights" value="3" icon={<DollarSign size={24} />} />
        </div>

        {/* COMPETITOR ANALYSIS */}
        <SectionCard title="Competitor Analysis">
          
          {/* Search Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
            }}
          >
            <h3 style={{ margin: 0, fontWeight: 600, color: "#1f2937" }}>Market Overview</h3>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "#f1f5f9",
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
              }}
            >
              <Search size={18} color="#6b7280" />
              <input
                type="text"
                placeholder="Search competitors..."
                value={searchCompetitor}
                onChange={(e) => setSearchCompetitor(e.target.value)}
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: "0.9rem",
                }}
              />
            </div>
          </div>

          {/* Competitor Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
              gap: "1rem",
            }}
          >
            {filteredCompetitors.map((c) => (
              <div
                key={c.id}
                style={{
                  background: "#ffffff",
                  padding: "1.25rem",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
                  transition: "0.2s",
                }}
              >
                <p style={{ margin: 0, fontWeight: 600, color: "#1f2937" }}>{c.name}</p>

                <p style={{ margin: "0.4rem 0 0", color: "#6b7280", fontSize: "0.9rem" }}>
                  Market Share: <b>{c.marketShare}</b>
                </p>

                <p style={{ margin: "0.25rem 0 0", color: "#059669", fontWeight: 600, fontSize: "0.9rem" }}>
                  {c.growth} growth
                </p>

                <p style={{ margin: "0.25rem 0 0", color: "#2563eb", fontWeight: 600 }}>
                  ⭐ {c.rating}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* SUGGESTED PRODUCTS */}
        <SectionCard title="Suggested Products">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
              gap: "1rem",
            }}
          >
            {suggestedProducts.map((p) => (
              <div
                key={p.id}
                style={{
                  background: "#ffffff",
                  padding: "1.25rem",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
                }}
              >
                <p style={{ margin: 0, fontWeight: 600, color: "#1f2937" }}>{p.name}</p>

                <p style={{ margin: "0.4rem 0 0", fontSize: "0.9rem", color: "#6b7280" }}>
                  Category: <b>{p.category}</b>
                </p>

                <p style={{ margin: "0.4rem 0 0", fontSize: "0.9rem", color: "#475569" }}>
                  Demand Level: <b>{p.demand}</b>
                </p>

                <div
                  style={{
                    marginTop: "0.6rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    color: "#059669",
                    fontWeight: 600,
                  }}
                >
                  <TrendingUp size={20} /> {p.trend}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* PRICING ANALYSIS */}
        <SectionCard title="Suggested Pricing Analysis">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Competitor Price</th>
                  <th style={thStyle}>Recommended Price</th>
                  <th style={thStyle}>Advantage</th>
                </tr>
              </thead>

              <tbody>
                {pricing.map((row, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                    <td style={tdStyle}>{row.product}</td>
                    <td style={tdStyle}>{row.competitorPrice}</td>
                    <td style={tdStyle}>{row.recommended}</td>
                    <td style={{ ...tdStyle, color: "#059669", fontWeight: 600 }}>
                      <ArrowUpRight size={16} /> Better Pricing
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

/* ---------------- REUSABLE COMPONENTS ---------------- */

const SummaryCard = ({ title, value, icon }) => (
  <div
    style={{
      background: "#ffffff",
      padding: "1.25rem",
      borderRadius: "10px",
      border: "1px solid #e5e7eb",
      boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
      display: "flex",
      alignItems: "center",
      gap: "1rem",
    }}
  >
    <div
      style={{
        background: "#eff6ff",
        padding: "0.8rem",
        borderRadius: "8px",
        color: "#2563eb",
      }}
    >
      {icon}
    </div>

    <div>
      <p style={{ margin: 0, fontSize: "0.9rem", color: "#6b7280" }}>{title}</p>
      <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>{value}</p>
    </div>
  </div>
);

const SectionCard = ({ title, children }) => (
  <div
    style={{
      background: "#ffffff",
      padding: "1.5rem",
      borderRadius: "12px",
      border: "1px solid #e5e7eb",
      boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
      width: "100%",
    }}
  >
    <h3 style={{ margin: 0, marginBottom: "1.2rem", fontWeight: 600, color: "#1f2937" }}>
      {title}
    </h3>
    {children}
  </div>
);

const thStyle = {
  padding: "0.9rem 1rem",
  textAlign: "left",
  fontWeight: 600,
  color: "#1f2937",
  fontSize: "0.9rem",
};

const tdStyle = {
  padding: "0.9rem 1rem",
  color: "#374151",
  fontSize: "0.9rem",
};

export default WorkspaceAnalytics;

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  BarChart3,
  FileText,
  CheckCircle2,
  FolderOpen,
  Users,
  AlertCircle
} from "lucide-react";
import WorkspaceTimeline from "./WorkspaceTimeline";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const WorkspaceOverview = () => {
  const { "*": tenderId } = useParams(); // react-router-dom splat catches the tender ID
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        setLoading(true);
        const cleanTenderId = tenderId ? tenderId.replace(/_/g, "/") : "";
        const token = localStorage.getItem("token");

        const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/overview`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (!res.ok) throw new Error("Failed to load workspace overview data.");
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (tenderId) {
      fetchOverview();
    }
  }, [tenderId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f6fb", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <p style={{ color: "#6b7280", fontSize: "1.1rem", fontWeight: 500 }}>Loading overview analytics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f6fb", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: 'center', background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
          <AlertCircle size={48} color="#dc2626" style={{ margin: "0 auto 1rem auto" }} />
          <p style={{ color: "#1f2937", fontSize: "1.2rem", fontWeight: 600, margin: 0 }}>Failed to load insights</p>
          <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>{error}</p>
        </div>
      </div>
    );
  }

  const { tenderDetails, summary } = data;

  return (
    <div style={{ minHeight: "100vh", background: "#f3f6fb", padding: "2rem" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "2rem" }}>

        {/* ---------------- PAGE HEADER ---------------- */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <BarChart3 size={32} color="#2563eb" />
          <h1 style={{ margin: 0, fontWeight: "700", color: "#1f2937" }}>
            Project Overview
          </h1>
        </div>

        {/* ---------------- TENDER DETAILS ---------------- */}
        <div style={{ background: "white", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e5e7eb", boxShadow: "0 3px 6px rgba(0,0,0,0.08)" }}>
          <h2 style={{ marginTop: 0, color: "#1f2937", fontWeight: 600 }}>
            Tender Details
          </h2>
          <p style={{ fontSize: "1.1rem", color: "#374151", margin: "0.5rem 0 1rem 0", fontWeight: 500 }}>
            {tenderDetails?.title || "Unknown Title"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
            <DetailItem label="Tender ID" value={tenderDetails?.id?.replace(/_/g, "/")} color="#2563eb" />
            <DetailItem label="Status" value={tenderDetails?.status} color={tenderDetails?.status === 'proceed' ? "#059669" : "#ea580c"} />
            <DetailItem label="Deadline" value={tenderDetails?.deadline ? new Date(tenderDetails.deadline).toLocaleDateString() : "N/A"} color="#dc2626" />
            <DetailItem label="Value/Budget" value={tenderDetails?.budget || "Not Specified"} color="#7c3aed" />
          </div>
        </div>

        {/* ---------------- SUMMARY CARDS ---------------- */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.25rem" }}>
          <SummaryCard label="Total Departments" value={summary?.totalDepartments || 0} icon={<Users size={28} />} color="#2563eb" />
          <SummaryCard label="Total Tasks" value={summary?.totalTasks || 0} icon={<CheckCircle2 size={28} />} color="#059669" />
          <SummaryCard label="Total Files" value={summary?.totalFiles || 0} icon={<FileText size={28} />} color="#7c3aed" />
          <SummaryCard label="Workspace Activity" value={summary?.workspaceStatus} icon={<FolderOpen size={28} />} color="#db2777" />
        </div>

        {/* ---------------- TENDER TIMELINE ---------------- */}
        <div style={{ background: "white", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e5e7eb", boxShadow: "0 3px 6px rgba(0,0,0,0.08)" }}>
          <WorkspaceTimeline tenderId={tenderId} />
        </div>
      </div>
    </div>
  );
};

/* ---------------- REUSABLE COMPONENTS ---------------- */

const SummaryCard = ({ label, value, icon, color }) => (
  <div style={{ background: "white", padding: "1.25rem", borderRadius: "10px", border: "1px solid #e5e7eb", boxShadow: "0 2px 4px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: "1rem" }}>
    <div style={{ background: color + "20", padding: "0.75rem", borderRadius: "10px", color }}>
      {icon}
    </div>
    <div>
      <p style={{ margin: 0, fontSize: "0.85rem", color: "#6b7280", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.02em" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "#111827" }}>{value}</p>
    </div>
  </div>
);

const DetailItem = ({ label, value, color }) => (
  <div style={{ borderLeft: `4px solid ${color}`, paddingLeft: "1rem" }}>
    <p style={{ margin: 0, fontSize: "0.85rem", color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>{label}</p>
    <p style={{ margin: "0.25rem 0 0 0", fontSize: "1rem", fontWeight: 600, color: "#111827", textTransform: 'capitalize' }}>{value}</p>
  </div>
);

export default WorkspaceOverview;

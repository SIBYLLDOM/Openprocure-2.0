// src/pages/Workdesk/ActiveWorkspaces.jsx
// Route: /workdesk/active-workspaces

import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Loader2, Search, Filter, ExternalLink, Eye, Clock,
  Users, TrendingUp, AlertTriangle, CheckCircle2,
  Folder, ChevronDown, LayoutGrid, List, RefreshCw,
  Calendar, Zap, MoreHorizontal, FileText, Trash2
} from "lucide-react";
import WorkspaceOverview from "./WorkspaceOverview";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const STATUS_CONFIG = {
  active:   { label: "Active",     bg: "#dcfce7", text: "#166534", border: "#86efac", dot: "#22c55e" },
  urgent:   { label: "Urgent",     bg: "#fff1f2", text: "#be123c", border: "#fda4af", dot: "#ef4444" },
  review:   { label: "In Review",  bg: "#eff6ff", text: "#1d4ed8", border: "#93c5fd", dot: "#3b82f6" },
  pending:  { label: "Pending",    bg: "#fefce8", text: "#854d0e", border: "#fde047", dot: "#eab308" },
  completed:{ label: "Completed",  bg: "#f0fdf4", text: "#15803d", border: "#4ade80", dot: "#16a34a" },
};

const STATUS_ICON = {
  active:    TrendingUp,
  urgent:    AlertTriangle,
  review:    Eye,
  pending:   Clock,
  completed: CheckCircle2,
};

function progColor(p) {
  return p >= 75 ? "#059669" : p >= 40 ? "#d97706" : "#dc2626";
}

function daysLeft(deadlineStr) {
  if (!deadlineStr || deadlineStr === "N/A") return null;
  const diff = Math.ceil((new Date(deadlineStr) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
}

/* ─────────────────────────────────────────────
   PILL
───────────────────────────────────────────── */
const Pill = ({ children, color = "gray" }) => {
  const map = {
    green: { bg: "#dcfce7", text: "#166534" },
    amber: { bg: "#fef3c7", text: "#92400e" },
    red:   { bg: "#fee2e2", text: "#991b1b" },
    blue:  { bg: "#dbeafe", text: "#1e40af" },
    gray:  { bg: "#f1f5f9", text: "#475569" },
  };
  const c = map[color] || map.gray;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 9px", borderRadius: 99,
      fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.text,
      letterSpacing: "0.02em",
    }}>
      {children}
    </span>
  );
};

/* ─────────────────────────────────────────────
   STATUS BADGE
───────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.active;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99,
      fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.text,
      border: `1px solid ${cfg.border}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: cfg.dot, flexShrink: 0,
        animation: status === "urgent" ? "pulse 1.5s infinite" : "none",
      }} />
      {cfg.label}
    </span>
  );
};

/* ─────────────────────────────────────────────
   PROGRESS BAR
───────────────────────────────────────────── */
const ProgressBar = ({ value }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{
      flex: 1, height: 6, background: "#f1f5f9",
      borderRadius: 99, overflow: "hidden",
    }}>
      <div style={{
        height: "100%", width: `${value}%`,
        background: progColor(value),
        borderRadius: 99,
        transition: "width .8s ease",
      }} />
    </div>
    <span style={{
      fontSize: 12, fontWeight: 700,
      color: progColor(value), minWidth: 32,
      textAlign: "right",
    }}>
      {value}%
    </span>
  </div>
);

/* ─────────────────────────────────────────────
   WORKSPACE CARD (grid view)
───────────────────────────────────────────── */
const WorkspaceCard = ({ workspace, index, isAdmin, onDelete }) => {
  const cfg = STATUS_CONFIG[workspace.status] || STATUS_CONFIG.active;
  const Icon = STATUS_ICON[workspace.status] || Folder;
  const days = daysLeft(workspace.deadline);

  return (
    <div
      className="ws-card"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Top accent line */}
      <div style={{
        height: 3, background: cfg.dot,
        marginBottom: 16, borderRadius: "2px 2px 0 0",
        margin: "-20px -20px 16px",
      }} />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: cfg.bg, display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Icon size={15} color={cfg.text} />
          </div>
          <div>
            <div className="ws-tender-id">{workspace.tenderId}</div>
          </div>
        </div>
        <StatusBadge status={workspace.status} />
      </div>

      {/* Title */}
      <h4 className="ws-title">{workspace.title}</h4>

      {/* Meta info */}
      <div className="ws-meta">
        <div className="ws-meta-item">
          <Calendar size={12} color="#94a3b8" />
          <span style={{ color: days !== null && days < 7 ? "#dc2626" : "#64748b" }}>
            {workspace.deadline === "N/A"
              ? "No deadline"
              : days !== null
              ? days < 0
                ? `${Math.abs(days)}d overdue`
                : days === 0
                ? "Due today"
                : `${days}d left`
              : workspace.deadline}
          </span>
        </div>
        <div className="ws-meta-item">
          <Users size={12} color="#94a3b8" />
          <span>{workspace.team}</span>
        </div>
      </div>

      {/* Progress */}
      <div style={{ margin: "14px 0 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Progress</span>
          {workspace.progress >= 75 && (
            <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>On track</span>
          )}
          {workspace.progress > 0 && workspace.progress < 40 && (
            <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>Behind</span>
          )}
        </div>
        <ProgressBar value={workspace.progress} />
      </div>

      {/* Action buttons */}
      <div className="ws-actions">
        <button
          className="ws-btn-primary"
          onClick={() => window.open(`/workspace/${workspace.tenderId}`, "_blank")}
        >
          <ExternalLink size={13} />
          Open Workspace
        </button>
        <button
          className="ws-btn-secondary"
          onClick={() => console.log("View details", workspace.tenderId)}
        >
          <Eye size={13} />
          Details
        </button>
        {isAdmin && (
          <button
            className="ws-icon-btn ws-icon-btn-danger"
            onClick={() => onDelete(workspace)}
            title="Delete workspace"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   WORKSPACE ROW (list view)
───────────────────────────────────────────── */
const WorkspaceRow = ({ workspace, index, isAdmin, onDelete }) => {
  const days = daysLeft(workspace.deadline);
  return (
    <tr className="ws-row" style={{ animationDelay: `${index * 30}ms` }}>
      <td style={{ padding: "12px 16px" }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#94a3b8" }}>
          {workspace.tenderId}
        </span>
      </td>
      <td style={{ padding: "12px 16px" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{workspace.title}</span>
      </td>
      <td style={{ padding: "12px 16px" }}>
        <StatusBadge status={workspace.status} />
      </td>
      <td style={{ padding: "12px 16px", minWidth: 160 }}>
        <ProgressBar value={workspace.progress} />
      </td>
      <td style={{ padding: "12px 16px" }}>
        <span style={{
          fontSize: 12, fontWeight: 500,
          color: days !== null && days < 7 ? "#dc2626" : "#64748b",
        }}>
          {workspace.deadline === "N/A" ? "—" : days !== null
            ? days < 0 ? <span style={{ color: "#dc2626" }}>{Math.abs(days)}d overdue</span>
            : days === 0 ? "Today" : `${days}d`
            : workspace.deadline}
        </span>
      </td>
      <td style={{ padding: "12px 16px" }}>
        <Pill color="gray">{workspace.team}</Pill>
      </td>
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="ws-icon-btn"
            onClick={() => window.open(`/workspace/${workspace.tenderId}`, "_blank")}
            title="Open workspace"
          >
            <ExternalLink size={13} />
          </button>
          <button
            className="ws-icon-btn"
            onClick={() => console.log("View details", workspace.tenderId)}
            title="View details"
          >
            <Eye size={13} />
          </button>
          {isAdmin && (
            <button
              className="ws-icon-btn ws-icon-btn-danger"
              onClick={() => onDelete(workspace)}
              title="Delete workspace"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

/* ─────────────────────────────────────────────
   STAT CARD (top summary)
───────────────────────────────────────────── */
const StatCard = ({ label, value, icon: Icon, color }) => {
  const colorMap = {
    blue:   { bg: "#dbeafe", text: "#1e40af" },
    green:  { bg: "#dcfce7", text: "#166534" },
    amber:  { bg: "#fef3c7", text: "#92400e" },
    red:    { bg: "#fee2e2", text: "#991b1b" },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className="stat-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: c.bg, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={15} color={c.text} />
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{label}</div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
const ActiveWorkspaces = () => {
  const [searchTerm, setSearchTerm]   = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter]   = useState("all");
  const [viewMode, setViewMode]       = useState("grid"); // "grid" | "list"
  const [workspaces, setWorkspaces]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [deletingId, setDeletingId]   = useState(null);

  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem("user")); } catch { /* ignore */ }
  const isAdmin = currentUser?.role === "Admin";

  const fetchWorkspaces = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/tender-status/tender-status-history`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        const mapped = response.data.data.map((item) => ({
          tenderId: item.bid_number,
          title: item.remarks || `Tender ${item.bid_number}`,
          deadline: "N/A",
          team: "Unassigned",
          status: item.status || "active",
          progress: 0,
        }));
        setWorkspaces(mapped);
      } else {
        setError("Failed to fetch workspaces");
      }
    } catch (err) {
      console.error("Error fetching active workspaces:", err);
      setError("Failed to load workspaces");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchWorkspaces(); }, []);

  const handleDelete = async (workspace) => {
    if (!window.confirm(`Delete workspace "${workspace.title}" (${workspace.tenderId})? This cannot be undone.`)) {
      return;
    }
    setDeletingId(workspace.tenderId);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.delete(
        `${import.meta.env.VITE_API_BASE_URL}/tender-status/tender-status-history/${encodeURIComponent(workspace.tenderId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        setWorkspaces((prev) => prev.filter((w) => w.tenderId !== workspace.tenderId));
      } else {
        window.alert(response.data.message || "Failed to delete workspace");
      }
    } catch (err) {
      console.error("Error deleting workspace:", err);
      window.alert(err.response?.data?.message || "Failed to delete workspace");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = workspaces.filter((ws) => {
    const matchSearch =
      ws.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ws.tenderId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === "all" || ws.status === statusFilter;
    const matchTeam   = teamFilter   === "all" || ws.team   === teamFilter;
    return matchSearch && matchStatus && matchTeam;
  });

  // Summary counts
  const counts = {
    total:  workspaces.length,
    active: workspaces.filter(w => w.status === "active").length,
    urgent: workspaces.filter(w => w.status === "urgent").length,
    review: workspaces.filter(w => w.status === "review").length,
  };

  /* ── LOADING ── */
  if (loading) {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 size={22} color="#1d4ed8" className="spin" />
          </div>
          <p style={{ fontSize: 14, color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>Loading workspaces…</p>
        </div>
      </>
    );
  }

  /* ── ERROR ── */
  if (error) {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <div style={{ padding: 32, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <AlertTriangle size={22} color="#dc2626" />
          </div>
          <p style={{ fontSize: 14, color: "#dc2626", fontFamily: "'DM Sans', sans-serif" }}>{error}</p>
          <button onClick={() => fetchWorkspaces()} className="ws-btn-primary" style={{ marginTop: 14, display: "inline-flex" }}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div className="aw-root">

        {/* ── PAGE HEADER ── */}
        <div className="aw-header">
          <div className="aw-header-left">
            <div className="aw-header-icon">
              <Folder size={18} color="#fff" />
            </div>
            <div>
              <h1 className="aw-title">Active Workspaces</h1>
              <p className="aw-desc">
                Track progress, deadlines, and team assignments in real-time
              </p>
            </div>
          </div>
          <button
            className="ws-btn-secondary"
            onClick={() => fetchWorkspaces(true)}
            disabled={refreshing}
          >
            <RefreshCw size={13} className={refreshing ? "spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="stat-grid">
          <StatCard label="Total workspaces" value={counts.total}  icon={Folder}        color="blue"  />
          <StatCard label="Active"            value={counts.active} icon={TrendingUp}    color="green" />
          <StatCard label="Urgent"            value={counts.urgent} icon={AlertTriangle} color="red"   />
          <StatCard label="In review"         value={counts.review} icon={Eye}           color="amber" />
        </div>

        {/* ── FILTERS BAR ── */}
        <div className="filters-bar">
          <div className="search-wrap">
            <Search size={15} color="#94a3b8" className="search-icon" />
            <input
              className="search-input"
              type="text"
              placeholder="Search by tender ID or title…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0, display: "flex" }}
              >
                ×
              </button>
            )}
          </div>

          <div className="filter-right">
            <div className="select-wrap">
              <Filter size={13} color="#94a3b8" />
              <select
                className="aw-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="urgent">Urgent</option>
                <option value="review">In Review</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
              </select>
              <ChevronDown size={13} color="#94a3b8" />
            </div>

            <div className="select-wrap">
              <Users size={13} color="#94a3b8" />
              <select
                className="aw-select"
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
              >
                <option value="all">All Teams</option>
                <option value="Team Alpha">Team Alpha</option>
                <option value="Team Beta">Team Beta</option>
                <option value="Team Gamma">Team Gamma</option>
                <option value="Team Delta">Team Delta</option>
                <option value="Unassigned">Unassigned</option>
              </select>
              <ChevronDown size={13} color="#94a3b8" />
            </div>

            {/* View toggle */}
            <div className="view-toggle">
              <button
                className={`view-btn${viewMode === "grid" ? " active" : ""}`}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                className={`view-btn${viewMode === "list" ? " active" : ""}`}
                onClick={() => setViewMode("list")}
                title="List view"
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ── RESULTS COUNT ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            Showing <strong style={{ color: "#0f172a" }}>{filtered.length}</strong> of {workspaces.length} workspaces
          </span>
          {(searchTerm || statusFilter !== "all" || teamFilter !== "all") && (
            <button
              onClick={() => { setSearchTerm(""); setStatusFilter("all"); setTeamFilter("all"); }}
              style={{
                fontSize: 12, color: "#1d4ed8", background: "#eff6ff",
                border: "1px solid #bfdbfe", borderRadius: 99,
                padding: "2px 10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── GRID VIEW ── */}
        {viewMode === "grid" && filtered.length > 0 && (
          <div className="ws-grid">
            {filtered.map((ws, i) => (
              <WorkspaceCard key={ws.tenderId + i} workspace={ws} index={i} isAdmin={isAdmin} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {viewMode === "list" && filtered.length > 0 && (
          <div className="ws-list-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Tender ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th style={{ minWidth: 180 }}>Progress</th>
                  <th>Deadline</th>
                  <th>Team</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ws, i) => (
                  <WorkspaceRow key={ws.tenderId + i} workspace={ws} index={i} isAdmin={isAdmin} onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <FileText size={28} color="#94a3b8" />
            </div>
            <h3 className="empty-title">No workspaces found</h3>
            <p className="empty-desc">
              {searchTerm || statusFilter !== "all" || teamFilter !== "all"
                ? "Try adjusting your search or filters."
                : "No active workspaces at the moment."}
            </p>
            {(searchTerm || statusFilter !== "all" || teamFilter !== "all") && (
              <button
                className="ws-btn-secondary"
                onClick={() => { setSearchTerm(""); setStatusFilter("all"); setTeamFilter("all"); }}
                style={{ marginTop: 14, display: "inline-flex" }}
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
};

/* ─────────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(1.3); }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .spin { animation: spin 1s linear infinite; }

  .aw-root {
    font-family: 'DM Sans', sans-serif;
    background: #f8fafc;
    min-height: 100vh;
    padding: 28px;
    max-width: 1600px;
    margin: 0 auto;
  }

  /* Header */
  .aw-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 24px; flex-wrap: wrap; gap: 14px;
  }
  .aw-header-left { display: flex; align-items: center; gap: 14px; }
  .aw-header-icon {
    width: 44px; height: 44px; border-radius: 12px;
    background: linear-gradient(135deg, #1e40af, #0f766e);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .aw-title {
    font-size: 20px; font-weight: 700; color: #0f172a;
    margin: 0 0 2px; line-height: 1.2;
  }
  .aw-desc { font-size: 13px; color: #64748b; margin: 0; }

  /* Stat grid */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px; margin-bottom: 20px;
  }
  .stat-card {
    background: #fff; border: 1px solid #e2e8f0;
    border-radius: 12px; padding: 16px;
    transition: box-shadow .2s;
    animation: fadeUp .4s ease both;
  }
  .stat-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07); }

  /* Filters bar */
  .filters-bar {
    display: flex; align-items: center; gap: 12px;
    background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
    padding: 12px 16px; margin-bottom: 16px; flex-wrap: wrap;
  }
  .search-wrap {
    flex: 1; min-width: 200px; display: flex; align-items: center;
    gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 8px; padding: 7px 12px;
  }
  .search-wrap:focus-within { border-color: #3b82f6; background: #fff; }
  .search-input {
    flex: 1; border: none; background: transparent; outline: none;
    font-family: 'DM Sans', sans-serif; font-size: 13px; color: #0f172a;
  }
  .search-input::placeholder { color: #94a3b8; }
  .filter-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .select-wrap {
    display: flex; align-items: center; gap: 6px;
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 7px 12px; cursor: pointer;
  }
  .select-wrap:focus-within { border-color: #3b82f6; background: #fff; }
  .aw-select {
    font-family: 'DM Sans', sans-serif; font-size: 13px; color: #374151;
    border: none; background: transparent; outline: none; cursor: pointer;
    appearance: none; -webkit-appearance: none;
  }

  /* View toggle */
  .view-toggle {
    display: flex; background: #f1f5f9; border-radius: 8px; padding: 3px; gap: 2px;
  }
  .view-btn {
    padding: 6px 10px; border-radius: 6px; border: none; cursor: pointer;
    background: transparent; color: #64748b; transition: all .15s;
    display: flex; align-items: center; justify-content: center;
  }
  .view-btn.active {
    background: #fff; color: #0f172a;
    box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  }

  /* Workspace GRID */
  .ws-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px;
  }
  .ws-card {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
    padding: 20px; overflow: hidden;
    transition: box-shadow .2s, transform .2s;
    animation: fadeUp .4s ease both;
  }
  .ws-card:hover {
    box-shadow: 0 8px 24px rgba(0,0,0,0.09);
    transform: translateY(-2px);
  }
  .ws-tender-id {
    font-family: 'DM Mono', monospace; font-size: 11px; color: #94a3b8;
  }
  .ws-title {
    font-size: 14px; font-weight: 600; color: #0f172a;
    margin: 0 0 10px; line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
  }
  .ws-meta { display: flex; flex-direction: column; gap: 5px; }
  .ws-meta-item {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: #64748b;
  }
  .ws-actions { display: flex; gap: 8px; }

  /* Workspace LIST */
  .ws-list-wrap {
    background: #fff; border: 1px solid #e2e8f0;
    border-radius: 14px; overflow: hidden;
  }
  .ws-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ws-table th {
    font-size: 11px; font-weight: 600; color: #94a3b8; text-align: left;
    padding: 10px 16px; background: #f8fafc;
    border-bottom: 1px solid #f1f5f9;
    text-transform: uppercase; letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .ws-row td { border-bottom: 1px solid #f8fafc; vertical-align: middle; }
  .ws-row:last-child td { border-bottom: none; }
  .ws-row:hover td { background: #f8fafc; }
  .ws-row { animation: fadeUp .3s ease both; }

  /* Buttons */
  .ws-btn-primary {
    font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600;
    padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer;
    background: #0f172a; color: #fff;
    display: inline-flex; align-items: center; gap: 6px;
    transition: background .15s, transform .1s;
    flex: 1; justify-content: center;
  }
  .ws-btn-primary:hover { background: #1e293b; }
  .ws-btn-primary:active { transform: scale(0.98); }
  .ws-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .ws-btn-secondary {
    font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600;
    padding: 7px 14px; border-radius: 8px;
    border: 1px solid #e2e8f0; cursor: pointer;
    background: #fff; color: #374151;
    display: inline-flex; align-items: center; gap: 6px;
    transition: all .15s;
    flex: 1; justify-content: center;
  }
  .ws-btn-secondary:hover { border-color: #94a3b8; background: #f8fafc; }
  .ws-btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }

  .ws-icon-btn {
    width: 30px; height: 30px; border-radius: 7px;
    border: 1px solid #e2e8f0; background: #fff; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: #64748b; transition: all .15s;
  }
  .ws-icon-btn:hover { background: #f1f5f9; color: #0f172a; border-color: #94a3b8; }
  .ws-icon-btn-danger:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }

  /* Empty state */
  .empty-state {
    text-align: center; padding: 64px 24px;
    background: #fff; border: 1px solid #e2e8f0;
    border-radius: 14px;
  }
  .empty-icon {
    width: 56px; height: 56px; border-radius: 14px;
    background: #f1f5f9; display: flex; align-items: center;
    justify-content: center; margin: 0 auto 16px;
  }
  .empty-title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 6px; }
  .empty-desc  { font-size: 13px; color: #64748b; margin: 0; }

  /* Responsive */
  @media (max-width: 1024px) {
    .stat-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }
  @media (max-width: 768px) {
    .aw-root { padding: 16px; }
    .ws-grid { grid-template-columns: 1fr; }
    .filters-bar { flex-direction: column; align-items: stretch; }
    .filter-right { flex-wrap: wrap; }
    .ws-table th:nth-child(5),
    .ws-table td:nth-child(5) { display: none; }
  }
  @media (max-width: 480px) {
    .stat-grid { grid-template-columns: 1fr 1fr; }
    .aw-header { flex-direction: column; align-items: flex-start; }
  }
`;

export default ActiveWorkspaces;
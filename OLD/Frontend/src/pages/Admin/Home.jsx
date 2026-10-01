import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText, Clock, Globe, IndianRupee, AlertCircle,
    ArrowUpRight, ArrowDownRight, Activity
} from 'lucide-react';
import {
    BarChart, Bar, PieChart as RPieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import '../../assets/css/AdminHome.css';

const EMPTY_STATS = {
    dept: 'Both',
    activeTenders: 0,
    closingSoon: 0,
    openTenders: 0,
    bidsAwarded: 0,
    contracts: { count: 0, totalValue: 0 },
    incidents: { total: 0, pendingResponse: 0 },
    bidFunnel: {
        notEvaluated: 0, evaluation: 0, technicalEvaluation: 0,
        financialEvaluation: 0, bidAward: 0, bidRaAward: 0
    },
    deptSplit: null,
    upcomingDeadlines: [],
    recentActivity: []
};

const formatINR = (value) => {
    const v = Number(value) || 0;
    if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
    if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
    if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)} K`;
    return `₹${v.toFixed(0)}`;
};

const toTenderUrlId = (bidNumber) => (bidNumber || '').split('/').join('_');

const urgencyOf = (hoursLeft) => {
    if (hoursLeft <= 24) return 'danger';
    if (hoursLeft <= 72) return 'warning';
    return 'default';
};

const timeLeftLabel = (hoursLeft) => {
    if (hoursLeft == null) return '';
    if (hoursLeft < 1) return '<1 hr left';
    if (hoursLeft < 48) return `${hoursLeft} hrs left`;
    return `${Math.floor(hoursLeft / 24)} days left`;
};

const AdminHome = () => {
    const navigate = useNavigate();

    const storedUser = (() => {
        try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; }
    })();
    const userDepts = Array.isArray(storedUser.departments) ? storedUser.departments : [];
    const isOverseer = ['Admin', 'monitor'].includes(storedUser.role);
    const lockedDept = (!isOverseer && userDepts.length === 1) ? userDepts[0] : null;

    const [selectedDept, setSelectedDept] = useState(lockedDept || 'Both');
    const [stats, setStats] = useState(EMPTY_STATS);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const response = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/admin/tender-dashboard?dept=${selectedDept}`,
                    { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
                );
                const result = await response.json();
                if (!cancelled && result.success && result.data) {
                    setStats({
                        ...EMPTY_STATS,
                        ...result.data,
                        bidFunnel: { ...EMPTY_STATS.bidFunnel, ...(result.data.bidFunnel || {}) },
                        contracts: { ...EMPTY_STATS.contracts, ...(result.data.contracts || {}) },
                        incidents: { ...EMPTY_STATS.incidents, ...(result.data.incidents || {}) },
                    });
                }
            } catch (error) {
                console.error('Failed to fetch tender dashboard stats', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [selectedDept]);

    const StatCard = ({ icon: Icon, title, value, subtitle, color = 'blue', onClick }) => {
        const colorMap = {
            blue: 'from-blue-500 to-blue-600',
            green: 'from-green-500 to-green-600',
            purple: 'from-purple-500 to-purple-600',
            orange: 'from-orange-500 to-orange-600',
            red: 'from-red-500 to-red-600',
            teal: 'from-teal-500 to-teal-600'
        };

        return (
            <div className="stat-card group" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
                <div className="stat-card-content">
                    <div className={`stat-icon bg-gradient-to-br ${colorMap[color]}`}>
                        <Icon size={24} strokeWidth={2.5} />
                    </div>
                    <div className="stat-details">
                        <p className="stat-title">{title}</p>
                        <h3 className="stat-value">{value}</h3>
                        {subtitle && (
                            <div className="stat-change positive">
                                <span>{subtitle}</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className={`stat-glow ${colorMap[color]}`}></div>
            </div>
        );
    };

    const funnelData = [
        { stage: 'Not Evaluated', count: stats.bidFunnel.notEvaluated, fill: '#94a3b8' },
        { stage: 'Evaluation', count: stats.bidFunnel.evaluation, fill: '#3b82f6' },
        { stage: 'Technical', count: stats.bidFunnel.technicalEvaluation, fill: '#f59e0b' },
        { stage: 'Financial', count: stats.bidFunnel.financialEvaluation, fill: '#8b5cf6' },
        { stage: 'Bid Award', count: stats.bidFunnel.bidAward, fill: '#10b981' },
        { stage: 'Bid/RA Award', count: stats.bidFunnel.bidRaAward, fill: '#059669' }
    ];

    const pipelineData = [
        { name: 'Not Evaluated', value: stats.bidFunnel.notEvaluated, color: '#94a3b8' },
        {
            name: 'In Evaluation',
            value: stats.bidFunnel.evaluation + stats.bidFunnel.technicalEvaluation + stats.bidFunnel.financialEvaluation,
            color: '#f59e0b'
        },
        { name: 'Awarded', value: stats.bidFunnel.bidAward + stats.bidFunnel.bidRaAward, color: '#10b981' }
    ].filter(d => d.value > 0);

    const totalPipeline = pipelineData.reduce((sum, d) => sum + d.value, 0);

    const deptSplitEntries = stats.deptSplit
        ? [
            { name: 'Diagno', value: stats.deptSplit.diagno || 0 },
            { name: 'Endo', value: stats.deptSplit.endo || 0 }
        ]
        : [];
    const deptSplitTotal = deptSplitEntries.reduce((sum, d) => sum + d.value, 0) || 1;

    return (
        <div className="admin-dashboard">
            {/* Header */}
            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-title">Tender Dashboard</h1>
                    <p className="dashboard-subtitle">
                        Live participation pipeline{selectedDept !== 'Both' ? ` — ${selectedDept}` : ' — Diagno & Endo'}
                    </p>
                </div>
                {!lockedDept && (
                    <div className="tender-type-pills">
                        {['Both', 'Diagno', 'Endo'].map(d => (
                            <button
                                key={d}
                                className={`tender-type-pill ${selectedDept === d ? 'active gem' : ''}`}
                                onClick={() => setSelectedDept(d)}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid">
                <StatCard
                    icon={FileText}
                    title="Active Tenders"
                    value={stats.activeTenders}
                    subtitle="Currently pursuing"
                    color="blue"
                    onClick={() => navigate('/Admin/tenders')}
                />
                <StatCard
                    icon={Clock}
                    title="Closing in 7 Days"
                    value={stats.closingSoon}
                    subtitle="Needs action"
                    color="orange"
                    onClick={() => navigate('/Admin/tenders')}
                />
                <StatCard
                    icon={Globe}
                    title="Open Tenders (CPPP)"
                    value={stats.openTenders}
                    subtitle="Non-GEM portals"
                    color="teal"
                    onClick={() => navigate('/Admin/open-dashboard')}
                />
                <StatCard
                    icon={IndianRupee}
                    title="Contract Value"
                    value={formatINR(stats.contracts.totalValue)}
                    subtitle={`${stats.contracts.count} contracts`}
                    color="purple"
                    onClick={() => navigate('/orders/gem-contracts')}
                />
                <StatCard
                    icon={AlertCircle}
                    title="Open Incidents"
                    value={stats.incidents.pendingResponse}
                    subtitle={`${stats.incidents.total} total`}
                    color="red"
                    onClick={() => navigate('/insights/Incident')}
                />
            </div>

            {/* Charts Row */}
            <div className="charts-row">
                {/* Bid Status Funnel */}
                <div className="chart-card large">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">Bid Status Funnel</h3>
                            <p className="chart-subtitle">Where participated tenders stand right now</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={funnelData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="stage" stroke="#6b7280" fontSize={12} interval={0} angle={-15} textAnchor="end" height={50} />
                            <YAxis stroke="#6b7280" fontSize={12} allowDecimals={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                {funnelData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Pipeline Breakdown */}
                <div className="chart-card">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">Pipeline Breakdown</h3>
                            <p className="chart-subtitle">Not evaluated vs in-progress vs awarded</p>
                        </div>
                    </div>
                    {totalPipeline > 0 ? (
                        <>
                            <ResponsiveContainer width="100%" height={240}>
                                <RPieChart>
                                    <Pie
                                        data={pipelineData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={90}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {pipelineData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                                </RPieChart>
                            </ResponsiveContainer>
                            <div className="pie-legend">
                                {pipelineData.map(d => (
                                    <div className="pie-legend-item" key={d.name}>
                                        <span className="legend-color" style={{ backgroundColor: d.color }}></span>
                                        <span className="legend-text">{d.name}</span>
                                        <span className="legend-value">{d.value}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <p className="dashboard-subtitle" style={{ padding: '24px 0', textAlign: 'center' }}>No bid data yet</p>
                    )}
                </div>
            </div>

            {/* Department Split — only shown in combined view */}
            {stats.deptSplit && (
                <div className="operational-metrics-section">
                    <div className="section-header-bar">
                        <h3 className="section-title">
                            <Activity size={20} />
                            Department Split
                        </h3>
                    </div>
                    <div className="department-stats">
                        {deptSplitEntries.map(d => (
                            <div className="dept-stat-item" key={d.name}>
                                <div className="dept-info">
                                    <span className="dept-name">{d.name}</span>
                                    <span className="dept-rate">{Math.round((d.value / deptSplitTotal) * 100)}%</span>
                                </div>
                                <div className="dept-progress-bar">
                                    <div className="dept-progress-fill" style={{ width: `${(d.value / deptSplitTotal) * 100}%` }}></div>
                                </div>
                                <div className="dept-counts">
                                    <span>{d.value} active tenders</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Upcoming Deadlines + Recent Activity */}
            <div className="dual-section-row">
                <div className="activity-section">
                    <div className="section-header-bar">
                        <h3 className="section-title">
                            <Clock size={20} />
                            Upcoming Deadlines
                        </h3>
                        <button className="view-all-btn" onClick={() => navigate('/Admin/tenders')}>View All</button>
                    </div>
                    <div className="activity-list">
                        {stats.upcomingDeadlines.length === 0 && (
                            <p className="dashboard-subtitle" style={{ padding: '12px 0' }}>No active tenders closing soon.</p>
                        )}
                        {stats.upcomingDeadlines.map((t) => {
                            const urgency = urgencyOf(t.hoursLeft);
                            const iconBg = {
                                danger: 'bg-red-100 text-red-700',
                                warning: 'bg-orange-100 text-orange-700',
                                default: 'bg-blue-100 text-blue-700'
                            }[urgency];
                            const valueColor = {
                                danger: '#ef4444',
                                warning: '#f59e0b',
                                default: '#084f9a'
                            }[urgency];

                            return (
                                <div
                                    key={t.bid_number}
                                    className="activity-item"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => navigate(`/tenders/tenderdetails/${encodeURIComponent(toTenderUrlId(t.bid_number))}`)}
                                >
                                    <div className={`activity-icon ${iconBg}`}>
                                        <Clock size={18} />
                                    </div>
                                    <div className="activity-content">
                                        <div className="activity-main">
                                            <span className="activity-action">{t.title || t.bid_number}</span>
                                            <span className="activity-tender">{t.dept}</span>
                                        </div>
                                        <span className="activity-time">{t.bid_number}</span>
                                    </div>
                                    <div className="activity-value" style={{ color: valueColor }}>
                                        {timeLeftLabel(t.hoursLeft)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="activity-section">
                    <div className="section-header-bar">
                        <h3 className="section-title">
                            <Activity size={20} />
                            Recent Activity
                        </h3>
                    </div>
                    <div className="activity-list">
                        {stats.recentActivity.length === 0 && (
                            <p className="dashboard-subtitle" style={{ padding: '12px 0' }}>No recent tender activity.</p>
                        )}
                        {stats.recentActivity.map((a) => (
                            <div
                                key={a.bid_number + a.processing_date}
                                className="activity-item"
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigate(`/tenders/tenderdetails/${encodeURIComponent(toTenderUrlId(a.bid_number))}`)}
                            >
                                <div className="activity-icon bg-blue-100 text-blue-700">
                                    <FileText size={18} />
                                </div>
                                <div className="activity-content">
                                    <div className="activity-main">
                                        <span className="activity-action">{a.title || a.bid_number}</span>
                                        <span className="activity-tender">{a.dept}</span>
                                    </div>
                                    <span className="activity-time">
                                        {a.processing_date ? new Date(a.processing_date).toLocaleString() : ''}
                                    </span>
                                </div>
                                <div className="activity-value" style={{ fontSize: '13px', textTransform: 'capitalize' }}>
                                    {a.status || 'processed'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {loading && <p className="dashboard-subtitle" style={{ marginTop: '16px' }}>Refreshing…</p>}
        </div>
    );
};

export default AdminHome;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText, Clock, Globe, IndianRupee, AlertCircle,
    ArrowUpRight, Activity, TrendingUp, ShieldCheck,
    Headset, Building2, MapPin, Users, LogIn, CalendarCheck, Timer, Award
} from 'lucide-react';
import {
    BarChart, Bar, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area
} from 'recharts';
import '../../assets/css/AdminHome.css';

const EMPTY_STATS = {
    dept: 'Both',
    activeTenders: 0,
    closingSoon: 0,
    openTenders: 0,
    contracts: { count: 0, totalValue: 0 },
    incidents: { total: 0, pendingResponse: 0 },
    deptSplit: null,
    pipelineValue: 0,
    emdLocked: 0,
    topStates: [],
    supportTickets: { open: 0, inProgress: 0, resolved: 0, closed: 0, total: 0 },
    distributors: { total: 0, active: 0 },
    contractsTrend: [],
    userActivity: { activeNow: 0, loginsToday: 0, loginsWeek: 0, avgSessionSeconds: 0, trend: [] },
    topSellers: [],
    upcomingDeadlines: [],
    recentActivity: []
};

const AUTO_REFRESH_MS = 60000;

const STATE_COLORS = ['#084f9a', '#0d9488', '#7c3aed', '#d97706', '#0ea5e9', '#dc2626'];
const CONTRACT_BAR_COLORS = ['#a5c4e8', '#7ba7db', '#4f8bce', '#084f9a', '#0a5fb5', '#063a73'];
const SELLER_COLORS = ['#084f9a', '#0d9488', '#7c3aed', '#d97706', '#dc2626'];

const formatINR = (value) => {
    const v = Number(value) || 0;
    if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
    if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
    if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)} K`;
    return `₹${v.toFixed(0)}`;
};

const useCountUp = (target, duration = 800) => {
    const [display, setDisplay] = useState(0);
    const fromRef = useRef(0);

    useEffect(() => {
        const from = fromRef.current;
        const to = Number(target) || 0;
        const start = performance.now();
        let raf;
        const tick = (now) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(from + (to - from) * eased);
            if (p < 1) {
                raf = requestAnimationFrame(tick);
            } else {
                fromRef.current = to;
                setDisplay(to);
            }
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);

    return display;
};

const CountUp = ({ value, format }) => {
    const display = useCountUp(value);
    return format ? format(display) : Math.round(display).toLocaleString('en-IN');
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

    // Department scoping is enforced server-side from the caller's assignment
    // (see backend utils/userScope.js) — the client no longer chooses a dept.
    const [stats, setStats] = useState(EMPTY_STATS);
    const [loading, setLoading] = useState(true);

    const loadStats = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/admin/tender-dashboard`,
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            const result = await response.json();
            if (result.success && result.data) {
                setStats({
                    ...EMPTY_STATS,
                    ...result.data,
                    contracts: { ...EMPTY_STATS.contracts, ...(result.data.contracts || {}) },
                    incidents: { ...EMPTY_STATS.incidents, ...(result.data.incidents || {}) },
                    userActivity: { ...EMPTY_STATS.userActivity, ...(result.data.userActivity || {}) },
                    supportTickets: { ...EMPTY_STATS.supportTickets, ...(result.data.supportTickets || {}) },
                    distributors: { ...EMPTY_STATS.distributors, ...(result.data.distributors || {}) },
                });
            }
        } catch (error) {
            console.error('Failed to fetch tender dashboard stats', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStats();
        const interval = setInterval(() => loadStats({ silent: true }), AUTO_REFRESH_MS);
        return () => clearInterval(interval);
    }, [loadStats]);

    const StatCard = ({ icon: Icon, title, value, format, subtitle, color = 'blue', onClick }) => {
        return (
            <div className="stat-card group" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
                <div className="stat-card-content">
                    <div className="stat-details">
                        <h3 className="stat-value"><CountUp value={value} format={format} /></h3>
                        <p className="stat-title">{title}</p>
                    </div>
                    <div className={`stat-icon-chip stat-icon-chip--${color}`}>
                        <Icon size={20} strokeWidth={2} />
                    </div>
                </div>
                {onClick && (
                    <button
                        type="button"
                        className="stat-detail-link"
                        onClick={(e) => { e.stopPropagation(); onClick(); }}
                    >
                        View Details
                        <ArrowUpRight size={14} />
                    </button>
                )}
                {!onClick && subtitle && (
                    <div className="stat-change positive">
                        <span>{subtitle}</span>
                    </div>
                )}
            </div>
        );
    };

    const deptSplitEntries = stats.deptSplit
        ? [
            { name: 'Diagno', value: stats.deptSplit.diagno || 0 },
            { name: 'Endo', value: stats.deptSplit.endo || 0 }
        ]
        : [];
    const deptSplitTotal = deptSplitEntries.reduce((sum, d) => sum + d.value, 0) || 1;

    const loginTrendData = (stats.userActivity.trend || []).map(r => ({
        day: new Date(r.day).toLocaleDateString('en-IN', { weekday: 'short' }),
        count: Number(r.count)
    }));

    const avgSessionLabel = (() => {
        const s = stats.userActivity.avgSessionSeconds || 0;
        if (s < 60) return `${s}s`;
        const m = Math.round(s / 60);
        if (m < 60) return `${m}m`;
        return `${(m / 60).toFixed(1)}h`;
    })();

    return (
        <div className="admin-dashboard">
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
                    value={stats.contracts.totalValue}
                    format={formatINR}
                    subtitle={`${stats.contracts.count} contracts`}
                    color="purple"
                    onClick={() => navigate('/orders/gem-contracts')}
                />
                <StatCard
                    icon={TrendingUp}
                    title="Active Pipeline Value"
                    value={stats.pipelineValue}
                    format={formatINR}
                    subtitle="Est. value, open tenders"
                    color="navy"
                    onClick={() => navigate('/Admin/tenders')}
                />
                <StatCard
                    icon={ShieldCheck}
                    title="EMD Locked"
                    value={stats.emdLocked}
                    format={formatINR}
                    subtitle="Across active bids"
                    color="green"
                    onClick={() => navigate('/Admin/tenders')}
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

            {/* Charts Row: User Activity + Top Sellers */}
            <div className="charts-row-2">
                {/* User Activity */}
                <div className="chart-card">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">User Activity</h3>
                            <p className="chart-subtitle">Platform engagement, last 7 days</p>
                        </div>
                        <Users size={18} color="#084f9a" />
                    </div>
                    <div className="mini-stat-grid">
                        <div className="mini-stat-item mini-stat-item--live">
                            <span className="live-dot"></span>
                            <Activity size={15} color="#10b981" />
                            <span className="mini-stat-value"><CountUp value={stats.userActivity.activeNow} /></span>
                            <span className="mini-stat-label">Active Now</span>
                        </div>
                        <div className="mini-stat-item">
                            <LogIn size={15} color="#084f9a" />
                            <span className="mini-stat-value"><CountUp value={stats.userActivity.loginsToday} /></span>
                            <span className="mini-stat-label">Logins Today</span>
                        </div>
                        <div className="mini-stat-item">
                            <CalendarCheck size={15} color="#7c3aed" />
                            <span className="mini-stat-value"><CountUp value={stats.userActivity.loginsWeek} /></span>
                            <span className="mini-stat-label">Logins / Week</span>
                        </div>
                        <div className="mini-stat-item">
                            <Timer size={15} color="#d97706" />
                            <span className="mini-stat-value">{avgSessionLabel}</span>
                            <span className="mini-stat-label">Avg Session</span>
                        </div>
                    </div>
                    {loginTrendData.some(d => d.count > 0) ? (
                        <ResponsiveContainer width="100%" height={160}>
                            <AreaChart data={loginTrendData}>
                                <defs>
                                    <linearGradient id="loginFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#084f9a" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="#084f9a" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
                                <YAxis stroke="#6b7280" fontSize={12} allowDecimals={false} />
                                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                                <Area type="monotone" dataKey="count" stroke="#084f9a" strokeWidth={2.5} fill="url(#loginFill)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="dashboard-subtitle" style={{ padding: '16px 0', textAlign: 'center' }}>No login activity this week</p>
                    )}
                </div>

                {/* Top Sellers */}
                <div className="chart-card">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">Top Sellers by Contract Value</h3>
                            <p className="chart-subtitle">Competitor & own revenue on record</p>
                        </div>
                        <Award size={18} color="#d97706" />
                    </div>
                    {stats.topSellers.length > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={stats.topSellers} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                                <XAxis type="number" stroke="#6b7280" fontSize={12} tickFormatter={formatINR} />
                                <YAxis type="category" dataKey="sellerName" stroke="#6b7280" fontSize={12} width={110} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                                    formatter={(value) => formatINR(value)}
                                />
                                <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                                    {stats.topSellers.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={SELLER_COLORS[index % SELLER_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="dashboard-subtitle" style={{ padding: '24px 0', textAlign: 'center' }}>No contract data yet</p>
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

            {/* Insights row: States, Support Tickets, Distributor Network */}
            <div className="insights-row">
                <div className="chart-card">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">Tenders by State</h3>
                            <p className="chart-subtitle">Top active markets</p>
                        </div>
                        <MapPin size={18} color="#084f9a" />
                    </div>
                    {stats.topStates.length > 0 ? (
                        <div className="state-bar-list">
                            {stats.topStates.map((s, i) => {
                                const max = stats.topStates[0].count || 1;
                                return (
                                    <div className="state-bar-row" key={s.state}>
                                        <span className="state-bar-label">{s.state}</span>
                                        <div className="state-bar-track">
                                            <div
                                                className="state-bar-fill"
                                                style={{ width: `${(s.count / max) * 100}%`, background: STATE_COLORS[i % STATE_COLORS.length] }}
                                            ></div>
                                        </div>
                                        <span className="state-bar-count">{s.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="dashboard-subtitle" style={{ padding: '24px 0', textAlign: 'center' }}>No state data yet</p>
                    )}
                </div>

                <div className="chart-card">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">Support Tickets</h3>
                            <p className="chart-subtitle">{stats.supportTickets.total} total</p>
                        </div>
                        <Headset size={18} color="#7c3aed" />
                    </div>
                    <div className="ticket-status-grid">
                        {[
                            { label: 'Open', value: stats.supportTickets.open, color: '#ef4444' },
                            { label: 'In Progress', value: stats.supportTickets.inProgress, color: '#f59e0b' },
                            { label: 'Resolved', value: stats.supportTickets.resolved, color: '#0ea5e9' },
                            { label: 'Closed', value: stats.supportTickets.closed, color: '#10b981' }
                        ].map(t => (
                            <div className="ticket-status-item" key={t.label}>
                                <span className="ticket-status-dot" style={{ background: t.color }}></span>
                                <span className="ticket-status-label">{t.label}</span>
                                <span className="ticket-status-value" style={{ color: t.color }}>{t.value}</span>
                            </div>
                        ))}
                    </div>
                    <button className="view-all-btn" style={{ width: '100%', marginTop: '16px' }} onClick={() => navigate('/Admin/support-tickets')}>
                        View All Tickets
                    </button>
                </div>

                <div className="chart-card">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">Distributor Network</h3>
                            <p className="chart-subtitle">Registered dealers</p>
                        </div>
                        <Building2 size={18} color="#0d9488" />
                    </div>
                    <div className="distributor-stat-block">
                        <div className="distributor-stat-num"><CountUp value={stats.distributors.total} /></div>
                        <div className="distributor-stat-label">Total Distributors</div>
                    </div>
                    <div className="distributor-progress-wrap">
                        <div className="dept-progress-bar">
                            <div
                                className="dept-progress-fill"
                                style={{
                                    width: `${stats.distributors.total > 0 ? (stats.distributors.active / stats.distributors.total) * 100 : 0}%`,
                                    background: 'linear-gradient(90deg, #0d9488 0%, #10b981 100%)'
                                }}
                            ></div>
                        </div>
                        <div className="distributor-progress-label">
                            <span>{stats.distributors.active} active</span>
                            <span>{stats.distributors.total - stats.distributors.active} inactive</span>
                        </div>
                    </div>
                    <button className="view-all-btn" style={{ width: '100%', marginTop: '16px' }} onClick={() => navigate('/dealers/distributors')}>
                        View All Distributors
                    </button>
                </div>
            </div>

            {/* Contract Value Trend */}
            {stats.contractsTrend.length > 0 && (
                <div className="chart-card" style={{ marginBottom: '24px' }}>
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">Contract Value Trend</h3>
                            <p className="chart-subtitle">Awarded value by month, last 6 months</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={stats.contractsTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                            <YAxis stroke="#6b7280" fontSize={12} tickFormatter={formatINR} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                                formatter={(value) => formatINR(value)}
                            />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {stats.contractsTrend.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={CONTRACT_BAR_COLORS[index % CONTRACT_BAR_COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
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

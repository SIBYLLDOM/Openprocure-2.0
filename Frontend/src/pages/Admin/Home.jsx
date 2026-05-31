import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, FileText, AlertCircle, CheckCircle, Clock, Package, Users, BarChart3, PieChart, Activity, Download, Filter, Search, ArrowUpRight, ArrowDownRight, Calendar, Target, Award, Zap } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart as RPieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import '../../assets/css/AdminHome.css';

const AdminHome = () => {
    const [activeTab, setActiveTab] = useState('participated-tender');
    const [animatedValues, setAnimatedValues] = useState({});
    const [dashboardStats, setDashboardStats] = useState({
        bids: { total: "0", won: "0", lost: "0", totalCharges: "0" },
        incidents: { total: "0", pendingResponse: "0", pendingResolution: "0" },
        tenderProcessing: { totalOrders: "0", pendingAcceptance: "0", pendingDelivery: "0" },
        products: { total: "0", published: "0", pendingApproval: "0" },
        orders: { pendingAcceptance: "0", pendingDelivery: "0" },
        incidentTrend: [],
        recentActivity: []
    });

    useEffect(() => {
        const loadTabStats = async () => {
            // Fetch live data from backend
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/dashboard-stats?dept=${activeTab.toLowerCase()}&tenderType=GEM`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                const result = await response.json();
                if (result.success && result.data) {
                    setDashboardStats(result.data);
                }
            } catch (error) {
                console.error("Failed to fetch dashboard stats", error);
            }
        };

        loadTabStats();
    }, [activeTab]);

    const data = dashboardStats;

    useEffect(() => {
        const timer = setTimeout(() => {
            setAnimatedValues({});
        }, 100);
        return () => clearTimeout(timer);
    }, [activeTab]);

    const StatCard = ({ icon: Icon, title, value, change, trend, color = 'blue' }) => {
        const isPositive = change?.startsWith('+');
        const colorMap = {
            blue: 'from-blue-500 to-blue-600',
            green: 'from-green-500 to-green-600',
            purple: 'from-purple-500 to-purple-600',
            orange: 'from-orange-500 to-orange-600'
        };

        return (
            <div className="stat-card group">
                <div className="stat-card-content">
                    <div className={`stat-icon bg-gradient-to-br ${colorMap[color]}`}>
                        <Icon size={24} strokeWidth={2.5} />
                    </div>
                    <div className="stat-details">
                        <p className="stat-title">{title}</p>
                        <h3 className="stat-value">{value}</h3>
                        {change && (
                            <div className={`stat-change ${isPositive ? 'positive' : 'negative'}`}>
                                {isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                <span>{change}</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className={`stat-glow ${colorMap[color]}`}></div>
            </div>
        );
    };

    const QuickMetric = ({ icon: Icon, label, value, status = 'default' }) => {
        const statusColors = {
            success: 'text-green-600 bg-green-50 border-green-200',
            warning: 'text-orange-600 bg-orange-50 border-orange-200',
            danger: 'text-red-600 bg-red-50 border-red-200',
            default: 'text-blue-600 bg-blue-50 border-blue-200'
        };

        return (
            <div className={`quick-metric ${statusColors[status]}`}>
                <Icon size={18} />
                <div>
                    <p className="metric-label">{label}</p>
                    <p className="metric-value">{value}</p>
                </div>
            </div>
        );
    };

    return (
        <div className="admin-dashboard">
            {/* Header */}


            {/* Category Tabs + Tender Type Filter — single row */}
            <div className="category-tabs-modern">
                <button
                    className={`tab-modern ${activeTab === 'participated-tender' ? 'active' : ''}`}
                    onClick={() => setActiveTab('participated-tender')}
                >
                    <Activity size={20} />
                    <span>Participated Tender</span>
                    <div className="tab-indicator"></div>
                </button>
                <button
                    className={`tab-modern ${activeTab === 'workdesk' ? 'active' : ''}`}
                    onClick={() => setActiveTab('workdesk')}
                >
                    <Package size={20} />
                    <span>Workdesk</span>
                    <div className="tab-indicator"></div>
                </button>
                <button
                    className={`tab-modern ${activeTab === 'active-workspaces' ? 'active' : ''}`}
                    onClick={() => setActiveTab('active-workspaces')}
                >
                    <Users size={20} />
                    <span>Active Workspaces</span>
                    <div className="tab-indicator"></div>
                </button>
                <button
                    className={`tab-modern ${activeTab === 'gem-contracts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('gem-contracts')}
                >
                    <FileText size={20} />
                    <span>GEM Contracts</span>
                    <div className="tab-indicator"></div>
                </button>
                <button
                    className={`tab-modern ${activeTab === 'carting-dashboard' ? 'active' : ''}`}
                    onClick={() => setActiveTab('carting-dashboard')}
                >
                    <Zap size={20} />
                    <span>Carting Dashboard</span>
                    <div className="tab-indicator"></div>
                </button>
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid">
                <StatCard
                    icon={FileText}
                    title="Total Bids"
                    value={data.bids?.total || "0"}
                    color="blue"
                />
                <StatCard
                    icon={CheckCircle}
                    title="Bids Won"
                    value={data.bids?.won || "0"}
                    color="green"
                />
                <StatCard
                    icon={AlertCircle}
                    title="Bids Lost"
                    value={data.bids?.lost || "0"}
                    color="orange"
                />
                <StatCard
                    icon={DollarSign}
                    title="Published Products"
                    value={`₹${data.bids?.totalCharges || "0"}`}
                    color="purple"
                />
            </div>

            {/* Operational Metrics - Professional Cards */}
            <div className="operational-metrics-section">
                <div className="section-header-bar">
                    <h3 className="section-title">
                        <Activity size={20} />
                        Operational Metrics
                    </h3>
                </div>
                <div className="operational-metrics-grid">
                    {/* Bids Metrics */}
                    <div className="metric-group-card">
                        <div className="metric-group-header">
                            <FileText size={18} />
                            <span>Bid Statistics</span>
                        </div>
                        <div className="metric-items">
                            <div className="metric-item">
                                <span className="metric-item-label">Total Bids</span>
                                <span className="metric-item-value">{data.bids?.total || "0"}</span>
                            </div>
                            <div className="metric-item success">
                                <span className="metric-item-label">Bids Won</span>
                                <span className="metric-item-value">{data.bids?.won || "0"}</span>
                            </div>
                            <div className="metric-item danger">
                                <span className="metric-item-label">Bids Lost</span>
                                <span className="metric-item-value">{data.bids?.lost || "0"}</span>
                            </div>

                        </div>
                    </div>

                    {/* Incidents Metrics */}
                    <div className="metric-group-card">
                        <div className="metric-group-header">
                            <AlertCircle size={18} />
                            <span>Incident Tracking</span>
                        </div>
                        <div className="metric-items">
                            <div className="metric-item">
                                <span className="metric-item-label">Total Incidents</span>
                                <span className="metric-item-value">{data.incidents?.total || "0"}</span>
                            </div>
                            <div className={`metric-item ${data.incidents?.pendingResponse === "0" ? "success" : "warning"}`}>
                                <span className="metric-item-label">Pending Response</span>
                                <span className="metric-item-value">{data.incidents?.pendingResponse || "0"}</span>
                            </div>
                            <div className="metric-item success">
                                <span className="metric-item-label">Closed/Rejected</span>
                                <span className="metric-item-value">{data.incidents?.pendingResolution || "0"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Orders Metrics */}
                    <div className="metric-group-card">
                        <div className="metric-group-header">
                            <Package size={18} />
                            <span>Order Management</span>
                        </div>
                        <div className="metric-items">
                            <div className="metric-item">
                                <span className="metric-item-label">Total Orders</span>
                                <span className="metric-item-value">{data.tenderProcessing?.totalOrders || "0"}</span>
                            </div>
                            <div className={`metric-item ${data.tenderProcessing?.pendingAcceptance === "0" ? "success" : "warning"}`}>
                                <span className="metric-item-label">Pending Acceptance</span>
                                <span className="metric-item-value">{data.tenderProcessing?.pendingAcceptance || "0"}</span>
                            </div>
                            <div className="metric-item warning">
                                <span className="metric-item-label">Pending Delivery</span>
                                <span className="metric-item-value">{data.tenderProcessing?.pendingDelivery || "0"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Products Metrics */}
                    <div className="metric-group-card">
                        <div className="metric-group-header">
                            <Package size={18} />
                            <span>Product Catalog</span>
                        </div>
                        <div className="metric-items">
                            <div className="metric-item">
                                <span className="metric-item-label">Total Products</span>
                                <span className="metric-item-value">{data.products?.total || "0"}</span>
                            </div>
                            <div className="metric-item success">
                                <span className="metric-item-label">Published</span>
                                <span className="metric-item-value">{data.products?.published || "0"}</span>
                            </div>
                            <div className="metric-item warning">
                                <span className="metric-item-label">Pending Approval</span>
                                <span className="metric-item-value">{data.products?.pendingApproval || "0"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 1 */}
            <div className="charts-row">
                {/* Incident Tracking Analysis */}
                <div className="chart-card large">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">Incident Tracking Analysis</h3>
                            <p className="chart-subtitle">Monthly incident resolution trends</p>
                        </div>
                        <div className="chart-legend-custom">
                            <span className="legend-item"><span className="legend-dot" style={{ background: '#3b82f6' }}></span>Raised</span>
                            <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }}></span>Pending</span>
                            <span className="legend-item"><span className="legend-dot" style={{ background: '#10b981' }}></span>Closed</span>
                            <span className="legend-item"><span className="legend-dot" style={{ background: '#ef4444' }}></span>Rejected</span>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={data.incidentTrend || []}>
                            <defs>
                                <linearGradient id="colorRaised" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorClosed" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorRejected" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                            <YAxis stroke="#6b7280" fontSize={12} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                            />
                            <Area type="monotone" dataKey="raised" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorRaised)" />
                            <Area type="monotone" dataKey="pendingResponse" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorPending)" />
                            <Area type="monotone" dataKey="closed" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorClosed)" />
                            <Area type="monotone" dataKey="rejected" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorRejected)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Order Status Distribution */}
                <div className="chart-card">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">Order Status Distribution</h3>
                            <p className="chart-subtitle">Order breakdown by status</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <RPieChart>
                            <Pie
                                data={[
                                    {
                                        name: 'Completed Orders',
                                        value: parseInt(data.tenderProcessing.totalOrders) - parseInt(data.tenderProcessing.pendingAcceptance) - parseInt(data.tenderProcessing.pendingDelivery),
                                        color: '#10b981'
                                    },
                                    {
                                        name: 'Pending Acceptance',
                                        value: parseInt(data.tenderProcessing.pendingAcceptance),
                                        color: '#f59e0b'
                                    },
                                    {
                                        name: 'Pending Delivery',
                                        value: parseInt(data.tenderProcessing.pendingDelivery),
                                        color: '#3b82f6'
                                    }
                                ]}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {[
                                    { color: '#10b981' },
                                    { color: '#f59e0b' },
                                    { color: '#3b82f6' }
                                ].map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                            />
                        </RPieChart>
                    </ResponsiveContainer>
                    <div className="pie-legend">
                        <div className="pie-legend-item">
                            <span className="legend-color" style={{ backgroundColor: '#10b981' }}></span>
                            <span className="legend-text">Completed Orders</span>
                            <span className="legend-value">{parseInt(data.tenderProcessing.totalOrders) - parseInt(data.tenderProcessing.pendingAcceptance) - parseInt(data.tenderProcessing.pendingDelivery)}</span>
                        </div>
                        <div className="pie-legend-item">
                            <span className="legend-color" style={{ backgroundColor: '#f59e0b' }}></span>
                            <span className="legend-text">Pending Acceptance</span>
                            <span className="legend-value">{data.tenderProcessing.pendingAcceptance}</span>
                        </div>
                        <div className="pie-legend-item">
                            <span className="legend-color" style={{ backgroundColor: '#3b82f6' }}></span>
                            <span className="legend-text">Pending Delivery</span>
                            <span className="legend-value">{data.tenderProcessing.pendingDelivery}</span>
                        </div>
                    </div>
                </div>
            </div>





            {/* Recent Activity */}
            <div className="activity-section">
                <div className="section-header-bar">
                    <h3 className="section-title">
                        <Clock size={20} />
                        Recent Activity
                    </h3>
                    <button className="view-all-btn">View All</button>
                </div>
                <div className="activity-list">
                    {(data.recentActivity || []).map((activity) => {
                        const statusConfig = {
                            success: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
                            info: { bg: 'bg-blue-100', text: 'text-blue-700', icon: FileText },
                            closed: { bg: 'bg-gray-100', text: 'text-gray-700', icon: AlertCircle },
                            danger: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle }
                        };
                        const config = statusConfig[activity.type];
                        const ActivityIcon = config.icon;

                        return (
                            <div key={activity.id} className="activity-item">
                                <div className={`activity-icon ${config.bg} ${config.text}`}>
                                    <ActivityIcon size={18} />
                                </div>
                                <div className="activity-content">
                                    <div className="activity-main">
                                        <span className="activity-action">{activity.action}</span>
                                        <span className="activity-tender">{activity.tender}</span>
                                    </div>
                                    <span className="activity-time">{activity.time}</span>
                                </div>
                                <div className="activity-value">{activity.value}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default AdminHome;
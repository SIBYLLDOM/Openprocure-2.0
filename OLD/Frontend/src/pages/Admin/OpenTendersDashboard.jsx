import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, FileText, AlertCircle, CheckCircle, Clock, Package, Users, BarChart3, PieChart, Activity, Download, Filter, Search, ArrowUpRight, ArrowDownRight, Calendar, Target, Award, Zap } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart as RPieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import indiaGeoJson from '../../assets/data/india-states.json';
import '../../assets/css/AdminHome.css';

const DASHBOARD_DATA = {
    Diagno: {
        kpi: {
            relevant: "250",
            scanned: "800",
            bidsWon: "45",
            bidsLost: "110",
            totalOrders: "35",
            totalAmount: "₹2.5Cr"
        },
        bids: { total: "155", won: "45", lost: "110" },
        orders: { total: "35", delivered: "20", pending: "15" },
        stateStats: [
            { state: 'Maharashtra', count: 45 },
            { state: 'Delhi', count: 38 },
            { state: 'Karnataka', count: 32 },
            { state: 'Gujarat', count: 28 },
            { state: 'Tamil Nadu', count: 25 },
        ],
        recentActivity: [
            { id: 1, action: 'Bid Won (Open)', tender: 'TND/2024/001', value: '₹45.2L', time: '2 hours ago', type: 'success' },
            { id: 2, action: 'Order Delivered', tender: 'TND/2024/002', value: '₹32.8L', time: '5 hours ago', type: 'success' },
            { id: 3, action: 'Bid Submitted', tender: 'TND/2024/003', value: '₹28.5L', time: '1 day ago', type: 'info' },
            { id: 4, action: 'Bid Lost', tender: 'TND/2024/004', value: '₹52.1L', time: '2 days ago', type: 'danger' }
        ]
    },
    Endo: {
        kpi: {
            relevant: "180",
            scanned: "500",
            bidsWon: "30",
            bidsLost: "80",
            totalOrders: "25",
            totalAmount: "₹1.8Cr"
        },
        bids: { total: "110", won: "30", lost: "80" },
        orders: { total: "25", delivered: "15", pending: "10" },
        stateStats: [
            { state: 'Uttar Pradesh', count: 40 },
            { state: 'Punjab', count: 30 },
            { state: 'Delhi', count: 25 },
            { state: 'Haryana', count: 20 },
            { state: 'Rajasthan', count: 18 },
        ],
        recentActivity: [
            { id: 1, action: 'Bid Won (Open)', tender: 'TND/2024/E01', value: '₹65.3L', time: '1 hour ago', type: 'success' },
            { id: 2, action: 'Bid Submitted', tender: 'TND/2024/E02', value: '₹42.7L', time: '4 hours ago', type: 'info' },
            { id: 3, action: 'Bid Closed', tender: 'TND/2024/E03', value: '₹38.2L', time: '1 day ago', type: 'closed' },
            { id: 4, action: 'Order Pending', tender: 'TND/2024/E04', value: '₹55.8L', time: '3 days ago', type: 'warning' }
        ]
    }
};

const TenderStateMap = ({ data }) => {
    const geographyData = indiaGeoJson;

    const getStateData = (geoName) => {
        if (!geoName) return null;
        return data.find(d => d.state.toLowerCase() === geoName.toLowerCase());
    };

    if (!geographyData) {
        return <div style={{ padding: '20px', textAlign: 'center' }}>Loading Map...</div>;
    }

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, position: 'relative', minHeight: '300px' }}>
                <ComposableMap
                    projection="geoMercator"
                    projectionConfig={{
                        scale: 1000,
                        center: [78.9629, 22.5937]
                    }}
                    style={{ width: "100%", height: "100%" }}
                >
                    <Geographies geography={geographyData}>
                        {({ geographies }) =>
                            geographies.map((geo) => {
                                const stateData = getStateData(geo.properties.name);
                                const tooltipContent = stateData ? `
                                    <div style="text-align: left; padding: 4px;">
                                        <strong>${geo.properties.name}</strong><br/>
                                        Tenders: ${stateData.count}
                                    </div>
                                ` : `
                                    <div style="text-align: left; padding: 4px;">
                                        <strong>${geo.properties.name}</strong><br/>
                                        No Data
                                    </div>
                                `;

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        data-tooltip-id="state-map-tooltip"
                                        data-tooltip-html={tooltipContent}
                                        style={{
                                            default: {
                                                fill: stateData ? "#3b82f6" : "#f3f4f6",
                                                stroke: "#d1d5db",
                                                strokeWidth: 0.75,
                                                outline: "none"
                                            },
                                            hover: {
                                                fill: stateData ? "#2563eb" : "#e5e7eb",
                                                stroke: "#9ca3af",
                                                strokeWidth: 1,
                                                outline: "none",
                                                cursor: "pointer"
                                            },
                                            pressed: {
                                                fill: "#1d4ed8",
                                                stroke: "#6b7280",
                                                strokeWidth: 1,
                                                outline: "none"
                                            }
                                        }}
                                    />
                                );
                            })
                        }
                    </Geographies>
                </ComposableMap>
            </div>

            <ReactTooltip id="state-map-tooltip" float style={{ backgroundColor: "#1f2937", color: "#fff", zIndex: 100, borderRadius: '8px' }} />

            <div style={{
                marginTop: '10px',
                padding: '10px 0 0 0',
                borderTop: '1px solid #f3f4f6',
                fontSize: '12px',
                color: '#6b7280',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '15px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></span>
                    <span>Has Tenders</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '2px' }}></span>
                    <span>No Data</span>
                </div>
            </div>
        </div>
    );
};

const OpenTendersDashboard = () => {
    const [activeTab, setActiveTab] = useState('Diagno');
    const [animatedValues, setAnimatedValues] = useState({});
    const [dashboardStats, setDashboardStats] = useState(DASHBOARD_DATA['Diagno']);

    useEffect(() => {
        const loadTabStats = async () => {
            // 1. Reset to base static data for the new tab immediately
            const baseData = DASHBOARD_DATA[activeTab];
            setDashboardStats(baseData);

            // 2. Fetch live data
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/dashboard-stats?dept=${activeTab.toLowerCase()}&tenderType=Open`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                const result = await response.json();
                if (result.success && result.data) {
                    setDashboardStats(prev => ({
                        ...prev,
                        ...result.data,
                        kpi: result.data.kpi || prev.kpi,
                        bids: { ...prev.bids, ...result.data.bids },
                        orders: { ...prev.orders, ...result.data.orders },
                        stateStats: result.data.stateStats || prev.stateStats,
                        recentActivity: result.data.recentActivity || prev.recentActivity
                    }));
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
                    className={`tab-modern ${activeTab === 'Diagno' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Diagno')}
                >
                    <Activity size={20} />
                    <span>Diagnostic Division</span>
                    <div className="tab-indicator"></div>
                </button>
                <button
                    className={`tab-modern ${activeTab === 'Endo' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Endo')}
                >
                    <Package size={20} />
                    <span>EndoSurgery Division</span>
                    <div className="tab-indicator"></div>
                </button>
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid">
                <StatCard
                    icon={Target}
                    title="Relevant / Scanned Tenders"
                    value={`${data.kpi?.relevant || 0} / ${data.kpi?.scanned || 0}`}
                    color="blue"
                />
                <StatCard
                    icon={CheckCircle}
                    title="Bids Won"
                    value={data.kpi?.bidsWon || 0}
                    color="green"
                />
                <StatCard
                    icon={AlertCircle}
                    title="Bids Lost"
                    value={data.kpi?.bidsLost || 0}
                    color="orange"
                />
                <StatCard
                    icon={Package}
                    title="Orders / Total Amt"
                    value={`${data.kpi?.totalOrders || 0} / ${data.kpi?.totalAmount || '₹0'}`}
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
                <div className="operational-metrics-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                    {/* Bids Metrics */}
                    <div className="metric-group-card">
                        <div className="metric-group-header">
                            <FileText size={18} />
                            <span>Bid Statistics</span>
                        </div>
                        <div className="metric-items">
                            <div className="metric-item">
                                <span className="metric-item-label">Total Bids</span>
                                <span className="metric-item-value">{data.bids?.total || 0}</span>
                            </div>
                            <div className="metric-item success">
                                <span className="metric-item-label">Bids Won</span>
                                <span className="metric-item-value">{data.bids?.won || 0}</span>
                            </div>
                            <div className="metric-item danger">
                                <span className="metric-item-label">Bids Lost</span>
                                <span className="metric-item-value">{data.bids?.lost || 0}</span>
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
                                <span className="metric-item-value">{data.orders?.total || 0}</span>
                            </div>
                            <div className="metric-item success">
                                <span className="metric-item-label">Orders Delivered</span>
                                <span className="metric-item-value">{data.orders?.delivered || 0}</span>
                            </div>
                            <div className="metric-item warning">
                                <span className="metric-item-label">Orders Pending</span>
                                <span className="metric-item-value">{data.orders?.pending || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 1 */}
            <div className="charts-row">
                {/* State Wise Tenders Analysis */}
                <div className="chart-card large">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">State-wise Tenders Analysis</h3>
                            <p className="chart-subtitle">Distribution of open tenders across states</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={350}>
                        <TenderStateMap data={data.stateStats || []} />
                    </ResponsiveContainer>
                </div>

                {/* Order Stats Distribution */}
                <div className="chart-card">
                    <div className="chart-header">
                        <div>
                            <h3 className="chart-title">Order Stats Distribution</h3>
                            <p className="chart-subtitle">Order breakdown by status</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <RPieChart>
                            <Pie
                                data={[
                                    {
                                        name: 'Orders Delivered',
                                        value: parseInt(data.orders?.delivered || 0),
                                        color: '#10b981'
                                    },
                                    {
                                        name: 'Pending Delivery',
                                        value: parseInt(data.orders?.pending || 0),
                                        color: '#f59e0b'
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
                                    { color: '#f59e0b' }
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
                            <span className="legend-text">Orders Delivered</span>
                            <span className="legend-value">{parseInt(data.orders?.delivered || 0)}</span>
                        </div>
                        <div className="pie-legend-item">
                            <span className="legend-color" style={{ backgroundColor: '#f59e0b' }}></span>
                            <span className="legend-text">Pending Delivery</span>
                            <span className="legend-value">{parseInt(data.orders?.pending || 0)}</span>
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
                    {data.recentActivity.map((activity) => {
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

export default OpenTendersDashboard;
// DealerTracker.jsx
import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { X, TrendingUp, TrendingDown, Award, FileText, CheckCircle, XCircle } from 'lucide-react';
import "../../assets/css/Dealer-Performance.css";

// Sample dealer data
const dealersData = [
  {
    id: 1,
    name: "ABC Enterprises",
    contact: "John Doe",
    email: "john@abc.com",
    phone: "+91 98765 43210",
    totalTenders: 45,
    won: 28,
    lost: 12,
    pending: 5,
    authorizations: 32,
    winRate: 62,
    recentTenders: [
      { name: "Construction Project A", status: "won", value: "₹25L", date: "2024-01-15" },
      { name: "Supply Contract B", status: "lost", value: "₹18L", date: "2024-01-10" },
      { name: "Infrastructure Work", status: "won", value: "₹42L", date: "2024-01-05" },
      { name: "Equipment Purchase", status: "pending", value: "₹30L", date: "2024-01-20" }
    ],
    monthlyPerformance: [
      { month: 'Jan', won: 5, lost: 2 },
      { month: 'Feb', won: 4, lost: 3 },
      { month: 'Mar', won: 6, lost: 1 },
      { month: 'Apr', won: 7, lost: 2 },
      { month: 'May', won: 6, lost: 4 }
    ]
  },
  {
    id: 2,
    name: "XYZ Solutions",
    contact: "Jane Smith",
    email: "jane@xyz.com",
    phone: "+91 98765 43211",
    totalTenders: 38,
    won: 22,
    lost: 10,
    pending: 6,
    authorizations: 25,
    winRate: 58,
    recentTenders: [
      { name: "Tech Implementation", status: "won", value: "₹35L", date: "2024-01-18" },
      { name: "Service Agreement", status: "won", value: "₹22L", date: "2024-01-12" },
      { name: "Maintenance Contract", status: "lost", value: "₹15L", date: "2024-01-08" },
      { name: "Consulting Project", status: "pending", value: "₹28L", date: "2024-01-22" }
    ],
    monthlyPerformance: [
      { month: 'Jan', won: 4, lost: 2 },
      { month: 'Feb', won: 5, lost: 1 },
      { month: 'Mar', won: 4, lost: 3 },
      { month: 'Apr', won: 5, lost: 2 },
      { month: 'May', won: 4, lost: 2 }
    ]
  },
  {
    id: 3,
    name: "Global Trading Co.",
    contact: "Mike Johnson",
    email: "mike@global.com",
    phone: "+91 98765 43212",
    totalTenders: 52,
    won: 35,
    lost: 14,
    pending: 3,
    authorizations: 40,
    winRate: 67,
    recentTenders: [
      { name: "Import Contract", status: "won", value: "₹50L", date: "2024-01-19" },
      { name: "Export Agreement", status: "won", value: "₹45L", date: "2024-01-14" },
      { name: "Logistics Deal", status: "won", value: "₹38L", date: "2024-01-09" },
      { name: "Warehouse Project", status: "pending", value: "₹60L", date: "2024-01-23" }
    ],
    monthlyPerformance: [
      { month: 'Jan', won: 7, lost: 3 },
      { month: 'Feb', won: 6, lost: 2 },
      { month: 'Mar', won: 8, lost: 3 },
      { month: 'Apr', won: 7, lost: 3 },
      { month: 'May', won: 7, lost: 3 }
    ]
  }
];

const DealerTracker = () => {
  const [selectedDealer, setSelectedDealer] = useState(null);

  const COLORS = ['#10b981', '#ef4444', '#f59e0b'];

  const openAnalytics = (dealer) => {
    setSelectedDealer(dealer);
  };

  const closeAnalytics = () => {
    setSelectedDealer(null);
  };

  return (
    <div className="dealer-tracker">
      {/* Dealers Table - Full Width */}
      <div className="table-container">
        <div className="table-wrapper">
          <table className="dealers-table">
            <thead>
              <tr>
                <th>Dealer Name</th>
                <th>Contact Person</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="text-center">Win Rate</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {dealersData.map((dealer) => (
                <tr key={dealer.id}>
                  <td className="dealer-name">{dealer.name}</td>
                  <td>{dealer.contact}</td>
                  <td>{dealer.email}</td>
                  <td>{dealer.phone}</td>
                  <td className="text-center">
                    <span className={`win-rate-badge ${
                      dealer.winRate >= 65 ? 'high' :
                      dealer.winRate >= 50 ? 'medium' : 'low'
                    }`}>
                      {dealer.winRate}%
                    </span>
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => openAnalytics(dealer)}
                      className="btn-analytics"
                    >
                      View Analytics
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analytics Modal */}
      {selectedDealer && (
        <div className="modal-overlay">
          <div className="modal-content">
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{selectedDealer.name}</h2>
                <p className="modal-subtitle">
                  {selectedDealer.contact} • {selectedDealer.email}
                </p>
              </div>
              <button onClick={closeAnalytics} className="btn-close">
                <X size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* Key Metrics */}
              <div className="metrics-grid">
                <div className="metric-card blue">
                  <div className="metric-header">
                    <FileText size={24} />
                    <TrendingUp size={20} />
                  </div>
                  <p className="metric-value">{selectedDealer.totalTenders}</p>
                  <p className="metric-label">Total Tenders</p>
                </div>

                <div className="metric-card green">
                  <div className="metric-header">
                    <CheckCircle size={24} />
                    <Award size={20} />
                  </div>
                  <p className="metric-value">{selectedDealer.won}</p>
                  <p className="metric-label">Tenders Won</p>
                </div>

                <div className="metric-card red">
                  <div className="metric-header">
                    <XCircle size={24} />
                    <TrendingDown size={20} />
                  </div>
                  <p className="metric-value">{selectedDealer.lost}</p>
                  <p className="metric-label">Tenders Lost</p>
                </div>

                <div className="metric-card purple">
                  <div className="metric-header">
                    <Award size={24} />
                    <CheckCircle size={20} />
                  </div>
                  <p className="metric-value">{selectedDealer.authorizations}</p>
                  <p className="metric-label">Authorizations</p>
                </div>
              </div>

              {/* Charts Section */}
              <div className="charts-grid">
                {/* Pie Chart */}
                <div className="chart-card">
                  <h3 className="chart-title">Tender Distribution</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Won', value: selectedDealer.won },
                          { name: 'Lost', value: selectedDealer.lost },
                          { name: 'Pending', value: selectedDealer.pending }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {COLORS.map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Line Chart */}
                <div className="chart-card">
                  <h3 className="chart-title">Monthly Performance</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={selectedDealer.monthlyPerformance}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="won" stroke="#10b981" strokeWidth={2} name="Won" />
                      <Line type="monotone" dataKey="lost" stroke="#ef4444" strokeWidth={2} name="Lost" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent Tenders */}
              <div className="recent-tenders">
                <h3 className="chart-title">Recent Tenders</h3>
                <div className="tenders-list">
                  {selectedDealer.recentTenders.map((tender, index) => (
                    <div key={index} className="tender-item">
                      <div className="tender-info">
                        <p className="tender-name">{tender.name}</p>
                        <p className="tender-date">{tender.date}</p>
                      </div>
                      <div className="tender-details">
                        <span className="tender-value">{tender.value}</span>
                        <span className={`tender-status ${tender.status}`}>
                          {tender.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DealerTracker;
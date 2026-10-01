// src/pages/Insights/HistoricalComparison.jsx
// Route: /insights/historical-comparison

import React, { useState } from 'react';
import '../../assets/css/HistoricalComparison.css';

const HistoricalComparison = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('1year');
  const [selectedTrend, setSelectedTrend] = useState('all');

  const comparisons = [
    {
      id: 1,
      hospitalName: 'AIIMS Delhi',
      category: 'Cardiac Devices',
      previousValue: '₹38,00,000',
      currentValue: '₹42,00,000',
      changePercent: 10.5,
      trend: 'Increasing',
      frequency: 'Quarterly',
      lastPurchase: '3 months ago',
      icon: '📈'
    },
    {
      id: 2,
      hospitalName: 'Max Healthcare',
      category: 'Orthopedic Implants',
      previousValue: '₹45,00,000',
      currentValue: '₹41,00,000',
      changePercent: -8.9,
      trend: 'Decreasing',
      frequency: 'Semi-Annual',
      lastPurchase: '5 months ago',
      icon: '📉'
    },
    {
      id: 3,
      hospitalName: 'Apollo Hospitals',
      category: 'Surgical Equipment',
      previousValue: '₹29,50,000',
      currentValue: '₹29,80,000',
      changePercent: 1.0,
      trend: 'Stable',
      frequency: 'Annual',
      lastPurchase: '11 months ago',
      icon: '➡️'
    },
    {
      id: 4,
      hospitalName: 'Fortis Healthcare',
      category: 'Diagnostic Systems',
      previousValue: '₹62,00,000',
      currentValue: '₹72,00,000',
      changePercent: 16.1,
      trend: 'Increasing',
      frequency: 'Bi-Annual',
      lastPurchase: '6 months ago',
      icon: '🚀'
    },
    {
      id: 5,
      hospitalName: 'Safdarjung Hospital',
      category: 'ICU Consumables',
      previousValue: '₹22,00,000',
      currentValue: '₹18,50,000',
      changePercent: -15.9,
      trend: 'Decreasing',
      frequency: 'Quarterly',
      lastPurchase: '2 months ago',
      icon: '⬇️'
    }
  ];

  const InsightCard = ({ comparison }) => {
    const getTrendColor = (trend) => {
      if (trend === 'Increasing') return 'increasing';
      if (trend === 'Decreasing') return 'decreasing';
      return 'stable';
    };

    return (
      <div className="comparison-card">
        <div className="card-header">
          <span className="card-icon">{comparison.icon}</span>
          <div className="card-title-section">
            <h3>{comparison.hospitalName}</h3>
            <span className="category-badge">{comparison.category}</span>
          </div>
        </div>
        <div className="card-body">
          <div className="value-comparison">
            <div className="value-item">
              <span className="value-label">Previous Tender</span>
              <span className="value-amount">{comparison.previousValue}</span>
            </div>
            <div className="arrow-section">→</div>
            <div className="value-item">
              <span className="value-label">Current Tender</span>
              <span className="value-amount current">{comparison.currentValue}</span>
            </div>
          </div>
          <div className="change-indicator">
            <span className={`change-badge ${getTrendColor(comparison.trend)}`}>
              {comparison.changePercent > 0 ? '+' : ''}{comparison.changePercent}%
            </span>
            <span className={`trend-text ${getTrendColor(comparison.trend)}`}>
              {comparison.trend} Trend
            </span>
          </div>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Frequency</span>
              <span className="info-value">{comparison.frequency}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Last Purchase</span>
              <span className="info-value">{comparison.lastPurchase}</span>
            </div>
          </div>
        </div>
        <div className="card-footer">
          <button 
            className="view-details-btn"
            onClick={() => console.log('Viewing history:', comparison.hospitalName)}
          >
            View Full History
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="historical-comparison-page">
      <div className="page-header">
        <h1>Historical Comparison</h1>
        <p className="page-description">
          Track tender value trends over time, comparing current opportunities with historical data 
          to identify patterns and predict future pricing movements.
        </p>
      </div>

      <div className="search-section">
        <input
          type="text"
          className="search-input"
          placeholder="Search by hospital name or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="filters-bar">
        <select 
          className="filter-dropdown"
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
        >
          <option value="6months">Last 6 Months</option>
          <option value="1year">Last Year</option>
          <option value="2years">Last 2 Years</option>
          <option value="3years">Last 3 Years</option>
        </select>

        <select 
          className="filter-dropdown"
          value={selectedTrend}
          onChange={(e) => setSelectedTrend(e.target.value)}
        >
          <option value="all">All Trends</option>
          <option value="increasing">Increasing</option>
          <option value="decreasing">Decreasing</option>
          <option value="stable">Stable</option>
        </select>

        <button 
          className="filter-btn"
          onClick={() => console.log('Applying filters:', { selectedPeriod, selectedTrend })}
        >
          Apply Filters
        </button>
      </div>

      <div className="insights-grid">
        {comparisons.map((comparison) => (
          <InsightCard key={comparison.id} comparison={comparison} />
        ))}
      </div>
    </div>
  );
};

export default HistoricalComparison;
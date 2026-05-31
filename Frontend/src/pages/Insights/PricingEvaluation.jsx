// src/pages/Insights/PricingEvaluation.jsx
// Route: /insights/pricing-evaluation

import React, { useState } from 'react';
import '../../assets/css/PricingEvaluation.css';

const PricingEvaluation = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedRange, setSelectedRange] = useState('all');

  const evaluations = [
    {
      id: 1,
      tenderName: 'AIIMS Delhi - Cardiac Stents Package',
      ourPrice: '₹42,00,000',
      marketAverage: '₹45,50,000',
      competitorPrice: '₹43,20,000',
      pricePosition: 'Competitive',
      savingsPercent: 7.7,
      recommendation: 'Strong position - proceed with current pricing',
      icon: '💰'
    },
    {
      id: 2,
      tenderName: 'Max Hospital - Orthopedic Bundle',
      ourPrice: '₹38,00,000',
      marketAverage: '₹36,50,000',
      competitorPrice: '₹35,00,000',
      pricePosition: 'Above Market',
      savingsPercent: -4.1,
      recommendation: 'Consider price reduction to remain competitive',
      icon: '📊'
    },
    {
      id: 3,
      tenderName: 'Apollo Hospitals - Surgical Equipment',
      ourPrice: '₹29,50,000',
      marketAverage: '₹32,00,000',
      competitorPrice: '₹31,00,000',
      pricePosition: 'Below Market',
      savingsPercent: 7.8,
      recommendation: 'Excellent pricing - strong win probability',
      icon: '✅'
    },
    {
      id: 4,
      tenderName: 'Fortis Healthcare - Diagnostic Systems',
      ourPrice: '₹72,00,000',
      marketAverage: '₹70,50,000',
      competitorPrice: '₹69,00,000',
      pricePosition: 'Slightly High',
      savingsPercent: -2.1,
      recommendation: 'Monitor competitor moves, consider minor adjustment',
      icon: '⚠️'
    },
    {
      id: 5,
      tenderName: 'Safdarjung Hospital - ICU Package',
      ourPrice: '₹18,00,000',
      marketAverage: '₹21,00,000',
      competitorPrice: '₹19,50,000',
      pricePosition: 'Highly Competitive',
      savingsPercent: 14.3,
      recommendation: 'Optimal pricing - high win potential',
      icon: '🏆'
    }
  ];

  const InsightCard = ({ evaluation }) => {
    const getPositionColor = (position) => {
      if (position === 'Highly Competitive' || position === 'Below Market') return 'good';
      if (position === 'Competitive') return 'neutral';
      return 'warning';
    };

    return (
      <div className="evaluation-card">
        <div className="card-header">
          <span className="card-icon">{evaluation.icon}</span>
          <div className="card-title-section">
            <h3>{evaluation.tenderName}</h3>
            <span className={`position-badge ${getPositionColor(evaluation.pricePosition)}`}>
              {evaluation.pricePosition}
            </span>
          </div>
        </div>
        <div className="card-body">
          <div className="price-grid">
            <div className="price-item">
              <span className="price-label">Our Price</span>
              <span className="price-value our-price">{evaluation.ourPrice}</span>
            </div>
            <div className="price-item">
              <span className="price-label">Market Average</span>
              <span className="price-value">{evaluation.marketAverage}</span>
            </div>
            <div className="price-item">
              <span className="price-label">Competitor Price</span>
              <span className="price-value">{evaluation.competitorPrice}</span>
            </div>
            <div className="price-item">
              <span className="price-label">Savings %</span>
              <span className={`price-value ${evaluation.savingsPercent > 0 ? 'positive' : 'negative'}`}>
                {evaluation.savingsPercent > 0 ? '+' : ''}{evaluation.savingsPercent}%
              </span>
            </div>
          </div>
          <div className="recommendation-box">
            <span className="recommendation-label">Recommendation:</span>
            <p>{evaluation.recommendation}</p>
          </div>
        </div>
        <div className="card-footer">
          <button 
            className="view-details-btn"
            onClick={() => console.log('Viewing pricing details:', evaluation.tenderName)}
          >
            View Price Analysis
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="pricing-evaluation-page">
      <div className="page-header">
        <h1>Pricing Evaluation</h1>
        <p className="page-description">
          Real-time pricing analysis comparing your bids against market averages and competitor prices 
          to optimize your pricing strategy and maximize win rates.
        </p>
      </div>

      <div className="search-section">
        <input
          type="text"
          className="search-input"
          placeholder="Search by tender name or hospital..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="filters-bar">
        <select 
          className="filter-dropdown"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          <option value="all">All Price Positions</option>
          <option value="competitive">Highly Competitive</option>
          <option value="below">Below Market</option>
          <option value="neutral">Competitive</option>
          <option value="above">Above Market</option>
        </select>

        <select 
          className="filter-dropdown"
          value={selectedRange}
          onChange={(e) => setSelectedRange(e.target.value)}
        >
          <option value="all">All Value Ranges</option>
          <option value="low">Under ₹25L</option>
          <option value="medium">₹25L - ₹50L</option>
          <option value="high">Above ₹50L</option>
        </select>

        <button 
          className="filter-btn"
          onClick={() => console.log('Applying filters:', { selectedStatus, selectedRange })}
        >
          Apply Filters
        </button>
      </div>

      <div className="insights-grid">
        {evaluations.map((evaluation) => (
          <InsightCard key={evaluation.id} evaluation={evaluation} />
        ))}
      </div>
    </div>
  );
};

export default PricingEvaluation;
// src/pages/Insights/ProductSuggestions.jsx
// Route: /insights/product-suggestions

import React, { useMemo, useState } from 'react';
import '../../assets/css/ProductSuggestions.css';

const ProductSuggestions = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedMatch, setSelectedMatch] = useState('all');

  const suggestions = [
    {
      id: 1,
      tenderTitle: 'AIIMS Delhi - Cardiovascular Devices',
      productName: 'Meril Stentys Pro DES',
      matchScore: 95,
      reason: 'Perfect specifications match, competitive pricing',
      estimatedValue: '₹52,00,000',
      productType: 'Cardiac Stents',
      icon: '💊'
    },
    {
      id: 2,
      tenderTitle: 'Max Hospital - Joint Replacement Systems',
      productName: 'Meril OrthoMax Knee System',
      matchScore: 88,
      reason: 'High quality standards, proven clinical outcomes',
      estimatedValue: '₹41,00,000',
      productType: 'Orthopedic Implants',
      icon: '🦴'
    },
    {
      id: 3,
      tenderTitle: 'Fortis Healthcare - Surgical Tools',
      productName: 'Meril SurgiPrecise Kit',
      matchScore: 82,
      reason: 'Meets technical requirements, good pricing',
      estimatedValue: '₹29,00,000',
      productType: 'Surgical Instruments',
      icon: '🔧'
    },
    {
      id: 4,
      tenderTitle: 'Apollo Hospital - Angioplasty Equipment',
      productName: 'Meril MyVal TAVR System',
      matchScore: 92,
      reason: 'Latest technology, excellent track record',
      estimatedValue: '₹87,00,000',
      productType: 'Interventional Cardiology',
      icon: '🩺'
    },
    {
      id: 5,
      tenderTitle: 'Safdarjung Hospital - ICU Consumables',
      productName: 'Meril MediCare ICU Bundle',
      matchScore: 76,
      reason: 'Bulk supply capability, standard compliance',
      estimatedValue: '₹18,50,000',
      productType: 'Medical Consumables',
      icon: '📦'
    }
  ];

  // Helper: convert match-score numeric to label
  const scoreToLabel = (score) => {
    if (score >= 90) return 'excellent';
    if (score >= 80) return 'good';
    if (score >= 70) return 'average';
    return 'low';
  };

  // Filtered suggestions memoized
  const filteredSuggestions = useMemo(() => {
    return suggestions.filter((s) => {
      // Search filter: check tenderTitle and productName and productType
      const searchLower = searchTerm.trim().toLowerCase();
      if (searchLower) {
        const combined = `${s.tenderTitle} ${s.productName} ${s.productType}`.toLowerCase();
        if (!combined.includes(searchLower)) return false;
      }

      // Type filter
      if (selectedType !== 'all') {
        // allow partial match (e.g., selectedType 'cardiac' should match 'Cardiac Stents')
        if (!s.productType.toLowerCase().includes(selectedType.toLowerCase())) return false;
      }

      // Match filter
      if (selectedMatch !== 'all') {
        const label = scoreToLabel(s.matchScore);
        if (selectedMatch !== label) return false;
      }

      return true;
    });
  }, [searchTerm, selectedType, selectedMatch, suggestions]);

  const InsightCard = ({ suggestion }) => {
    const getMatchColor = (score) => {
      if (score >= 90) return 'excellent';
      if (score >= 80) return 'good';
      if (score >= 70) return 'average';
      return 'low';
    };

    return (
      <div className="suggestion-card">
        <div className="card-header">
          <span className="card-icon" aria-hidden>
            {suggestion.icon}
          </span>
          <div className="card-title-section">
            <h3 className="tender-title">{suggestion.tenderTitle}</h3>
            <span className="type-badge">{suggestion.productType}</span>
          </div>
        </div>

        <div className="card-body">
          <div className="product-section">
            <span className="product-label">Suggested Product:</span>
            <span className="product-name">{suggestion.productName}</span>
          </div>

          <div className="match-section">
            <div className="match-meter" aria-hidden>
              <div
                className={`match-fill ${getMatchColor(suggestion.matchScore)}`}
                style={{ width: `${suggestion.matchScore}%` }}
              />
            </div>
            <span className="match-text">{suggestion.matchScore}% Match Score</span>
          </div>

          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Estimated Value</span>
              <span className="info-value">{suggestion.estimatedValue}</span>
            </div>

            <div className="info-item">
              <span className="info-label">Match Reason</span>
              <span className="info-value short-reason">{suggestion.reason}</span>
            </div>
          </div>

          <div className="reason-box">
            <span className="reason-label">Why This Product:</span>
            <p>{suggestion.reason}</p>
          </div>
        </div>

        <div className="card-footer">
          <button
            className="view-details-btn"
            onClick={() => console.log('Viewing product details:', suggestion.productName)}
            type="button"
          >
            View Product Details
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="product-suggestions-page">
      <div className="page-header">
        <h1>Product Suggestions</h1>
        <p className="page-description">
          Intelligent product recommendations matched to tender requirements, helping you identify the
          best products from your portfolio for each opportunity.
        </p>
      </div>

      <div className="controls-row">
        <div className="search-section">
          <input
            type="text"
            className="search-input"
            placeholder="Search by tender name, product or product type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search suggestions"
          />
        </div>

        <div className="filters-bar">
          <select
            className="filter-dropdown"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="all">All Product Types</option>
            <option value="cardiac">Cardiac Stents</option>
            <option value="orthopedic">Orthopedic Implants</option>
            <option value="surgical">Surgical Instruments</option>
            <option value="consumables">Medical Consumables</option>
            <option value="interventional">Interventional Cardiology</option>
          </select>

          <select
            className="filter-dropdown"
            value={selectedMatch}
            onChange={(e) => setSelectedMatch(e.target.value)}
          >
            <option value="all">All Match Scores</option>
            <option value="excellent">Excellent (90%+)</option>
            <option value="good">Good (80-89%)</option>
            <option value="average">Average (70-79%)</option>
            <option value="low">Low (&lt;70%)</option>
          </select>

          <button
            className="filter-btn"
            onClick={() =>
              console.log('Applying filters:', { selectedType, selectedMatch, searchTerm })
            }
            type="button"
          >
            Apply Filters
          </button>

          <button
            className="clear-btn"
            onClick={() => {
              setSearchTerm('');
              setSelectedType('all');
              setSelectedMatch('all');
            }}
            type="button"
            title="Clear filters"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="insights-grid">
        {filteredSuggestions.length === 0 ? (
          <div className="no-results">No suggestions found — try adjusting your filters.</div>
        ) : (
          filteredSuggestions.map((s) => <InsightCard key={s.id} suggestion={s} />)
        )}
      </div>
    </div>
  );
};

export default ProductSuggestions;

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import ProductSearchModal from '../../components/common/ProductSearchModal';
import ItemCategorySelectorModal from '../../components/common/ItemCategorySelectorModal';
import DeviationModal from './DeviationModal';
import PreBidModal from './PreBidModal';
import { Wand2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import '../../assets/css/TenderDetails.css';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_LABEL_MAP = {
  'endo.json': 'Endo / Surgical',
  'analyser.json': 'Analyser / Diagnostic',
  'reagents.json': 'Reagents / Diagnostic',
  'system_packs.json': 'System Packs / Diagnostic',
  'rapid_elisa.json': 'Rapid & ELISA / Diagnostic',
};

// ─────────────────────────────────────────────────────────────────────────────
// AI ANALYSIS MODAL
// ─────────────────────────────────────────────────────────────────────────────

const AIAnalysisModal = ({ title, content, loading, onClose }) => (
  <div
    style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
    }}
  >
    <div style={{
      background: 'white', padding: '25px', borderRadius: '12px',
      width: '600px', maxWidth: '95%', maxHeight: '85vh',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Wand2 size={24} color="#7c3aed" />
          {title}
        </h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' }}>
          &times;
        </button>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: '10px',
        background: '#f8f9fa', borderRadius: '8px', border: '1px solid #eee',
      }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '15px' }}>
            <div style={{
              width: '40px', height: '40px', border: '4px solid #f3f3f3',
              borderTop: '4px solid #7c3aed', borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ color: '#666' }}>Analyzing ATC Documents with AI...</p>
          </div>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#333' }}>
            {content || 'No analysis available.'}
          </div>
        )}
      </div>

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{
          padding: '10px 20px', background: '#1f2937', color: 'white',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500',
        }}>
          Close
        </button>
      </div>
    </div>
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SCORE BADGE
// ─────────────────────────────────────────────────────────────────────────────

const ScoreBadge = ({ score }) => {
  if (!score) return <span style={{ color: '#999', fontSize: '12px' }}>—</span>;
  const isHigh = score > 0.8;
  return (
    <span style={{
      backgroundColor: isHigh ? '#d1fae5' : '#e0f2fe',
      color: isHigh ? '#065f46' : '#075985',
      padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600,
    }}>
      {(score * 100).toFixed(0)}%
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PRE-BID REMARKS MODAL
// ─────────────────────────────────────────────────────────────────────────────

const PreBidRemarksModal = ({ data, onClose }) => {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '600px', maxWidth: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5rem', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Pre-Bid Meeting Remarks</h3>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
          {data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Team Remarks Section */}
              {data.meeting && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#084f9a', fontSize: '1.1rem' }}>Team Remarks (At Creation)</h4>
                  <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef', whiteSpace: 'pre-wrap', color: '#333' }}>
                    {data.meeting.team_remarks || <em style={{ color: '#999' }}>No team remarks provided.</em>}
                  </div>
                </div>
              )}

              {/* FLSP Visits Section */}
              <div>
                <h4 style={{ margin: '0 0 12px 0', color: '#084f9a', fontSize: '1.1rem' }}>FLSP Visit Reports</h4>
                {data.visits && data.visits.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {data.visits.map((visit, idx) => (
                      <div key={idx} style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                          <div>
                            <strong style={{ display: 'block', fontSize: '1.05rem', color: '#1a1a1a' }}>{visit.person_name}</strong>
                            <span style={{ fontSize: '0.9rem', color: '#666' }}>{visit.designation}</span>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: '0.9rem', color: '#555' }}>
                            <div>📅 {new Date(visit.visit_date).toLocaleDateString()} at {visit.visit_time}</div>
                            <div>📍 {visit.place}, {visit.state}</div>
                            {(visit.latitude && visit.longitude) && (
                              <div style={{ marginTop: '5px' }}>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${visit.latitude},${visit.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: '0.8rem',
                                    color: '#084f9a',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: '#eef2fc',
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    fontWeight: '500'
                                  }}
                                >
                                  📍 View on Maps
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '6px', fontSize: '0.95rem', color: '#333', whiteSpace: 'pre-wrap', borderLeft: '3px solid #084f9a' }}>
                          {visit.remarks || <em style={{ color: '#999' }}>No additional remarks.</em>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef', color: '#666' }}>
                    <em>No FLSP visit reports submitted yet.</em>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#666' }}>
              <p style={{ fontSize: '1.1rem' }}>No pre-bid meeting data found for this tender.</p>
            </div>
          )}
        </div>

        <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => {
              if (!data) return;

              // Construct Excel Data
              const excelData = [];

              if (data.meeting && data.meeting.team_remarks) {
                excelData.push({
                  Type: 'Team Remark',
                  Person: 'Internal Team',
                  Date: 'N/A',
                  Location: 'N/A',
                  GPS: 'N/A',
                  Remarks: data.meeting.team_remarks
                });
              }

              if (data.visits && data.visits.length > 0) {
                data.visits.forEach(v => {
                  excelData.push({
                    Type: 'FLSP Visit',
                    Person: `${v.person_name} (${v.designation})`,
                    Date: `${new Date(v.visit_date).toLocaleDateString()} ${v.visit_time}`,
                    Location: `${v.place}, ${v.state}`,
                    GPS: (v.latitude && v.longitude) ? `${v.latitude}, ${v.longitude}` : 'N/A',
                    Remarks: v.remarks || ''
                  });
                });
              }

              if (excelData.length === 0) {
                excelData.push({ Remarks: 'No remarks available.' });
              }

              const ws = XLSX.utils.json_to_sheet(excelData);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "PreBid_Remarks");
              XLSX.writeFile(wb, `PreBid_Remarks_${Date.now()}.xlsx`);
            }}
            disabled={!data}
            style={{
              padding: '10px 20px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: data ? 'pointer' : 'not-allowed',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: data ? 1 : 0.6
            }}
          >
            <Download size={16} /> Export to Excel
          </button>

          <button onClick={onClose} style={{ padding: '10px 24px', background: '#084f9a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUGGESTED PRODUCTS MODAL  ← fully fixed
// ─────────────────────────────────────────────────────────────────────────────

const SuggestedProductsModal = ({
  products, detectedCategory, selectedProduct,
  onClose, bidNumber, onUpdate, itemCategoryString,
}) => {
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [localProducts, setLocalProducts] = useState(products);
  const [showSearch, setShowSearch] = useState(false);
  const [showCategorySelector, setShowCategorySelector] = useState(false);
  const [selectedItemCategory, setSelectedItemCategory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recalculatingRowIndex, setRecalculatingRowIndex] = useState(null);
  const [emptyProcessingStatus, setEmptyProcessingStatus] = useState('idle'); // 'idle', 'processing', 'done'

  // Parse tender item categories for the "Add Product" flow
  const itemCategories = itemCategoryString && itemCategoryString !== 'N/A'
    ? itemCategoryString.split(/,(?![^()]*\))/).map(s => s.trim()).filter(Boolean)
    : [];

  const hasProcessedEmpty = React.useRef(false);

  // Sync when parent re-fetches
  useEffect(() => { setLocalProducts(products); }, [products]);

  // Auto-process empty suggestions
  useEffect(() => {
    if (localProducts.length === 0 && !hasProcessedEmpty.current) {
      hasProcessedEmpty.current = true;
      setEmptyProcessingStatus('processing');
      try {
        const storedUserStr = localStorage.getItem('user');
        if (storedUserStr) {
          const storedUser = JSON.parse(storedUserStr);
          const userName = storedUser.name || 'System Auto';
          const userEmail = storedUser.email || 'auto@example.com';
          const cleanBid = bidNumber.replace(/_/g, '/');

          fetch('https://suggestions.openprocure.ai/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bid_number: cleanBid,
              user_name: userName,
              user_email: userEmail
            })
          })
            .then(() => setEmptyProcessingStatus('done'))
            .catch(err => {
              console.error('Error auto-processing empty tender:', err);
              setEmptyProcessingStatus('done');
            });
        } else {
          setEmptyProcessingStatus('done');
        }
      } catch (err) {
        console.error('Failed to trigger auto-process:', err);
        setEmptyProcessingStatus('done');
      }
    }
  }, [localProducts.length, bidNumber]);

  // Derive currently selected product (local state takes priority)
  const currentSelected =
    localProducts.find(p => p.selected === true) || selectedProduct;

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleRemove = (idx) =>
    setLocalProducts(prev => prev.filter((_, i) => i !== idx));

  const handleAddProductClick = () => {
    if (itemCategories.length >= 2) {
      setShowCategorySelector(true);
    } else {
      setSelectedItemCategory(itemCategories[0] || null);
      setShowSearch(true);
    }
  };

  const handleCategorySelected = (category) => {
    setSelectedItemCategory(category);
    setShowCategorySelector(false);
    setShowSearch(true);
  };

  // Normalise whatever shape ProductSearchModal returns
  const handleProductAdded = (product) => {
    const normalised = {
      item_key: '',
      item_category: selectedItemCategory || itemCategories[0] || '',
      type: product.type || product.category || '',
      category: product.category || '',
      category_label: product.category_label || '',
      dept: product.dept || '',
      title: product.title || product.product_name || product.instrument_name || '',
      product_code: product.product_code || product.item_code || '',
      selected_file: product.selected_file || '',
      tender_item_name: product.tender_item_name || '',
      relevancy_score: product.relevancy_score ?? 0,
      raw_score: product.raw_score ?? product.relevancy_score ?? 0,
      relevancy: (product.relevancy_score ?? 0) > 0.8,
      selected: false,
      isNew: true, // Identify it as newly added for the recalculate button
    };
    setLocalProducts(prev => [...prev, normalised]);
    setShowSearch(false);
    if (!isEditing) setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setLocalProducts(products); // revert to last saved state
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const API_BASE = import.meta.env.VITE_API_BASE_URL;
      const cleanBid = bidNumber.replace(/_/g, '/');

      const res = await fetch(
        `${API_BASE}/tenders/${encodeURIComponent(cleanBid)}/suggestions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ products: localProducts }),
        }
      );
      const data = await res.json();

      if (data.success) {
        setIsEditing(false);
        if (onUpdate) onUpdate(localProducts);
        alert('Saved successfully!');
      } else {
        alert(data.message || 'Failed to save');
      }
    } catch (e) {
      console.error('handleSave:', e);
      alert('Error saving. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectProduct = async (product) => {
    try {
      const token = localStorage.getItem('token');
      const API_BASE = import.meta.env.VITE_API_BASE_URL;
      const cleanBid = bidNumber.replace(/_/g, '/');

      const res = await fetch(
        `${API_BASE}/tenders/${encodeURIComponent(cleanBid)}/selection`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ product }),
        }
      );
      const data = await res.json();

      if (data.success) {
        // Reflect selection locally without full refetch
        setLocalProducts(prev =>
          prev.map(p => ({ ...p, selected: p.product_code === product.product_code }))
        );
        alert('Product selected successfully!');
      } else {
        alert(data.message || 'Failed to select product');
      }
    } catch (e) {
      console.error('handleSelectProduct:', e);
      alert('Error selecting product. Please try again.');
    }
  };

  const handleRecalculateRow = async (idx, product) => {
    try {
      setRecalculatingRowIndex(idx);

      let itemKey = product.item_key || product.item;

      if (!itemKey || !itemKey.startsWith('item_')) {
        const catIndex = itemCategories.findIndex(cat => cat.trim() === product.item_category?.trim());
        if (catIndex === -1) {
          alert("Cannot determine the item category to recalculate. Please save the products first so the system can assign an item ID.");
          return;
        }
        itemKey = `item_${catIndex + 1}`;
      }

      const cleanBid = bidNumber.replace(/_/g, '/');

      const res = await fetch('https://deviation.openprocure.ai/recalculate-deviation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bid_no: cleanBid,
          item_key: itemKey,
          product_code: product.product_code
        })
      });

      const data = await res.json();
      if (data.status === 'success') {
        alert('Specification updated and deviation updated successfully!');
        window.location.reload();
      } else {
        alert(`Recalculation failed: ${data.message || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('Error recalculating row:', e);
      alert('Error connecting to the recalculation service.');
    } finally {
      setRecalculatingRowIndex(null);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  const btnStyle = (bg, disabled = false) => ({
    padding: '7px 14px', background: disabled ? '#9ca3af' : bg,
    color: 'white', border: 'none', borderRadius: '5px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '13px', fontWeight: 500,
  });

  return (
    <>
      {/* Overlay */}
      <div
        className="modal-overlay"
        onClick={onClose}
        style={{ zIndex: 1000 }}
      >
        <div
          className="modal-content"
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '960px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
        >
          {/* Header */}
          <div className="modal-header">
            <div>
              <h2 style={{ margin: 0 }}>Suggested Products</h2>
              {detectedCategory && (
                <div style={{ fontSize: '13px', color: '#084f9a', marginTop: '4px' }}>
                  Detected:&nbsp;<strong>{detectedCategory}</strong>
                </div>
              )}
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>

          {/* Toolbar */}
          <div style={{
            padding: '10px 20px', display: 'flex',
            justifyContent: 'flex-end', gap: '8px',
            borderBottom: '1px solid #f3f4f6',
          }}>
            {!isEditing ? (
              <>
                <button onClick={() => setIsEditing(true)} style={btnStyle('#084f9a')}>Edit Selection</button>
                <button onClick={handleAddProductClick} style={btnStyle('#16a34a')}>+ Add Product</button>
              </>
            ) : (
              <>
                <button onClick={handleCancelEdit} disabled={saving} style={btnStyle('#6b7280', saving)}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={btnStyle('#16a34a', saving)}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button onClick={handleAddProductClick} style={btnStyle('#084f9a')}>+ Add Product</button>
              </>
            )}
          </div>

          {/* Body */}
          <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
            {localProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                <p>No suggested products found for this tender.</p>
                {emptyProcessingStatus === 'processing' || emptyProcessingStatus === 'done' ? (
                  <div style={{
                    marginTop: '20px', padding: '15px', background: '#eff6ff',
                    borderRadius: '8px', border: '1px solid #bfdbfe', color: '#1e3a8a',
                    maxWidth: '450px', margin: '20px auto 0'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px', fontWeight: '600' }}>
                      {emptyProcessingStatus === 'processing' && (
                        <div style={{
                          width: '16px', height: '16px', border: '3px solid #bfdbfe',
                          borderTop: '3px solid #2563eb', borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }} />
                      )}
                      {emptyProcessingStatus === 'processing' ? 'Processing Bid...' : 'Processing Initiated!'}
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                      The bid is processing and the suggested product and deviation will be created and sent shortly.
                    </p>
                  </div>
                ) : null}
                <button onClick={handleAddProductClick} style={{ ...btnStyle('#084f9a'), marginTop: '24px' }}>
                  + Add Product Manually
                </button>
              </div>
            ) : (
              <div className="products-table-wrapper" style={{ overflowX: 'auto' }}>
                <table className="products-table">
                  <thead>
                    <tr>
                      {isEditing && <th style={{ width: 50, textAlign: 'center' }}>Remove</th>}
                      <th>Item Category</th>
                      <th>Product Name</th>
                      <th>Product Code</th>
                      <th style={{ textAlign: 'center' }}>Relevancy Score</th>
                      <th style={{ textAlign: 'center' }}>Deviation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localProducts.map((p, idx) => (
                      <tr key={`${p.product_code}-${idx}`}>
                        {/* Remove */}
                        {isEditing && (
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => handleRemove(idx)}
                              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px' }}
                            >
                              🗑️
                            </button>
                          </td>
                        )}

                        {/* Item Category */}
                        <td>
                          <div style={{ fontWeight: 500, color: '#1f2937', lineHeight: 1.3 }}>
                            {p.item_category || p.tender_item_name || '—'}
                          </div>
                          {p.dept && (
                            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{p.dept}</div>
                          )}
                        </td>

                        {/* Product Name */}
                        <td style={{ fontSize: '13px' }}>{p.title || '—'}</td>

                        {/* Product Code */}
                        <td>
                          <code style={{ fontSize: '12px', color: '#374151', whiteSpace: 'nowrap' }}>
                            {p.product_code || '—'}
                          </code>
                        </td>

                        {/* Relevancy Score */}
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            background: '#f3f4f6', color: '#374151',
                            padding: '2px 8px', borderRadius: '12px',
                            fontSize: '11px', fontWeight: 600,
                          }}>
                            {p.relevancy_score !== undefined ? `${(p.relevancy_score * 100).toFixed(0)}%` : '—'}
                          </span>
                        </td>

                        {/* Deviation */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', alignItems: 'center' }}>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                navigate(`/Admin/tenderdetails/${bidNumber}/deviations`);
                              }}
                              title="View Deviation"
                              style={{
                                padding: '5px 8px', background: '#084f9a',
                                color: 'white', border: 'none',
                                borderRadius: '4px', cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center',
                              }}
                              onMouseOver={e => e.currentTarget.style.background = '#063a73'}
                              onMouseOut={e => e.currentTarget.style.background = '#084f9a'}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>

                            {/* Recalculate Button specifically for added/new products */}
                            {(p.isNew || p.relevancy_score === 0 || p.relevancy_score === '0' || !p.relevancy_score) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRecalculateRow(idx, p);
                                }}
                                disabled={recalculatingRowIndex === idx}
                                title="Recalculate deviation for this added product"
                                style={{
                                  padding: '3px 8px',
                                  background: recalculatingRowIndex === idx ? '#d1d5db' : '#10b981',
                                  color: recalculatingRowIndex === idx ? '#6b7280' : 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: recalculatingRowIndex === idx ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  fontSize: '12px', fontWeight: 500
                                }}
                                onMouseOver={e => { if (recalculatingRowIndex !== idx) e.currentTarget.style.background = '#059669'; }}
                                onMouseOut={e => { if (recalculatingRowIndex !== idx) e.currentTarget.style.background = '#10b981'; }}
                              >
                                {recalculatingRowIndex === idx ? (
                                  <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px', borderColor: '#6b7280', borderTopColor: 'transparent' }} />
                                ) : (
                                  '🔄 Recalculate'
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {isEditing && (
                  <div style={{ padding: '12px 0', textAlign: 'center' }}>
                    <button onClick={handleAddProductClick} style={btnStyle('#084f9a')}>
                      + Add Product
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btnStyle('#1f2937')}>Close</button>
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      {showCategorySelector && (
        <ItemCategorySelectorModal
          itemCategories={itemCategories}
          onSelect={handleCategorySelected}
          onClose={() => setShowCategorySelector(false)}
        />
      )}
      {showSearch && (
        <ProductSearchModal
          onClose={() => setShowSearch(false)}
          onSelect={handleProductAdded}
          itemCategory={selectedItemCategory}
          bidNumber={bidNumber}
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ITEM CATEGORY MODAL
// ─────────────────────────────────────────────────────────────────────────────

const ItemCategoryModal = ({ itemsString, onClose }) => {
  const items = itemsString && itemsString !== 'N/A'
    ? itemsString.split(/,(?![^()]*\))/).map(s => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>Item Categories</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', padding: '20px' }}>
          {items.length > 0 ? (
            <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
              {items.map((item, idx) => (
                <li key={idx} style={{
                  padding: '10px', borderBottom: '1px solid #eee',
                  fontSize: '14px', color: '#333',
                }}>
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ textAlign: 'center', color: '#666' }}>No categories found.</p>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel"
            style={{ width: '100%', background: '#084f9a', color: 'white' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COUNT UP ANIMATION
// ─────────────────────────────────────────────────────────────────────────────

const CountUp = ({ end, duration = 2000, prefix = '' }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime = null;
    let frame;
    const animate = (ts) => {
      if (!startTime) startTime = ts;
      const ratio = Math.min((ts - startTime) / duration, 1);
      const ease = ratio === 1 ? 1 : 1 - Math.pow(2, -10 * ratio);
      setCount(Math.floor(ease * end));
      if (ratio < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [end, duration]);

  return <span>{prefix}{count.toLocaleString()}</span>;
};

// ─────────────────────────────────────────────────────────────────────────────
// SUGGEST PRICING MODAL
// ─────────────────────────────────────────────────────────────────────────────

const SuggestPricingModal = ({ onClose, pricingData, loading, error }) => {
  if (loading) return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '900px', padding: '40px', textAlign: 'center' }}>
        <div className="spinner" />
        <p style={{ marginTop: '20px', color: '#666' }}>Loading pricing analysis...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
        <div className="modal-header">
          <h2>Pricing Analysis Error</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p style={{ color: '#dc3545', fontSize: '16px' }}>{error}</p>
          <button onClick={onClose} style={{ marginTop: '20px', padding: '10px 20px', background: '#084f9a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (!pricingData) return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
        <div className="modal-header">
          <h2>Pricing Analysis</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p style={{ color: '#666' }}>No pricing data available. Please try again later.</p>
        </div>
      </div>
    </div>
  );

  const { low_price, high_price, top_competitors = [], confidence, basis, competitors_analyzed } = pricingData;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>Suggested Pricing Analysis</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #e8ecef' }}>
          <h3 style={{ fontSize: '18px', margin: '0 0 10px', color: '#333' }}>Suggested Pricing</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '15px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>Low Price</span>
              <span style={{ fontSize: '24px', color: '#28a745', fontWeight: 700 }}>
                <CountUp end={low_price} prefix="₹ " />
              </span>
            </div>
            <div style={{ fontSize: '24px', color: '#999' }}>→</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>High Price</span>
              <span style={{ fontSize: '24px', color: '#dc3545', fontWeight: 700 }}>
                <CountUp end={high_price} prefix="₹ " />
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: '#666' }}>
            {confidence && <div><strong>Confidence:</strong> {confidence}</div>}
            {competitors_analyzed && <div><strong>Competitors Analyzed:</strong> {competitors_analyzed}</div>}
          </div>
          {basis && <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}><em>Basis: {basis}</em></div>}
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', padding: '20px' }}>
          <div className="products-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="products-table" style={{ minWidth: '800px' }}>
              <thead>
                <tr>
                  <th>Sl No</th>
                  <th>Competitor Name</th>
                  <th>Average Bidding Price</th>
                  <th>Inflation Rate</th>
                  <th>Last L1 Price</th>
                  <th>Least Quoted Price</th>
                </tr>
              </thead>
              <tbody>
                {top_competitors.length > 0 ? top_competitors.map((row, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 500 }}>{row.seller_name}</td>
                    <td>₹ {row.average_bidding_price?.toLocaleString() || 'N/A'}</td>
                    <td>
                      <span style={{
                        background: row.inflation_rate_percent > 5 ? '#fee2e2' : '#d1fae5',
                        color: row.inflation_rate_percent > 5 ? '#dc2626' : '#059669',
                        padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 600,
                      }}>
                        {row.inflation_rate_percent?.toFixed(2)}%
                      </span>
                    </td>
                    <td>₹ {row.last_l1_price?.toLocaleString() || 'N/A'}</td>
                    <td>₹ {row.least_quoted_price?.toLocaleString() || 'N/A'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                      No competitor data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC TABLE MODAL
// ─────────────────────────────────────────────────────────────────────────────

const GenericTableModal = ({ title, data, onClose }) => {
  const parseData = (input) => {
    if (!input) return { type: 'empty' };

    if (input.content && typeof input.content === 'string') {
      const lines = input.content.split('\n').map(l => l.trim()).filter(Boolean);
      const metadata = [];
      let headers = [];
      const rows = [];
      let started = false;
      const SKIP = new Set(['×', 'Print', 'Close', 'Publish Representations']);

      lines.forEach(line => {
        if (line.includes('\t')) {
          const cells = line.split('\t');
          if (!started) { headers = cells; started = true; }
          else rows.push(cells);
        } else if (!SKIP.has(line)) {
          metadata.push(line);
        }
      });
      return { type: 'parsed_text', metadata, headers, rows };
    }

    let rows = [];
    if (Array.isArray(input)) rows = input;
    else if (typeof input === 'string') {
      try { const p = JSON.parse(input); rows = Array.isArray(p) ? p : [p]; }
      catch { return { type: 'empty' }; }
    } else if (typeof input === 'object') rows = [input];

    if (rows.length === 0) return { type: 'empty' };
    return { type: 'json_array', rows, headers: Object.keys(rows[0]) };
  };

  const { type, metadata, headers, rows } = parseData(data);
  if (type === 'empty') return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '900px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', padding: '20px' }}>
          {type === 'parsed_text' && metadata?.length > 0 && (
            <div style={{ marginBottom: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
              {metadata.map((line, i) => (
                <div key={i} style={{ fontSize: '14px', marginBottom: '4px', fontWeight: line.includes(':') ? 600 : 400 }}>
                  {line}
                </div>
              ))}
            </div>
          )}
          <div className="products-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="products-table">
              <thead>
                <tr>{headers.map((h, i) => <th key={i}>{h.replace(/_/g, ' ').toUpperCase()}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {type === 'json_array'
                      ? headers.map((h, j) => (
                        <td key={j}>{typeof row[h] === 'object' ? JSON.stringify(row[h]) : row[h]}</td>
                      ))
                      : row.map((cell, j) => <td key={j}>{cell}</td>)
                    }
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel"
            style={{ width: '100%', background: '#084f9a', color: 'white' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: TENDER DETAILS PAGE
// ─────────────────────────────────────────────────────────────────────────────

const TenderDetails = () => {
  const { tenderId } = useParams();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const JSON_SERVER_URL = import.meta.env.VITE_JSON_SERVER_URL;

  // ── UI state ──────────────────────────────────────────────────────────────
  const [expandedSections, setExpandedSections] = useState({
    tenderDetails: true,
    keyValues: false,
    preBidDetails: false,
    sample: false,
    corrigendum: false,
    consignee: false,
    documents: false,
    technicalSpecs: false,
    requiredDocs: false,
  });
  const [isInterested, setIsInterested] = useState(false);
  const [preBidAttendance, setPreBidAttendance] = useState(null);
  const [showPreBidModal, setShowPreBidModal] = useState(false);

  // States to hold sub-components
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // ── data state ────────────────────────────────────────────────────────────
  const [details, setDetails] = useState(null);
  const [links, setLinks] = useState([]);
  const [consigneeData, setConsigneeData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [raNumber, setRaNumber] = useState(null);
  const [corrigendumData, setCorrigendumData] = useState(null);
  const [representationData, setRepresentationData] = useState(null);
  const [techSpecs, setTechSpecs] = useState([]);
  const [loadingTechSpecs, setLoadingTechSpecs] = useState(false);

  // ── Modals / Flags ────────────────────────────────────────────────────────
  const [showSuggestedModal, setShowSuggestedModal] = useState(false);
  const [showItemCategoryModal, setShowItemCategoryModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showCorrigendumModal, setShowCorrigendumModal] = useState(false);
  const [showRepresentationModal, setShowRepresentationModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiAnalysisContent, setAiAnalysisContent] = useState('');
  const [analyzingATC, setAnalyzingATC] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false); // To search all Meril DB manually
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null); // ID or object
  const [showDeviationModal, setShowDeviationModal] = useState(false);

  // Pre-Bid Meeting local state
  // This was already declared above, removing duplicate
  // const [preBidAttendance, setPreBidAttendance] = useState(null);
  // const [showPreBidModal, setShowPreBidModal] = useState(false);

  // Pre-Bid Remarks Modal
  const [showPreBidRemarksModal, setShowPreBidRemarksModal] = useState(false);
  const [preBidRemarksData, setPreBidRemarksData] = useState(null);
  const [fetchingPreBidRemarks, setFetchingPreBidRemarks] = useState(false);

  // ── suggestions state ─────────────────────────────────────────────────────
  const [suggestedProducts, setSuggestedProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detectedCategory, setDetectedCategory] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // ── pricing state ─────────────────────────────────────────────────────────
  const [pricingData, setPricingData] = useState(null);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [pricingError, setPricingError] = useState(null);

  // ── AI ATC state ──────────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');

  // ── FETCH SUGGESTIONS ─────────────────────────────────────────────────────
  const fetchSuggestedProducts = useCallback(async () => {
    try {
      setLoadingSuggestions(true);
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/tenders/${encodeURIComponent(tenderId.replace(/_/g, '/'))}/suggestions`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      if (data.success) {
        setSuggestedProducts(data.data || []);
        setDetectedCategory(data.detected_category);
        setSelectedProduct(data.selected_product);
        setShowSuggestedModal(true);
      } else {
        alert(data.message || 'Failed to fetch suggestions');
      }
    } catch (err) {
      console.error('fetchSuggestedProducts:', err);
      alert('Error fetching suggestions');
    } finally {
      setLoadingSuggestions(false);
    }
  }, [API_BASE_URL, tenderId]);

  // ── FETCH TENDER DATA ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenderId) return;

    const fetchTenderData = async () => {
      try {
        setLoading(true);
        setError(null);
        let json = null;
        let dbData = null;

        // 1. Try DB first
        try {
          const token = localStorage.getItem('token');
          const dbRes = await fetch(
            `${API_BASE_URL}/tenders/${encodeURIComponent(tenderId.replace(/_/g, '/'))}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (dbRes.ok) {
            dbData = await dbRes.json();

            // Fire-and-forget background processing only if json_data is missing
            if (dbData.success && dbData.data?.detail_url && !dbData.data.json_data) {
              fetch('https://pdf.openprocure.ai/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bid_no: tenderId.replace(/_/g, '/'),
                  pdf_url: dbData.data.detail_url,
                }),
              })
                .then(r => r.json())
                .then(d => { if (d.status === 'success') window.location.reload(); })
                .catch(e => console.warn('Background processing failed:', e));
            }

            if (dbData.success && dbData.data?.json_data) {
              json = typeof dbData.data.json_data === 'string'
                ? JSON.parse(dbData.data.json_data)
                : dbData.data.json_data;
            }
          }
        } catch (dbErr) {
          console.warn('DB fetch failed, falling back to JSON API:', dbErr);
        }

        // 2. Fallback to /json endpoint
        if (!json && !(dbData?.open_source)) {
          const res = await fetch(
            `${API_BASE_URL}/tenders/${encodeURIComponent(tenderId.replace(/_/g, '/'))}/json`,
            { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
          );
          if (!res.ok) throw new Error(res.status === 404
            ? `Tender not found. Bid Number: ${tenderId.replace(/_/g, '/')}`
            : `Server error (HTTP ${res.status})`
          );
          json = await res.json();
        }

        // ── Extract fields ────────────────────────────────────────────────

        // OPEN TENDER FAST-PATH
        if (dbData?.open_source) {
          const o = dbData.data;
          const openDetails = o.tender_details || {};
          const basic = openDetails.basic_details || {};
          const work = openDetails.work_item_details || {};
          const emd = openDetails.emd_fee_details || {};

          setDetails({
            bidEndDate: o.end_date || 'N/A',
            bidOpeningDate: o.opening_date || 'N/A',
            bidOfferValidity: work['Bid Validity(Days)'] || work['Tender Validity(Days)'] || 'N/A',
            estimatedBidValue: work['Tender Value in ₹'] || 'N/A',
            organisationName: o.department || 'N/A',
            officeName: work.Location || o.state || 'N/A',
            departmentOrg: basic['Organisation Chain'] || o.department || 'N/A',
            totalQty: 'N/A', // Not stored discretely for Open Tenders
            itemCategory: basic['Tender Category'] || work['Product Category'] || o.items || 'N/A',
            itemCategoryCount: 1,
            documentRequired: 'N/A',
            evaluationMethod: basic['Form Of Contract'] || 'N/A',
            emdAmount: emd['EMD Amount in ₹'] || '0',
            emdRequired: (emd['EMD Amount in ₹'] && emd['EMD Amount in ₹'] !== '0' && emd['EMD Amount in ₹'] !== 'NA') ? 'Yes' : 'No',
            advisoryBank: 'N/A',
            epbgPercentage: 'N/A',
            epbgDuration: 'N/A',
            bidToRA: 'N/A',
            preBidDate: work['Pre Bid Meeting Date'] || 'N/A',
            preBidTime: 'N/A',
            preBidVenue: work['Pre Bid Meeting Place'] || 'N/A',
            sampleRequired: 'No',
            schedules: []
          });
          setConsigneeData(null);

          const rawFiles = o.file_link || [];
          const mappedLinks = Array.isArray(rawFiles) ? rawFiles.map(f => ({
            uri: f.file_path ? `${API_BASE_URL}/tenders/download?path=${encodeURIComponent(f.file_path)}` : '#',
            text: f.file_name || 'Document',
            label: f.category || f.description || 'Document'
          })) : [];
          setLinks(mappedLinks);

          setLoading(false);
          return;
        }

        // GEM TENDER PDF-JSON PARSING PATH
        const pages = Array.isArray(json.pages) ? json.pages : [];

        const extracted = {
          bidEndDate: 'N/A', bidOpeningDate: 'N/A', bidOfferValidity: 'N/A',
          estimatedBidValue: 'N/A', organisationName: 'N/A', officeName: 'N/A',
          departmentOrg: 'N/A', totalQty: 'N/A', itemCategory: 'N/A',
          itemCategoryCount: 0, documentRequired: 'N/A', evaluationMethod: 'N/A',
          emdAmount: 'N/A', emdRequired: 'No', advisoryBank: 'N/A',
          epbgPercentage: 'N/A', epbgDuration: 'N/A', bidToRA: 'N/A',
          preBidDate: 'N/A', preBidTime: 'N/A', preBidVenue: 'N/A',
          sampleRequired: 'No', schedules: [],
        };

        const processedRows = new Set();
        const itemCategoriesSet = new Set();
        let consigneeTableResult = null;
        let consigneeHeader = null;
        const aggregatedConsRows = [];
        let isCollectingCons = false;
        let consColumnCount = 0;
        let tableIndex = 0;

        pages.forEach(page => {
          (page.tables || []).forEach(table => {
            tableIndex++;

            // ── Consignee detection ──────────────────────────────────────
            const isConsigneeHeader = table.length > 0 &&
              table[0].some(cell => cell && String(cell).toLowerCase().includes('consignee'));

            if (isConsigneeHeader && table.length >= 2) {
              if (!consigneeHeader) {
                consigneeHeader = table[0];
                consColumnCount = table[0].length;
              }
              aggregatedConsRows.push(...table.slice(1));
              isCollectingCons = true;
            } else if (isCollectingCons && table.length > 0) {
              const colCount = table[0].length;
              const isOther = table.some(row => row.some(cell => {
                if (!cell) return false;
                const s = String(cell).toLowerCase();
                return s.includes('pre-bid') || s.includes('technical specifications') ||
                  s.includes('specification document') || s.includes('boq detail document');
              }));

              if (!isOther) {
                let startIdx = 0;
                if (JSON.stringify(table[0]) === JSON.stringify(consigneeHeader)) startIdx = 1;
                if (Math.abs(colCount - consColumnCount) <= 2) {
                  aggregatedConsRows.push(...table.slice(startIdx));
                } else {
                  isCollectingCons = false;
                }
              } else {
                isCollectingCons = false;
              }
            }

            // ── Pre-bid detection ────────────────────────────────────────
            const isPreBid = table.some(row =>
              row.some(cell => cell && String(cell).toLowerCase().includes('pre-bid'))
            );
            if (isPreBid && table.length >= 2) {
              const headerRow = table[0];
              const valueRow = table[1];
              headerRow.forEach((header, idx) => {
                if (!header) return;
                const h = header.toLowerCase();
                const v = valueRow[idx];
                if (h.includes('pre-bid date')) {
                  if (v?.includes(' ')) {
                    const parts = v.split(' ');
                    extracted.preBidDate = parts[0];
                    extracted.preBidTime = parts.slice(1).join(' ');
                  } else {
                    extracted.preBidDate = v;
                  }
                }
                if (h.includes('pre-bid venue')) extracted.preBidVenue = v;
              });
            }

            // ── Key-value rows ───────────────────────────────────────────
            table.forEach(([key, value]) => {
              if (!key || !value) return;
              const k = key.toLowerCase();
              const v = String(value).toLowerCase();
              const rid = k + '|||' + v;
              if (processedRows.has(rid)) return;
              processedRows.add(rid);

              if (k.includes('bid end')) extracted.bidEndDate = value;
              else if (k.includes('bid opening')) extracted.bidOpeningDate = value;
              else if (k.includes('offer validity')) extracted.bidOfferValidity = value;
              else if (k.includes('estimated bid value')) extracted.estimatedBidValue = value;
              else if (k.includes('organisation')) extracted.organisationName = value;
              else if (k.includes('office name')) extracted.officeName = value;
              else if (k.includes('department')) extracted.departmentOrg = value;
              else if (k.includes('total quantity')) extracted.totalQty = value;
              else if (k.includes('item category')) itemCategoriesSet.add(value);
              else if (k.includes('document required')) extracted.documentRequired = value;
              else if (k.includes('evaluation method')) extracted.evaluationMethod = value;
              else if (k.includes('emd amount')) extracted.emdAmount = value;
              else if (k.includes('advisory bank')) extracted.advisoryBank = value;
              else if (k.includes('epbg percentage')) extracted.epbgPercentage = value;
              else if (k.includes('duration of epbg')) extracted.epbgDuration = value;
              else if (k.includes('bid to ra')) extracted.bidToRA = value;

              if (k.includes('schedule name') || (k.includes('emd') && k.includes('amount'))) {
                extracted.schedules.push({ description: key, value });
              }

              if (
                v.includes('sample submission') ||
                v.includes('submission samples are a must') ||
                v.includes('the samples will be sent to external quality assurance') ||
                v.includes('it is mandatory to submit samples') ||
                v.includes('submit samples')
              ) {
                extracted.sampleRequired = 'Yes';
              }
            });
          });
        });

        if (consigneeHeader) {
          consigneeTableResult = [consigneeHeader, ...aggregatedConsRows];
        }

        if (itemCategoriesSet.size > 0) {
          extracted.itemCategory = Array.from(itemCategoriesSet).join(', ');
          extracted.itemCategoryCount = itemCategoriesSet.size;
        }

        // ── BOQ CSV override ──────────────────────────────────────────────
        const boqCsvLink = (json.links || []).find(l =>
          l.uri &&
          (l.uri.toLowerCase().endsWith('.csv') || l.uri.toLowerCase().includes('content-type=text/csv')) &&
          (l.uri.includes('/BoqLineItemsDocument/') || l.uri.includes('/BoqDocument/'))
        );

        if (boqCsvLink) {
          try {
            let proxyUrl = boqCsvLink.uri;
            if (proxyUrl.includes('mkp.gem.gov.in')) {
              proxyUrl = proxyUrl.replace('https://mkp.gem.gov.in', '/gem-media');
            }
            const csvResults = await new Promise((resolve, reject) => {
              Papa.parse(proxyUrl, {
                download: true, header: true, skipEmptyLines: true,
                complete: resolve, error: reject,
              });
            });

            if (csvResults?.data?.length > 0) {
              const csvItems = new Set();
              let count = 0;
              csvResults.data.forEach(row => {
                const norm = {};
                Object.keys(row).forEach(k => { if (k) norm[k.toLowerCase().trim()] = row[k]; });
                const val = norm['item category'] || norm['item title'] || norm['item name'] || norm['name'];
                if (val?.trim()) { csvItems.add(val.trim()); count++; }
              });
              if (csvItems.size > 0) {
                extracted.itemCategory = Array.from(csvItems).join(', ');
                extracted.itemCategoryCount = count;
              }
            }
          } catch { /* keep scraped data */ }
        }

        extracted.emdRequired =
          extracted.emdAmount !== 'N/A' && extracted.emdAmount !== '0' ? 'Yes' : 'No';

        setDetails(extracted);
        setConsigneeData(consigneeTableResult);
        setLinks([
          ...new Map(
            (json.links || []).filter(l => l.uri).map(l => [l.uri, l])
          ).values(),
        ]);
        setLoading(false);

      } catch (err) {
        console.error('TenderDetails error:', err);
        setError(err.message || 'Failed to load tender data');
        setLoading(false);
      }
    };

    fetchTenderData();
  }, [tenderId, API_BASE_URL, JSON_SERVER_URL]);

  // ── FETCH METADATA ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenderId) return;
    const fetchMetadata = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(
          `${API_BASE_URL}/tenders/${encodeURIComponent(tenderId.replace(/_/g, '/'))}/meta`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.success && data.data) {
          setIsInterested(!!data.data.is_interested);
          setRaNumber(data.data.ra_no);
          setCorrigendumData(data.data.Corrigendum_json);
          setRepresentationData(data.data.Representation_json);
        }
      } catch (err) {
        console.error('fetchMetadata:', err);
      }
    };
    fetchMetadata();
  }, [tenderId, API_BASE_URL]);

  // ── FETCH PRICING ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!details?.itemCategory || !details?.totalQty) return;
    const fetchPricing = async () => {
      try {
        setLoadingPricing(true);
        setPricingError(null);
        const PRICING_API = import.meta.env.VITE_PRICING_API || 'https://api.openprocure.ai/api/pricing/predict';
        const productName = details.itemCategory.replace(/\s*\([VvQq]\d+\)/g, '').trim();
        const quantity = parseInt(details.totalQty) || 1;

        const res = await fetch(PRICING_API, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ product: productName, quantity }),
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        setPricingData(await res.json());
      } catch (err) {
        console.error('fetchPricing:', err);
        setPricingError(err.message || 'Failed to fetch pricing data');
      } finally {
        setLoadingPricing(false);
      }
    };
    fetchPricing();
  }, [details]);

  const fetchPreBidRemarks = async () => {
    try {
      setFetchingPreBidRemarks(true);
      const cleanBid = tenderId.replace(/\//g, '_');
      const res = await fetch(`${API_BASE_URL}/prebid/meeting/${encodeURIComponent(cleanBid)}`);

      if (res.ok) {
        const result = await res.json();
        setPreBidRemarksData(result.data);
      } else {
        // 404 or other errors mean no active meeting or error fetching
        setPreBidRemarksData(null);
      }
    } catch (err) {
      console.error("Failed to fetch prebid remarks:", err);
      setPreBidRemarksData(null);
    } finally {
      setFetchingPreBidRemarks(false);
      setShowPreBidRemarksModal(true);
    }
  };

  // ── FETCH TECH SPECS ──────────────────────────────────────────────────────
  const fetchTechSpecs = useCallback(async () => {
    if (techSpecs.length > 0) return;
    const catalogueLinks = links.filter(l => l.uri.includes('/showCatalogue/'));
    if (catalogueLinks.length === 0) return;
    try {
      setLoadingTechSpecs(true);
      const all = await Promise.all(
        catalogueLinks.map(async link => {
          const res = await fetch(
            `${import.meta.env.VITE_SCRAPER_API || 'https://specs.openprocure.ai'}/scrape/catalogue?url=${encodeURIComponent(link.uri)}`
          );
          const json = await res.json();
          return json.status === 'success'
            ? { title: json.title || 'Technical Specifications', rows: json.data || [] }
            : null;
        })
      );
      setTechSpecs(all.filter(Boolean));
    } catch (err) {
      console.error('fetchTechSpecs:', err);
    } finally {
      setLoadingTechSpecs(false);
    }
  }, [links, techSpecs.length]);

  // ── TOGGLE INTEREST ───────────────────────────────────────────────────────
  const handleToggleInterest = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/tenders/${encodeURIComponent(tenderId.replace(/_/g, '/'))}/interest`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setIsInterested(prev => !prev);
      else alert('Failed to update interest status');
    } catch { alert('Failed to update interest status. Please try again.'); }
  };

  // ── AI ATC CHECK ──────────────────────────────────────────────────────────
  const handleCheckATC = async () => {
    setShowAIModal(true);
    setAiLoading(true);
    setAiResult('');

    try {
      const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
      if (!OPENAI_API_KEY) throw new Error('OpenAI API Key is missing in frontend .env');

      // FIX: tenderDocumentLinks defined here via local var since we need it in this scope
      const docLinks = links.filter(
        l => !l.uri.includes('/showCatalogue/') &&
          !(l.uri.includes('/catalog_data/') && l.uri.toLowerCase().endsWith('.pdf'))
      );

      let targetLink =
        links.find(l => l.uri && (l.uri.toLowerCase().includes('atc') || l.label === 'ATC')) ||
        links.find(l => l.uri && (l.label === 'Bid Document' || l.text === 'Bid Document')) ||
        docLinks.find(l => l.uri && l.uri.toLowerCase().endsWith('.pdf'));

      if (!targetLink) throw new Error('No ATC or Bid Document found to analyze.');

      let fetchUrl = targetLink.uri;
      if (fetchUrl.includes('mkp.gem.gov.in')) fetchUrl = fetchUrl.replace(/https?:\/\/[^/]+/, '/gem-proxy');
      else if (fetchUrl.includes('fulfilment.gem.gov.in')) fetchUrl = fetchUrl.replace(/https?:\/\/[^/]+/, '/gem-cpa-proxy');
      else if (fetchUrl.includes('gem.gov.in')) fetchUrl = fetchUrl.replace(/https?:\/\/[^/]+/, '/gem-proxy');

      const fileRes = await fetch(fetchUrl);
      if (!fileRes.ok) throw new Error('Failed to download document from: ' + targetLink.uri);

      const blob = await fileRes.blob();
      const file = new File([blob], 'document.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      const parseRes = await fetch(`${API_BASE_URL}/utils/parse-pdf`, { method: 'POST', body: formData });
      if (!parseRes.ok) throw new Error('Failed to extract text from PDF.');
      const { text: pdfText } = await parseRes.json();

      if (!pdfText || pdfText.length < 50) throw new Error('Document text is empty or unreadable.');

      const gptRes = await fetch('/openai-proxy/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY.trim()}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a helpful tender assistant.' },
            { role: 'user', content: `Analyze the following Tender Document text and answer:\nAre there any EMD (Earnest Money Deposit) related details mentioned?\n\nPlease extract and return:\n- EMD Amount: [Value if found]\n- EMD Percentage: [Value if found]\n- Exemptions: [Yes/No/Details]\n- Payment Forms: [BG, DD, etc]\n- Other Details: [Any other important EMD clauses]\n\nIf nothing is mentioned, state "No EMD details found".\n\nDocument Content (Truncated):\n${pdfText.substring(0, 100000)}...` },
          ],
          temperature: 0.3,
        }),
      });

      const gptData = await gptRes.json();
      if (!gptRes.ok) throw new Error(gptData.error?.message || `OpenAI API Error: ${gptRes.status}`);
      if (gptData.choices?.[0]) setAiResult(gptData.choices[0].message.content);
      else throw new Error('No response from AI.');

    } catch (err) {
      console.error('handleCheckATC:', err);
      setAiResult('Error: ' + (err.message || 'Failed to analyze document.'));
    } finally {
      setAiLoading(false);
    }
  };

  // ── HELPERS ───────────────────────────────────────────────────────────────
  const calculateRowSpans = (rows) => {
    const spans = [];
    let current = null, count = 0, start = 0;
    rows.forEach((row, i) => {
      if (row.category !== current) {
        if (current !== null) for (let j = start; j < i; j++) spans[j] = j === start ? count : 0;
        current = row.category; start = i; count = 1;
      } else { count++; }
    });
    for (let j = start; j < rows.length; j++) spans[j] = j === start ? count : 0;
    return spans;
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => {
      const next = { ...prev, [section]: !prev[section] };
      if (section === 'technicalSpecs' && !prev.technicalSpecs) fetchTechSpecs();
      return next;
    });
  };

  // ── DERIVED ───────────────────────────────────────────────────────────────
  const tenderDocumentLinks = links.filter(
    l => !l.uri.includes('/showCatalogue/') &&
      !(l.uri.includes('/catalog_data/') && l.uri.toLowerCase().endsWith('.pdf'))
  );

  // ── LOADING / ERROR ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <div className="spinner" />
      <p style={{ marginTop: '20px', color: '#666' }}>Loading tender details…</p>
    </div>
  );

  if (error) return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h3>The tender document is currently being processed. Please check back shortly.</h3>
      <button onClick={() => window.location.reload()} style={{
        padding: '8px 16px', backgroundColor: '#007bff', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px',
      }}>
        Retry
      </button>
    </div>
  );

  if (!details) return <p>Loading tender data…</p>;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="tender-details-container">
      <div className="content-wrapper">

        {/* ── LEFT CONTENT ── */}
        <div className="left-content">

          {/* Tender Details */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('tenderDetails')}>
              <h2>Tender Details</h2>
              <span className={`arrow ${expandedSections.tenderDetails ? 'expanded' : ''}`}>^</span>
            </div>
            {expandedSections.tenderDetails && (
              <div className="accordion-content">
                <div className="details-grid-horizontal">

                  {/* Row 1: Bid No / RA No / Bid to RA */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '40px' }}>
                      <div className="detail-item-left">
                        <label>Bid No</label>
                        <p>{tenderId.replace(/_/g, '/')}</p>
                      </div>
                      <div className="detail-item-left">
                        <label>RA No</label>
                        <p>{raNumber || 'N/A'}</p>
                      </div>
                      <div className="detail-item-left">
                        <label>Bid to RA</label>
                        <p>{details.bidToRA}</p>
                      </div>
                    </div>
                  </div>

                  <div className="detail-item-left"><label>Bid End Date</label><p>{details.bidEndDate}</p></div>
                  <div className="detail-item-left"><label>Bid Opening Date</label><p>{details.bidOpeningDate}</p></div>
                  <div className="detail-item-left"><label>Bid Offer Validity</label><p>{details.bidOfferValidity}</p></div>
                  <div className="detail-item-left"><label>Total Quantity</label><p>{details.totalQty}</p></div>

                  <div className="detail-item-left">
                    <label>
                      Item Category
                      {details.itemCategoryCount > 1 && (
                        <span style={{ fontSize: '0.85em', color: '#666' }}> ({details.itemCategoryCount} items)</span>
                      )}
                    </label>
                    <p>
                      <button
                        onClick={() => setShowItemCategoryModal(true)}
                        style={{
                          background: 'none', border: 'none', color: '#084f9a',
                          fontWeight: '500', cursor: 'pointer', padding: 0,
                          textDecoration: 'underline', fontSize: '14px',
                        }}
                      >
                        View Items
                      </button>
                    </p>
                  </div>

                  <div className="detail-item-left"><label>Organisation Name</label><p>{details.organisationName}</p></div>
                  <div className="detail-item-left"><label>Office Name</label><p>{details.officeName}</p></div>

                  <div className="detail-item-left">
                    <label>EMD Amount</label>
                    <p>
                      {details.schedules?.length > 2 ? (
                        <>
                          <span style={{ color: '#007bff' }}>Schedule based Value</span>
                          <button
                            onClick={() => setShowScheduleModal(true)}
                            style={{ marginLeft: '10px', padding: '2px 8px', fontSize: '12px', background: '#084f9a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            View Values
                          </button>
                        </>
                      ) : (
                        details.emdAmount !== 'N/A' ? details.emdAmount : 'N/A'
                      )}
                      <button
                        onClick={handleCheckATC}
                        style={{
                          marginLeft: '10px', padding: '4px 10px', fontSize: '11px',
                          background: '#7c3aed', color: 'white', border: 'none',
                          borderRadius: '12px', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                        }}
                        title="Analyze ATC for EMD details using AI"
                      >
                        <Wand2 size={12} /> Check ATC
                      </button>
                    </p>
                  </div>

                  <div className="detail-item-left">
                    <label>Estimated Bid Value</label>
                    <p>
                      {details.estimatedBidValue !== 'N/A'
                        ? `₹ ${Number(details.estimatedBidValue).toLocaleString()}`
                        : 'Refer Document'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Corrigendum & Representation */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('corrigendum')}>
              <h2>Corrigendum / Representation</h2>
              <span className={`arrow ${expandedSections.corrigendum ? 'expanded' : ''}`}>^</span>
            </div>
            {expandedSections.corrigendum && (
              <div className="accordion-content">
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  {!corrigendumData && !representationData && <p style={{ color: '#666' }}>No data available.</p>}
                  {corrigendumData && <button className="feature-btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => setShowCorrigendumModal(true)}>View Corrigendum</button>}
                  {representationData && <button className="feature-btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => setShowRepresentationModal(true)}>View Representation</button>}
                </div>
              </div>
            )}
          </div>

          {/* Key Values */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('keyValues')}>
              <h2>Key Values</h2>
              <span className={`arrow ${expandedSections.keyValues ? 'expanded' : ''}`}>^</span>
            </div>
            {expandedSections.keyValues && (
              <div className="accordion-content">
                <div className="key-values-row">
                  <div className="detail-item-left"><label>EMD Required</label><p>{details.emdRequired}</p></div>
                  <div className="detail-item-left"><label>Advisory Bank</label><p>{details.advisoryBank}</p></div>
                  <div className="detail-item-left"><label>ePBG Percentage (%)</label><p>{details.epbgPercentage}</p></div>
                  <div className="detail-item-left"><label>Duration of ePBG (Months)</label><p>{details.epbgDuration}</p></div>
                </div>
              </div>
            )}
          </div>

          {/* Consignee Details */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('consignee')}>
              <h2>Consignee Details</h2>
              <span className={`arrow ${expandedSections.consignee ? 'expanded' : ''}`}>^</span>
            </div>
            {expandedSections.consignee && (
              <div className="accordion-content">
                {consigneeData && consigneeData.length >= 2 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: '#f8f9fa' }}>
                          {consigneeData[0].map((h, i) => (
                            <th key={i} style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {consigneeData.slice(1).map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} style={{ padding: '10px', border: '1px solid #ddd', verticalAlign: 'top' }}>{cell || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>No consignee data available</p>
                )}
              </div>
            )}
          </div>

          {/* Pre-Bid Details */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('preBidDetails')}>
              <h2>Pre-Bid Details</h2>
              <span className={`arrow ${expandedSections.preBidDetails ? 'expanded' : ''}`}>^</span>
            </div>
            {expandedSections.preBidDetails && (
              <div className="accordion-content">
                <div className="key-values-row">
                  <div className="detail-item-left"><label>Pre-Bid Date</label><p>{details.preBidDate}</p></div>
                  <div className="detail-item-left"><label>Pre-Bid Time</label><p>{details.preBidTime}</p></div>
                  <div className="detail-item-left" style={{ gridColumn: '1 / -1' }}><label>Pre-Bid Venue</label><p>{details.preBidVenue}</p></div>

                  {details.preBidDate && (
                    <div className="detail-item-left" style={{ gridColumn: '1 / -1' }}>
                      <label>Pre Bid Attendance</label>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'center' }}>
                        {['yes', 'no'].map(val => (
                          <button
                            key={val}
                            onClick={() => {
                              setPreBidAttendance(val);
                              if (val === 'yes') setShowPreBidModal(true);
                            }}
                            style={{
                              padding: '8px 20px', minWidth: '80px', fontWeight: '500', fontSize: '14px',
                              borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s ease',
                              backgroundColor: preBidAttendance === val ? (val === 'yes' ? '#28a745' : '#dc3545') : '#f8f9fa',
                              color: preBidAttendance === val ? 'white' : '#333',
                              border: `2px solid ${preBidAttendance === val ? (val === 'yes' ? '#28a745' : '#dc3545') : '#dee2e6'}`,
                            }}
                          >
                            {val.charAt(0).toUpperCase() + val.slice(1)}
                          </button>
                        ))}
                        {preBidAttendance && (
                          <span style={{ fontSize: '13px', color: '#666', marginLeft: '10px' }}>
                            {preBidAttendance === 'yes' ? '✓ Planning to attend' : '✗ Not attending'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sample */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('sample')}>
              <h2>Sample</h2>
              <span className={`arrow ${expandedSections.sample ? 'expanded' : ''}`}>^</span>
            </div>
            {expandedSections.sample && (
              <div className="accordion-content">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                  <div className="detail-item-left">
                    <label>Sample Required</label>
                    <p>{details.sampleRequired}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Technical Specifications */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('technicalSpecs')}>
              <h2>Technical Specifications</h2>
              <span className={`arrow ${expandedSections.technicalSpecs ? 'expanded' : ''}`}>^</span>
            </div>
            {expandedSections.technicalSpecs && (
              <div className="accordion-content">
                {links
                  .filter(l => l.uri?.includes('/catalog_data/') && l.uri.toLowerCase().endsWith('.pdf'))
                  .map((pdfLink, idx) => (
                    <div key={`pdf-${idx}`} style={{ marginBottom: '30px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ padding: '10px 15px', background: '#f8f9fa', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: '0.9rem' }}>
                        {pdfLink.text || 'Technical Catalog (PDF)'}
                      </div>
                      <iframe src={pdfLink.uri} width="100%" height="600px" style={{ border: 'none' }} title={`PDF-${idx}`} />
                    </div>
                  ))}

                {loadingTechSpecs && <div className="loading-state"><p>Loading Technical Specifications...</p></div>}

                {!loadingTechSpecs && techSpecs.map((catalogue, cIdx) => {
                  const rowSpans = calculateRowSpans(catalogue.rows);
                  return (
                    <div key={cIdx} style={{ marginBottom: '30px' }}>
                      <p className="phead">{catalogue.title}</p>
                      <div className="tech-spec-table-wrapper">
                        <table className="tech-spec-table">
                          <thead>
                            <tr>
                              <th>Category</th><th>Specification</th>
                              <th>Choose Product</th><th>Allowed Values</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catalogue.rows.map((row, rIdx) => {
                              const span = rowSpans[rIdx];
                              return (
                                <tr key={rIdx}>
                                  {span > 0 && <td rowSpan={span} className="merged-cell">{row.category}</td>}
                                  <td>{row.specification}</td>
                                  <td>{row.allowed_values}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {!loadingTechSpecs && techSpecs.length === 0 &&
                  !links.some(l => l.uri?.includes('/catalog_data/') && l.uri.toLowerCase().endsWith('.pdf')) && (
                    <p className="tech-spec-empty">No technical specifications available.</p>
                  )}
              </div>
            )}
          </div>

          {/* Tender Documents */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('documents')}>
              <h2>Tender Document</h2>
              <span className={`arrow ${expandedSections.documents ? 'expanded' : ''}`}>^</span>
            </div>
            {expandedSections.documents && (
              <div className="accordion-content">
                <div className="documents-list">
                  {tenderDocumentLinks.length > 0 ? (() => {
                    let counter = 1;
                    return tenderDocumentLinks.map((link, i) => {
                      let label = '';
                      if (link.uri.includes('/BoqDocument/') || link.uri.includes('/BoqLineItemsDocument/') || link.uri.includes('/BOQDocument/')) {
                        label = 'BOQ Document';
                      } else if (link.uri.includes('/downloadOmppdfile/')) {
                        label = 'OMPPD';
                      } else if (link.uri.toLowerCase().includes('atc') || link.label === 'ATC') {
                        label = 'ATC';
                      } else if (link.uri.includes('fulfilment.gem.gov.in/contract/')) {
                        label = 'ATC';
                      } else if (link.uri.includes('shared_doc/gtc')) {
                        label = 'Gem Contract';
                      } else {
                        label = `Resources${counter++}`;
                      }

                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 15px', marginBottom: '8px',
                          background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e5e7eb', gap: '15px',
                        }}>
                          <span style={{ fontWeight: '500', color: '#333', fontSize: '14px', flex: 1, minWidth: '120px' }}>
                            {label}
                          </span>
                          <a
                            href={link.uri} target="_blank" rel="noopener noreferrer"
                            style={{
                              padding: '6px 10px', width: '100px', textAlign: 'center',
                              background: '#084f9a', color: 'white', textDecoration: 'none',
                              borderRadius: '4px', fontSize: '13px', fontWeight: '500',
                              display: 'inline-block', flexShrink: 0,
                            }}
                            onMouseOver={e => e.currentTarget.style.background = '#063a73'}
                            onMouseOut={e => e.currentTarget.style.background = '#084f9a'}
                          >
                            Download
                          </a>
                        </div>
                      );
                    });
                  })() : (
                    <p className="tech-spec-empty">No documents available.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Required Documents */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('requiredDocs')}>
              <h2>Required Documents To Participate</h2>
              <span className={`arrow ${expandedSections.requiredDocs ? 'expanded' : ''}`}>^</span>
            </div>
            {expandedSections.requiredDocs && (
              <div className="accordion-content">
                <ul className="required-docs-list">
                  {details.documentRequired.split(',').map((doc, i) => {
                    const text = doc.trim();
                    if (text.toLowerCase().includes('eligibility for exemption must be uploaded')) return null;
                    return <li key={i}>{text}</li>;
                  })}
                </ul>
                {details.documentRequired.toLowerCase().includes('eligibility for exemption must be uploaded') && (
                  <div style={{ marginTop: '10px', padding: '10px', background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '4px', fontSize: '0.9rem', color: '#856404' }}>
                    <strong>Note:</strong> The supporting documents to prove eligibility for exemption must be uploaded for evaluation by the buyer.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="right-sidebar">
          <div className="features-panel">
            <h3>TENDER FEATURES</h3>
            <button
              className={`feature-btn ${isInterested ? 'interested-active' : ''}`}
              onClick={handleToggleInterest}
            >
              <svg width="18" height="18" viewBox="0 0 24 24"
                fill={isInterested ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              Interested
            </button>
            <button className="feature-btn">⏰ Set Reminder</button>
            <button
              className="feature-btn"
              onClick={fetchSuggestedProducts}
              disabled={loadingSuggestions}
            >
              {loadingSuggestions ? 'Loading…' : 'View Suggested Products'}
            </button>
            <button className="feature-btn" onClick={() => setShowPricingModal(true)}>
              View Suggest Pricing
            </button>
            <button className="feature-btn" onClick={fetchPreBidRemarks} disabled={fetchingPreBidRemarks}>
              {fetchingPreBidRemarks ? 'Fetching BOQ...' : '📄 View BOQ'}
            </button>
            <button className="feature-btn">↗ Share</button>
          </div>
        </div>
      </div>

      {/* ── MODALS ── */}
      {showSuggestedModal && (
        <SuggestedProductsModal
          products={suggestedProducts}
          detectedCategory={detectedCategory}
          selectedProduct={selectedProduct}
          bidNumber={tenderId}
          itemCategoryString={details?.itemCategory}
          onUpdate={newProducts => setSuggestedProducts(newProducts)}
          onClose={() => setShowSuggestedModal(false)}
        />
      )}

      {showPreBidRemarksModal && (
        <PreBidRemarksModal
          data={preBidRemarksData}
          onClose={() => setShowPreBidRemarksModal(false)}
        />
      )}

      {showItemCategoryModal && (
        <ItemCategoryModal
          itemsString={details.itemCategory}
          onClose={() => setShowItemCategoryModal(false)}
        />
      )}

      {showPricingModal && (
        <SuggestPricingModal
          onClose={() => setShowPricingModal(false)}
          pricingData={pricingData}
          loading={loadingPricing}
          error={pricingError}
        />
      )}

      {showCorrigendumModal && (
        <CorrigendumModal
          data={corrigendumData}
          onClose={() => setShowCorrigendumModal(false)}
        />
      )}

      {showPreBidModal && (
        <PreBidModal
          onClose={() => setShowPreBidModal(false)}
          bidNumber={tenderId}
          tenderDetails={details}
        />
      )}

      {showRepresentationModal && (
        <GenericTableModal title="Representation Details" data={representationData} onClose={() => setShowRepresentationModal(false)} />
      )}

      {showScheduleModal && details.schedules && (
        <GenericTableModal
          title="Schedule Values"
          data={details.schedules.map(s => ({ Description: s.description, Value: s.value }))}
          onClose={() => setShowScheduleModal(false)}
        />
      )}

      {showAIModal && (
        <AIAnalysisModal
          title="ATC EMD Analysis"
          content={aiResult}
          loading={aiLoading}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </div>
  );
};

export default TenderDetails;
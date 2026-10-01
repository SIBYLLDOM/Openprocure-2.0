// src/pages/Tenders/MasterProductListModal.jsx
// Excel-style grid for bulk-editing a tender's suggested products: change a
// product code inline (with catalogue autocomplete) or remove a row entirely.
// Reuses the same PUT /tenders/:id/suggestions endpoint the Suggested
// Products modal (TenderDetails.jsx) uses to save — that endpoint also prunes
// deviation_tables for any item_key that's no longer present, so removing a
// row here automatically drops its deviation table too.

import React, { useState, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const gridThStyle = {
  padding: '9px 10px', color: '#374151', fontWeight: 700,
  fontSize: '12px', textAlign: 'left', letterSpacing: '0.02em',
  whiteSpace: 'nowrap', border: '1px solid #d1d5db',
};

const gridTdStyle = {
  padding: '2px', verticalAlign: 'middle',
  border: '1px solid #e5e7eb',
};

const cellInputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', border: '1px solid transparent',
  background: 'transparent', font: 'inherit', color: '#1f2937',
  borderRadius: '3px',
};

const btnStyle = (bg, disabled = false) => ({
  padding: '7px 16px', background: disabled ? '#9ca3af' : bg,
  color: 'white', border: 'none', borderRadius: '6px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '13px', fontWeight: 600,
});

const MasterProductListModal = ({ bidNumber, products, onClose, onSaved }) => {
  const [localProducts, setLocalProducts] = useState(products);
  const [saving, setSaving] = useState(false);
  const [codeSuggestRowIdx, setCodeSuggestRowIdx] = useState(null);
  const [codeSuggestOptions, setCodeSuggestOptions] = useState([]);
  const [codeSuggestLoading, setCodeSuggestLoading] = useState(false);
  const codeSuggestDebounceRef = useRef(null);
  const productCodeRefs = useRef([]);

  // { idx, mode: 'delete' | 'change', pendingProduct? } — set while the reason
  // modal is open; the row isn't touched until the user confirms with a reason.
  const [reasonPrompt, setReasonPrompt] = useState(null);
  const [reasonText, setReasonText] = useState('');

  // Soft-delete: mark the row NA in place (keep item_key/serial number) instead
  // of removing it, and require a reason so it can feed future suggestions.
  const handleRemove = (idx) => {
    setReasonPrompt({ idx, mode: 'delete' });
    setReasonText('');
  };

  const handleReasonCancel = () => {
    setReasonPrompt(null);
    setReasonText('');
  };

  const handleReasonConfirm = () => {
    const text = reasonText.trim();
    if (!text || !reasonPrompt) return;
    const { idx, mode, pendingProduct } = reasonPrompt;

    setLocalProducts(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      if (mode === 'delete') {
        return {
          ...p,
          previous_product_code: p.product_code,
          product_code: 'NA',
          title: 'NA',
          deleted: true,
          delete_reason: text,
          _feedback_pending: true,
        };
      }
      // mode === 'change'
      return {
        ...p,
        product_code: pendingProduct.product_code,
        title: pendingProduct.title || pendingProduct.product_name || p.title,
        previous_product_code: p.product_code,
        change_reason: text,
        _feedback_pending: true,
      };
    }));

    setReasonPrompt(null);
    setReasonText('');
  };

  const handleCellChange = (idx, field, value) =>
    setLocalProducts(prev => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));

  const fetchProductCodeSuggestions = async (term) => {
    if (!term || term.trim().length < 2) {
      setCodeSuggestOptions([]);
      return;
    }
    setCodeSuggestLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE}/tenders/products/search?q=${encodeURIComponent(term.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.success) setCodeSuggestOptions((data.data || []).slice(0, 8));
    } catch (err) {
      console.error('Product code suggest failed:', err);
    } finally {
      setCodeSuggestLoading(false);
    }
  };

  const handleProductCodeInput = (idx, value) => {
    handleCellChange(idx, 'product_code', value);
    setCodeSuggestRowIdx(idx);
    clearTimeout(codeSuggestDebounceRef.current);
    codeSuggestDebounceRef.current = setTimeout(() => fetchProductCodeSuggestions(value), 250);
  };

  const handleProductCodeSelect = (idx, product) => {
    setCodeSuggestRowIdx(null);
    setCodeSuggestOptions([]);

    const current = localProducts[idx];
    const isRealChange = current.product_code && current.product_code !== product.product_code;
    if (isRealChange) {
      // Swapping an already-suggested product for a different one — capture why.
      setReasonPrompt({ idx, mode: 'change', pendingProduct: product });
      setReasonText('');
      return;
    }

    setLocalProducts(prev => prev.map((p, i) => (i === idx ? {
      ...p,
      product_code: product.product_code,
      title: product.title || product.product_name || p.title,
    } : p)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
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
        if (onSaved) onSaved(localProducts);
        onClose();
      } else {
        alert(data.message || 'Failed to save');
      }
    } catch (e) {
      console.error('MasterProductListModal save:', e);
      alert('Error saving. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '8px', width: '95vw', maxWidth: '1100px',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #d1d5db',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f3f4f6', borderRadius: '8px 8px 0 0', flexShrink: 0,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#111827' }}>📊 Edit Master List</h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>
              Edit the Product Code, or remove a row — press Enter or Tab to move to the next row
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ color: '#6b7280', fontSize: '20px', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: '#e5e7eb' }}>
                <th style={gridThStyle}>#</th>
                <th style={gridThStyle}>Item Category</th>
                <th style={gridThStyle}>Tender Product</th>
                <th style={gridThStyle}>Product Name</th>
                <th style={gridThStyle}>Product Code</th>
                <th style={{ ...gridThStyle, width: 100 }}>Relevancy %</th>
                <th style={{ ...gridThStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {localProducts.map((p, idx) => (
                <tr key={`master-row-${p.item_key || idx}`} style={p.deleted ? { opacity: 0.5 } : undefined}>
                  <td style={{ ...gridTdStyle, textAlign: 'center', color: '#6b7280', fontWeight: 600, background: '#f9fafb' }}>
                    {idx + 1}
                  </td>
                  <td style={{ ...gridTdStyle, padding: '8px 10px', background: '#f9fafb', color: '#374151' }}>
                    {p.item_category || '—'}
                  </td>
                  <td style={{ ...gridTdStyle, padding: '8px 10px', background: '#f9fafb', color: '#374151' }}>
                    {p.tender_item_name || '—'}
                  </td>
                  <td style={{ ...gridTdStyle, padding: '8px 10px', background: '#f9fafb', color: '#374151', fontWeight: 600 }}>
                    {p.title || '—'}
                    {p.deleted && p.delete_reason && (
                      <span title={p.delete_reason} style={{ marginLeft: 6, fontSize: '11px', color: '#dc2626', cursor: 'help' }}>ⓘ</span>
                    )}
                  </td>
                  <td style={{ ...gridTdStyle, position: 'relative' }}>
                    {p.deleted ? (
                      <div style={{ padding: '8px 10px', color: '#dc2626', fontWeight: 700, fontStyle: 'italic' }}>NA</div>
                    ) : (
                      <>
                        <input
                          ref={el => (productCodeRefs.current[idx] = el)}
                          value={p.product_code || ''}
                          onChange={e => handleProductCodeInput(idx, e.target.value)}
                          onFocus={() => { if (p.product_code) fetchProductCodeSuggestions(p.product_code); setCodeSuggestRowIdx(idx); }}
                          onBlur={() => setTimeout(() => setCodeSuggestRowIdx(prev => (prev === idx ? null : prev)), 150)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') { setCodeSuggestRowIdx(null); return; }
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault();
                              setCodeSuggestRowIdx(null);
                              const next = productCodeRefs.current[idx + 1];
                              if (next) next.focus();
                            }
                          }}
                          className="excel-cell"
                          style={cellInputStyle}
                          autoComplete="off"
                        />
                        {p.change_reason && (
                          <span title={`Changed from ${p.previous_product_code || '—'}: ${p.change_reason}`}
                                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#2563eb', cursor: 'help' }}>ⓘ</span>
                        )}
                        {codeSuggestRowIdx === idx && (codeSuggestOptions.length > 0 || codeSuggestLoading) && (
                          <div style={{
                            position: 'absolute', top: '100%', left: '8px', right: '8px', zIndex: 30,
                            background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
                            boxShadow: '0 6px 16px rgba(0,0,0,0.15)', maxHeight: '220px', overflowY: 'auto',
                            marginTop: '2px', textAlign: 'left',
                          }}>
                            {codeSuggestLoading ? (
                              <div style={{ padding: '8px 10px', fontSize: '12px', color: '#9ca3af' }}>Searching…</div>
                            ) : (
                              codeSuggestOptions.map((opt, oi) => (
                                <div
                                  key={`${opt.product_code}-${oi}`}
                                  onMouseDown={e => { e.preventDefault(); handleProductCodeSelect(idx, opt); }}
                                  style={{
                                    padding: '6px 10px', cursor: 'pointer',
                                    borderBottom: oi < codeSuggestOptions.length - 1 ? '1px solid #f3f4f6' : 'none',
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f6ff')}
                                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                                >
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#6d28d9' }}>{opt.product_code}</div>
                                  <div style={{ fontSize: '11px', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {opt.title || opt.product_name}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ ...gridTdStyle, padding: '8px 10px', background: '#f9fafb', textAlign: 'center', color: '#374151' }}>
                    {p.relevancy_score != null ? `${Math.round(p.relevancy_score * 100)}%` : '—'}
                  </td>
                  <td style={{ ...gridTdStyle, textAlign: 'center', background: '#f9fafb' }}>
                    {!p.deleted && (
                      <button
                        onClick={() => handleRemove(idx)}
                        title="Remove row"
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px', fontWeight: 700 }}
                      >✕</button>
                    )}
                  </td>
                </tr>
              ))}
              {localProducts.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <style>{`
            .excel-cell:hover { background: #f8fafc; }
            .excel-cell:focus { outline: none; border-color: #2563eb !important; background: #eff6ff !important; }
          `}</style>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid #d1d5db',
          display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0,
        }}>
          <button onClick={onClose} disabled={saving} style={btnStyle('#6b7280', saving)}>✕ Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnStyle('#16a34a', saving)}>
            {saving ? '⏳ Saving…' : '💾 Save Changes'}
          </button>
        </div>
      </div>
    </div>

    {reasonPrompt && (
      <ReasonModal
        mode={reasonPrompt.mode}
        value={reasonText}
        onChange={setReasonText}
        onCancel={handleReasonCancel}
        onConfirm={handleReasonConfirm}
      />
    )}
    </>
  );
};

// Blocks a delete or product-code change until the user explains why — the
// reason is stored (see handleReasonConfirm) and sent to the backend so it
// can feed future AI product suggestions instead of being thrown away.
const ReasonModal = ({ mode, value, onChange, onCancel, onConfirm }) => {
  const isDelete = mode === 'delete';
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '8px', width: '420px', maxWidth: '90vw',
          boxShadow: '0 10px 40px rgba(0,0,0,0.35)', padding: '20px',
        }}
      >
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, color: '#111827' }}>
          {isDelete ? 'Why are you removing this product?' : 'Why are you changing this product?'}
        </h4>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6b7280' }}>
          {isDelete
            ? 'This helps the system avoid suggesting the same product again for similar tenders.'
            : 'This helps the system learn what you actually want suggested for similar tenders.'}
        </p>
        <textarea
          autoFocus
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. Wrong size / doesn't match spec / prefer this variant because..."
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 10px',
            border: '1px solid #d1d5db', borderRadius: '6px', font: 'inherit',
            resize: 'vertical', fontSize: '13px',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
          <button onClick={onCancel} style={btnStyle('#6b7280')}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!value.trim()}
            style={btnStyle('#dc2626', !value.trim())}
          >
            {isDelete ? 'Remove' : 'Confirm Change'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MasterProductListModal;

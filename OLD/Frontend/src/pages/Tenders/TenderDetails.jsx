import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import ProductSearchModal from '../../components/common/ProductSearchModal';
import ItemCategorySelectorModal from '../../components/common/ItemCategorySelectorModal';
import DeviationModal from './DeviationModal';
import PreBidModal from './PreBidModal';
import ShareDeviationModal from './ShareDeviationModal';
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
            <p style={{ color: '#666' }}>Analyzing Tender Document with AI...</p>
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
  onClose, bidNumber, onUpdate, itemCategoryString, onRefresh, isOpenTender, hasDocument, prewarmed,
}) => {
  const navigate = useNavigate();
  const SUGGESTIONS_PIPELINE_URL = import.meta.env.VITE_ENDO_PIPELINE_URL || 'https://suggestions.openprocure.ai';

  const [isEditing, setIsEditing] = useState(false);
  const [localProducts, setLocalProducts] = useState(products);
  const [showSearch, setShowSearch] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCategorySelector, setShowCategorySelector] = useState(false);
  const [selectedItemCategory, setSelectedItemCategory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recalculatingRowIndex, setRecalculatingRowIndex] = useState(null);
  const [changingProduct, setChangingProduct] = useState(null);   // { product, idx }
  const [pendingChange, setPendingChange] = useState(null);        // { oldProduct, newProduct }
  const [changeReason, setChangeReason] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);
  const [emptyProcessingStatus, setEmptyProcessingStatus] = useState('idle');
  const [chatMessages, setChatMessages]   = useState([]);
  const [chatTyping,   setChatTyping]     = useState(false);
  const [chatDone,     setChatDone]       = useState(false);
  const chatBottomRef = useRef(null);
  const productCodeRefs = useRef([]);

  // Open-tender upload state
  const [uploadFiles,  setUploadFiles]  = useState([]);
  const [uploadPhase,  setUploadPhase]  = useState('idle'); // idle | uploading | processing | done
  const [uploadJobId,  setUploadJobId]  = useState(null);
  const [uploadError,  setUploadError]  = useState(null);
  const [showManualUpload, setShowManualUpload] = useState(false);
  const uploadInputRef = useRef(null);
  const [checkingExisting, setCheckingExisting] = useState(isOpenTender && products.length === 0);
  const localProductsRef = useRef(products);
  useEffect(() => { localProductsRef.current = localProducts; }, [localProducts]);

  // Bulk change via Excel import (Download Template / Upload)
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const importInputRef = useRef(null);

  // Parse tender item categories for the "Add Product" flow
  const itemCategories = itemCategoryString && itemCategoryString !== 'N/A'
    ? itemCategoryString.split(/,(?![^()]*\))/).map(s => s.trim()).filter(Boolean)
    : [];

  const hasProcessedEmpty = React.useRef(false);

  // Sync when parent re-fetches
  useEffect(() => { setLocalProducts(products); }, [products]);

  // For open tenders (or any Endo tender) that open with no products: check
  // DB once before showing upload zone
  useEffect(() => {
    if (!isOpenTender || products.length > 0) return;
    (async () => {
      try { if (onRefresh) await onRefresh(); }
      finally { setCheckingExisting(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Open Tender (or any Endo tender): kick off analysis using the tender
  // documents already downloaded — no click needed
  const startGeneratingSuggestions = React.useCallback(async () => {
    setUploadError(null);
    setUploadPhase('uploading');
    try {
      const r = await fetch(
        `${SUGGESTIONS_PIPELINE_URL}/open-tender/upload`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tender_id: bidNumber }),
        }
      );
      const d = await r.json();
      if (d.jobId) {
        setUploadJobId(d.jobId);
        setUploadPhase('processing');
      } else {
        setUploadError(d.error || 'Failed to start analysis for this tender.');
        setUploadPhase('idle');
      }
    } catch (e) {
      setUploadError('Error: ' + e.message);
      setUploadPhase('idle');
    }
  }, [bidNumber, SUGGESTIONS_PIPELINE_URL]);

  // Auto-start: if a tender document is already available, skip the extra click entirely
  const autoStartedRef = React.useRef(false);
  useEffect(() => {
    if (!isOpenTender || checkingExisting || localProducts.length > 0) return;
    if (!hasDocument || showManualUpload || autoStartedRef.current) return;
    autoStartedRef.current = true;
    startGeneratingSuggestions();
  }, [isOpenTender, checkingExisting, localProducts.length, hasDocument, showManualUpload, startGeneratingSuggestions]);

  // Auto-process empty suggestions (GeM tenders only) — open live chat immediately
  useEffect(() => {
    if (isOpenTender) return; // open tenders use file upload instead
    if (localProducts.length === 0 && !hasProcessedEmpty.current) {
      hasProcessedEmpty.current = true;
      setEmptyProcessingStatus('processing');
      // If the parent already kicked this bid's pipeline off in the background
      // (as soon as the tender page loaded), don't fire a second /process call —
      // just let the SSE listener below pick up the already-running pipeline.
      if (prewarmed) return;
      try {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const uName  = storedUser.name  || 'there';
        const uEmail = storedUser.email || 'auto@example.com';
        const cleanBid = bidNumber.replace(/_/g, '/');

        fetch(`${import.meta.env.VITE_ENDO_PIPELINE_URL || 'https://suggestions.openprocure.ai'}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bid_number: cleanBid, user_name: uName, user_email: uEmail })
        }).catch(err => console.error('Error auto-processing empty tender:', err));
      } catch (err) {
        console.error('Failed to trigger auto-process:', err);
      }
    }
  }, [localProducts.length, bidNumber, prewarmed]);

  // Auto-scroll chat to bottom whenever messages/typing change
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatTyping]);

  // SSE chat — fires once when processing starts (GeM tenders only, non-Endo)
  useEffect(() => {
    if (isOpenTender) return;
    if (emptyProcessingStatus !== 'processing') return;

    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const uName = storedUser.name || 'there';
    const seenKeys = new Set();

    const addMsg = (text) => {
      const key = text.trim().toLowerCase().slice(0, 40);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      setChatMessages(prev => [...prev, { text, id: Date.now() + Math.random() }]);
    };

    let pendingMsg = null;
    let typingTimer = null;
    let isDone = false;

    const queueMsg = (text) => {
      setChatTyping(true);
      clearTimeout(typingTimer);
      pendingMsg = text;
      typingTimer = setTimeout(() => {
        if (pendingMsg) { addMsg(pendingMsg); pendingMsg = null; }
        setChatTyping(false);
      }, 650);
    };

    const handleDone = async () => {
      if (isDone) return;
      isDone = true;
      es.close();
      clearTimeout(typingTimer);
      if (pendingMsg) { addMsg(pendingMsg); pendingMsg = null; }
      setChatTyping(false);
      setChatDone(true);
      addMsg('All done! Loading your product suggestions now...');
      await new Promise(r => setTimeout(r, 1400));
      if (onRefresh) await onRefresh();
      setEmptyProcessingStatus('done');
    };

    const greeting = prewarmed
      ? `Hi ${uName}! I started matching this tender to our products as soon as you opened it — still working on it, here's where it's at...`
      : `Hi ${uName}! Let me find the best product match for you...`;
    const greetTimer = setTimeout(() => addMsg(greeting), 400);

    const cleanBid = bidNumber.replace(/_/g, '/');
    const PIPELINE_URL = import.meta.env.VITE_ENDO_PIPELINE_URL || 'https://suggestions.openprocure.ai';
    const es = new EventSource(`${PIPELINE_URL}/run/pipeline?bid=${encodeURIComponent(cleanBid)}`);

    es.onmessage = (event) => {
      const raw = (event.data || '').trim();
      if (!raw || raw.startsWith(': ')) return;
      if (raw === '__DONE__') { handleDone(); return; }
      const msg = rawToChat(raw);
      if (msg) queueMsg(msg);
    };

    es.addEventListener('step', (event) => {
      try {
        const { step } = JSON.parse(event.data);
        const map = {
          1: 'Checking if this tender matches our products...',
          2: 'Ok! Opened the bid document',
          3: 'Scanning all document links...',
          4: 'Finding the best product match...',
        };
        if (map[step]) queueMsg(map[step]);
      } catch (_) {}
    });

    es.addEventListener('done', handleDone);
    es.onerror = () => { if (!isDone) handleDone(); };

    return () => {
      clearTimeout(greetTimer);
      clearTimeout(typingTimer);
      es.close();
    };
  }, [emptyProcessingStatus]); // eslint-disable-line

  // Open-tender (or any Endo tender) SSE — fires when uploadPhase becomes 'processing'
  useEffect(() => {
    if (!isOpenTender || uploadPhase !== 'processing' || !uploadJobId) return;

    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const uName = storedUser.name || 'there';
    const seenKeys = new Set();
    const addMsg = (text) => {
      const key = text.trim().toLowerCase().slice(0, 40);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      setChatMessages(prev => [...prev, { text, id: Date.now() + Math.random() }]);
    };
    let pendingMsg = null;
    let typingTimer = null;
    let isDone = false;
    const queueMsg = (text) => {
      setChatTyping(true);
      clearTimeout(typingTimer);
      pendingMsg = text;
      typingTimer = setTimeout(() => {
        if (pendingMsg) { addMsg(pendingMsg); pendingMsg = null; }
        setChatTyping(false);
      }, 650);
    };

    const handleDone = async () => {
      if (isDone) return;
      isDone = true;
      es.close();
      clearTimeout(typingTimer);
      if (pendingMsg) { addMsg(pendingMsg); pendingMsg = null; }
      setChatTyping(false);
      setChatDone(true);
      addMsg('All done! Loading your product suggestions now...');
      let loaded = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 1400 : 3000));
        if (onRefresh) await onRefresh();
        await new Promise(r => setTimeout(r, 150)); // let React flush state update
        if (localProductsRef.current.length > 0) { loaded = true; break; }
      }
      if (!loaded) setEmptyProcessingStatus('done');
    };

    setTimeout(() => addMsg(`Hi ${uName}! Analyzing your uploaded documents...`), 400);

    const es = new EventSource(`${SUGGESTIONS_PIPELINE_URL}/open-tender/stream/${uploadJobId}`);
    es.onmessage = (event) => {
      const raw = (event.data || '').trim();
      if (!raw || raw.startsWith(': ')) return;
      if (raw === '__DONE__') { handleDone(); return; }
      const msg = rawToChat(raw);
      if (msg) queueMsg(msg);
    };
    es.onerror = () => { if (!isDone) handleDone(); };

    return () => { clearTimeout(typingTimer); es.close(); };
  }, [isOpenTender, uploadPhase, uploadJobId]); // eslint-disable-line

  // Derive currently selected product (local state takes priority)
  const currentSelected =
    localProducts.find(p => p.selected === true) || selectedProduct;

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleRemove = (idx) =>
    setLocalProducts(prev => prev.filter((_, i) => i !== idx));

  const handleCellChange = (idx, field, value) =>
    setLocalProducts(prev => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));

  // ── Product code autocomplete (Edit grid) ───────────────────────────────────
  const [codeSuggestRowIdx, setCodeSuggestRowIdx] = useState(null);
  const [codeSuggestOptions, setCodeSuggestOptions] = useState([]);
  const [codeSuggestLoading, setCodeSuggestLoading] = useState(false);
  const codeSuggestDebounceRef = useRef(null);

  const fetchProductCodeSuggestions = async (idx, term) => {
    if (!term || term.trim().length < 2) {
      setCodeSuggestOptions([]);
      return;
    }
    setCodeSuggestLoading(true);
    try {
      const token = localStorage.getItem('token');
      const API_BASE = import.meta.env.VITE_API_BASE_URL;
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
    codeSuggestDebounceRef.current = setTimeout(() => fetchProductCodeSuggestions(idx, value), 250);
  };

  const handleProductCodeSelect = (idx, product) => {
    setLocalProducts(prev => prev.map((p, i) => (i === idx ? {
      ...p,
      product_code: product.product_code,
      title: product.title || product.product_name || p.title,
    } : p)));
    setCodeSuggestRowIdx(null);
    setCodeSuggestOptions([]);
  };

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

  // Handles selection from ProductSearchModal — routes to add or change flow
  const handleProductSelected = (newProduct) => {
    if (changingProduct) {
      setPendingChange({ oldProduct: changingProduct.product, newProduct });
      setShowSearch(false);
    } else {
      handleProductAdded(newProduct);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setLocalProducts(products); // revert to last saved state
  };

  const handleRecheck = () => {
    if (isOpenTender) {
      setLocalProducts([]);
      setIsEditing(false);
      setChatDone(false);
      setUploadPhase('idle');
      setUploadJobId(null);
      setUploadError(null);
      autoStartedRef.current = false;
      startGeneratingSuggestions();
      return;
    }

    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      const uName  = storedUser.name  || 'there';
      const uEmail = storedUser.email || 'auto@example.com';
      const cleanBid = bidNumber.replace(/_/g, '/');

      setChatMessages([]);
      setChatDone(false);
      setChatTyping(false);
      setLocalProducts([]);
      setIsEditing(false);

      fetch(`${import.meta.env.VITE_ENDO_PIPELINE_URL || 'https://suggestions.openprocure.ai'}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bid_number: cleanBid, user_name: uName, user_email: uEmail }),
      }).catch(err => console.error('[recheck] process call failed:', err));

      setEmptyProcessingStatus('processing');
    } catch (err) {
      console.error('[recheck] failed:', err);
      alert('Error starting recheck. Please try again.');
    }
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
      const token = localStorage.getItem('token');
      const API_BASE = import.meta.env.VITE_API_BASE_URL;

      const res = await fetch(`${API_BASE}/tenders/recalculate-deviation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  const downloadChangeCSV = (row) => {
    const headers = ['Bid No', 'Item Key', 'Old Product Code', 'Old Product Name', 'New Product Code', 'New Product Name', 'Reason', 'Date'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const values = [escape(row.bid_no), escape(row.item_key), escape(row.old_code), escape(row.old_name), escape(row.new_code), escape(row.new_name), escape(row.reason), escape(row.date)];
    const csv = headers.join(',') + '\n' + values.join(',');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product_change_${String(row.bid_no).replace(/\//g, '_')}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcel = () => {
    if (!localProducts || localProducts.length === 0) return;
    const excelData = localProducts.map((p, idx) => ({
      'S.No': p.item_key ? p.item_key.replace(/^item_/i, '') : idx + 1,
      'Item Category': p.item_category || p.tender_item_name || '',
      'Tender Product': p.tender_item_name || '',
      'Product Name': p.title || '',
      'Product Code': p.product_code || '',
      'Relevancy Score': p.relevancy_score != null ? `${Math.round(Number(p.relevancy_score) * 100)}%` : '',
    }));
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Suggested_Products');
    const cleanBid = bidNumber.replace(/_/g, '/');
    XLSX.writeFile(wb, `Suggested_Products_${String(cleanBid).replace(/\//g, '_')}_${Date.now()}.xlsx`);
  };

  // ── Bulk product change via Excel (Download Template / Upload) ─────────────
  const handleDownloadTemplate = () => {
    if (!localProducts || localProducts.length === 0) return;
    const excelData = localProducts.map((p, idx) => ({
      'S.No': p.item_key ? p.item_key.replace(/^item_/i, '') : idx + 1,
      'Item Category': p.item_category || p.tender_item_name || '',
      'Tender Product': p.tender_item_name || '',
      'Product Name': p.title || '',
      'Product Code': p.product_code || '',
      'Relevancy Score': p.relevancy_score != null ? `${Math.round(Number(p.relevancy_score) * 100)}%` : '',
      'Actual Code': '',
      'Reason for Change': '',
    }));
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Product_Change_Template');
    const cleanBid = bidNumber.replace(/_/g, '/');
    XLSX.writeFile(wb, `Product_Change_Template_${String(cleanBid).replace(/\//g, '_')}_${Date.now()}.xlsx`);
  };

  const downloadChangeLogCSV = (rows) => {
    const headers = ['Bid No', 'Item Key', 'Old Product Code', 'Old Product Name', 'New Product Code', 'New Product Name', 'Reason', 'Date'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map(row =>
      [row.bid_no, row.item_key, row.old_code, row.old_name, row.new_code, row.new_name, row.reason, row.date]
        .map(escape).join(',')
    );
    const csv = headers.join(',') + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product_change_log_${String(bidNumber).replace(/\//g, '_')}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file) => {
    setImporting(true);
    setImportProgress('Reading file…');
    const token = localStorage.getItem('token');
    const API_BASE = import.meta.env.VITE_API_BASE_URL;
    const cleanBid = bidNumber.replace(/_/g, '/');

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const workingProducts = [...localProducts];
      const changeLog = [];
      const failures = [];
      let successCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const actualCode = String(row['Actual Code'] || '').trim();
        const reason = String(row['Reason for Change'] || '').trim();
        if (!actualCode) continue; // no change requested for this row

        const oldProduct = workingProducts[i];
        if (!oldProduct) {
          failures.push(`Row ${i + 2}: no matching product row.`);
          continue;
        }
        if (actualCode.toLowerCase() === (oldProduct.product_code || '').toLowerCase()) {
          continue; // same code — nothing to do
        }
        if (!reason) {
          failures.push(`Row ${i + 2} (${actualCode}): "Reason for Change" is required.`);
          continue;
        }

        setImportProgress(`Processing row ${i + 1} of ${rows.length}…`);

        try {
          const searchRes = await fetch(
            `${API_BASE}/tenders/products/search?q=${encodeURIComponent(actualCode)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const searchData = await searchRes.json();
          const newProduct = (searchData.data || []).find(
            p => (p.product_code || '').toLowerCase() === actualCode.toLowerCase()
          );
          if (!newProduct) {
            failures.push(`Row ${i + 2}: product code "${actualCode}" not found in catalogue.`);
            continue;
          }

          let itemKey = oldProduct.item_key || oldProduct.item;
          if (!itemKey || !itemKey.startsWith('item_')) {
            const catIndex = itemCategories.findIndex(cat => cat.trim() === oldProduct.item_category?.trim());
            itemKey = catIndex !== -1 ? `item_${catIndex + 1}` : `item_${i + 1}`;
          }

          const recalcRes = await fetch(`${API_BASE}/tenders/recalculate-deviation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ bid_no: cleanBid, item_key: itemKey, product_code: newProduct.product_code }),
          });
          const recalcData = await recalcRes.json();
          if (recalcData.status !== 'success') {
            failures.push(`Row ${i + 2}: recalculation failed — ${recalcData.message || 'unknown error'}.`);
            continue;
          }

          const updatedProduct = {
            ...oldProduct,
            title: newProduct.title || newProduct.product_name || oldProduct.title,
            product_code: newProduct.product_code,
            category: newProduct.category || oldProduct.category,
            category_label: newProduct.category_label || oldProduct.category_label,
            dept: newProduct.dept || newProduct.department || oldProduct.dept,
            selected_file: newProduct.selected_file || oldProduct.selected_file,
            isNew: false,
          };
          workingProducts[i] = updatedProduct;
          successCount++;
          changeLog.push({
            bid_no: cleanBid, item_key: itemKey,
            old_code: oldProduct.product_code || '', old_name: oldProduct.title || '',
            new_code: updatedProduct.product_code, new_name: updatedProduct.title,
            reason, date: new Date().toISOString(),
          });
        } catch (rowErr) {
          failures.push(`Row ${i + 2}: ${rowErr.message}`);
        }
      }

      if (successCount > 0) {
        setImportProgress('Saving changes…');
        await fetch(`${API_BASE}/tenders/${encodeURIComponent(cleanBid)}/suggestions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ products: workingProducts }),
        });
        downloadChangeLogCSV(changeLog);
        setLocalProducts(workingProducts);
        if (onUpdate) onUpdate(workingProducts);
      }

      const summary = [
        successCount > 0 ? `${successCount} product(s) changed successfully.` : null,
        failures.length > 0 ? `${failures.length} row(s) skipped:\n${failures.join('\n')}` : null,
      ].filter(Boolean).join('\n\n');
      alert(summary || 'No changes found in the uploaded file — fill in "Actual Code" and "Reason for Change" for the rows you want to change.');

      if (successCount > 0) window.location.reload();
    } catch (err) {
      console.error('Import failed:', err);
      alert('Error importing file: ' + err.message);
    } finally {
      setImporting(false);
      setImportProgress('');
      setShowImportOptions(false);
    }
  };

  const confirmProductChange = async () => {
    if (!changeReason.trim()) return;
    setChangeLoading(true);
    const { oldProduct, newProduct } = pendingChange;
    const idx = changingProduct.idx;

    try {
      let itemKey = oldProduct.item_key || oldProduct.item;
      if (!itemKey || !itemKey.startsWith('item_')) {
        const catIndex = itemCategories.findIndex(cat => cat.trim() === oldProduct.item_category?.trim());
        if (catIndex !== -1) itemKey = `item_${catIndex + 1}`;
      }

      const cleanBid = bidNumber.replace(/_/g, '/');
      const token = localStorage.getItem('token');
      const API_BASE = import.meta.env.VITE_API_BASE_URL;

      const res = await fetch(`${API_BASE}/tenders/recalculate-deviation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bid_no: cleanBid,
          item_key: itemKey,
          product_code: newProduct.product_code || newProduct.item_code || '',
        }),
      });
      const data = await res.json();

      if (data.status !== 'success') {
        alert(`Recalculation failed: ${data.message || 'Unknown error'}`);
        return;
      }

      const updatedProduct = {
        ...oldProduct,
        title: newProduct.title || newProduct.product_name || newProduct.instrument_name || oldProduct.title,
        product_code: newProduct.product_code || newProduct.item_code || oldProduct.product_code,
        category: newProduct.category || oldProduct.category,
        category_label: newProduct.category_label || oldProduct.category_label,
        dept: newProduct.dept || oldProduct.dept,
        selected_file: newProduct.selected_file || oldProduct.selected_file,
        relevancy_score: newProduct.relevancy_score ?? oldProduct.relevancy_score,
        raw_score: newProduct.raw_score ?? newProduct.relevancy_score ?? oldProduct.raw_score,
        isNew: false,
      };

      const updated = [...localProducts];
      updated[idx] = updatedProduct;

      await fetch(
        `${API_BASE}/tenders/${encodeURIComponent(cleanBid)}/suggestions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ products: updated }),
        }
      );

      downloadChangeCSV({
        bid_no: cleanBid,
        item_key: itemKey || '',
        old_code: oldProduct.product_code || '',
        old_name: oldProduct.title || '',
        new_code: updatedProduct.product_code,
        new_name: updatedProduct.title,
        reason: changeReason,
        date: new Date().toISOString(),
      });

      setPendingChange(null);
      setChangingProduct(null);
      setChangeReason('');
      if (onUpdate) onUpdate(updated);
      alert('Product changed successfully! Deviation recalculated.');
      window.location.reload();
    } catch (err) {
      console.error('Product change failed:', err);
      alert('Error changing product. Please try again.');
    } finally {
      setChangeLoading(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  const btnStyle = (bg, disabled = false) => ({
    padding: '7px 16px', background: disabled ? '#9ca3af' : bg,
    color: 'white', border: 'none', borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '13px', fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    transition: 'filter 0.15s',
  });

  const thStyle = {
    padding: '11px 14px', color: 'white', fontWeight: 600,
    fontSize: '12px', textAlign: 'left', letterSpacing: '0.03em',
    whiteSpace: 'nowrap', border: 'none',
  };

  const tdStyle = {
    padding: '12px 14px', verticalAlign: 'middle',
    borderBottom: '1px solid #e5e7eb',
  };

  const actionBtn = (bg, disabled = false) => ({
    padding: '5px 10px', background: disabled ? '#94a3b8' : bg,
    color: 'white', border: 'none', borderRadius: '5px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '11px', fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    whiteSpace: 'nowrap',
  });

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
          <div className="modal-header" style={{
            background: 'linear-gradient(135deg, #084f9a 0%, #1565c0 100%)',
            padding: '20px 24px',
            borderRadius: '12px 12px 0 0',
            flexShrink: 0,
          }}>
            <div>
              <h2 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.2px' }}>
                🎯 Suggested Products
              </h2>
              {detectedCategory && (
                <div style={{ fontSize: '12px', color: '#bfdbfe', marginTop: '5px' }}>
                  Category:&nbsp;<strong style={{ color: 'white' }}>{detectedCategory}</strong>
                </div>
              )}
            </div>
            <button
              className="modal-close"
              onClick={onClose}
              style={{ color: 'white', opacity: 0.75, fontSize: '22px', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
            >×</button>
          </div>

          {/* Toolbar — hidden while chat is active */}
          {localProducts.length > 0 && (
            <div style={{
              padding: '10px 20px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid #e5e7eb',
              background: '#f8fafc', flexShrink: 0,
            }}>
              <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
                {localProducts.length} product{localProducts.length !== 1 ? 's' : ''} found
                {isEditing && <span style={{ color: '#d97706', marginLeft: '8px' }}>● Editing</span>}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setIsEditing(true)} style={btnStyle('#084f9a')}>✏️ Edit</button>
                <button onClick={handleDownloadExcel} style={btnStyle('#28a745')}><Download size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />Download Excel</button>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowImportOptions(v => !v)} style={btnStyle('#0369a1')}>📥 Import</button>
                  {showImportOptions && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20,
                      background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: '8px',
                      display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '190px',
                    }}>
                      <button
                        onClick={() => { handleDownloadTemplate(); setShowImportOptions(false); }}
                        style={{ ...btnStyle('#0891b2'), width: '100%', justifyContent: 'flex-start' }}
                      >
                        ⬇ Download Template
                      </button>
                      <button
                        onClick={() => importInputRef.current?.click()}
                        disabled={importing}
                        style={{ ...btnStyle(importing ? '#9ca3af' : '#f59e0b', importing), width: '100%', justifyContent: 'flex-start' }}
                      >
                        {importing ? (importProgress || 'Processing…') : '⬆ Upload'}
                      </button>
                      <input
                        ref={importInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        style={{ display: 'none' }}
                        onChange={e => {
                          const file = e.target.files[0];
                          e.target.value = '';
                          if (file) handleImportFile(file);
                        }}
                      />
                    </div>
                  )}
                </div>
                <button onClick={() => setShowShareModal(true)} style={btnStyle('#0891b2')}>📧 Share</button>
                <button onClick={handleAddProductClick} style={btnStyle('#16a34a')}>+ Add Product</button>
                <button onClick={handleRecheck} style={btnStyle('#7c3aed')}>⟳ Recheck</button>
              </div>
            </div>
          )}

          {/* Body */}
          <div
            className="modal-body"
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              overflow: localProducts.length === 0 ? 'hidden' : 'auto',
              padding: localProducts.length === 0 ? 0 : undefined,
            }}
          >
            {checkingExisting ? (
              /* ── Checking DB for existing results (open tender mount check) ── */
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '12px', padding: '40px',
              }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  border: '3px solid #dbeafe', borderTopColor: '#084f9a',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Checking for results…</span>
              </div>
            ) : localProducts.length === 0 && emptyProcessingStatus === 'done' ? (
              /* ── Pipeline done but no products yet ── */
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '12px', padding: '40px 24px', textAlign: 'center',
              }}>
                <span style={{ fontSize: '32px' }}>✅</span>
                <p style={{ margin: 0, fontWeight: 600, color: '#1e3a5f', fontSize: '15px' }}>
                  No product suggestions found
                </p>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '13px', maxWidth: '320px' }}>
                  The analysis finished without a match — this can happen if the check was interrupted. Try running it again.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    onClick={async () => { if (onRefresh) await onRefresh(); }}
                    style={{
                      padding: '8px 20px',
                      background: '#fff', color: '#374151',
                      border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '13px', fontWeight: 600,
                    }}
                  >
                    Refresh
                  </button>
                  <button
                    onClick={handleRecheck}
                    style={{
                      padding: '8px 20px',
                      background: '#084f9a', color: '#fff',
                      border: 'none', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '13px', fontWeight: 600,
                    }}
                  >
                    ⟳ Retry Analysis
                  </button>
                </div>
              </div>
            ) : localProducts.length === 0 && isOpenTender && uploadPhase !== 'processing' ? (
              /* ── Open Tender / Endo tender: Generate suggestions (no document upload needed) ── */
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '16px', padding: '32px 24px',
              }}>
                {uploadPhase === 'uploading' ? (
                  <>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      border: '3px solid #dbeafe', borderTopColor: '#084f9a',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    <p style={{ margin: 0, color: '#1e3a5f', fontWeight: 600, fontSize: '14px' }}>
                      Starting analysis...
                    </p>
                  </>
                ) : hasDocument && !showManualUpload ? (
                  /* ── Document already downloaded: analysis starts automatically ── */
                  uploadError ? (
                    <>
                      <div style={{ fontSize: '36px' }}>⚠️</div>
                      <p style={{ margin: 0, fontWeight: 600, color: '#1e3a5f', fontSize: '15px' }}>
                        Couldn't start analysis automatically
                      </p>
                      <div style={{
                        width: '100%', maxWidth: '420px',
                        background: '#fef2f2', border: '1px solid #fca5a5',
                        borderRadius: '8px', padding: '10px 14px',
                        fontSize: '13px', color: '#991b1b', lineHeight: 1.5,
                      }}>
                        ⚠️ {uploadError}
                      </div>
                      <button
                        onClick={startGeneratingSuggestions}
                        style={{
                          padding: '10px 28px', background: '#084f9a',
                          color: '#fff', border: 'none', borderRadius: '7px',
                          cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                        }}
                      >
                        ⟳ Retry
                      </button>
                      <button
                        onClick={() => setShowManualUpload(true)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#2563eb', fontSize: '12px', fontWeight: 500, textDecoration: 'underline',
                        }}
                      >
                        Or upload your own Excel/CSV for local matching
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '50%',
                        border: '3px solid #dbeafe', borderTopColor: '#084f9a',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      <p style={{ margin: 0, fontWeight: 600, color: '#1e3a5f', fontSize: '14px' }}>
                        Preparing AI product suggestions...
                      </p>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '13px', maxWidth: '360px', textAlign: 'center' }}>
                        Using the tender documents already downloaded for this tender.
                      </p>
                    </>
                  )
                ) : (
                  <>
                    {hasDocument ? (
                      <button
                        onClick={() => { setShowManualUpload(false); setUploadError(null); }}
                        style={{
                          alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer',
                          color: '#6b7280', fontSize: '12px', marginBottom: '-8px',
                        }}
                      >
                        ← Back
                      </button>
                    ) : (
                      <>
                        <div style={{ fontSize: '36px' }}>📂</div>
                        <p style={{ margin: 0, fontWeight: 600, color: '#1e3a5f', fontSize: '15px' }}>
                          No tender document available
                        </p>
                        <p style={{ margin: 0, color: '#6b7280', fontSize: '13px', maxWidth: '360px', textAlign: 'center' }}>
                          Upload your own Excel/CSV to match products for this tender.
                        </p>
                      </>
                    )}
                    {/* Drop zone */}
                    <div
                      onClick={() => { setUploadError(null); uploadInputRef.current?.click(); }}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#084f9a'; }}
                      onDragLeave={e => { e.currentTarget.style.borderColor = '#93c5fd'; }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = '#93c5fd';
                        setUploadError(null);
                        setUploadFiles(prev => {
                          const existing = prev.map(f => f.name);
                          const added = Array.from(e.dataTransfer.files).filter(f => !existing.includes(f.name));
                          return [...prev, ...added];
                        });
                      }}
                      style={{
                        width: '100%', maxWidth: '420px',
                        border: '2px dashed #93c5fd', borderRadius: '10px',
                        padding: '28px 20px', textAlign: 'center',
                        cursor: 'pointer', background: '#f0f6ff',
                        transition: 'border-color 0.2s',
                      }}
                    >
                      <div style={{ fontSize: '36px', marginBottom: '8px' }}>📂</div>
                      <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#1e3a5f', fontSize: '14px' }}>
                        Drop file here or click to browse
                      </p>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '12px' }}>
                        XLS · XLSX · CSV
                      </p>
                    </div>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={e => {
                        setUploadError(null);
                        setUploadFiles(prev => {
                          const existing = prev.map(f => f.name);
                          const added = Array.from(e.target.files).filter(f => !existing.includes(f.name));
                          return [...prev, ...added];
                        });
                        e.target.value = '';
                      }}
                    />
                    {/* File list */}
                    {uploadFiles.length > 0 && (
                      <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {uploadFiles.map((f, i) => {
                          const ext = f.name.split('.').pop().toLowerCase();
                          return (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              background: '#eff6ff', border: '1px solid #bfdbfe',
                              borderRadius: '6px', padding: '6px 10px', fontSize: '12px',
                            }}>
                              <span>📊</span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1e3a5f' }}>{f.name}</span>
                              <span style={{ color: '#9ca3af', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                              <span style={{
                                fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px',
                                background: '#dbeafe', color: '#1e40af', flexShrink: 0,
                              }}>{ext.toUpperCase()}</span>
                              <button
                                onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}
                                title="Remove"
                              >✕</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Inline error */}
                    {uploadError && (
                      <div style={{
                        width: '100%', maxWidth: '420px',
                        background: '#fef2f2', border: '1px solid #fca5a5',
                        borderRadius: '8px', padding: '10px 14px',
                        fontSize: '13px', color: '#991b1b', lineHeight: 1.5,
                      }}>
                        ⚠️ {uploadError}
                      </div>
                    )}
                    <button
                      disabled={!uploadFiles.length}
                      onClick={async () => {
                        const spreadsheetFile = uploadFiles.find(f => /\.(xls|xlsx|csv)$/i.test(f.name));
                        if (!spreadsheetFile) {
                          setUploadError('Please select an Excel or CSV file.');
                          return;
                        }
                        setUploadError(null);
                        setUploadPhase('uploading');
                        try {
                          let items = [];
                          const ext = spreadsheetFile.name.split('.').pop().toLowerCase();

                          if (ext === 'csv') {
                            const text = await spreadsheetFile.text();
                            const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
                            items = parsed.data.map(row => {
                              const keys = Object.keys(row);
                              return {
                                item_name: row['Name of Item'] || row['Item Name'] || row['Description'] || row[keys[3]] || '',
                                hsn_code: row['HSN Code'] || row['HSN'] || '',
                                specification: row['Specification'] || row['Spec'] || '',
                                sl_no: row['Sl. No.'] || row['Sl No'] || row[keys[0]] || '',
                              };
                            });
                          } else {
                            const buf = await spreadsheetFile.arrayBuffer();
                            const wb = XLSX.read(buf, { type: 'array' });
                            const ws = wb.Sheets[wb.SheetNames[0]];
                            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                            // Locate header row (first row containing "name" or "item")
                            let headerIdx = 0;
                            for (let i = 0; i < Math.min(6, rows.length); i++) {
                              if (rows[i].some(c => /name|item|description/i.test(String(c)))) {
                                headerIdx = i; break;
                              }
                            }
                            const headers = rows[headerIdx].map(h => String(h).toLowerCase().trim());
                            const nameCol = headers.findIndex(h => h.includes('name') || h.includes('item') || h.includes('description'));
                            const hsnCol  = headers.findIndex(h => h.includes('hsn'));
                            const specCol = headers.findIndex(h => h.includes('spec'));
                            const slCol   = headers.findIndex(h => /^sl|^sr|serial/i.test(h));

                            items = rows.slice(headerIdx + 1)
                              .filter(row => row.some(c => c !== ''))
                              .map(row => ({
                                item_name:     nameCol >= 0 ? String(row[nameCol] || '').trim() : '',
                                hsn_code:      hsnCol  >= 0 ? String(row[hsnCol]  || '').trim() : '',
                                specification: specCol >= 0 ? String(row[specCol] || '').trim() : '',
                                sl_no:         slCol   >= 0 ? String(row[slCol]   || '').trim() : '',
                              }))
                              .filter(it => it.item_name);
                          }

                          if (items.length === 0) {
                            setUploadError('No item names found in the spreadsheet. Make sure the file has a "Name of Item" column with data rows.');
                            setUploadPhase('idle');
                            return;
                          }

                          const cleanBid = bidNumber.replace(/_/g, '/');
                          const token = localStorage.getItem('token');
                          const API_BASE = import.meta.env.VITE_API_BASE_URL;
                          const r = await fetch(
                            `${API_BASE}/tenders/${encodeURIComponent(cleanBid)}/suggestions/from-spreadsheet`,
                            {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ items }),
                            }
                          );
                          const d = await r.json();
                          if (d.ok) {
                            setUploadPhase('done');
                            if (onRefresh) await onRefresh();
                          } else {
                            setUploadError('Matching failed: ' + (d.error || 'Unknown error'));
                            setUploadPhase('idle');
                          }
                        } catch (e) {
                          setUploadError('Error processing spreadsheet: ' + e.message);
                          setUploadPhase('idle');
                        }
                      }}
                      style={{
                        padding: '10px 28px', background: uploadFiles.length ? '#084f9a' : '#9ca3af',
                        color: '#fff', border: 'none', borderRadius: '7px',
                        cursor: uploadFiles.length ? 'pointer' : 'not-allowed',
                        fontSize: '14px', fontWeight: 600,
                      }}
                    >
                      Process File
                    </button>
                  </>
                )}
              </div>
            ) : localProducts.length === 0 ? (
              /* ── AI processing loading screen ── */
              <div style={{
                display: 'flex', flexDirection: 'column', flex: 1,
                alignItems: 'center', justifyContent: 'center',
                padding: '48px 24px', gap: '18px', textAlign: 'center',
              }}>
                {chatDone ? (
                  <>
                    <div style={{ fontSize: '32px' }}>✓</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#16a34a' }}>
                      Analysis complete — loading results...
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      border: '3px solid #dbeafe', borderTopColor: '#084f9a',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e3a5f' }}>
                      {prewarmed
                        ? 'This tender\'s product match has been running in the background...'
                        : 'AI is analyzing this tender to find the best product match'}
                    </div>
                    {chatMessages.length > 0 && (
                      <div style={{ fontSize: '13px', color: '#6b7280', minHeight: '18px' }}>
                        {chatMessages[chatMessages.length - 1].text}
                      </div>
                    )}
                  </>
                )}
                <div ref={chatBottomRef} />

                <style>{`
                  @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg, #084f9a 0%, #1565c0 100%)' }}>
                      <th style={{ ...thStyle, textAlign: 'center', width: 50 }}>S.No</th>
                      <th style={thStyle}>Item Category</th>
                      <th style={thStyle}>Tender Product</th>
                      <th style={thStyle}>Product Name</th>
                      <th style={thStyle}>Product Code</th>
                      <th style={{ ...thStyle, textAlign: 'center', width: 180 }}>Relevancy Score</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localProducts.map((p, idx) => {
                      const score   = Number(p.relevancy_score ?? -1);
                      const pct     = score >= 0 ? Math.round(score * 100) : null;
                      const isZero  = score === 0;
                      const isHigh  = pct !== null && pct >= 80;
                      const isMid   = pct !== null && pct >= 50 && pct < 80;
                      const barColor    = isZero ? '#ef4444' : isHigh ? '#22c55e' : isMid ? '#f59e0b' : '#94a3b8';
                      const scoreColor  = isZero ? '#dc2626' : isHigh ? '#16a34a' : isMid ? '#d97706' : '#64748b';
                      const scoreBg     = isZero ? '#fee2e2' : isHigh ? '#dcfce7' : isMid ? '#fef9c3' : '#f1f5f9';
                      const rowBg       = isZero ? '#fff8f8' : idx % 2 === 0 ? '#ffffff' : '#f9fafb';

                      return (
                        <tr key={`${p.product_code}-${idx}`} style={{
                          background: rowBg,
                          borderLeft: `3px solid ${barColor}`,
                          transition: 'background 0.15s',
                        }}
                          onMouseOver={e => e.currentTarget.style.background = '#f0f6ff'}
                          onMouseOut={e => e.currentTarget.style.background = rowBg}
                        >
                          {/* S.No */}
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#374151' }}>
                            {p.item_key ? p.item_key.replace(/^item_/i, '') : idx + 1}
                          </td>

                          {/* Item Category */}
                          <td style={tdStyle}>
                            <span style={{
                              display: 'inline-block',
                              background: '#dbeafe', color: '#1d4ed8',
                              padding: '2px 8px', borderRadius: '4px',
                              fontSize: '11px', fontWeight: 700,
                              marginBottom: p.dept ? '4px' : 0,
                            }}>
                              {p.item_category || p.tender_item_name || '—'}
                            </span>
                            {p.dept && (
                              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>{p.dept}</div>
                            )}
                            {p.isNew && (
                              <span style={{
                                display: 'inline-block', marginTop: '4px',
                                background: '#fef9c3', color: '#854d0e',
                                padding: '1px 7px', borderRadius: '4px',
                                fontSize: '10px', fontWeight: 600,
                              }}>✨ New</span>
                            )}
                          </td>

                          {/* Tender Product */}
                          <td style={{ ...tdStyle, color: '#374151', maxWidth: 200 }}>
                            <span style={{ fontSize: '12px' }}>
                              {p.tender_item_name || '—'}
                            </span>
                          </td>

                          {/* Product Name */}
                          <td style={{ ...tdStyle, fontWeight: 600, color: '#1e293b' }}>
                            {p.title || '—'}
                          </td>

                          {/* Product Code */}
                          <td style={tdStyle}>
                            <code style={{
                              background: '#ede9fe', color: '#6d28d9',
                              padding: '3px 8px', borderRadius: '5px',
                              fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap',
                            }}>
                              {p.product_code || '—'}
                            </code>
                          </td>

                          {/* Relevancy Score */}
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', width: '100%' }}>
                                <div style={{
                                  flex: 1, height: '5px', background: '#e2e8f0',
                                  borderRadius: '3px', overflow: 'hidden',
                                }}>
                                  <div style={{
                                    width: `${pct ?? 0}%`, height: '100%',
                                    background: barColor, borderRadius: '3px',
                                  }} />
                                </div>
                                <span style={{
                                  fontSize: '12px', fontWeight: 800,
                                  color: scoreColor, background: scoreBg,
                                  padding: '2px 8px', borderRadius: '4px',
                                  minWidth: '40px', textAlign: 'center',
                                }}>
                                  {pct !== null ? `${pct}%` : '—'}
                                </span>
                              </div>
                              {isZero && (
                                <span style={{
                                  background: '#fff7ed', border: '1px solid #fed7aa',
                                  borderRadius: '4px', padding: '2px 7px',
                                  fontSize: '10px', fontWeight: 700, color: '#c2410c',
                                  whiteSpace: 'nowrap',
                                }}>
                                  ⚠️ Please Verify From Your End
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              <button
                                onClick={e => { e.stopPropagation(); navigate(`/Admin/tenderdetails/${encodeURIComponent(bidNumber)}/deviations`); }}
                                title="View Deviation"
                                style={actionBtn('#084f9a')}
                                onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                                onMouseOut={e => e.currentTarget.style.filter = 'none'}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                </svg>
                                Deviation
                              </button>

                              {(p.isNew || isZero || !p.relevancy_score) && (
                                <button
                                  onClick={e => { e.stopPropagation(); handleRecalculateRow(idx, p); }}
                                  disabled={recalculatingRowIndex === idx}
                                  title="Recalculate"
                                  style={actionBtn(recalculatingRowIndex === idx ? '#94a3b8' : '#10b981', recalculatingRowIndex === idx)}
                                  onMouseOver={e => { if (recalculatingRowIndex !== idx) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                                  onMouseOut={e => { e.currentTarget.style.filter = 'none'; }}
                                >
                                  {recalculatingRowIndex === idx
                                    ? <><span className="spinner" style={{ width: '11px', height: '11px', borderWidth: '2px', borderColor: '#fff', borderTopColor: 'transparent' }} /> …</>
                                    : '🔄 Recalc'}
                                </button>
                              )}

                              <button
                                onClick={e => { e.stopPropagation(); setChangingProduct({ product: p, idx }); setShowSearch(true); }}
                                title="Change Product"
                                style={actionBtn('#7c3aed')}
                                onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
                                onMouseOut={e => e.currentTarget.style.filter = 'none'}
                              >
                                ✏️ Change
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btnStyle('#1f2937')}>Close</button>
          </div>
        </div>
      </div>

      {/* Excel-like grid editor — opened via the Edit button */}
      {isEditing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300,
        }}>
          <div style={{
            background: '#fff', borderRadius: '8px', width: '95vw', maxWidth: '1100px',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #d1d5db',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#f3f4f6', borderRadius: '8px 8px 0 0', flexShrink: 0,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#111827' }}>📊 Edit Suggested Products</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>Edit the Product Code — press Enter or Tab to move to the next row</p>
              </div>
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
                    <tr key={`grid-row-${idx}`}>
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
                      </td>
                      <td style={{ ...gridTdStyle, position: 'relative' }}>
                        <input
                          ref={el => (productCodeRefs.current[idx] = el)}
                          value={p.product_code || ''}
                          onChange={e => handleProductCodeInput(idx, e.target.value)}
                          onFocus={() => { if (p.product_code) fetchProductCodeSuggestions(idx, p.product_code); setCodeSuggestRowIdx(idx); }}
                          onBlur={() => setTimeout(() => setCodeSuggestRowIdx(prev => (prev === idx ? null : prev)), 150)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') {
                              setCodeSuggestRowIdx(null);
                              return;
                            }
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
                      </td>
                      <td style={{ ...gridTdStyle, padding: '8px 10px', background: '#f9fafb', textAlign: 'center', color: '#374151' }}>
                        {p.relevancy_score != null ? `${Math.round(p.relevancy_score * 100)}%` : '—'}
                      </td>
                      <td style={{ ...gridTdStyle, textAlign: 'center', background: '#f9fafb' }}>
                        <button
                          onClick={() => handleRemove(idx)}
                          title="Remove row"
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px', fontWeight: 700 }}
                        >✕</button>
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
              <button onClick={handleCancelEdit} disabled={saving} style={btnStyle('#6b7280', saving)}>✕ Cancel</button>
              <button onClick={handleSave} disabled={saving} style={btnStyle('#16a34a', saving)}>
                {saving ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

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
          onClose={() => { setShowSearch(false); setChangingProduct(null); }}
          onSelect={handleProductSelected}
          itemCategory={selectedItemCategory}
          bidNumber={bidNumber}
        />
      )}
      {showShareModal && (
        <ShareDeviationModal
          tenderId={bidNumber}
          shareType="suggestions"
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Reason modal — shown after user picks a replacement product */}
      {pendingChange && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300,
        }}>
          <div style={{
            background: 'white', borderRadius: '10px', padding: '28px',
            width: '460px', maxWidth: '95%', boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#1a1a1a' }}>
              Why are you changing this product?
            </h3>
            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '14px', lineHeight: 1.6 }}>
              <div><span style={{ color: '#6b7280' }}>From:</span> <strong>{pendingChange.oldProduct.title || pendingChange.oldProduct.product_name || pendingChange.oldProduct.product_code}</strong></div>
              <div style={{ marginTop: '4px' }}><span style={{ color: '#6b7280' }}>To:</span> <strong>{pendingChange.newProduct.title || pendingChange.newProduct.product_name || pendingChange.newProduct.product_code}</strong></div>
            </div>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Enter reason for changing the product..."
              value={changeReason}
              onChange={e => setChangeReason(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', fontSize: '13px',
                border: '1px solid #d1d5db', borderRadius: '6px',
                resize: 'vertical', boxSizing: 'border-box',
              }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button
                onClick={() => { setPendingChange(null); setChangingProduct(null); setChangeReason(''); }}
                disabled={changeLoading}
                style={{
                  padding: '8px 18px', background: '#6b7280', color: 'white',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmProductChange}
                disabled={!changeReason.trim() || changeLoading}
                style={{
                  padding: '8px 18px',
                  background: !changeReason.trim() || changeLoading ? '#9ca3af' : '#7c3aed',
                  color: 'white', border: 'none', borderRadius: '6px',
                  cursor: !changeReason.trim() || changeLoading ? 'not-allowed' : 'pointer',
                  fontSize: '13px', fontWeight: 600,
                }}
              >
                {changeLoading ? 'Updating...' : 'Confirm Change'}
              </button>
            </div>
          </div>
        </div>
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
// PIPELINE CHAT: maps raw SSE log lines → friendly chat messages
// ─────────────────────────────────────────────────────────────────────────────

function rawToChat(line) {
  const t = line.trim();
  const l = t.toLowerCase();

  // Skip pipeline noise: separators, command echo, stderr indent, process-finished lines
  if (!t) return null;
  if (/^[─\-=*▶·\s]{4,}$/.test(t)) return null;
  if (t.startsWith('▶') || t.startsWith('  ')) return null;
  if (l.startsWith('process finished') || l.startsWith('failed to start')) return null;
  if (l.includes('python ') && l.includes('.py')) return null;
  if (l.includes('node ') && l.includes('.js')) return null;
  if (l.includes('attempt') && (l.includes('failed') || l.includes('timed out'))) return null;
  if (l.includes('[dry-run]') || l.includes('dry run')) return null;

  // Step signals
  if (l.includes('step 1') || l.includes('relevancy check'))
    return 'Checking if this tender matches our products...';
  if (l.includes('relevant') && !l.includes('not ') && !l.includes('irrel'))
    return 'This tender looks relevant to us!';
  if (l.includes('step 2') || l.includes('downloading') || l.includes('bid document'))
    return 'Ok! Opened the bid document';
  if (l.includes('step 3') || l.includes('extracting link'))
    return 'Scanning all linked documents...';

  // Link count
  const linkMatch = t.match(/(\d+)\s+(?:internal\s+)?link/i);
  if (linkMatch) return `Ohh! It has ${linkMatch[1]} internal links`;

  // Category detection
  if (l.includes('analyser'))                                      return 'This is an Analyser tender';
  if (l.includes('endo.json') || (l.includes('endo') && l.includes('categ'))) return 'This is an Endo / Surgical tender';
  if (l.includes('reagent'))                                       return 'This looks like a Reagents tender';
  if (l.includes('rapid') && l.includes('elisa'))                  return 'This is a Rapid & ELISA tender';
  if (l.includes('system_pack'))                                   return 'This is a System Packs tender';

  // Ollama / LLM calls — map to friendly reading messages
  if (l.includes('ollama') || l.includes('llm') || l.includes('attempt')) {
    // Suppress raw retry noise
    if (l.includes('failed') || l.includes('timed out') || l.includes('error')) return null;
    const attemptMatch = t.match(/attempt\s+(\d+)/i);
    if (attemptMatch) {
      const n = parseInt(attemptMatch[1], 10);
      if (n === 1) return 'Reading and understanding the document...';
      if (n === 2) return 'Taking a closer look at the document...';
      return 'Going through the document once more...';
    }
    if (l.includes('ollama')) return 'Reading and understanding the document...';
    if (l.includes('llm'))    return 'Analyzing document content...';
  }

  // Step 4 / matching
  if (l.includes('step 4') || l.includes('product match'))        return 'Finding the best product match...';

  const fileMatch = t.match(/(?:searching|in)\s+([\w]+\.json)/i);
  if (fileMatch) return `Looking in ${fileMatch[1].replace('.json', '')} catalog...`;

  const pdfCount = t.match(/(\d+)\s+(?:pdf|file|doc)/i);
  if (pdfCount) return `Scanning ${pdfCount[1]} document${+pdfCount[1] > 1 ? 's' : ''}...`;

  if (l.includes('product found') || l.includes('match found'))   return 'Found a matching product!';
  if (l.includes('deviation') || l.includes('specification'))     return 'Calculating specification deviations...';
  if (l.includes('saving') || l.includes('writing to db'))        return 'Saving your results...';
  if (l.includes('pipeline complete') || l.includes('all done') || l.includes('finished')) return 'All done!';

  // Short meaningful raw lines (strip log prefix first)
  const stripped = t.replace(/^\[.*?\]\s*/, '').trim();
  if (stripped.length >= 20 && stripped.length <= 90 &&
      !stripped.startsWith('{') && !stripped.startsWith('[') &&
      !/[=─]/.test(stripped) && !stripped.includes('http')) {
    return stripped;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSING CHAT MODAL
// ─────────────────────────────────────────────────────────────────────────────

const ProcessingChatModal = ({ bidNumber, userName, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [done, setDone] = useState(false);
  const bottomRef = useRef(null);
  const seenKeys = useRef(new Set());

  const addMsg = useCallback((text) => {
    const key = text.trim().toLowerCase().slice(0, 40);
    if (seenKeys.current.has(key)) return;
    seenKeys.current.add(key);
    setMessages(prev => [...prev, { text, id: Date.now() + Math.random() }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const greetTimer = setTimeout(() => {
      addMsg(`Hi ${userName || 'there'}! Let me find the best product match for you...`);
    }, 400);

    const cleanBid = bidNumber.replace(/_/g, '/');
    const PIPELINE_URL = import.meta.env.VITE_ENDO_PIPELINE_URL || 'https://suggestions.openprocure.ai';
    const es = new EventSource(`${PIPELINE_URL}/run/pipeline?bid=${encodeURIComponent(cleanBid)}`);

    let pendingMsg = null;
    let typingTimer = null;
    let isDone = false;

    const flushMsg = () => {
      if (pendingMsg) {
        const m = pendingMsg;
        pendingMsg = null;
        setIsTyping(false);
        addMsg(m);
      }
    };

    const queueMsg = (chatMsg) => {
      setIsTyping(true);
      clearTimeout(typingTimer);
      pendingMsg = chatMsg;
      typingTimer = setTimeout(flushMsg, 650);
    };

    // Regular data lines — parse through rawToChat
    es.onmessage = (event) => {
      const raw = (event.data || '').trim();
      if (!raw || raw.startsWith(': ')) return;
      // Legacy __DONE__ signal (backward compat with older server builds)
      if (raw === '__DONE__') { handleDone(); return; }
      const chatMsg = rawToChat(raw);
      if (chatMsg) queueMsg(chatMsg);
    };

    // Named 'step' event — guaranteed one message per pipeline step
    es.addEventListener('step', (event) => {
      try {
        const { step, label } = JSON.parse(event.data);
        const stepMsgs = {
          1: 'Checking if this tender matches our products...',
          2: 'Ok! Opened the bid document',
          3: 'Scanning all document links...',
          4: 'Finding the best product match...',
        };
        const msg = stepMsgs[step] || `Running: ${label}`;
        queueMsg(msg);
      } catch (_) {}
    });

    // Named 'done' event — clean completion signal from updated server
    const handleDone = () => {
      if (isDone) return;
      isDone = true;
      es.close();
      clearTimeout(typingTimer);
      flushMsg();
      setIsTyping(false);
      setDone(true);
      setTimeout(() => addMsg('All done! Refresh the page to see your product suggestions.'), 600);
    };

    es.addEventListener('done', handleDone);
    // Fallback: server closed connection or network error
    es.onerror = () => { if (!isDone) handleDone(); };

    return () => {
      clearTimeout(greetTimer);
      clearTimeout(typingTimer);
      es.close();
    };
  }, []); // eslint-disable-line

  const BotAvatar = () => (
    <div style={{
      width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
      background: '#084f9a', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '10px', fontWeight: 700,
    }}>AI</div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200,
    }}>
      <div style={{
        width: '420px', maxWidth: '95vw', height: '520px',
        background: '#fff', borderRadius: '18px',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #084f9a, #1a6bc4)',
          color: '#fff', padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
            }}>🤖</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>Tender AI</div>
              <div style={{ fontSize: '11px', opacity: 0.85, display: 'flex', alignItems: 'center', gap: '5px' }}>
                {done ? 'Analysis complete' : (
                  <>
                    <span style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      background: '#4ade80', display: 'inline-block',
                      animation: 'chatPulse 1.5s ease infinite',
                    }} />
                    Processing bid...
                  </>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#fff',
            cursor: 'pointer', fontSize: '22px', lineHeight: 1, opacity: 0.8,
          }}>×</button>
        </div>

        {/* Messages area */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px',
          background: '#eef2f7',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          {messages.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'flex-end', gap: '8px',
              animation: 'chatIn 0.3s ease',
            }}>
              <BotAvatar />
              <div style={{
                background: '#fff', color: '#1f2937',
                padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
                maxWidth: '80%', fontSize: '14px', lineHeight: '1.5',
                boxShadow: '0 1px 4px rgba(0,0,0,0.09)',
              }}>
                {m.text}
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              <BotAvatar />
              <div style={{
                background: '#fff', padding: '12px 16px',
                borderRadius: '16px 16px 16px 4px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.09)',
              }}>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      background: '#9ca3af', display: 'inline-block',
                      animation: `chatDot 1.2s ease ${i * 0.15}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #e5e7eb',
          background: '#fff', textAlign: done ? 'center' : 'left',
        }}>
          {done ? (
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '9px 28px', background: '#084f9a', color: '#fff',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontWeight: 600, fontSize: '13px',
              }}
            >
              Refresh to See Results
            </button>
          ) : (
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              AI is analyzing your tender documents...
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes chatIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes chatDot {
          0%, 60%, 100% { transform: translateY(0); }
          30%            { transform: translateY(-6px); }
        }
        @keyframes chatPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT VIEWER MODAL
// ─────────────────────────────────────────────────────────────────────────────

const DocumentViewerModal = ({ title, url, onClose }) => {
  const [blobUrl, setBlobUrl] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState(null);

  React.useEffect(() => {
    let objectUrl = null;
    const load = async () => {
      try {
        // GeM/BHEL servers don't send CORS headers (and some redirect during
        // preflight, which browsers reject outright), so route through the
        // backend proxy which fetches server-side and streams the result back.
        const fetchUrl = /gem\.gov\.in|bhel\.in/i.test(url)
          ? `${import.meta.env.VITE_API_BASE_URL}/tenders/proxy-document?url=${encodeURIComponent(url)}`
          : url;

        const token = localStorage.getItem('token');
        const res = await fetch(fetchUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Failed to load (HTTP ${res.status})`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (e) {
        setFetchError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '92vw', width: '1100px', height: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 style={{ fontSize: '15px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#f3f4f6' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', border: '4px solid #e5e7eb', borderTopColor: '#084f9a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: '14px', color: '#666' }}>Loading document…</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {fetchError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '20px', textAlign: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc3545" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p style={{ color: '#dc3545', fontWeight: 600, margin: 0 }}>Unable to preview this document</p>
              <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>{fetchError}</p>
              <a href={url} target="_blank" rel="noopener noreferrer"
                style={{ padding: '8px 18px', background: '#084f9a', color: 'white', borderRadius: '6px', textDecoration: 'none', fontWeight: 600, fontSize: '13px' }}>
                Open in New Tab
              </a>
            </div>
          )}
          {blobUrl && (
            <iframe
              src={blobUrl}
              width="100%"
              height="100%"
              style={{ border: 'none', display: 'block' }}
              title={title}
            />
          )}
        </div>

        <div className="modal-footer" style={{ flexShrink: 0, display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ padding: '8px 18px', background: '#084f9a', color: 'white', borderRadius: '6px', textDecoration: 'none', fontWeight: 600, fontSize: '13px' }}>
            Open in New Tab
          </a>
          <button onClick={onClose} className="btn-cancel" style={{ padding: '8px 18px' }}>Close</button>
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
  const [viewerDoc, setViewerDoc] = useState(null); // { url, title }

  // States to hold sub-components
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // ── data state ────────────────────────────────────────────────────────────
  const [details, setDetails] = useState(null);
  const [links, setLinks] = useState([]);
  const [consigneeData, setConsigneeData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [docProcessing, setDocProcessing] = useState(false);
  const [docProcessingAttempts, setDocProcessingAttempts] = useState(0);
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
  const [showTenderShareModal, setShowTenderShareModal] = useState(false);

  // Pre-Bid Meeting local state
  // This was already declared above, removing duplicate
  // const [preBidAttendance, setPreBidAttendance] = useState(null);
  // const [showPreBidModal, setShowPreBidModal] = useState(false);

  // Pre-Bid Remarks Modal
  const [showPreBidRemarksModal, setShowPreBidRemarksModal] = useState(false);
  const [preBidRemarksData, setPreBidRemarksData] = useState(null);
  const [fetchingPreBidRemarks, setFetchingPreBidRemarks] = useState(false);

  const [isOpenTender, setIsOpenTender] = useState(false);
  const [openTenderMeta, setOpenTenderMeta] = useState({ refNo: null, organisationChain: null, startDate: null, siteLink: null });

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
  const [aiModalTitle, setAiModalTitle] = useState('ATC EMD Analysis');


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

  // ── PRE-WARM SUGGESTIONS IN THE BACKGROUND (GeM tenders) ────────────────────
  // Kick off the AI product-matching pipeline as soon as the tender page loads
  // instead of waiting for the user to click "View Suggested Products" — by the
  // time they click, results are already there (or already in progress, so the
  // modal's own SSE just picks up where this left off instead of restarting).
  const [suggestionsPrewarmed, setSuggestionsPrewarmed] = useState(false);
  const suggestionsPrewarmRef = useRef(false);

  useEffect(() => {
    // Wait for tender data to finish loading — isOpenTender is only accurate
    // once `details` is set, and starts false by default before that happens.
    if (!details || !tenderId || isOpenTender) return; // open tenders keep the upload-driven flow, unchanged
    if (suggestionsPrewarmRef.current) return;
    suggestionsPrewarmRef.current = true;

    (async () => {
      try {
        const token = localStorage.getItem('token');
        const cleanBid = tenderId.replace(/_/g, '/');
        const res = await fetch(
          `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBid)}/suggestions`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) return; // already generated

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        await fetch(`${import.meta.env.VITE_ENDO_PIPELINE_URL || 'https://suggestions.openprocure.ai'}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bid_number: cleanBid,
            user_name: storedUser.name || 'there',
            user_email: storedUser.email || 'auto@example.com',
          }),
        });
        setSuggestionsPrewarmed(true);
      } catch (err) {
        console.error('Background suggestion pre-warm failed:', err);
      }
    })();
  }, [details, tenderId, isOpenTender, API_BASE_URL]);

  // ── FETCH TENDER DATA ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenderId) return;

    const MAX_PROCESSING_ATTEMPTS = 20; // ~2 minutes at 6s intervals

    const fetchTenderData = async () => {
      try {
        setLoading(docProcessingAttempts === 0);
        setError(null);
        let json = null;
        let dbData = null;
        let hasDetailUrl = false;

        // 1. Try DB first
        try {
          const token = localStorage.getItem('token');
          const dbRes = await fetch(
            `${API_BASE_URL}/tenders/${encodeURIComponent(tenderId.replace(/_/g, '/'))}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (dbRes.ok) {
            dbData = await dbRes.json();
            hasDetailUrl = !!dbData.data?.detail_url;

            // Kick off background processing (only on the first pass) if json_data is missing
            if (docProcessingAttempts === 0 && dbData.success && dbData.data?.detail_url && !dbData.data.json_data) {
              fetch('https://pdf.openprocure.ai/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bid_no: tenderId.replace(/_/g, '/'),
                  pdf_url: dbData.data.detail_url,
                }),
              }).catch(e => console.warn('Background processing kick-off failed:', e));
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
          if (!res.ok) {
            // Document exists but hasn't been parsed into JSON yet — this is a
            // normal "still processing" state, not a real error. Poll instead
            // of showing a dead-end error screen.
            if (res.status === 404 && hasDetailUrl && docProcessingAttempts < MAX_PROCESSING_ATTEMPTS) {
              setDocProcessing(true);
              setLoading(false);
              setTimeout(() => setDocProcessingAttempts(a => a + 1), 6000);
              return;
            }
            throw new Error(res.status !== 404
              ? `Server error (HTTP ${res.status})`
              : hasDetailUrl
                ? `This tender's document is taking longer than usual to process. Please try again in a few minutes. Bid Number: ${tenderId.replace(/_/g, '/')}`
                : `Tender not found. Bid Number: ${tenderId.replace(/_/g, '/')}`
            );
          }
          json = await res.json();
        }

        setDocProcessing(false);

        // ── Extract fields ────────────────────────────────────────────────

        // OPEN TENDER FAST-PATH
        setIsOpenTender(!!dbData?.open_source);
        if (dbData?.open_source) {
          const o = dbData.data;
          setOpenTenderMeta({
            refNo: o.ref_no || null,
            organisationChain: o.organisation_chain || null,
            startDate: o.start_date || null,
            siteLink: o.tender_site_link || o.tender_page_link || null,
          });
          // NOTE: tender_details from open-tender scrapers (NIC GePNIC state portals)
          // is a FLAT key/value object — there is no basic_details/work_item_details/
          // emd_fee_details nesting. Read keys straight off it.
          const openDetails = o.tender_details || {};
          const val = (key) => {
            const v = openDetails[key];
            return (v === undefined || v === null || v === '' || v === 'NA') ? null : v;
          };
          // Some open-tender sources (e.g. nProcure/Gujarat) already include
          // their own unit in the value (e.g. "24 Months"), unlike NIC/GePNIC
          // portals which give a bare number of days. Only append " Days" when
          // the value doesn't already end in a duration word, so it doesn't
          // render as "24 Months Days".
          const withDaysSuffix = (v) => {
            if (!v) return null;
            return /\b(day|days|month|months|week|weeks|year|years)\s*$/i.test(String(v).trim())
              ? String(v).trim()
              : `${v} Days`;
          };

          setDetails({
            bidEndDate: o.end_date || 'N/A',
            bidOpeningDate: val('Bid Opening Date') || o.opening_date || 'N/A',
            bidOfferValidity: withDaysSuffix(val('Bid Validity(Days)')) || 'N/A',
            estimatedBidValue: val('Tender Value in ₹') ? val('Tender Value in ₹').replace(/,/g, '') : 'N/A',
            organisationName: val('Organisation Name') || o.department || 'N/A',
            officeName: val('Location') || o.state || 'N/A',
            departmentOrg: val('Organisation Chain') || o.department || 'N/A',
            totalQty: 'N/A', // Not published discretely on open-tender portals
            itemCategory: val('Tender Category') || val('Product Category') || o.items || 'N/A',
            itemCategoryCount: 1,
            documentRequired: 'N/A',
            evaluationMethod: val('Form Of Contract') || 'N/A',
            emdAmount: val('EMD Amount in ₹') ? `₹ ${val('EMD Amount in ₹')}` : (val('EMD') || '0'),
            emdRequired: val('EMD Amount in ₹') || val('EMD') ? 'Yes' : 'No',
            advisoryBank: 'N/A',
            epbgPercentage: 'N/A',
            epbgDuration: 'N/A',
            bidToRA: 'N/A',
            preBidDate: val('Pre Bid Meeting Date') || 'N/A',
            preBidTime: 'N/A',
            preBidVenue: val('Pre Bid Meeting Place') || 'N/A',
            sampleRequired: 'No',
            schedules: [],

            // Extra fields that exist for open tenders but weren't surfaced before
            tenderFee: val('Tender Fee in ₹') ? `₹ ${val('Tender Fee in ₹')}` : (val('Tender Fee') || 'N/A'),
            processingFee: val('Processing Fee in ₹') ? `₹ ${val('Processing Fee in ₹')}` : 'N/A',
            paymentMode: val('Payment Mode') || 'N/A',
            contractType: val('Contract Type') || 'N/A',
            withdrawalAllowed: val('Withdrawal Allowed') || 'N/A',
            periodOfWork: withDaysSuffix(val('Period Of Work(Days)')) || 'N/A',
            emdPayableTo: [val('EMD Payable To'), val('EMD Payable At')].filter(Boolean).join(', ') || 'N/A',
            bidSubmissionStart: val('Bid Submission Start Date') || 'N/A',
            bidSubmissionEnd: val('Bid Submission End Date') || 'N/A',
            ndaPreQualification: val('NDA/Pre Qualification') || 'N/A',
            tenderType: val('Tender Type') || 'N/A',
            noOfCovers: val('No. of Covers') || 'N/A',
            emdFeeType: val('EMD Fee Type') || 'N/A',
            workDescription: val('Work Description') || val('Title') || 'N/A',
          });
          setConsigneeData(null);

          // Build document links from downloaded_documents (local files scraped to disk)
          const downloadedDocs = o.downloaded_documents || [];
          const downloadedLinks = [];
          if (Array.isArray(downloadedDocs)) {
            for (const d of downloadedDocs) {
              const typeLabel = d.type === 'nit' ? 'NIT Document'
                : d.type === 'work_item_zip' ? 'Work Item Documents'
                : d.type === 'corrigendum' ? 'Corrigendum'
                : d.type || 'Document';
              if (d.local_path) {
                downloadedLinks.push({
                  uri: `${API_BASE_URL}/tenders/download?path=${encodeURIComponent(d.local_path)}`,
                  text: d.file_name || d.local_path.split(/[\\/]/).pop(),
                  label: typeLabel,
                });
              } else if (Array.isArray(d.extracted_files)) {
                for (const fp of d.extracted_files) {
                  downloadedLinks.push({
                    uri: `${API_BASE_URL}/tenders/download?path=${encodeURIComponent(fp)}`,
                    text: fp.split(/[\\/]/).pop(),
                    label: typeLabel,
                  });
                }
              }
            }
          }

          // Fall back to file_link entries if no downloaded_documents
          const rawFiles = o.file_link || [];
          const fileLinkLinks = Array.isArray(rawFiles) ? rawFiles.map(f => ({
            uri: f.file_path ? `${API_BASE_URL}/tenders/download?path=${encodeURIComponent(f.file_path)}` : '#',
            text: f.file_name || f.description || 'Document',
            label: f.category || f.doc_type || f.description || 'Document',
          })) : [];

          setLinks(downloadedLinks.length > 0 ? downloadedLinks : fileLinkLinks);

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
        setDocProcessing(false);
        setError(err.message || 'Failed to load tender data');
        setLoading(false);
      }
    };

    fetchTenderData();
  }, [tenderId, API_BASE_URL, JSON_SERVER_URL, docProcessingAttempts]);

  // Reset the polling counter whenever we navigate to a different tender
  useEffect(() => {
    setDocProcessingAttempts(0);
    setDocProcessing(false);
  }, [tenderId]);

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
        const PRICING_API = import.meta.env.VITE_PRICING_API || 'http://localhost:5000/api/pricing/predict';
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
    try {
      setLoadingTechSpecs(true);
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/tenders/${encodeURIComponent(tenderId.replace(/_/g, '/'))}/tech-specs`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      if (json.success) setTechSpecs(json.data || []);
    } catch (err) {
      console.error('fetchTechSpecs:', err);
    } finally {
      setLoadingTechSpecs(false);
    }
  }, [API_BASE_URL, tenderId, techSpecs.length]);

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

  // ── Shared: locate the tender's primary document and extract its text ─────
  const fetchTenderDocumentText = async () => {
    // FIX: tenderDocumentLinks defined here via local var since we need it in this scope
    const docLinks = links.filter(
      l => !l.uri.includes('/showCatalogue/') &&
        !(l.uri.includes('/catalog_data/') && l.uri.toLowerCase().endsWith('.pdf'))
    );

    let targetLink =
      links.find(l => l.uri && (l.uri.toLowerCase().includes('atc') || l.label === 'ATC')) ||
      links.find(l => l.uri && (l.label === 'Bid Document' || l.text === 'Bid Document')) ||
      docLinks.find(l => l.uri && l.uri.toLowerCase().endsWith('.pdf'));

    if (!targetLink) throw new Error('No tender document found to analyze.');

    let fetchUrl = targetLink.uri;
    if (fetchUrl.includes('mkp.gem.gov.in')) fetchUrl = fetchUrl.replace(/https?:\/\/[^/]+/, '/gem-proxy');
    else if (fetchUrl.includes('fulfilment.gem.gov.in')) fetchUrl = fetchUrl.replace(/https?:\/\/[^/]+/, '/gem-cpa-proxy');
    else if (fetchUrl.includes('gem.gov.in')) fetchUrl = fetchUrl.replace(/https?:\/\/[^/]+/, '/gem-proxy');

    const fileRes = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!fileRes.ok) throw new Error('Failed to download document from: ' + targetLink.uri);

    const blob = await fileRes.blob();
    const file = new File([blob], 'document.pdf', { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', file);

    const parseRes = await fetch(`${API_BASE_URL}/utils/parse-pdf`, { method: 'POST', body: formData });
    if (!parseRes.ok) throw new Error('Failed to extract text from PDF.');
    const { text: pdfText } = await parseRes.json();

    if (!pdfText || pdfText.length < 50) throw new Error('Document text is empty or unreadable.');
    return pdfText;
  };

  // ── AI ATC CHECK ──────────────────────────────────────────────────────────
  const handleCheckATC = async () => {
    setAiModalTitle('ATC EMD Analysis');
    setShowAIModal(true);
    setAiLoading(true);
    setAiResult('');

    try {
      const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
      if (!OPENAI_API_KEY) throw new Error('OpenAI API Key is missing in frontend .env');

      const pdfText = await fetchTenderDocumentText();

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

  // ── AI PRE-BID CHECK (from Tender Doc, via Ollama) ─────────────────────────
  const handleCheckPreBidFromDoc = async () => {
    setAiModalTitle('Pre-Bid Meeting Check');
    setShowAIModal(true);
    setAiLoading(true);
    setAiResult('');

    try {
      const pdfText = await fetchTenderDocumentText();

      const res = await fetch(`${API_BASE_URL}/utils/check-prebid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pdfText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze document.');

      if (data.mentioned) {
        setDetails(prev => ({
          ...prev,
          preBidDate: data.date || prev.preBidDate,
          preBidTime: data.time || prev.preBidTime,
          preBidVenue: data.venue || prev.preBidVenue,
        }));
        setAiResult(`Pre-Bid Meeting found in the tender document:\n\nDate: ${data.date}\nTime: ${data.time}\nVenue: ${data.venue}`);
      } else {
        setAiResult('No Pre-Bid Meeting is mentioned in the tender document.');
      }
    } catch (err) {
      console.error('handleCheckPreBidFromDoc:', err);
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

  if (docProcessing) return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <div className="spinner" />
      <h3 style={{ marginTop: '20px' }}>The tender document is being processed…</h3>
      <p style={{ color: '#666' }}>This page will update automatically once it's ready.</p>
      <button onClick={() => window.location.reload()} style={{
        padding: '8px 16px', backgroundColor: '#007bff', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px',
      }}>
        Check Now
      </button>
    </div>
  );

  if (error) return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h3>{error}</h3>
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
                        <label>{isOpenTender ? 'Tender ID' : 'Bid No'}</label>
                        <p>{tenderId}</p>
                      </div>
                      {isOpenTender ? (
                        <div className="detail-item-left">
                          <label>Ref No</label>
                          <p>{openTenderMeta.refNo || 'N/A'}</p>
                        </div>
                      ) : (
                        <div className="detail-item-left">
                          <label>RA No</label>
                          <p>{raNumber || 'N/A'}</p>
                        </div>
                      )}
                      {isOpenTender ? (
                        <div className="detail-item-left">
                          <label>Published Date</label>
                          <p>{openTenderMeta.startDate || 'N/A'}</p>
                        </div>
                      ) : (
                        <div className="detail-item-left">
                          <label>Bid to RA</label>
                          <p>{details.bidToRA}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Organisation Chain — Open tenders only */}
                  {isOpenTender && openTenderMeta.organisationChain && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div className="detail-item-left">
                        <label>Organisation Chain</label>
                        <p style={{ lineHeight: 1.5 }}>{openTenderMeta.organisationChain}</p>
                      </div>
                    </div>
                  )}

                  {/* Tender Site Link — Open tenders only */}
                  {isOpenTender && openTenderMeta.siteLink && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div className="detail-item-left">
                        <label>Tender Site Link</label>
                        <p>
                          <a
                            href={openTenderMeta.siteLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.preventDefault();
                              let openUrl = openTenderMeta.siteLink;
                              try {
                                const parsed = new URL(openTenderMeta.siteLink);
                                openUrl = `${parsed.origin}${parsed.pathname}`;
                              } catch {
                                // fall back to the raw link if it doesn't parse
                              }
                              navigator.clipboard.writeText(tenderId).finally(() => {
                                window.open(openUrl, '_blank', 'noopener,noreferrer');
                              });
                            }}
                            style={{ color: '#084f9a', wordBreak: 'break-all' }}
                          >
                            {(() => {
                              try {
                                return new URL(openTenderMeta.siteLink).origin;
                              } catch {
                                return openTenderMeta.siteLink;
                              }
                            })()}
                          </a>
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="detail-item-left"><label>Bid End Date</label><p>{details.bidEndDate}</p></div>
                  <div className="detail-item-left"><label>Bid Opening Date</label><p>{details.bidOpeningDate}</p></div>
                  <div className="detail-item-left"><label>Bid Offer Validity</label><p>{details.bidOfferValidity}</p></div>
                  {isOpenTender ? (
                    <div className="detail-item-left"><label>Tender Fee</label><p>{details.tenderFee}</p></div>
                  ) : (
                    <div className="detail-item-left"><label>Total Quantity</label><p>{details.totalQty}</p></div>
                  )}

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

                  {/* Open-tender only fields, sourced from the scraped tender_details */}
                  {isOpenTender && (
                    <>
                      <div className="detail-item-left" style={{ gridColumn: '1 / -1' }}><label>Work Description</label><p>{details.workDescription}</p></div>
                      <div className="detail-item-left"><label>Processing Fee</label><p>{details.processingFee}</p></div>
                      <div className="detail-item-left"><label>Payment Mode</label><p>{details.paymentMode}</p></div>
                      <div className="detail-item-left"><label>Contract Type</label><p>{details.contractType}</p></div>
                      <div className="detail-item-left"><label>Withdrawal Allowed</label><p>{details.withdrawalAllowed}</p></div>
                      <div className="detail-item-left"><label>Period of Work</label><p>{details.periodOfWork}</p></div>
                      <div className="detail-item-left"><label>EMD Payable To</label><p>{details.emdPayableTo}</p></div>
                      <div className="detail-item-left"><label>Bid Submission Start</label><p>{details.bidSubmissionStart}</p></div>
                      <div className="detail-item-left"><label>Bid Submission End</label><p>{details.bidSubmissionEnd}</p></div>
                      <div className="detail-item-left" style={{ gridColumn: '1 / -1' }}><label>NDA / Pre-Qualification</label><p>{details.ndaPreQualification}</p></div>
                    </>
                  )}
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
                  {isOpenTender ? (
                    <>
                      <div className="detail-item-left"><label>Tender Type</label><p>{details.tenderType}</p></div>
                      <div className="detail-item-left"><label>No. of Covers</label><p>{details.noOfCovers}</p></div>
                      <div className="detail-item-left"><label>EMD Fee Type</label><p>{details.emdFeeType}</p></div>
                    </>
                  ) : (
                    <>
                      <div className="detail-item-left"><label>Advisory Bank</label><p>{details.advisoryBank}</p></div>
                      <div className="detail-item-left"><label>ePBG Percentage (%)</label><p>{details.epbgPercentage}</p></div>
                      <div className="detail-item-left"><label>Duration of ePBG (Months)</label><p>{details.epbgDuration}</p></div>
                    </>
                  )}
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
                <div style={{ marginBottom: '16px' }}>
                  <button
                    onClick={handleCheckPreBidFromDoc}
                    style={{
                      padding: '6px 14px', fontSize: '13px',
                      background: '#7c3aed', color: 'white', border: 'none',
                      borderRadius: '6px', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                    }}
                    title="Ask AI to find Pre-Bid meeting details from the tender document"
                  >
                    <Wand2 size={14} /> Check from Tender Doc
                  </button>
                </div>
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
                      if (isOpenTender) {
                        label = link.text || link.label || 'Document';
                      } else if (link.uri.includes('/BoqDocument/') || link.uri.includes('/BoqLineItemsDocument/') || link.uri.includes('/BOQDocument/')) {
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
                          <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ fontWeight: '500', color: '#333', fontSize: '14px' }}>
                              {label}
                            </span>
                            {isOpenTender && link.label && (
                              <span style={{
                                fontSize: '11px', background: '#e0f2fe', color: '#075985',
                                padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
                                alignSelf: 'flex-start',
                              }}>
                                {link.label}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            <button
                              onClick={isOpenTender ? async (e) => {
                                const btn = e.currentTarget;
                                btn.disabled = true;
                                btn.style.opacity = '0.6';
                                try {
                                  const token = localStorage.getItem('token');
                                  const res = await fetch(link.uri, {
                                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                                  });
                                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                  const blob = await res.blob();
                                  const ext = (link.text || '').split('.').pop().toLowerCase();

                                  if (['xls', 'xlsx', 'csv'].includes(ext)) {
                                    // Render spreadsheet as HTML table in a new tab
                                    const arrayBuffer = await blob.arrayBuffer();
                                    const wb = XLSX.read(arrayBuffer, { type: 'array' });
                                    // Include hidden sheets (BOQ data is often in hidden sheets behind a macro placeholder)
                                    const allSheetNames = wb.Workbook?.Sheets
                                      ? wb.Workbook.Sheets.map((s, i) => wb.SheetNames[i]).filter(Boolean)
                                      : wb.SheetNames;
                                    const sheetHtml = allSheetNames.map(name => {
                                      const ws = wb.Sheets[name];
                                      if (!ws) return '';
                                      // Skip macro-placeholder sheets (single cell warning, no real data)
                                      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                                      const flatText = rows.flat().join(' ').toLowerCase();
                                      if (rows.length <= 3 && flatText.includes('macro')) return '';
                                      if (rows.length === 0) return '';
                                      return `<h3 style="font-family:Arial;color:#084f9a;margin:20px 0 8px 0">${name}</h3>${XLSX.utils.sheet_to_html(ws)}`;
                                    }).filter(Boolean).join('<hr style="margin:24px 0;border:none;border-top:1px solid #ddd">');
                                    const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
                                      <title>${link.text || 'Document'}</title>
                                      <style>
                                        body{font-family:Arial,sans-serif;padding:20px;margin:0;background:#fff}
                                        h2{color:#1a1a1a;margin-bottom:4px}
                                        p{color:#666;font-size:13px;margin:0 0 20px}
                                        table{border-collapse:collapse;width:100%;margin-bottom:4px;font-size:13px}
                                        td,th{border:1px solid #ddd;padding:6px 10px;white-space:nowrap}
                                        tr:nth-child(even) td{background:#f8f9fa}
                                        thead tr th{background:#084f9a;color:#fff;font-weight:600}
                                      </style></head>
                                      <body>
                                        <h2>${link.text || 'Document'}</h2>
                                        <p>${link.label || ''}</p>
                                        ${sheetHtml}
                                      </body></html>`;
                                    const win = window.open('', '_blank');
                                    if (win) {
                                      win.document.write(htmlDoc);
                                      win.document.close();
                                    } else {
                                      alert('Pop-ups are blocked. Please allow pop-ups for this site to view documents.');
                                    }
                                  } else {
                                    // PDF and other files — open blob URL in new tab (native viewer)
                                    const blobUrl = URL.createObjectURL(blob);
                                    const win = window.open(blobUrl, '_blank');
                                    if (!win) alert('Pop-ups are blocked. Please allow pop-ups for this site to view documents.');
                                  }
                                } catch (err) {
                                  alert(`Cannot open file: ${err.message}`);
                                } finally {
                                  btn.disabled = false;
                                  btn.style.opacity = '1';
                                }
                              } : () => setViewerDoc({ url: link.uri, title: link.text || label })}
                              style={{
                                padding: '6px 12px', background: 'white', color: '#084f9a',
                                border: '1.5px solid #084f9a', borderRadius: '4px',
                                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px',
                              }}
                              onMouseOver={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#eef3fb'; }}
                              onMouseOut={e => { e.currentTarget.style.background = 'white'; }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                              View
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  // GeM/BHEL servers don't send CORS headers (and some redirect
                                  // during preflight, which browsers reject outright), so route
                                  // through the backend proxy for a same-origin fetch.
                                  const fetchUrl = /gem\.gov\.in|bhel\.in/i.test(link.uri)
                                    ? `${import.meta.env.VITE_API_BASE_URL}/tenders/proxy-document?url=${encodeURIComponent(link.uri)}`
                                    : link.uri;
                                  const token = localStorage.getItem('token');
                                  const res = await fetch(fetchUrl, {
                                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                                  });
                                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = link.text || label;
                                  document.body.appendChild(a);
                                  a.click();
                                  a.remove();
                                  URL.revokeObjectURL(url);
                                } catch (err) {
                                  alert(`Download failed: ${err.message}`);
                                }
                              }}
                              style={{
                                padding: '6px 12px', background: '#084f9a', color: 'white',
                                border: 'none', borderRadius: '4px', cursor: 'pointer',
                                fontSize: '13px', fontWeight: '500',
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                              }}
                              onMouseOver={e => e.currentTarget.style.background = '#063a73'}
                              onMouseOut={e => e.currentTarget.style.background = '#084f9a'}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              Download
                            </button>
                          </div>
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
            <button className="feature-btn" onClick={() => setShowTenderShareModal(true)}>↗ Share</button>
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
          isOpenTender={isOpenTender}
          hasDocument={links.length > 0}
          prewarmed={suggestionsPrewarmed}
          onUpdate={newProducts => setSuggestedProducts(newProducts)}
          onClose={() => setShowSuggestedModal(false)}
          onRefresh={async () => {
            try {
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
              }
            } catch (err) {
              console.error('onRefresh failed:', err);
            }
          }}
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

      {showTenderShareModal && (
        <ShareDeviationModal
          tenderId={tenderId}
          shareType="tender"
          onClose={() => setShowTenderShareModal(false)}
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
        <GenericTableModal
          title="Corrigendum Details"
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
          title={aiModalTitle}
          content={aiResult}
          loading={aiLoading}
          onClose={() => setShowAIModal(false)}
        />
      )}

      {viewerDoc && (
        <DocumentViewerModal
          title={viewerDoc.title}
          url={viewerDoc.url}
          onClose={() => setViewerDoc(null)}
        />
      )}

    </div>
  );
};

export default TenderDetails;
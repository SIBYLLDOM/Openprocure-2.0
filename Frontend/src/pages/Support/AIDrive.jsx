import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, FileText, Search, Trash2, Download, Tag,
  AlertTriangle, Clock, Database, RefreshCw, X,
  HelpCircle, ChevronDown, ChevronUp, CheckCircle,
} from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const CATEGORIES = ['All', 'Endo', 'Diagno', 'Both', 'General'];
const DOC_TYPES  = [
  { value: 'all',            label: 'All types' },
  { value: 'certificate',    label: 'Certificate' },
  { value: 'registration',   label: 'Registration' },
  { value: 'affidavit',      label: 'Affidavit' },
  { value: 'authorization',  label: 'Authorization' },
  { value: 'past_submission',label: 'Past Submission' },
  { value: 'other',          label: 'Other' },
];

const CAT_COLORS = {
  Endo:    { bg: '#dbeafe', color: '#1e40af' },
  Diagno:  { bg: '#dcfce7', color: '#166534' },
  Both:    { bg: '#f3e8ff', color: '#6b21a8' },
  General: { bg: '#f1f5f9', color: '#475569' },
};

function getDueDateStatus(due_date) {
  if (!due_date) return null;
  const days = Math.ceil((new Date(due_date) - new Date()) / 86400000);
  if (days < 0)    return { label: 'Expired',        bg: '#fee2e2', color: '#dc2626' };
  if (days <= 30)  return { label: `${days}d left`,  bg: '#fef3c7', color: '#d97706' };
  return null;
}

function Pill({ bg, color, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
      background: bg, color, padding: '0.15rem 0.55rem',
      borderRadius: '999px', fontSize: '0.6875rem', fontWeight: 600,
    }}>
      {children}
    </span>
  );
}

function ConfidenceBar({ value }) {
  const color = value >= 80 ? '#22c55e' : value >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
      <div style={{ flex: 1, background: '#e5e7eb', borderRadius: '999px', height: 6 }}>
        <div style={{ width: `${value}%`, background: color, height: '100%', borderRadius: '999px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', color, fontWeight: 700, minWidth: 32 }}>{value}%</span>
    </div>
  );
}

export default function AIDrive() {
  const token      = localStorage.getItem('token');
  const authHeader = { Authorization: `Bearer ${token}` };

  /* ── Upload form state ──────────────────────────────────── */
  const [form, setForm] = useState({
    title: '', doc_type: 'certificate', category: 'General',
    description: '', due_date: '',
  });
  const [uploadFile, setUploadFile]     = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadMsg, setUploadMsg]       = useState(null);
  const [showUpload, setShowUpload]     = useState(true);
  const fileInputRef                    = useRef(null);

  /* ── Document list state ────────────────────────────────── */
  const [docs, setDocs]                 = useState([]);
  const [loading, setLoading]           = useState(false);
  const [catFilter, setCatFilter]       = useState('All');
  const [typeFilter, setTypeFilter]     = useState('all');

  /* ── NL search state ────────────────────────────────────── */
  const [nlQuery, setNlQuery]           = useState('');
  const [nlResults, setNlResults]       = useState(null);
  const [nlLoading, setNlLoading]       = useState(false);

  /* ── Expanded card state ────────────────────────────────── */
  const [expanded, setExpanded]         = useState(null);

  /* ── Fetch docs ─────────────────────────────────────────── */
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (catFilter !== 'All') params.set('category', catFilter);
    if (typeFilter !== 'all') params.set('doc_type', typeFilter);
    try {
      const res  = await fetch(`${API}/company-drive?${params}`, { headers: authHeader });
      const json = await res.json();
      if (json.success) setDocs(json.data);
    } catch (e) {
      console.error('[AIDrive] fetchDocs:', e);
    } finally {
      setLoading(false);
    }
  }, [catFilter, typeFilter]);

  useEffect(() => {
    if (nlResults === null) fetchDocs();
  }, [fetchDocs, nlResults]);

  /* ── Upload ─────────────────────────────────────────────── */
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append('file', uploadFile);
    fd.append('title',       form.title.trim() || uploadFile.name);
    fd.append('doc_type',    form.doc_type);
    fd.append('category',    form.category);
    fd.append('description', form.description);
    if (form.due_date) fd.append('due_date', form.due_date);
    try {
      const res  = await fetch(`${API}/company-drive/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setUploadMsg({ type: 'success', text: 'Document uploaded and AI-tagged successfully.' });
        setForm({ title: '', doc_type: 'certificate', category: 'General', description: '', due_date: '' });
        setUploadFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setNlResults(null);
        fetchDocs();
      } else {
        setUploadMsg({ type: 'error', text: json.message || 'Upload failed.' });
      }
    } catch {
      setUploadMsg({ type: 'error', text: 'Upload failed. Check your connection.' });
    } finally {
      setUploading(false);
    }
  };

  /* ── NL search ──────────────────────────────────────────── */
  const handleNLSearch = async () => {
    if (!nlQuery.trim()) { setNlResults(null); return; }
    setNlLoading(true);
    setNlResults(null);
    try {
      const res  = await fetch(`${API}/company-drive/nl-search`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nlQuery }),
      });
      const json = await res.json();
      setNlResults(json.success ? json.data : []);
    } catch {
      setNlResults([]);
    } finally {
      setNlLoading(false);
    }
  };

  const clearNLSearch = () => { setNlQuery(''); setNlResults(null); };

  /* ── Delete ─────────────────────────────────────────────── */
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this document from AI Drive?')) return;
    await fetch(`${API}/company-drive/${id}`, { method: 'DELETE', headers: authHeader });
    setDocs(prev => prev.filter(d => d.id !== id));
    if (nlResults) setNlResults(prev => prev.filter(d => d.id !== id));
    if (expanded === id) setExpanded(null);
  };

  /* ── Displayed list ─────────────────────────────────────── */
  const displayList = nlResults !== null ? nlResults : docs;

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>

      {/* Page header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <Database size={24} color="#2563eb" /> AI Drive
        </h1>
        <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
          Global company document archive — certificates, authorisations, past submissions
        </p>
      </div>

      {/* ── SECTION A: Upload ── */}
      <div style={s.card}>
        <button
          onClick={() => setShowUpload(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left' }}
        >
          <Upload size={16} color="#2563eb" />
          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1f2937' }}>Upload Document</span>
          <span style={{ marginLeft: 'auto', color: '#6b7280' }}>{showUpload ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </button>

        {showUpload && (
          <form onSubmit={handleUpload} style={{ marginTop: '1.25rem' }}>
            {/* Row 1 */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <div style={{ flex: 2, minWidth: 180 }}>
                <label style={s.label}>Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. ISO 13485 Certificate 2025"
                  style={s.input}
                />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={s.label}>Document Type</label>
                <select value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))} style={s.select}>
                  {DOC_TYPES.filter(t => t.value !== 'all').map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={s.label}>Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={s.select}>
                  {CATEGORIES.filter(c => c !== 'All').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Row 2 */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <div style={{ flex: 3, minWidth: 220 }}>
                <label style={s.label}>Description <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Valid until Dec 2026, covers all product categories"
                  style={s.input}
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={s.label}>Expiry Date <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  style={s.input}
                />
              </div>
            </div>
            {/* File + submit */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <label style={{ ...s.dropZone, flex: 1, minWidth: 220 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  style={{ display: 'none' }}
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                />
                <Upload size={18} color="#94a3b8" />
                <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: uploadFile ? '#1f2937' : '#94a3b8', fontWeight: uploadFile ? 600 : 400 }}>
                  {uploadFile ? uploadFile.name : 'Choose file (PDF, DOC, DOCX, JPG, PNG)'}
                </span>
                {uploadFile && (
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              <button
                type="submit"
                disabled={uploading || !uploadFile}
                style={{ ...s.primaryBtn, opacity: uploading || !uploadFile ? 0.6 : 1 }}
              >
                {uploading ? (
                  <><span style={s.spinnerSm} /> Uploading &amp; tagging…</>
                ) : (
                  <><Upload size={15} /> Upload to AI Drive</>
                )}
              </button>
            </div>

            {uploadMsg && (
              <div style={{
                marginTop: '0.75rem', padding: '0.625rem 1rem', borderRadius: 8,
                background: uploadMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
                color:      uploadMsg.type === 'success' ? '#166534'  : '#991b1b',
                fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                {uploadMsg.type === 'success' ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                {uploadMsg.text}
              </div>
            )}
          </form>
        )}
      </div>

      {/* ── SECTION B: Search ── */}
      <div style={{ ...s.card, marginTop: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              value={nlQuery}
              onChange={e => setNlQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNLSearch()}
              placeholder="e.g. give me endo last 3 DB approval letters"
              style={{ ...s.input, paddingLeft: '2rem' }}
            />
          </div>
          <button onClick={handleNLSearch} disabled={nlLoading || !nlQuery.trim()} style={{ ...s.primaryBtn, opacity: nlLoading || !nlQuery.trim() ? 0.6 : 1 }}>
            {nlLoading ? <><span style={s.spinnerSm} /> Searching…</> : <><Search size={15} /> Search with AI</>}
          </button>
          {nlResults !== null && (
            <button onClick={clearNLSearch} style={s.ghostBtn}>
              <X size={14} /> Clear
            </button>
          )}
        </div>

        {nlResults !== null ? (
          <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.875rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, fontSize: '0.8125rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={13} />
            Showing AI search results for: <strong>"{nlQuery}"</strong>
            &nbsp;— {nlResults.length} result{nlResults.length !== 1 ? 's' : ''}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Category pills */}
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                style={{
                  padding: '0.3rem 0.875rem', borderRadius: '999px', border: 'none',
                  cursor: 'pointer', fontSize: '0.8125rem', fontWeight: catFilter === c ? 700 : 500,
                  background: catFilter === c ? '#2563eb' : '#f1f5f9',
                  color:      catFilter === c ? '#fff'     : '#374151',
                  transition: 'all 0.15s',
                }}
              >
                {c}
              </button>
            ))}
            <div style={{ marginLeft: 'auto' }}>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...s.select, width: 'auto' }}>
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION C: Document Grid ── */}
      <div style={{ marginTop: '1rem' }}>
        {loading && nlResults === null ? (
          <div style={s.centered}><div style={s.spinner} /></div>
        ) : displayList.length === 0 ? (
          <div style={s.emptyState}>
            <Database size={48} color="#cbd5e1" />
            <p style={{ margin: '0.75rem 0 0', color: '#94a3b8', fontWeight: 500 }}>
              {nlResults !== null ? 'No documents matched your query.' : 'No documents in AI Drive yet. Upload your first one above.'}
            </p>
          </div>
        ) : (
          <div style={s.grid}>
            {displayList.map(doc => {
              const dueSt   = getDueDateStatus(doc.due_date);
              const catCol  = CAT_COLORS[doc.category] || CAT_COLORS.General;
              const isOpen  = expanded === doc.id;
              const hasDiff = doc.title && doc.title !== doc.doc_name;

              return (
                <div key={doc.id} style={s.docCard}>
                  {/* Top pill row */}
                  <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <Pill bg={catCol.bg} color={catCol.color}>{doc.category}</Pill>
                    <Pill bg="#e0f2fe" color="#0369a1">{doc.doc_type}</Pill>
                    {dueSt && (
                      <Pill bg={dueSt.bg} color={dueSt.color}>
                        <Clock size={9} /> {dueSt.label}
                      </Pill>
                    )}
                  </div>

                  {/* Title */}
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9375rem', color: '#111827', lineHeight: 1.4 }}>
                    {doc.title || doc.doc_name}
                  </p>
                  {hasDiff && (
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.doc_name}
                    </p>
                  )}

                  {/* AI summary */}
                  {doc.ai_summary && (
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#4b5563', lineHeight: 1.55,
                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {doc.ai_summary}
                    </p>
                  )}

                  {/* NL reason */}
                  {doc.nl_reason && (
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#2563eb', fontStyle: 'italic' }}>
                      {doc.nl_reason}
                    </p>
                  )}

                  {/* Tags */}
                  {Array.isArray(doc.tags) && doc.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' }}>
                      {doc.tags.slice(0, 5).map((t, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem', fontSize: '0.6875rem', background: '#f1f5f9', color: '#475569', padding: '0.125rem 0.5rem', borderRadius: '999px' }}>
                          <Tag size={9} /> {t}
                        </span>
                      ))}
                      {doc.tags.length > 5 && <span style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>+{doc.tags.length - 5} more</span>}
                    </div>
                  )}

                  {/* AI questions warning */}
                  {doc.ai_questions && (
                    <div style={{ marginTop: '0.625rem', padding: '0.5rem 0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <HelpCircle size={13} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: '0.75rem', color: '#92400e', lineHeight: 1.5 }}>
                        AI has questions about this document — admin review requested
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                    <button
                      onClick={() => window.open(`${API}/company-drive/download/${doc.id}`, '_blank')}
                      style={s.actionBtn}
                      title="Download"
                    >
                      <Download size={13} /> Download
                    </button>
                    <button onClick={() => handleDelete(doc.id)} style={{ ...s.actionBtn, color: '#ef4444' }} title="Delete">
                      <Trash2 size={13} /> Delete
                    </button>
                    <button
                      onClick={() => setExpanded(isOpen ? null : doc.id)}
                      style={{ ...s.actionBtn, marginLeft: 'auto', color: '#2563eb' }}
                    >
                      {isOpen ? <><ChevronUp size={13} /> Hide</> : <><ChevronDown size={13} /> Details</>}
                    </button>
                  </div>

                  {/* Inline detail expand */}
                  {isOpen && (
                    <div style={{ marginTop: '0.875rem', padding: '0.875rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <p style={s.detailLabel}>AI Confidence</p>
                      <ConfidenceBar value={doc.ai_confidence ?? 100} />

                      {doc.ai_summary && (
                        <>
                          <p style={s.detailLabel}>Full Summary</p>
                          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#374151', lineHeight: 1.6 }}>{doc.ai_summary}</p>
                        </>
                      )}

                      {doc.ai_questions && (
                        <>
                          <p style={s.detailLabel}>AI Questions / Uncertainties</p>
                          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#92400e', lineHeight: 1.6, background: '#fffbeb', padding: '0.5rem 0.75rem', borderRadius: 6 }}>
                            {doc.ai_questions}
                          </p>
                        </>
                      )}

                      {Array.isArray(doc.tags) && doc.tags.length > 0 && (
                        <>
                          <p style={s.detailLabel}>All Tags</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                            {doc.tags.map((t, i) => (
                              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem', fontSize: '0.6875rem', background: '#f1f5f9', color: '#475569', padding: '0.125rem 0.5rem', borderRadius: '999px' }}>
                                <Tag size={9} /> {t}
                              </span>
                            ))}
                          </div>
                        </>
                      )}

                      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.75rem', color: '#6b7280' }}>
                        <span>Uploaded: {doc.created_at ? String(doc.created_at).slice(0, 10) : '—'}</span>
                        {doc.due_date && <span>Expiry: {String(doc.due_date).slice(0, 10)}</span>}
                        <span>Used: {doc.use_count ?? 0}×</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Inline styles ───────────────────────────────────────────────────────── */
const s = {
  card:       { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' },
  docCard:    { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  label:      { display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' },
  detailLabel:{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.75rem 0 0.3rem' },
  input:      { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 7, fontSize: '0.875rem', color: '#1f2937', background: '#fff', boxSizing: 'border-box' },
  select:     { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 7, fontSize: '0.875rem', color: '#1f2937', background: '#fff' },
  dropZone:   { display: 'flex', alignItems: 'center', border: '1.5px dashed #cbd5e1', borderRadius: 8, padding: '0.625rem 0.875rem', background: '#f8fafc', cursor: 'pointer' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '0.55rem 1.125rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' },
  ghostBtn:   { display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.5rem 0.875rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' },
  actionBtn:  { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.8125rem', fontWeight: 500, padding: '0.2rem 0.25rem' },
  centered:   { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem 0' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0', textAlign: 'center' },
  spinner:    { width: 36, height: 36, border: '3px solid #e2e8f0', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'spin 0.9s linear infinite' },
  spinnerSm:  { display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
};

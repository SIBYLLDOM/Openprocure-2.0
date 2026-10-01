import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, File as FileIcon, X, FileText, CheckCircle2, Loader2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const styles = {
  page:       { padding: '2rem', maxWidth: '900px', margin: '0 auto' },
  title:      { fontSize: '1.75rem', fontWeight: 700, color: '#1f2937', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.625rem' },
  subtitle:   { color: '#6b7280', fontSize: '0.95rem', margin: '0 0 1.75rem' },
  card:       { background: '#fff', borderRadius: 14, padding: '1.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(15,23,42,0.06)', border: '1px solid #eef0f4' },
  dropzone:   (active) => ({
    border: `2px dashed ${active ? '#2563eb' : '#cbd5e1'}`, borderRadius: 12,
    padding: '2.5rem 1.5rem', textAlign: 'center', cursor: 'pointer',
    background: active ? '#eff6ff' : '#f8fafc', transition: 'all 0.15s ease',
  }),
  fileRow:    { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: '0.5rem' },
  label:      { display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' },
  hint:       { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' },
  pillRow:    { display: 'flex', gap: '0.625rem', flexWrap: 'wrap' },
  pill:       (active) => ({
    padding: '0.55rem 1.1rem', borderRadius: 999, border: `1.5px solid ${active ? '#2563eb' : '#d1d5db'}`,
    background: active ? '#eff6ff' : '#fff', color: active ? '#1d4ed8' : '#374151',
    fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
  }),
  submitBtn:  { width: '100%', marginTop: '1.5rem', padding: '0.85rem', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
};

const SOURCE_OPTIONS = [
  { value: '', label: "Let it decide" },
  { value: 'gem', label: 'GeM' },
  { value: 'open', label: 'Open Tender' },
];
const DIVISION_OPTIONS = [
  { value: '', label: "Let it decide" },
  { value: 'Endo', label: 'EndoSurgery' },
  { value: 'Diagno', label: 'Diagnostic' },
  { value: 'both', label: 'Both' },
];

export default function DocumentTender() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [source, setSource] = useState('');
  const [division, setDivision] = useState('');
  const [tenderRef, setTenderRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // The upload endpoint returns a jobId immediately (OCR on a scanned doc can take
  // minutes — far longer than the reverse proxy holds a request open) and does the
  // real work in the background; the actual tender_id/bid_number only exist once
  // that job finishes, so we have to poll for it rather than trust the initial response.
  const pollJob = (jobId) => new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/tenders/document-tender/${encodeURIComponent(jobId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!json.success) return reject(new Error(json.message || 'Failed to check job status'));
        if (json.status === 'done') return resolve(json.result);
        if (json.status === 'error') return reject(new Error(json.error || 'Failed to create tender from documents.'));
        if (json.progress) setProgress(json.progress);
        setTimeout(tick, 3000);
      } catch (e) {
        reject(e);
      }
    };
    tick();
  });

  const addFiles = (fileList) => {
    const newFiles = Array.from(fileList);
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async () => {
    if (!files.length) { setError('Add at least one document (or a ZIP) first.'); return; }
    setSubmitting(true);
    setError(null);
    setResult(null);
    setProgress('Uploading…');
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      if (source) fd.append('source', source);
      if (division) fd.append('division', division);
      if (tenderRef.trim()) fd.append('tenderRef', tenderRef.trim());

      const res = await fetch(`${API_BASE_URL}/tenders/document-tender`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (!json.success || !json.jobId) {
        setError(json.message || 'Failed to create tender from documents.');
        return;
      }
      const jobResult = await pollJob(json.jobId);
      setResult(jobResult);
    } catch (e) {
      setError('Failed: ' + e.message);
    } finally {
      setSubmitting(false);
      setProgress('');
    }
  };

  const handleViewTender = () => {
    const id = result.bid_number || result.tender_id;
    // Not `${basePath}/tenderdetails/:id` — that route's URL param is named
    // "id" while TenderDetails.jsx reads `tenderId` from useParams(), so it
    // never fires its data fetch. This generic route's param is actually
    // named "tenderId", matching what the page expects.
    navigate(`/tenders/tenderdetails/${encodeURIComponent(id)}`);
  };

  const resetForm = () => {
    setFiles([]);
    setSource('');
    setDivision('');
    setTenderRef('');
    setResult(null);
    setError(null);
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}><UploadCloud size={26} color="#2563eb" /> Document Tender</h1>
      <p style={styles.subtitle}>
        Upload the bid document, BOQ, ATC, or a ZIP of everything for a relevant tender you found elsewhere — it'll be read automatically and added to the portal as a new tender.
      </p>

      {result ? (
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <CheckCircle2 size={48} color="#16a34a" style={{ marginBottom: 12 }} />
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#1f2937' }}>Tender added</h2>
          <p style={{ margin: '0 0 1.5rem', color: '#6b7280', fontSize: '0.9rem' }}>
            Created as a <strong>{result.source === 'gem' ? 'GeM' : 'Open'}</strong> tender —{' '}
            <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{result.bid_number || result.tender_id}</code>
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button onClick={resetForm} style={{ ...styles.submitBtn, width: 'auto', background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0' }}>
              Add Another
            </button>
            <button onClick={handleViewTender} style={{ ...styles.submitBtn, width: 'auto' }}>
              View Tender
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <label style={styles.label}>Documents</label>
          <div
            style={styles.dropzone(dragActive)}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
            />
            <UploadCloud size={30} color="#94a3b8" style={{ marginBottom: 8 }} />
            <p style={{ margin: 0, fontWeight: 600, color: '#374151' }}>Drag & drop files here, or click to browse</p>
            <p style={styles.hint}>Bid document, BOQ, ATC, or any combination — a single ZIP of everything works too</p>
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              {files.map((f, i) => (
                <div key={i} style={styles.fileRow}>
                  <FileIcon size={16} color="#64748b" />
                  <span style={{ flex: 1, fontSize: '0.85rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', flexShrink: 0 }}>{formatSize(f.size)}</span>
                  <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', flexShrink: 0, display: 'flex' }}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '1.75rem' }}>
            <label style={styles.label}>Tender ID / Reference Number (optional — auto-read from the documents if left blank)</label>
            <input
              type="text"
              value={tenderRef}
              onChange={(e) => setTenderRef(e.target.value)}
              placeholder="e.g. GEM/2026/B/1234567 or a NIT/tender reference number"
              style={{
                width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8,
                border: '1px solid #d1d5db', fontSize: '0.9rem', color: '#1f2937',
                boxSizing: 'border-box',
              }}
            />
            <p style={styles.hint}>Set this if the documents don't clearly state the reference number, or if auto-detection reads it wrong.</p>
          </div>

          <div style={{ marginTop: '1.75rem' }}>
            <label style={styles.label}>Source (optional — auto-detected from the documents if left as-is)</label>
            <div style={styles.pillRow}>
              {SOURCE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setSource(opt.value)} style={styles.pill(source === opt.value)}>{opt.label}</button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <label style={styles.label}>Division (optional — auto-detected from the documents if left as-is)</label>
            <div style={styles.pillRow}>
              {DIVISION_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setDivision(opt.value)} style={styles.pill(division === opt.value)}>{opt.label}</button>
              ))}
            </div>
          </div>

          {error && (
            <p style={{ marginTop: '1rem', color: '#dc2626', fontSize: '0.85rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
              {error}
            </p>
          )}

          <button onClick={handleSubmit} disabled={submitting} style={{ ...styles.submitBtn, opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? (<><Loader2 size={17} className="spin" /> {progress || 'Reading documents & creating tender…'}</>) : (<><FileText size={17} /> Create Tender from Documents</>)}
          </button>
          <p style={{ ...styles.hint, textAlign: 'center', marginTop: '0.75rem' }}>This can take a few minutes — longer for scanned documents, which are read page by page.</p>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

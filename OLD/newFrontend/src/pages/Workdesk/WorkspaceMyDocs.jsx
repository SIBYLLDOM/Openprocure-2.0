import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Upload, Download, Archive, GripVertical } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const styles = {
  card:       { background: '#fff', borderRadius: 10, padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' },
  sectionHead:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' },
  btnBlue:    { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 },
  btnGreen:   { background: '#166534', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 },
  btnGhost:   { background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 },
  row:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' },
  label:      { display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem' },
  input:      { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', background: '#fff', color: '#1f2937', boxSizing: 'border-box' },
  uploadZone: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '1rem', cursor: 'pointer' },
};

export default function WorkspaceMyDocs({ tenderId }) {
  const cleanBid   = (tenderId || '').replace(/_/g, '/');
  const encodedBid = encodeURIComponent(cleanBid);
  const token      = localStorage.getItem('token');
  const authHeader = { Authorization: `Bearer ${token}` };
  const navigate   = useNavigate();

  // ── AI-drafted documents (unchanged — client-side, from the /Docs editor) ──
  const [wsDocs, setWsDocs] = useState([]);
  useEffect(() => {
    const tidNorm   = (tenderId || '').replace(/[^a-zA-Z0-9]/g, '_');
    const prefix    = 'docs_editor_ws_' + tidNorm;
    const docprePfx = 'docs_editor_docprep_' + tidNorm;
    const docs = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(prefix) || key.startsWith(docprePfx))) {
        try { const d = JSON.parse(localStorage.getItem(key)); if (d) docs.push(d); } catch { /* ignore */ }
      }
    }
    docs.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    setWsDocs(docs);
  }, [tenderId]);

  // ── Uploaded documents (shared with the Doc Prep tab's doc-prep session) ───
  const [uploadedDocs, setUploadedDocs]       = useState([]);
  const [loadingUploaded, setLoadingUploaded] = useState(true);
  const [downloadingDocId, setDownloadingDocId] = useState(null);

  const fetchUploadedDocs = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/session`, { headers: authHeader });
      const json = await res.json();
      if (json.success) setUploadedDocs(json.data.uploaded_docs || []);
    } catch (e) {
      console.error('[my-docs] fetchUploadedDocs:', e);
    } finally {
      setLoadingUploaded(false);
    }
  }, [encodedBid]);

  useEffect(() => { fetchUploadedDocs(); }, [fetchUploadedDocs]);

  // ── Add Document modal (identical flow to Doc Prep's Upload Document) ──────
  const [showUploadModal, setShowUploadModal]     = useState(false);
  const [uploadFile, setUploadFile]               = useState(null);
  const [uploadName, setUploadName]               = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isUploadingDoc, setIsUploadingDoc]       = useState(false);

  const handleOpenUploadModal = () => {
    setUploadFile(null);
    setUploadName('');
    setUploadDescription('');
    setShowUploadModal(true);
  };

  const handleUploadFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    const dot = file.name.lastIndexOf('.');
    setUploadName(dot > 0 ? file.name.slice(0, dot) : file.name);
  };

  const handleUploadDocument = async () => {
    if (!uploadFile) { alert('Please choose a file to upload.'); return; }
    setIsUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('name', uploadName.trim() || uploadFile.name);
      fd.append('description', uploadDescription.trim());
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setUploadedDocs(json.uploaded_docs || []);
        setShowUploadModal(false);
      } else {
        alert(json.message || 'Upload failed');
      }
    } catch (e) {
      alert('Upload failed: ' + e.message);
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDownloadUserDoc = async (doc) => {
    setDownloadingDocId(doc.id);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${doc.id}/download`, { headers: authHeader });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = doc.file_name || doc.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloadingDocId(null);
    }
  };

  // ── Download-as-ZIP order picker (drag to reorder, same "N.filename" naming
  //    as the Doc Prep tab) ────────────────────────────────────────────────
  const [showZipModal, setShowZipModal]     = useState(false);
  const [zipItems, setZipItems]             = useState([]);
  const [draggedZipIdx, setDraggedZipIdx]   = useState(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const handleOpenZipModal = () => {
    setZipItems(uploadedDocs.map(doc => ({ type: 'uploaded', id: doc.id, name: doc.name, sub: doc.file_name || '' })));
    setShowZipModal(true);
  };

  const handleZipDragStart = (idx) => setDraggedZipIdx(idx);
  const handleZipDragOver  = (e) => e.preventDefault();
  const handleZipDrop = (idx) => {
    setZipItems(prev => {
      if (draggedZipIdx === null || draggedZipIdx === idx) return prev;
      const next = [...prev];
      const [moved] = next.splice(draggedZipIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDraggedZipIdx(null);
  };

  const handleConfirmDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/download-all-zip`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: zipItems.map(({ type, id }) => ({ type, id })) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to generate ZIP');
        return;
      }
      const blob    = await res.blob();
      const url     = URL.createObjectURL(blob);
      const a       = document.createElement('a');
      a.href        = url;
      const safeBid = cleanBid.replace(/[^a-zA-Z0-9_\-]/g, '_');
      a.download    = `${safeBid}_documents.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setShowZipModal(false);
    } catch (e) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloadingZip(false);
    }
  };

  const tidNorm = (tenderId || '').replace(/[^a-zA-Z0-9]/g, '_');

  return (
    <>
      {/* AI-drafted documents */}
      <div style={{ ...styles.card, marginBottom: '1.5rem' }}>
        <div style={styles.sectionHead}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} color="#2563eb" /> My Documents
          </h3>
          <button onClick={() => navigate(`/Docs/ws_${tidNorm}_doc_${Date.now()}`)} style={styles.btnBlue}>
            <Plus size={15} /> New Document
          </button>
        </div>
        {wsDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#9ca3af' }}>
            <FileText size={40} color="#cbd5e1" style={{ marginBottom: 12 }} />
            <p style={{ margin: 0 }}>No documents yet for this workspace.</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>Use "Generate Doc" or "Draft with Claude" to create one.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {wsDocs.map(doc => (
              <div key={doc.id} style={styles.row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <FileText size={18} color="#2563eb" style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title || 'Untitled'}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>{doc.savedAt ? new Date(doc.savedAt).toLocaleString() : ''}</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/Docs/${doc.id}`, { state: { title: doc.title } })}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 0.9rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Uploaded documents */}
      <div style={styles.card}>
        <div style={styles.sectionHead}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={18} color="#166534" /> Uploaded Documents
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleOpenZipModal}
              disabled={uploadedDocs.length === 0}
              style={{ ...styles.btnGhost, opacity: uploadedDocs.length === 0 ? 0.5 : 1, cursor: uploadedDocs.length === 0 ? 'not-allowed' : 'pointer' }}
              title={uploadedDocs.length === 0 ? 'Upload a document first' : 'Choose order and download as ZIP'}
            >
              <Archive size={15} /> Download as ZIP
            </button>
            <button onClick={handleOpenUploadModal} style={styles.btnGreen}>
              <Upload size={15} /> Add Document
            </button>
          </div>
        </div>

        {loadingUploaded ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>Loading…</p>
        ) : uploadedDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#9ca3af' }}>
            <Upload size={40} color="#cbd5e1" style={{ marginBottom: 12 }} />
            <p style={{ margin: 0 }}>No documents uploaded yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {uploadedDocs.map(doc => (
              <div key={doc.id} style={styles.row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Upload size={18} color="#166534" style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
                    {doc.description && <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>{doc.description}</p>}
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>{doc.file_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadUserDoc(doc)}
                  disabled={downloadingDocId === doc.id}
                  style={{ ...styles.btnGreen, flexShrink: 0 }}
                >
                  <Download size={14} /> {downloadingDocId === doc.id ? 'Downloading…' : 'Download'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Document modal */}
      {showUploadModal && (
        <div
          onClick={() => !isUploadingDoc && setShowUploadModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '420px', maxWidth: '90vw', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>Add Document</h3>

            <label style={styles.label}>File</label>
            <label style={{ ...styles.uploadZone, marginBottom: '1rem' }}>
              <input type="file" style={{ display: 'none' }} onChange={handleUploadFileSelect} />
              <Upload size={22} color="#94a3b8" />
              <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: '#374151', wordBreak: 'break-all', textAlign: 'center' }}>
                {uploadFile ? uploadFile.name : 'Click to choose a file'}
              </p>
            </label>

            <label style={styles.label}>Name</label>
            <input
              value={uploadName}
              onChange={e => setUploadName(e.target.value)}
              placeholder="Document name"
              style={{ ...styles.input, marginBottom: '1rem' }}
            />

            <label style={styles.label}>Description (optional)</label>
            <textarea
              value={uploadDescription}
              onChange={e => setUploadDescription(e.target.value)}
              placeholder="Add a short description…"
              rows={3}
              style={{ ...styles.input, marginBottom: '1.25rem', resize: 'vertical', fontFamily: 'inherit' }}
            />

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUploadModal(false)} disabled={isUploadingDoc} style={styles.btnGhost}>Cancel</button>
              <button
                onClick={handleUploadDocument}
                disabled={isUploadingDoc || !uploadFile}
                style={{ ...styles.btnGreen, opacity: (isUploadingDoc || !uploadFile) ? 0.6 : 1, cursor: (isUploadingDoc || !uploadFile) ? 'not-allowed' : 'pointer' }}
              >
                <Upload size={15} /> {isUploadingDoc ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download-as-ZIP order picker modal */}
      {showZipModal && (
        <div
          onClick={() => !downloadingZip && setShowZipModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '480px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>Download as ZIP</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: '#6b7280' }}>
              Drag to reorder — each file is saved as "position.filename" in the ZIP.
            </p>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {zipItems.map((item, idx) => (
                <div
                  key={`${item.type}_${item.id}`}
                  draggable
                  onDragStart={() => handleZipDragStart(idx)}
                  onDragOver={handleZipDragOver}
                  onDrop={() => handleZipDrop(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                    background: draggedZipIdx === idx ? '#eff6ff' : '#f8fafc',
                    border: '1px solid #e2e8f0', borderRadius: '8px',
                    padding: '0.5rem 0.75rem', cursor: 'grab',
                  }}
                >
                  <GripVertical size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
                  <span style={{
                    flexShrink: 0, width: '1.5rem', height: '1.5rem', borderRadius: '50%',
                    background: '#1e40af', color: '#fff', fontSize: '0.75rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {idx + 1}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>
                      {item.name}
                    </p>
                    {item.sub && (
                      <p style={{ margin: 0, fontSize: '0.6875rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowZipModal(false)} disabled={downloadingZip} style={styles.btnGhost}>Cancel</button>
              <button
                onClick={handleConfirmDownloadZip}
                disabled={downloadingZip || zipItems.length === 0}
                style={{ ...styles.btnGreen, opacity: (downloadingZip || zipItems.length === 0) ? 0.6 : 1, cursor: (downloadingZip || zipItems.length === 0) ? 'not-allowed' : 'pointer' }}
              >
                <Archive size={15} /> {downloadingZip ? 'Preparing ZIP…' : 'Download ZIP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

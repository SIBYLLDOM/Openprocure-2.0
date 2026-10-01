import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ArrowLeft, Save, Trash2, Loader2, GripVertical, FileText, ZoomIn, ZoomOut, Pencil, CheckCircle } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const STORAGE_KEY  = 'docs_editor_';

// Same fixed region the original merge stamps its page number into (see
// WorkspaceMyDocs' handleMergeFiles) — covered with a white rect before
// drawing the new number, so reordered/deleted pages don't end up showing
// two overlapping numbers.
const STAMP_FONT_SIZE = 16;
const STAMP_Y_FROM_TOP = 45;
const STAMP_COVER_WIDTH = 90;
const STAMP_COVER_HEIGHT = 30;

const MIN_COLS = 2;
const MAX_COLS = 8;
const DEFAULT_COLS = 5;

export default function MergedPdfEditor() {
  const { docId }  = useParams();
  const navigate   = useNavigate();
  const location   = useLocation();
  const bidNo      = location.state?.bidNo || '';
  const docTitle   = location.state?.title || 'Merged Document';
  const encodedBid = encodeURIComponent(bidNo);
  const token      = localStorage.getItem('token');
  const authHeader = { Authorization: `Bearer ${token}` };

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [pages, setPages]       = useState([]); // [{ key, originalIndex, thumb, editedHtml? }]
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [openingKey, setOpeningKey] = useState(null); // page currently being transcribed for editing
  const [cols, setCols]         = useState(DEFAULT_COLS);
  const originalBytesRef = useRef(null);
  const originalPageMapRef = useRef(null); // [{ docId, start, end }] from the merge that produced this doc, or null

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = (message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  const editDocIdFor = (pageKey) => `mergedpage_${docId}_${pageKey}`;

  const loadPdf = useCallback(async () => {
    if (!bidNo || !docId) { setError('Missing document reference — open this from My Documents.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      // Pull the merge's own page_map (if any) so edits here can tell the
      // checklist which document each surviving page still belongs to.
      try {
        const sRes = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/session`, { headers: authHeader });
        const sJson = await sRes.json();
        if (sJson.success) {
          const docEntry = (sJson.data.uploaded_docs || []).find(d => d.id === docId);
          originalPageMapRef.current = docEntry?.page_map || null;
        }
      } catch { /* checklist update on save just becomes a no-op if this fails */ }

      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${docId}/download`, { headers: authHeader });
      if (!res.ok) throw new Error('Could not download the document');
      const bytes = await res.arrayBuffer();
      originalBytesRef.current = bytes;

      const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const nextPages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const key = `p_${i}`;

        // If this page was sent off to the document editor and the user hit
        // Back, its edited content is sitting in localStorage under a
        // composite id — pick it up here so re-opening the merged editor
        // (a fresh mount, same as any route revisit) shows it as edited.
        let editedHtml = null;
        try {
          const raw = localStorage.getItem(STORAGE_KEY + editDocIdFor(key));
          if (raw) editedHtml = JSON.parse(raw)?.content || null;
        } catch { /* ignore */ }

        nextPages.push({ key, originalIndex: i - 1, thumb: canvas.toDataURL('image/jpeg', 0.7), editedHtml });
      }
      setPages(nextPages);
    } catch (e) {
      console.error('[merged-pdf-editor] load failed:', e);
      setError('Failed to load the document: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [bidNo, docId, encodedBid]);

  useEffect(() => { loadPdf(); }, [loadPdf]);

  const handleDragStart = (idx) => setDraggedIdx(idx);
  const handleDragOver  = (e) => e.preventDefault();
  const handleDrop = (idx) => {
    if (draggedIdx === null || draggedIdx === idx) { setDraggedIdx(null); return; }
    setPages(prev => {
      const next = [...prev];
      const [moved] = next.splice(draggedIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDraggedIdx(null);
  };

  const handleRemovePage = (key) => {
    setPages(prev => {
      if (prev.length <= 1) { alert('A document must have at least one page.'); return prev; }
      return prev.filter(p => p.key !== key);
    });
  };

  const handleMovePage = (idx, dir) => {
    setPages(prev => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // Extracts one page as its own 1-page PDF, has the backend transcribe it
  // to editable HTML, stashes that as a normal Docs-editor draft, and opens
  // it in the SAME editor used everywhere else (real tables, not a flat
  // annotation overlay) — its Back button returns here, where the edited
  // content is picked back up (see loadPdf above) and gets baked into this
  // page's spot when the merged document is next saved.
  const handleEditPage = async (page, idx) => {
    setOpeningKey(page.key);
    try {
      const src = await PDFDocument.load(originalBytesRef.current);
      const single = await PDFDocument.create();
      const [copied] = await single.copyPages(src, [page.originalIndex]);
      single.addPage(copied);
      const bytes = await single.save();
      const file = new File([bytes], `page_${idx + 1}.pdf`, { type: 'application/pdf' });

      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/page-to-html`, {
        method: 'POST', headers: authHeader, body: fd,
      });
      const json = await res.json();
      if (!json.success) { alert(json.message || 'Could not read this page for editing.'); return; }

      const editDocId = editDocIdFor(page.key);
      const title = `Page ${idx + 1} — ${docTitle}`;
      localStorage.setItem(STORAGE_KEY + editDocId, JSON.stringify({
        id: editDocId,
        title,
        content: json.html_content,
        bidNo,
        savedAt: new Date().toISOString(),
        source: 'merged_page',
        mergedPageEdit: true,
      }));
      navigate(`/Docs/${editDocId}`, {
        state: {
          title, bidNo, mergedPageEdit: true,
          backTo: `/MergedPdf/${docId}`,
          backToState: { bidNo, title: docTitle },
        },
      });
    } catch (e) {
      alert('Could not open this page: ' + e.message);
    } finally {
      setOpeningKey(null);
    }
  };

  // Rebuilds the PDF from the current page order/selection. A page with
  // edited content is re-rendered from its (possibly multi-page-now) HTML
  // and substituted in — everything else is copied from the original
  // bytes untouched. Sequential page numbers are re-stamped afterward in
  // the same position+style the original merge used, covering whatever
  // number was already burned into that spot first. Returns the bytes plus
  // a parallel `segments` list (one entry per ORIGINAL `pages` row, with how
  // many final PDF pages it ended up contributing) so the checklist page
  // map can be computed against actual output length, not assumed 1-to-1.
  const buildEditedPdf = async () => {
    const src = await PDFDocument.load(originalBytesRef.current);
    const out = await PDFDocument.create();
    const segments = [];

    for (const p of pages) {
      if (p.editedHtml) {
        const res = await fetch(`${API_BASE_URL}/doc-prep/export-pdf`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: docTitle, html_content: p.editedHtml, bidNo, plainExport: true }),
        });
        if (!res.ok) throw new Error(`Could not render the edited page ${p.key}`);
        const bytes = await res.arrayBuffer();
        const rendered = await PDFDocument.load(bytes);
        const copied = await out.copyPages(rendered, rendered.getPageIndices());
        copied.forEach(cp => out.addPage(cp));
        segments.push({ originalIndex: p.originalIndex, length: copied.length });
      } else {
        const [copied] = await out.copyPages(src, [p.originalIndex]);
        out.addPage(copied);
        segments.push({ originalIndex: p.originalIndex, length: 1 });
      }
    }

    const font = await out.embedFont(StandardFonts.HelveticaBold);
    out.getPages().forEach((page, i) => {
      const { width, height } = page.getSize();
      page.drawRectangle({
        x: width / 2 - STAMP_COVER_WIDTH / 2,
        y: height - STAMP_Y_FROM_TOP - STAMP_COVER_HEIGHT / 2,
        width: STAMP_COVER_WIDTH,
        height: STAMP_COVER_HEIGHT,
        color: rgb(1, 1, 1),
      });
      const label = `${i + 1}`;
      const textWidth = font.widthOfTextAtSize(label, STAMP_FONT_SIZE);
      page.drawText(label, {
        x: width / 2 - textWidth / 2,
        y: height - STAMP_Y_FROM_TOP,
        size: STAMP_FONT_SIZE,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    });

    const bytes = await out.save();
    return { bytes, segments };
  };

  // Maps each segment (by its row's ORIGINAL page index) back to whichever
  // source document it came from (per the merge's own page_map), then
  // collapses that into a new 1-based range per document in the EDITED
  // output — using each segment's actual rendered length, so a page that
  // expanded to 2 pages after editing still lines up correctly. Best-effort
  // if a document's pages end up non-contiguous after reordering.
  const computeNewPageMap = (segments) => {
    const original = originalPageMapRef.current;
    if (!Array.isArray(original) || !original.length) return [];
    const findDocId = (originalIndex) => {
      const pageNum = originalIndex + 1;
      const hit = original.find(m => pageNum >= m.start && pageNum <= m.end);
      return hit ? hit.docId : null;
    };
    const positions = new Map(); // docId -> { start, end }
    let cursor = 1;
    for (const seg of segments) {
      const docIdHit = findDocId(seg.originalIndex);
      if (docIdHit) {
        const start = cursor;
        const end = cursor + seg.length - 1;
        const cur = positions.get(docIdHit);
        if (!cur) positions.set(docIdHit, { start, end });
        else { cur.start = Math.min(cur.start, start); cur.end = Math.max(cur.end, end); }
      }
      cursor += seg.length;
    }
    return Array.from(positions.entries()).map(([docIdKey, { start, end }]) => ({ docId: docIdKey, start, end }));
  };

  const handleSaveAndPush = async () => {
    if (!pages.length) return;
    setSaving(true);
    try {
      const { bytes, segments } = await buildEditedPdf();
      const newPageMap = computeNewPageMap(segments);
      const safeBid = bidNo.replace(/[^a-zA-Z0-9_\-]/g, '_');
      const name = `Merged_${safeBid}_${Date.now()}`;
      const file = new File([bytes], `${name}.pdf`, { type: 'application/pdf' });

      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name);
      fd.append('description', `Edited from "${docTitle}"`);
      fd.append('is_merged', 'true');
      fd.append('push_source', 'merged_output');
      fd.append('page_map', JSON.stringify(newPageMap));
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, {
        method: 'POST', headers: authHeader, body: fd,
      });
      const json = await res.json();
      if (!json.success) { alert(json.message || 'Push failed'); return; }

      // Keep the checklist's Yes/No + page numbers in sync with the edit —
      // best-effort; a failure here doesn't undo the document push above.
      if (newPageMap.length) {
        try {
          await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/checklist/apply-page-map`, {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageMap: newPageMap }),
          });
        } catch { /* best effort */ }
      }

      showToast('Saved — replaced the merged document in My Docs');
      setTimeout(() => navigate(`/workspace/${bidNo}`, { state: { tab: 'my-docs' } }), 900);
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    setSaving(true);
    try {
      const { bytes } = await buildEditedPdf();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: `${docTitle.replace(/[^a-zA-Z0-9 _-]/g, '_')}.pdf` });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Download failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <button style={s.backBtn} onClick={() => navigate(`/workspace/${bidNo}`, { state: { tab: 'my-docs' } })} title="Back">
          <ArrowLeft size={18} />
        </button>
        <FileText size={20} color="#4f46e5" style={{ flexShrink: 0 }} />
        <span style={s.title}>{docTitle}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#6b7280' }}>{pages.length} page{pages.length === 1 ? '' : 's'}</span>
        <div style={s.zoomGroup}>
          <button onClick={() => setCols(c => Math.min(MAX_COLS, c + 1))} disabled={cols >= MAX_COLS} title="Zoom out (more columns)" style={s.zoomBtn}>
            <ZoomOut size={15} />
          </button>
          <span style={{ fontSize: 12, color: '#6b7280', width: 20, textAlign: 'center' }}>{cols}</span>
          <button onClick={() => setCols(c => Math.max(MIN_COLS, c - 1))} disabled={cols <= MIN_COLS} title="Zoom in (fewer columns)" style={s.zoomBtn}>
            <ZoomIn size={15} />
          </button>
        </div>
        <button style={{ ...s.topBtn, background: '#334155', opacity: (saving || loading) ? 0.6 : 1 }} onClick={handleDownload} disabled={saving || loading}>
          Download
        </button>
        <button style={{ ...s.topBtn, background: '#166534', opacity: (saving || loading) ? 0.6 : 1 }} onClick={handleSaveAndPush} disabled={saving || loading}>
          <Save size={15} /> {saving ? 'Saving…' : 'Save & Push to My Docs'}
        </button>
      </div>

      <div style={s.body}>
        {loading && (
          <div style={s.centerMsg}>
            <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} />
            <span>Loading pages…</span>
          </div>
        )}
        {!loading && error && <div style={{ ...s.centerMsg, color: '#dc2626' }}>{error}</div>}
        {!loading && !error && (
          <div style={{ ...s.grid, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {pages.map((p, idx) => (
              <div
                key={p.key}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
                style={{ ...s.card, opacity: draggedIdx === idx ? 0.4 : 1, borderColor: p.editedHtml ? '#166534' : '#e2e8f0', cursor: draggedIdx === idx ? 'grabbing' : 'grab' }}
              >
                <div style={s.cardHeader}>
                  <GripVertical size={14} color="#94a3b8" style={{ cursor: 'grab' }} />
                  <span style={s.pageNum}>Page {idx + 1}</span>
                  <button onClick={() => handleRemovePage(p.key)} title="Remove this page" style={s.removeBtn}>
                    <Trash2 size={13} />
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <img src={p.thumb} alt={`Page ${idx + 1}`} style={s.thumb} />
                  {p.editedHtml && (
                    <span style={s.editedBadge}><CheckCircle size={10} /> Edited</span>
                  )}
                  {openingKey === p.key && (
                    <div style={s.thumbOverlay}><Loader2 size={20} color="#fff" style={{ animation: 'spin 0.8s linear infinite' }} /></div>
                  )}
                </div>
                <div style={s.cardFooter}>
                  <button onClick={() => handleMovePage(idx, -1)} disabled={idx === 0} style={s.moveBtn}>&larr;</button>
                  <button
                    onClick={() => handleEditPage(p, idx)}
                    disabled={openingKey !== null}
                    title="Open this page in the document editor"
                    style={s.editBtn}
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button onClick={() => handleMovePage(idx, 1)} disabled={idx === pages.length - 1} style={s.moveBtn}>&rarr;</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div onClick={() => setToast(null)} style={s.toast}>
          <Save size={18} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{toast.message}</span>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:      { height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' },
  topBar:    { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0, minHeight: 52 },
  backBtn:   { background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151', flexShrink: 0 },
  title:     { fontSize: 15, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 },
  topBtn:    { color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' },
  zoomGroup: { display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 6px', background: '#f8fafc' },
  zoomBtn:   { background: 'none', border: 'none', cursor: 'pointer', color: '#374151', display: 'flex', padding: 2 },

  body:      { flex: 1, overflow: 'auto', padding: '1.25rem' },
  centerMsg: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, height: '60vh', color: '#6b7280', fontSize: 14 },
  grid:      { display: 'grid', gap: '1rem' },

  card:        { background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  cardHeader:  { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid #f1f5f9', cursor: 'grab' },
  pageNum:     { fontSize: 12, fontWeight: 600, color: '#374151', flex: 1 },
  removeBtn:   { background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: 2 },
  thumb:       { width: '100%', display: 'block', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' },
  editedBadge: { position: 'absolute', top: 4, right: 4, background: '#166534', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px', display: 'flex', alignItems: 'center', gap: 3 },
  thumbOverlay:{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardFooter:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, padding: '4px 8px' },
  moveBtn:     { background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12, color: '#374151' },
  editBtn:     { background: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 },

  toast: {
    position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 100000,
    display: 'flex', alignItems: 'center', gap: '0.625rem',
    background: '#166534', color: '#fff', borderRadius: 8,
    padding: '0.75rem 1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    maxWidth: 380, cursor: 'pointer',
  },
};

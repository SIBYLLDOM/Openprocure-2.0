import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Upload, Download, Eye, Archive, GripVertical, Trash2, Pencil, CheckSquare, Combine, X, Search, LayoutGrid, File as FileIcon } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import DownloadShareButtons from '../../components/common/DownloadShareButtons';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Always render timestamps in Indian time regardless of the viewer's own
// system timezone/locale — the whole team works IST, so a document "last
// modified" time should read the same for everyone.
const formatIST = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }) + ' IST';
  } catch { return ''; }
};

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
  const navigate   = useNavigate();
  const cleanBid   = (tenderId || '').replace(/_/g, '/');
  const encodedBid = encodeURIComponent(cleanBid);
  const token      = localStorage.getItem('token');
  const authHeader = { Authorization: `Bearer ${token}` };

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
        try {
          const d = JSON.parse(localStorage.getItem(key));
          // Doc Prep annexures never appear here as an editable draft row —
          // once pushed, they're represented only by the real PDF copy that
          // "Push to My Docs" uploads (an 'uploaded' doc below), so showing
          // this localStorage draft too would duplicate the same document.
          if (d && d.source !== 'doc_prep_annexure') docs.push(d);
        } catch { /* ignore */ }
      }
    }
    docs.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    setWsDocs(docs);
  }, [tenderId]);

  const handleDeleteDraftedDoc = (doc) => {
    if (!window.confirm(`Delete "${doc.title || 'Untitled'}"? This cannot be undone.`)) return;
    localStorage.removeItem('docs_editor_' + doc.id);
    setWsDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  const handleRenameDraftedDoc = (doc) => {
    const newTitle = window.prompt('Rename document', doc.title || 'Untitled');
    if (newTitle === null) return;
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const key = 'docs_editor_' + doc.id;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw);
        data.title = trimmed;
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch { /* ignore */ }
    setWsDocs(prev => prev.map(d => d.id === doc.id ? { ...d, title: trimmed } : d));
  };

  // Drafted docs are edited elsewhere (the /Docs editor) — in this list they
  // behave like every other document: a "View" button that renders the
  // current content to PDF and opens it, never an "Open"-into-editor link.
  const [viewingDraftId, setViewingDraftId] = useState(null);
  const handleViewDraftedDoc = async (doc) => {
    setViewingDraftId(doc.id);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/export-pdf`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: doc.title, html_content: doc.content, bidNo: cleanBid }),
      });
      if (!res.ok) { alert('Failed to render document'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      alert('Failed to open document: ' + e.message);
    } finally {
      setViewingDraftId(null);
    }
  };

  // Same generated-doc pair Doc Prep's Download/Share buttons use — a
  // drafted document is just docs_editor_<id> content rendered via
  // export-pdf/export-docx (download) or export-share (email).
  const buildDraftFormats = (doc) => {
    const downloadAs = async (endpoint, ext) => {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${endpoint}`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: doc.title, html_content: doc.content, bidNo: cleanBid }),
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(doc.title || doc.name || 'Document').replace(/[^a-zA-Z0-9_\-]/g, '_')}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    };
    const shareAs = async (format, email) => {
      const res = await fetch(`${API_BASE_URL}/doc-prep/export-share`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: doc.title, html_content: doc.content, bidNo: cleanBid, format, email }),
      });
      return res.json();
    };
    return [
      { key: 'pdf', label: 'PDF', description: 'Formatted PDF document', icon: FileText, iconColor: '#dc2626',
        onDownload: () => downloadAs('export-pdf', 'pdf'), onShare: (email) => shareAs('pdf', email) },
      { key: 'word', label: 'Word', description: 'Editable .docx document', icon: FileIcon, iconColor: '#2563eb',
        onDownload: () => downloadAs('export-docx', 'docx'), onShare: (email) => shareAs('docx', email) },
    ];
  };

  // Same as WorkspaceDocPrep's buildUploadedDocFormats — a fixed-format file
  // as-is, plus a LibreOffice-converted PDF alongside it when it isn't one already.
  const buildUploadedDocFormats = (doc) => {
    const displayName = doc.file_name || doc.name || 'document';
    const ext = (displayName.split('.').pop() || '').toLowerCase();
    const isPdf = ext === 'pdf';
    const wordLike = ['doc', 'docx'].includes(ext);

    const fetchBlob = async (suffix) => {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${doc.id}${suffix}`, { headers: authHeader });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Download failed');
      }
      return res.blob();
    };
    const downloadOriginal = async () => {
      const blob = await fetchBlob('/download');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = displayName; a.click();
      URL.revokeObjectURL(url);
    };
    const downloadPdf = async () => {
      const blob = await fetchBlob('/pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = displayName.replace(/\.[^.]+$/, '') + '.pdf'; a.click();
      URL.revokeObjectURL(url);
    };
    const shareAs = async (format, email) => {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${doc.id}/share`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, format }),
      });
      return res.json();
    };

    if (isPdf) {
      return [{ key: 'pdf', label: 'PDF', icon: FileText, iconColor: '#dc2626', onDownload: downloadOriginal, onShare: (email) => shareAs('original', email) }];
    }
    return [
      { key: 'original', label: wordLike ? 'Word' : (ext ? ext.toUpperCase() : 'Original'), description: 'Original uploaded file',
        icon: FileIcon, iconColor: '#2563eb', onDownload: downloadOriginal, onShare: (email) => shareAs('original', email) },
      { key: 'pdf', label: 'PDF', description: 'Converted to PDF', icon: FileText, iconColor: '#dc2626',
        onDownload: downloadPdf, onShare: (email) => shareAs('pdf', email) },
    ];
  };

  // ── Uploaded documents (server-side, shown merged into My Documents below) ─
  const [uploadedDocs, setUploadedDocsRaw]    = useState([]);
  // Docs added via Doc Prep's own "Add Document" stage there first
  // (pushed_to_mydocs: false) until explicitly pushed to My Documents —
  // every server response can include those, so every setUploadedDocs call
  // (fetch, upload, delete, rename, merge…) goes through this same filter.
  const setUploadedDocs = (docs) => setUploadedDocsRaw((docs || []).filter(d => d.pushed_to_mydocs !== false));
  const [loadingUploaded, setLoadingUploaded] = useState(true);
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  // Only needed to locate the tender's own checklist annexure (type
  // 'tender_checklist') so a merge can tell which zipItem to swap for the
  // freshly page-numbered checklist PDF — see handleMergeFiles.
  const [annexures, setAnnexures] = useState([]);

  const fetchUploadedDocs = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/session`, { headers: authHeader });
      const json = await res.json();
      if (json.success) {
        setUploadedDocs(json.data.uploaded_docs || []);
        setAnnexures(json.data.annexures || []);
      }
    } catch (e) {
      console.error('[my-docs] fetchUploadedDocs:', e);
    } finally {
      setLoadingUploaded(false);
    }
  }, [encodedBid]);

  useEffect(() => { fetchUploadedDocs(); }, [fetchUploadedDocs]);

  const [renamingDocId, setRenamingDocId] = useState(null);
  const handleRenameUploadedDoc = async (doc) => {
    const newName = window.prompt('Rename document', doc.name);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    setRenamingDocId(doc.id);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${doc.id}`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (json.success) setUploadedDocs(json.uploaded_docs || []);
      else alert(json.message || 'Rename failed');
    } catch (e) {
      alert('Rename failed: ' + e.message);
    } finally {
      setRenamingDocId(null);
    }
  };

  // If the deleted upload was pushed from a Doc Prep annexure (Auto Fill,
  // AI Drive match, or Library match), clear that annexure's "pushed" flag so
  // Doc Prep offers Auto Fill / Push to My Docs for it again instead of
  // showing it as already completed — otherwise there'd be no way back to
  // regenerate a document whose only copy was just deleted here.
  const clearDocPrepPushedFlag = (doc) => {
    if (!doc.annexure_id) return;
    const tidNorm = (tenderId || '').replace(/[^a-zA-Z0-9]/g, '_');
    const mapKey = doc.push_source === 'drive'   ? `doc_prep_drive_pushed_${tidNorm}`
                 : doc.push_source === 'library' ? `doc_prep_library_pushed_${tidNorm}`
                 : `doc_prep_generated_${tidNorm}`;
    try {
      const raw = localStorage.getItem(mapKey);
      if (!raw) return;
      const map = JSON.parse(raw);
      if (!(doc.annexure_id in map)) return;
      if (doc.push_source === 'drive' || doc.push_source === 'library') {
        delete map[doc.annexure_id];
      } else {
        const entry = map[doc.annexure_id];
        map[doc.annexure_id] = { ...entry, pushed: false };
        // The Docs editor decides whether to re-push purely from its OWN
        // localStorage record's pushedToMyDocs flag — without also resetting
        // that record here, deleting the uploaded copy and clicking "Push to
        // My Docs" again in the editor silently no-ops (it still thinks it's
        // already pushed) instead of re-rendering and re-uploading.
        if (entry?.docId) {
          try {
            const docRaw = localStorage.getItem('docs_editor_' + entry.docId);
            if (docRaw) {
              const docRecord = JSON.parse(docRaw);
              docRecord.pushedToMyDocs = false;
              localStorage.setItem('docs_editor_' + entry.docId, JSON.stringify(docRecord));
            }
          } catch { /* ignore */ }
        }
      }
      localStorage.setItem(mapKey, JSON.stringify(map));
    } catch { /* ignore */ }
  };

  const [deletingDocId, setDeletingDocId] = useState(null);
  const handleDeleteUploadedDoc = async (doc) => {
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    setDeletingDocId(doc.id);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${doc.id}`, {
        method: 'DELETE', headers: authHeader,
      });
      const json = await res.json();
      if (json.success) {
        setUploadedDocs(json.uploaded_docs || []);
        clearDocPrepPushedFlag(doc);
      } else {
        alert(json.message || 'Delete failed');
      }
    } catch (e) {
      alert('Delete failed: ' + e.message);
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleViewUserDoc = async (doc) => {
    setDownloadingDocId(doc.id);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${doc.id}/download`, { headers: authHeader });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to open document');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      alert('Failed to open document: ' + e.message);
    } finally {
      setDownloadingDocId(null);
    }
  };

  // ── Download-as-ZIP order picker (drag to reorder) — now covers everything
  //    in "My Documents": AI-drafted docs (rendered to PDF) AND uploaded/
  //    library-imported docs (raw file bytes), bundled into one ZIP. ────────
  const [showZipModal, setShowZipModal]     = useState(false);
  const [zipItems, setZipItems]             = useState([]);
  const [draggedZipIdx, setDraggedZipIdx]   = useState(null);
  const [downloadingZip, setDownloadingZip] = useState(false); // true while the merge itself is running
  // Set once "Merge File" has actually merged + pushed to Uploaded — holds the
  // bytes so "Download PDF" (disabled until then) doesn't have to re-merge.
  const [mergedResult, setMergedResult]     = useState(null); // { bytes, name } | null

  const toZipItem = ({ type, doc }) => (
    type === 'draft'
      ? { type: 'draft', id: doc.id, name: doc.title || 'Untitled', sub: doc.savedAt ? new Date(doc.savedAt).toLocaleDateString() : '' }
      : { type: 'uploaded', id: doc.id, name: doc.name, sub: doc.file_name || '' }
  );

  const handleOpenZipModal = () => {
    // Seed the ZIP order from the main list's current (drag-reordered) order,
    // so the two stay consistent instead of always resetting to draft-then-
    // uploaded.
    setZipItems(combinedDocs.map(toZipItem));
    setMergedResult(null);
    setShowZipModal(true);
  };

  // ── Select mode — checkbox-pick a subset of the list, then "Merge Files"
  //    opens the same drag-to-reorder ZIP modal, seeded with only the picked
  //    documents (in their current list order). ─────────────────────────────
  const [selectMode, setSelectMode]     = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    setSelectedKeys(new Set());
  };

  const toggleSelectDoc = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedKeys(prev =>
      prev.size === filteredDocs.length ? new Set() : new Set(filteredDocs.map(d => d.key))
    );
  };

  const handleOpenMergeModal = () => {
    const picked = filteredDocs.filter(d => selectedKeys.has(d.key));
    if (!picked.length) return;
    setZipItems(picked.map(toZipItem));
    setMergedResult(null);
    setShowZipModal(true);
    setSelectMode(false);
    setSelectedKeys(new Set());
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
    // Reordering after a merge would make the already-merged bytes stale.
    setMergedResult(null);
  };

  // Step 1: "Merge File" — merges every item into one PDF and pushes it to
  // Uploaded. Doesn't download; just stores the bytes so "Download PDF" (below,
  // disabled until this runs) can serve them without merging a second time.
  const handleMergeFiles = async () => {
    setDownloadingZip(true);
    try {
      const safeBid = cleanBid.replace(/[^a-zA-Z0-9_\-]/g, '_');

      // The tender's own checklist gets its Page No. column filled in and
      // baked directly into the merge, automatically — no separate document
      // to manage, no manual step. Recomputed here first, against the exact
      // order about to be merged, so the numbers are always right for THIS
      // merge specifically.
      const checklistAnnexureId = annexures.find(a => a.type === 'tender_checklist')?.id || null;
      const checklistDocId = checklistAnnexureId
        ? uploadedDocs.find(d => d.annexure_id === checklistAnnexureId)?.id || null
        : null;
      const mergeOrderIds = zipItems.filter(i => i.type === 'uploaded').map(i => i.id);
      let filledChecklistBuf = null;
      if (checklistDocId && mergeOrderIds.length) {
        try {
          const clRes = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/checklist/render-pdf`, {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: mergeOrderIds }),
          });
          if (clRes.ok) filledChecklistBuf = await clRes.arrayBuffer();
        } catch { /* fall back to the original (blank) checklist page below */ }
      }

      // Fetch each selected document as PDF bytes (drafted docs rendered via
      // export-pdf, uploaded/library ones converted server-side via
      // LibreOffice), in the order the user arranged them. Kept alongside
      // the source item (not just the raw bytes) so the page range each one
      // ends up occupying in the merged output can be recorded below.
      const buffered = [];
      for (const item of zipItems) {
        if (item.type === 'draft') {
          const doc = wsDocs.find(d => d.id === item.id);
          if (!doc) continue;
          const res = await fetch(`${API_BASE_URL}/doc-prep/export-pdf`, {
            method:  'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ title: doc.title, html_content: doc.content, bidNo: cleanBid }),
          });
          if (!res.ok) throw new Error(`Failed to render "${doc.title || 'Untitled'}" to PDF`);
          buffered.push({ item, buf: await res.arrayBuffer() });
          continue;
        }

        if (filledChecklistBuf && item.id === checklistDocId) {
          buffered.push({ item, buf: filledChecklistBuf });
          continue;
        }

        const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${item.id}/pdf`, { headers: authHeader });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Failed to convert "${item.name}" to PDF`);
        }
        buffered.push({ item, buf: await res.arrayBuffer() });
      }

      if (!buffered.length) throw new Error('Nothing to merge.');

      // Merge every PDF's pages, in order, into a single combined document —
      // and record which 1-based page range each source item ended up at,
      // so the merged-document page editor (and the checklist) can later
      // tell which pages belong to which source document.
      const mergedPdf = await PDFDocument.create();
      const pageMap = [];
      let cursor = 1;
      for (const { item, buf } of buffered) {
        const src = await PDFDocument.load(buf);
        const pages = await mergedPdf.copyPages(src, src.getPageIndices());
        pages.forEach(p => mergedPdf.addPage(p));
        if (item.type === 'uploaded' && pages.length) {
          pageMap.push({ docId: item.id, start: cursor, end: cursor + pages.length - 1 });
        }
        cursor += pages.length;
      }

      // Stamp sequential page numbers (1, 2, 3…) across the whole merged
      // document — each source file keeps whatever content it already had;
      // this is numbering the combined output as one continuous PDF. Centered
      // in the header (top of the page), not the footer.
      const numberFont = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
      const allPages = mergedPdf.getPages();
      allPages.forEach((page, i) => {
        const label = `${i + 1}`;
        const { width, height } = page.getSize();
        const fontSize = 16;
        const textWidth = numberFont.widthOfTextAtSize(label, fontSize);
        page.drawText(label, {
          x: width / 2 - textWidth / 2,
          y: height - 45,
          size: fontSize,
          font: numberFont,
          color: rgb(0.1, 0.1, 0.1),
        });
      });

      const mergedBytes = await mergedPdf.save();
      const mergedName  = `Merged_${safeBid}_${Date.now()}`;

      // Push the merged PDF into My Documents' Uploaded list — a merge
      // produces one real document for the workspace, not just a local
      // download.
      const mergedFile = new File([mergedBytes], `${mergedName}.pdf`, { type: 'application/pdf' });
      const fd = new FormData();
      fd.append('file', mergedFile);
      fd.append('name', mergedName);
      fd.append('description', `Merged from ${zipItems.length} document(s)`);
      fd.append('is_merged', 'true');
      fd.append('push_source', 'merged_output');
      fd.append('page_map', JSON.stringify(pageMap));
      const upRes  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, {
        method: 'POST', headers: authHeader, body: fd,
      });
      const upJson = await upRes.json();
      // The original source files are left exactly as they were — merging
      // only adds the new combined PDF (tagged is_merged, so it shows under
      // "Uploaded" only, not "All") — it never removes the files it was
      // built from. This new merge REPLACES any previous merged output
      // server-side (only one current merged file at a time), so re-merging
      // after a reorder updates the same slot instead of piling up copies.
      if (upJson.success) setUploadedDocs(upJson.uploaded_docs || []);
      else alert(upJson.message || 'Merged PDF could not be saved to Uploaded.');

      if (mergeOrderIds.length) checklistOrderSigRef.current = mergeOrderIds.join(',');

      setMergedResult({ bytes: mergedBytes, name: mergedName });
    } catch (e) {
      alert('Merge failed: ' + e.message);
    } finally {
      setDownloadingZip(false);
    }
  };

  // Step 2: "Download PDF" — only enabled once handleMergeFiles has run;
  // just saves the already-merged bytes, no re-merging.
  const handleDownloadMergedPdf = () => {
    if (!mergedResult) return;
    const blob = new Blob([mergedResult.bytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${mergedResult.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setShowZipModal(false);
  };

  // Share side of the merged PDF — unlike the ZIP (which never leaves the
  // browser), handleMergeFiles already pushed this exact PDF into Uploaded
  // server-side (push_source: 'merged_output'), so Share reuses the same
  // per-document share endpoint instead of re-uploading the bytes again.
  const shareMergedPdf = async (email) => {
    const mergedDoc = uploadedDocs.find(d => d.is_merged);
    if (!mergedDoc) return { success: false, message: 'Merge the files first.' };
    const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${mergedDoc.id}/share`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, format: 'original' }),
    });
    return res.json();
  };

  const buildMergedFormats = () => [{
    key: 'pdf', label: 'PDF', icon: Archive, iconColor: '#166534',
    onDownload: async () => handleDownloadMergedPdf(),
    onShare: (email) => shareMergedPdf(email),
  }];

  // Select → "Push to Uploaded" — unlike "Merge Files" (combines everything
  // selected into one PDF), this pushes each selected draft individually:
  // render to PDF, upload as its own real file, same pattern Doc Prep's own
  // "Push to My Docs" buttons use elsewhere. Already-uploaded selections are
  // skipped (they're real files already).
  const [pushingBulk, setPushingBulk] = useState(false);
  const handleBulkPushToUploaded = async () => {
    const picked = filteredDocs.filter(d => selectedKeys.has(d.key) && d.type === 'draft');
    if (!picked.length) { alert('Select at least one draft document to push.'); return; }
    setPushingBulk(true);
    try {
      let latestUploaded = uploadedDocs;
      const failed = [];
      for (const { doc } of picked) {
        try {
          const res = await fetch(`${API_BASE_URL}/doc-prep/export-pdf`, {
            method:  'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ title: doc.title, html_content: doc.content, bidNo: cleanBid }),
          });
          if (!res.ok) { failed.push(doc.title || 'Untitled'); continue; }
          const blob = await res.blob();
          const safeName = (doc.title || 'Document').replace(/[^a-zA-Z0-9_\-]/g, '_');
          const pdfFile = new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
          const fd = new FormData();
          fd.append('file', pdfFile);
          fd.append('name', doc.title || 'Document');
          fd.append('description', 'Pushed from My Documents');
          const upRes  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, {
            method: 'POST', headers: authHeader, body: fd,
          });
          const upJson = await upRes.json();
          if (upJson.success) latestUploaded = upJson.uploaded_docs || latestUploaded;
          else failed.push(doc.title || 'Untitled');
        } catch {
          failed.push(doc.title || 'Untitled');
        }
      }
      setUploadedDocs(latestUploaded);
      setSelectMode(false);
      setSelectedKeys(new Set());
      if (failed.length) alert(`Pushed, but failed for: ${failed.join(', ')}`);
    } finally {
      setPushingBulk(false);
    }
  };

  // ── Download as ZIP — each document kept as its own file inside the
  //    archive (no merging), unlike "Merge to PDF" above. ────────────────────
  const [downloadingArchive, setDownloadingArchive] = useState(false);

  // Pulled out of handleDownloadAsZipArchive so Share (which needs the same
  // bytes sent to the backend instead of saved locally) doesn't duplicate the
  // assembly logic — the ZIP only ever exists client-side, nothing server-side
  // to re-fetch from.
  const buildZipBlob = async (docsToZip) => {
    if (!docsToZip.length) throw new Error('Nothing selected to zip.');
    const zip = new JSZip();
    const usedNames = new Set();
    const uniqueName = (base, ext) => {
      let name = `${base}${ext}`;
      let i = 2;
      while (usedNames.has(name)) { name = `${base} (${i})${ext}`; i += 1; }
      usedNames.add(name);
      return name;
    };

    for (const { type, doc } of docsToZip) {
      if (type === 'draft') {
        const res = await fetch(`${API_BASE_URL}/doc-prep/export-pdf`, {
          method:  'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title: doc.title, html_content: doc.content, bidNo: cleanBid }),
        });
        if (!res.ok) throw new Error(`Failed to render "${doc.title || 'Untitled'}" to PDF`);
        const buf = await res.arrayBuffer();
        zip.file(uniqueName((doc.title || 'Untitled').replace(/[^a-zA-Z0-9_\- ]/g, '_'), '.pdf'), buf);
        continue;
      }
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${doc.id}/download`, { headers: authHeader });
      if (!res.ok) throw new Error(`Failed to fetch "${doc.name}"`);
      const buf = await res.arrayBuffer();
      const ext = (doc.file_name && doc.file_name.includes('.')) ? doc.file_name.slice(doc.file_name.lastIndexOf('.')) : '.pdf';
      zip.file(uniqueName((doc.name || 'Document').replace(/[^a-zA-Z0-9_\- ]/g, '_'), ext), buf);
    }

    return zip.generateAsync({ type: 'blob' });
  };

  const handleDownloadAsZipArchive = async (docsToZip) => {
    if (!docsToZip.length) return;
    setDownloadingArchive(true);
    try {
      const blob = await buildZipBlob(docsToZip);
      const safeBid = cleanBid.replace(/[^a-zA-Z0-9_\-]/g, '_');
      saveAs(blob, `${safeBid}_documents.zip`);
    } catch (e) {
      alert('ZIP download failed: ' + e.message);
    } finally {
      setDownloadingArchive(false);
    }
  };

  // Share side of the ZIP button — the archive only ever exists in the
  // browser, so this uploads the same bytes to a generic "email this blob"
  // endpoint instead of re-deriving anything server-side.
  const shareZipArchive = async (docsToZip, email) => {
    const blob = await buildZipBlob(docsToZip);
    const safeBid = cleanBid.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `${safeBid}_documents.zip`;
    const fd = new FormData();
    fd.append('file', blob, filename);
    fd.append('email', email);
    fd.append('filename', filename);
    const res = await fetch(`${API_BASE_URL}/doc-prep/share-blob`, { method: 'POST', headers: authHeader, body: fd });
    return res.json();
  };

  const buildZipFormats = (docsToZip) => [{
    key: 'zip', label: 'ZIP', icon: Archive, iconColor: '#7c3aed',
    onDownload: () => handleDownloadAsZipArchive(docsToZip),
    onShare: (email) => shareZipArchive(docsToZip, email),
  }];

  const tidNorm = (tenderId || '').replace(/[^a-zA-Z0-9]/g, '_');
  const totalDocs = wsDocs.length + uploadedDocs.length;

  // ── Row order for the main list — persisted per-workspace so a drag stays
  //    put across reloads. New docs (just drafted/uploaded/imported) are
  //    appended at the end rather than resetting the order. ─────────────────
  const docOrderKey = `my_docs_order_${tidNorm}`;
  const [docOrder, setDocOrder] = useState([]);
  const [draggedDocIdx, setDraggedDocIdx] = useState(null);

  useEffect(() => {
    let stored = [];
    try { stored = JSON.parse(localStorage.getItem(docOrderKey) || '[]'); } catch { /* ignore */ }
    const allKeys = [
      ...wsDocs.map(d => `draft_${d.id}`),
      ...uploadedDocs.map(d => `up_${d.id}`),
    ];
    const kept = stored.filter(k => allKeys.includes(k));
    const missing = allKeys.filter(k => !kept.includes(k));
    setDocOrder([...kept, ...missing]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsDocs, uploadedDocs, docOrderKey]);

  // ── Checklist sync — the checklist's page-number column (edited in Doc
  //    Prep's Checklist tab) is only ever correct relative to THIS order, so
  //    every reorder (drag, or a doc added/removed) recomputes it server-side
  //    right away rather than waiting for an explicit "Generate Checklist"
  //    click. Real files only — a merge's own PDF output isn't itself a
  //    checklist target. Fire-and-forget: Doc Prep's Checklist tab re-fetches
  //    on its own, so a dropped request here isn't user-visible.
  const checklistOrderSigRef = useRef('');
  useEffect(() => {
    const orderedUploadedIds = docOrder
      .filter(k => k.startsWith('up_'))
      .map(k => k.slice(3))
      .filter(id => {
        const doc = uploadedDocs.find(d => d.id === id);
        return doc && !doc.is_merged;
      });
    if (!orderedUploadedIds.length) return;
    const sig = orderedUploadedIds.join(',');
    if (sig === checklistOrderSigRef.current) return;
    checklistOrderSigRef.current = sig;
    fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/checklist/recompute`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: orderedUploadedIds }),
    }).catch(() => { /* best effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docOrder, uploadedDocs]);

  const combinedDocs = docOrder
    .map(key => {
      if (key.startsWith('draft_')) {
        const doc = wsDocs.find(d => d.id === key.slice(6));
        return doc ? { key, type: 'draft', doc } : null;
      }
      const doc = uploadedDocs.find(d => d.id === key.slice(3));
      return doc ? { key, type: 'uploaded', doc } : null;
    })
    .filter(Boolean);

  // ── Filter — All / Uploaded, plus a name search ──────────────────────────
  // "All" is everything except merged-PDF outputs — the individual files a
  // merge was built from (plain uploads, pushed drafts, signed stamp-paper
  // scans, etc.) stay in "All" unchanged. "Uploaded" is reserved solely for
  // the output of the "Merge to PDF" feature (doc.is_merged) — nothing else
  // belongs there, regardless of how it was added.
  const [docFilter, setDocFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const filteredDocs = combinedDocs
    .filter(({ type, doc }) => {
      if (docFilter === 'all') return !(type === 'uploaded' && doc.is_merged);
      if (docFilter === 'uploaded') return type === 'uploaded' && doc.is_merged;
      return true;
    })
    .filter(({ type, doc }) => {
      if (!searchQuery.trim()) return true;
      const name = (type === 'draft' ? doc.title : doc.name) || '';
      return name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    });

  const handleDocDragStart = (idx) => setDraggedDocIdx(idx);
  const handleDocDragOver  = (e) => e.preventDefault();
  const handleDocDrop = (idx) => {
    if (draggedDocIdx === null || draggedDocIdx === idx) { setDraggedDocIdx(null); return; }
    setDocOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(draggedDocIdx, 1);
      next.splice(idx, 0, moved);
      try { localStorage.setItem(docOrderKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setDraggedDocIdx(null);
  };

  return (
    <>
      {/* My Documents — AI-drafted + uploaded/library-imported, merged */}
      <div style={styles.card}>
        <div style={styles.sectionHead}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} color="#2563eb" /> My Documents
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {selectMode ? (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#374151', fontWeight: 600, cursor: 'pointer', padding: '0.5rem 0.75rem' }}>
                  <input
                    type="checkbox"
                    checked={filteredDocs.length > 0 && selectedKeys.size === filteredDocs.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                  Select all ({selectedKeys.size}/{filteredDocs.length})
                </label>
                <button
                  onClick={handleOpenMergeModal}
                  disabled={selectedKeys.size === 0}
                  style={{ ...styles.btnGreen, opacity: selectedKeys.size === 0 ? 0.5 : 1, cursor: selectedKeys.size === 0 ? 'not-allowed' : 'pointer' }}
                >
                  <Combine size={15} /> Merge Files
                </button>
                <button
                  onClick={handleBulkPushToUploaded}
                  disabled={selectedKeys.size === 0 || pushingBulk}
                  title="Push each selected document to Uploaded individually (no merging)"
                  style={{ ...styles.btnBlue, opacity: (selectedKeys.size === 0 || pushingBulk) ? 0.5 : 1, cursor: (selectedKeys.size === 0 || pushingBulk) ? 'not-allowed' : 'pointer' }}
                >
                  <Upload size={15} /> {pushingBulk ? 'Pushing…' : 'Push to Uploaded'}
                </button>
                <DownloadShareButtons
                  formats={buildZipFormats(filteredDocs.filter(d => selectedKeys.has(d.key)))}
                  downloadLabel="Download ZIP"
                  disabled={selectedKeys.size === 0}
                />
                <button onClick={toggleSelectMode} style={styles.btnGhost}>
                  <X size={15} /> Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={toggleSelectMode}
                  disabled={totalDocs === 0}
                  style={{ ...styles.btnGhost, opacity: totalDocs === 0 ? 0.5 : 1, cursor: totalDocs === 0 ? 'not-allowed' : 'pointer' }}
                  title="Pick specific documents to merge or zip"
                >
                  <CheckSquare size={15} /> Select
                </button>
                <button
                  onClick={handleOpenZipModal}
                  disabled={totalDocs === 0}
                  style={{ ...styles.btnGhost, opacity: totalDocs === 0 ? 0.5 : 1, cursor: totalDocs === 0 ? 'not-allowed' : 'pointer' }}
                  title={totalDocs === 0 ? 'No documents yet' : 'Choose order and merge into one PDF'}
                >
                  <Archive size={15} /> Merge to PDF
                </button>
                <DownloadShareButtons
                  formats={buildZipFormats(filteredDocs)}
                  downloadLabel="Download ZIP"
                  disabled={totalDocs === 0}
                  disabledTitle="No documents yet"
                />
              </>
            )}
          </div>
        </div>

        {totalDocs > 0 && (
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search documents by name…"
              style={{ ...styles.input, paddingLeft: '2.25rem' }}
            />
          </div>
        )}

        {totalDocs > 0 && (
          <div style={{
            display: 'flex', gap: 16, marginBottom: '1.25rem', background: '#fff',
            padding: 8, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb',
          }}>
            {[
              { id: 'all',      label: 'All',      count: combinedDocs.filter(d => !(d.type === 'uploaded' && d.doc.is_merged)).length },
              { id: 'uploaded', label: 'Uploaded', count: combinedDocs.filter(d => d.type === 'uploaded' && d.doc.is_merged).length },
            ].map(f => {
              const active = docFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setDocFilter(f.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    padding: '16px 32px', border: 'none', borderRadius: 12, cursor: 'pointer',
                    fontSize: 16, fontWeight: 700,
                    background: active ? 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)' : 'transparent',
                    color: active ? '#fff' : '#64748b',
                    boxShadow: active ? '0 4px 16px rgba(30,58,138,0.3)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {f.label}
                  <span style={{
                    fontSize: 13, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                    background: active ? 'rgba(255,255,255,0.22)' : '#e5e7eb',
                    color: active ? '#fff' : '#475569',
                  }}>
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {loadingUploaded ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>Loading…</p>
        ) : totalDocs === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#9ca3af' }}>
            <FileText size={40} color="#cbd5e1" style={{ marginBottom: 12 }} />
            <p style={{ margin: 0 }}>No documents yet for this workspace.</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>Add or push a document from a Doc Prep section, or draft one there.</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#9ca3af' }}>
            <p style={{ margin: 0 }}>No documents in this filter.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredDocs.map(({ key, type, doc }) => {
              const idx = combinedDocs.findIndex(d => d.key === key);
              const isAnnexure = type === 'draft' && doc.source === 'doc_prep_annexure';
              return (
              <div
                key={key}
                draggable={!selectMode}
                onDragStart={() => !selectMode && handleDocDragStart(idx)}
                onDragOver={!selectMode ? handleDocDragOver : undefined}
                onDrop={() => !selectMode && handleDocDrop(idx)}
                onClick={() => selectMode && toggleSelectDoc(key)}
                style={{
                  ...styles.row,
                  background: draggedDocIdx === idx ? '#eff6ff' : selectedKeys.has(key) ? '#eff6ff' : isAnnexure ? '#f0fdf4' : styles.row.background,
                  border: selectedKeys.has(key) ? '1px solid #93c5fd' : isAnnexure ? '1px solid #bbf7d0' : styles.row.border,
                  cursor: selectMode ? 'pointer' : 'grab',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  {selectMode ? (
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(key)}
                      onChange={() => toggleSelectDoc(key)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ cursor: 'pointer', flexShrink: 0 }}
                    />
                  ) : (
                    <GripVertical size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
                  )}
                  {type === 'draft' ? (
                    <>
                      <FileText size={18} color={isAnnexure ? '#166534' : '#2563eb'} style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.9rem', color: isAnnexure ? '#166534' : '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.title || 'Untitled'}
                          {isAnnexure && (
                            <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '0.1rem 0.5rem', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>
                              Annexure
                            </span>
                          )}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>Last saved: {formatIST(doc.savedAt)}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload size={18} color="#166534" style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
                        {doc.description && doc.description !== doc.name && <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>{doc.description}</p>}
                        {(doc.file_name && doc.file_name !== doc.name) || doc.from_library ? (
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>
                            {doc.file_name && doc.file_name !== doc.name ? doc.file_name : null}
                            {doc.file_name && doc.file_name !== doc.name && doc.from_library ? ' · ' : null}
                            {doc.from_library ? 'from Library' : null}
                          </p>
                        ) : null}
                        <p style={{ margin: '0.125rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                          {doc.modified_at ? `Modified: ${formatIST(doc.modified_at)}` : `${doc.generated_from ? 'Generated' : 'Uploaded'}: ${formatIST(doc.uploaded_at)}`}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, visibility: selectMode ? 'hidden' : 'visible' }}>
                  {type === 'draft' ? (
                    <>
                      <button
                        onClick={() => handleViewDraftedDoc(doc)}
                        disabled={viewingDraftId === doc.id}
                        style={styles.btnGreen}
                      >
                        <Eye size={14} /> {viewingDraftId === doc.id ? 'Opening…' : 'View'}
                      </button>
                      <DownloadShareButtons formats={buildDraftFormats(doc)} />
                      <button
                        onClick={() => handleRenameDraftedDoc(doc)}
                        title="Rename document"
                        style={{ background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.4rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteDraftedDoc(doc)}
                        title="Delete document"
                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '0.4rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      {doc.is_merged && (
                        <button
                          onClick={() => navigate(`/MergedPdf/${doc.id}`, { state: { bidNo: cleanBid, title: doc.name } })}
                          title="Reorder, remove, or annotate pages — saving replaces this merged document"
                          style={{ background: '#15803d', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.8125rem' }}
                        >
                          <LayoutGrid size={14} /> Edit Pages
                        </button>
                      )}
                      <button
                        onClick={() => handleViewUserDoc(doc)}
                        disabled={downloadingDocId === doc.id}
                        style={styles.btnGreen}
                      >
                        <Eye size={14} /> {downloadingDocId === doc.id ? 'Opening…' : 'View'}
                      </button>
                      <DownloadShareButtons formats={buildUploadedDocFormats(doc)} />
                      <button
                        onClick={() => handleRenameUploadedDoc(doc)}
                        disabled={renamingDocId === doc.id}
                        title="Rename document"
                        style={{ background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.4rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteUploadedDoc(doc)}
                        disabled={deletingDocId === doc.id}
                        title="Delete document"
                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '0.4rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Merge-to-PDF order picker modal */}
      {showZipModal && (
        <div
          onClick={() => !downloadingZip && setShowZipModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '480px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>Merge into one PDF</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: '#6b7280' }}>
              Drag to reorder — every document is converted to PDF and combined into a single file in this order.
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
                onClick={handleMergeFiles}
                disabled={downloadingZip || zipItems.length === 0}
                style={{ ...styles.btnGreen, opacity: (downloadingZip || zipItems.length === 0) ? 0.6 : 1, cursor: (downloadingZip || zipItems.length === 0) ? 'not-allowed' : 'pointer' }}
              >
                <Combine size={15} /> {downloadingZip ? 'Merging…' : mergedResult ? 'Re-merge' : 'Merge File'}
              </button>
              <DownloadShareButtons
                formats={buildMergedFormats()}
                downloadLabel="Download PDF"
                disabled={!mergedResult}
                disabledTitle='Click "Merge File" first'
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

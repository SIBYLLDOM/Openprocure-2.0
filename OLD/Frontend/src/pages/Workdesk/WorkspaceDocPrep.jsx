import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Wand2, Database, Download, Trash2, RefreshCw, CheckCircle, AlertCircle, Clock, Tag, Eye, Plus, X, FileSignature, Sparkles, ExternalLink, FolderOpen, File, Archive, GripVertical } from 'lucide-react';
import notaryHtml from '../../assets/data/notary.html?raw';
import atcHtml from '../../assets/data/ATC_Acceptance.html?raw';
import miiHtml from '../../assets/data/MII_Declaration.html?raw';
import oemHtml from '../../assets/data/OEM_Declaration.html?raw';
import warrantyHtml from '../../assets/data/Warranty_Declaration.html?raw';

// Standard fillable letters/declarations that exist as standalone HTML files
// (self-contained: their own toolbar, Date/etc. fields, Download Word/PDF
// buttons) rather than being AI-drafted. The AI discovers each tender's
// required annexures freely (no fixed catalogue — see runAnalysis in
// docPrep.controller.js), so "is this one of these documents" is a text
// match against whatever title/ref it assigned, not a lookup by stable id —
// each entry's `match` regex is checked against every AI-discovered annexure
// to decide whether to show a "required by this tender" or "not requested"
// pill, but the card itself always shows regardless (see STANDARD_FORMS use
// below), since the AI text-match can miss a differently-worded tender.
const STANDARD_FORMS = [
  {
    key: 'notary',
    title: 'Undertaking of Non-Blacklisting',
    buttonLabel: 'Open Undertaking Form',
    match: /non[\s-]?black[\s-]?listing/i,
    html: notaryHtml,
  },
  {
    key: 'atc',
    title: 'ATC Acceptance',
    buttonLabel: 'Open ATC Acceptance Form',
    match: /\batc\b/i,
    html: atcHtml,
  },
  {
    key: 'mii',
    title: 'Make in India (MII) & Local Content Declaration',
    buttonLabel: 'Open MII Declaration Form',
    match: /make\s*in\s*india|\bmii\b|local\s*content/i,
    html: miiHtml,
  },
  {
    key: 'oem',
    title: 'Letter for OEM Declaration',
    buttonLabel: 'Open OEM Declaration Form',
    match: /\boem\b/i,
    html: oemHtml,
  },
  {
    key: 'warranty',
    title: 'Warranty Declaration',
    buttonLabel: 'Open Warranty Declaration Form',
    match: /warrant/i,
    html: warrantyHtml,
  },
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const CATEGORY_STYLE = {
  letter:      { bg: '#dbeafe', text: '#1e40af', label: 'Letter' },
  certificate: { bg: '#dcfce7', text: '#166534', label: 'Certificate' },
};

const DEPT_STYLE = {
  financial:    { bg: '#fce7f3', text: '#9d174d' },
  tender_admin: { bg: '#fef3c7', text: '#92400e' },
  technical:    { bg: '#f0fdf4', text: '#15803d' },
  legal:        { bg: '#f3e8ff', text: '#6b21a8' },
  hr:           { bg: '#e0f2fe', text: '#0369a1' },
  other:        { bg: '#f1f5f9', text: '#475569' },
};

const DOC_TYPE_OPTIONS = [
  { value: 'certificate',     label: 'Certificate' },
  { value: 'registration',    label: 'Registration' },
  { value: 'affidavit',       label: 'Affidavit' },
  { value: 'authorization',   label: 'Authorization' },
  { value: 'past_submission', label: 'Past Submission' },
  { value: 'other',           label: 'Other' },
];

export default function WorkspaceDocPrep({ tenderId }) {
  const cleanBid    = (tenderId || '').replace(/_/g, '/');
  const encodedBid  = encodeURIComponent(cleanBid);
  const token       = localStorage.getItem('token');
  const authHeader  = { Authorization: `Bearer ${token}` };
  const navigate    = useNavigate();

  const [activePanel, setActivePanel] = useState('annexures');

  // ── Annexure state ──────────────────────────────────────────────────────────
  const [session, setSession]                 = useState(null);
  const [loadingSession, setLoadingSession]   = useState(true);
  const [uploadingBid, setUploadingBid]       = useState(false);
  const [selectedAnnexure, setSelectedAnnexure] = useState(null);
  const pollRef = useRef(null);

  // Opens one of the standalone STANDARD_FORMS documents in its own tab (a
  // real top-level browsing context) rather than an embedded iframe/modal —
  // each file's own toolbar (Date/etc. inputs, Download Word/PDF buttons)
  // and print layout only render correctly with the page to themselves.
  const handleOpenStandaloneForm = (html) => {
    // Give the popped-out file the real API base URL + auth token so its own
    // "Download PDF" button (backend Puppeteer render) can call the API —
    // every doc-prep route requires auth, and this file has no other way to
    // get a token since it runs in its own detached tab, not this app's JS.
    const htmlWithConfig = html.replace(
      '<head>',
      `<head>\n<script>window.__API_BASE_URL__ = ${JSON.stringify(API_BASE_URL)}; window.__AUTH_TOKEN__ = ${JSON.stringify(token)};</script>`
    );
    const blob = new Blob([htmlWithConfig], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  // ── Additional docs state ───────────────────────────────────────────────────
  const [additionalDocs, setAdditionalDocs]         = useState([]);
  const [uploadingAdditional, setUploadingAdditional] = useState(false);
  const [addDocLabel, setAddDocLabel]               = useState('ATC');

  // ── Auto-detected docs pending review ───────────────────────────────────────
  const [detectedDocs, setDetectedDocs]     = useState([]);
  const [resolvingDetected, setResolvingDetected] = useState({}); // docId -> true while accept/reject in flight

  // ── User-uploaded reference documents (any file type, download-only) ────────
  const [uploadedDocs, setUploadedDocs]       = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile]           = useState(null);
  const [uploadName, setUploadName]           = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isUploadingDoc, setIsUploadingDoc]   = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState(null);

  // ── Download-as-ZIP order picker ────────────────────────────────────────────
  const [showZipModal, setShowZipModal] = useState(false);
  const [zipItems, setZipItems]         = useState([]); // [{ type, id, name, sub }], in download order
  const [draggedZipIdx, setDraggedZipIdx] = useState(null);

  // ── ZIP extraction state ────────────────────────────────────────────────────
  const [extractedFiles, setExtractedFiles]         = useState([]);
  const [fileRoles, setFileRoles]                   = useState({});   // path → 'bid_doc' | 'additional' | 'ignore'
  const [fileLabels, setFileLabels]                 = useState({});   // path → label string
  const [isAssigning, setIsAssigning]               = useState(false);

  // ── Auto Fill state ─────────────────────────────────────────────────────────
  const [filledContent, setFilledContent]     = useState('');
  const [isFilling, setIsFilling]             = useState(false);
  const [isSaving, setIsSaving]               = useState(false);
  const [suggestions, setSuggestions]         = useState([]);
  const [isSuggesting, setIsSuggesting]       = useState(false);
  const [fillAnnexure, setFillAnnexure]       = useState(null);

  // ── Document Editor (Claude draft) state ───────────────────────────────────
  const [editorContent, setEditorContent]   = useState('');
  const [isDrafting, setIsDrafting]         = useState(false);
  const [draftAnnexure, setDraftAnnexure]   = useState(null);
  const [isExporting, setIsExporting]       = useState(false);
  const [isSavingDraft, setIsSavingDraft]   = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  // ── AI Drive state ──────────────────────────────────────────────────────────
  const [driveFiles, setDriveFiles]           = useState([]);
  const [loadingDrive, setLoadingDrive]       = useState(false);
  const [uploadingDrive, setUploadingDrive]   = useState(false);
  const [driveSearch, setDriveSearch]         = useState('');
  const [driveTypeFilter, setDriveTypeFilter] = useState('all');
  const [driveForm, setDriveForm]             = useState({ doc_type: 'certificate', description: '' });

  // ── Session / polling ───────────────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/session`, { headers: authHeader });
      const json = await res.json();
      if (json.success) {
        setSession(json.data);
        setAdditionalDocs(json.data.additional_docs || []);
        setDetectedDocs(json.data.detected_docs || []);
        setUploadedDocs(json.data.uploaded_docs || []);
        // Restore ZIP extraction state if user left mid-assignment
        const extracted = json.data.extracted_files || [];
        if (extracted.length > 0 && json.data.status === 'pending_selection') {
          setExtractedFiles(extracted);
          const initRoles  = {};
          const initLabels = {};
          extracted.forEach(f => {
            initRoles[f.path]  = 'ignore';
            initLabels[f.path] = f.basename;
          });
          setFileRoles(initRoles);
          setFileLabels(initLabels);
        } else {
          setExtractedFiles([]);
        }
      }
      return json.data;
    } catch (e) {
      console.error('[doc-prep] fetchSession:', e);
    }
  }, [encodedBid]);

  useEffect(() => {
    setLoadingSession(true);
    fetchSession().finally(() => setLoadingSession(false));
    // Re-fetch once after 4s to pick up GEM docs auto-detected in background
    const t = setTimeout(() => fetchSession(), 4000);
    return () => clearTimeout(t);
  }, [fetchSession]);

  // Poll while processing
  useEffect(() => {
    if (session?.status === 'processing') {
      pollRef.current = setInterval(async () => {
        const updated = await fetchSession();
        if (updated?.status !== 'processing') clearInterval(pollRef.current);
      }, 5000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [session?.status]);

  // ── Drive fetch ─────────────────────────────────────────────────────────────
  const fetchDrive = useCallback(async () => {
    setLoadingDrive(true);
    try {
      const params = new URLSearchParams();
      if (driveSearch)                       params.set('search', driveSearch);
      if (driveTypeFilter && driveTypeFilter !== 'all') params.set('doc_type', driveTypeFilter);
      const res  = await fetch(`${API_BASE_URL}/company-drive?${params}`, { headers: authHeader });
      const json = await res.json();
      if (json.success) setDriveFiles(json.data);
    } finally {
      setLoadingDrive(false);
    }
  }, [driveSearch, driveTypeFilter]);

  useEffect(() => { fetchDrive(); }, [fetchDrive]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleBidUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBid(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-bid`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const json = await res.json();
      if (!json.success) { alert(json.message); return; }

      if (json.isZip && json.extractedFiles?.length > 0) {
        // ZIP uploaded — show file assignment UI
        const files = json.extractedFiles;
        setExtractedFiles(files);
        const initRoles  = {};
        const initLabels = {};
        files.forEach(f => {
          initRoles[f.path]  = 'ignore';
          initLabels[f.path] = f.basename;
        });
        setFileRoles(initRoles);
        setFileLabels(initLabels);
        await fetchSession();
      } else {
        setExtractedFiles([]);
        await fetchSession();
      }
    } finally {
      setUploadingBid(false);
      e.target.value = '';
    }
  };

  const handleAssignFiles = async () => {
    const bidDocFile     = extractedFiles.find(f => fileRoles[f.path] === 'bid_doc');
    const additionalList = extractedFiles.filter(f => fileRoles[f.path] === 'additional');
    if (!bidDocFile) { alert('Please select one file as the Bid Document before confirming.'); return; }
    setIsAssigning(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/assign-extracted`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          bid_doc_path:     bidDocFile.path,
          additional_files: additionalList.map(f => ({ path: f.path, name: f.basename, label: fileLabels[f.path] || 'Additional' })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setExtractedFiles([]);
        setFileRoles({});
        setFileLabels({});
        await fetchSession();
      } else {
        alert(json.message);
      }
    } finally {
      setIsAssigning(false);
    }
  };

  const handleAdditionalUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAdditional(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_label', addDocLabel.trim() || 'Additional');
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-additional`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const json = await res.json();
      if (json.success) setAdditionalDocs(json.additional_docs || []);
      else alert(json.message);
    } finally {
      setUploadingAdditional(false);
      e.target.value = '';
    }
  };

  const handleDeleteAdditional = async (docId) => {
    const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/additional/${docId}`, {
      method: 'DELETE', headers: authHeader,
    });
    const json = await res.json();
    if (json.success) setAdditionalDocs(json.additional_docs || []);
  };

  const handleAcceptDetected = async (docId) => {
    setResolvingDetected(r => ({ ...r, [docId]: true }));
    try {
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/detected/${docId}/accept`, {
        method: 'POST', headers: authHeader,
      });
      const json = await res.json();
      if (json.success) {
        setAdditionalDocs(json.additional_docs || []);
        setDetectedDocs(json.detected_docs || []);
      } else {
        alert(json.message);
      }
    } finally {
      setResolvingDetected(r => { const { [docId]: _, ...rest } = r; return rest; });
    }
  };

  const handleRejectDetected = async (docId) => {
    setResolvingDetected(r => ({ ...r, [docId]: true }));
    try {
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/detected/${docId}/reject`, {
        method: 'POST', headers: authHeader,
      });
      const json = await res.json();
      if (json.success) setDetectedDocs(json.detected_docs || []);
      else alert(json.message);
    } finally {
      setResolvingDetected(r => { const { [docId]: _, ...rest } = r; return rest; });
    }
  };

  const handleRunAnalysis = async () => {
    const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/analyze`, {
      method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
    });
    const json = await res.json();
    if (json.success) fetchSession();
    else alert(json.message);
  };

  const [deletingAnnexureId, setDeletingAnnexureId] = useState(null);
  const handleDeleteAnnexure = async (annexureId) => {
    if (!window.confirm('Remove this annexure from the list? This can\'t be undone.')) return;
    setDeletingAnnexureId(annexureId);
    try {
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/annexure/${annexureId}`, {
        method: 'DELETE', headers: authHeader,
      });
      const json = await res.json();
      if (json.success) {
        setSession(s => s ? { ...s, annexures: json.annexures, formats: json.formats, filled_templates: json.filled_templates } : s);
      } else {
        alert(json.message || 'Failed to delete annexure');
      }
    } catch (e) {
      alert('Failed to delete annexure: ' + e.message);
    } finally {
      setDeletingAnnexureId(null);
    }
  };

  // AI Drive matched-document download — fetch+blob (not window.open) since
  // /company-drive/download requires an auth header the browser won't attach
  // to a plain window.open navigation.
  const [downloadingDriveDocId, setDownloadingDriveDocId] = useState(null);
  const handleDownloadDriveMatch = async (driveDocId, fallbackName) => {
    setDownloadingDriveDocId(driveDocId);
    try {
      const res = await fetch(`${API_BASE_URL}/company-drive/download/${driveDocId}`, { headers: authHeader });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = fallbackName || 'document';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloadingDriveDocId(null);
    }
  };

  const handleAutoFill = async (fmt) => {
    setFillAnnexure(fmt);
    setFilledContent('');
    setSuggestions([]);
    setActivePanel('autofill');
    setIsFilling(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/fill-template`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ annexure_id: fmt.id, verbatim_content: fmt.verbatim_content }),
      });
      const json = await res.json();
      if (json.success) setFilledContent(json.filled_content);
      else alert(json.message);
    } finally {
      setIsFilling(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!fillAnnexure || !filledContent) return;
    setIsSaving(true);
    try {
      await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/save-filled`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ annexure_id: fillAnnexure.id, filled_content: filledContent }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!fillAnnexure) return;
    window.open(`${API_BASE_URL}/doc-prep/${encodedBid}/download/${fillAnnexure.id}`, '_blank');
  };

  const handleGenerateDoc = async (annexureId, currentContent) => {
    const body = { annexure_id: annexureId };
    if (currentContent) body.filled_content = currentContent;
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/generate`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Generation failed');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${annexureId}_filled.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Generation failed: ' + e.message);
    }
  };

  const handleDraftWithOllama = async (annexure) => {
    setIsDrafting(true);
    setActivePanel('editor'); // show spinner while backend runs
    const verbatim = annexure.verbatim_content ||
      `[No prescribed format available]\n\nDocument: ${annexure.title}\nType: ${annexure.type || 'document'}\nRef: ${annexure.annexure_ref || ''}\n\nDraft a complete, professional document for this annexure based on the tender context.`;
    try {
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/draft-ollama`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ annexure_id: annexure.id, verbatim_content: verbatim }),
      });
      const json = await res.json();
      if (json.success) {
        // Build a stable docId for this tender+annexure
        const tidNorm = cleanBid.replace(/[^a-zA-Z0-9]/g, '_');
        const docId   = `docprep_${tidNorm}_${annexure.id}`;
        // Store in localStorage so DocsEditor can load it immediately
        localStorage.setItem('docs_editor_' + docId, JSON.stringify({
          id:      docId,
          title:   annexure.title || annexure.annexure_ref || 'Draft Document',
          content: json.html_content,
          bidNo:   cleanBid,
          savedAt: new Date().toISOString(),
        }));
        navigate(`/Docs/${docId}`, { state: { title: annexure.title || annexure.annexure_ref || 'Draft Document', bidNo: cleanBid } });
      } else {
        alert(json.message || 'Ollama draft failed');
        setActivePanel('annexures');
      }
    } catch (e) {
      alert('Draft failed: ' + e.message);
      setActivePanel('annexures');
    } finally {
      setIsDrafting(false);
    }
  };

  const handleExportPdf = async (htmlContent) => {
    if (!draftAnnexure) return;
    setIsExporting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/export-pdf`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ annexure_id: draftAnnexure.id, html_content: htmlContent }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'PDF export failed');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${draftAnnexure.annexure_ref || draftAnnexure.id}_filled.pdf`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportRich = async (htmlContent) => {
    if (!draftAnnexure) return;
    setIsExporting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/export-rich`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ annexure_id: draftAnnexure.id, html_content: htmlContent }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${draftAnnexure.annexure_ref || draftAnnexure.id}_filled.docx`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveDraftEditor = async () => {
    if (!draftAnnexure || !editorContent) return;
    setIsSavingDraft(true);
    try {
      await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/save-filled`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ annexure_id: draftAnnexure.id, filled_content: editorContent }),
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSuggestDrive = async () => {
    if (!fillAnnexure) return;
    setIsSuggesting(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/company-drive/suggest`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          annexure_title: fillAnnexure.title,
          annexure_type:  fillAnnexure.type,
          context:        filledContent.slice(0, 1000),
        }),
      });
      const json = await res.json();
      if (json.success) setSuggestions(json.data);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleDriveUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDrive(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', driveForm.doc_type);
      fd.append('description', driveForm.description);
      const res  = await fetch(`${API_BASE_URL}/company-drive/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const json = await res.json();
      if (json.success) { fetchDrive(); setDriveForm({ doc_type: 'certificate', description: '' }); }
      else alert(json.message);
    } finally {
      setUploadingDrive(false);
      e.target.value = '';
    }
  };

  const handleDeleteDrive = async (id) => {
    if (!window.confirm('Delete this document from the AI Drive?')) return;
    await fetch(`${API_BASE_URL}/company-drive/${id}`, { method: 'DELETE', headers: authHeader });
    fetchDrive();
  };

  // ── Download all documents as ZIP ───────────────────────────────────────────
  // Opens the ZIP order-picker modal, pre-populated with every filled/drafted
  // annexure plus every uploaded document, in that default order.
  const handleOpenZipModal = () => {
    const filledMap = typeof session?.filled_templates === 'string'
      ? JSON.parse(session.filled_templates || '{}')
      : (session?.filled_templates || {});
    const annexureItems = Object.keys(filledMap).map(id => {
      const fmt = formats.find(f => f.id === id);
      const ann = annexures.find(a => a.id === id);
      return {
        type: 'annexure',
        id,
        name: fmt?.title || ann?.title || fmt?.annexure_ref || ann?.annexure_ref || id,
        sub:  fmt?.annexure_ref || ann?.annexure_ref || '',
      };
    });
    const uploadedItems = uploadedDocs.map(doc => ({
      type: 'uploaded',
      id:   doc.id,
      name: doc.name,
      sub:  doc.file_name || '',
    }));
    setZipItems([...annexureItems, ...uploadedItems]);
    setShowZipModal(true);
  };

  // ── Drag-and-drop reordering (native HTML5 DnD, no extra dependency) ────────
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
      const res = await fetch(
        `${API_BASE_URL}/doc-prep/${encodedBid}/download-all-zip`,
        {
          method:  'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ items: zipItems.map(({ type, id }) => ({ type, id })) }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to generate ZIP');
        return;
      }
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      const safeBid  = cleanBid.replace(/[^a-zA-Z0-9_\-]/g, '_');
      a.download     = `${safeBid}_documents.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setShowZipModal(false);
    } catch (e) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloadingZip(false);
    }
  };

  // ── User-uploaded reference documents ───────────────────────────────────────
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
    // Auto-fill the name from the file's own name (minus extension), still editable.
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
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${doc.id}/download`, {
        headers: authHeader,
      });
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

  // ── Render helpers ──────────────────────────────────────────────────────────
  const formats  = session?.formats  || [];
  const annexures = session?.annexures || [];
  const driveMatches = session?.drive_matches || {};

  const renderAnnexurePanel = () => {
    if (loadingSession) return <div style={styles.centered}><div style={styles.spinner} /></div>;

    const status          = session?.status;
    const filledTemplates = session?.filled_templates || {};

    // Renders one category's annexure cards, grouped by department. Called
    // separately for 'letter', then 'certificate'/undefined, so the Uploaded
    // Documents section can be interleaved between them.
    const renderCategoryGroup = (cat) => {
      const group = annexures.filter(a =>
        cat === undefined ? !['letter','certificate'].includes(a.category) : a.category === cat
      );
      if (!group.length) return null;
      const catStyle = CATEGORY_STYLE[cat] || { bg: '#f1f5f9', text: '#475569', label: 'Other' };
      return (
        <div key={cat || 'other'} style={{ marginBottom: '1.5rem' }}>
          {/* Category header */}
          <div style={styles.categoryHeader(catStyle.bg, catStyle.text)}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{catStyle.label}</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{group.length} item{group.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Group by dept within this category */}
          {['financial','tender_admin','technical','legal','hr','other'].map(dept => {
            const deptGroup = group.filter(a => (a.dept || 'other') === dept);
            if (!deptGroup.length) return null;
            const deptColors = DEPT_STYLE[dept] || DEPT_STYLE.other;
            const deptLabel  = dept.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
            return (
              <div key={dept} style={{ marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: deptColors.text, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ ...styles.typePill(deptColors.bg, deptColors.text) }}>{deptLabel}</span>
                </p>
                <div style={styles.annexureGrid}>
                  {deptGroup.map(ann => {
                    const fmt = formats.find(f => f.id === ann.id);
                    return (
                      <div key={ann.id} style={styles.annexureCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            <span style={styles.typePill(catStyle.bg, catStyle.text)}>{catStyle.label}</span>
                            {ann.mandatory && <span style={styles.typePill('#fee2e2', '#991b1b')}>required</span>}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{ann.annexure_ref}</span>
                        </div>
                        <p style={{ margin: '0.5rem 0 0', fontWeight: 600, fontSize: '0.875rem', color: '#1f2937', lineHeight: 1.4 }}>
                          {ann.title}
                        </p>
                        {ann.page_hint && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>{ann.page_hint}</p>}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                          {fmt && (
                            <>
                              <button onClick={() => setSelectedAnnexure(selectedAnnexure?.id === ann.id ? null : { ...ann, ...fmt })} style={styles.ghostBtn}>
                                <Eye size={13} /> {selectedAnnexure?.id === ann.id ? 'Hide' : 'Preview'}
                              </button>
                              <button onClick={() => handleAutoFill({ ...ann, ...fmt })} style={styles.primaryBtnSm}>
                                <Wand2 size={13} /> Auto Fill
                              </button>
                            </>
                          )}
                          {ann.category !== 'certificate' && (
                            <button onClick={() => handleDraftWithOllama({ ...ann, ...(fmt || {}) })} style={{ ...styles.primaryBtnSm, background: '#7c3aed', color: '#fff' }}>
                              <Sparkles size={13} /> Draft with OpenProcure
                            </button>
                          )}
                          {filledTemplates[ann.id] && (
                            <button onClick={() => handleGenerateDoc(ann.id)} style={{ ...styles.primaryBtnSm, background: '#166534', color: '#fff' }}>
                              <Download size={13} /> Generate
                            </button>
                          )}
                          {!fmt && !driveMatches[ann.id] && ann.category === 'certificate' && (
                            <>
                              <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic', alignSelf: 'center' }}>No prescribed format</span>
                              <button
                                onClick={() => handleDeleteAnnexure(ann.id)}
                                disabled={deletingAnnexureId === ann.id}
                                style={{ ...styles.smallBtn, color: '#ef4444', border: '1px solid #fecaca' }}
                                title="Remove this annexure from the list"
                              >
                                <Trash2 size={13} /> {deletingAnnexureId === ann.id ? 'Removing…' : 'Delete'}
                              </button>
                            </>
                          )}
                        </div>
                        {/* AI Drive already has a document that satisfies this requirement —
                            no format to fill, so offer it as a ready-made download instead. */}
                        {!fmt && driveMatches[ann.id] && (
                          <div style={{ marginTop: '0.625rem', padding: '0.625rem 0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>
                              Found in AI Drive: {driveMatches[ann.id].doc_name}
                            </p>
                            {driveMatches[ann.id].reason && (
                              <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: '#4b5563' }}>{driveMatches[ann.id].reason}</p>
                            )}
                            <button
                              onClick={() => handleDownloadDriveMatch(driveMatches[ann.id].drive_doc_id, driveMatches[ann.id].doc_name)}
                              disabled={downloadingDriveDocId === driveMatches[ann.id].drive_doc_id}
                              style={{ ...styles.primaryBtnSm, background: '#166534', color: '#fff', marginTop: '0.5rem' }}
                            >
                              <Download size={13} /> {downloadingDriveDocId === driveMatches[ann.id].drive_doc_id ? 'Downloading…' : 'Download'}
                            </button>
                          </div>
                        )}
                        {selectedAnnexure?.id === ann.id && fmt && (
                          <pre style={styles.verbatimBox}>{fmt.verbatim_content}</pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div>
        {/* Bid doc status bar */}
        <div style={styles.statusBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={16} color="#2563eb" />
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Bid Document</span>
          </div>
          {session?.bid_doc_path
            ? <span style={styles.badge('#dcfce7', '#166534')}><CheckCircle size={12} /> Loaded</span>
            : <span style={styles.badge('#fef3c7', '#92400e')}><AlertCircle size={12} /> Not loaded</span>
          }
          {session?.gemPdfStatus === 'available' && session?.bid_doc_path &&
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Resolved from GEM database</span>
          }
        </div>

        {/* Standard fillable letters/declarations — only shown when the AI
            analysis actually detected this tender asking for them (text
            match against whatever title/ref it assigned). */}
        {STANDARD_FORMS.map(form => {
          const detected = (annexures || []).some(ann => form.match.test(`${ann?.title || ''} ${ann?.annexure_ref || ''}`));
          if (!detected) return null;
          return (
            <div key={form.key} style={{ ...styles.annexureCard, marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#1f2937' }}>{form.title}</p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>Standard fillable declaration — always available regardless of what this tender's document asks for.</p>
                </div>
                <span style={styles.typePill('#fee2e2', '#991b1b')}>required</span>
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <button onClick={() => handleOpenStandaloneForm(form.html)} style={{ ...styles.primaryBtnSm, background: '#166534', color: '#fff' }}>
                  <FileSignature size={13} /> {form.buttonLabel}
                </button>
              </div>
            </div>
          );
        })}

        {/* Auto-detected documents pending review — never enter analysis until resolved */}
        {detectedDocs.length > 0 && (
          <div style={styles.extractionBox}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <FolderOpen size={18} color="#d97706" />
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1f2937' }}>
                {detectedDocs.length} document{detectedDocs.length !== 1 ? 's' : ''} auto-detected for this tender
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Review before they're included in analysis.</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {detectedDocs.map(d => (
                <div key={d.id} style={styles.extractedFileRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                    <File size={14} color="#64748b" style={{ flexShrink: 0 }} />
                    <span style={styles.typePill('#fef3c7', '#92400e')}>{d.doc_label}</span>
                    <span style={{ fontSize: '0.8125rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name}>
                      {d.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      onClick={() => handleAcceptDetected(d.id)}
                      disabled={!!resolvingDetected[d.id]}
                      style={{ ...styles.smallBtn, background: '#166534', color: '#fff', border: '1px solid #166534', opacity: resolvingDetected[d.id] ? 0.6 : 1 }}
                    >
                      <CheckCircle size={13} /> Accept
                    </button>
                    <button
                      onClick={() => handleRejectDetected(d.id)}
                      disabled={!!resolvingDetected[d.id]}
                      style={{ ...styles.smallBtn, color: '#ef4444', border: '1px solid #fecaca', opacity: resolvingDetected[d.id] ? 0.6 : 1 }}
                    >
                      <X size={13} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.75rem', marginBottom: 0 }}>
              Found via links inside this tender's own bid document. Accept only what's genuinely specific to this tender — analysis is blocked until every item here is resolved.
            </p>
          </div>
        )}

        {/* ZIP extraction — file assignment UI */}
        {extractedFiles.length > 0 && (
          <div style={styles.extractionBox}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <FolderOpen size={18} color="#7c3aed" />
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1f2937' }}>
                ZIP extracted — {extractedFiles.length} file{extractedFiles.length !== 1 ? 's' : ''} found
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Assign a role to each file, then confirm.</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {extractedFiles.map(f => {
                const role  = fileRoles[f.path] || 'ignore';
                const label = fileLabels[f.path] || f.basename;
                const extBadge = EXT_BADGE[f.ext] || EXT_BADGE.default;
                return (
                  <div key={f.path} style={styles.extractedFileRow}>
                    {/* File icon + name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                      <File size={14} color="#64748b" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: '0.8125rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                        {f.basename}
                      </span>
                      <span style={{ ...styles.typePill(extBadge.bg, extBadge.text), flexShrink: 0 }}>{f.ext || 'file'}</span>
                      <span style={{ fontSize: '0.7rem', color: '#9ca3af', flexShrink: 0 }}>{formatBytes(f.size)}</span>
                    </div>

                    {/* Role selector */}
                    <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                      {[
                        { value: 'bid_doc',    label: 'Bid Doc',    color: '#2563eb' },
                        { value: 'additional', label: 'Additional', color: '#d97706' },
                        { value: 'ignore',     label: 'Ignore',     color: '#6b7280' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFileRoles(r => ({ ...r, [f.path]: opt.value }))}
                          style={{
                            padding: '0.25rem 0.625rem',
                            border: `1.5px solid ${role === opt.value ? opt.color : '#e2e8f0'}`,
                            borderRadius: '6px',
                            background: role === opt.value ? opt.color : '#fff',
                            color: role === opt.value ? '#fff' : '#374151',
                            fontSize: '0.75rem',
                            fontWeight: role === opt.value ? 700 : 400,
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Label input shown only for additional */}
                    {role === 'additional' && (
                      <input
                        value={label}
                        onChange={e => setFileLabels(l => ({ ...l, [f.path]: e.target.value }))}
                        placeholder="Label (e.g. ATC)"
                        style={{ ...styles.input, width: '130px', flexShrink: 0 }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button onClick={handleAssignFiles} disabled={isAssigning} style={styles.primaryBtn}>
                <CheckCircle size={15} /> {isAssigning ? 'Saving…' : 'Confirm Assignment'}
              </button>
              {!extractedFiles.some(f => fileRoles[f.path] === 'bid_doc') && (
                <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>Select one file as Bid Document to continue</span>
              )}
            </div>
          </div>
        )}

        {/* GEM needs scrape */}
        {session?.gemPdfStatus === 'needs_scrape' && !session?.bid_doc_path && (
          <div style={styles.alertBanner('#fef3c7', '#92400e')}>
            <AlertCircle size={16} />
            <span>Bid PDF not yet downloaded. Upload the PDF manually below, or trigger the GEM scraper first.</span>
          </div>
        )}

        {/* Upload zone */}
        {(!session?.bid_doc_path || session?.gemPdfStatus === 'not_found') && (
          <label style={styles.uploadZone}>
            <input type="file" style={{ display: 'none' }} onChange={handleBidUpload} disabled={uploadingBid} />
            <Upload size={32} color="#94a3b8" />
            <p style={{ margin: '0.5rem 0 0', fontWeight: 600, color: '#374151' }}>
              {uploadingBid ? 'Uploading…' : 'Upload Bid Document'}
            </p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>PDF, Word, Excel, ZIP or any file — click or drag & drop</p>
          </label>
        )}

        {/* Replace file option when already loaded */}
        {session?.bid_doc_path && (
          <label style={{ ...styles.smallBtn, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input type="file" style={{ display: 'none' }} onChange={handleBidUpload} />
            <Upload size={14} /> {uploadingBid ? 'Uploading…' : 'Replace File'}
          </label>
        )}

        {/* Additional Documents (ATC etc.) — show whenever bid doc is present */}
        {session?.bid_doc_path && (
          <div style={styles.additionalDocsBox}>
            <p style={{ margin: '0 0 0.75rem', fontWeight: 700, fontSize: '0.875rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={14} color="#d97706" /> Additional Documents
              <span style={styles.typePill('#fef3c7', '#92400e')}>ATC is priority</span>
            </p>

            {/* List of additional docs */}
            {additionalDocs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                {additionalDocs.map(doc => {
                  const isAtc = /atc/i.test(doc.doc_label);
                  const isGem = doc.source === 'gem';
                  return (
                    <div key={doc.id} style={styles.additionalDocRow}>
                      <span style={styles.typePill(
                        isAtc ? '#fef3c7' : '#e0f2fe',
                        isAtc ? '#92400e' : '#0369a1'
                      )}>{doc.doc_label}</span>
                      {isGem && <span style={styles.typePill('#f0fdf4', '#15803d')}>Auto</span>}
                      <span style={{ fontSize: '0.8125rem', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                      <button onClick={() => handleDeleteAdditional(doc.id)} style={{ ...styles.iconBtn, color: '#ef4444' }} title="Remove">
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Upload zone for additional docs */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={addDocLabel}
                onChange={e => setAddDocLabel(e.target.value)}
                placeholder="Label (e.g. ATC)"
                style={{ ...styles.input, width: '130px', flex: 'none' }}
              />
              <label style={{ ...styles.smallBtn, cursor: uploadingAdditional ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                <input type="file" style={{ display: 'none' }} onChange={handleAdditionalUpload} disabled={uploadingAdditional} />
                <Plus size={13} /> {uploadingAdditional ? 'Uploading…' : 'Add Document'}
              </label>
            </div>
          </div>
        )}

        {/* Run analysis — blocked while auto-detected docs await review */}
        {session?.bid_doc_path && detectedDocs.length > 0 && (status === 'idle' || status === 'error' || !status) && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={styles.alertBanner('#fffbeb', '#92400e')}>
              <AlertCircle size={14} />
              Resolve the {detectedDocs.length} detected document{detectedDocs.length !== 1 ? 's' : ''} above (Accept or Reject) before running analysis.
            </div>
          </div>
        )}

        {session?.bid_doc_path && detectedDocs.length === 0 && (status === 'idle' || status === 'error' || !status) && (
          <div style={{ marginTop: '1.5rem' }}>
            {status === 'error' && (
              <div style={styles.alertBanner('#fee2e2', '#991b1b')}>
                <AlertCircle size={14} /> Analysis failed: {session?.processing_log}
              </div>
            )}
            <button onClick={handleRunAnalysis} style={styles.primaryBtn}>
              <Wand2 size={16} />
              {additionalDocs.length > 0
                ? `Run Analysis (BD + ${additionalDocs.length} additional doc${additionalDocs.length > 1 ? 's' : ''})`
                : 'Run Document Analysis'}
            </button>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
              AI will extract all annexures, affidavits, and formats{additionalDocs.length > 0 ? ` from all ${1 + additionalDocs.length} documents` : ''}. Estimated time: 2–10 min.
            </p>
          </div>
        )}

        {/* Processing */}
        {status === 'processing' && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={styles.progressBar}>
              <div style={styles.progressFill} />
            </div>
            <p style={{ fontSize: '0.8125rem', color: '#374151', marginTop: '0.75rem' }}>
              <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
              {session?.processing_log || 'Processing…'}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Polling for updates every 5 seconds…</p>
          </div>
        )}

        {/* Results */}
        {status === 'done' && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>
                {annexures.length} Annexures Found
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {(() => {
                  const filledCount = Object.keys(typeof session?.filled_templates === 'string' ? JSON.parse(session?.filled_templates || '{}') : (session?.filled_templates || {})).length;
                  const hasZippableDocs = filledCount > 0 || uploadedDocs.length > 0;
                  return (
                    <button
                      onClick={handleOpenZipModal}
                      disabled={downloadingZip || !hasZippableDocs}
                      style={{
                        ...styles.smallBtn,
                        background: downloadingZip ? '#e0f2fe' : '#1e40af',
                        color: downloadingZip ? '#0369a1' : '#fff',
                        border: '1px solid #1e40af',
                        opacity: hasZippableDocs ? 1 : 0.45,
                        cursor: hasZippableDocs ? 'pointer' : 'not-allowed',
                        fontWeight: 600,
                        gap: '0.375rem',
                      }}
                      title={hasZippableDocs ? 'Choose which documents go in the ZIP and in what order' : 'Fill, draft, or upload at least one document first'}
                    >
                      <Archive size={13} />
                      {downloadingZip ? 'Preparing ZIP…' : 'Download as ZIP'}
                    </button>
                  );
                })()}
                <button onClick={handleOpenUploadModal} style={styles.smallBtn}>
                  <Upload size={13} /> Upload Document
                </button>
                <button onClick={handleRunAnalysis} style={styles.smallBtn}>
                  <RefreshCw size={13} /> Re-analyze
                </button>
              </div>
            </div>
            {additionalDocs.length > 0 && (
              <p style={{ margin: '0 0 1rem', fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.375rem 0.75rem', borderRadius: '6px', display: 'inline-block' }}>
                Analysis based on: Bid Document + {additionalDocs.map(d => d.doc_label).join(', ')}
              </p>
            )}

            {/* Group annexures by category → Letter, Certificate */}
            {renderCategoryGroup('letter')}

            {/* User-uploaded reference documents — shown between Letter and Certificate,
                but never analyzed/drafted; download only. */}
            {uploadedDocs.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={styles.categoryHeader('#f1f5f9', '#475569')}>
                  <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Uploaded Documents</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{uploadedDocs.length} item{uploadedDocs.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={styles.annexureGrid}>
                  {uploadedDocs.map(doc => (
                    <div key={doc.id} style={styles.annexureCard}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#1f2937', lineHeight: 1.4 }}>
                        {doc.name}
                      </p>
                      {doc.description && (
                        <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>{doc.description}</p>
                      )}
                      <p style={{ margin: '0.375rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>{doc.file_name}</p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleDownloadUserDoc(doc)}
                          disabled={downloadingDocId === doc.id}
                          style={{ ...styles.primaryBtnSm, background: '#166534', color: '#fff' }}
                        >
                          <Download size={13} /> {downloadingDocId === doc.id ? 'Downloading…' : 'Download'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certificate + any uncategorized annexures */}
            {renderCategoryGroup('certificate')}
            {renderCategoryGroup(undefined)}
          </div>
        )}
      </div>
    );
  };

  const renderAutoFillPanel = () => {
    const fmtList = formats.filter(f => f.verbatim_content);
    return (
      <div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={styles.label}>Select Format to Fill</label>
          <select
            value={fillAnnexure?.id || ''}
            onChange={e => setFillAnnexure(fmtList.find(f => f.id === e.target.value) || null)}
            style={styles.select}
          >
            <option value="">— choose an annexure —</option>
            {fmtList.map(f => <option key={f.id} value={f.id}>{f.annexure_ref} — {f.title}</option>)}
          </select>
        </div>

        {fillAnnexure && !filledContent && !isFilling && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={styles.sectionLabel}>Template Preview</p>
            <pre style={styles.verbatimBox}>{fillAnnexure.verbatim_content}</pre>
            <button onClick={() => handleAutoFill(fillAnnexure)} style={styles.primaryBtn}>
              <Wand2 size={16} /> Fill with Meril Details
            </button>
          </div>
        )}

        {isFilling && (
          <div style={styles.centered}>
            <div style={styles.spinner} />
            <p style={{ color: '#6b7280', marginTop: '1rem' }}>AI is filling the template…</p>
          </div>
        )}

        {filledContent && !isFilling && (
          <div>
            <p style={styles.sectionLabel}>Filled Template — Edit as needed</p>
            <textarea
              value={filledContent}
              onChange={e => setFilledContent(e.target.value)}
              style={styles.editor}
              rows={20}
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button onClick={handleSaveDraft} disabled={isSaving} style={styles.primaryBtn}>
                <CheckCircle size={15} /> {isSaving ? 'Saving…' : 'Save Draft'}
              </button>
              <button onClick={() => handleGenerateDoc(fillAnnexure.id, filledContent)} style={{ ...styles.primaryBtn, background: '#166534' }}>
                <FileText size={15} /> Generate DOCX
              </button>
              <button onClick={handleDownload} style={styles.ghostBtn}>
                <Download size={15} /> Download as TXT
              </button>
              <button onClick={() => handleAutoFill(fillAnnexure)} style={styles.ghostBtn}>
                <RefreshCw size={15} /> Refill
              </button>
              <button onClick={handleSuggestDrive} disabled={isSuggesting} style={styles.ghostBtn}>
                <Database size={15} /> {isSuggesting ? 'Searching Drive…' : 'Suggest from AI Drive'}
              </button>
            </div>

            {suggestions.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <p style={styles.sectionLabel}>AI Drive Suggestions</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {suggestions.map((s, i) => (
                    <div key={i} style={styles.suggestionCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <FileText size={14} color="#2563eb" />
                          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.doc_name}</span>
                        </div>
                        <button
                          onClick={() => handleDownloadDriveMatch(s.id, s.doc_name)}
                          disabled={downloadingDriveDocId === s.id}
                          style={styles.smallBtn}
                        >
                          <Download size={12} /> {downloadingDriveDocId === s.id ? 'Downloading…' : 'View'}
                        </button>
                      </div>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>{s.relevance_reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!fillAnnexure && formats.length === 0 && (
          <div style={styles.emptyState}>
            <Wand2 size={40} color="#cbd5e1" />
            <p>Run document analysis first to extract templates.</p>
            <button onClick={() => setActivePanel('annexures')} style={styles.primaryBtn}>Go to Annexures</button>
          </div>
        )}
      </div>
    );
  };

  const renderEditorPanel = () => {
    if (isDrafting) {
      return (
        <div style={styles.centered}>
          <div style={styles.spinner} />
          <p style={{ color: '#6b7280', marginTop: '1rem', fontWeight: 500 }}>OpenProcure AI is drafting your document…</p>
          <p style={{ color: '#9ca3af', fontSize: '0.8125rem', marginTop: '0.25rem' }}>Opening in document editor…</p>
        </div>
      );
    }

    return (
      <div style={styles.emptyState}>
        <FileSignature size={40} color="#cbd5e1" />
        <p style={{ margin: '0.5rem 0 0' }}>No document open.</p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#94a3b8' }}>
          Click <strong>Draft with OpenProcure</strong> on any annexure card — it opens in the full document editor.
        </p>
        <button onClick={() => setActivePanel('annexures')} style={{ ...styles.primaryBtn, marginTop: '1rem' }}>
          Go to Annexures
        </button>
      </div>
    );
  };

  const renderDrivePanel = () => (
    <div>
      {/* Upload card */}
      <div style={styles.driveUploadCard}>
        <p style={{ margin: '0 0 1rem', fontWeight: 700, fontSize: '0.9375rem', color: '#1f2937' }}>
          <Database size={16} style={{ verticalAlign: 'middle', marginRight: '0.5rem', color: '#2563eb' }} />
          Upload Company Document
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={styles.label}>Document Type</label>
            <select
              value={driveForm.doc_type}
              onChange={e => setDriveForm(f => ({ ...f, doc_type: e.target.value }))}
              style={styles.select}
            >
              {DOC_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <label style={styles.label}>Description (optional)</label>
            <input
              value={driveForm.description}
              onChange={e => setDriveForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. ISO 13485 certificate valid until Dec 2026"
              style={styles.input}
            />
          </div>
        </div>
        <label style={{ ...styles.uploadZoneSm, cursor: uploadingDrive ? 'not-allowed' : 'pointer' }}>
          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleDriveUpload} disabled={uploadingDrive} />
          <Upload size={20} color="#94a3b8" />
          <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: '#374151', fontWeight: 500 }}>
            {uploadingDrive ? 'Uploading & tagging with AI…' : 'Choose file (PDF, DOC, DOCX, JPG, PNG)'}
          </span>
        </label>
      </div>

      {/* Search & filter */}
      <div style={{ display: 'flex', gap: '0.75rem', margin: '1.25rem 0', flexWrap: 'wrap' }}>
        <input
          value={driveSearch}
          onChange={e => setDriveSearch(e.target.value)}
          placeholder="Search documents…"
          style={{ ...styles.input, flex: 1, minWidth: '200px' }}
        />
        <select
          value={driveTypeFilter}
          onChange={e => setDriveTypeFilter(e.target.value)}
          style={{ ...styles.select, width: 'auto' }}
        >
          <option value="all">All types</option>
          {DOC_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loadingDrive
        ? <div style={styles.centered}><div style={styles.spinner} /></div>
        : driveFiles.length === 0
          ? <div style={styles.emptyState}><Database size={40} color="#cbd5e1" /><p>No documents in AI Drive yet. Upload your first one above.</p></div>
          : (
            <div style={styles.driveGrid}>
              {driveFiles.map(doc => (
                <div key={doc.id} style={styles.driveCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={styles.typePill('#dbeafe', '#1e40af')}>{doc.doc_type}</span>
                      {doc.use_count > 0 && <span style={styles.typePill('#dcfce7', '#166534')}>used {doc.use_count}×</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <button
                        onClick={() => handleDownloadDriveMatch(doc.id, doc.doc_name || doc.title)}
                        disabled={downloadingDriveDocId === doc.id}
                        style={styles.iconBtn}
                        title="Download"
                      ><Download size={13} /></button>
                      <button onClick={() => handleDeleteDrive(doc.id)} style={{ ...styles.iconBtn, color: '#ef4444' }} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p style={{ margin: '0.5rem 0 0.25rem', fontWeight: 600, fontSize: '0.875rem', color: '#1f2937' }}>{doc.doc_name}</p>
                  {doc.ai_summary && <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>{doc.ai_summary}</p>}
                  {Array.isArray(doc.tags) && doc.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {doc.tags.map((t, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.6875rem', background: '#f1f5f9', color: '#475569', padding: '0.125rem 0.5rem', borderRadius: '999px' }}>
                          <Tag size={9} /> {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
      }
    </div>
  );

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Document Preparation</h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>Tender: {cleanBid}</p>
      </div>

      {/* Panel tabs */}
      <div style={styles.panelTabs}>
        {[
          { id: 'annexures', label: 'Annexure Generator', icon: FileText       },
          { id: 'autofill',  label: 'Auto Fill',          icon: Wand2          },
          { id: 'editor',    label: 'Document Editor',    icon: FileSignature  },
          { id: 'drive',     label: 'AI Drive',           icon: Database       },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
            style={activePanel === id ? styles.panelTabActive : styles.panelTab}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div style={styles.panelContent}>
        {activePanel === 'annexures' && renderAnnexurePanel()}
        {activePanel === 'autofill'  && renderAutoFillPanel()}
        {activePanel === 'editor'    && renderEditorPanel()}
        {activePanel === 'drive'     && renderDrivePanel()}
      </div>

      {/* Upload Document modal */}
      {showUploadModal && (
        <div
          onClick={() => !isUploadingDoc && setShowUploadModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '420px', maxWidth: '90vw', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>Upload Document</h3>

            <label style={styles.label}>File</label>
            <label style={{ ...styles.uploadZone, padding: '1rem', marginBottom: '1rem' }}>
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
              style={{ ...styles.input, width: '100%', marginBottom: '1rem' }}
            />

            <label style={styles.label}>Description (optional)</label>
            <textarea
              value={uploadDescription}
              onChange={e => setUploadDescription(e.target.value)}
              placeholder="Add a short description…"
              rows={3}
              style={{ ...styles.input, width: '100%', marginBottom: '1.25rem', resize: 'vertical', fontFamily: 'inherit' }}
            />

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowUploadModal(false)}
                disabled={isUploadingDoc}
                style={styles.smallBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleUploadDocument}
                disabled={isUploadingDoc || !uploadFile}
                style={{ ...styles.primaryBtn, opacity: (isUploadingDoc || !uploadFile) ? 0.6 : 1, cursor: (isUploadingDoc || !uploadFile) ? 'not-allowed' : 'pointer' }}
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
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '480px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
          >
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
                  <span style={styles.typePill(item.type === 'uploaded' ? '#f3e8ff' : '#dbeafe', item.type === 'uploaded' ? '#6b21a8' : '#1e40af')}>
                    {item.type === 'uploaded' ? 'Uploaded' : 'Generated'}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowZipModal(false)}
                disabled={downloadingZip}
                style={styles.smallBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDownloadZip}
                disabled={downloadingZip || zipItems.length === 0}
                style={{ ...styles.primaryBtn, opacity: (downloadingZip || zipItems.length === 0) ? 0.6 : 1, cursor: (downloadingZip || zipItems.length === 0) ? 'not-allowed' : 'pointer' }}
              >
                <Archive size={15} /> {downloadingZip ? 'Preparing ZIP…' : 'Download ZIP'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes slide  { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}

// ── File type badge colours for extracted ZIP files ───────────────────────────
const EXT_BADGE = {
  '.pdf':  { bg: '#fee2e2', text: '#991b1b' },
  '.doc':  { bg: '#dbeafe', text: '#1e40af' },
  '.docx': { bg: '#dbeafe', text: '#1e40af' },
  '.xls':  { bg: '#dcfce7', text: '#166534' },
  '.xlsx': { bg: '#dcfce7', text: '#166534' },
  '.zip':  { bg: '#fef3c7', text: '#92400e' },
  '.rar':  { bg: '#fef3c7', text: '#92400e' },
  '.jpg':  { bg: '#f3e8ff', text: '#6b21a8' },
  '.jpeg': { bg: '#f3e8ff', text: '#6b21a8' },
  '.png':  { bg: '#f3e8ff', text: '#6b21a8' },
  default: { bg: '#f1f5f9', text: '#475569' },
};

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ── Inline styles ─────────────────────────────────────────────────────────────
const styles = {
  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0' },
  spinner:  { width: 36, height: 36, border: '3px solid #e2e8f0', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'spin 0.9s linear infinite' },

  panelTabs:      { display: 'flex', gap: '0.5rem', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem' },
  panelTab:       { display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.625rem 1rem', border: 'none', borderBottom: '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, color: '#64748b', marginBottom: '-2px' },
  panelTabActive: { display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.625rem 1rem', border: 'none', borderBottom: '2px solid #2563eb', background: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: '#2563eb', marginBottom: '-2px' },
  panelContent:   { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', minHeight: '400px' },

  statusBar: { display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.625rem 1rem', marginBottom: '1rem', flexWrap: 'wrap' },
  badge: (bg, color) => ({ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: bg, color, padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }),
  alertBanner: (bg, color) => ({ display: 'flex', alignItems: 'center', gap: '0.5rem', background: bg, color, padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.8125rem', marginBottom: '1rem' }),

  uploadZone:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '2rem', cursor: 'pointer', transition: 'border-color 0.2s', marginTop: '0.5rem' },
  uploadZoneSm: { display: 'flex', alignItems: 'center', border: '1.5px dashed #cbd5e1', borderRadius: '8px', padding: '0.625rem 1rem', background: '#f8fafc' },

  primaryBtn:   { display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.625rem 1.125rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  primaryBtnSm: { display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8125rem' },
  ghostBtn:     { display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.8125rem' },
  smallBtn:     { display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500 },
  iconBtn:      { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem' },

  progressBar:  { background: '#e2e8f0', borderRadius: '999px', height: '6px', overflow: 'hidden' },
  progressFill: { height: '100%', width: '60%', background: '#2563eb', borderRadius: '999px', animation: 'slide 1.8s ease-in-out infinite' },

  additionalDocsBox: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1rem', marginTop: '1rem' },
  additionalDocRow:  { display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.375rem 0.625rem' },
  categoryHeader: (bg, color) => ({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: bg, color, padding: '0.5rem 0.875rem', borderRadius: '8px', marginBottom: '0.75rem' }),

  annexureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' },
  annexureCard: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' },
  verbatimBox:  { background: '#f1f5f9', borderRadius: '8px', padding: '1rem', fontSize: '0.75rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto', marginTop: '0.75rem', fontFamily: 'monospace', color: '#374151', border: '1px solid #e2e8f0' },
  typePill: (bg, color) => ({ display: 'inline-block', background: bg, color, fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '999px', marginRight: '0.25rem' }),

  label:      { display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem' },
  sectionLabel: { fontSize: '0.8125rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem', marginTop: '1rem' },
  select:     { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', background: '#fff', color: '#1f2937' },
  input:      { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', background: '#fff', color: '#1f2937', boxSizing: 'border-box' },
  editor:     { width: '100%', padding: '0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.8125rem', lineHeight: 1.7, fontFamily: 'monospace', resize: 'vertical', color: '#1f2937', boxSizing: 'border-box' },

  driveUploadCard: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem' },
  driveGrid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' },
  driveCard:       { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },

  suggestionCard:    { background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '0.75rem' },
  emptyState:        { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '3rem 0', color: '#94a3b8', textAlign: 'center' },
  extractionBox:     { background: '#faf5ff', border: '1.5px solid #c4b5fd', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem' },
  extractedFileRow:  { display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.75rem', flexWrap: 'wrap' },
};

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Wand2, Database, Download, Trash2, RefreshCw, CheckCircle, AlertCircle, Clock, Tag, Eye, Plus, X, FileSignature, Sparkles, ExternalLink, FolderOpen, File as FileIcon, Archive, GripVertical, Brain, ChevronDown, ChevronRight, Edit2, Package, Library, HardDrive, Folder, ChevronLeft, Search, Scissors } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DownloadShareButtons from '../../components/common/DownloadShareButtons';
import '../../assets/css/TenderDetails.css'; // reuses .tender-summary-markdown / .tender-summary-table-wrap
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

// doc.library_path is built server-side as "Library / Folder / .../ FileName" —
// the file name itself is shown right next to this path already, so display
// only the folder portion (drop the last " / "-separated segment).
function libraryFolderPath(path) {
  if (!path) return path;
  const parts = path.split(' / ');
  return parts.length > 1 ? parts.slice(0, -1).join(' / ') : path;
}

// "22 Sept 2026, 03:36 pm" — built by hand rather than via toLocaleString's
// 'short' month (which gives "Sep", not the 4-letter "Sept" wanted here).
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
function formatDocDate(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = MONTH_ABBR[d.getMonth()];
  const year  = d.getFullYear();
  let hours   = d.getHours();
  const mins  = String(d.getMinutes()).padStart(2, '0');
  const ampm  = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${day} ${month} ${year}, ${String(hours).padStart(2, '0')}:${mins} ${ampm}`;
}

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

export default function WorkspaceDocPrep({ tenderId, tenderLinks = [], initialPanel = null }) {
  const cleanBid    = (tenderId || '').replace(/_/g, '/');
  const encodedBid  = encodeURIComponent(cleanBid);
  const token       = localStorage.getItem('token');
  const authHeader  = { Authorization: `Bearer ${token}` };
  const navigate    = useNavigate();

  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem('user')); } catch { /* ignore */ }
  const canDelete = currentUser?.role === 'Admin' || currentUser?.role === 'Tender Admin' || currentUser?.role === 'Office Administrator';

  // Coming back from the Docs editor's Back button should land on whichever
  // sub-tab the user was on (e.g. the annexures listing they clicked Edit
  // from), not always reset to Tender Summary.
  const [activePanel, setActivePanel] = useState(initialPanel || 'summary');

  // ── Toast — brief top-right confirmation whenever a document lands in My
  //    Documents (Push to My Docs, Upload Signed Copy, etc.) so the user gets
  //    an explicit "X added to My Docs" without having to switch tabs to check.
  const [toast, setToast] = useState(null); // { message } | null
  const toastTimerRef = useRef(null);
  const showToast = (message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  // Checklist page-numbering is now fully automatic (see WorkspaceMyDocs'
  // handleMergeFiles: it renders the tender's own checklist with real page
  // numbers baked in and substitutes it directly into the merge) — no
  // separate Checklist tab/tracking UI here anymore.

  // ── Tender Summary (AI) state ───────────────────────────────────────────────
  const [summaryText, setSummaryText]   = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const summaryFetchedRef = useRef(false);

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
      `<head>\n<script>window.__API_BASE_URL__ = ${JSON.stringify(API_BASE_URL)}; window.__AUTH_TOKEN__ = ${JSON.stringify(token)}; window.__BID_NO__ = ${JSON.stringify(cleanBid)};</script>`
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
  const [viewingDocId, setViewingDocId]         = useState(null);
  const [renamingDocId, setRenamingDocId]       = useState(null);
  const [deletingDocId, setDeletingDocId]       = useState(null);
  // "Uploaded Documents" select mode — pick specific staged docs, then push
  // just those to My Documents in one go.
  const [uploadedSelectMode, setUploadedSelectMode] = useState(false);
  const [uploadedSelectedIds, setUploadedSelectedIds] = useState(new Set());
  const [pushingToMyDocs, setPushingToMyDocs]   = useState(false);
  // Add Document (Computer/Library), invoked either generically, from a
  // specific annexure-category section header (uploadCategory), or from one
  // annexure row's own "Upload Document" button (uploadAnnexureId) — a row
  // upload pushes straight to My Documents (no staging) and is tracked here
  // per annexure so the row shows "Uploaded"/"Completed" afterward.
  const [uploadMode, setUploadMode]           = useState(null); // null | 'computer' | 'library'
  const [uploadCategory, setUploadCategory]   = useState(null);
  const [uploadAnnexureId, setUploadAnnexureId] = useState(null);
  const [pushedUploadMap, setPushedUploadMap] = useState({});
  const [libItems, setLibItems]               = useState([]);
  const [libBreadcrumb, setLibBreadcrumb]     = useState([]);
  const [libParentId, setLibParentId]         = useState(null);
  const [libLoading, setLibLoading]           = useState(false);
  const [libSelected, setLibSelected]         = useState(new Set());
  const [isImportingLib, setIsImportingLib]   = useState(false);

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
  const [extractingId, setExtractingId]       = useState(null); // annexure id currently having its template pulled

  // ── Fields-review popup (Auto Fill v2: review fields, then Generate Annexure) ──
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  const [modalFields, setModalFields]         = useState([]);   // [{key,label,value}]
  const [modalAnnexure, setModalAnnexure]     = useState(null);
  const [modalDivision, setModalDivision]     = useState('Diagno');
  const [isGeneratingAnnexure, setIsGeneratingAnnexure] = useState(false);
  // Set when the server flags the extraction as suspiciously short — usually
  // means the automatic page guess grabbed a cross-reference to the annexure
  // rather than the annexure itself. Lets the user look at the bid document,
  // find the real page, and re-check just that one item — no full re-analysis.
  const [modalThin, setModalThin]             = useState(false);
  const [recheckPage, setRecheckPage]         = useState('');
  const [isRechecking, setIsRechecking]       = useState(false);

  // ── Generated-annexure tracking — once an annexure has been auto-filled,
  //    its docId is remembered here (keyed by annexure id) so the row can
  //    switch from "Auto Fill" to "Edit / Download / Push to My Docs" and
  //    survive reloads. `pushed` only flips true when the user explicitly
  //    pushes it into My Documents — generating/saving alone never does. ────
  const [generatedMap, setGeneratedMap]       = useState({});
  const [genFilter, setGenFilter]             = useState('all'); // all | generated | pending

  // ── Same "pushed to My Docs" tracking, but for AI-Drive-matched documents
  //    (certificates etc. that were found rather than generated) — these have
  //    no editable docId, just a drive_doc_id to fetch and re-upload as PDF. ──
  const [pushedDriveMap, setPushedDriveMap]   = useState({});
  const [pushingDriveId, setPushingDriveId]   = useState(null);
  const [removingDriveMatchId, setRemovingDriveMatchId] = useState(null);

  // "Cut" on a Found-in-AI-Drive chip — detaches it from this annexure
  // (doesn't touch the file in AI Drive itself). Row falls back to needing a
  // manual upload afterward.
  const handleRemoveDriveMatch = async (annexureId) => {
    setRemovingDriveMatchId(annexureId);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/drive-match/${annexureId}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      const json = await res.json();
      if (!json.success) { alert(json.message || 'Failed to remove'); return; }
      setSession(s => s ? { ...s, drive_matches: json.drive_matches } : s);
    } catch (e) {
      alert('Failed to remove: ' + e.message);
    } finally {
      setRemovingDriveMatchId(null);
    }
  };

  useEffect(() => {
    const tidNorm = cleanBid.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      const raw = localStorage.getItem(`doc_prep_generated_${tidNorm}`);
      setGeneratedMap(raw ? JSON.parse(raw) : {});
    } catch { setGeneratedMap({}); }
    try {
      const raw = localStorage.getItem(`doc_prep_drive_pushed_${tidNorm}`);
      setPushedDriveMap(raw ? JSON.parse(raw) : {});
    } catch { setPushedDriveMap({}); }
    try {
      const raw = localStorage.getItem(`doc_prep_upload_pushed_${tidNorm}`);
      setPushedUploadMap(raw ? JSON.parse(raw) : {});
    } catch { setPushedUploadMap({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanBid]);

  // The generated/edited content's real last-saved time lives on its
  // docs_editor_<docId> record (DocsEditor writes savedAt on every save),
  // not on generatedMap itself — read it from there so "Last updated"
  // reflects actual edits, not just the moment it was first generated.
  const getAnnexureLastUpdated = (annexureId) => {
    const gen = generatedMap[annexureId];
    if (!gen?.docId) return null;
    try {
      const raw = localStorage.getItem('docs_editor_' + gen.docId);
      const saved = raw ? JSON.parse(raw) : null;
      return saved?.savedAt || null;
    } catch { return null; }
  };

  const persistGeneratedMap = (next) => {
    const tidNorm = cleanBid.replace(/[^a-zA-Z0-9]/g, '_');
    try { localStorage.setItem(`doc_prep_generated_${tidNorm}`, JSON.stringify(next)); } catch { /* ignore */ }
    setGeneratedMap(next);
  };

  const persistPushedDriveMap = (next) => {
    const tidNorm = cleanBid.replace(/[^a-zA-Z0-9]/g, '_');
    try { localStorage.setItem(`doc_prep_drive_pushed_${tidNorm}`, JSON.stringify(next)); } catch { /* ignore */ }
    setPushedDriveMap(next);
  };

  const persistPushedUploadMap = (next) => {
    const tidNorm = cleanBid.replace(/[^a-zA-Z0-9]/g, '_');
    try { localStorage.setItem(`doc_prep_upload_pushed_${tidNorm}`, JSON.stringify(next)); } catch { /* ignore */ }
    setPushedUploadMap(next);
  };

  // Fetch the AI-Drive file, convert it to PDF if it isn't already, and
  // upload it into the workspace's document store — same end state as the
  // generated-annexure "Push to My Docs" (a real PDF file in My Documents).
  const handlePushDriveMatchToMyDocs = async (annexureId, driveDocId, docName) => {
    setPushingDriveId(annexureId);
    try {
      const dlRes = await fetch(`${API_BASE_URL}/company-drive/download/${driveDocId}`, { headers: authHeader });
      if (!dlRes.ok) { alert('Failed to fetch document from AI Drive'); return; }
      const blob     = await dlRes.blob();
      const safeName = (docName || 'Document').replace(/\.[a-zA-Z0-9]+$/, '');
      const isPdf    = blob.type === 'application/pdf' || /\.pdf$/i.test(docName || '');

      let finalUploadedDocs = null;

      if (isPdf) {
        const pdfFile = new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
        const fd = new FormData();
        fd.append('file', pdfFile);
        fd.append('name', safeName);
        fd.append('description', 'Pushed from AI Drive (Doc Prep)');
        fd.append('annexure_id', annexureId);
        fd.append('push_source', 'drive');
        const upRes = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, { method: 'POST', headers: authHeader, body: fd });
        const upJson = await upRes.json();
        if (!upJson.success) { alert(upJson.message || 'Upload failed'); return; }
        finalUploadedDocs = upJson.uploaded_docs || [];
      } else {
        // Upload the original first so the server's converter can turn it
        // into a PDF, then swap in that PDF and drop the source file.
        const origFile = new File([blob], docName || 'document', { type: blob.type || 'application/octet-stream' });
        const fd1 = new FormData();
        fd1.append('file', origFile);
        fd1.append('name', safeName);
        fd1.append('description', 'Pushed from AI Drive (Doc Prep)');
        fd1.append('annexure_id', annexureId);
        fd1.append('push_source', 'drive');
        const up1Res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, { method: 'POST', headers: authHeader, body: fd1 });
        const up1Json = await up1Res.json();
        if (!up1Json.success) { alert(up1Json.message || 'Upload failed'); return; }
        const newDoc = (up1Json.uploaded_docs || []).slice(-1)[0];

        const pdfRes = newDoc ? await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${newDoc.id}/pdf`, { headers: authHeader }) : null;
        if (!pdfRes || !pdfRes.ok) {
          finalUploadedDocs = up1Json.uploaded_docs || [];
          alert('Uploaded, but PDF conversion failed — kept in its original format.');
        } else {
          const pdfBlob = await pdfRes.blob();
          const pdfFile = new File([pdfBlob], `${safeName}.pdf`, { type: 'application/pdf' });
          const fd2 = new FormData();
          fd2.append('file', pdfFile);
          fd2.append('name', safeName);
          fd2.append('description', 'Pushed from AI Drive (Doc Prep)');
          fd2.append('annexure_id', annexureId);
          fd2.append('push_source', 'drive');
          const up2Res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, { method: 'POST', headers: authHeader, body: fd2 });
          const up2Json = await up2Res.json();
          await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${newDoc.id}`, { method: 'DELETE', headers: authHeader }).catch(() => {});
          finalUploadedDocs = up2Json.success ? (up2Json.uploaded_docs || []) : (up1Json.uploaded_docs || []);
        }
      }

      if (finalUploadedDocs) setUploadedDocs(finalUploadedDocs);
      persistPushedDriveMap({ ...pushedDriveMap, [annexureId]: true });
      showToast(`"${docName || safeName}" added to My Docs`);
    } catch (e) {
      alert('Push to My Docs failed: ' + e.message);
    } finally {
      setPushingDriveId(null);
    }
  };


  // Builds the { formats: [pdf, word] } pair a generated annexure's
  // Download/Share buttons need — same underlying content (docs_editor_<id>
  // in localStorage), rendered via export-pdf/export-docx for download and
  // export-share (same body + { format, email }) for emailing it directly.
  const buildGeneratedFormats = (entry) => {
    const getDoc = () => {
      let doc = null;
      try { doc = JSON.parse(localStorage.getItem('docs_editor_' + entry.docId)); } catch { /* ignore */ }
      if (!doc) throw new Error('Document not found — open it in Edit first.');
      return doc;
    };
    const downloadAs = async (endpoint, ext) => {
      const doc = getDoc();
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
      a.download = `${(doc.title || entry.title || 'Annexure').replace(/[^a-zA-Z0-9_\-]/g, '_')}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    };
    const shareAs = async (format, email) => {
      const doc = getDoc();
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

  const [pushingGeneratedId, setPushingGeneratedId] = useState(null);

  // Push to My Docs — renders the current content to PDF (same as Download)
  // then uploads that PDF into the workspace's document store, so it shows
  // up in My Documents as a real uploaded file rather than an editable
  // localStorage draft. Marks the annexure Completed on success.
  const handlePushRenderUpload = async (annexureId) => {
    const entry = generatedMap[annexureId];
    if (!entry) return;
    setPushingGeneratedId(annexureId);
    try {
      let doc = null;
      try { doc = JSON.parse(localStorage.getItem('docs_editor_' + entry.docId)); } catch { /* ignore */ }
      if (!doc) { alert('Document not found — open it in Edit first.'); return; }

      const pdfRes = await fetch(`${API_BASE_URL}/doc-prep/export-pdf`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: doc.title, html_content: doc.content, bidNo: cleanBid }),
      });
      if (!pdfRes.ok) { alert('PDF render failed'); return; }
      const pdfBlob = await pdfRes.blob();

      const safeName = (doc.title || entry.title || 'Annexure').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const pdfFile  = new File([pdfBlob], `${safeName}.pdf`, { type: 'application/pdf' });

      const fd = new FormData();
      fd.append('file', pdfFile);
      fd.append('name', doc.title || entry.title || 'Annexure');
      fd.append('description', 'Generated from Doc Prep');
      fd.append('annexure_id', annexureId);
      fd.append('push_source', 'annexure');
      const upRes = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, {
        method: 'POST', headers: authHeader, body: fd,
      });
      const upJson = await upRes.json();
      if (!upJson.success) { alert(upJson.message || 'Upload failed'); return; }
      setUploadedDocs(upJson.uploaded_docs || []);
      showToast(`"${doc.title || entry.title || 'Document'}" added to My Docs`);

      persistGeneratedMap({ ...generatedMap, [annexureId]: { ...entry, pushed: true } });
    } catch (e) {
      alert('Push to My Docs failed: ' + e.message);
    } finally {
      setPushingGeneratedId(null);
    }
  };

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

  // ── Tender Summary (AI) ──────────────────────────────────────────────────────
  // notGenerated: true once we've confirmed (via checkOnly) that no summary
  // exists yet for this tender anywhere in the app — shows a "Generate
  // Summary" button instead of auto-running Ollama on every tab open.
  const [summaryNotGenerated, setSummaryNotGenerated] = useState(false);

  const fetchTenderSummary = useCallback(async (regenerate = false) => {
    try {
      setLoadingSummary(true);
      setSummaryError('');
      const res = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(tenderId)}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ regenerate }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSummaryText(json.summary);
        setSummaryNotGenerated(false);
      } else {
        setSummaryError(json.message || 'Failed to generate tender summary.');
      }
    } catch (err) {
      console.error('fetchTenderSummary:', err);
      setSummaryError('Failed to generate tender summary.');
    } finally {
      setLoadingSummary(false);
    }
  }, [tenderId]);

  // On first open of the tab: check whether a summary was already generated
  // (from this workspace or from Tender Details — same cache) and just fetch
  // it. If none exists yet, show a "Generate Summary" button instead of
  // silently kicking off an Ollama run.
  const checkTenderSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      setSummaryError('');
      const res = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(tenderId)}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ checkOnly: true }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.summary) {
        setSummaryText(json.summary);
      } else {
        setSummaryNotGenerated(true);
      }
    } catch (err) {
      console.error('checkTenderSummary:', err);
      setSummaryNotGenerated(true);
    } finally {
      setLoadingSummary(false);
    }
  }, [tenderId]);

  useEffect(() => {
    if (activePanel === 'summary' && !summaryFetchedRef.current) {
      summaryFetchedRef.current = true;
      checkTenderSummary();
    }
  }, [activePanel, checkTenderSummary]);

  useEffect(() => {
    if (activePanel === 'products' && !productDocsFetched) {
      fetchProductDocs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel]);

  const renderSummaryPanel = () => (
    <div style={styles.summaryPanelWrap}>
      {loadingSummary && (
        <div style={styles.summaryStatus}>
          <div style={styles.summarySpinner} />
          <p>Analyzing the tender document(s)… this can take a moment.</p>
        </div>
      )}

      {!loadingSummary && summaryNotGenerated && !summaryText && (
        <div style={styles.summaryStatus}>
          <p>No summary has been generated for this tender yet.</p>
          <button onClick={() => fetchTenderSummary(false)} style={{ ...styles.summaryRegenerateBtn, background: '#084f9a' }}>
            <Brain size={14} /> Generate Summary
          </button>
        </div>
      )}

      {!loadingSummary && summaryError && (
        <div style={styles.summaryErrorBox}>
          <AlertCircle size={18} />
          <span>{summaryError}</span>
        </div>
      )}

      {!loadingSummary && !summaryError && summaryText && (
        <>
          <div style={styles.summaryToolbar}>
            <button
              onClick={() => fetchTenderSummary(true)}
              disabled={loadingSummary}
              style={styles.summaryRegenerateBtn}
            >
              <RefreshCw size={14} /> Regenerate
            </button>
          </div>
          <div className="tender-summary-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="tender-summary-table-wrap">
                    <table>{children}</table>
                  </div>
                ),
              }}
            >
              {summaryText}
            </ReactMarkdown>
          </div>
        </>
      )}
    </div>
  );

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

  // ── Upload Bid Document — source picker: "Workspace Documents" (pick from
  //    Tender Documents + My Documents already on file for this tender) or
  //    "Computer Document" (the original file-picker flow above). ──────────
  const [showBidSourceModal, setShowBidSourceModal] = useState(false);
  const [bidSourceMode, setBidSourceMode] = useState(null); // null | 'workspace'
  const [workspaceDocSelection, setWorkspaceDocSelection] = useState(new Set());
  const [isImportingWorkspaceDocs, setIsImportingWorkspaceDocs] = useState(false);
  const computerFileInputRef = useRef(null);

  // Only Tender Documents whose file actually lives on our own disk can be
  // reused here (external tender-portal URLs aren't resolvable server-side
  // without a second network fetch) — same own-backend check used in the
  // Tender Documents tab.
  const workspaceTenderDocs = tenderLinks
    .filter(l => l.uri && l.uri.includes('/tenders/download') && l.uri.includes('path='))
    .map(l => {
      const match = l.uri.match(/[?&]path=([^&]+)/);
      const filePath = match ? decodeURIComponent(match[1]) : null;
      return { path: filePath, name: l.text || 'Tender Document' };
    })
    .filter(d => d.path);

  const handleOpenBidSourceModal = () => {
    setBidSourceMode(null);
    setWorkspaceDocSelection(new Set());
    setShowBidSourceModal(true);
  };

  const toggleWorkspaceDocSelect = (key) => {
    setWorkspaceDocSelection(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleImportWorkspaceDocs = async () => {
    if (workspaceDocSelection.size === 0) return;
    const items = [];
    workspaceDocSelection.forEach(key => {
      if (key.startsWith('tender_')) {
        const idx = Number(key.slice(7));
        const doc = workspaceTenderDocs[idx];
        if (doc) items.push({ source: 'tender_document', path: doc.path, name: doc.name });
      } else if (key.startsWith('uploaded_')) {
        const id = key.slice(9);
        const doc = uploadedDocs.find(d => d.id === id);
        if (doc) items.push({ source: 'uploaded_doc', id: doc.id, name: doc.name });
      }
    });
    if (!items.length) return;

    setIsImportingWorkspaceDocs(true);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/import-from-workspace`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (json.success) {
        setShowBidSourceModal(false);
        setExtractedFiles([]);
        await fetchSession();
      } else {
        alert(json.message || 'Import failed');
      }
    } catch (e) {
      alert('Import failed: ' + e.message);
    } finally {
      setIsImportingWorkspaceDocs(false);
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

  // Re-analyze wipes out everything already built for this tender (Auto Fill
  // extractions, generated drafts, drive matches — a full from-scratch
  // rebuild) so it goes through a confirmation modal first, not a plain
  // click — see showReanalyzeConfirm below.
  const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const handleRunAnalysis = async () => {
    setReanalyzing(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/analyze`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json.success) fetchSession();
      else alert(json.message);
    } finally {
      setReanalyzing(false);
      setShowReanalyzeConfirm(false);
    }
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

  // ── Edit an annexure's title/ref — for tenders that don't formally label an
  //    item "Annexure X", or where the AI's synthesized title needs a tweak.
  const [editingAnnexureId, setEditingAnnexureId] = useState(null);
  const [editAnnexureRef, setEditAnnexureRef]     = useState('');
  const [editAnnexureTitle, setEditAnnexureTitle] = useState('');
  const [savingAnnexureEdit, setSavingAnnexureEdit] = useState(false);

  const handleStartEditAnnexure = (ann) => {
    setEditingAnnexureId(ann.id);
    setEditAnnexureRef(ann.annexure_ref || '');
    setEditAnnexureTitle(ann.title || '');
  };

  const handleCancelEditAnnexure = () => setEditingAnnexureId(null);

  const handleSaveEditAnnexure = async (annexureId) => {
    setSavingAnnexureEdit(true);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/annexure/${annexureId}`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ annexure_ref: editAnnexureRef, title: editAnnexureTitle }),
      });
      const json = await res.json();
      if (json.success) {
        setSession(s => {
          if (!s) return s;
          const list = (typeof s.annexures === 'string' ? JSON.parse(s.annexures) : s.annexures) || [];
          const next = list.map(a => a.id === annexureId ? { ...a, ...json.annexure } : a);
          return { ...s, annexures: next };
        });
        setEditingAnnexureId(null);
      } else {
        alert(json.message || 'Failed to save changes');
      }
    } catch (e) {
      alert('Failed to save changes: ' + e.message);
    } finally {
      setSavingAnnexureEdit(false);
    }
  };

  // ── Stamp Paper / Affidavit ─────────────────────────────────────────────────
  // These need a plain (no letterhead, no auto-signature) Word doc for physical
  // printing on stamp paper, wet signature, and (if required) notarization —
  // then the scanned signed copy uploaded back onto this same annexure.
  const patchAnnexure = (annexureId, patch) => {
    setSession(s => {
      if (!s) return s;
      const list = (typeof s.annexures === 'string' ? JSON.parse(s.annexures) : s.annexures) || [];
      const next = list.map(a => a.id === annexureId ? { ...a, ...patch } : a);
      return { ...s, annexures: next };
    });
  };

  const [togglingStampId, setTogglingStampId] = useState(null);

  // Stamp Paper is now a bulk pick-and-mark action off the group header
  // ("Stamp Paper" button next to Add Document) instead of a per-row toggle —
  // most annexures in a group never need it, so a button on every single row
  // was mostly noise. stampPickerGroup is which group's picker is open
  // (null when closed); stampPickerSelected holds the ids checked in it.
  const [stampPickerGroup, setStampPickerGroup] = useState(null);
  const [stampPickerSelected, setStampPickerSelected] = useState(new Set());
  const [bulkMarkingStamp, setBulkMarkingStamp] = useState(false);

  const toggleStampPickerSelect = (id) => {
    setStampPickerSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Marks every checked annexure as requiring Stamp Paper — explicit `true`,
  // not a toggle, since this picker's whole job is "mark these as Stamp
  // Paper" (unmarking one back off still happens per-item, from the Stamp
  // Paper pill... see the row markup below).
  const handleBulkMarkStampPaper = async () => {
    if (!stampPickerSelected.size) return;
    setBulkMarkingStamp(true);
    try {
      const ids = [...stampPickerSelected];
      await Promise.all(ids.map(async (id) => {
        try {
          const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/annexure/${id}`, {
            method: 'PATCH',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requires_stamp_paper: true }),
          });
          const json = await res.json();
          if (json.success) patchAnnexure(id, json.annexure);
        } catch { /* best effort per item */ }
      }));
      setStampPickerGroup(null);
      setStampPickerSelected(new Set());
    } finally {
      setBulkMarkingStamp(false);
    }
  };
  const handleToggleStampPaper = async (ann) => {
    setTogglingStampId(ann.id);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/annexure/${ann.id}`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requires_stamp_paper: !ann.requires_stamp_paper }),
      });
      const json = await res.json();
      if (json.success) patchAnnexure(ann.id, json.annexure);
      else alert(json.message || 'Failed to update');
    } catch (e) {
      alert('Failed to update: ' + e.message);
    } finally {
      setTogglingStampId(null);
    }
  };

  // Resolves the same content Preview/Edit show for this annexure (generated
  // draft if one exists, otherwise the raw template) — see the identical
  // logic in the Preview toggle below; kept in sync so "what you last saw"
  // is what gets downloaded.
  const resolveAnnexureContent = (ann, fmt) => {
    const gen = generatedMap[ann.id];
    if (gen?.docId) {
      try {
        const raw = localStorage.getItem('docs_editor_' + gen.docId);
        const savedDoc = raw ? JSON.parse(raw) : null;
        if (savedDoc?.content) return savedDoc.content;
      } catch { /* ignore */ }
    }
    return fmt?.verbatim_content || null;
  };

  const [downloadingStampId, setDownloadingStampId] = useState(null);
  const handleDownloadStampWord = async (ann, fmt) => {
    const html = resolveAnnexureContent(ann, fmt);
    if (!html) { alert('Auto Fill this item first so there is content to download.'); return; }
    setDownloadingStampId(ann.id);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/export-docx`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: ann.title || ann.annexure_ref || 'Document', html_content: html, plainExport: true }),
      });
      if (!res.ok) { alert('Download failed'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${(ann.title || ann.annexure_ref || 'Document').replace(/[^a-zA-Z0-9_\- ]/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloadingStampId(null);
    }
  };

  const [uploadingSignedId, setUploadingSignedId] = useState(null);
  const handleUploadSignedCopy = async (ann, file) => {
    if (!file) return;
    setUploadingSignedId(ann.id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', `${ann.annexure_ref || ann.title || 'Document'} - Signed Copy`);
      fd.append('description', 'Physically signed/stamped/notarized copy');
      fd.append('annexure_id', ann.id);
      fd.append('push_source', 'stamp_signed');
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, {
        method: 'POST', headers: authHeader, body: fd,
      });
      const json = await res.json();
      if (json.success) {
        if (json.annexures) setSession(s => s ? { ...s, annexures: json.annexures } : s);
        setUploadedDocs(json.uploaded_docs || []);
        showToast(`"${ann.annexure_ref || ann.title || 'Document'} - Signed Copy" added to My Docs`);
      } else {
        alert(json.message || 'Upload failed');
      }
    } catch (e) {
      alert('Upload failed: ' + e.message);
    } finally {
      setUploadingSignedId(null);
    }
  };

  // ── Annexures / License / Other Declarations — three collapsible sections.
  //    "certificate" is the internal/stored key (unchanged, for backward
  //    compatibility with existing session data and doc_group values already
  //    written by discovery) but it now displays as "Other Declarations" and
  //    is the catch-all for everything that isn't a genuine numbered
  //    annexure — see resolveDisplayGroup below. Older sessions (before
  //    doc_group existed) fall back to "annexure" so nothing silently
  //    disappears, then get re-routed by resolveDisplayGroup like anything else.
  const [openGroups, setOpenGroups] = useState({ annexure: false, license: false, certificate: false, techDocs: false });

  // Per-section search — Annexures and Other Declarations only (License
  // usually has few enough items not to need it). Filters ONLY that
  // section's own rows by title/reference, nothing else on the page.
  const [groupSearch, setGroupSearch] = useState({ annexure: '', certificate: '' });

  // Library Documents search — filters that section's own cards only, by
  // name/description/file name/library folder path.
  const [libDocSearch, setLibDocSearch] = useState('');
  const toggleGroup = (g) => setOpenGroups(prev => ({ ...prev, [g]: !prev[g] }));

  // The AI's discovery step defaults most items to doc_group: "annexure" even
  // when they have no real tender-assigned annexure/form/schedule number —
  // e.g. "Section II Item 12", a fallback label it invents when the tender
  // doesn't number the item (see runAnalysis's discovery prompt on the
  // backend). Those are affidavits/declarations/undertakings, not annexures,
  // so the Annexures section should only show items whose annexure_ref is a
  // real "Annexure ..."/"Form ..."/"Schedule ..." reference (or the tender's
  // own checklist item) — everything else routes to Other Declarations
  // alongside genuine doc_group: "certificate" items. Computed at display
  // time (not stored) so it applies retroactively to already-analyzed
  // tenders without needing to re-run analysis.
  const resolveDisplayGroup = (ann) => {
    const raw = ann.doc_group || 'annexure';
    if (raw !== 'annexure') return raw; // license / certificate stay as-is
    const ref = (ann.annexure_ref || '').trim();
    const isRealAnnexure = ann.type === 'tender_checklist' || /^(annexure|form|schedule)\b/i.test(ref);
    return isRealAnnexure ? 'annexure' : 'certificate';
  };

  // Annexures were previously left in discovery's own scan order, which
  // doesn't reliably match the tender's own numbering (e.g. Annexure-8.7,
  // 8.1, 8.4, 8.9, 8.10 in that order) — sort them properly by the numbers
  // in their own reference (8.1, 8.2, ... 8.10, not the string-sort order
  // that would put 8.10 before 8.2). The tender's own Checklist item (if
  // present) always stays first regardless.
  const naturalAnnexureCompare = (a, b) => {
    if (a.type === 'tender_checklist') return -1;
    if (b.type === 'tender_checklist') return 1;
    const numsA = (a.annexure_ref || '').match(/\d+/g)?.map(Number) || [];
    const numsB = (b.annexure_ref || '').match(/\d+/g)?.map(Number) || [];
    for (let i = 0; i < Math.max(numsA.length, numsB.length); i++) {
      const diff = (numsA[i] ?? -1) - (numsB[i] ?? -1);
      if (diff !== 0) return diff;
    }
    return (a.annexure_ref || '').localeCompare(b.annexure_ref || '');
  };

  // ── Product Documents — MSC/CE/NCC certificates the Library already has for
  //    each brand on this tender's product list (same lookup WorkspaceProducts
  //    uses for its Files column). Shown as its own section so the user can
  //    pick which ones to push, rather than the silent auto-push Products does. ──
  const [productDocs, setProductDocs]             = useState({}); // brand -> { MSC, CE, NCC }
  const [loadingProductDocs, setLoadingProductDocs] = useState(false);
  const [productDocsFetched, setProductDocsFetched] = useState(false);
  const [pushedLibraryMap, setPushedLibraryMap]   = useState({}); // key -> true
  const [pushingLibraryId, setPushingLibraryId]     = useState(null);
  const [downloadingLibraryId, setDownloadingLibraryId] = useState(null);

  useEffect(() => {
    const tidNorm = cleanBid.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      const raw = localStorage.getItem(`doc_prep_library_pushed_${tidNorm}`);
      setPushedLibraryMap(raw ? JSON.parse(raw) : {});
    } catch { setPushedLibraryMap({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanBid]);

  const persistPushedLibraryMap = (next) => {
    const tidNorm = cleanBid.replace(/[^a-zA-Z0-9]/g, '_');
    try { localStorage.setItem(`doc_prep_library_pushed_${tidNorm}`, JSON.stringify(next)); } catch { /* ignore */ }
    setPushedLibraryMap(next);
  };

  const fetchProductDocs = async () => {
    setLoadingProductDocs(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/tenders/${encodedBid}/suggestions`, { headers: authHeader });
      const json = await res.json();
      const list = json.success ? (json.data || []) : [];
      const brands = [...new Set(list.map(p => p.brand).filter(Boolean))];
      const flags = {};
      await Promise.all(brands.map(async (brand) => {
        try {
          const r = await fetch(`${API_BASE_URL}/library/brand-docs?brand=${encodeURIComponent(brand)}`, { headers: authHeader });
          const d = await r.json();
          if (d.success) flags[brand] = d.docs;
        } catch { /* ignore */ }
      }));
      setProductDocs(flags);
    } finally {
      setLoadingProductDocs(false);
      setProductDocsFetched(true);
    }
  };

  const handleDownloadLibraryMatch = async (fileId, fallbackName) => {
    setDownloadingLibraryId(fileId);
    try {
      const res = await fetch(`${API_BASE_URL}/library/file/${fileId}/download`, { headers: authHeader });
      if (!res.ok) { alert('Download failed'); return; }
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
      setDownloadingLibraryId(null);
    }
  };

  // Render-to-PDF-then-upload pattern, same as the AI Drive match push —
  // `key` is an arbitrary string identifying this pushable item (e.g. `${brand}_${tag}`).
  const handlePushLibraryFileToMyDocs = async (key, fileId, fileName) => {
    setPushingLibraryId(key);
    try {
      const dlRes = await fetch(`${API_BASE_URL}/library/file/${fileId}/download`, { headers: authHeader });
      if (!dlRes.ok) { alert('Failed to fetch document from Library'); return; }
      const blob     = await dlRes.blob();
      const safeName = (fileName || 'Document').replace(/\.[a-zA-Z0-9]+$/, '');
      const isPdf    = blob.type === 'application/pdf' || /\.pdf$/i.test(fileName || '');

      let finalUploadedDocs = null;

      if (isPdf) {
        const pdfFile = new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
        const fd = new FormData();
        fd.append('file', pdfFile);
        fd.append('name', safeName);
        fd.append('description', 'Pushed from Library (Doc Prep)');
        fd.append('annexure_id', key);
        fd.append('push_source', 'library');
        const upRes  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, { method: 'POST', headers: authHeader, body: fd });
        const upJson = await upRes.json();
        if (!upJson.success) { alert(upJson.message || 'Upload failed'); return; }
        finalUploadedDocs = upJson.uploaded_docs || [];
      } else {
        const origFile = new File([blob], fileName || 'document', { type: blob.type || 'application/octet-stream' });
        const fd1 = new FormData();
        fd1.append('file', origFile);
        fd1.append('name', safeName);
        fd1.append('description', 'Pushed from Library (Doc Prep)');
        fd1.append('annexure_id', key);
        fd1.append('push_source', 'library');
        const up1Res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, { method: 'POST', headers: authHeader, body: fd1 });
        const up1Json = await up1Res.json();
        if (!up1Json.success) { alert(up1Json.message || 'Upload failed'); return; }
        const newDoc = (up1Json.uploaded_docs || []).slice(-1)[0];

        const pdfRes = newDoc ? await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${newDoc.id}/pdf`, { headers: authHeader }) : null;
        if (!pdfRes || !pdfRes.ok) {
          finalUploadedDocs = up1Json.uploaded_docs || [];
          alert('Uploaded, but PDF conversion failed — kept in its original format.');
        } else {
          const pdfBlob = await pdfRes.blob();
          const pdfFile = new File([pdfBlob], `${safeName}.pdf`, { type: 'application/pdf' });
          const fd2 = new FormData();
          fd2.append('file', pdfFile);
          fd2.append('name', safeName);
          fd2.append('description', 'Pushed from Library (Doc Prep)');
          fd2.append('annexure_id', key);
          fd2.append('push_source', 'library');
          const up2Res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, { method: 'POST', headers: authHeader, body: fd2 });
          const up2Json = await up2Res.json();
          await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${newDoc.id}`, { method: 'DELETE', headers: authHeader }).catch(() => {});
          finalUploadedDocs = up2Json.success ? (up2Json.uploaded_docs || []) : (up1Json.uploaded_docs || []);
        }
      }

      if (finalUploadedDocs) setUploadedDocs(finalUploadedDocs);
      persistPushedLibraryMap({ ...pushedLibraryMap, [key]: true });
      showToast(`"${fileName || safeName}" added to My Docs`);
    } catch (e) {
      alert('Push to My Docs failed: ' + e.message);
    } finally {
      setPushingLibraryId(null);
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

  // Auto Fill now always ends in a fields-review popup: extract the exact
  // template (with its [FILL:*] markers) if not already pulled, then show
  // every field it needs — pre-filled from memory/company details — for the
  // user to confirm before Generate Annexure does the actual substitution.
  const handleAutoFill = async (fmt, page) => {
    setExtractingId(fmt.id);
    try {
      // Always re-extract: the (re)extraction is what gives us the field
      // list with server-resolved prefills (remembered values, then company
      // profile, then defaults) — a locally-cached verbatim_content alone
      // wouldn't carry those prefills. `page` (optional) forces extraction
      // from a specific page — used by the "recheck this page" fallback.
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/extract-template`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ annexure_id: fmt.id, ...(page ? { page } : {}) }),
      });
      const json = await res.json();
      if (!json.success) { alert(json.message); return; }
      setSession(s => s ? { ...s, formats: [...(s.formats || []).filter(f => f.id !== fmt.id), json.format] } : s);

      // "Authorized Signatory" is never a user-fillable field — that slot is
      // always the actual digital signature (Ravi Kiran) applied automatically
      // at export time, not free text typed here.
      const fields = (json.fields || []).filter(
        f => !/authoriz(?:ed|ation)?\s*signatory/i.test(`${f.label || ''} ${f.key || ''}`)
      );
      setModalAnnexure({ ...fmt, ...json.format });
      setModalDivision(json.division);
      setModalFields(fields);
      setModalThin(!!json.thin);
      setRecheckPage('');
      setShowFieldsModal(true);
    } catch (e) {
      alert('Template extraction failed: ' + e.message);
    } finally {
      setExtractingId(null);
    }
  };

  // "This doesn't look right — recheck page X" from inside the review popup:
  // re-runs extraction pinned to the page the user themselves identified in
  // the bid document, without touching anything else already analyzed.
  const handleRecheckPage = async () => {
    const pageNum = parseInt(recheckPage, 10);
    if (!pageNum || pageNum < 1) { alert('Enter a valid page number from the bid document.'); return; }
    setIsRechecking(true);
    try {
      await handleAutoFill(modalAnnexure, pageNum);
    } finally {
      setIsRechecking(false);
    }
  };

  // Row-level shortcut for the same thing, available right after a document
  // has been generated — no need to reopen the review popup first. Prompts
  // for the actual page (from looking at the bid document) and re-runs
  // extraction pinned to it; handleAutoFill still opens the review popup
  // afterward so the re-checked fields can be confirmed before regenerating.
  const handleRecheckRow = (ann, fmt) => {
    const input = window.prompt(`${ann.annexure_ref || ann.title}: which page of the bid document is it actually on?`);
    if (input === null) return; // cancelled
    const pageNum = parseInt(input, 10);
    if (!pageNum || pageNum < 1) { alert('Enter a valid page number.'); return; }
    handleAutoFill({ ...ann, ...fmt }, pageNum);
  };

  // Generate Annexure -> hand off to the SAME rich editor page "Draft with
  // OpenProcure" uses (/Docs/:docId), instead of a flattened plain-text
  // preview — that page renders real HTML (tables, alignment intact) and
  // already has Download Word / Download PDF wired up correctly per
  // department via the standalone export-docx/export-pdf + bidNo.
  const handleGenerateAnnexure = async () => {
    if (!modalAnnexure) return;
    setIsGeneratingAnnexure(true);
    try {
      const fieldsObj = Object.fromEntries(modalFields.map(f => [f.key, f.value]));
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/generate-annexure`, {
        method:  'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ annexure_id: modalAnnexure.id, fields: fieldsObj }),
      });
      const json = await res.json();
      if (!json.success) { alert(json.message); return; }

      const tidNorm = cleanBid.replace(/[^a-zA-Z0-9]/g, '_');
      const docId   = `docprep_${tidNorm}_${json.annexure_id}`;
      const title   = json.annexure_ref || modalAnnexure.title || 'Annexure';
      const annexureId = modalAnnexure.id;
      localStorage.setItem('docs_editor_' + docId, JSON.stringify({
        id:      docId,
        title,
        content: json.html_content,
        bidNo:   cleanBid,
        savedAt: new Date().toISOString(),
        source:  'doc_prep_annexure',
        annexureId,
        requiresStampPaper: !!modalAnnexure.requires_stamp_paper,
        // Generating (or later editing/saving) never pushes it into My
        // Documents on its own — that only happens when the user explicitly
        // clicks "Push to My Docs" on this annexure's row.
        pushedToMyDocs: generatedMap[annexureId]?.pushed || false,
      }));
      persistGeneratedMap({
        ...generatedMap,
        [annexureId]: { docId, title, pushed: generatedMap[annexureId]?.pushed || false },
      });
      setShowFieldsModal(false);
      navigate(`/Docs/${docId}`, { state: { title, bidNo: cleanBid, requiresStampPaper: !!modalAnnexure.requires_stamp_paper } });
    } finally {
      setIsGeneratingAnnexure(false);
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
      a.download = `${annexureId}_filled.pdf`;
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
        const title   = annexure.title || annexure.annexure_ref || 'Draft Document';
        // Store in localStorage so DocsEditor can load it immediately. Not
        // pushed to My Documents / marked Completed until the user opens it
        // and clicks Save there — same gating as Auto Fill's Generate Annexure.
        localStorage.setItem('docs_editor_' + docId, JSON.stringify({
          id:      docId,
          title,
          content: json.html_content,
          bidNo:   cleanBid,
          savedAt: new Date().toISOString(),
          source:  'doc_prep_annexure',
          annexureId: annexure.id,
          requiresStampPaper: !!annexure.requires_stamp_paper,
          pushedToMyDocs: generatedMap[annexure.id]?.pushed || false,
        }));
        persistGeneratedMap({
          ...generatedMap,
          [annexure.id]: { docId, title, pushed: generatedMap[annexure.id]?.pushed || false },
        });
        navigate(`/Docs/${docId}`, { state: { title, bidNo: cleanBid, requiresStampPaper: !!annexure.requires_stamp_paper } });
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
  // `category` is the annexure-section key ('annexure' | 'license' |
  // 'certificate') when opened from that section's own "Add Document"
  // button, or null for the generic/global one.
  const handleOpenUploadModal = (category = null, annexureId = null) => {
    setUploadMode(null);
    setUploadCategory(category);
    setUploadAnnexureId(annexureId);
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
      const docName = uploadName.trim() || uploadFile.name;
      fd.append('name', docName);
      fd.append('description', uploadDescription.trim());
      if (uploadCategory) fd.append('category', uploadCategory);
      if (uploadAnnexureId) {
        // Uploaded straight from an annexure row's own "Upload Document"
        // button — this IS the document for that row, so it goes straight
        // to My Documents (no staging) and gets tagged with annexure_id so
        // the Checklist tab can match it automatically.
        fd.append('annexure_id', uploadAnnexureId);
        fd.append('push_source', 'annexure_upload');
      } else {
        // Added from Doc Prep's generic "Add Document" — stages in
        // "Uploaded Documents" here until explicitly pushed to My
        // Documents (see handlePushSelectedToMyDocs).
        fd.append('stage_only', 'true');
      }
      const res  = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setUploadedDocs(json.uploaded_docs || []);
        if (uploadAnnexureId) {
          persistPushedUploadMap({ ...pushedUploadMap, [uploadAnnexureId]: true });
          showToast(`"${docName}" added to My Docs`);
          // Uploading a document for an item that had an AI Drive match
          // replaces that match server-side — mirror it here so the chip
          // disappears immediately instead of waiting for a full reload.
          if (json.drive_matches) setSession(s => s ? { ...s, drive_matches: json.drive_matches } : s);
        }
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

  // Library sub-flow — mirrors WorkspaceMyDocs's Add Document > Library flow.
  const fetchLibItems = useCallback(async (parentId) => {
    setLibLoading(true);
    try {
      const qs  = parentId ? `?parent_id=${parentId}` : '';
      const res = await fetch(`${API_BASE_URL}/library${qs}`, { headers: authHeader });
      const json = await res.json();
      if (json.success) {
        setLibItems(json.items || []);
        setLibBreadcrumb(json.breadcrumb || []);
      }
    } catch (e) {
      console.error('[doc-prep] fetchLibItems:', e);
    } finally {
      setLibLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenLibraryMode = () => {
    setUploadMode('library');
    setLibParentId(null);
    setLibSelected(new Set());
    fetchLibItems(null);
  };

  const handleLibNavigate = (folderId) => {
    setLibParentId(folderId);
    fetchLibItems(folderId);
  };

  const toggleLibSelect = (id) => {
    setLibSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleImportFromLibrary = async () => {
    if (libSelected.size === 0) { alert('Select at least one file.'); return; }
    setIsImportingLib(true);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/import-from-library`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: Array.from(libSelected),
          category: uploadCategory || undefined,
          annexure_id: uploadAnnexureId || undefined,
          stage_only: !uploadAnnexureId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setUploadedDocs(json.uploaded_docs || []);
        if (uploadAnnexureId) {
          persistPushedUploadMap({ ...pushedUploadMap, [uploadAnnexureId]: true });
          showToast(`${libSelected.size} document${libSelected.size === 1 ? '' : 's'} added to My Docs`);
        }
        setShowUploadModal(false);
      } else {
        alert(json.message || 'Import failed');
      }
    } catch (e) {
      alert('Import failed: ' + e.message);
    } finally {
      setIsImportingLib(false);
    }
  };

  // Builds the Download/Share formats for an uploaded/library-imported My
  // Documents file. If it's already a PDF there's nothing to pick between —
  // just one "PDF" format; otherwise offer the original file alongside a
  // LibreOffice-converted PDF (same pair the ZIP-as-PDF picker already uses).
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

  // View — always as a PDF (server converts non-PDF files on the fly), same
  // as My Documents' own "View" button.
  const handleViewUserDoc = async (doc) => {
    setViewingDocId(doc.id);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${doc.id}/pdf`, { headers: authHeader });
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
      setViewingDocId(null);
    }
  };

  const handleRenameUserDoc = async (doc) => {
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

  const handleDeleteUserDoc = async (doc) => {
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    setDeletingDocId(doc.id);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/${doc.id}`, {
        method: 'DELETE', headers: authHeader,
      });
      const json = await res.json();
      if (json.success) {
        setUploadedDocs(json.uploaded_docs || []);
        setUploadedSelectedIds(prev => { const next = new Set(prev); next.delete(doc.id); return next; });
      } else {
        alert(json.message || 'Delete failed');
      }
    } catch (e) {
      alert('Delete failed: ' + e.message);
    } finally {
      setDeletingDocId(null);
    }
  };

  const toggleUploadedSelectMode = () => {
    setUploadedSelectMode(prev => !prev);
    setUploadedSelectedIds(new Set());
  };

  const toggleUploadedSelect = (id) => {
    setUploadedSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Pushes the selected staged documents into My Documents (flips
  // pushed_to_mydocs -> true server-side).
  const handlePushSelectedToMyDocs = async () => {
    if (uploadedSelectedIds.size === 0) return;
    setPushingToMyDocs(true);
    try {
      const res = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/uploaded/push-to-mydocs`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(uploadedSelectedIds) }),
      });
      const json = await res.json();
      if (json.success) {
        const count = uploadedSelectedIds.size;
        setUploadedDocs(json.uploaded_docs || []);
        setUploadedSelectMode(false);
        setUploadedSelectedIds(new Set());
        showToast(count === 1 ? '1 document added to My Docs' : `${count} documents added to My Docs`);
      } else {
        alert(json.message || 'Push to My Docs failed');
      }
    } catch (e) {
      alert('Push to My Docs failed: ' + e.message);
    } finally {
      setPushingToMyDocs(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const formats  = session?.formats  || [];
  const annexures = session?.annexures || [];
  // AI Drive suggestions disabled per request — the backend still computes
  // and stores drive_matches as before, this just stops the UI from showing
  // or acting on them, and treats every row as if it had no match (so
  // Upload Document / Delete stay available instead of being hidden behind
  // a suggestion nobody can see). Flip back to true to re-enable.
  const SHOW_AI_DRIVE_SUGGESTIONS = false;
  const driveMatches = SHOW_AI_DRIVE_SUGGESTIONS ? (session?.drive_matches || {}) : {};

  const renderAnnexurePanel = () => {
    if (loadingSession) return <div style={styles.centered}><div style={styles.spinner} /></div>;

    const status          = session?.status;
    const filledTemplates = session?.filled_templates || {};


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
                    <FileIcon size={14} color="#64748b" style={{ flexShrink: 0 }} />
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
                      <FileIcon size={14} color="#64748b" style={{ flexShrink: 0 }} />
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

        {/* Hidden input for the "Computer Document" option in the source-picker modal below */}
        <input ref={computerFileInputRef} type="file" style={{ display: 'none' }} onChange={handleBidUpload} disabled={uploadingBid} />

        {/* Upload zone */}
        {(!session?.bid_doc_path || session?.gemPdfStatus === 'not_found') && (
          <div style={styles.uploadZone} onClick={handleOpenBidSourceModal} role="button" tabIndex={0}>
            <Upload size={32} color="#94a3b8" />
            <p style={{ margin: '0.5rem 0 0', fontWeight: 600, color: '#374151' }}>
              {uploadingBid ? 'Uploading…' : 'Upload Bid Document'}
            </p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>From Workspace Documents, or pick a file from this computer</p>
          </div>
        )}

        {/* Replace file option when already loaded */}
        {session?.bid_doc_path && (
          <button onClick={handleOpenBidSourceModal} style={{ ...styles.smallBtn, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <Upload size={14} /> {uploadingBid ? 'Uploading…' : 'Replace File'}
          </button>
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
                      {canDelete && (
                        <button onClick={() => handleDeleteAdditional(doc.id)} style={{ ...styles.iconBtn, color: '#ef4444' }} title="Remove">
                          <X size={14} />
                        </button>
                      )}
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
              AI will find all annexures, affidavits, and certificates{additionalDocs.length > 0 ? ` from all ${1 + additionalDocs.length} documents` : ''} and flag which ones have a prescribed format. Estimated time: 2–10 min.
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
                <button
                  onClick={() => setShowReanalyzeConfirm(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    background: '#b91c1c', color: '#fff', border: '1px solid #b91c1c',
                    borderRadius: 6, padding: '0.45rem 0.9rem', fontSize: '0.8125rem', fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 1px 3px rgba(185,28,28,0.35)',
                  }}
                  title="Wipes everything and rebuilds this tender's documentation from scratch"
                >
                  <RefreshCw size={14} /> Re-analyze
                </button>
              </div>
            </div>
            {additionalDocs.length > 0 && (
              <p style={{ margin: '0 0 1rem', fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.375rem 0.75rem', borderRadius: '6px', display: 'inline-block' }}>
                Analysis based on: Bid Document + {additionalDocs.map(d => d.doc_label).join(', ')}
              </p>
            )}

            {/* Generated / Pending filter — "generated" means Auto Fill has
                already produced a document for it (tracked in generatedMap);
                "pending" means it has a prescribed format but hasn't been
                auto-filled yet. */}
            {(() => {
              const generatedCount = annexures.filter(a => !!generatedMap[a.id]).length;
              const pendingCount   = annexures.filter(a => a.has_prescribed_format && !generatedMap[a.id]).length;
              const draftCount     = annexures.filter(a => !!generatedMap[a.id]?.draftSavedAt && !generatedMap[a.id]?.pushed).length;
              return (
                <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all',       label: `All (${annexures.length})` },
                    { id: 'generated', label: `Generated (${generatedCount})` },
                    { id: 'pending',   label: `Pending (${pendingCount})` },
                    { id: 'draft',     label: `Draft (${draftCount})`, accent: true },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setGenFilter(f.id)}
                      style={{
                        background: genFilter === f.id
                          ? (f.id === 'draft' ? '#92400e' : '#1e3a8a')
                          : (f.id === 'draft' ? '#fef3c7' : '#f1f5f9'),
                        color: genFilter === f.id
                          ? '#fff'
                          : (f.id === 'draft' ? '#92400e' : '#374151'),
                        border: f.id === 'draft' ? '1px solid #fde68a' : 'none',
                        borderRadius: 999, padding: '0.35rem 0.85rem',
                        cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Annexures / License / Certificate — three collapsible sections,
                classified by the AI's doc_group tag. Within each, rows stay in
                the SAME sequential order they appear in the bid document (the
                discovery call scans the document top-to-bottom, so `annexures`
                is already in that order). */}
            {[
              { key: 'annexure',   label: 'Annexures',          bg: '#eef2ff', text: '#3730a3' },
              { key: 'license',    label: 'License',            bg: '#fef9c3', text: '#854d0e' },
              { key: 'certificate',label: 'Other Declarations', bg: '#dcfce7', text: '#166534' },
            ].map(({ key, label, bg, text }) => {
              const baseGroup = annexures
                .filter(a => resolveDisplayGroup(a) === key)
                .filter(a => {
                  if (genFilter === 'generated') return !!generatedMap[a.id];
                  if (genFilter === 'pending')   return a.has_prescribed_format && !generatedMap[a.id];
                  if (genFilter === 'draft')     return !!generatedMap[a.id]?.draftSavedAt && !generatedMap[a.id]?.pushed;
                  return true;
                });
              if (!baseGroup.length) return null;
              const searchable = key in groupSearch;
              const searchTerm = (groupSearch[key] || '').trim().toLowerCase();
              const filtered = searchTerm
                ? baseGroup.filter(a => `${a.annexure_ref || ''} ${a.title || ''}`.toLowerCase().includes(searchTerm))
                : baseGroup;
              const group = key === 'annexure' ? [...filtered].sort(naturalAnnexureCompare) : filtered;
              const isOpen = openGroups[key];
              return (
                <div key={key} style={{ marginBottom: '1.5rem' }}>
                  <div
                    style={{ ...styles.categoryHeader(bg, text), cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleGroup(key)}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {label}
                      <span style={{ fontWeight: 500, opacity: 0.7 }}>({group.length})</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {searchable && (
                        <input
                          type="text"
                          value={groupSearch[key]}
                          onChange={(e) => setGroupSearch(s => ({ ...s, [key]: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          placeholder={`Search ${label.toLowerCase()}...`}
                          style={{
                            background: 'rgba(255,255,255,0.75)', border: `1px solid ${text}33`, borderRadius: 6,
                            padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: text, width: '320px', maxWidth: '100%',
                          }}
                        />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const tidNorm = cleanBid.replace(/[^a-zA-Z0-9]/g, '_');
                          navigate(`/Docs/ws_${tidNorm}_doc_${Date.now()}`);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.6)', border: `1px solid ${text}33`, color: text, borderRadius: 6, padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                        title={`Draft a new document in ${label}`}
                      >
                        <FileSignature size={12} /> New Document
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenUploadModal(key); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.6)', border: `1px solid ${text}33`, color: text, borderRadius: 6, padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                        title={`Add a document to ${label}`}
                      >
                        <Plus size={12} /> Add Document
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setStampPickerGroup(key); setStampPickerSelected(new Set()); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.6)', border: `1px solid ${text}33`, color: text, borderRadius: 6, padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                        title={`Pick one or more ${label.toLowerCase()} documents to mark as Stamp Paper`}
                      >
                        <FileSignature size={12} /> Stamp Paper
                      </button>
                    </span>
                  </div>
                  {isOpen && searchTerm && group.length === 0 && (
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: '#9ca3af' }}>
                      No {label.toLowerCase()} match "{groupSearch[key]}".
                    </p>
                  )}
                  {isOpen && group.length > 0 && (
                    <div
                      style={
                        // Other Declarations routinely has 20-30 items (every
                        // affidavit/undertaking/declaration the tender's own
                        // checklist requires) — a full-width stacked row per
                        // item eats an enormous amount of vertical space for
                        // what's usually just a title + "Draft"/"Upload"
                        // button. A compact multi-column card grid fits far
                        // more on screen at once. Annexures/License stay as
                        // full-width rows since they carry more per-item
                        // detail (page order, Auto Fill review, Regenerate/
                        // Recheck, stamp-paper signed-copy tracking, etc.)
                        // that's cramped in a narrow card.
                        key === 'certificate'
                          ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'start' }
                          : { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }
                      }
                    >
                      {group.map(ann => {
                        const fmt = formats.find(f => f.id === ann.id);
                        const catStyle = CATEGORY_STYLE[ann.category] || { bg: '#f1f5f9', text: '#475569', label: 'Other' };
                        const isEditing = editingAnnexureId === ann.id;
                        return (
                          <div key={ann.id} style={styles.annexureRow}>
                            {isEditing ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                                <div>
                                  <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '0.2rem' }}>Reference / Title</label>
                                  <input
                                    value={editAnnexureRef}
                                    onChange={e => setEditAnnexureRef(e.target.value)}
                                    placeholder="e.g. Annexure I"
                                    style={styles.editInput}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '0.2rem' }}>Description</label>
                                  <input
                                    value={editAnnexureTitle}
                                    onChange={e => setEditAnnexureTitle(e.target.value)}
                                    placeholder="Short description"
                                    style={styles.editInput}
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                  <button onClick={handleCancelEditAnnexure} disabled={savingAnnexureEdit} style={styles.ghostBtn}>Cancel</button>
                                  <button onClick={() => handleSaveEditAnnexure(ann.id)} disabled={savingAnnexureEdit} style={{ ...styles.primaryBtnSm, background: '#166534', color: '#fff' }}>
                                    {savingAnnexureEdit ? 'Saving…' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            ) : (() => {
                              const compact = key === 'certificate';

                              const titleRow = (
                                <div style={{ display: 'flex', alignItems: compact ? 'flex-start' : 'center', justifyContent: compact ? 'space-between' : 'flex-start', gap: '0.5rem', minWidth: 0, width: '100%' }}>
                                  <p style={{ margin: 0, fontWeight: 700, fontSize: compact ? '0.8125rem' : '0.875rem', color: '#1f2937', ...(compact ? { flex: 1, minWidth: 0 } : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) }}>
                                    {ann.annexure_ref || ann.title}
                                  </p>
                                  {compact && ann.page_hint && (
                                    <span style={{ fontSize: '0.6875rem', color: '#6b7280', whiteSpace: 'nowrap', flexShrink: 0 }}>{ann.page_hint}</span>
                                  )}
                                  {ann.requires_stamp_paper && (
                                    <span
                                      onClick={() => togglingStampId !== ann.id && handleToggleStampPaper(ann)}
                                      style={{ ...styles.typePill('#fef3c7', '#92400e'), flexShrink: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                      title="Needs physical stamp paper + wet signature/notarization — click to unmark"
                                    >
                                      Stamp Paper <X size={11} />
                                    </span>
                                  )}
                                </div>
                              );

                              const descriptionRow = compact
                                ? (ann.annexure_ref && ann.title && (
                                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569', lineHeight: 1.35 }}>{ann.title}</p>
                                ))
                                : ((ann.annexure_ref && ann.title) || ann.page_hint) && (
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {ann.annexure_ref && ann.title && (
                                      <p style={{ margin: 0, fontSize: '0.8125rem', color: '#475569' }}>{ann.title}</p>
                                    )}
                                    {ann.page_hint && (
                                      <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{ann.page_hint}</span>
                                    )}
                                  </div>
                                );

                              const lastUpdatedRow = !compact && (() => {
                                const lastUpdated = getAnnexureLastUpdated(ann.id);
                                return lastUpdated ? (
                                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>
                                    updated: {formatDocDate(lastUpdated)}
                                  </p>
                                ) : null;
                              })();

                              return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.375rem' : '0.5rem', width: '100%' }}>
                                {/* Row 1: title + page (compact) or title + Stamp Paper pill */}
                                {titleRow}
                                {lastUpdatedRow}
                                {/* Row 2 (compact): description, right after the title */}
                                {compact && descriptionRow}
                                {/* Row 3: all actions — small icon-first buttons for the compact
                                    layout, wrapping onto extra lines only if they don't fit one row */}
                                <div style={{
                                  display: 'flex', gap: compact ? '0.3rem' : '0.5rem', flexWrap: 'wrap', width: '100%',
                                  // The button styles below (primaryBtnSm/ghostBtn/smallBtn) are shared
                                  // with the Annexures/License rows and hardcode their own padding/font
                                  // size, so scaling the whole row down visually (rather than touching
                                  // every individual button style) is what actually makes them small
                                  // and compact here without risking the other two sections' layout.
                                  ...(compact ? { transform: 'scale(0.86)', transformOrigin: 'left top' } : {}),
                                }}>
                                  <button onClick={() => handleStartEditAnnexure(ann)} style={styles.ghostBtn} title="Edit title">
                                    <Edit2 size={13} />
                                  </button>
                                  {fmt?.verbatim_content && (
                                    <button onClick={() => setSelectedAnnexure(selectedAnnexure?.id === ann.id ? null : { ...ann, ...fmt })} style={styles.ghostBtn} title={selectedAnnexure?.id === ann.id ? 'Hide preview' : 'Preview'}>
                                      <Eye size={13} /> {!compact && (selectedAnnexure?.id === ann.id ? 'Hide' : 'Preview')}
                                    </button>
                                  )}
                                  {ann.has_prescribed_format && !generatedMap[ann.id] && (
                                    <button
                                      onClick={() => handleAutoFill({ ...ann, ...fmt })}
                                      disabled={extractingId === ann.id}
                                      style={styles.primaryBtnSm}
                                      title={extractingId === ann.id ? 'Extracting…' : 'Auto Fill'}
                                    >
                                      <Wand2 size={13} /> {!compact && (extractingId === ann.id ? 'Extracting…' : 'Auto Fill')}
                                    </button>
                                  )}
                                  {generatedMap[ann.id] && (
                                    <>
                                      <button
                                        onClick={() => navigate(`/Docs/${generatedMap[ann.id].docId}`, { state: { title: generatedMap[ann.id].title, bidNo: cleanBid } })}
                                        style={{ ...styles.primaryBtnSm, background: '#2563eb', color: '#fff' }}
                                        title="Edit"
                                      >
                                        <Edit2 size={13} /> {!compact && 'Edit'}
                                      </button>
                                      <DownloadShareButtons formats={buildGeneratedFormats(generatedMap[ann.id])} />
                                      {ann.has_prescribed_format && (
                                        <button
                                          onClick={() => handleAutoFill({ ...ann, ...fmt })}
                                          disabled={extractingId === ann.id}
                                          style={styles.ghostBtn}
                                          title="Re-run Auto Fill and regenerate this document's content (e.g. if a table or field came out wrong) — this overwrites the current draft, not a new copy"
                                        >
                                          <RefreshCw size={13} /> {!compact && (extractingId === ann.id ? 'Regenerating…' : 'Regenerate')}
                                        </button>
                                      )}
                                      {ann.has_prescribed_format && (
                                        <button
                                          onClick={() => handleRecheckRow(ann, fmt)}
                                          disabled={extractingId === ann.id}
                                          style={styles.ghostBtn}
                                          title="Came out blank or wrong? Tell it the actual page in the bid document and re-extract just this one item — no full re-analysis"
                                        >
                                          <Search size={13} /> {!compact && 'Recheck Page'}
                                        </button>
                                      )}
                                      {ann.requires_stamp_paper ? (
                                        <>
                                          <button
                                            onClick={() => handleDownloadStampWord(ann, fmt)}
                                            disabled={downloadingStampId === ann.id}
                                            style={{ ...styles.primaryBtnSm, background: '#b45309', color: '#fff' }}
                                            title="Plain Word document — no letterhead, no auto-signature — ready to print on stamp paper"
                                          >
                                            <Download size={13} /> {!compact && (downloadingStampId === ann.id ? 'Downloading…' : 'Download Word (Stamp Paper)')}
                                          </button>
                                          {ann.stamp_status === 'uploaded' ? (
                                            <span style={styles.typePill('#dcfce7', '#166534')} title="Signed copy uploaded and in My Documents">
                                              <CheckCircle size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Signed Copy Uploaded
                                            </span>
                                          ) : (
                                            <span style={styles.typePill('#fee2e2', '#991b1b')}>Awaiting Signed Copy</span>
                                          )}
                                          <label
                                            style={{ ...styles.ghostBtn, cursor: uploadingSignedId === ann.id ? 'not-allowed' : 'pointer', opacity: uploadingSignedId === ann.id ? 0.6 : 1, whiteSpace: 'nowrap', flexShrink: 0 }}
                                            title="Upload the printed, signed, stamped/notarized scan"
                                          >
                                            <Upload size={13} /> {!compact && (uploadingSignedId === ann.id ? 'Uploading…' : ann.stamp_status === 'uploaded' ? 'Replace Signed Copy' : 'Upload Signed Copy')}
                                            <input
                                              type="file"
                                              style={{ display: 'none' }}
                                              disabled={uploadingSignedId === ann.id}
                                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadSignedCopy(ann, f); e.target.value = ''; }}
                                            />
                                          </label>
                                        </>
                                      ) : generatedMap[ann.id].pushed ? (
                                        <span style={styles.typePill('#dcfce7', '#166534')}>
                                          <CheckCircle size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Completed
                                        </span>
                                      ) : (
                                        <>
                                          <span style={styles.typePill('#fee2e2', '#991b1b')} title="Not currently in My Documents — generate/edit it and click Push to My Docs">
                                            Not in My Docs
                                          </span>
                                          {generatedMap[ann.id].draftSavedAt && (
                                            <span style={styles.typePill('#fef9c3', '#854d0e')} title={`Draft saved ${new Date(generatedMap[ann.id].draftSavedAt).toLocaleString()}`}>
                                              Draft saved
                                            </span>
                                          )}
                                          <button
                                            onClick={() => handlePushRenderUpload(ann.id)}
                                            disabled={pushingGeneratedId === ann.id}
                                            style={{ ...styles.primaryBtnSm, background: '#166534', color: '#fff' }}
                                            title="Render to PDF and add it to My Documents"
                                          >
                                            <CheckCircle size={13} /> {!compact && (pushingGeneratedId === ann.id ? 'Pushing…' : 'Push to My Docs')}
                                          </button>
                                        </>
                                      )}
                                    </>
                                  )}
                                  {ann.category !== 'certificate' && !ann.has_prescribed_format && !generatedMap[ann.id] && (
                                    <button onClick={() => handleDraftWithOllama({ ...ann, ...(fmt || {}) })} style={{ ...styles.primaryBtnSm, background: '#7c3aed', color: '#fff' }} title="Draft with OpenProcure">
                                      <Sparkles size={13} /> {!compact && 'Draft with OpenProcure'}
                                    </button>
                                  )}

                                  {/* Nothing to Auto Fill here (no prescribed format) and not
                                      already satisfied by an AI Drive match — the user has to
                                      supply this document themselves, so offer a direct upload
                                      straight into My Documents, tagged to this row. */}
                                  {!ann.has_prescribed_format && !generatedMap[ann.id] && !driveMatches[ann.id] && (
                                    pushedUploadMap[ann.id] ? (
                                      <span style={styles.typePill('#dcfce7', '#166534')}>
                                        <CheckCircle size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Uploaded
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleOpenUploadModal(null, ann.id)}
                                        style={{ ...styles.primaryBtnSm, background: '#0f766e', color: '#fff' }}
                                        title="Upload this document from your computer or the Library — goes straight to My Documents"
                                      >
                                        <Upload size={13} /> {!compact && 'Upload Document'}
                                      </button>
                                    )
                                  )}

                                  {canDelete && !ann.has_prescribed_format && !driveMatches[ann.id] && ann.category === 'certificate' && (
                                    <button
                                      onClick={() => handleDeleteAnnexure(ann.id)}
                                      disabled={deletingAnnexureId === ann.id}
                                      style={{ ...styles.smallBtn, color: '#ef4444', border: '1px solid #fecaca' }}
                                      title="Remove this item from the list"
                                    >
                                      <Trash2 size={13} /> {!compact && (deletingAnnexureId === ann.id ? 'Removing…' : 'Delete')}
                                    </button>
                                  )}
                                  </div>
                                {/* Row 4 (non-compact only): description + page hint, at the bottom as before */}
                                {!compact && descriptionRow}
                              </div>
                              );
                            })()}
                            {/* AI Drive already has a document that satisfies this requirement —
                                shown as a compact "selected file" chip: cut removes the match
                                (this row goes back to needing a manual upload), and Upload lets
                                the user supply their own file, which replaces this match — see
                                uploadUserDocument's drive_matches clearing on the backend.
                                Currently disabled — see SHOW_AI_DRIVE_SUGGESTIONS above, which
                                makes driveMatches empty everywhere, so this block never renders
                                and Upload Document/Delete stay available on every row instead. */}
                            {!isEditing && !fmt && driveMatches[ann.id] && (
                              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                <div style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '999px',
                                  padding: '0.3rem 0.4rem 0.3rem 0.7rem', maxWidth: '100%',
                                }}>
                                  <FileIcon size={13} color="#166534" style={{ flexShrink: 0 }} />
                                  <span
                                    title={driveMatches[ann.id].reason ? `${driveMatches[ann.id].doc_name} — ${driveMatches[ann.id].reason}` : driveMatches[ann.id].doc_name}
                                    style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}
                                  >
                                    {driveMatches[ann.id].doc_name}
                                  </span>
                                  <button
                                    onClick={() => handleDownloadDriveMatch(driveMatches[ann.id].drive_doc_id, driveMatches[ann.id].doc_name)}
                                    disabled={downloadingDriveDocId === driveMatches[ann.id].drive_doc_id}
                                    style={{ display: 'inline-flex', border: 'none', background: 'transparent', color: '#166534', cursor: 'pointer', padding: '0.2rem', borderRadius: '999px', flexShrink: 0 }}
                                    title={downloadingDriveDocId === driveMatches[ann.id].drive_doc_id ? 'Downloading…' : 'Download'}
                                  >
                                    <Download size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleOpenUploadModal(null, ann.id)}
                                    style={{ display: 'inline-flex', border: 'none', background: 'transparent', color: '#166534', cursor: 'pointer', padding: '0.2rem', borderRadius: '999px', flexShrink: 0 }}
                                    title="Upload your own file instead — replaces this match"
                                  >
                                    <Upload size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveDriveMatch(ann.id)}
                                    disabled={removingDriveMatchId === ann.id}
                                    style={{ display: 'inline-flex', border: 'none', background: 'transparent', color: '#991b1b', cursor: 'pointer', padding: '0.2rem', borderRadius: '999px', flexShrink: 0 }}
                                    title={removingDriveMatchId === ann.id ? 'Removing…' : 'Cut — remove this match'}
                                  >
                                    <Scissors size={13} />
                                  </button>
                                </div>
                                {!pushedDriveMap[ann.id] && (
                                  <button
                                    onClick={() => handlePushDriveMatchToMyDocs(ann.id, driveMatches[ann.id].drive_doc_id, driveMatches[ann.id].doc_name)}
                                    disabled={pushingDriveId === ann.id}
                                    style={{ ...styles.ghostBtn, alignSelf: 'flex-start' }}
                                    title="Convert to PDF and add it to My Documents"
                                  >
                                    <CheckCircle size={13} /> {pushingDriveId === ann.id ? 'Pushing…' : 'Push to My Docs'}
                                  </button>
                                )}
                              </div>
                            )}
                            {!isEditing && selectedAnnexure?.id === ann.id && fmt && (() => {
                              // Once Auto Fill has generated this annexure, its filled
                              // content lives in localStorage (same record the Edit
                              // button opens) — preview that instead of the raw
                              // [FILL:*] template, so Preview always matches Edit.
                              const gen = generatedMap[ann.id];
                              let filledHtml = null;
                              if (gen?.docId) {
                                try {
                                  const raw = localStorage.getItem('docs_editor_' + gen.docId);
                                  const savedDoc = raw ? JSON.parse(raw) : null;
                                  if (savedDoc?.content) filledHtml = savedDoc.content;
                                } catch { /* ignore */ }
                              }
                              if (filledHtml) {
                                return <div style={{ ...styles.verbatimBox, width: '100%', fontFamily: 'inherit', background: '#fff' }} dangerouslySetInnerHTML={{ __html: filledHtml }} />;
                              }
                              return fmt.is_html
                                ? <div style={{ ...styles.verbatimBox, width: '100%', fontFamily: 'inherit', background: '#fff' }} dangerouslySetInnerHTML={{ __html: fmt.verbatim_content }} />
                                : <pre style={{ ...styles.verbatimBox, width: '100%' }}>{fmt.verbatim_content}</pre>;
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Library Documents — user-uploaded / company-drive reference documents
                for this tender's division, shown after Annexures/License/Other
                Declarations; never analyzed/drafted. Stages here (pushed_to_mydocs: false) until
                explicitly selected and pushed into the workspace's My Documents. */}
            <div style={{ marginBottom: '1.5rem' }}>
                <div
                  style={{ ...styles.categoryHeader('#f1f5f9', '#475569'), flexWrap: 'wrap', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggleGroup('techDocs')}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    {openGroups.techDocs ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Library Documents
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={libDocSearch}
                      onChange={(e) => setLibDocSearch(e.target.value)}
                      placeholder="Search library documents..."
                      style={{
                        background: 'rgba(255,255,255,0.75)', border: '1px solid #47556933', borderRadius: 6,
                        padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: '#475569', width: '320px', maxWidth: '100%',
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{uploadedDocs.filter(d => d.from_library || (!d.push_source || !['annexure','drive'].includes(d.push_source))).length} item{uploadedDocs.filter(d => d.from_library || (!d.push_source || !['annexure','drive'].includes(d.push_source))).length !== 1 ? 's' : ''}</span>
                    {uploadedSelectMode ? (
                      <>
                        <button
                          onClick={handlePushSelectedToMyDocs}
                          disabled={uploadedSelectedIds.size === 0 || pushingToMyDocs}
                          style={{ ...styles.smallBtn, background: '#166534', color: '#fff', opacity: (uploadedSelectedIds.size === 0 || pushingToMyDocs) ? 0.6 : 1 }}
                        >
                          <CheckCircle size={12} /> {pushingToMyDocs ? 'Pushing…' : `Push ${uploadedSelectedIds.size || ''} to My Docs`}
                        </button>
                        <button onClick={toggleUploadedSelectMode} style={styles.smallBtn}>
                          <X size={12} /> Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={toggleUploadedSelectMode} disabled={uploadedDocs.filter(d => d.from_library || (!d.push_source || !['annexure','drive'].includes(d.push_source))).length === 0} style={{ ...styles.smallBtn, opacity: uploadedDocs.filter(d => d.from_library || (!d.push_source || !['annexure','drive'].includes(d.push_source))).length === 0 ? 0.5 : 1 }}>
                          Select
                        </button>
                        <button onClick={() => handleOpenUploadModal(null)} style={{ ...styles.smallBtn, background: '#166534', color: '#fff' }}>
                          <Plus size={12} /> Add Document
                        </button>
                      </>
                    )}
                  </span>
                </div>

                {/* Only show library-fetched docs and docs explicitly added by the user.
                    Exclude docs auto-pushed from generated annexures or AI-drive matches
                    since those are already tracked in their own sections. */}
                {openGroups.techDocs && (() => {
                  const baseVisibleDocs = uploadedDocs.filter(doc =>
                    doc.from_library ||
                    (!doc.push_source || !['annexure', 'drive'].includes(doc.push_source))
                  );
                  const searchTerm = libDocSearch.trim().toLowerCase();
                  const visibleDocs = searchTerm
                    ? baseVisibleDocs.filter(doc =>
                        `${doc.name || ''} ${doc.description || ''} ${doc.file_name || ''} ${doc.library_path || ''}`
                          .toLowerCase().includes(searchTerm)
                      )
                    : baseVisibleDocs;
                  if (searchTerm && visibleDocs.length === 0) {
                    return <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: '#9ca3af' }}>No library documents match "{libDocSearch}".</p>;
                  }
                  return visibleDocs.length === 0 ? (
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: '#9ca3af' }}>No library or uploaded documents yet.</p>
                  ) : (
                  <div style={styles.annexureGrid}>
                    {visibleDocs.map(doc => (
                      <div key={doc.id} style={styles.annexureCard}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          {uploadedSelectMode && (
                            <input
                              type="checkbox"
                              checked={uploadedSelectedIds.has(doc.id)}
                              onChange={() => toggleUploadedSelect(doc.id)}
                              style={{ marginTop: 3, cursor: 'pointer', flexShrink: 0 }}
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#1f2937', lineHeight: 1.4 }}>
                              {doc.name}
                            </p>
                            {doc.description && doc.description !== doc.name && (
                              <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>{doc.description}</p>
                            )}
                            {doc.file_name && doc.file_name !== doc.name && (
                              <p style={{ margin: '0.375rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>{doc.file_name}</p>
                            )}
                            {doc.uploaded_at && (
                              <p style={{ margin: '0.375rem 0 0', fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                updated: {formatDocDate(doc.uploaded_at)}
                              </p>
                            )}

                            {/* Library file path or Uploaded Document badge */}
                            {doc.from_library || doc.library_path ? (
                              <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'flex-start', gap: '0.375rem', maxWidth: '100%' }}>
                                <span
                                  title={doc.library_path ? libraryFolderPath(doc.library_path) : 'Library'}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'flex-start',
                                    gap: '0.35rem',
                                    fontSize: '0.75rem',
                                    color: '#475569',
                                    background: '#f1f5f9',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    padding: '3px 8px',
                                    fontWeight: 600,
                                    maxWidth: '100%',
                                  }}
                                >
                                  <Folder size={12} color="#64748b" style={{ flexShrink: 0, marginTop: '1px' }} />
                                  {/* Full path, no truncation — the card is wide enough
                                      (see the wider annexureGrid columns above) that this
                                      wraps onto as many lines as it needs instead of cutting off. */}
                                  <span style={{ wordBreak: 'break-word' }}>
                                    {doc.library_path ? libraryFolderPath(doc.library_path) : 'Library'}
                                  </span>
                                </span>
                              </div>
                            ) : (
                              <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    fontSize: '0.72rem',
                                    color: '#475569',
                                    background: '#f1f5f9',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '5px',
                                    padding: '2px 7px',
                                    fontWeight: 600,
                                  }}
                                >
                                  <Upload size={11} color="#64748b" /> Uploaded Document
                                </span>
                              </div>
                            )}
                          </div>
                          {doc.pushed_to_mydocs && (
                            <span style={styles.typePill('#dcfce7', '#166534')}>
                              <CheckCircle size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> In My Docs
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleViewUserDoc(doc)}
                            disabled={viewingDocId === doc.id}
                            style={{ ...styles.primaryBtnSm, background: '#1d4ed8', color: '#fff' }}
                          >
                            <Eye size={13} /> {viewingDocId === doc.id ? 'Opening…' : 'View'}
                          </button>
                          <DownloadShareButtons formats={buildUploadedDocFormats(doc)} hideShare />

                          {canDelete && (
                            <button
                              onClick={() => handleDeleteUserDoc(doc)}
                              disabled={deletingDocId === doc.id}
                              style={{ ...styles.smallBtn, background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  );
                })()}
            </div>

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
            {fillAnnexure.is_html
              ? <div style={{ ...styles.verbatimBox, fontFamily: 'inherit', background: '#fff' }} dangerouslySetInnerHTML={{ __html: fillAnnexure.verbatim_content }} />
              : <pre style={styles.verbatimBox}>{fillAnnexure.verbatim_content}</pre>
            }
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
                <FileText size={15} /> Generate PDF
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
            <p>Click Auto Fill on an annexure with a prescribed format to extract and fill its template.</p>
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

  const DOC_TAGS = ['MSC', 'CE', 'NCC'];

  const renderProductDocsPanel = () => {
    const brands = Object.keys(productDocs);
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>Product Documents</h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
              MSC / CE / NCC certificates the Library already has for this tender's product brands — pick which ones to push.
            </p>
          </div>
          <button onClick={fetchProductDocs} disabled={loadingProductDocs} style={styles.smallBtn}>
            <RefreshCw size={13} /> {loadingProductDocs ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {loadingProductDocs && !productDocsFetched && (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>Looking up product documents…</p>
        )}

        {productDocsFetched && brands.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#9ca3af' }}>
            <Package size={40} color="#cbd5e1" style={{ marginBottom: 12 }} />
            <p style={{ margin: 0 }}>No product brands found, or the Library has no matching MSC/CE/NCC documents yet.</p>
          </div>
        )}

        {brands.map(brand => (
          <div key={brand} style={{ marginBottom: '1.25rem' }}>
            <div style={styles.categoryHeader('#f1f5f9', '#475569')}>
              <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{brand}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              {DOC_TAGS.map(tag => {
                const doc = productDocs[brand]?.[tag];
                if (!doc?.id) return null;
                const key = `${brand}_${tag}`;
                return (
                  <div key={tag} style={styles.annexureRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', flexWrap: 'wrap' }}>
                      <span style={styles.typePill('#dbeafe', '#1e40af')}>{tag}</span>
                      <div style={{ flex: 1, minWidth: '160px' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#1f2937' }}>{doc.name}</p>
                        {doc.library_path && (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontSize: '0.72rem',
                                color: '#475569',
                                background: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                borderRadius: '5px',
                                padding: '2px 6px',
                                fontWeight: 600,
                              }}
                            >
                              <Folder size={11} color="#64748b" />
                              {libraryFolderPath(doc.library_path)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleDownloadLibraryMatch(doc.id, doc.name)}
                          disabled={downloadingLibraryId === doc.id}
                          style={{ ...styles.primaryBtnSm, background: '#1d4ed8', color: '#fff' }}
                        >
                          <Download size={13} /> {downloadingLibraryId === doc.id ? 'Downloading…' : 'Download'}
                        </button>
                        {pushedLibraryMap[key] ? (
                          <span style={styles.typePill('#dcfce7', '#166534')}>
                            <CheckCircle size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Completed
                          </span>
                        ) : (
                          <>
                            <span style={styles.typePill('#fee2e2', '#991b1b')}>Not in My Docs</span>
                            <button
                              onClick={() => handlePushLibraryFileToMyDocs(key, doc.id, doc.name)}
                              disabled={pushingLibraryId === key}
                              style={{ ...styles.primaryBtnSm, background: '#166534', color: '#fff' }}
                              title="Convert to PDF and add it to My Documents"
                            >
                              <CheckCircle size={13} /> {pushingLibraryId === key ? 'Pushing…' : 'Push to My Docs'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
          { id: 'summary',   label: 'Tender Summary',     icon: Brain          },
          { id: 'annexures', label: 'Annexure Generator', icon: FileText       },
          { id: 'autofill',  label: 'Auto Fill',          icon: Wand2          },
          { id: 'editor',    label: 'Document Editor',    icon: FileSignature  },
          { id: 'drive',     label: 'AI Drive',           icon: Database       },
          { id: 'products',  label: 'Product Documents',  icon: Package        },
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
        {activePanel === 'summary'   && renderSummaryPanel()}
        {activePanel === 'annexures' && renderAnnexurePanel()}
        {activePanel === 'autofill'  && renderAutoFillPanel()}
        {activePanel === 'editor'    && renderEditorPanel()}
        {activePanel === 'drive'     && renderDrivePanel()}
        {activePanel === 'products'  && renderProductDocsPanel()}
      </div>

      {/* Add Document modal — Computer or Library, optionally scoped to one
          annexure-category section via uploadCategory */}
      {showUploadModal && (
        <div
          onClick={() => !isUploadingDoc && !isImportingLib && setShowUploadModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: uploadMode === 'library' ? '560px' : '420px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
          >
            {!uploadMode && (
              <>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>
                  {uploadAnnexureId
                    ? `Upload Document — ${(session?.annexures || []).find(a => a.id === uploadAnnexureId)?.annexure_ref || 'This Row'}`
                    : `Add Document${uploadCategory ? ` — ${uploadCategory[0].toUpperCase()}${uploadCategory.slice(1)}` : ''}`}
                </h3>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => setUploadMode('computer')}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '1.5rem 1rem', border: '1.5px solid #d1d5db', borderRadius: 10, background: '#f8fafc', cursor: 'pointer' }}
                  >
                    <HardDrive size={26} color="#2563eb" />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>Computer Document</span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>Upload a file from this device</span>
                  </button>
                  <button
                    onClick={handleOpenLibraryMode}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '1.5rem 1rem', border: '1.5px solid #d1d5db', borderRadius: 10, background: '#f8fafc', cursor: 'pointer' }}
                  >
                    <Library size={26} color="#166534" />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>Library Document</span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>Pick from the shared Library</span>
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                  <button onClick={() => setShowUploadModal(false)} style={styles.smallBtn}>Cancel</button>
                </div>
              </>
            )}

            {uploadMode === 'computer' && (
              <>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>Upload from Computer</h3>

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

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                  <button onClick={() => setUploadMode(null)} disabled={isUploadingDoc} style={styles.smallBtn}>
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button
                    onClick={handleUploadDocument}
                    disabled={isUploadingDoc || !uploadFile}
                    style={{ ...styles.primaryBtn, opacity: (isUploadingDoc || !uploadFile) ? 0.6 : 1, cursor: (isUploadingDoc || !uploadFile) ? 'not-allowed' : 'pointer' }}
                  >
                    <Upload size={15} /> {isUploadingDoc ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              </>
            )}

            {uploadMode === 'library' && (
              <>
                <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>Choose from Library</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#6b7280', margin: '0.25rem 0 0.75rem', flexWrap: 'wrap' }}>
                  <span onClick={() => handleLibNavigate(null)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Library</span>
                  {libBreadcrumb.map(b => (
                    <React.Fragment key={b.id}>
                      <span>/</span>
                      <span onClick={() => handleLibNavigate(b.id)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>{b.name}</span>
                    </React.Fragment>
                  ))}
                </div>

                <div style={{ overflowY: 'auto', flex: 1, minHeight: '220px', maxHeight: '360px', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: '1rem' }}>
                  {libLoading ? (
                    <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>Loading…</p>
                  ) : libItems.length === 0 ? (
                    <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>This folder is empty.</p>
                  ) : (
                    libItems.map(item => (
                      <div
                        key={item.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.85rem', borderBottom: '1px solid #f1f5f9', cursor: item.type === 'folder' ? 'pointer' : 'default' }}
                        onClick={() => item.type === 'folder' && handleLibNavigate(item.id)}
                      >
                        {item.type === 'file' && (
                          <input
                            type="checkbox"
                            checked={libSelected.has(item.id)}
                            onChange={(e) => { e.stopPropagation(); toggleLibSelect(item.id); }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'pointer' }}
                          />
                        )}
                        {item.type === 'folder' ? <Folder size={16} color="#f59e0b" /> : <FileIcon size={16} color="#64748b" />}
                        <span style={{ fontSize: '0.85rem', color: '#1f2937', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        {item.type === 'folder' && <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{item.file_count} files</span>}
                      </div>
                    ))
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                  <button onClick={() => setUploadMode(null)} disabled={isImportingLib} style={styles.smallBtn}>
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button
                    onClick={handleImportFromLibrary}
                    disabled={isImportingLib || libSelected.size === 0}
                    style={{ ...styles.primaryBtn, opacity: (isImportingLib || libSelected.size === 0) ? 0.6 : 1, cursor: (isImportingLib || libSelected.size === 0) ? 'not-allowed' : 'pointer' }}
                  >
                    <Upload size={15} /> {isImportingLib ? 'Adding…' : `Add ${libSelected.size || ''} File${libSelected.size === 1 ? '' : 's'}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Re-analyze confirmation — this wipes annexures, formats, filled
          templates, drive matches and starts completely fresh, so it never
          fires on a plain click. */}
      {showReanalyzeConfirm && (
        <div
          onClick={() => !reanalyzing && setShowReanalyzeConfirm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '440px', maxWidth: '90vw', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertCircle size={18} color="#b91c1c" />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>Re-analyze this tender?</h3>
            </div>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.5 }}>
              This will <strong>erase everything currently built for this tender's documentation</strong> —
              every Auto Fill extraction, generated draft, and AI Drive match — and rebuild it
              completely from scratch. Anything you haven't pushed to My Documents will be lost.
            </p>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.5 }}>
              This can't be undone. The new analysis pass uses the latest, more accurate
              extraction (the fixes for blank/wrong-page annexures), so it should come out
              better than the first pass.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowReanalyzeConfirm(false)} disabled={reanalyzing} style={styles.smallBtn}>
                Cancel
              </button>
              <button
                onClick={handleRunAnalysis}
                disabled={reanalyzing}
                style={{ ...styles.primaryBtnSm, background: '#b91c1c', color: '#fff', opacity: reanalyzing ? 0.7 : 1 }}
              >
                <RefreshCw size={13} /> {reanalyzing ? 'Re-analyzing…' : 'Yes, erase and re-analyze'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Fill — fields review modal — deliberately does NOT close on
          backdrop click. A user copying field values in from another tab/app
          (switching away, then clicking back into the browser to paste) was
          closing this and losing everything typed so far, since that
          "return focus" click can land on the backdrop behind the modal.
          Cancel is the only way out short of actually generating. */}
      {showFieldsModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '520px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
          >
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>
              {modalAnnexure?.annexure_ref || 'Review Fields'}
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: '#6b7280' }}>
              {modalDivision === 'Endo' ? 'Meril Endo Surgery' : 'Meril Diagnostics'} — review and edit before generating
            </p>

            {modalThin && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: '#92400e', fontWeight: 600 }}>
                  This looks thin — it may have picked up a mention of {modalAnnexure?.annexure_ref} rather than the annexure itself.
                </p>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#92400e' }}>
                  If the fields below look wrong or empty, open the bid document, find the actual page {modalAnnexure?.annexure_ref} is printed on, and recheck it here — no need to re-analyze the whole tender.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="number"
                    min="1"
                    placeholder="Page number in bid document"
                    value={recheckPage}
                    onChange={e => setRecheckPage(e.target.value)}
                    style={{ ...styles.input, flex: 1 }}
                  />
                  <button
                    onClick={handleRecheckPage}
                    disabled={isRechecking}
                    style={{ ...styles.smallBtn, opacity: isRechecking ? 0.6 : 1, cursor: isRechecking ? 'not-allowed' : 'pointer' }}
                  >
                    {isRechecking ? 'Rechecking…' : 'Recheck this page'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {modalFields.map((f, i) => (
                <div key={f.key}>
                  <label style={styles.label}>{f.label}</label>
                  <input
                    value={f.value}
                    onChange={e => setModalFields(fs => fs.map((x, xi) => xi === i ? { ...x, value: e.target.value } : x))}
                    style={{ ...styles.input, width: '100%' }}
                  />
                </div>
              ))}
              {!modalFields.length && (
                <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>This template has no fill-in fields.</p>
              )}
            </div>

            {!modalThin && (
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number"
                  min="1"
                  placeholder="Not the right content? Enter the correct page #"
                  value={recheckPage}
                  onChange={e => setRecheckPage(e.target.value)}
                  style={{ ...styles.input, flex: 1, fontSize: '0.75rem' }}
                />
                <button
                  onClick={handleRecheckPage}
                  disabled={isRechecking || !recheckPage}
                  style={{ ...styles.smallBtn, opacity: (isRechecking || !recheckPage) ? 0.6 : 1, cursor: (isRechecking || !recheckPage) ? 'not-allowed' : 'pointer' }}
                >
                  {isRechecking ? 'Rechecking…' : 'Recheck'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setShowFieldsModal(false)} disabled={isGeneratingAnnexure} style={styles.smallBtn}>
                Cancel
              </button>
              <button
                onClick={handleGenerateAnnexure}
                disabled={isGeneratingAnnexure}
                style={{ ...styles.primaryBtn, opacity: isGeneratingAnnexure ? 0.6 : 1, cursor: isGeneratingAnnexure ? 'not-allowed' : 'pointer' }}
              >
                <Wand2 size={15} /> {isGeneratingAnnexure ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stamp Paper bulk picker — opened from the "Stamp Paper" button next to
          Add Document in each group header. Lets the user check off one or
          more documents in that group and mark them all as Stamp Paper in
          one go, instead of a toggle button cluttering every single row. */}
      {stampPickerGroup && (() => {
        const pickerLabel = { annexure: 'Annexures', license: 'License', certificate: 'Other Declarations' }[stampPickerGroup] || 'Documents';
        const pickerItems = annexures.filter(a => resolveDisplayGroup(a) === stampPickerGroup);
        return (
          <div
            onClick={() => !bulkMarkingStamp && setStampPickerGroup(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '480px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
            >
              <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>
                Mark as Stamp Paper — {pickerLabel}
              </h3>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: '#6b7280' }}>
                Select the documents that need physical stamp paper, wet signature, and notarization.
              </p>

              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {pickerItems.length === 0 && (
                  <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>No documents in this section yet.</p>
                )}
                {pickerItems.map(ann => (
                  <label
                    key={ann.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.625rem',
                      borderRadius: '8px', cursor: 'pointer', background: stampPickerSelected.has(ann.id) ? '#fef3c7' : '#f9fafb',
                      border: `1px solid ${stampPickerSelected.has(ann.id) ? '#fde68a' : '#e5e7eb'}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={stampPickerSelected.has(ann.id)}
                      onChange={() => toggleStampPickerSelect(ann.id)}
                      style={{ cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ann.annexure_ref || ann.title}
                    </span>
                    {ann.requires_stamp_paper && (
                      <span style={{ ...styles.typePill('#fef3c7', '#92400e'), flexShrink: 0, fontSize: '0.6875rem' }}>Already marked</span>
                    )}
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button onClick={() => setStampPickerGroup(null)} disabled={bulkMarkingStamp} style={styles.smallBtn}>
                  Cancel
                </button>
                <button
                  onClick={handleBulkMarkStampPaper}
                  disabled={bulkMarkingStamp || stampPickerSelected.size === 0}
                  style={{ ...styles.primaryBtn, opacity: (bulkMarkingStamp || stampPickerSelected.size === 0) ? 0.6 : 1, cursor: (bulkMarkingStamp || stampPickerSelected.size === 0) ? 'not-allowed' : 'pointer' }}
                >
                  <FileSignature size={15} /> {bulkMarkingStamp ? 'Marking…' : `Mark ${stampPickerSelected.size || ''} as Stamp Paper`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* Upload Bid Document — source picker modal */}
      {showBidSourceModal && (
        <div
          onClick={() => !isImportingWorkspaceDocs && setShowBidSourceModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: bidSourceMode === 'workspace' ? '560px' : '420px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>

            {!bidSourceMode && (
              <>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>Upload Bid Document</h3>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => setBidSourceMode('workspace')}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '1.5rem 1rem', border: '1.5px solid #d1d5db', borderRadius: 10, background: '#f8fafc', cursor: 'pointer' }}
                  >
                    <FolderOpen size={26} color="#166534" />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>Workspace Documents</span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>Pick from Tender Documents / My Documents</span>
                  </button>
                  <button
                    onClick={() => { setShowBidSourceModal(false); computerFileInputRef.current?.click(); }}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '1.5rem 1rem', border: '1.5px solid #d1d5db', borderRadius: 10, background: '#f8fafc', cursor: 'pointer' }}
                  >
                    <Upload size={26} color="#2563eb" />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>Computer Document</span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>Upload a file from this device</span>
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                  <button onClick={() => setShowBidSourceModal(false)} style={styles.smallBtn}>Cancel</button>
                </div>
              </>
            )}

            {bidSourceMode === 'workspace' && (
              <>
                <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>Choose from Workspace Documents</h3>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: '#6b7280' }}>
                  Select the document(s) that contain the annexures — the first pick becomes the bid document, any others are added as additional documents.
                </p>

                <div style={{ overflowY: 'auto', flex: 1, minHeight: '220px', maxHeight: '360px', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: '1rem' }}>
                  {workspaceTenderDocs.length === 0 && uploadedDocs.length === 0 ? (
                    <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>No workspace documents found yet.</p>
                  ) : (
                    <>
                      {workspaceTenderDocs.length > 0 && (
                        <p style={{ margin: 0, padding: '0.5rem 0.85rem', fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>Tender Documents</p>
                      )}
                      {workspaceTenderDocs.map((doc, idx) => {
                        const key = `tender_${idx}`;
                        return (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.85rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                            <input type="checkbox" checked={workspaceDocSelection.has(key)} onChange={() => toggleWorkspaceDocSelect(key)} style={{ cursor: 'pointer' }} />
                            <FileIcon size={16} color="#64748b" />
                            <span style={{ fontSize: '0.85rem', color: '#1f2937', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                          </label>
                        );
                      })}
                      {uploadedDocs.length > 0 && (
                        <p style={{ margin: 0, padding: '0.5rem 0.85rem', fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>My Documents</p>
                      )}
                      {uploadedDocs.map(doc => {
                        const key = `uploaded_${doc.id}`;
                        return (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.85rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                            <input type="checkbox" checked={workspaceDocSelection.has(key)} onChange={() => toggleWorkspaceDocSelect(key)} style={{ cursor: 'pointer' }} />
                            <FileIcon size={16} color="#64748b" />
                            <span style={{ fontSize: '0.85rem', color: '#1f2937', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                  <button onClick={() => setBidSourceMode(null)} disabled={isImportingWorkspaceDocs} style={styles.smallBtn}>Back</button>
                  <button
                    onClick={handleImportWorkspaceDocs}
                    disabled={isImportingWorkspaceDocs || workspaceDocSelection.size === 0}
                    style={{ ...styles.primaryBtn, opacity: (isImportingWorkspaceDocs || workspaceDocSelection.size === 0) ? 0.6 : 1, cursor: (isImportingWorkspaceDocs || workspaceDocSelection.size === 0) ? 'not-allowed' : 'pointer' }}
                  >
                    <Upload size={15} /> {isImportingWorkspaceDocs ? 'Adding…' : `Use ${workspaceDocSelection.size || ''} Document${workspaceDocSelection.size === 1 ? '' : 's'}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Top-right toast — confirms a document just landed in My Documents */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          style={{
            position: 'fixed', top: 'calc(var(--navbar-height, 64px) + 1rem)', right: '1.25rem', zIndex: 100000,
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            background: '#166534', color: '#fff', borderRadius: 8,
            padding: '0.75rem 1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            maxWidth: 380, cursor: 'pointer', animation: 'toastIn 0.25s ease-out',
          }}
        >
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.4 }}>{toast.message}</span>
        </div>
      )}

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes slide  { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes toastIn { 0%{opacity:0; transform:translateY(-8px)} 100%{opacity:1; transform:translateY(0)} }
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

  summaryPanelWrap:      { minHeight: '300px' },
  summaryStatus:         { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '4rem 0', color: '#475569' },
  summarySpinner:        { width: 36, height: 36, border: '3px solid #dbe7f5', borderTop: '3px solid #084f9a', borderRadius: '50%', animation: 'spin 0.9s linear infinite' },
  summaryErrorBox:       { display: 'flex', alignItems: 'flex-start', gap: '0.625rem', background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '10px', padding: '1rem 1.125rem', color: '#856404', fontSize: '0.9rem' },
  summaryToolbar:        { display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' },
  summaryRegenerateBtn:  { display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 1rem', border: 'none', borderRadius: '8px', background: '#16a34a', color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' },

  statusBar: { display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.625rem 1rem', marginBottom: '1rem', flexWrap: 'wrap' },
  badge: (bg, color) => ({ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: bg, color, padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }),
  alertBanner: (bg, color) => ({ display: 'flex', alignItems: 'center', gap: '0.5rem', background: bg, color, padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.8125rem', marginBottom: '1rem' }),

  uploadZone:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '2rem', cursor: 'pointer', transition: 'border-color 0.2s', marginTop: '0.5rem' },
  uploadZoneSm: { display: 'flex', alignItems: 'center', border: '1.5px dashed #cbd5e1', borderRadius: '8px', padding: '0.625rem 1rem', background: '#f8fafc' },

  primaryBtn:   { display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.625rem 1.125rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  primaryBtnSm: { display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8125rem', whiteSpace: 'nowrap', flexShrink: 0 },
  ghostBtn:     { display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.8125rem', whiteSpace: 'nowrap', flexShrink: 0 },
  smallBtn:     { display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500 },
  iconBtn:      { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem' },

  progressBar:  { background: '#e2e8f0', borderRadius: '999px', height: '6px', overflow: 'hidden' },
  progressFill: { height: '100%', width: '60%', background: '#2563eb', borderRadius: '999px', animation: 'slide 1.8s ease-in-out infinite' },

  additionalDocsBox: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1rem', marginTop: '1rem' },
  additionalDocRow:  { display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.375rem 0.625rem' },
  categoryHeader: (bg, color) => ({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: bg, color, padding: '0.5rem 0.875rem', borderRadius: '8px', marginBottom: '0.75rem' }),

  // Wider than the general-purpose 280px card grid — Library Documents cards
  // need room to show the full folder path without cutting it off.
  annexureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '1rem' },
  annexureRow:  { display: 'flex', flexDirection: 'column', gap: '0.625rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem' },
  editInput:    { width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8125rem', boxSizing: 'border-box' },
  annexureCard: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' },
  verbatimBox:  { background: '#f1f5f9', borderRadius: '8px', padding: '1rem', fontSize: '0.75rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto', marginTop: '0.75rem', fontFamily: 'monospace', color: '#374151', border: '1px solid #e2e8f0' },
  typePill: (bg, color) => ({ display: 'inline-flex', alignItems: 'center', background: bg, color, fontSize: '0.6875rem', fontWeight: 600, padding: '0.25rem 0.625rem', borderRadius: '999px', whiteSpace: 'nowrap', flexShrink: 0 }),


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

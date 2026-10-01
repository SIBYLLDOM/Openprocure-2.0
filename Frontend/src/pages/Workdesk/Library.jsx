import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import {
  Folder, FileText, Plus, FolderPlus, Upload, Download, Trash2,
  Eye, Mail, ChevronRight, ChevronLeft, Home, X, Archive, FolderUp, Search, Pencil, CalendarClock,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const PAGE_SIZE = 20;

const styles = {
  page:        { padding: '2rem', maxWidth: '1400px', margin: '0 auto', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  header:      {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
    marginBottom: '1rem', padding: '1.5rem 1.75rem', borderRadius: 16,
    background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%)',
    boxShadow: '0 8px 24px rgba(37,99,235,0.25)',
  },
  title:       { fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.625rem', letterSpacing: '-0.01em' },
  subtitle:    { margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.75)', fontWeight: 500 },
  toolbar:     {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.875rem',
    marginBottom: '1.25rem', padding: '1rem 1.25rem', borderRadius: 12,
    background: '#fff', border: '1px solid #eef0f4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  toolbarActions: { display: 'flex', gap: '0.625rem', flexWrap: 'wrap' },
  actions:     { display: 'flex', gap: '0.625rem', flexWrap: 'wrap' },
  btnBlue:     { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 9, padding: '0.6rem 1.05rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(37,99,235,0.25)', transition: 'transform 0.12s ease' },
  btnGreen:    { background: '#166534', color: '#fff', border: 'none', borderRadius: 9, padding: '0.6rem 1.05rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(22,101,52,0.2)' },
  btnGhostToolbar: { background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 9, padding: '0.6rem 1.05rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.12s ease' },
  btnGhost:    { background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7, padding: '0.4rem 0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 5, transition: 'background 0.12s ease' },
  btnDanger:   { background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, padding: '0.4rem 0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 5 },
  breadcrumb:  { display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem', flexWrap: 'wrap', padding: '0.5rem 0.25rem' },
  crumbLink:   { color: '#2563eb', cursor: 'pointer', fontWeight: 600, background: 'none', border: 'none', padding: '2px 4px', fontSize: '0.85rem', borderRadius: 5 },
  card:        { background: '#fff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(15,23,42,0.06)', border: '1px solid #eef0f4', overflow: 'hidden' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { textAlign: 'left', padding: '0.85rem 1.25rem', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #eef0f4', background: '#f8fafc' },
  td:          { padding: '0.85rem 1.25rem', fontSize: '0.875rem', color: '#1f2937', borderBottom: '1px solid #f4f5f7' },
  tr:          { transition: 'background 0.1s ease' },
  rowName:     { display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer', fontWeight: 600 },
  iconBadge:   { width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge:       { display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700 },
  empty:       { textAlign: 'center', padding: '4rem 0', color: '#9ca3af' },
  modalOverlay:{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' },
  modal:       { background: '#fff', borderRadius: 14, padding: '1.5rem', width: '420px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  modalTitle:  { margin: '0 0 1rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  label:       { display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem' },
  input:       { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.875rem', boxSizing: 'border-box', marginBottom: '1rem' },
  uploadZone:  { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: 10, padding: '1.25rem', cursor: 'pointer', marginBottom: '1rem' },
  modalActions:{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  pagination:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.25rem', borderTop: '1px solid #eef0f4', background: '#fafbfc', flexWrap: 'wrap', gap: '0.75rem' },
  pageInfo:    { fontSize: '0.8125rem', color: '#6b7280' },
  pageBtns:    { display: 'flex', alignItems: 'center', gap: '0.375rem' },
  pageBtn:     { minWidth: 32, height: 32, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pageBtnActive: { minWidth: 32, height: 32, borderRadius: 7, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer' },
};

const formatSize = (bytes) => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Red once past due, amber inside the 3-month reminder window, plain beyond that. */
function getExpiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const days = Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
  if (days < 0)   return { label: `Expired ${Math.abs(days)}d ago`, bg: '#fee2e2', color: '#dc2626' };
  if (days <= 90) return { label: `${days}d left`,                  bg: '#fef3c7', color: '#d97706' };
  return null;
}

/** Compact page-number list with ellipses, e.g. 1 … 4 5 [6] 7 8 … 12 */
function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

function Pagination({ page, totalPages, total, pageSize, onChange }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div style={styles.pagination}>
      <span style={styles.pageInfo}>Showing <strong>{from}–{to}</strong> of <strong>{total}</strong></span>
      <div style={styles.pageBtns}>
        <button style={styles.pageBtn} disabled={page <= 1} onClick={() => onChange(page - 1)} title="Previous page">
          <ChevronLeft size={15} />
        </button>
        {buildPageList(page, totalPages).map((p, i) => p === '…' ? (
          <span key={`ellipsis_${i}`} style={{ padding: '0 4px', color: '#9ca3af', fontSize: '0.8rem' }}>…</span>
        ) : (
          <button
            key={p}
            style={p === page ? styles.pageBtnActive : styles.pageBtn}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
        <button style={styles.pageBtn} disabled={page >= totalPages} onClick={() => onChange(page + 1)} title="Next page">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

export default function Library() {
  const token = localStorage.getItem('token');
  const authHeader = { Authorization: `Bearer ${token}` };

  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem('user')); } catch { /* ignore */ }
  const canDelete = currentUser?.role === 'Admin' || currentUser?.role === 'Tender Admin' || currentUser?.role === 'Office Administrator';

  // ── Centered notice/confirm modal — replaces the browser's native
  //    alert()/confirm() (which render top-left, not centered) everywhere
  //    in this page. { message, onConfirm? } — with onConfirm it shows
  //    Cancel/Confirm, without it shows a single OK button. ───────────────
  const [notice, setNotice] = useState(null);
  const showAlert = (message) => setNotice({ message });
  const showConfirm = (message, onConfirm) => setNotice({ message, onConfirm });

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const folderFromUrl = searchParams.get('folder_id') || searchParams.get('parent_id') || location.state?.folderId || null;
  const [currentFolderId, setCurrentFolderId] = useState(folderFromUrl ? Number(folderFromUrl) : null);
  const [items, setItems] = useState([]);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Sync folder if URL query param or state changes
  useEffect(() => {
    const fid = searchParams.get('folder_id') || searchParams.get('parent_id') || location.state?.folderId || null;
    const targetId = fid ? Number(fid) : null;
    setCurrentFolderId(prev => (prev !== targetId ? targetId : prev));
  }, [searchParams, location.state]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentFolderId) params.append('parent_id', currentFolderId);
      params.append('page', page);
      params.append('limit', PAGE_SIZE);
      const res = await fetch(`${API_BASE_URL}/library?${params}`, { headers: authHeader });
      const json = await res.json();
      if (json.success) {
        setItems(json.items || []);
        setBreadcrumb(json.breadcrumb || []);
        setTotalItems(json.total ?? (json.items || []).length);
        setTotalPages(json.totalPages || 1);
      }
    } catch (e) {
      console.error('[library] fetchItems:', e);
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { setPage(1); }, [currentFolderId]);

  const navigateToFolder = (id) => {
    setCurrentFolderId(id);
    if (id) {
      setSearchParams({ folder_id: id });
    } else {
      setSearchParams({});
    }
  };

  // ── Search — name match across the whole library + best-effort content
  //    match inside file text, debounced so it doesn't fire on every keystroke.
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [searching, setSearching]         = useState(false);
  const [searchPage, setSearchPage]       = useState(1);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setSearchResults(null); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`${API_BASE_URL}/library/search?q=${encodeURIComponent(q)}`, { headers: authHeader });
        const json = await res.json();
        if (json.success) {
          setSearchResults({ files: json.files || [], folders: json.folders || [] });
          setSearchPage(1);
        }
      } catch (e) {
        console.error('[library] search:', e);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // The two seeded division roots ("Diagnostics Division" / "EndoSurgery
  // Division") come back tagged with `division` — shown as big tabs above
  // the normal table (like the My Docs All/Uploaded tabs) rather than as
  // ordinary rows, and excluded from the table below so they don't appear
  // twice. Everything pre-existing (division: null) renders exactly as it
  // always did.
  const divisionFolders = !currentFolderId ? items.filter(i => i.type === 'folder' && i.division) : [];
  const tableItems = !currentFolderId ? items.filter(i => !(i.type === 'folder' && i.division)) : items;

  const isSearching = searchResults !== null;
  const searchCombined = isSearching ? [...searchResults.files, ...searchResults.folders] : [];
  const searchFolderIds = isSearching ? new Set(searchResults.folders.map(f => f.id)) : new Set();
  const searchTotalPages = Math.max(1, Math.ceil(searchCombined.length / PAGE_SIZE));
  const searchPageItems = searchCombined.slice((searchPage - 1) * PAGE_SIZE, searchPage * PAGE_SIZE);

  // ── New Folder modal ──────────────────────────────────────────────────
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await fetch(`${API_BASE_URL}/library/folder`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName.trim(), parent_id: currentFolderId }),
      });
      const json = await res.json();
      if (json.success) {
        setShowFolderModal(false);
        setFolderName('');
        fetchItems();
      } else {
        showAlert(json.message || 'Failed to create folder');
      }
    } catch (e) {
      showAlert('Failed to create folder: ' + e.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  // ── New File modal (accepts .zip — auto-extracted into multiple files) ──
  const [showFileModal, setShowFileModal] = useState(false);
  const [pickedFile, setPickedFile] = useState(null);
  const [fileDisplayName, setFileDisplayName] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  const handlePickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPickedFile(file);
    if (!fileDisplayName) setFileDisplayName(file.name);
  };

  const handleUploadFile = async () => {
    if (!pickedFile) { showAlert('Please choose a file to upload.'); return; }
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append('file', pickedFile);
      if (currentFolderId) fd.append('parent_id', currentFolderId);
      if (fileDisplayName.trim()) fd.append('name', fileDisplayName.trim());
      const res = await fetch(`${API_BASE_URL}/library/file`, {
        method: 'POST',
        headers: authHeader,
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setShowFileModal(false);
        setPickedFile(null);
        setFileDisplayName('');
        fetchItems();
      } else {
        showAlert(json.message || 'Upload failed');
      }
    } catch (e) {
      showAlert('Upload failed: ' + e.message);
    } finally {
      setUploadingFile(false);
    }
  };

  // ── Upload Folder — native OS folder picker, recreates the real nested
  //    structure (unlike zip upload, which deliberately flattens). ────────
  const folderInputRef = useRef(null);
  const [uploadingFolder, setUploadingFolder] = useState(false);
  const [folderUploadProgress, setFolderUploadProgress] = useState('');

  const handlePickFolder = async (e) => {
    const fileList = Array.from(e.target.files || []);
    if (!fileList.length) return;
    e.target.value = ''; // allow picking the same folder again later

    const topFolderName = fileList[0].webkitRelativePath.split('/')[0];
    showConfirm(`Upload "${topFolderName}" — ${fileList.length} file(s) including subfolders?`, async () => {
      setNotice(null);
      setUploadingFolder(true);
      setFolderUploadProgress(`Uploading ${fileList.length} file(s)…`);
      try {
        const fd = new FormData();
        fileList.forEach((f) => fd.append('files', f));
        fd.append('paths', JSON.stringify(fileList.map((f) => f.webkitRelativePath)));
        if (currentFolderId) fd.append('parent_id', currentFolderId);

        const res = await fetch(`${API_BASE_URL}/library/upload-folder`, {
          method: 'POST',
          headers: authHeader,
          body: fd,
        });
        const json = await res.json();
        if (json.success) {
          fetchItems();
        } else {
          showAlert(json.message || 'Folder upload failed');
        }
      } catch (err) {
        showAlert('Folder upload failed: ' + err.message);
      } finally {
        setUploadingFolder(false);
        setFolderUploadProgress('');
      }
    });
  };

  // ── Share-by-email modal ─────────────────────────────────────────────
  const [shareTarget, setShareTarget] = useState(null); // { id, name }
  const [shareEmail, setShareEmail] = useState('');
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!shareEmail.trim()) return;
    setSharing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/library/file/${shareTarget.id}/share`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: shareEmail.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        showAlert(json.message || 'Sent successfully');
        setShareTarget(null);
        setShareEmail('');
      } else {
        showAlert(json.message || 'Failed to send email');
      }
    } catch (e) {
      showAlert('Failed to send email: ' + e.message);
    } finally {
      setSharing(false);
    }
  };

  // ── Actions ───────────────────────────────────────────────────────────
  const handleDownloadFile = async (item) => {
    try {
      const res = await fetch(`${API_BASE_URL}/library/file/${item.id}/download`, { headers: authHeader });
      if (!res.ok) { showAlert('Download failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = item.name; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showAlert('Download failed: ' + e.message);
    }
  };

  const handleViewFile = async (item) => {
    try {
      const res = await fetch(`${API_BASE_URL}/library/file/${item.id}/view`, { headers: authHeader });
      if (!res.ok) { showAlert('Failed to open file'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Revoke well after the new tab has had time to load the resource.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      showAlert('Failed to open file: ' + e.message);
    }
  };

  const handleDownloadFolderZip = async (item) => {
    try {
      const res = await fetch(`${API_BASE_URL}/library/folder/${item.id}/download-zip`, { headers: authHeader });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showAlert(err.message || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${item.name}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showAlert('Download failed: ' + e.message);
    }
  };

  // ── Rename modal (folder or file) ─────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState(null); // { id, name, type }
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const openRename = (item) => {
    setRenameTarget(item);
    setRenameValue(item.name);
  };

  const handleRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || !renameTarget) return;
    setRenaming(true);
    try {
      const res = await fetch(`${API_BASE_URL}/library/${renameTarget.id}`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (json.success) {
        setRenameTarget(null);
        setRenameValue('');
        fetchItems();
      } else {
        showAlert(json.message || 'Rename failed');
      }
    } catch (e) {
      showAlert('Rename failed: ' + e.message);
    } finally {
      setRenaming(false);
    }
  };

  // ── Expiry date (Admin/Tender Admin only) ────────────────────────────
  const [expiryTarget, setExpiryTarget] = useState(null); // { id, name, expiry_date }
  const [expiryValue, setExpiryValue] = useState('');
  const [savingExpiry, setSavingExpiry] = useState(false);

  const openExpiryEdit = (item) => {
    setExpiryTarget(item);
    setExpiryValue(item.expiry_date ? String(item.expiry_date).slice(0, 10) : '');
  };

  const handleSaveExpiry = async () => {
    if (!expiryTarget) return;
    setSavingExpiry(true);
    try {
      const res = await fetch(`${API_BASE_URL}/library/${expiryTarget.id}/expiry`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiry_date: expiryValue || null }),
      });
      const json = await res.json();
      if (json.success) {
        setExpiryTarget(null);
        setExpiryValue('');
        fetchItems();
      } else {
        showAlert(json.message || 'Failed to update expiry date');
      }
    } catch (e) {
      showAlert('Failed to update expiry date: ' + e.message);
    } finally {
      setSavingExpiry(false);
    }
  };

  const handleDelete = (item) => {
    const label = item.type === 'folder' ? 'folder (and everything inside it)' : 'file';
    showConfirm(`Delete "${item.name}"? This ${label} cannot be recovered.`, async () => {
      setNotice(null);
      try {
        const res = await fetch(`${API_BASE_URL}/library/${item.id}`, { method: 'DELETE', headers: authHeader });
        const json = await res.json();
        if (json.success) fetchItems();
        else showAlert(json.message || 'Failed to delete');
      } catch (e) {
        showAlert('Failed to delete: ' + e.message);
      }
    });
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}><Archive size={24} /> Library</h1>
          <p style={styles.subtitle}>Shared folders and files across your organization</p>
        </div>
      </div>

      <div style={styles.toolbar}>
        <div style={{ position: 'relative', flex: '1 1 320px', minWidth: 240, maxWidth: 460 }}>
          <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files and folders by name or content…"
            style={{ width: '100%', padding: '0.65rem 0.9rem 0.65rem 2.5rem', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.875rem', boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <div style={styles.toolbarActions}>
          <button
            style={{ ...styles.btnGreen, opacity: currentFolderId ? 1 : 0.5, cursor: currentFolderId ? 'pointer' : 'not-allowed' }}
            onClick={() => currentFolderId ? setShowFolderModal(true) : showAlert('Open Diagnostics Division or EndoSurgery Division first.')}
            title={currentFolderId ? undefined : 'Open a division folder first'}
          >
            <FolderPlus size={16} /> New Folder
          </button>
          <button
            style={{ ...styles.btnGhostToolbar, opacity: currentFolderId ? 1 : 0.5, cursor: currentFolderId ? 'pointer' : 'not-allowed' }}
            onClick={() => currentFolderId ? folderInputRef.current?.click() : showAlert('Open Diagnostics Division or EndoSurgery Division first.')}
            disabled={uploadingFolder}
            title={currentFolderId ? undefined : 'Open a division folder first'}
          >
            <FolderUp size={15} /> {uploadingFolder ? (folderUploadProgress || 'Uploading…') : 'Upload Folder'}
          </button>
          <button
            style={{ ...styles.btnBlue, opacity: currentFolderId ? 1 : 0.5, cursor: currentFolderId ? 'pointer' : 'not-allowed' }}
            onClick={() => currentFolderId ? setShowFileModal(true) : showAlert('Open Diagnostics Division or EndoSurgery Division first.')}
            title={currentFolderId ? undefined : 'Open a division folder first'}
          >
            <Plus size={16} /> New File
          </button>
          {/* webkitdirectory triggers the OS's native folder picker; the browser
              then reports every file inside it (with subfolders) via
              webkitRelativePath, which we send to the backend to recreate. */}
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            style={{ display: 'none' }}
            onChange={handlePickFolder}
          />
        </div>
      </div>

      {!isSearching && !currentFolderId && divisionFolders.length > 0 && (
        <div style={{
          display: 'flex', gap: 16, marginBottom: '1.25rem', background: '#fff',
          padding: 8, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb',
        }}>
          {divisionFolders.map(f => (
            <button
              key={f.id}
              onClick={() => navigateToFolder(f.id)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '16px 32px', border: 'none', borderRadius: 12, cursor: 'pointer',
                fontSize: 16, fontWeight: 700, background: 'transparent', color: '#64748b',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#084f9a'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
            >
              <Folder size={18} />
              {f.name}
              <span style={{
                fontSize: 13, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                background: '#e5e7eb', color: '#475569',
              }}>
                {f.file_count} file{f.file_count === 1 ? '' : 's'}
              </span>
            </button>
          ))}
        </div>
      )}

      {!isSearching && (
        <div style={styles.breadcrumb}>
          <button
            style={{ ...styles.btnGhost, marginRight: '0.5rem', opacity: breadcrumb.length ? 1 : 0.4 }}
            onClick={() => breadcrumb.length && navigateToFolder(breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2].id : null)}
            disabled={!breadcrumb.length}
            title="Back"
          >
            <ChevronLeft size={14} /> Back
          </button>
          <button style={styles.crumbLink} onClick={() => navigateToFolder(null)}>
            <Home size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Home
          </button>
          {breadcrumb.map((b) => (
            <React.Fragment key={b.id}>
              <ChevronRight size={13} color="#cbd5e1" />
              <button style={styles.crumbLink} onClick={() => navigateToFolder(b.id)}>{b.name}</button>
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={styles.card}>
        {isSearching ? (
          searching ? (
            <div style={styles.empty}>Searching…</div>
          ) : (searchResults.files.length === 0 && searchResults.folders.length === 0) ? (
            <div style={styles.empty}>
              <Search size={40} color="#cbd5e1" style={{ marginBottom: 10 }} />
              <p style={{ margin: 0 }}>No files or folders match "{searchQuery}".</p>
            </div>
          ) : (
            <>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Location</th>
                    <th style={styles.th}>Match</th>
                    <th style={styles.th}>Expiry Date</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {searchPageItems.map((item) => {
                    const isFolder = searchFolderIds.has(item.id) && searchResults.folders.includes(item);
                    return (
                      <tr key={`search_${isFolder ? 'folder' : 'file'}_${item.id}`} style={styles.tr} onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={styles.td}>
                          <div
                            style={styles.rowName}
                            onClick={() => { if (isFolder) { navigateToFolder(item.id); setSearchQuery(''); } }}
                          >
                            <div style={{ ...styles.iconBadge, background: isFolder ? '#fef3c7' : '#eff6ff' }}>
                              {isFolder ? <Folder size={17} color="#d97706" /> : <FileText size={17} color="#2563eb" />}
                            </div>
                            {item.name}
                          </div>
                        </td>
                        <td style={{ ...styles.td, color: '#6b7280', fontSize: '0.8125rem' }}>{item.path_label}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, background: item.match_type === 'content' ? '#ede9fe' : '#dcfce7', color: item.match_type === 'content' ? '#6d28d9' : '#166534' }}>
                            {item.match_type === 'content' ? 'Content match' : 'Name match'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {!isFolder && (() => {
                            const st = getExpiryStatus(item.expiry_date);
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {item.expiry_date ? (
                                  <span style={{ color: st ? st.color : '#374151', fontWeight: st ? 700 : 500 }}>
                                    {String(item.expiry_date).slice(0, 10)}
                                  </span>
                                ) : (
                                  <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not set</span>
                                )}
                                {st && <span style={{ ...styles.badge, background: st.bg, color: st.color }}>{st.label}</span>}
                                {canDelete && (
                                  <button
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'inline-flex', padding: 2 }}
                                    onClick={() => openExpiryEdit(item)}
                                    title="Set expiry date"
                                  >
                                    <CalendarClock size={14} />
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {isFolder ? (
                              <>
                                <button style={styles.btnGhost} onClick={() => { navigateToFolder(item.id); setSearchQuery(''); }}>
                                  <Folder size={13} /> Open
                                </button>
                                <button style={styles.btnGhost} onClick={() => openRename({ ...item, type: 'folder' })}>
                                  <Pencil size={13} /> Rename
                                </button>
                              </>
                            ) : (
                              <>
                                <button style={styles.btnGhost} onClick={() => handleViewFile(item)}>
                                  <Eye size={13} /> View
                                </button>
                                <button style={styles.btnGhost} onClick={() => handleDownloadFile(item)}>
                                  <Download size={13} /> Download
                                </button>
                                <button style={styles.btnGhost} onClick={() => openRename({ ...item, type: 'file' })}>
                                  <Pencil size={13} /> Rename
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination page={searchPage} totalPages={searchTotalPages} total={searchCombined.length} pageSize={PAGE_SIZE} onChange={setSearchPage} />
            </>
          )
        ) : loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : tableItems.length === 0 ? (
          divisionFolders.length > 0 ? null : (
            <div style={styles.empty}>
              <Folder size={40} color="#cbd5e1" style={{ marginBottom: 10 }} />
              <p style={{ margin: 0 }}>This folder is empty.</p>
              <p style={{ margin: '0.375rem 0 0', fontSize: '0.85rem' }}>Use "New Folder" or "New File" to add something.</p>
            </div>
          )
        ) : (
          <>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Details</th>
                  <th style={styles.th}>Expiry Date</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableItems.map((item) => (
                  <tr key={`${item.type}_${item.id}`} style={styles.tr} onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={styles.td}>
                      <div
                        style={styles.rowName}
                        onClick={() => item.type === 'folder' && navigateToFolder(item.id)}
                      >
                        <div style={{ ...styles.iconBadge, background: item.type === 'folder' ? '#fef3c7' : '#eff6ff' }}>
                          {item.type === 'folder'
                            ? <Folder size={17} color="#d97706" />
                            : <FileText size={17} color="#2563eb" />}
                        </div>
                        {item.name}
                      </div>
                    </td>
                    <td style={{ ...styles.td, color: '#6b7280' }}>
                      {item.type === 'folder'
                        ? `${item.file_count} file${item.file_count === 1 ? '' : 's'}`
                        : formatSize(item.file_size)}
                    </td>
                    <td style={styles.td}>
                      {item.type === 'file' && (() => {
                        const st = getExpiryStatus(item.expiry_date);
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {item.expiry_date ? (
                              <span style={{ color: st ? st.color : '#374151', fontWeight: st ? 700 : 500 }}>
                                {String(item.expiry_date).slice(0, 10)}
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not set</span>
                            )}
                            {st && <span style={{ ...styles.badge, background: st.bg, color: st.color }}>{st.label}</span>}
                            {canDelete && (
                              <button
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'inline-flex', padding: 2 }}
                                onClick={() => openExpiryEdit(item)}
                                title="Set expiry date"
                              >
                                <CalendarClock size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {item.type === 'folder' ? (
                          <>
                            <button style={styles.btnGhost} onClick={() => handleDownloadFolderZip(item)}>
                              <Download size={13} /> Download
                            </button>
                            <button style={styles.btnGhost} onClick={() => openRename(item)}>
                              <Pencil size={13} /> Rename
                            </button>
                            {canDelete && (
                              <button style={styles.btnDanger} onClick={() => handleDelete(item)}>
                                <Trash2 size={13} /> Delete
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button style={styles.btnGhost} onClick={() => handleViewFile(item)}>
                              <Eye size={13} /> View
                            </button>
                            <button style={styles.btnGhost} onClick={() => handleDownloadFile(item)}>
                              <Download size={13} /> Download
                            </button>
                            <button style={styles.btnGhost} onClick={() => setShareTarget(item)}>
                              <Mail size={13} /> Share
                            </button>
                            <button style={styles.btnGhost} onClick={() => openRename(item)}>
                              <Pencil size={13} /> Rename
                            </button>
                            {canDelete && (
                              <button style={styles.btnDanger} onClick={() => handleDelete(item)}>
                                <Trash2 size={13} /> Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} total={totalItems} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </div>

      {/* New Folder modal */}
      {showFolderModal && (
        <div style={styles.modalOverlay} onClick={() => !creatingFolder && setShowFolderModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              New Folder
              <button onClick={() => setShowFolderModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </h3>
            <label style={styles.label}>Folder name</label>
            <input
              style={styles.input}
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g. Product Catalogs"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <div style={styles.modalActions}>
              <button style={styles.btnGhost} onClick={() => setShowFolderModal(false)} disabled={creatingFolder}>Cancel</button>
              <button style={{ ...styles.btnGreen, background: '#166534', border: 'none' }} onClick={handleCreateFolder} disabled={creatingFolder || !folderName.trim()}>
                {creatingFolder ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New File modal */}
      {showFileModal && (
        <div style={styles.modalOverlay} onClick={() => !uploadingFile && setShowFileModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              New File
              <button onClick={() => setShowFileModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </h3>
            <label style={styles.label}>File</label>
            <label style={styles.uploadZone}>
              <input type="file" style={{ display: 'none' }} onChange={handlePickFile} />
              <Upload size={22} color="#94a3b8" />
              <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: '#374151', wordBreak: 'break-all', textAlign: 'center' }}>
                {pickedFile ? pickedFile.name : 'Click to choose a file — PDF, Word, or any file. A .zip is automatically extracted into individual files here.'}
              </p>
            </label>
            <label style={styles.label}>Display name</label>
            <input
              style={styles.input}
              value={fileDisplayName}
              onChange={(e) => setFileDisplayName(e.target.value)}
              placeholder="File name shown in the library"
            />
            <div style={styles.modalActions}>
              <button style={styles.btnGhost} onClick={() => setShowFileModal(false)} disabled={uploadingFile}>Cancel</button>
              <button style={{ ...styles.btnBlue, background: '#2563eb', color: '#fff' }} onClick={handleUploadFile} disabled={uploadingFile || !pickedFile}>
                {uploadingFile ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename modal (folder or file) */}
      {renameTarget && (
        <div style={styles.modalOverlay} onClick={() => !renaming && setRenameTarget(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              Rename {renameTarget.type === 'folder' ? 'Folder' : 'File'}
              <button onClick={() => setRenameTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </h3>
            <label style={styles.label}>Name</label>
            <input
              style={styles.input}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
            <div style={styles.modalActions}>
              <button style={styles.btnGhost} onClick={() => setRenameTarget(null)} disabled={renaming}>Cancel</button>
              <button style={{ ...styles.btnBlue, background: '#2563eb', color: '#fff' }} onClick={handleRename} disabled={renaming || !renameValue.trim()}>
                {renaming ? 'Renaming…' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expiry date modal (Admin / Tender Admin only) */}
      {expiryTarget && (
        <div style={styles.modalOverlay} onClick={() => !savingExpiry && setExpiryTarget(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              Set Expiry Date
              <button onClick={() => setExpiryTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: '#6b7280', wordBreak: 'break-all' }}>{expiryTarget.name}</p>
            <label style={styles.label}>Expiry date</label>
            <input
              type="date"
              style={styles.input}
              value={expiryValue}
              onChange={(e) => setExpiryValue(e.target.value)}
              autoFocus
            />
            <p style={{ margin: '-0.5rem 0 1rem', fontSize: '0.75rem', color: '#9ca3af' }}>
              {expiryTarget.expiry_source === 'parsed'
                ? 'Auto-detected from the filename — you can override it here.'
                : 'A reminder email is sent to Tender Admins once this date is within 3 months.'}
            </p>
            <div style={styles.modalActions}>
              <button style={styles.btnGhost} onClick={() => setExpiryTarget(null)} disabled={savingExpiry}>Cancel</button>
              {expiryValue && (
                <button style={styles.btnDanger} onClick={() => setExpiryValue('')} disabled={savingExpiry}>Clear</button>
              )}
              <button style={{ ...styles.btnBlue, background: '#2563eb', color: '#fff' }} onClick={handleSaveExpiry} disabled={savingExpiry}>
                {savingExpiry ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share modal */}
      {shareTarget && (
        <div style={styles.modalOverlay} onClick={() => !sharing && setShareTarget(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              Share "{shareTarget.name}"
              <button onClick={() => setShareTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </h3>
            <label style={styles.label}>Recipient email</label>
            <input
              style={styles.input}
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="name@company.com"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleShare()}
            />
            <div style={styles.modalActions}>
              <button style={styles.btnGhost} onClick={() => setShareTarget(null)} disabled={sharing}>Cancel</button>
              <button style={{ ...styles.btnBlue, background: '#2563eb', color: '#fff' }} onClick={handleShare} disabled={sharing || !shareEmail.trim()}>
                {sharing ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered notice/confirm — replaces native alert()/confirm() */}
      {notice && (
        <div style={styles.modalOverlay} onClick={() => setNotice(null)}>
          <div style={{ ...styles.modal, width: '380px' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', color: '#1f2937', lineHeight: 1.5 }}>{notice.message}</p>
            <div style={styles.modalActions}>
              {notice.onConfirm ? (
                <>
                  <button style={styles.btnGhost} onClick={() => setNotice(null)}>Cancel</button>
                  <button style={styles.btnDanger} onClick={notice.onConfirm}>OK</button>
                </>
              ) : (
                <button style={{ ...styles.btnBlue, background: '#2563eb', color: '#fff' }} onClick={() => setNotice(null)}>OK</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

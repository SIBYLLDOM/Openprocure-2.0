import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Target, FileSpreadsheet, UploadCloud, Search, X, Sparkles, FileText, Loader2, Eye, Download, Archive, Check, Users, Mail, CheckCircle2, AlertCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/* ── Design tokens — a deliberate navy + gold identity (this page's own
   look, distinct from the app's default blue) so "target/achievement"
   reads visually, not just in the copy. ─────────────────────────────── */
const C = {
  navy900: '#0a1530', navy800: '#101f42', navy700: '#182a54', navy600: '#22366b',
  gold500: '#e0a52c', gold600: '#c48a1a', goldWash: '#fdf3df',
  paper: '#f5f6fb', card: '#ffffff', border: '#e7e9f3', borderStrong: '#d7dbec',
  ink: '#0f1729', inkSoft: '#5b6478', inkFaint: '#98a0b3',
  green: '#0f9d68', greenWash: '#e4f7ee',
  red: '#d9483a', redWash: '#fdedec',
  violet: '#7c5cff', violetWash: '#f0ecff',
};

const styles = {
  shell: { background: C.paper, minHeight: '100%', padding: '2.25rem 2rem 4rem', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  page:  { maxWidth: '1080px', margin: '0 auto' },

  header: {
    position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center', gap: '1.15rem', flexWrap: 'wrap',
    marginBottom: '1.75rem', padding: '1.85rem 2rem', borderRadius: 20,
    background: `linear-gradient(120deg, ${C.navy900} 0%, ${C.navy700} 65%, ${C.navy600} 100%)`,
    boxShadow: '0 16px 40px rgba(10,21,48,0.28)',
  },
  headerGlow: {
    position: 'absolute', top: '-60%', right: '-8%', width: '340px', height: '340px', borderRadius: '50%',
    background: `radial-gradient(circle, ${C.gold500}33 0%, transparent 70%)`, pointerEvents: 'none',
  },
  headerIcon: {
    width: 54, height: 54, borderRadius: 15, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
    color: C.gold500, position: 'relative', zIndex: 1,
  },
  title:    { fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em', position: 'relative', zIndex: 1 },
  subtitle: { margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'rgba(226,232,255,0.72)', fontWeight: 500, maxWidth: '520px', position: 'relative', zIndex: 1 },

  /* Stepper rail */
  stepRail: { display: 'flex', alignItems: 'center', marginBottom: '1.75rem', padding: '0 0.25rem' },
  stepDot: (state) => ({
    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.8125rem', fontWeight: 800, transition: 'all 0.2s ease',
    background: state === 'done' ? C.green : state === 'active' ? C.navy800 : '#fff',
    color: state === 'done' ? '#fff' : state === 'active' ? C.gold500 : C.inkFaint,
    border: state === 'active' ? `2px solid ${C.gold500}` : `1.5px solid ${state === 'done' ? C.green : C.border}`,
    boxShadow: state === 'active' ? '0 0 0 4px rgba(224,165,44,0.15)' : 'none',
  }),
  stepLabel: (state) => ({
    fontSize: '0.75rem', fontWeight: 700, marginTop: '0.4rem', textAlign: 'center', width: 90,
    color: state === 'pending' ? C.inkFaint : C.ink,
  }),
  stepConnector: (filled) => ({ flex: 1, height: 2, margin: '0 0.25rem', marginBottom: '1.5rem', background: filled ? C.green : C.border, transition: 'background 0.25s ease' }),

  card: {
    background: C.card, borderRadius: 18, border: `1px solid ${C.border}`,
    boxShadow: '0 1px 2px rgba(15,23,41,0.03), 0 12px 28px rgba(15,23,41,0.05)',
    padding: '1.75rem 2rem', marginBottom: '1.35rem',
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.35rem' },
  cardIconChip: (tone) => ({
    width: 38, height: 38, borderRadius: 11, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: tone === 'gold' ? C.goldWash : tone === 'green' ? C.greenWash : tone === 'violet' ? C.violetWash : '#eef1fb',
    color: tone === 'gold' ? C.gold600 : tone === 'green' ? C.green : tone === 'violet' ? C.violet : C.navy700,
  }),
  cardTitle: { margin: 0, fontSize: '1.0625rem', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' },
  cardEyebrow: { margin: '0.1rem 0 0', fontSize: '0.75rem', fontWeight: 600, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.05em' },

  dropzone: (dragOver, busy, hasFile) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '0.65rem', textAlign: 'center',
    border: `2px dashed ${dragOver ? C.gold500 : hasFile ? C.green : C.borderStrong}`, borderRadius: 16,
    padding: '2.75rem 1.5rem', cursor: busy ? 'default' : 'pointer',
    background: dragOver ? C.goldWash : hasFile ? C.greenWash : '#fafbff',
    transform: dragOver ? 'scale(1.01)' : 'scale(1)',
    transition: 'all 0.18s ease',
  }),
  dropIconRing: (dragOver, hasFile) => ({
    width: 62, height: 62, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: dragOver ? '#fff' : hasFile ? '#fff' : '#fff',
    border: `1.5px solid ${dragOver ? C.gold500 : hasFile ? C.green : C.borderStrong}`,
    color: dragOver ? C.gold600 : hasFile ? C.green : C.navy700,
    boxShadow: '0 4px 12px rgba(15,23,41,0.06)',
  }),

  error:   { display: 'flex', alignItems: 'center', gap: 8, marginTop: '1rem', fontSize: '0.8125rem', fontWeight: 600, color: C.red, background: C.redWash, border: `1px solid #f6cac5`, borderRadius: 10, padding: '0.7rem 1rem' },
  success: { display: 'flex', alignItems: 'center', gap: 8, marginTop: '1rem', fontSize: '0.8125rem', fontWeight: 700, color: C.green, background: C.greenWash, border: `1px solid #bfe9d5`, borderRadius: 10, padding: '0.7rem 1rem' },

  searchWrap: { position: 'relative', marginBottom: '1rem' },
  searchInput: {
    width: '100%', padding: '0.75rem 1rem 0.75rem 2.75rem', border: `1.5px solid ${C.border}`, borderRadius: 12,
    fontSize: '0.875rem', boxSizing: 'border-box', background: '#fafbff', fontWeight: 500,
    outline: 'none',
  },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' },
  linkBtn: { background: 'none', border: 'none', color: C.navy700, fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', padding: 0, textDecoration: 'underline', textDecorationColor: C.gold500, textUnderlineOffset: '3px' },
  meta:    { margin: 0, fontSize: '0.8125rem', color: C.inkSoft, fontWeight: 600 },

  nameGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.65rem',
    maxHeight: '420px', overflowY: 'auto', padding: '0.25rem 0.25rem 0.25rem 0',
  },
  nameCard: (checked) => ({
    display: 'flex', alignItems: 'flex-start', gap: '0.7rem', width: '100%', boxSizing: 'border-box',
    padding: '0.75rem 0.85rem', borderRadius: 13, textAlign: 'left', cursor: 'pointer',
    border: `1.5px solid ${checked ? C.navy700 : C.border}`,
    background: checked ? C.navy900 : '#fff',
    transition: 'all 0.14s ease',
  }),
  checkRing: (checked) => ({
    width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 2,
    border: `1.5px solid ${checked ? C.gold500 : C.borderStrong}`, background: checked ? C.gold500 : '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.navy900,
  }),
  avatar: (checked) => ({
    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
    background: checked ? 'rgba(224,165,44,0.18)' : `linear-gradient(135deg, ${C.navy700}, ${C.navy600})`,
    color: checked ? C.gold500 : '#fff',
    fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
  }),
  badge: (kind, checked) => ({
    display: 'inline-block', padding: '0.1rem 0.5rem', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, marginRight: '0.3rem', marginTop: '0.3rem',
    background: checked ? 'rgba(255,255,255,0.1)' : (kind === 'diag' ? C.greenWash : kind === 'level' ? C.goldWash : C.violetWash),
    color: checked ? '#e2e8ff' : (kind === 'diag' ? C.green : kind === 'level' ? C.gold600 : C.violet),
  }),

  btnPrimary: (busy) => ({
    background: busy ? C.navy700 : `linear-gradient(135deg, ${C.navy800}, ${C.navy700})`,
    color: '#fff', border: 'none', borderRadius: 12, padding: '0.8rem 1.6rem', cursor: busy ? 'default' : 'pointer',
    fontWeight: 700, fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: 9,
    boxShadow: '0 8px 20px rgba(10,21,48,0.25)', opacity: busy ? 0.75 : 1,
  }),
  btnGold: (busy) => ({
    background: busy ? C.gold600 : `linear-gradient(135deg, ${C.gold500}, ${C.gold600})`,
    color: C.navy900, border: 'none', borderRadius: 12, padding: '0.8rem 1.4rem', cursor: busy ? 'default' : 'pointer',
    fontWeight: 800, fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: 8,
    boxShadow: '0 8px 20px rgba(224,165,44,0.28)', opacity: busy ? 0.8 : 1,
  }),
  btnGhost: { background: '#fff', color: C.navy700, border: `1.5px solid ${C.border}`, borderRadius: 11, padding: '0.55rem 0.95rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 6 },

  chip: (checked) => ({
    display: 'inline-flex', alignItems: 'center', gap: 7,
    background: C.navy900, color: '#fff', borderRadius: 999, padding: '0.35rem 0.5rem 0.35rem 0.85rem',
    fontSize: '0.8125rem', fontWeight: 700,
  }),

  docItem: {
    display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem 1rem', borderRadius: 13,
    border: `1px solid ${C.border}`, marginBottom: '0.6rem', background: '#fafbff',
  },
  docIconChip: { width: 38, height: 38, borderRadius: 10, background: C.goldWash, color: C.gold600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
};

const STEPS = [
  { n: 1, label: 'Upload' },
  { n: 2, label: 'Select' },
  { n: 3, label: 'Generate' },
  { n: 4, label: 'Download' },
];

function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

export default function BudgetTargetingSystem() {
  const token = localStorage.getItem('token');
  const authHeader = { Authorization: `Bearer ${token}` };

  const [names, setNames] = useState(null); // null = nothing loaded yet
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [fileName, setFileName] = useState('');
  // The uploader is a small "Upload Updated Excel" action once a workbook is
  // already loaded (bundled default or a prior upload) — only the very first
  // run, with nothing loaded at all, shows the full dropzone by default.
  const [showUploader, setShowUploader] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('All'); // 'All' | 'FLSP' | 'RSM' | 'Zonal Head'
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generateProgress, setGenerateProgress] = useState({ done: 0, total: 0 });
  const [generatedDocs, setGeneratedDocs] = useState([]);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  // Per-document "Send via Mail" state: { [docId]: { status: 'sending'|'sent'|'error', message } }
  const [mailStatus, setMailStatus] = useState({});
  // "Send Sample Mail" — an isolated test send to one typed-in address, no
  // RSM/Zonal Head/division Cc's at all. { [docId]: { open, address, status, message } }
  const [sampleMail, setSampleMail] = useState({});
  const [sendingAll, setSendingAll] = useState(false);
  const [sendAllSummary, setSendAllSummary] = useState('');
  const [sendAllProgress, setSendAllProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef(null);

  // The workbook is loaded server-side by default (the bundled yearly budget
  // file, or whatever was last uploaded via "Upload Updated Excel") — check for
  // it on open instead of making everyone upload before they can select names.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/budget-targeting/names`, { headers: authHeader });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setNames(data.names);
          setFileName(data.fileName || '');
        }
      } catch {
        // No dataset yet (fresh install with no bundled file reachable) —
        // leave names null so the full upload dropzone shows as a fallback.
      } finally {
        if (!cancelled) setCheckingExisting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const levelCounts = useMemo(() => {
    const counts = { All: names?.length || 0, FLSP: 0, RSM: 0, 'Zonal Head': 0 };
    (names || []).forEach((n) => { counts[n.level] = (counts[n.level] || 0) + 1; });
    return counts;
  }, [names]);

  const filteredNames = useMemo(() => {
    if (!names) return [];
    let list = levelFilter === 'All' ? names : names.filter((n) => n.level === levelFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((n) => n.displayName.toLowerCase().includes(q));
    return list;
  }, [names, search, levelFilter]);

  const selectedList = useMemo(
    () => (names ? names.filter((n) => selectedKeys.has(n.key)) : []),
    [names, selectedKeys]
  );

  const allFilteredSelected = filteredNames.length > 0 && filteredNames.every((n) => selectedKeys.has(n.key));

  async function uploadFile(file) {
    if (!file) return;
    setFileName(file.name);
    setUploadError('');
    setUploading(true);
    setNames(null);
    setSelectedKeys(new Set());
    setGeneratedDocs([]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API}/budget-targeting/upload`, { method: 'POST', headers: authHeader, body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setNames(data.names);
      setFileName(data.fileName || file.name);
      setShowUploader(false); // collapse back to the compact confirmation
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e) {
    uploadFile(e.target.files?.[0]);
    e.target.value = '';
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && /\.xlsx$/i.test(file.name)) uploadFile(file);
  }, []);

  function toggleName(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredNames.forEach((n) => next.delete(n.key));
      else filteredNames.forEach((n) => next.add(n.key));
      return next;
    });
  }

  // A single request covering everyone selected — 71 names in one go, say —
  // used to sit behind the scenes for minutes and then die with a bare
  // "Failed to fetch" (a proxy/browser request timeout) with nothing to show
  // for it. Splitting into small batches keeps each request short enough to
  // never approach that timeout, and surfaces progress + partial results as
  // they land instead of an all-or-nothing wait.
  const GENERATE_BATCH_SIZE = 8;

  async function handleGenerate() {
    if (selectedList.length === 0) return;
    setGenerating(true);
    setGenerateError('');
    setGenerateProgress({ done: 0, total: selectedList.length });

    const allErrors = [];
    for (let i = 0; i < selectedList.length; i += GENERATE_BATCH_SIZE) {
      const batch = selectedList.slice(i, i + GENERATE_BATCH_SIZE);
      try {
        const res = await fetch(`${API}/budget-targeting/generate`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: batch.map((p) => p.key) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate PDFs');
        setGeneratedDocs((prev) => [...data.generated, ...prev]);
        if (data.errors?.length) allErrors.push(...data.errors.map((e) => e.key));
      } catch (err) {
        // One batch failing (e.g. a genuine timeout on a slow connection)
        // doesn't abandon the rest — keep going so everyone who *can* be
        // generated still is, and report just this batch's names as failed.
        allErrors.push(...batch.map((p) => p.displayName));
      }
      setGenerateProgress({ done: Math.min(i + GENERATE_BATCH_SIZE, selectedList.length), total: selectedList.length });
    }

    if (allErrors.length) setGenerateError(`Failed for: ${allErrors.join(', ')}`);
    setGenerating(false);
  }

  async function handleBulkDownload() {
    if (selectedList.length === 0) return;
    setBulkDownloading(true);
    try {
      const res = await fetch(`${API}/budget-targeting/pdf/bulk`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: selectedList.map((p) => p.key) }),
      });
      if (!res.ok) throw new Error('Failed to build ZIP');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Sales_Target_Letters.zip'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setBulkDownloading(false);
    }
  }

  // Shared by the per-row "Send via Mail" button and the bulk "Send All"
  // button below — the backend already accepts an arbitrary batch of ids in
  // one call, so bulk send is just this same request with every generated
  // doc's id instead of one.
  //
  // A 3-minute AbortController timeout prevents a hanging SMTP batch from
  // silently turning into a bare "Failed to fetch" with no feedback — the
  // user instead sees "Request timed out" and can retry the failed docs.
  async function sendMailFor(docs) {
    setMailStatus((prev) => {
      const next = { ...prev };
      docs.forEach((d) => { next[d.id] = { status: 'sending' }; });
      return next;
    });
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3 * 60 * 1000); // 3 min
      let res;
      try {
        res = await fetch(`${API}/budget-targeting/send-mail`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: docs.map((d) => d.id) }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');

      setMailStatus((prev) => {
        const next = { ...prev };
        (data.sent || []).forEach((s) => {
          const ccNote = s.cc?.length ? ` (cc: ${s.cc.length})` : '';
          next[s.id] = { status: 'sent', message: `Sent to ${s.to}${ccNote}` };
        });
        (data.errors || []).forEach((e) => {
          next[e.id] = { status: 'error', message: e.error || 'Send failed' };
        });
        return next;
      });
      return data;
    } catch (err) {
      const message = err.name === 'AbortError' ? 'Request timed out — retry the failed ones' : err.message === 'Failed to fetch' ? 'Could not reach the server — check your connection and retry' : err.message;
      setMailStatus((prev) => {
        const next = { ...prev };
        docs.forEach((d) => { next[d.id] = { status: 'error', message }; });
        return next;
      });
      return null;
    }
  }

  async function handleSendMail(doc) {
    await sendMailFor([doc]);
  }

  function toggleSampleMail(docId) {
    setSampleMail((prev) => ({
      ...prev,
      [docId]: { address: '', status: null, message: '', ...prev[docId], open: !prev[docId]?.open },
    }));
  }

  function setSampleMailAddress(docId, address) {
    setSampleMail((prev) => ({ ...prev, [docId]: { ...prev[docId], address } }));
  }

  async function handleSendSampleMail(doc) {
    const address = (sampleMail[doc.id]?.address || '').trim();
    if (!address) return;
    setSampleMail((prev) => ({ ...prev, [doc.id]: { ...prev[doc.id], status: 'sending', message: '' } }));
    try {
      const res = await fetch(`${API}/budget-targeting/send-sample-mail`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, email: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      setSampleMail((prev) => ({ ...prev, [doc.id]: { ...prev[doc.id], status: 'sent', message: `Sample sent to ${data.to}` } }));
    } catch (err) {
      setSampleMail((prev) => ({ ...prev, [doc.id]: { ...prev[doc.id], status: 'error', message: err.message } }));
    }
  }

  // Same fix as batch PDF generation — one request covering everyone used to
  // sit for minutes (mail sending is inherently slower than most API calls:
  // an SMTP round trip plus an attachment per person) and then die with a
  // bare "Failed to fetch" timeout, with nothing to show for it even though
  // the backend was likely still working through the list. Small batches
  // keep each request well under any timeout and show real progress.
  // Kept small (5) so each request covers at most ~5 SMTP round trips —
  // a reasonable upper bound that stays well inside any proxy/browser
  // timeout even on a slow connection or with a large attachment per person.
  const SEND_ALL_BATCH_SIZE = 5;

  async function handleSendAllMail() {
    if (generatedDocs.length === 0) return;
    setSendingAll(true);
    setSendAllSummary('');
    setSendAllProgress({ done: 0, total: generatedDocs.length });

    let sentCount = 0;
    let failedCount = 0;
    for (let i = 0; i < generatedDocs.length; i += SEND_ALL_BATCH_SIZE) {
      const batch = generatedDocs.slice(i, i + SEND_ALL_BATCH_SIZE);
      const data = await sendMailFor(batch);
      if (data) {
        sentCount += data.sent?.length || 0;
        failedCount += data.errors?.length || 0;
      } else {
        // The whole batch request failed (e.g. a genuine timeout) — count
        // every doc in it as failed rather than losing track of them.
        failedCount += batch.length;
      }
      setSendAllProgress({ done: Math.min(i + SEND_ALL_BATCH_SIZE, generatedDocs.length), total: generatedDocs.length });
    }

    setSendAllSummary(`Sent ${sentCount} of ${generatedDocs.length}${failedCount ? ` — ${failedCount} failed` : ''}`);
    setSendingAll(false);
  }

  const step1Done = !!names;
  const step2Done = selectedList.length > 0;
  const step3Done = generatedDocs.length > 0;
  const currentStep = step3Done ? 4 : step2Done ? 3 : step1Done ? 2 : 1;
  const stepState = (n) => (n < currentStep || (n === currentStep && n === 4 && step3Done) ? 'done' : n === currentStep ? 'active' : 'pending');

  return (
    <div style={styles.shell}>
      <div style={styles.page}>

        <div style={styles.header}>
          <div style={styles.headerGlow} />
          <div style={styles.headerIcon}><Target size={26} /></div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={styles.title}>Budget Targeting System</h1>
            <p style={styles.subtitle}>Upload the yearly budget workbook, pick your people, and issue signed sales-target letters in seconds.</p>
          </div>
          {names && !showUploader && (
            <button
              style={{ ...styles.btnGhost, position: 'relative', zIndex: 1, background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff', flexShrink: 0 }}
              onClick={() => setShowUploader(true)}
            >
              <UploadCloud size={15} /> Upload Updated Excel
            </button>
          )}
        </div>

        {/* Stepper rail */}
        <div style={styles.stepRail}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s.n}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={styles.stepDot(stepState(s.n))}>
                  {stepState(s.n) === 'done' ? <Check size={16} strokeWidth={3} /> : s.n}
                </div>
                <span style={styles.stepLabel(stepState(s.n))}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div style={styles.stepConnector(s.n < currentStep)} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1 — Upload. Collapses to a compact confirmation once a
            workbook is loaded (the bundled default, or a prior upload) —
            "Upload Updated Excel" in the header reopens the full dropzone. */}
        {checkingExisting ? (
          <div style={styles.card}>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 9, color: C.inkSoft, fontWeight: 600, fontSize: '0.875rem' }}>
              <Loader2 size={16} style={{ animation: 'spin 0.9s linear infinite' }} /> Checking for a loaded workbook…
            </p>
          </div>
        ) : names && !showUploader ? (
          <div style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={styles.cardIconChip('green')}><FileSpreadsheet size={19} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={styles.cardEyebrow}>Step 1 · Ready</p>
                <h2 style={{ ...styles.cardTitle, marginBottom: 2 }}>{fileName || 'Budget workbook loaded'}</h2>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: C.inkSoft, fontWeight: 600 }}>{names.length} names ready to select</p>
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.card}>
            <div style={styles.cardHead}>
              <div style={styles.cardIconChip(step1Done ? 'green' : 'navy')}><FileSpreadsheet size={19} /></div>
              <div style={{ flex: 1 }}>
                <p style={styles.cardEyebrow}>Step 1</p>
                <h2 style={styles.cardTitle}>Upload the budget workbook</h2>
              </div>
              {names && (
                <button style={styles.linkBtn} onClick={() => setShowUploader(false)}>Cancel</button>
              )}
            </div>

            <label
              style={styles.dropzone(dragOver, uploading, step1Done)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={handleFileChange} disabled={uploading} />
              <div style={styles.dropIconRing(dragOver, step1Done)}>
                {uploading ? <Loader2 size={24} style={{ animation: 'spin 0.9s linear infinite' }} /> : step1Done ? <Check size={24} strokeWidth={2.5} /> : <UploadCloud size={24} />}
              </div>
              {uploading ? (
                <>
                  <p style={{ margin: 0, fontWeight: 800, color: C.ink, fontSize: '0.95rem' }}>Processing workbook…</p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: C.inkSoft }}>Reading the pivot tables — this can take a moment for large files.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontWeight: 800, color: C.ink, fontSize: '0.95rem' }}>{fileName || 'Drop your .xlsx file here'}</p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: C.inkSoft }}>
                    {fileName ? 'Drop a new file to replace it, or click to browse' : 'or click to browse from your computer'}
                  </p>
                </>
              )}
            </label>

            {uploadError && <p style={styles.error}><X size={15} /> {uploadError}</p>}
            {names && !uploading && (
              <p style={styles.success}><Sparkles size={15} /> Loaded {names.length} names from the workbook — ready to select.</p>
            )}
          </div>
        )}

        {/* Step 2 — Select names */}
        {names && (
          <div style={styles.card}>
            <div style={styles.cardHead}>
              <div style={styles.cardIconChip(step2Done ? 'green' : 'navy')}><Users size={19} /></div>
              <div>
                <p style={styles.cardEyebrow}>Step 2</p>
                <h2 style={styles.cardTitle}>Select who this is for</h2>
              </div>
            </div>

            <div style={styles.searchWrap}>
              <Search size={17} color={C.inkFaint} style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                type="text"
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={(e) => { e.target.style.borderColor = C.gold500; }}
                onBlur={(e) => { e.target.style.borderColor = C.border; }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.inkFaint }}>
                  <X size={16} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {['All', 'FLSP', 'RSM', 'Zonal Head'].map((lvl) => {
                const active = levelFilter === lvl;
                return (
                  <button
                    key={lvl}
                    onClick={() => setLevelFilter(lvl)}
                    style={{
                      padding: '0.4rem 0.9rem', borderRadius: 999, fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${active ? C.navy800 : C.border}`,
                      background: active ? C.navy800 : '#fff',
                      color: active ? '#fff' : C.inkSoft,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {lvl} <span style={{ opacity: 0.7 }}>({levelCounts[lvl] || 0})</span>
                  </button>
                );
              })}
            </div>

            <div style={styles.toolbar}>
              <button style={styles.linkBtn} onClick={toggleSelectAllFiltered}>
                {allFilteredSelected ? 'Deselect all' : 'Select all'} {(search || levelFilter !== 'All') ? '(filtered)' : ''}
              </button>
              <p style={styles.meta}>
                {selectedList.length > 0 ? `${selectedList.length} selected  ·  ` : ''}
                {filteredNames.length} of {names.length} names
              </p>
            </div>

            <div style={styles.nameGrid}>
              {filteredNames.map((n) => {
                const checked = selectedKeys.has(n.key);
                return (
                  <button key={n.key} style={styles.nameCard(checked)} onClick={() => toggleName(n.key)}>
                    <span style={styles.checkRing(checked)}>{checked && <Check size={13} strokeWidth={3} />}</span>
                    <span style={styles.avatar(checked)}>{initials(n.displayName)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', color: checked ? '#fff' : C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {n.displayName}
                      </span>
                      <span>
                        {n.level && n.level !== 'FLSP' && <span style={styles.badge('level', checked)}>{n.level}</span>}
                        {n.hasDiagnostics && <span style={styles.badge('diag', checked)}>Diagnostics</span>}
                        {n.hasEndoSurgery && <span style={styles.badge('endo', checked)}>Endo Surgery</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
              {filteredNames.length === 0 && (
                <p style={{ ...styles.meta, gridColumn: '1 / -1', padding: '2rem', textAlign: 'center' }}>No names match "{search}".</p>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — Generate */}
        {selectedList.length > 0 && (
          <div style={styles.card}>
            <div style={styles.cardHead}>
              <div style={styles.cardIconChip(step3Done ? 'green' : 'gold')}><Sparkles size={19} /></div>
              <div>
                <p style={styles.cardEyebrow}>Step 3</p>
                <h2 style={styles.cardTitle}>Generate the letters</h2>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.35rem' }}>
              {selectedList.map((p) => (
                <span key={p.key} style={styles.chip(true)}>
                  {p.displayName}
                  <button onClick={() => toggleName(p.key)} style={{ background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={11} strokeWidth={3} />
                  </button>
                </span>
              ))}
              <button style={styles.linkBtn} onClick={() => setSelectedKeys(new Set())}>Clear all</button>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button style={styles.btnGold(generating)} onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 size={17} style={{ animation: 'spin 0.9s linear infinite' }} /> : <Sparkles size={17} />}
                {generating
                  ? `Generating… ${generateProgress.done}/${generateProgress.total}`
                  : `Generate ${selectedList.length > 1 ? `${selectedList.length} letters` : 'letter'}`}
              </button>
              <button style={styles.btnGhost} onClick={handleBulkDownload} disabled={bulkDownloading}>
                {bulkDownloading ? <Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite' }} /> : <Archive size={15} />}
                {bulkDownloading ? 'Zipping…' : 'Download as ZIP'}
              </button>
            </div>
            {generating && generateProgress.total > 0 && (
              <div style={{ marginTop: '0.9rem' }}>
                <div style={{ height: 6, borderRadius: 999, background: C.border, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    width: `${(generateProgress.done / generateProgress.total) * 100}%`,
                    background: `linear-gradient(90deg, ${C.gold600}, ${C.gold500})`,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: C.inkSoft, fontWeight: 600 }}>
                  {generateProgress.done} of {generateProgress.total} letters generated — this can take a minute or two for a large batch.
                </p>
              </div>
            )}
            {generateError && <p style={styles.error}><X size={15} /> {generateError}</p>}
          </div>
        )}

        {/* Step 4 — Generated documents */}
        {generatedDocs.length > 0 && (
          <div style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <div style={styles.cardHead}>
                <div style={styles.cardIconChip('green')}><Check size={19} strokeWidth={2.5} /></div>
                <div>
                  <p style={styles.cardEyebrow}>Step 4</p>
                  <h2 style={styles.cardTitle}>Ready to send</h2>
                </div>
              </div>
              <button style={styles.btnGold(sendingAll)} onClick={handleSendAllMail} disabled={sendingAll || generatedDocs.length === 0}>
                {sendingAll ? <Loader2 size={16} style={{ animation: 'spin 0.9s linear infinite' }} /> : <Mail size={16} />}
                {sendingAll ? `Sending… ${sendAllProgress.done}/${sendAllProgress.total}` : `Send All via Mail (${generatedDocs.length})`}
              </button>
            </div>
            {sendingAll && sendAllProgress.total > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ height: 6, borderRadius: 999, background: C.border, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    width: `${(sendAllProgress.done / sendAllProgress.total) * 100}%`,
                    background: `linear-gradient(90deg, ${C.gold600}, ${C.gold500})`,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: C.inkSoft, fontWeight: 600 }}>
                  {sendAllProgress.done} of {sendAllProgress.total} sent — this can take a few minutes for a large batch.
                </p>
              </div>
            )}
            {sendAllSummary && (
              <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: C.inkSoft, fontWeight: 600 }}>{sendAllSummary}</p>
            )}

            {generatedDocs.map((doc) => {
              const mail = mailStatus[doc.id];
              const sample = sampleMail[doc.id];
              return (
                <div key={doc.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={styles.docItem}>
                    <span style={styles.docIconChip}><FileText size={18} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem', color: C.ink }}>{doc.displayName}</span>
                      <span style={{ fontSize: '0.75rem', color: C.inkFaint, fontWeight: 600 }}>{doc.fileName}</span>
                    </span>
                    <a style={styles.btnGhost} href={`${API}${doc.viewUrl}${doc.viewUrl.includes('?') ? '&' : '?'}token=${token}`} target="_blank" rel="noreferrer">
                      <Eye size={14} /> Open
                    </a>
                    <a style={styles.btnGhost} href={`${API}${doc.downloadUrl}${doc.downloadUrl.includes('?') ? '&' : '?'}token=${token}`}>
                      <Download size={14} /> Download
                    </a>
                    <button style={styles.btnGhost} onClick={() => toggleSampleMail(doc.id)}>
                      <FileText size={14} /> {sample?.open ? 'Cancel Sample' : 'Send Sample Mail'}
                    </button>
                    <button
                      style={{ ...styles.btnGhost, opacity: mail?.status === 'sending' ? 0.6 : 1, cursor: mail?.status === 'sending' ? 'wait' : 'pointer' }}
                      onClick={() => handleSendMail(doc)}
                      disabled={mail?.status === 'sending'}
                    >
                      {mail?.status === 'sending'
                        ? (<><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Sending…</>)
                        : mail?.status === 'sent'
                          ? (<><CheckCircle2 size={14} color={C.green} /> Resend</>)
                          : (<><Mail size={14} /> Send via Mail</>)}
                    </button>
                  </div>
                  {mail?.status === 'sent' && (
                    <p style={{ margin: '2px 0 10px 52px', fontSize: '0.75rem', color: C.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <CheckCircle2 size={13} /> {mail.message}
                    </p>
                  )}
                  {mail?.status === 'error' && (
                    <p style={{ margin: '2px 0 10px 52px', fontSize: '0.75rem', color: C.red, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertCircle size={13} /> {mail.message}
                    </p>
                  )}
                  {sample?.open && (
                    <div style={{ margin: '0 0 10px 52px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="email"
                        placeholder="test@example.com"
                        value={sample.address || ''}
                        onChange={(e) => setSampleMailAddress(doc.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSendSampleMail(doc); }}
                        style={{ ...styles.searchInput, width: 260, padding: '0.5rem 0.75rem' }}
                      />
                      <button
                        style={{ ...styles.btnGhost, opacity: sample.status === 'sending' || !sample.address?.trim() ? 0.6 : 1 }}
                        onClick={() => handleSendSampleMail(doc)}
                        disabled={sample.status === 'sending' || !sample.address?.trim()}
                      >
                        {sample.status === 'sending' ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Mail size={14} />}
                        Send
                      </button>
                      {sample.status === 'sent' && (
                        <span style={{ fontSize: '0.75rem', color: C.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={13} /> {sample.message}
                        </span>
                      )}
                      {sample.status === 'error' && (
                        <span style={{ fontSize: '0.75rem', color: C.red, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertCircle size={13} /> {sample.message}
                        </span>
                      )}
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

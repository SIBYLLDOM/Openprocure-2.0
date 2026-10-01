import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText, Search, X, Folder, FolderPlus, Upload, Send, Loader2,
  Download, Trash2, Sparkles, ChevronLeft, MessageSquare,
} from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const C = {
  navy900: '#0a1530', navy700: '#182a54', gold500: '#e0a52c', gold600: '#c48a1a',
  paper: '#f5f6fb', card: '#ffffff', border: '#e7e9f3', borderStrong: '#d7dbec',
  ink: '#0f1729', inkSoft: '#5b6478', inkFaint: '#98a0b3',
  green: '#0f9d68', greenWash: '#e4f7ee', red: '#d9483a', redWash: '#fdedec',
};

const styles = {
  shell: { background: C.paper, minHeight: '100%', padding: '2rem', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  page: { maxWidth: '1200px', margin: '0 auto' },
  header: {
    display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem',
    padding: '1.5rem 1.75rem', borderRadius: 16,
    background: `linear-gradient(120deg, ${C.navy900}, ${C.navy700})`,
  },
  headerIcon: { width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', color: C.gold500, flexShrink: 0 },
  title: { fontSize: '1.35rem', fontWeight: 800, color: '#fff', margin: 0 },
  subtitle: { margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'rgba(226,232,255,0.72)' },
  card: { background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '1.5rem', boxShadow: '0 1px 2px rgba(15,23,41,0.03), 0 8px 20px rgba(15,23,41,0.04)' },
  searchInput: { width: '100%', padding: '0.7rem 1rem 0.7rem 2.5rem', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: '0.875rem', boxSizing: 'border-box', background: '#fafbff' },
  btn: (bg, color) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1rem', borderRadius: 9, border: 'none', background: bg, color, fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer' }),
  ghostBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.85rem', borderRadius: 9, border: `1.5px solid ${C.border}`, background: '#fff', color: C.inkSoft, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' },
  pickerRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer', marginBottom: '0.5rem' },
};

function TenderPicker({ onSelect }) {
  const token = localStorage.getItem('token');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      setLoading(true);
      try {
        const res = await fetch(`${API}/tenders?search=${encodeURIComponent(q)}&limit=15`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setResults(data.data || []);
      } catch { setResults([]); }
      setLoading(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q, token]);

  return (
    <div style={styles.card}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 800, color: C.ink }}>Pick a tender</h2>
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={16} color={C.inkFaint} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          style={styles.searchInput}
          placeholder="Search by bid number, item, buyer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>
      {loading && <p style={{ color: C.inkFaint, fontSize: '0.8rem' }}><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite', marginRight: 6 }} />Searching…</p>}
      {results.map((t) => (
        <div key={t.bid_number} style={styles.pickerRow} onClick={() => onSelect(t.bid_number)}>
          <FileText size={16} color={C.navy700} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: C.ink }}>{t.bid_number}</div>
            <div style={{ fontSize: '0.75rem', color: C.inkFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.items || t.tender_title || ''}</div>
          </div>
        </div>
      ))}
      {!loading && q.trim() && results.length === 0 && <p style={{ color: C.inkFaint, fontSize: '0.8rem' }}>No tenders match "{q}".</p>}
    </div>
  );
}

export default function LetterGenerate() {
  const token = localStorage.getItem('token');
  const authHeader = { Authorization: `Bearer ${token}` };

  const [bidNumber, setBidNumber] = useState(null);
  const [folder, setFolder] = useState('');
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState('');
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef(null);

  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Tell me what letter to draft — e.g. "create a letter for Extension of Validity of Rate Contract" — and I\'ll match it to one of our real formats and fill in this tender\'s details.' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  const encodedBid = bidNumber ? encodeURIComponent(bidNumber) : null;

  const loadFolders = useCallback(async () => {
    if (!encodedBid) return;
    const res = await fetch(`${API}/letters/${encodedBid}/folders`, { headers: authHeader });
    const data = await res.json();
    if (data.success) setFolders(data.folders);
  }, [encodedBid]);

  const loadDocuments = useCallback(async () => {
    if (!encodedBid) return;
    setLoadingDocs(true);
    const params = new URLSearchParams({ folder });
    if (search) params.set('search', search);
    const res = await fetch(`${API}/letters/${encodedBid}/documents?${params}`, { headers: authHeader });
    const data = await res.json();
    if (data.success) setDocuments(data.documents);
    setLoadingDocs(false);
  }, [encodedBid, folder, search]);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { loadDocuments(); }, [loadDocuments]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    await fetch(`${API}/letters/${encodedBid}/folders`, {
      method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setNewFolderName('');
    setNewFolderOpen(false);
    loadFolders();
  }

  async function handleAddFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    await fetch(`${API}/letters/${encodedBid}/upload`, { method: 'POST', headers: authHeader, body: fd });
    loadDocuments();
  }

  async function handleDelete(id) {
    await fetch(`${API}/letters/${encodedBid}/documents/${id}`, { method: 'DELETE', headers: authHeader });
    loadDocuments();
  }

  function handleDownload(id) {
    window.open(`${API}/letters/${encodedBid}/documents/${id}/download?token=${token}`, '_blank');
  }

  async function handleChatSend() {
    const msg = chatInput.trim();
    if (!msg || sending) return;
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setChatInput('');
    setSending(true);
    try {
      const res = await fetch(`${API}/letters/${encodedBid}/chat`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, folder, history: messages.slice(-6) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to generate');
      const note = data.matchedFormat
        ? `${data.reply}${data.matchConfident ? '' : ' (no strong format match — used closest available)'} — matched format: "${data.matchedFormat}"`
        : data.reply;
      setMessages((m) => [...m, { role: 'assistant', content: note }]);
      loadDocuments();
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry — ${err.message}` }]);
    } finally {
      setSending(false);
    }
  }

  if (!bidNumber) {
    return (
      <div style={styles.shell}>
        <div style={styles.page}>
          <div style={styles.header}>
            <div style={styles.headerIcon}><FileText size={22} /></div>
            <div>
              <h1 style={styles.title}>Letter Generate</h1>
              <p style={styles.subtitle}>Chat-drafted tender letters, matched to Meril's real letter formats and filled with each tender's own details.</p>
            </div>
          </div>
          <TenderPicker onSelect={setBidNumber} />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <div style={styles.page}>
        <div style={styles.header}>
          <button onClick={() => setBidNumber(null)} style={{ ...styles.ghostBtn, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>
            <ChevronLeft size={14} /> Change tender
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={styles.title}>{bidNumber}</h1>
            <p style={styles.subtitle}>Letter Generate</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: '1.25rem', alignItems: 'start' }}>
          {/* File manager */}
          <div style={styles.card}>
            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={15} color={C.inkFaint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input style={{ ...styles.searchInput, padding: '0.55rem 0.75rem 0.55rem 2.2rem' }} placeholder="Search files…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button style={styles.ghostBtn} onClick={() => setNewFolderOpen((o) => !o)}><FolderPlus size={14} /> Create Folder</button>
              <input ref={fileInputRef} type="file" hidden onChange={handleAddFile} />
              <button style={styles.ghostBtn} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Add File</button>
            </div>

            {newFolderOpen && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input style={{ ...styles.searchInput, padding: '0.5rem 0.75rem' }} placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} autoFocus />
                <button style={styles.btn(C.navy700, '#fff')} onClick={handleCreateFolder}>Create</button>
              </div>
            )}

            {/* Folder tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button
                onClick={() => setFolder('')}
                style={{ ...styles.ghostBtn, background: folder === '' ? C.navy700 : '#fff', color: folder === '' ? '#fff' : C.inkSoft, borderColor: folder === '' ? C.navy700 : C.border }}
              >
                All files
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFolder(f.name)}
                  style={{ ...styles.ghostBtn, background: folder === f.name ? C.navy700 : '#fff', color: folder === f.name ? '#fff' : C.inkSoft, borderColor: folder === f.name ? C.navy700 : C.border }}
                >
                  <Folder size={13} /> {f.name}
                </button>
              ))}
            </div>

            {/* File list */}
            {loadingDocs ? (
              <p style={{ color: C.inkFaint, fontSize: '0.85rem' }}><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite', marginRight: 6 }} />Loading…</p>
            ) : documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: C.inkFaint }}>
                <FileText size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: '0.85rem' }}>No letters yet — ask the chat to draft one, or add an existing file.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {documents.map((doc) => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.9rem', borderRadius: 10, border: `1px solid ${C.border}` }}>
                    <FileText size={16} color={doc.source === 'ai' ? C.gold600 : C.navy700} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                      <div style={{ fontSize: '0.7rem', color: C.inkFaint }}>
                        {doc.source === 'ai' ? `AI-drafted${doc.template_used ? ` · ${doc.template_used}` : ''}` : 'Uploaded'} · {new Date(doc.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button title="Download" onClick={() => handleDownload(doc.id)} style={{ ...styles.ghostBtn, padding: '0.4rem 0.6rem' }}><Download size={14} /></button>
                    <button title="Delete" onClick={() => handleDelete(doc.id)} style={{ ...styles.ghostBtn, padding: '0.4rem 0.6rem', color: C.red, borderColor: '#f6cac5' }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chat panel */}
          <div style={{ ...styles.card, display: 'flex', flexDirection: 'column', height: 560, padding: '1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.9rem' }}>
              <MessageSquare size={16} color={C.gold600} />
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: C.ink }}>Draft via chat</h3>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: 4 }}>
              {messages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%', padding: '0.6rem 0.8rem', borderRadius: 10, fontSize: '0.8125rem', lineHeight: 1.45,
                  background: m.role === 'user' ? C.navy700 : '#f1f3fb',
                  color: m.role === 'user' ? '#fff' : C.ink,
                }}>
                  {m.content}
                </div>
              ))}
              {sending && (
                <div style={{ alignSelf: 'flex-start', padding: '0.6rem 0.8rem', borderRadius: 10, background: '#f1f3fb', color: C.inkFaint, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Matching format and drafting…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <input
                style={{ ...styles.searchInput, padding: '0.6rem 0.8rem', flex: 1 }}
                placeholder="Create a letter for…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                disabled={sending}
              />
              <button style={{ ...styles.btn(C.gold500, C.navy900), opacity: sending ? 0.6 : 1 }} onClick={handleChatSend} disabled={sending}>
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

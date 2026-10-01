import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, FileDown, FileText, Loader2, Send, Bot, User, ChevronRight, ChevronLeft, Sparkles, RotateCcw } from 'lucide-react';
import UniverDocumentEditor from '../../components/common/UniverDocumentEditor';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const STORAGE_KEY  = 'docs_editor_';

function loadDoc(docId) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY + docId);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function saveDoc(docId, title, content, bidNo) {
    localStorage.setItem(STORAGE_KEY + docId, JSON.stringify({
        id: docId, title, content, bidNo, savedAt: new Date().toISOString(),
    }));
}

export default function DocsEditor() {
    const { docId }  = useParams();
    const navigate   = useNavigate();
    const location   = useLocation();
    const stateTitle = location.state?.title || '';
    const stateBidNo = location.state?.bidNo || '';

    const isNew = !docId || docId === 'new';
    const idRef = useRef(isNew ? ('doc_' + Date.now()) : docId);

    const savedDoc = isNew ? null : loadDoc(docId);

    const [title,       setTitle]       = useState(savedDoc?.title || stateTitle || 'Untitled Document');
    const [content,     setContent]     = useState(savedDoc?.content || '');
    // The tender this draft belongs to (if any) — lets export pick the right
    // Endo/Diagno letterhead instead of always defaulting to Diagno.
    const bidNoRef = useRef(savedDoc?.bidNo || stateBidNo || null);
    const [status,      setStatus]      = useState('');
    const [exporting,   setExporting]   = useState(false);
    const [redirected,  setRedirected]  = useState(false);

    // Editor key — bumped whenever we want to reload Univer with new content from chat
    const [editorKey,   setEditorKey]   = useState(idRef.current);
    const editorRef = useRef(null);

    // ── Chat state ─────────────────────────────────────────────────────────────
    const [chatOpen,    setChatOpen]    = useState(true);
    const [messages,    setMessages]    = useState([
        { role: 'assistant', content: 'Hi! I\'m OpenProcure AI. Tell me what changes you\'d like to make to this document — I\'ll update it instantly.' }
    ]);
    const [chatInput,   setChatInput]   = useState('');
    const [isChatting,  setIsChatting]  = useState(false);
    const [applying,    setApplying]    = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef       = useRef(null);
    const historyRef     = useRef([]); // raw history without the initial greeting

    // Scroll chat to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    if (isNew && !redirected) {
        setRedirected(true);
        queueMicrotask(() => navigate(`/Docs/${idRef.current}`, { replace: true }));
    }

    const handleSave = (latestHtml) => {
        const html = latestHtml !== undefined ? latestHtml : content;
        setStatus('saving');
        try {
            saveDoc(idRef.current, title, html, bidNoRef.current);
            setStatus('saved');
        } catch { setStatus('error'); }
        setTimeout(() => setStatus(''), 2500);
    };

    const handleExportDocx = async (html) => {
        setExporting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/doc-prep/export-docx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title, html_content: html || content, bidNo: bidNoRef.current }),
            });
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = Object.assign(document.createElement('a'), { href: url, download: `${title.replace(/[^a-zA-Z0-9 _-]/g, '_')}.docx` });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch { alert('DOCX export failed. Please try again.'); }
        finally   { setExporting(false); }
    };

    const handleExportPdf = async (html) => {
        setExporting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/doc-prep/export-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title, html_content: html || content, bidNo: bidNoRef.current }),
            });
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = Object.assign(document.createElement('a'), { href: url, download: `${title.replace(/[^a-zA-Z0-9 _-]/g, '_')}.pdf` });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch { alert('PDF export failed. Please try again.'); }
        finally   { setExporting(false); }
    };

    // ── Chat send ──────────────────────────────────────────────────────────────
    const handleChatSend = async () => {
        const msg = chatInput.trim();
        if (!msg || isChatting) return;

        // Get latest HTML from Univer (falls back to content state)
        const currentHtml = editorRef.current?.getHtml() || content;

        // Add user message to UI
        const userMsg = { role: 'user', content: msg };
        setMessages(prev => [...prev, userMsg]);
        setChatInput('');
        setIsChatting(true);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/doc-prep/chat-edit`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body:    JSON.stringify({
                    html_content: currentHtml,
                    message:      msg,
                    history:      historyRef.current,
                }),
            });
            const json = await res.json();

            if (json.success && json.updated_html) {
                const aiMsg = { role: 'assistant', content: json.reply || 'Document updated.' };
                setMessages(prev => [...prev, aiMsg]);

                // Save history for next turn
                historyRef.current = [
                    ...historyRef.current,
                    { role: 'user',      content: msg },
                    { role: 'assistant', content: json.reply || 'Document updated.' },
                ].slice(-12); // keep last 6 turns

                // Apply updated HTML to editor
                setApplying(true);
                setContent(json.updated_html);
                saveDoc(idRef.current, title, json.updated_html, bidNoRef.current);
                // Force Univer to reload with new content
                setEditorKey(idRef.current + '_' + Date.now());
                setTimeout(() => setApplying(false), 800);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: json.message || 'Something went wrong. Please try again.',
                    error: true,
                }]);
            }
        } catch (e) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Connection error. Please check your network and try again.',
                error: true,
            }]);
        } finally {
            setIsChatting(false);
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleChatSend();
        }
    };

    const handleClearChat = () => {
        setMessages([{ role: 'assistant', content: 'Chat cleared. How else can I help with this document?' }]);
        historyRef.current = [];
    };

    const statusLabel = status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : status === 'error' ? '✗ Save failed' : '';
    const statusColor = status === 'saved' ? '#059669' : status === 'error' ? '#dc2626' : '#6b7280';

    return (
        <div style={s.page}>
            {/* Top bar */}
            <div style={s.topBar}>
                <button style={s.backBtn} onClick={() => navigate(-1)} title="Back">
                    <ArrowLeft size={18} />
                </button>
                <FileText size={20} color="#4f46e5" style={{ flexShrink: 0 }} />
                <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onBlur={() => handleSave(content)}
                    style={s.titleInput}
                    placeholder="Untitled Document"
                    spellCheck={false}
                />
                {statusLabel && (
                    <span style={{ fontSize: 12, color: statusColor, flexShrink: 0 }}>
                        {status === 'saving' && <Loader2 size={12} style={{ display: 'inline', marginRight: 4 }} />}
                        {statusLabel}
                    </span>
                )}
                <div style={{ flex: 1 }} />
                <button style={{ ...s.topBtn, background: '#059669' }} onClick={() => handleSave(content)}>
                    <Save size={15} /> Save
                </button>
                <button style={{ ...s.topBtn, background: '#2563eb', opacity: exporting ? 0.6 : 1 }} onClick={() => handleExportDocx(editorRef.current?.getHtml() || content)} disabled={exporting}>
                    <FileDown size={15} /> DOCX
                </button>
                <button style={{ ...s.topBtn, background: '#7c3aed', opacity: exporting ? 0.6 : 1 }} onClick={() => handleExportPdf(editorRef.current?.getHtml() || content)} disabled={exporting}>
                    <FileDown size={15} /> PDF
                </button>
                {/* Chat toggle */}
                <button
                    style={{ ...s.topBtn, background: chatOpen ? '#0f172a' : '#334155' }}
                    onClick={() => setChatOpen(o => !o)}
                    title={chatOpen ? 'Hide AI Chat' : 'Show AI Chat'}
                >
                    <Sparkles size={15} /> {chatOpen ? 'Hide Chat' : 'AI Chat'}
                </button>
            </div>

            {/* Body: editor + chat side panel */}
            <div style={s.body}>
                {/* Editor area */}
                <div style={{ ...s.editorWrap, position: 'relative' }}>
                    {applying && (
                        <div style={s.applyingOverlay}>
                            <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} />
                            <span>Applying changes…</span>
                        </div>
                    )}
                    <UniverDocumentEditor
                        key={editorKey}
                        ref={editorRef}
                        content={content}
                        onChange={setContent}
                        onSaveDraft={handleSave}
                        onExportDocx={handleExportDocx}
                        onExportPdf={handleExportPdf}
                        isExporting={exporting}
                    />
                </div>

                {/* Chat panel */}
                {chatOpen && (
                    <div style={s.chatPanel}>
                        {/* Chat header */}
                        <div style={s.chatHeader}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={s.aiAvatar}><Sparkles size={14} /></div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>OpenProcure AI</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>Document editor assistant</div>
                                </div>
                            </div>
                            <button onClick={handleClearChat} title="Clear chat" style={s.clearBtn}>
                                <RotateCcw size={13} />
                            </button>
                        </div>

                        {/* Messages */}
                        <div style={s.messageList}>
                            {messages.map((msg, i) => (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                                        {/* Avatar */}
                                        <div style={msg.role === 'user' ? s.userAvatar : s.botAvatar}>
                                            {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                                        </div>
                                        {/* Bubble */}
                                        <div style={{
                                            ...s.bubble,
                                            background: msg.role === 'user' ? '#4f46e5' : msg.error ? '#fee2e2' : '#f1f5f9',
                                            color:      msg.role === 'user' ? '#fff'    : msg.error ? '#991b1b' : '#1e293b',
                                            borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                        }}>
                                            {msg.content}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {isChatting && (
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 12 }}>
                                    <div style={s.botAvatar}><Bot size={12} /></div>
                                    <div style={{ ...s.bubble, background: '#f1f5f9', color: '#64748b' }}>
                                        <span style={s.typingDot} />
                                        <span style={{ ...s.typingDot, animationDelay: '0.15s' }} />
                                        <span style={{ ...s.typingDot, animationDelay: '0.3s' }} />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input area */}
                        <div style={s.inputArea}>
                            <textarea
                                ref={inputRef}
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask OpenProcure AI to edit this document… (Enter to send)"
                                style={s.chatInput}
                                rows={3}
                                disabled={isChatting}
                            />
                            <button
                                onClick={handleChatSend}
                                disabled={isChatting || !chatInput.trim()}
                                style={{ ...s.sendBtn, opacity: (isChatting || !chatInput.trim()) ? 0.5 : 1 }}
                            >
                                {isChatting ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={16} />}
                            </button>
                        </div>

                        <div style={{ padding: '6px 12px 8px', fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
                            Shift+Enter for new line · Enter to send
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin  { to { transform: rotate(360deg); } }
                @keyframes blink { 0%,100%{opacity:0.2} 50%{opacity:1} }
            `}</style>
        </div>
    );
}

const s = {
    page:      { height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' },
    topBar:    { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0, minHeight: 52, flexWrap: 'nowrap' },
    backBtn:   { background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151', flexShrink: 0 },
    titleInput:{ border: 'none', outline: 'none', fontSize: 15, fontWeight: 600, color: '#111827', background: 'transparent', flex: '0 1 280px', minWidth: 80, padding: '4px 6px', borderRadius: 4 },
    topBtn:    { color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' },

    body:      { flex: 1, display: 'flex', overflow: 'hidden' },
    editorWrap:{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 },

    applyingOverlay: {
        position: 'absolute', inset: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, fontSize: 14, fontWeight: 600, color: '#4f46e5',
    },

    // Chat panel
    chatPanel: {
        width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderLeft: '1px solid #e2e8f0', background: '#fff', overflow: 'hidden',
    },
    chatHeader: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '1px solid #e2e8f0',
        background: '#fafafa', flexShrink: 0,
    },
    aiAvatar:   { width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 },
    clearBtn:   { background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' },

    messageList:{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column' },
    userAvatar: { width: 24, height: 24, borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 },
    botAvatar:  { width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 },
    bubble:     { maxWidth: 240, padding: '9px 13px', fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word' },

    typingDot:  { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#94a3b8', marginRight: 3, animation: 'blink 1.2s infinite' },

    inputArea:  { display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid #e2e8f0', alignItems: 'flex-end', flexShrink: 0 },
    chatInput:  {
        flex: 1, padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 10,
        fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.5,
        background: '#f8fafc', color: '#1e293b',
    },
    sendBtn:    { width: 38, height: 38, borderRadius: 10, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
};

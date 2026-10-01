import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, FileDown, FileText, Loader2, Send, Bot, User, ChevronRight, ChevronLeft, Sparkles, RotateCcw, Paperclip, X, Image as ImageIcon, FileType } from 'lucide-react';
import UniverDocumentEditor from '../../components/common/UniverDocumentEditor';
import DownloadShareButtons from '../../components/common/DownloadShareButtons';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const STORAGE_KEY  = 'docs_editor_';

function loadDoc(docId) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY + docId);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function saveDoc(docId, title, content, bidNo, extra = {}) {
    // Preserve fields set by the doc's origin (e.g. Doc Prep's
    // source/annexureId/pushedToMyDocs/requiresStampPaper) — editing and
    // saving here must never silently push an annexure into My Documents or
    // lose its provenance.
    const existing = loadDoc(docId) || {};
    localStorage.setItem(STORAGE_KEY + docId, JSON.stringify({
        ...existing, ...extra,
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

    // Doc Prep docIds are built as `docprep_<TENDERID_WITH_UNDERSCORES>_ann_<n>`
    // — if bidNo is somehow missing from both the saved record and nav state
    // (e.g. this editor was opened via a direct/refreshed URL, before the
    // very first save ever captured one), derive it from the docId itself
    // rather than silently locking bidNoRef to null forever. A null bidNo
    // here means every future PDF export/upload for this doc quietly 404s
    // (the upload-document route requires a bid number in the URL path).
    // Doc Prep builds this as `docprep_<TENDERID_WITH_UNDERSCORES>_<annexure.id>`,
    // and annexure ids are themselves shaped like "ann_1" — so the id is
    // everything from the last "_ann_" onward (inclusive), and the bid
    // number is everything between "docprep_" and that suffix.
    const DOC_PREP_ID_RE = /^docprep_(.+)_(ann_[^_]+)$/;
    const deriveBidNoFromDocId = (id) => {
        const m = DOC_PREP_ID_RE.exec(id || '');
        return m ? m[1].replace(/_/g, '/') : null;
    };
    // Docs generated before the source/annexureId tagging existed (or that
    // lost it some other way) still match this shape, and without it the
    // "Push to My Docs" gate below (source === 'doc_prep_annexure') just
    // silently no-ops.
    const deriveAnnexureIdFromDocId = (id) => {
        const m = DOC_PREP_ID_RE.exec(id || '');
        return m ? m[2] : null;
    };
    const looksLikeDocPrepAnnexure = DOC_PREP_ID_RE.test(docId || '');

    const [title,       setTitle]       = useState(savedDoc?.title || stateTitle || 'Untitled Document');
    const [content,     setContent]     = useState(savedDoc?.content || '');
    // The tender this draft belongs to (if any) — lets export pick the right
    // Endo/Diagno letterhead instead of always defaulting to Diagno.
    const bidNoRef = useRef(savedDoc?.bidNo || stateBidNo || deriveBidNoFromDocId(docId) || null);
    const [status,      setStatus]      = useState('');
    const [exporting,   setExporting]   = useState(false);
    const [redirected,  setRedirected]  = useState(false);

    // Stamp Paper / Affidavit documents must be printed plain — no letterhead,
    // no auto-inserted digital signature — so they can be wet-signed and
    // notarized. For these, Download always exports with plainExport:true
    // (see buildEditorFormats below); "Push to Mydocs" is hidden entirely
    // since the signed scan gets uploaded from Doc Prep's "Upload Signed
    // Copy" flow instead, not from here.
    const requiresStampPaper = !!(savedDoc?.requiresStampPaper || location.state?.requiresStampPaper);

    // Opened to edit ONE page of a merged PDF (from the merged-document page
    // editor) rather than a normal annexure — "Push to Mydocs" here would
    // push this single page as its own standalone document, which isn't
    // what's wanted; the merged-page editor pulls this draft's saved content
    // back in itself once the user clicks Back.
    const isMergedPageEdit = !!(savedDoc?.mergedPageEdit || location.state?.mergedPageEdit);

    // Top-right toast — confirms an explicit "Save Draft" click.
    const [toast, setToast] = useState(null);
    const toastTimerRef = useRef(null);
    const showToast = (message) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ message });
        toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    };

    // ── "Saved" confirmation popup — shown only for an explicit Save-button
    //    click, not the quieter title-blur/chat-edit auto-saves. When the
    //    document is a Doc Prep annexure not yet in My Documents, offers a
    //    one-click "Push to My Docs" right from here. ────────────────────────
    const [showSavedModal, setShowSavedModal] = useState(false);
    const docSourceRef = useRef(savedDoc?.source || (looksLikeDocPrepAnnexure ? 'doc_prep_annexure' : null));
    const annexureIdRef = useRef(savedDoc?.annexureId || deriveAnnexureIdFromDocId(docId));
    const [pushedToMyDocs, setPushedToMyDocs] = useState(savedDoc?.pushedToMyDocs || false);
    const [pushing, setPushing] = useState(false);

    // Editor key — bumped whenever we want to reload Univer with new content from chat
    const [editorKey,   setEditorKey]   = useState(idRef.current);
    const editorRef = useRef(null);

    // ── Chat state ─────────────────────────────────────────────────────────────
    // Chat UI is hidden for now (toggle button and panel removed below) —
    // kept false so nothing renders; the underlying send/apply logic is left
    // intact in case it's re-enabled later.
    const [chatOpen,    setChatOpen]    = useState(false);
    const [messages,    setMessages]    = useState([
        { role: 'assistant', content: 'Hi! I\'m OpenProcure AI. Tell me what changes you\'d like to make to this document — I\'ll update it instantly.' }
    ]);
    const [chatInput,   setChatInput]   = useState('');
    const [isChatting,  setIsChatting]  = useState(false);
    const [applying,    setApplying]    = useState(false);
    const [attachedFile, setAttachedFile] = useState(null); // photo/PDF/Word/Excel/CSV to send with the next message
    const messagesEndRef = useRef(null);
    const inputRef       = useRef(null);
    const fileInputRef   = useRef(null);
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
            saveDoc(idRef.current, title, html, bidNoRef.current, {
                ...(requiresStampPaper ? { requiresStampPaper: true } : {}),
                ...(isMergedPageEdit  ? { mergedPageEdit: true }  : {}),
            });
            setStatus('saved');
        } catch { setStatus('error'); }
        setTimeout(() => setStatus(''), 2500);
    };

    // "Save Draft" — an explicit draft save (distinct from the quiet title-blur
    // autosave): persists content locally and, if this document is a Doc Prep
    // annexure, stamps a draftSavedAt on its generatedMap entry so the
    // annexure's row in Doc Prep can show "Draft saved" until it's pushed.
    const handleSaveDraftClick = () => {
        const html = editorRef.current?.getHtml() || content;
        handleSave(html);
        showToast('Draft saved');
        if (annexureIdRef.current && bidNoRef.current) {
            const tidNorm = bidNoRef.current.replace(/[^a-zA-Z0-9]/g, '_');
            const mapKey  = `doc_prep_generated_${tidNorm}`;
            try {
                const mapRaw = localStorage.getItem(mapKey);
                const map    = mapRaw ? JSON.parse(mapRaw) : {};
                if (map[annexureIdRef.current]) {
                    map[annexureIdRef.current] = { ...map[annexureIdRef.current], draftSavedAt: new Date().toISOString() };
                    localStorage.setItem(mapKey, JSON.stringify(map));
                }
            } catch { /* ignore */ }
        }
    };

    // Does the actual render-to-PDF + upload — used both by the normal gated
    // flow below and by the modal's "Push anyway" escape hatch for a doc
    // whose flag got stuck true from before annexure_id was sent on every
    // push (so a delete in My Docs couldn't find it to reset the flag) —
    // without that hatch, that class of doc could never be pushed again.
    const pushToMyDocs = async (html) => {
        if (!bidNoRef.current) {
            alert('This document has no tender/bid number attached, so it cannot be pushed to My Docs. Please reopen it from Doc Prep.');
            return;
        }
        setPushing(true);
        try {
            const token = localStorage.getItem('token');
            const authHeader = { Authorization: `Bearer ${token}` };
            const pdfRes = await fetch(`${API_BASE_URL}/doc-prep/export-pdf`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, html_content: html, bidNo: bidNoRef.current }),
            });
            if (!pdfRes.ok) {
                alert('Saved, but PDF render failed — could not push to My Docs.');
                return;
            }
            const pdfBlob = await pdfRes.blob();
            const safeName = (title || 'Document').replace(/[^a-zA-Z0-9_\-]/g, '_');
            const pdfFile  = new File([pdfBlob], `${safeName}.pdf`, { type: 'application/pdf' });
            const fd = new FormData();
            fd.append('file', pdfFile);
            fd.append('name', title || 'Document');
            fd.append('description', 'Pushed from Docs editor (Doc Prep)');
            // Without annexure_id, WorkspaceMyDocs' delete handler
            // (clearDocPrepPushedFlag) can't find this doc's annexure to
            // reset its "pushed" flag — so deleting this upload and pushing
            // again would silently no-op forever, since both Doc Prep's map
            // and this doc's own pushedToMyDocs flag would still say
            // "already pushed".
            if (annexureIdRef.current) fd.append('annexure_id', annexureIdRef.current);
            fd.append('push_source', 'annexure');
            const encodedBid = encodeURIComponent(bidNoRef.current || '');
            const upRes = await fetch(`${API_BASE_URL}/doc-prep/${encodedBid}/upload-document`, {
                method: 'POST', headers: authHeader, body: fd,
            });
            const upJson = await upRes.json().catch(() => ({}));
            if (!upRes.ok || !upJson.success) {
                alert('Rendered the PDF, but the upload to My Docs failed: ' + (upJson.message || `server error ${upRes.status}`));
                return;
            }

            const raw = localStorage.getItem(STORAGE_KEY + idRef.current);
            const doc = raw ? JSON.parse(raw) : null;
            if (doc) {
                doc.pushedToMyDocs = true;
                localStorage.setItem(STORAGE_KEY + idRef.current, JSON.stringify(doc));
            }
            if (annexureIdRef.current && bidNoRef.current) {
                const tidNorm = bidNoRef.current.replace(/[^a-zA-Z0-9]/g, '_');
                const mapKey  = `doc_prep_generated_${tidNorm}`;
                const mapRaw  = localStorage.getItem(mapKey);
                const map     = mapRaw ? JSON.parse(mapRaw) : {};
                if (map[annexureIdRef.current]) {
                    map[annexureIdRef.current] = { ...map[annexureIdRef.current], pushed: true };
                    localStorage.setItem(mapKey, JSON.stringify(map));
                }
            }
            setPushedToMyDocs(true);
        } catch (e) {
            alert('Saved, but push to My Docs failed: ' + e.message);
        } finally {
            setPushing(false);
        }
    };

    // Explicit Save-button click — saves the content and, for a document
    // that originated in Doc Prep (Auto Fill or Draft with OpenProcure),
    // this is also the ONLY moment it becomes visible in My Documents: the
    // content is rendered to PDF and uploaded into the workspace's document
    // store (same as Doc Prep's own "Push to My Docs" button), and the
    // annexure gets marked "Completed" back on its Doc Prep row.
    // Title-blur/chat-edit auto-saves persist content but never do this push.
    const handleSaveButtonClick = async () => {
        const html = editorRef.current?.getHtml() || content;
        handleSave(html);

        // Re-read from localStorage instead of trusting the `pushedToMyDocs`
        // state var — that was only set once at mount, so if this doc was
        // deleted from My Docs (and its flag reset there) in another tab/
        // navigation while this editor stayed open, the stale in-memory
        // state would otherwise still say "already pushed" and silently
        // skip re-rendering/re-uploading here.
        let currentlyPushed = pushedToMyDocs;
        try {
            const raw = localStorage.getItem(STORAGE_KEY + idRef.current);
            if (raw) currentlyPushed = !!JSON.parse(raw).pushedToMyDocs;
        } catch { /* ignore */ }
        if (currentlyPushed !== pushedToMyDocs) setPushedToMyDocs(currentlyPushed);

        if (docSourceRef.current === 'doc_prep_annexure' && !currentlyPushed) {
            await pushToMyDocs(html);
        }

        setShowSavedModal(true);
    };

    const handleExportPdf = async (html, plainExport = false) => {
        setExporting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/doc-prep/export-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title, html_content: html || content, bidNo: bidNoRef.current, plainExport }),
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

    // Download/Share formats for the top toolbar — same PDF+Word pair used in
    // Doc Prep and My Docs, pulled live from the editor's current content.
    // Stamp Paper documents pass plainExport so PDF/Word both come out with
    // no letterhead and no auto-signature (printable on physical stamp paper).
    const buildEditorFormats = (plainExport = false) => {
        const token = localStorage.getItem('token');
        const authHeader = { Authorization: `Bearer ${token}` };
        const getHtml = () => editorRef.current?.getHtml() || content;

        const downloadAs = async (endpoint, ext) => {
            const html = getHtml();
            const res = await fetch(`${API_BASE_URL}/doc-prep/${endpoint}`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, html_content: html, bidNo: bidNoRef.current, plainExport }),
            });
            if (!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `${(title || 'Document').replace(/[^a-zA-Z0-9 _-]/g, '_')}.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
        };
        const shareAs = async (format, email) => {
            const html = getHtml();
            const res = await fetch(`${API_BASE_URL}/doc-prep/export-share`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, html_content: html, bidNo: bidNoRef.current, plainExport, format, email }),
            });
            return res.json();
        };

        return [
            { key: 'pdf', label: 'PDF', description: 'Formatted PDF document', icon: FileDown, iconColor: '#dc2626',
                onDownload: () => downloadAs('export-pdf', 'pdf'), onShare: (email) => shareAs('pdf', email) },
            { key: 'word', label: 'Word', description: 'Editable .docx document', icon: FileType, iconColor: '#2563eb',
                onDownload: () => downloadAs('export-docx', 'docx'), onShare: (email) => shareAs('docx', email) },
        ];
    };

    // ── Attachments ────────────────────────────────────────────────────────────
    const ACCEPTED_ATTACHMENT_TYPES = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.xlsx,.xls,.csv,.txt';
    const handlePickAttachment = () => fileInputRef.current?.click();
    const handleAttachmentSelected = (e) => {
        const file = e.target.files?.[0];
        if (file) setAttachedFile(file);
        e.target.value = ''; // allow re-selecting the same file later
    };
    const handleRemoveAttachment = () => setAttachedFile(null);

    // ── Chat send ──────────────────────────────────────────────────────────────
    const handleChatSend = async () => {
        const msg = chatInput.trim();
        if ((!msg && !attachedFile) || isChatting) return;

        // Get latest HTML from Univer (falls back to content state)
        const currentHtml = editorRef.current?.getHtml() || content;

        // Add user message to UI
        const userMsg = { role: 'user', content: msg || `Attached: ${attachedFile.name}`, attachmentName: attachedFile?.name };
        setMessages(prev => [...prev, userMsg]);
        const fileToSend = attachedFile;
        setChatInput('');
        setAttachedFile(null);
        setIsChatting(true);

        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            let body;
            if (fileToSend) {
                const fd = new FormData();
                fd.append('html_content', currentHtml);
                fd.append('message', msg || `Use the attached file "${fileToSend.name}" to help draft/update this document.`);
                fd.append('history', JSON.stringify(historyRef.current));
                fd.append('file', fileToSend);
                body = fd;
                // Do NOT set Content-Type — the browser sets the multipart boundary itself.
            } else {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify({
                    html_content: currentHtml,
                    message:      msg,
                    history:      historyRef.current,
                });
            }
            const res = await fetch(`${API_BASE_URL}/doc-prep/chat-edit`, { method: 'POST', headers, body });
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
                <button style={s.backBtn} onClick={() => {
                    // A caller can ask to be returned to somewhere other than
                    // Doc Prep's annexures listing — e.g. the merged-document
                    // page editor, when this doc was opened to edit one page
                    // of a merged PDF rather than a normal annexure.
                    if (location.state?.backTo) {
                        navigate(location.state.backTo, { state: location.state.backToState || {} });
                    } else if (bidNoRef.current) {
                        // Land back on the annexures listing (where the Edit
                        // button that opened this document lives), not
                        // Doc Prep's default Tender Summary sub-tab.
                        navigate(`/workspace/${bidNoRef.current}`, { state: { tab: 'doc-prep', docPrepPanel: 'annexures' } });
                    } else {
                        navigate(-1);
                    }
                }} title="Back">
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
                <button style={{ ...s.topBtn, background: '#334155' }} onClick={handleSaveDraftClick}>
                    <Save size={15} /> Save Draft
                </button>
                {!requiresStampPaper && !isMergedPageEdit && (
                    <button style={{ ...s.topBtn, background: '#059669', opacity: pushing ? 0.6 : 1 }} onClick={handleSaveButtonClick} disabled={pushing}>
                        <Save size={15} /> {pushing ? 'Pushing to My Docs…' : 'Push to Mydocs'}
                    </button>
                )}
                <DownloadShareButtons
                    formats={buildEditorFormats(requiresStampPaper)}
                    downloadLabel={requiresStampPaper ? 'Download (Stamp Paper)' : 'Download'}
                    downloadButtonStyle={{ ...s.topBtn, background: requiresStampPaper ? '#b45309' : '#7c3aed' }}
                    shareButtonStyle={{ ...s.topBtn, background: '#0369a1' }}
                />
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
                                            {msg.attachmentName && (
                                                <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>📎 {msg.attachmentName}</div>
                                            )}
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

                        {/* Attached file preview */}
                        {attachedFile && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 12px 6px', padding: '6px 10px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, fontSize: 12, color: '#3730a3' }}>
                                {attachedFile.type.startsWith('image/') ? <ImageIcon size={13} /> : <Paperclip size={13} />}
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</span>
                                <button onClick={handleRemoveAttachment} title="Remove attachment" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3730a3', display: 'flex' }}>
                                    <X size={13} />
                                </button>
                            </div>
                        )}

                        {/* Input area */}
                        <div style={s.inputArea}>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={ACCEPTED_ATTACHMENT_TYPES}
                                onChange={handleAttachmentSelected}
                                style={{ display: 'none' }}
                            />
                            <button
                                onClick={handlePickAttachment}
                                disabled={isChatting}
                                title="Attach a photo, PDF, Word, Excel or CSV file"
                                style={{ ...s.sendBtn, background: '#f1f5f9', color: '#475569', flexShrink: 0 }}
                            >
                                <Paperclip size={16} />
                            </button>
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
                                disabled={isChatting || (!chatInput.trim() && !attachedFile)}
                                style={{ ...s.sendBtn, opacity: (isChatting || (!chatInput.trim() && !attachedFile)) ? 0.5 : 1 }}
                            >
                                {isChatting ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={16} />}
                            </button>
                        </div>

                        <div style={{ padding: '6px 12px 8px', fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
                            Shift+Enter for new line · Enter to send · 📎 to attach a photo/PDF/Word/Excel/CSV
                        </div>
                    </div>
                )}
            </div>

            {/* Saved confirmation popup */}
            {showSavedModal && (
                <div
                    onClick={() => setShowSavedModal(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
                >
                    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', width: 380, maxWidth: '90vw', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>✓ Document saved</h3>
                        {docSourceRef.current === 'doc_prep_annexure' ? (
                            pushedToMyDocs ? (
                                <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: '#166534' }}>
                                    Added to My Documents and marked Completed in Doc Prep.
                                </p>
                            ) : (
                                <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: '#6b7280' }}>
                                    Your changes have been saved, but this hasn't been pushed to My Documents.
                                </p>
                            )
                        ) : (
                            <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: '#6b7280' }}>
                                Your changes have been saved.
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowSavedModal(false)}
                                style={{ background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                            >
                                Close
                            </button>
                            {docSourceRef.current === 'doc_prep_annexure' && (
                                <button
                                    onClick={() => pushToMyDocs(editorRef.current?.getHtml() || content)}
                                    disabled={pushing}
                                    title={pushedToMyDocs ? "Re-uploads even though this doc's flag already says it's pushed — use this if it deleted from My Docs but won't push again" : undefined}
                                    style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: pushing ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: pushing ? 0.6 : 1 }}
                                >
                                    {pushing ? 'Pushing…' : pushedToMyDocs ? 'Push anyway' : 'Push to My Docs'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}


            {/* Top-right toast — confirms an explicit Save Draft click */}
            {toast && (
                <div
                    onClick={() => setToast(null)}
                    style={{
                        position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 100000,
                        display: 'flex', alignItems: 'center', gap: '0.625rem',
                        background: '#166534', color: '#fff', borderRadius: 8,
                        padding: '0.75rem 1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                        maxWidth: 380, cursor: 'pointer', animation: 'toastIn 0.25s ease-out',
                    }}
                >
                    <Save size={18} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.4 }}>{toast.message}</span>
                </div>
            )}

            <style>{`
                @keyframes spin  { to { transform: rotate(360deg); } }
                @keyframes blink { 0%,100%{opacity:0.2} 50%{opacity:1} }
                @keyframes toastIn { 0%{opacity:0; transform:translateY(-8px)} 100%{opacity:1; transform:translateY(0)} }
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

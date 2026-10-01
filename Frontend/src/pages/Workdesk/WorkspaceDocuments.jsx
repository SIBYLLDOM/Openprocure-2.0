import React, { useState, useEffect } from 'react';
import { FileText, Download, Eye, Upload, X } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Links our own backend serves (the /tenders/download proxy) need a Bearer
// token — a plain <a href> navigation can't attach one, so those are fetched
// with auth and opened/saved as a blob. External gem.gov.in-style URLs don't
// need our token and don't allow cross-origin fetch() from the browser, so
// those stay as plain link navigation.
const isOwnBackendUrl = (uri) => uri.startsWith(API_BASE_URL) || uri.includes('/api/tenders/download');

const WorkspaceDocuments = ({ links = [], tenderId }) => {
    const cleanBid = (tenderId || '').replace(/_/g, '/');
    const encodedBid = encodeURIComponent(cleanBid);
    const token = localStorage.getItem('token');
    const authHeader = { Authorization: `Bearer ${token}` };

    // Local copy so a fresh upload appears immediately without needing the
    // parent workspace to re-fetch the whole tender record.
    const [allLinks, setAllLinks] = useState(links);
    useEffect(() => { setAllLinks(links); }, [links]);

    const uniqueLinks = [
        ...new Map((allLinks || []).filter(l => l.uri).map(l => [l.uri, l])).values()
    ];

    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadName, setUploadName] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const handlePickFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadFile(file);
        const dot = file.name.lastIndexOf('.');
        setUploadName(dot > 0 ? file.name.slice(0, dot) : file.name);
    };

    const handleUpload = async () => {
        if (!uploadFile) { alert('Please choose a file to upload.'); return; }
        setIsUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', uploadFile);
            fd.append('name', uploadName.trim() || uploadFile.name);
            const res = await fetch(`${API_BASE_URL}/tenders/${encodedBid}/documents/upload`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
            });
            const json = await res.json();
            if (json.success) {
                setAllLinks(prev => [...prev, json.link]);
                setShowUploadModal(false);
                setUploadFile(null);
                setUploadName('');
            } else {
                alert(json.message || 'Upload failed');
            }
        } catch (e) {
            alert('Upload failed: ' + e.message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{
                        fontSize: '1.5rem', fontWeight: '700', color: '#1f2937',
                        marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                    }}>
                        <FileText size={24} style={{ color: '#2563eb' }} />
                        Tender Documents
                    </h2>
                    <p style={{ color: '#6b7280', fontSize: '0.95rem', margin: 0 }}>
                        Official documents fetched automatically for this tender, plus any you've added.
                    </p>
                </div>
                <button
                    onClick={() => setShowUploadModal(true)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 1.1rem', background: '#166534', color: '#fff',
                        border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                    }}
                >
                    <Upload size={16} /> Add Document
                </button>
            </div>

            {uniqueLinks.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                    <FileText size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>No documents found for this tender yet.</p>
                </div>
            ) : (
                <div style={{
                    background: 'white', borderRadius: '12px', padding: '1.5rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb',
                }}>
                    {uniqueLinks.map((link, i) => (
                        <DocumentRow key={i} link={link} />
                    ))}
                </div>
            )}

            {showUploadModal && (
                <div
                    onClick={() => !isUploading && setShowUploadModal(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                >
                    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '420px', maxWidth: '90vw', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>Add Tender Document</h3>
                            <button onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: '#6b7280' }}>
                            This is saved permanently with the tender — it'll show up here and on the Tender Details page for everyone.
                        </p>

                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem' }}>File</label>
                        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '1rem', cursor: 'pointer', marginBottom: '1rem' }}>
                            <input type="file" style={{ display: 'none' }} onChange={handlePickFile} />
                            <Upload size={22} color="#94a3b8" />
                            <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: '#374151', wordBreak: 'break-all', textAlign: 'center' }}>
                                {uploadFile ? uploadFile.name : 'Click to choose a file'}
                            </p>
                        </label>

                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem' }}>Name</label>
                        <input
                            value={uploadName}
                            onChange={e => setUploadName(e.target.value)}
                            placeholder="Document name"
                            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box', marginBottom: '1.25rem' }}
                        />

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowUploadModal(false)} disabled={isUploading} style={{ background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Cancel</button>
                            <button
                                onClick={handleUpload}
                                disabled={isUploading || !uploadFile}
                                style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: (isUploading || !uploadFile) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem', opacity: (isUploading || !uploadFile) ? 0.6 : 1 }}
                            >
                                {isUploading ? 'Uploading…' : 'Upload'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const actionBtnStyle = (bg, color) => ({
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.5rem 0.85rem', background: bg, color,
    border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
});

const DocumentRow = ({ link }) => {
    const getLabel = (uri) => {
        if (uri.includes("/BoqDocument/") || uri.includes("/BoqLineItemsDocument/") || uri.includes("/BOQDocument/")) return "BOQ Document";
        if (uri.includes("/downloadOmppdfile/")) return "OMPPD";
        if (uri.includes("ATC") || uri.includes("atc")) return "ATC";
        if (uri.includes("fulfilment.gem.gov.in/contract/")) return "ATC";
        if (uri.includes("shared_doc/gtc")) return "Gem Contract";
        if (uri.includes("/catalog_data/") && uri.toLowerCase().endsWith('.pdf')) return "Technical Catalog";
        return "Tender Resource";
    };

    const label = link.text || getLabel(link.uri);
    const isOwn = isOwnBackendUrl(link.uri);

    // Our own backend's /download route accepts ?token=... as a fallback to
    // the Authorization header specifically so a plain new-tab navigation
    // (which can't attach a header) can still authenticate.
    const token = localStorage.getItem('token');
    const withToken = (uri, extra = '') => {
        const sep = uri.includes('?') ? '&' : '?';
        return `${uri}${sep}token=${encodeURIComponent(token)}${extra}`;
    };
    const viewUrl = isOwn ? withToken(link.uri, '&inline=1') : link.uri;
    const downloadUrl = isOwn ? withToken(link.uri) : link.uri;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1rem', marginBottom: '0.75rem', background: '#f8fafc',
            borderRadius: '8px', border: '1px solid #e2e8f0',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                <div style={{ padding: '0.75rem', background: '#dbeafe', borderRadius: '8px', color: '#1e40af', flexShrink: 0 }}>
                    <FileText size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1f2937', margin: 0 }}>{label}</h3>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <a href={viewUrl} target="_blank" rel="noopener noreferrer" style={{ ...actionBtnStyle('#f8fafc', '#374151'), border: '1px solid #e2e8f0', textDecoration: 'none' }}>
                    <Eye size={15} /> View
                </a>
                <a href={downloadUrl} target="_blank" rel="noopener noreferrer" style={{ ...actionBtnStyle('#2563eb', '#fff'), textDecoration: 'none' }}>
                    <Download size={15} /> Download
                </a>
            </div>
        </div>
    );
};

export default WorkspaceDocuments;

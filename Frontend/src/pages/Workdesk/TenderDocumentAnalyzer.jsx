import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import '../../assets/css/TenderDocumentAnalyzer.css';

const TYPE_CLASS = {
    certificate: 'tda-type-certificate',
    declaration: 'tda-type-declaration',
    technical:   'tda-type-technical',
    financial:   'tda-type-financial',
    format:      'tda-type-format',
};

export default function TenderDocumentAnalyzer() {
    const { tenderId } = useParams();
    const navigate = useNavigate();
    const fileInputRef = useRef();

    const [files, setFiles] = useState([]);
    const [dragOver, setDragOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [filling, setFilling] = useState(null); // template index being filled
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('docs');
    const [result, setResult] = useState(null); // { required_documents, templates, filled_templates }

    /* Load saved analysis on mount */
    useEffect(() => {
        const token = localStorage.getItem('token');
        axios.get(`${API_BASE_URL}/tender-doc-analysis/${tenderId}`, {
            headers: { Authorization: `Bearer ${token}` }
        }).then(res => {
            if (res.data.success) setResult(res.data.data);
        }).catch(() => { /* no saved data yet */ });
    }, [tenderId]);

    /* ── File handling ─────────────────────────────────── */
    const addFiles = (incoming) => {
        const arr = Array.from(incoming);
        setFiles(prev => {
            const existing = new Set(prev.map(f => f.name + f.size));
            return [...prev, ...arr.filter(f => !existing.has(f.name + f.size))];
        });
    };

    const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

    const onDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        addFiles(e.dataTransfer.files);
    };

    /* ── Upload & Analyze ──────────────────────────────── */
    const handleAnalyze = async () => {
        if (files.length === 0) {
            setError('Please select at least one file.');
            return;
        }
        setError('');
        setLoading(true);
        const token = localStorage.getItem('token');
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        try {
            const res = await axios.post(
                `${API_BASE_URL}/tender-doc-analysis/${tenderId}/upload`,
                formData,
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
            );
            if (res.data.success) {
                setResult({
                    required_documents: res.data.required_documents || [],
                    templates: res.data.templates || [],
                    filled_templates: []
                });
                setFiles([]);
                setActiveTab('docs');
            } else {
                setError(res.data.message || 'Analysis failed.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Upload failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    /* ── Fill template ─────────────────────────────────── */
    const handleFillAndEdit = async (template, idx) => {
        setFilling(idx);
        const token = localStorage.getItem('token');
        try {
            const res = await axios.post(
                `${API_BASE_URL}/tender-doc-analysis/${tenderId}/fill-template`,
                { template_index: idx, verbatim_content: template.verbatim_content },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data.success) {
                navigate(`/workspace/${encodeURIComponent(tenderId)}/doc-analyzer/edit/${idx}`, {
                    state: {
                        filledContent: res.data.filled_content,
                        templateName: template.name,
                        templateDescription: template.description,
                        tenderId,
                        savedTemplates: result?.filled_templates || []
                    }
                });
            } else {
                setError(res.data.message || 'Failed to fill template.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fill template. Please try again.');
        } finally {
            setFilling(null);
        }
    };

    /* ── Save checklist ────────────────────────────────── */
    const handleSave = async () => {
        if (!result) return;
        const token = localStorage.getItem('token');
        try {
            await axios.post(
                `${API_BASE_URL}/tender-doc-analysis/${tenderId}/save`,
                {
                    required_documents: result.required_documents,
                    templates: result.templates,
                    filled_templates: result.filled_templates
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch {
            setError('Failed to save. Please try again.');
        }
    };

    const reqDocs = result?.required_documents || [];
    const templates = result?.templates || [];

    return (
        <div className="tda-page">
            {/* Header */}
            <div className="tda-header">
                <button className="tda-back-btn" onClick={() => navigate(-1)}>
                    ← Back
                </button>
                <div>
                    <h1 className="tda-title">Tender Document Analyzer</h1>
                    <p className="tda-subtitle">
                        {tenderId} &nbsp;·&nbsp; Upload tender documents to extract required submissions and fill format templates
                    </p>
                </div>
            </div>

            {/* Upload card */}
            <div className="tda-upload-card">
                <h3>Upload Tender Documents</h3>

                <div
                    className={`tda-drop-zone${dragOver ? ' drag-over' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".zip,.pdf,.docx,.xls,.xlsx,.txt"
                        onChange={e => addFiles(e.target.files)}
                        style={{ display: 'none' }}
                    />
                    <div className="tda-drop-icon">📁</div>
                    <p className="tda-drop-text">Drag & drop files here, or click to browse</p>
                    <p className="tda-drop-hint">Supports: ZIP, PDF, DOCX, XLS, XLSX, TXT &nbsp;·&nbsp; Max 100 MB per file</p>
                </div>

                {files.length > 0 && (
                    <div className="tda-file-list">
                        {files.map((f, i) => (
                            <div key={i} className="tda-file-chip">
                                <span title={f.name}>{f.name}</span>
                                <button className="tda-chip-remove" onClick={e => { e.stopPropagation(); removeFile(i); }}>×</button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="tda-actions">
                    <button
                        className="tda-btn-primary"
                        onClick={handleAnalyze}
                        disabled={loading || files.length === 0}
                    >
                        {loading ? (
                            <>
                                <span className="tda-spinner" />
                                AI is reading documents…
                            </>
                        ) : (
                            <>🔍 Analyze Documents</>
                        )}
                    </button>

                    {result && (
                        <button className="tda-btn-secondary" onClick={handleSave}>
                            💾 Save Checklist
                        </button>
                    )}
                </div>

                {error && <div className="tda-error">{error}</div>}
            </div>

            {/* Results */}
            {result && (
                <div className="tda-results">
                    <div className="tda-results-header">
                        <h3>Analysis Results</h3>
                    </div>

                    <div className="tda-tabs">
                        <div
                            className={`tda-tab${activeTab === 'docs' ? ' active' : ''}`}
                            onClick={() => setActiveTab('docs')}
                        >
                            Required Documents
                            <span className="tda-tab-badge">{reqDocs.length}</span>
                        </div>
                        <div
                            className={`tda-tab${activeTab === 'templates' ? ' active' : ''}`}
                            onClick={() => setActiveTab('templates')}
                        >
                            Templates &amp; Formats
                            <span className="tda-tab-badge">{templates.length}</span>
                        </div>
                    </div>

                    <div className="tda-tab-content">
                        {/* Required Documents tab */}
                        {activeTab === 'docs' && (
                            reqDocs.length === 0 ? (
                                <div className="tda-empty">
                                    <div className="tda-empty-icon">📋</div>
                                    <p>No required documents found.</p>
                                </div>
                            ) : (
                                <table className="tda-doc-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Document Name</th>
                                            <th>Type</th>
                                            <th>Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reqDocs.map((doc, i) => (
                                            <tr key={i}>
                                                <td style={{ color: '#99aabb', width: 36 }}>{i + 1}</td>
                                                <td>
                                                    <strong>{doc.name}</strong>
                                                    {doc.is_template && (
                                                        <span className="tda-template-badge">FORMAT</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`tda-type-badge ${TYPE_CLASS[doc.type] || ''}`}>
                                                        {doc.type}
                                                    </span>
                                                </td>
                                                <td>{doc.description}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )
                        )}

                        {/* Templates tab */}
                        {activeTab === 'templates' && (
                            templates.length === 0 ? (
                                <div className="tda-empty">
                                    <div className="tda-empty-icon">📄</div>
                                    <p>No fillable templates found in the documents.</p>
                                </div>
                            ) : (
                                <div className="tda-template-grid">
                                    {templates.map((tpl, i) => (
                                        <div key={i} className="tda-template-card">
                                            <div className="tda-template-card-name">{tpl.name}</div>
                                            <div className="tda-template-card-desc">{tpl.description}</div>
                                            {tpl.verbatim_content && (
                                                <div className="tda-template-card-preview">
                                                    {tpl.verbatim_content.slice(0, 300)}
                                                </div>
                                            )}
                                            <button
                                                className="tda-fill-btn"
                                                disabled={filling === i}
                                                onClick={() => handleFillAndEdit(tpl, i)}
                                            >
                                                {filling === i ? (
                                                    <><span className="tda-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Filling…</>
                                                ) : (
                                                    <>✏️ Fill &amp; Edit</>
                                                )}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

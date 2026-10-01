import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Printer, FileDown, Loader2 } from 'lucide-react';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import merilLogo from '../../assets/img/logo.png';
import UniverDocumentEditor from '../../components/common/UniverDocumentEditor';

const styles = {
  page:      { minHeight: '100vh', background: '#eef2f7', display: 'flex', flexDirection: 'column' },
  toolbar:   { position: 'sticky', top: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  iconBtn:   { background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4a5a78', fontWeight: 500 },
  saveBtn:   { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600 },
  docWrap:   { flex: 1, padding: '32px 16px', display: 'flex', justifyContent: 'center' },
  paper:     { background: '#fff', width: 850, maxWidth: '100%', padding: '32px 48px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', borderRadius: 4 },
  letterhead:{ borderBottom: '2px solid #003087', paddingBottom: 14, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  toast:     { position: 'fixed', bottom: 24, right: 24, background: '#065f46', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', zIndex: 9999 },
};

export default function TenderDocumentEditor() {
  const { tenderId, templateIndex } = useParams();
  const navigate  = useNavigate();
  const location  = useLocation();

  const state         = location.state || {};
  const templateName  = state.templateName  || 'Template Document';
  const templateDesc  = state.templateDescription || '';
  const initialContent = state.filledContent || '';

  const [editorContent, setEditorContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleSave = async (htmlFromEditor) => {
    const currentHtml = htmlFromEditor || editorContent;
    const token = localStorage.getItem('token');
    setSaving(true);
    try {
      const getRes  = await axios.get(`${API_BASE_URL}/tender-doc-analysis/${tenderId}`, { headers: { Authorization: `Bearer ${token}` } });
      const existing = getRes.data.success ? (getRes.data.data.filled_templates || []) : [];
      const idx     = parseInt(templateIndex, 10);
      const updated = [...existing];
      updated[idx]  = { name: templateName, html_content: currentHtml, saved_at: new Date().toISOString() };
      await axios.post(`${API_BASE_URL}/tender-doc-analysis/${tenderId}/save`, { filled_templates: updated }, { headers: { Authorization: `Bearer ${token}` } });
      showToast('✓ Draft saved');
    } catch {
      showToast('✗ Save failed — please retry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <button style={styles.iconBtn} onClick={() => navigate(-1)}><ArrowLeft size={16} /> Back</button>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#1a2340', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{templateName}</span>
        {templateDesc && <span style={{ fontSize: 12, color: '#7a8ba0', fontStyle: 'italic', flexShrink: 0 }}>{templateDesc}</span>}
        <button style={styles.iconBtn} onClick={() => window.print()}><Printer size={15} /> Print / PDF</button>
        <button style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} onClick={() => handleSave(editorContent)} disabled={saving}>
          {saving ? <Loader2 size={15} /> : <Save size={15} />} {saving ? 'Saving…' : 'Save Draft'}
        </button>
      </div>

      {/* Document area */}
      <div style={styles.docWrap}>
        <div style={{ width: 850, maxWidth: '100%' }}>
          {/* Static letterhead */}
          <div style={styles.paper}>
            <div style={styles.letterhead}>
              <img src={merilLogo} alt="Meril" style={{ height: 48, objectFit: 'contain' }} />
              <div style={{ textAlign: 'right', fontSize: '10pt', color: '#333', lineHeight: 1.5 }}>
                <strong>Meril Life Sciences Pvt. Ltd.</strong><br />
                Survey No. 135/2, Muktanand Marg, Chala,<br />
                Vapi, Gujarat – 396191, India
              </div>
            </div>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13pt', textDecoration: 'underline', margin: '12px 0 16px' }}>{templateName}</div>
            <div style={{ fontSize: '10pt', color: '#555', marginBottom: 4 }}>Ref: <strong>{tenderId}</strong></div>
          </div>

          {/* Univer editor */}
          <div style={{ marginTop: 4 }}>
            <UniverDocumentEditor
              content={editorContent}
              onChange={setEditorContent}
              onSaveDraft={() => handleSave(editorContent)}
              onExportPdf={() => window.print()}
              isSaving={saving}
            />
          </div>
        </div>
      </div>

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

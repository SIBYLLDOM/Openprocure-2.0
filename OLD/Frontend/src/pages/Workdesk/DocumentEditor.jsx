import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Wand2, Loader2 } from 'lucide-react';
import UniverDocumentEditor from '../../components/common/UniverDocumentEditor';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const DocumentEditor = () => {
  const { tenderId, taskId } = useParams();
  const navigate = useNavigate();

  const [isLoading, setIsLoading]         = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [tenderData, setTenderData]       = useState(null);
  const [products, setProducts]           = useState([]);
  const [apiKey]                          = useState(import.meta.env.VITE_OPENAI_API_KEY || '');

  useEffect(() => { fetchTenderDetails(); }, [tenderId]);

  const fetchTenderDetails = async () => {
    const cleanId = tenderId.replace(/_/g, '/');
    try {
      const prodRes  = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanId)}/suggestions`);
      const prodData = await prodRes.json();
      if (prodData.success) setProducts(prodData.data);
      setTenderData({
        tenderId:    cleanId,
        ministry:    'Ministry of Home Affairs',
        bidEndDate:  '08-12-2025 16:00:00',
        quantity:    '132',
        itemCategory:'Clinical Chemistry Reagents compatible with Mindray BS-240 Pro',
      });
    } catch (err) {
      console.error('Tender load failed', err);
    }
  };

  const generateAIContent = async () => {
    if (!apiKey) return alert('OpenAI key missing');
    setIsLoading(true);

    const productHTML = products.map(p => `<li>${p.title}</li>`).join('');
    const prompt = `
Draft a GOVERNMENT TENDER EXPERIENCE CRITERIA LETTER.
Company: Meril Life Sciences Private Limited
FORMAT: HTML only (no markdown). Use <h2> for headings, <p> for paragraphs, <ul><li> for lists.
TENDER DETAILS: ID: ${tenderData?.tenderId}, Ministry: ${tenderData?.ministry}, Quantity: ${tenderData?.quantity}, Item: ${tenderData?.itemCategory}
PRODUCTS: <ul>${productHTML}</ul>
Return ONLY clean HTML. Start with <h2> or <p>.`;

    try {
      const res  = await fetch('/openai-proxy/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body:    JSON.stringify({
          model:       'gpt-4o-mini',
          messages:    [{ role: 'user', content: prompt }],
          temperature: 0.25,
        }),
      });
      const data    = await res.json();
      let   content = data.choices[0].message.content;
      content = content.replace(/```html/g, '').replace(/```/g, '').trim();
      setEditorContent(content);
    } catch (err) {
      console.error('AI generation error:', err);
      alert('AI generation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f7', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', color: '#374151' }}>
          <ArrowLeft size={20} />
        </button>
        <strong style={{ fontSize: 16, color: '#1a1a1a' }}>
          {taskId === 'representation-letter' ? 'Representation Letter' : 'Experience Criteria Document'}
        </strong>
        <button
          onClick={generateAIContent}
          disabled={isLoading}
          style={{ background: '#6d28d9', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: 6, cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, opacity: isLoading ? 0.6 : 1 }}
        >
          {isLoading ? <><Loader2 size={18} /> Generating…</> : <><Wand2 size={18} /> Generate</>}
        </button>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, padding: '2rem', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 900 }}>
          {editorContent ? (
            <UniverDocumentEditor
              content={editorContent}
              onChange={setEditorContent}
              onSaveDraft={() => { alert('Document saved!'); navigate(-1); }}
            />
          ) : (
            <div style={{ background: '#fff', borderRadius: 8, padding: '4rem', textAlign: 'center', color: '#999', fontStyle: 'italic', boxShadow: '0 0 20px rgba(0,0,0,0.07)' }}>
              Click "Generate" to create your document
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentEditor;

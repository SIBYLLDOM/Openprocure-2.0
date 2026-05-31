import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Save, ArrowLeft, Wand2, Loader2
} from 'lucide-react';

import merilLogo from '../../assets/img/logo.png';

const DocumentEditor = () => {
  const { tenderId, taskId } = useParams();
  const navigate = useNavigate();
  const editorRef = useRef(null);

  const [isLoading, setIsLoading] = useState(false);
  const [apiKey] = useState(import.meta.env.VITE_OPENAI_API_KEY || '');

  const [tenderData, setTenderData] = useState(null);
  const [products, setProducts] = useState([]);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

  useEffect(() => {
    fetchTenderDetails();
  }, [tenderId]);

  const fetchTenderDetails = async () => {
    const cleanId = tenderId.replace(/_/g, '/');

    try {
      // 1. Fetch Suggestions (User selected products / AI suggestions)
      const prodRes = await fetch(
        `${API_BASE_URL}/tenders/${encodeURIComponent(cleanId)}/suggestions`
      );
      const prodData = await prodRes.json();
      if (prodData.success) setProducts(prodData.data);

      setTenderData({
        tenderId: cleanId,
        ministry: "Ministry of Home Affairs",
        bidEndDate: "08-12-2025 16:00:00",
        bidOpeningDate: "08-12-2025 16:30:00",
        bidValidity: "30 Days",
        quantity: "132",
        itemCategory: "Clinical Chemistry Reagents compatible with Mindray BS-240 Pro"
      });

    } catch (err) {
      console.error("Tender load failed", err);
    }
  };



  const generateAIContent = async () => {
    if (!apiKey) return alert("OpenAI key missing");
    setIsLoading(true);

    const productHTML = products.map(p => `<li style="margin-bottom: 8px; line-height: 1.6;">${p.title}</li>`).join("");

    let prompt = `
Draft a GOVERNMENT TENDER EXPERIENCE CRITERIA LETTER.

Company: Meril Life Sciences Private Limited

FORMAT RULES:
- Formal corporate tone
- HTML only (no markdown, no backticks)
- Use inline styles for all formatting
- Justified paragraphs with proper spacing
- Professional government letter structure

REQUIRED INLINE STYLES:
- Paragraphs: style="text-align: justify; margin-bottom: 16px; line-height: 1.6;"
- Subject line: style="text-align: center; font-weight: bold; font-size: 12pt; margin: 20px 0; text-decoration: underline;"
- Section headings: style="font-weight: bold; font-size: 11pt; margin-top: 20px; margin-bottom: 10px;"
- Lists: style="margin-left: 24px; margin-bottom: 16px;"
- List items: style="margin-bottom: 8px; line-height: 1.6;"

TENDER DETAILS:
Tender ID: ${tenderData.tenderId}
Ministry: ${tenderData.ministry}
Bid End Date: ${tenderData.bidEndDate}
Bid Opening Date: ${tenderData.bidOpeningDate}
Bid Validity: ${tenderData.bidValidity}
Quantity: ${tenderData.quantity}
Item Category: ${tenderData.itemCategory}

PRODUCTS TO MENTION:
<ul style="margin-left: 24px; margin-bottom: 16px;">${productHTML}</ul>

DOCUMENT STRUCTURE:
1. To/Date block (right-aligned)
2. Subject (centered, bold, underlined)
3. Salutation
4. Opening paragraph about company experience
5. Product portfolio section with bullet points
6. Tender-specific alignment paragraph
7. Compliance declaration
8. Closing
9. Signature block (right-aligned)

CRITICAL: Return ONLY the HTML content without any markdown code blocks, backticks, or explanations. Start directly with the HTML tags.
`;

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a professional document formatter. Return only clean HTML with inline styles. No markdown, no code blocks, no backticks. Start directly with HTML tags."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.25
        })
      });

      const data = await res.json();
      let content = data.choices[0].message.content;

      // Clean any markdown artifacts
      content = content.replace(/```html/g, '').replace(/```/g, '').trim();

      editorRef.current.innerHTML = `
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
          <img src="${merilLogo}" alt="Meril Logo" style="height: 55px; object-fit: contain;" />
          <div>
            <div style="font-size: 14pt; font-weight: bold; color: #1a1a1a; line-height: 1.3;">
              MERIL LIFE SCIENCES PRIVATE LIMITED
            </div>
            <div style="font-size: 9.5pt; color: #444; line-height: 1.3; margin-top: 4px;">
              In-vitro Diagnostic & Medical Devices Manufacturer
            </div>
          </div>
        </div>
        <hr style="border: none; border-top: 2px solid #000; margin-bottom: 24px;" />
        ${content}
      `;

      // Apply default formatting to any unformatted elements
      applyDefaultFormatting();
    } catch (err) {
      console.error("AI generation error:", err);
      alert("AI generation failed. Please check console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const applyDefaultFormatting = () => {
    if (!editorRef.current) return;

    // Auto-format paragraphs without styles
    const paragraphs = editorRef.current.querySelectorAll('p');
    paragraphs.forEach(p => {
      if (!p.style.textAlign) {
        p.style.textAlign = 'justify';
        p.style.marginBottom = '16px';
        p.style.lineHeight = '1.6';
      }
    });

    // Auto-format headings
    const headings = editorRef.current.querySelectorAll('h3, h4, strong');
    headings.forEach(h => {
      if (h.tagName === 'STRONG' && !h.style.fontWeight) {
        h.style.fontWeight = 'bold';
      }
    });

    // Auto-format lists
    const lists = editorRef.current.querySelectorAll('ul, ol');
    lists.forEach(list => {
      if (!list.style.marginLeft) {
        list.style.marginLeft = '24px';
        list.style.marginBottom = '16px';
      }
    });

    const listItems = editorRef.current.querySelectorAll('li');
    listItems.forEach(li => {
      if (!li.style.marginBottom) {
        li.style.marginBottom = '8px';
        li.style.lineHeight = '1.6';
      }
    });
  };

  const handleSave = () => {
    const content = editorRef.current.innerHTML;
    console.log("Saved content:", content);

    // You can add actual save logic here (API call, localStorage, etc.)
    alert("Document saved successfully!");
    navigate(-1);
  };

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.header}>
        <button
          onClick={() => navigate(-1)}
          style={styles.iconBtn}
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>

        <strong style={{ fontSize: '16px', color: '#1a1a1a' }}>
          {taskId === 'representation-letter' ? 'Representation Letter' : 'Experience Criteria Document'}
        </strong>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={generateAIContent}
            disabled={isLoading}
            style={{
              ...styles.aiBtn,
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Wand2 size={18} /> Generate
              </>
            )}
          </button>

          <button onClick={handleSave} style={styles.saveBtn}>
            <Save size={18} /> Save
          </button>
        </div>
      </div>

      {/* EDITOR */}
      <div style={styles.pageWrap}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          style={styles.editor}
          spellCheck="true"
        >
          {/* Initial placeholder content */}
          <div style={{ color: '#999', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
            Click "Generate" to create your {taskId === 'representation-letter' ? 'representation letter' : 'experience criteria letter'}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: "100vh",
    background: "#eef2f7"
  },
  header: {
    background: "#fff",
    padding: "1rem 2rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #ddd",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
  },
  pageWrap: {
    display: "flex",
    justifyContent: "center",
    padding: "2rem",
    minHeight: "calc(100vh - 73px)"
  },
  editor: {
    width: "850px",
    minHeight: "1100px",
    background: "#fff",
    padding: "3rem",
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: "11pt",
    lineHeight: "1.6",
    textAlign: "justify",
    boxShadow: "0 0 20px rgba(0,0,0,0.1)",
    borderRadius: "4px",
    outline: "none",
    color: "#1a1a1a"
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "6px",
    transition: "background 0.2s",
    color: "#374151"
  },
  aiBtn: {
    background: "#6d28d9",
    color: "#fff",
    border: "none",
    padding: "0.5rem 1rem",
    borderRadius: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background 0.2s",
    boxShadow: "0 2px 4px rgba(109, 40, 217, 0.2)"
  },
  saveBtn: {
    background: "#059669",
    color: "#fff",
    border: "none",
    padding: "0.5rem 1rem",
    borderRadius: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background 0.2s",
    boxShadow: "0 2px 4px rgba(5, 150, 105, 0.2)"
  }
};

// Add hover effects via inline style object
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    button:hover:not(:disabled) {
      opacity: 0.9;
    }
    
    [contenteditable="true"]:focus {
      outline: 2px solid #6d28d9;
      outline-offset: -2px;
    }
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    .animate-spin {
      animation: spin 1s linear infinite;
    }
  `;
  document.head.appendChild(styleSheet);
}

export default DocumentEditor;


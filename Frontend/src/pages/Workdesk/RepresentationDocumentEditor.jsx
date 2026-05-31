import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Save, ArrowLeft, Wand2, Loader2
} from 'lucide-react';

import merilLogo from '../../assets/img/logo.png';

const RepresentationDocumentEditor = () => {
    const { tenderId } = useParams();
    const navigate = useNavigate();
    const editorRef = useRef(null);

    const [isLoading, setIsLoading] = useState(false);
    const [apiKey] = useState(import.meta.env.VITE_OPENAI_API_KEY || '');

    const [tenderData, setTenderData] = useState(null);
    const [products, setProducts] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [techSpecs, setTechSpecs] = useState([]);
    const [fetchingSpecs, setFetchingSpecs] = useState(false);

    const JSON_SERVER_URL = import.meta.env.VITE_JSON_SERVER_URL || 'http://192.168.1.3:5006';
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    useEffect(() => {
        fetchTenderDetails();
    }, [tenderId]);

    const fetchTenderDetails = async () => {
        const cleanId = tenderId.replace(/_/g, '/');

        try {
            // 1. Fetch Suggestions (User selected products / AI suggestions)
            const token = localStorage.getItem('token');
            const prodRes = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanId)}/suggestions`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            const prodData = await prodRes.json();
            if (prodData.success) {
                setProducts(prodData.data);
                if (prodData.selected_product) {
                    setSelectedProduct(prodData.selected_product);
                }
            }

            setTenderData({
                tenderId: cleanId,
                ministry: "Ministry of Home Affairs", // Fallback, will be updated by JSON fetch
                bidEndDate: "N/A",
                itemCategory: "N/A"
            });

            // 2. Fetch Tender JSON Path & Data for Tech Specs
            fetchTenderJsonAndSpecs(cleanId);

        } catch (err) {
            console.error("Tender load failed", err);
        }
    };

    const fetchTenderJsonAndSpecs = async (cleanId) => {
        try {
            setFetchingSpecs(true);

            // A. Get JSON path
            const token = localStorage.getItem('token');
            const pathRes = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanId)}/documents/path`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const pathData = await pathRes.json();

            if (!pathData.json_path) return;

            let jsonPath = pathData.json_path;
            if (jsonPath.startsWith('"') && jsonPath.endsWith('"')) jsonPath = jsonPath.slice(1, -1);

            // Convert local path to JSON Server URL
            if (/^[a-zA-Z]:/.test(jsonPath) || jsonPath.includes('\\')) {
                const fileName = jsonPath.split(/[/\\]/).pop();
                jsonPath = `${JSON_SERVER_URL}/${fileName}`;
            }

            // B. Fetch JSON content
            const jsonRes = await fetch(jsonPath);
            const json = await jsonRes.json();

            // C. Extract Catalogue Links
            const links = json.links || [];
            const catalogueLinks = links.filter(l => l.uri && l.uri.includes('/showCatalogue/'));

            // D. Scrape Tech Specs
            const allSpecs = [];
            for (const link of catalogueLinks) {
                try {
                    const scrapeRes = await fetch(`http://127.0.0.1:8000/scrape/catalogue?url=${encodeURIComponent(link.uri)}`);
                    const scrapeJson = await scrapeRes.json();
                    if (scrapeJson.status === "success") {
                        allSpecs.push({
                            title: scrapeJson.title,
                            data: scrapeJson.data // Array of { category, specification, allowed_values }
                        });
                    }
                } catch (e) {
                    console.error("Failed to scrape catalogue:", link.uri, e);
                }
            }

            setTechSpecs(allSpecs);
            console.log("Fetched Tech Specs:", allSpecs);

        } catch (err) {
            console.error("Error fetching specs:", err);
        } finally {
            setFetchingSpecs(false);
        }
    };

    /* ---------------- HELPER: Calculate rowspan for merged cells ---------------- */
    const calculateRowSpans = (rows) => {
        const rowSpans = [];
        let currentCategory = null;
        let spanCount = 0;
        let startIndex = 0;

        rows.forEach((row, index) => {
            if (row.category !== currentCategory) {
                // Save the previous span
                if (currentCategory !== null) {
                    for (let i = startIndex; i < index; i++) {
                        rowSpans[i] = i === startIndex ? spanCount : 0;
                    }
                }
                // Start new span
                currentCategory = row.category;
                startIndex = index;
                spanCount = 1;
            } else {
                spanCount++;
            }
        });

        // Handle the last group
        for (let i = startIndex; i < rows.length; i++) {
            rowSpans[i] = i === startIndex ? spanCount : 0;
        }

        return rowSpans;
    };

    const generateAIContent = async () => {
        if (!apiKey) return alert("OpenAI key missing");
        setIsLoading(true);

        const specText = techSpecs.map(cat =>
            `CATALOGUE: ${cat.title}\n` +
            cat.data.map(d => `- [${d.category}] ${d.specification}: ${d.allowed_values}`).join('\n')
        ).join('\n\n');

        const productText = products.map(p =>
            `PRODUCT: ${p.title} (Code: ${p.product_code})\n` +
            `Specs: ${p.specification}\n` +
            `Relevancy: ${(p.raw_score * 100).toFixed(1)}%`
        ).join('\n\n');

        const prompt = `
Draft a FORMAL REPRESENTATION LETTER for a Government Tender.

Company: Meril Life Sciences Private Limited

TASK:
Compare the TENDER TECHNICAL SPECIFICATIONS against our PRODUCT SPECIFICATIONS and write a representation letter asking to allow our product values or to amend the specifications to include our technology.

TENDER SPECIFICATIONS (Fetched from GeM):
${specText || "No structured specs found. Refer to general category."}

OUR PRODUCTS:
${productText}

FORMAT RULES:
- Formal business letter format
- HTML only (inline styles)
- Justified alignment
- Section headings bold

REQUIRED INLINE STYLES:
- Paragraphs: style="text-align: justify; margin-bottom: 16px; line-height: 1.6;"
- Subject line: style="text-align: center; font-weight: bold; font-size: 12pt; margin: 20px 0; text-decoration: underline;"
- Lists: style="margin-left: 24px; margin-bottom: 16px;"

TENDER DETAILS:
Tender ID: ${tenderData.tenderId}
Ministry: ${tenderData.ministry}
Item Category: ${tenderData.itemCategory}

CONTENT REQUIREMENTS:
1. To Authority (Use "The Tender Inviting Authority")
2. Subject: Representation regarding specifications/terms for Tender Ref: ${tenderData.tenderId}
3. Introduction: Introduce Meril Life Sciences.
4. Representation Points (CRITICAL - AUTO-GENERATED COMPARISON):
   - Analyze the "Tender Specifications" vs "Our Products".
   - Identify specific parameters where our product differs slightly or offers an equivalent technology.
   - For each point, state: "The tender asks for [Tender Spec Value], whereas our product [Product Name] offers [Product Value]. We request you to amend the specification to [Requested Amendment] or allow [Product Value] as it is clinically equivalent."
   - If products match well, highlight that they meet the "Golden Parameters".
   - Be specific with values from the provided data.
5. Conclusion: Request for favorable consideration.
6. Sign-off.

CRITICAL: Return ONLY HTML.
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
        alert("Representation Letter saved successfully!");
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
                    Representation Letter Editor
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
                    style={{
                        marginRight: '20px', width: '300px',
                        background: 'white', padding: '15px',
                        borderRadius: '8px', border: '1px solid #ddd',
                        height: 'fit-content', maxHeight: '80vh', overflowY: 'auto'
                    }}
                >

                    {selectedProduct && (
                        <div style={{ marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
                            <h4 style={{ marginTop: 0, color: '#1a1a1a', fontWeight: 'bold', marginBottom: '10px' }}>Selected Product</h4>
                            <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                <div style={{ fontWeight: '600', color: '#166534', fontSize: '0.9rem', lineHeight: '1.4' }}>{selectedProduct.title}</div>
                                <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '4px' }}>Code: {selectedProduct.product_code}</div>
                                {selectedProduct.raw_score !== undefined && (
                                    <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '2px' }}>
                                        Match: {(selectedProduct.raw_score * 100).toFixed(1)}%
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <h4 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px', color: '#1a1a1a', fontWeight: 'bold' }}>Technical Specifications</h4>
                    {fetchingSpecs ? <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}><Loader2 className="animate-spin" size={20} style={{ margin: '0 auto 10px' }} /> Loading specs...</div> : (
                        techSpecs.length > 0 ? (
                            techSpecs.map((catalogue, cIdx) => {
                                const rowSpans = calculateRowSpans(catalogue.data);
                                return (
                                    <div key={cIdx} style={{ marginBottom: "20px" }}>
                                        <div style={{
                                            background: '#f1f5f9', padding: '8px 12px',
                                            border: '1px solid #e2e8f0', borderBottom: 'none',
                                            borderRadius: '6px 6px 0 0', fontWeight: '600',
                                            fontSize: '0.85rem', color: '#334155'
                                        }}>
                                            {catalogue.title}
                                        </div>

                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                                <thead style={{ background: '#f8fafc', color: '#475569' }}>
                                                    <tr>
                                                        <th style={tableHeaderStyle}>Category</th>
                                                        <th style={tableHeaderStyle}>Specification</th>
                                                        <th style={tableHeaderStyle}>Values</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {catalogue.data.map((row, rIdx) => {
                                                        const rowSpan = rowSpans[rIdx];
                                                        return (
                                                            <tr key={rIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                {rowSpan > 0 && (
                                                                    <td
                                                                        rowSpan={rowSpan}
                                                                        style={{
                                                                            ...tableCellStyle,
                                                                            background: '#fff',
                                                                            verticalAlign: 'top',
                                                                            borderRight: '1px solid #e2e8f0',
                                                                            fontWeight: '600',
                                                                            color: '#334155'
                                                                        }}
                                                                    >
                                                                        {row.category}
                                                                    </td>
                                                                )}
                                                                <td style={{ ...tableCellStyle, borderRight: '1px solid #e2e8f0' }}>{row.specification}</td>
                                                                <td style={tableCellStyle}>{row.allowed_values}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })
                        ) : <p style={{ color: '#666', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>No specs found.</p>
                    )}
                </div>

                <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    style={styles.editor}
                    spellCheck="true"
                >
                    {/* Initial placeholder content */}
                    <div style={{ color: '#999', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
                        Click "Generate" to create your representation letter based on tech spec comparison.
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

const tableHeaderStyle = {
    padding: '8px',
    textAlign: 'left',
    fontWeight: '600',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '0.75rem',
    color: '#334155'
};

const tableCellStyle = {
    padding: '8px',
    color: '#475569',
    lineHeight: '1.4',
    background: '#fff'
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

export default RepresentationDocumentEditor;

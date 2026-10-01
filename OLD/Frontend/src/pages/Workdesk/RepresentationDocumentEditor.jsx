import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Save, ArrowLeft, Wand2, Loader2
} from 'lucide-react';

import merilLogo from '../../assets/img/logo.png';
import UniverDocumentEditor from '../../components/common/UniverDocumentEditor';

const RepresentationDocumentEditor = () => {
    const { tenderId } = useParams();
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(false);
    const [apiKey] = useState(import.meta.env.VITE_OPENAI_API_KEY || '');

    const [tenderData, setTenderData] = useState(null);
    const [products, setProducts] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [techSpecs, setTechSpecs] = useState([]);
    const [fetchingSpecs, setFetchingSpecs] = useState(false);
    const [editorContent, setEditorContent] = useState('');

    const JSON_SERVER_URL = import.meta.env.VITE_JSON_SERVER_URL || 'http://192.168.1.3:5006';
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    useEffect(() => {
        fetchTenderDetails();
    }, [tenderId]);

    const fetchTenderDetails = async () => {
        const cleanId = tenderId.replace(/_/g, '/');

        try {
            const token = localStorage.getItem('token');
            const prodRes = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanId)}/suggestions`,
                { headers: { 'Authorization': `Bearer ${token}` } }
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
                ministry: "Ministry of Home Affairs",
                bidEndDate: "N/A",
                itemCategory: "N/A"
            });

            fetchTenderJsonAndSpecs(cleanId);
        } catch (err) {
            console.error("Tender load failed", err);
        }
    };

    const fetchTenderJsonAndSpecs = async (cleanId) => {
        try {
            setFetchingSpecs(true);

            const token = localStorage.getItem('token');
            const pathRes = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanId)}/documents/path`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const pathData = await pathRes.json();

            if (!pathData.json_path) return;

            let jsonPath = pathData.json_path;
            if (jsonPath.startsWith('"') && jsonPath.endsWith('"')) jsonPath = jsonPath.slice(1, -1);

            if (/^[a-zA-Z]:/.test(jsonPath) || jsonPath.includes('\\')) {
                const fileName = jsonPath.split(/[/\\]/).pop();
                jsonPath = `${JSON_SERVER_URL}/${fileName}`;
            }

            const jsonRes = await fetch(jsonPath);
            const json = await jsonRes.json();

            const links = json.links || [];
            const catalogueLinks = links.filter(l => l.uri && l.uri.includes('/showCatalogue/'));

            const allSpecs = [];
            for (const link of catalogueLinks) {
                try {
                    const scrapeRes = await fetch(`${import.meta.env.VITE_SCRAPER_API || 'https://scraper.openprocure.ai'}/scrape/catalogue?url=${encodeURIComponent(link.uri)}`);
                    const scrapeJson = await scrapeRes.json();
                    if (scrapeJson.status === "success") {
                        allSpecs.push({
                            title: scrapeJson.title,
                            data: scrapeJson.data
                        });
                    }
                } catch (e) {
                    console.error("Failed to scrape catalogue:", link.uri, e);
                }
            }

            setTechSpecs(allSpecs);
        } catch (err) {
            console.error("Error fetching specs:", err);
        } finally {
            setFetchingSpecs(false);
        }
    };

    const calculateRowSpans = (rows) => {
        const rowSpans = [];
        let currentCategory = null;
        let spanCount = 0;
        let startIndex = 0;

        rows.forEach((row, index) => {
            if (row.category !== currentCategory) {
                if (currentCategory !== null) {
                    for (let i = startIndex; i < index; i++) {
                        rowSpans[i] = i === startIndex ? spanCount : 0;
                    }
                }
                currentCategory = row.category;
                startIndex = index;
                spanCount = 1;
            } else {
                spanCount++;
            }
        });

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
            content = content.replace(/```html/g, '').replace(/```/g, '').trim();

            setEditorContent(content);
        } catch (err) {
            console.error("AI generation error:", err);
            alert("AI generation failed. Please check console for details.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = () => {
        console.log("Saved content:", editorContent);
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
                            <><Loader2 size={18} className="animate-spin" /> Generating...</>
                        ) : (
                            <><Wand2 size={18} /> Generate</>
                        )}
                    </button>

                    <button onClick={handleSave} style={styles.saveBtn}>
                        <Save size={18} /> Save
                    </button>
                </div>
            </div>

            {/* EDITOR AREA */}
            <div style={styles.pageWrap}>
                {/* Sidebar: tech specs */}
                <div style={styles.sidebar}>
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
                    {fetchingSpecs ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                            <Loader2 className="animate-spin" size={20} style={{ margin: '0 auto 10px' }} /> Loading specs...
                        </div>
                    ) : (
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

                {/* Document area */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Static letterhead */}
                    <div style={styles.paper}>
                        <div style={styles.letterhead}>
                            <img src={merilLogo} alt="Meril" style={{ height: 48, objectFit: 'contain' }} />
                            <div style={{ textAlign: 'right', fontSize: '10pt', color: '#333', lineHeight: 1.5 }}>
                                <strong>Meril Life Sciences Pvt. Ltd.</strong><br />
                                In-vitro Diagnostic &amp; Medical Devices Manufacturer
                            </div>
                        </div>
                        <div style={{ fontSize: '10pt', color: '#555' }}>Ref: <strong>{tenderData?.tenderId}</strong></div>
                    </div>

                    {/* Univer editor or placeholder */}
                    {editorContent ? (
                        <UniverDocumentEditor
                            content={editorContent}
                            onChange={setEditorContent}
                            onSaveDraft={handleSave}
                        />
                    ) : (
                        <div style={styles.placeholder}>
                            Click "Generate" to create your representation letter based on tech spec comparison.
                        </div>
                    )}
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
        padding: "2rem",
        gap: "20px",
        minHeight: "calc(100vh - 73px)",
        alignItems: "flex-start"
    },
    sidebar: {
        width: "300px",
        flexShrink: 0,
        background: "white",
        padding: "15px",
        borderRadius: "8px",
        border: "1px solid #ddd",
        maxHeight: "80vh",
        overflowY: "auto"
    },
    paper: {
        background: "#fff",
        padding: "24px 32px 16px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        borderRadius: "4px 4px 0 0"
    },
    letterhead: {
        borderBottom: "2px solid #003087",
        paddingBottom: 14,
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
    },
    placeholder: {
        background: "#fff",
        borderRadius: "0 0 4px 4px",
        padding: "4rem",
        textAlign: "center",
        color: "#999",
        fontStyle: "italic",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        minHeight: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
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

export default RepresentationDocumentEditor;

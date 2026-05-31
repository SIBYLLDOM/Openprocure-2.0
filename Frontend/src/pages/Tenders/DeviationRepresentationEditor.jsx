import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import '../../assets/css/TenderDetails.css';

const DeviationRepresentationEditor = () => {
    const { tenderId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const editorRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [representationData, setRepresentationData] = useState([]);
    const [metadata, setMetadata] = useState(null);
    const [regenerating, setRegenerating] = useState(false);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
    const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

    useEffect(() => {
        fetchDataAndGenerate();
    }, [tenderId]);

    const fetchDataAndGenerate = async () => {
        try {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');

            // First, check if saved representation exists
            const checkResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/get-representation`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const checkResult = await checkResponse.json();

            if (checkResult.success && checkResult.data) {
                // Load saved representation
                setRepresentationData(checkResult.data.representation_data);
                setMetadata(checkResult.data.metadata);
                setLoading(false);
                return;
            }

            // If no saved representation, fetch data and generate new one
            const deviationResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/deviations`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const deviationResult = await deviationResponse.json();

            if (!deviationResult.success) {
                throw new Error('No deviation data found');
            }

            // --- FILTER DEVIATIONS BASED ON SELECTED ITEMS ---
            const searchParams = new URLSearchParams(location.search);
            const itemsParam = searchParams.get('items');

            let filteredDeviations = deviationResult.data;
            if (itemsParam) {
                const selectedItemsArray = itemsParam.split(',');
                filteredDeviations = {};

                // Only include the keys that are in the selectedItemsArray
                // Keep the original data shape (which should be an object keyed by item_X)
                selectedItemsArray.forEach(itemKey => {
                    if (deviationResult.data[itemKey]) {
                        filteredDeviations[itemKey] = deviationResult.data[itemKey];
                    }
                });
            }

            const productsResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/suggestions`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const productsResult = await productsResponse.json();

            if (!productsResult.success || !productsResult.data || productsResult.data.length === 0) {
                throw new Error('No suggested products found');
            }

            const firstProduct = productsResult.data[0];

            setMetadata({
                tender_id: cleanBidNumber,
                product_code: firstProduct.product_code || firstProduct.suggested_product_code,
                product_name: firstProduct.title || firstProduct.suggested_product_name,
                generated_at: new Date().toISOString()
            });

            await generateWithBackend(filteredDeviations, firstProduct);

        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.message || 'Failed to load data');
            setLoading(false);
        }
    };

    const generateWithBackend = async (deviations, product) => {
        try {
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');

            const response = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/generate-representation`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || 'Failed to generate representation');
            }

            setRepresentationData(result.data);
            setMetadata(result.metadata);
            setLoading(false);

        } catch (err) {
            console.error('Error calling backend:', err);
            setError(err.message || 'Failed to generate representation');
            setLoading(false);
        }
    };

    const handleRegenerateDeviation = async () => {
        try {
            setRegenerating(true);
            const cleanBidNumber = tenderId.replace(/_/g, '/');

            // Get current product specs
            const productsResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/suggestions`,
                { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }
            );
            const productsResult = await productsResponse.json();

            if (!productsResult.success || !productsResult.data || productsResult.data.length === 0) {
                throw new Error('No suggested products found');
            }

            const firstProduct = productsResult.data[0];

            // Call Python API to regenerate deviation
            const pythonResponse = await fetch('https://ai.openprocure.ai/recreate-deviation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    bid_number: cleanBidNumber,
                    product_code: firstProduct.product_code || firstProduct.suggested_product_code,
                    product_name: firstProduct.title || firstProduct.suggested_product_name,
                    product_specs: firstProduct
                })
            });

            const pythonResult = await pythonResponse.json();

            if (pythonResult.status !== 'success') {
                throw new Error(pythonResult.detail || 'Failed to regenerate deviation');
            }

            // Update deviation tables in backend
            const token = localStorage.getItem('token');
            const updateResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/deviations`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        deviation_tables: pythonResult.deviation_table
                    })
                }
            );

            const updateResult = await updateResponse.json();

            if (!updateResult.success) {
                throw new Error('Failed to update deviation tables in database');
            }

            alert('✅ Deviation table regenerated successfully!');
            setRegenerating(false);

        } catch (err) {
            console.error('Error regenerating deviation:', err);
            alert(`❌ Error: ${err.message}`);
            setRegenerating(false);
        }
    };

    const handleSaveDraft = async () => {
        try {
            const htmlContent = editorRef.current.innerHTML;
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');

            const response = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/save-representation`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        html_content: htmlContent,
                        representation_data: representationData,
                        metadata: metadata
                    })
                }
            );

            const result = await response.json();

            if (result.success) {
                alert('✅ Draft saved to database successfully!');
            } else {
                alert('❌ Failed to save draft to database');
            }

        } catch (err) {
            console.error('Error saving draft:', err);
            alert('❌ Error saving draft');
        }
    };

    const handleDownloadWord = () => {
        try {
            const htmlContent = editorRef.current.innerHTML;

            const completeHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.6; }
                        h2 { text-align: center; color: #084f9a; }
                        h3 { color: #084f9a; margin-top: 30px; }
                        p { text-align: justify; margin-bottom: 16px; }
                        table { width: 100%; border-collapse: collapse; font-size: 10pt; border: 1px solid #ddd; }
                        th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
                        th { background: #f8f9fa; font-weight: bold; }
                    </style>
                </head>
                <body>${htmlContent}</body>
                </html>
            `;

            const blob = new Blob([completeHtml], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Deviation_Representation_${metadata.tender_id.replace(/\//g, '_')}_${new Date().toISOString().split('T')[0]}.doc`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            alert('📄 Document downloaded successfully!');

        } catch (err) {
            console.error('Error downloading:', err);
            alert('❌ Error downloading document');
        }
    };

    if (loading) {
        return (
            <div className="tender-details-container" style={{ padding: '40px', textAlign: 'center' }}>
                <Loader2 size={40} className="animate-spin" style={{ margin: '0 auto 20px', color: '#084f9a' }} />
                <p style={{ fontSize: '16px', color: '#666' }}>Generating representation letter using AI...</p>
                <p style={{ fontSize: '14px', color: '#999', marginTop: '10px' }}>This may take 10-30 seconds</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="tender-details-container" style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ color: '#dc2626', fontSize: '16px', marginBottom: '20px' }}>❌ {error}</p>
                <button onClick={() => navigate(-1)} style={{ padding: '10px 20px', background: '#084f9a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    ← Go Back
                </button>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#eef2f7' }}>
            <div style={{ background: '#fff', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', borderRadius: '6px', color: '#374151' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <strong style={{ fontSize: '16px', color: '#1a1a1a' }}>Deviation Representation Letter</strong>
                        {metadata && <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{metadata.tender_id} | {metadata.product_name}</div>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={handleSaveDraft} style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500' }}>
                        <Save size={18} /> Save Draft
                    </button>
                    <button onClick={handleRegenerateDeviation} disabled={regenerating} style={{ background: regenerating ? '#9ca3af' : '#7c3aed', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: regenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500' }}>
                        {regenerating ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} Re-Generate Deviation
                    </button>
                    <button onClick={handleDownloadWord} style={{ background: '#084f9a', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>📄 Download as Word</button>
                </div>
            </div>

            <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
                <div ref={editorRef} contentEditable suppressContentEditableWarning style={{ width: '850px', minHeight: '1100px', background: '#fff', padding: '3rem', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', lineHeight: '1.6', boxShadow: '0 0 20px rgba(0,0,0,0.1)', borderRadius: '4px', outline: 'none', color: '#1a1a1a' }} spellCheck="true">
                    <h2 style={{ textAlign: 'center', marginBottom: '30px', color: '#084f9a' }}>Deviation Representation Letter</h2>
                    {metadata && (
                        <div style={{ marginBottom: '30px', fontSize: '10pt' }}>
                            <p><strong>Tender ID:</strong> {metadata.tender_id}</p>
                            <p><strong>Product:</strong> {metadata.product_name} ({metadata.product_code})</p>
                            <p><strong>Generated:</strong> {new Date(metadata.generated_at).toLocaleString()}</p>
                        </div>
                    )}
                    <div style={{ marginBottom: '30px' }}>
                        <p style={{ textAlign: 'justify', marginBottom: '16px' }}>Dear Sir/Madam,</p>
                        <p style={{ textAlign: 'justify', marginBottom: '16px' }}>We are writing to provide clarification regarding our product specifications in relation to the tender requirements for <strong>{metadata?.tender_id}</strong>.</p>
                    </div>
                    <h3 style={{ marginTop: '30px', marginBottom: '20px', color: '#084f9a' }}>Specification Comparison and Representation</h3>
                    <div style={{ overflowX: 'auto', marginBottom: '30px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt', border: '1px solid #ddd' }}>
                            <thead>
                                <tr style={{ background: '#f8f9fa' }}>
                                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>Specification</th>
                                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>Tender Requirement</th>
                                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>Product Offered</th>
                                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>Status</th>
                                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>Remarks</th>
                                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>Representation</th>
                                </tr>
                            </thead>
                            <tbody>
                                {representationData.map((row, idx) => {
                                    // Determine status color
                                    let statusColor = '#6b7280'; // Default gray for "Not Specified"
                                    if (row.status === 'Compiled') statusColor = '#059669'; // Green
                                    else if (row.status === 'Not Compiled') statusColor = '#dc2626'; // Red

                                    return (
                                        <tr key={idx}>
                                            <td style={{ padding: '10px', border: '1px solid #ddd', verticalAlign: 'top' }}>{row.specification}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd', verticalAlign: 'top' }}>{row.tender_requirement}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd', verticalAlign: 'top' }}>{row.product_offered}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd', verticalAlign: 'top', fontWeight: 'bold', color: statusColor }}>{row.status}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd', verticalAlign: 'top' }}>{row.remarks || '-'}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd', verticalAlign: 'top', textAlign: 'justify' }}>{row.representation}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ marginTop: '40px' }}>
                        <p style={{ textAlign: 'justify', marginBottom: '16px' }}>We respectfully request your consideration of the above representations and believe that our product meets the essential requirements of the tender while offering equivalent or superior functionality.</p>
                        <p style={{ textAlign: 'justify', marginBottom: '16px' }}>We remain available for any clarifications or technical discussions you may require.</p>
                        <p style={{ marginTop: '40px' }}>Sincerely,</p>
                        <p style={{ marginTop: '60px' }}><strong>Meril Life Sciences Private Limited</strong></p>
                    </div>
                </div>
            </div>

            <style>{`
                @media print {
                    button { display: none !important; }
                    body { background: white !important; }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default DeviationRepresentationEditor;

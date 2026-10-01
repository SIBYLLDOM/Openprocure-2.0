import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, RefreshCw, Printer, FileDown, CheckCircle, XCircle, MinusCircle, Trash2, PlusCircle } from 'lucide-react';
import '../../assets/css/TenderDetails.css';
import { MerilLetterSignature } from '../../components/common/MerilLetterhead';
import EndoLetterheadLogo from '../../assets/img/endo-letterhead-logo.png';
import EndoLetterheadFooter from '../../assets/img/endo-letterhead-footer.png';

function SummaryBar({ data }) {
    const complied    = data.filter(r => r.status === 'Complied').length;
    const notComplied = data.filter(r => r.status === 'Not Complied').length;
    const notSpecified = data.length - complied - notComplied;
    const pct = data.length ? Math.round((complied / data.length) * 100) : 0;

    return (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', color: '#065f46', fontWeight: '600' }}>
                <CheckCircle size={14} /> {complied} Complied
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', color: '#991b1b', fontWeight: '600' }}>
                <XCircle size={14} /> {notComplied} Not Complied
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', color: '#374151', fontWeight: '600' }}>
                <MinusCircle size={14} /> {notSpecified} Not Specified
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Compliance</span>
                <div style={{ width: '120px', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444', borderRadius: '4px', transition: 'width 0.5s ease' }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: '700', color: pct >= 80 ? '#065f46' : pct >= 50 ? '#92400e' : '#991b1b' }}>{pct}%</span>
            </div>
        </div>
    );
}

// "item_12" -> "Item 12" — a representation letter can cover several tender
// items at once, so each row needs a human-readable tag for which item it's about.
function formatItemCode(itemKey) {
    if (!itemKey) return '—';
    const m = String(itemKey).match(/(\d+)$/);
    return m ? `Item ${m[1]}` : String(itemKey);
}

const DeviationRepresentationEditor = () => {
    const { tenderId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const editorRef = useRef(null);

    const [loading, setLoading]               = useState(true);
    const [error, setError]                   = useState(null);
    const [representationData, setRepresentationData] = useState([]);
    const [metadata, setMetadata]             = useState(null);
    const [regenerating, setRegenerating]     = useState(false);
    const [downloading, setDownloading]       = useState(false);
    const [downloadingDocx, setDownloadingDocx] = useState(false);

    // ── Row management state ─────────────────────────────────────────────────
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTargetIdx, setDeleteTargetIdx]     = useState(null);
    const [showAddRow, setShowAddRow]               = useState(false);
    const EMPTY_ROW = { specification: '', tender_requirement: '', product_offered: '', status: 'Not Complied', reason: '', justification: '', remarks: '', representation: '' };
    const [newRow, setNewRow]                       = useState(EMPTY_ROW);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    useEffect(() => { fetchDataAndGenerate(); }, [tenderId]);

    const fetchDataAndGenerate = async () => {
        try {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');

            const checkResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/get-representation`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const checkResult = await checkResponse.json();

            if (checkResult.success && checkResult.data) {
                setRepresentationData(
                    (checkResult.data.representation_data || []).filter(
                        r => r.status === 'Not Complied' || r.status === 'Deviation'
                    )
                );
                setMetadata(checkResult.data.metadata);
                setLoading(false);
                return;
            }

            const deviationResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/deviations`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const deviationResult = await deviationResponse.json();

            if (!deviationResult.success) throw new Error('No deviation data found');

            const searchParams = new URLSearchParams(location.search);
            const itemsParam = searchParams.get('items');
            let filteredDeviations = deviationResult.data;
            if (itemsParam) {
                const selectedItemsArray = itemsParam.split(',');
                filteredDeviations = {};
                selectedItemsArray.forEach(itemKey => {
                    if (deviationResult.data[itemKey]) filteredDeviations[itemKey] = deviationResult.data[itemKey];
                });
            }

            const productsResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/suggestions`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const productsResult = await productsResponse.json();

            if (!productsResult.success || !productsResult.data?.length) throw new Error('No suggested products found');

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
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
                }
            );

            const result = await response.json();
            if (!result.success) throw new Error(result.message || 'Failed to generate representation');

            setRepresentationData(
                (result.data || []).filter(r => r.status === 'Not Complied' || r.status === 'Deviation')
            );
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

            const productsResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/suggestions`,
                { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }
            );
            const productsResult = await productsResponse.json();

            if (!productsResult.success || !productsResult.data?.length) throw new Error('No suggested products found');

            const firstProduct = productsResult.data[0];
            const productCode = firstProduct.product_code || firstProduct.suggested_product_code;

            // firstProduct is just the suggestion summary (code/name/category) — fetch
            // the product's actual spec sheet so the AI has real specs to compare
            // against instead of an almost-empty object (was causing every field to
            // come back "Not Specified" even when the catalogue has full specs).
            let fullProductSpecs = firstProduct;
            if (productCode) {
                try {
                    const specsResponse = await fetch(
                        `${API_BASE_URL}/tenders/products/by-code/${encodeURIComponent(productCode)}`,
                        { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }
                    );
                    const specsResult = await specsResponse.json();
                    if (specsResult.success && specsResult.data) {
                        fullProductSpecs = specsResult.data;
                    }
                } catch (specsErr) {
                    console.error('Failed to fetch full product specs, falling back to summary:', specsErr);
                }
            }

            // Regenerate via our backend proxy — calling suggestions.openprocure.ai
            // directly from the browser gets blocked by CORS (it sends no
            // Access-Control-Allow-Origin header); the backend proxies it server-side.
            const pythonResponse = await fetch(`${API_BASE_URL}/tenders/regenerate-deviation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({
                    bid_number:    cleanBidNumber,
                    product_code:  productCode,
                    product_name:  firstProduct.title || firstProduct.suggested_product_name,
                    product_specs: fullProductSpecs,
                    item_key:      firstProduct.item_key || 'item_1'
                })
            });

            const pythonResult = await pythonResponse.json();
            if (pythonResult.status !== 'success') throw new Error(pythonResult.detail || 'Failed to regenerate deviation');

            const token = localStorage.getItem('token');
            const updateResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/deviations`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ deviation_tables: pythonResult.deviation_table })
                }
            );

            const updateResult = await updateResponse.json();
            if (!updateResult.success) throw new Error('Failed to update deviation tables in database');

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
            const htmlContent = editorRef.current?.innerHTML || '';
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');

            const response = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/save-representation`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ html_content: htmlContent, representation_data: representationData, metadata })
                }
            );

            const result = await response.json();
            if (result.success) alert('✅ Draft saved successfully!');
            else alert('❌ Failed to save draft');

        } catch (err) {
            console.error('Error saving draft:', err);
            alert('❌ Error saving draft');
        }
    };

    const handleDownloadPDF = async () => {
        try {
            setDownloading(true);
            const rows = representationData.map((row, idx) => ({
                sno:                row.sno ?? idx + 1,
                item_code:          formatItemCode(row.item_key),
                specification:      row.specification      || '',
                tender_requirement: row.tender_requirement || '',
                product_offered:    row.product_offered    || '',
                reason:             row.reason             || '',
                justification:      row.justification      || '',
                remarks:            row.remarks            || '',
                representation:     row.representation     || '',
            }));

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/generate-letter-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bid_number:   metadata?.tender_id   || tenderId,
                    tender_id:    metadata?.tender_id   || tenderId,
                    product_name: metadata?.product_name || '',
                    product_code: metadata?.product_code || '',
                    division:     metadata?.dept === 'Endo' ? 'Endo' : 'Diagno',
                    rows,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || errData.detail || `Server error ${res.status}`);
            }

            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `Deviation_Representation_${(metadata?.tender_id || tenderId).replace(/\//g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (err) {
            console.error('Error generating PDF:', err);
            alert('❌ Error generating PDF: ' + err.message);
        } finally {
            setDownloading(false);
        }
    };

    const handleDownloadDocx = async () => {
        try {
            setDownloadingDocx(true);
            const html = editorRef.current?.innerHTML || '';
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/doc-prep/export-docx`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    title: `Deviation Representation – ${metadata?.tender_id || tenderId}`,
                    html_content: html,
                    skipAutoSignature: isEndo,
                    division: isEndo ? 'Endo' : 'Diagno',
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `Server error ${res.status}`);
            }
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `Deviation_Representation_${(metadata?.tender_id || tenderId).replace(/\//g, '_')}_${new Date().toISOString().split('T')[0]}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error generating DOCX:', err);
            alert('❌ Error generating DOCX: ' + err.message);
        } finally {
            setDownloadingDocx(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // ── Row management handlers ──────────────────────────────────────────────
    const requestDeleteRow = (idx) => {
        setDeleteTargetIdx(idx);
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = () => {
        if (deleteTargetIdx === null) return;
        setRepresentationData(prev => prev.filter((_, i) => i !== deleteTargetIdx));
        setShowDeleteConfirm(false);
        setDeleteTargetIdx(null);
    };

    const handleAddRow = () => {
        setRepresentationData(prev => [
            ...prev,
            { ...newRow, sno: prev.length + 1 }
        ]);
        setNewRow(EMPTY_ROW);
        setShowAddRow(false);
    };

    const isEndo = metadata?.dept === 'Endo';

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#eef2f7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                <div style={{ background: '#fff', borderRadius: '16px', padding: '48px 64px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' }}>
                    <Loader2 size={48} style={{ color: '#084f9a', animation: 'spin 1s linear infinite', marginBottom: '20px' }} />
                    <p style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a', margin: '0 0 8px' }}>Generating Representation Letter</p>
                    <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>AI is analysing deviation data — this may take 10–30 seconds</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ minHeight: '100vh', background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: '16px', padding: '48px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: '480px' }}>
                    <XCircle size={48} style={{ color: '#dc2626', marginBottom: '20px' }} />
                    <p style={{ color: '#dc2626', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Failed to Load</p>
                    <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>{error}</p>
                    <button onClick={() => navigate(-1)} style={{ padding: '10px 24px', background: '#084f9a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>
                        ← Go Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#eef2f7' }}>

            {/* ── Toolbar ── */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', position: 'sticky', top: 0, zIndex: 100 }}>
                <div style={{ padding: '0 24px', display: 'flex', alignItems: 'center', gap: '12px', height: '60px' }}>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ background: '#f3f4f6', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', color: '#374151', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f3f4f6'}
                    >
                        <ArrowLeft size={18} />
                    </button>

                    <div style={{ height: '28px', width: '1px', background: '#e5e7eb' }} />

                    <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>Deviation Representation Letter</div>
                        {metadata && (
                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '1px' }}>
                                {metadata.tender_id}
                                {metadata.product_name && <> &middot; {metadata.product_name}</>}
                            </div>
                        )}
                    </div>

                    <div style={{ flex: 1 }} />

                    {/* Action group */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            onClick={handlePrint}
                            style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500' }}
                            title="Print"
                        >
                            <Printer size={15} /> Print
                        </button>

                        <button
                            onClick={handleSaveDraft}
                            style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500' }}
                        >
                            <Save size={15} /> Save Draft
                        </button>

                        {/* ── Add Row — always visible ── */}
                        <button
                            onClick={() => { setNewRow(EMPTY_ROW); setShowAddRow(true); }}
                            style={{
                                background: '#eff6ff', color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '13px', fontWeight: '600',
                            }}
                            title="Add a new row to the table"
                        >
                            <PlusCircle size={15} /> Add Row
                        </button>

                        <button
                            onClick={handleRegenerateDeviation}
                            disabled={regenerating}
                            style={{ background: regenerating ? '#f5f3ff' : '#f5f3ff', color: regenerating ? '#a78bfa' : '#7c3aed', border: '1px solid #ddd6fe', padding: '8px 14px', borderRadius: '8px', cursor: regenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500' }}
                        >
                            {regenerating ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={15} />}
                            {regenerating ? 'Regenerating…' : 'Re-Generate'}
                        </button>

                        <button
                            onClick={handleDownloadDocx}
                            disabled={downloadingDocx}
                            style={{ background: downloadingDocx ? '#f0fdf4' : '#166534', color: downloadingDocx ? '#166534' : '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: downloadingDocx ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', boxShadow: downloadingDocx ? 'none' : '0 1px 4px rgba(22,101,52,0.3)' }}
                        >
                            {downloadingDocx ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <FileDown size={15} />}
                            {downloadingDocx ? 'Generating…' : 'Download DOCX'}
                        </button>

                        <button
                            onClick={handleDownloadPDF}
                            disabled={downloading}
                            style={{ background: downloading ? '#e0e7ff' : '#084f9a', color: downloading ? '#6366f1' : '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: downloading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', boxShadow: downloading ? 'none' : '0 1px 4px rgba(8,79,154,0.3)' }}
                        >
                            {downloading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <FileDown size={15} />}
                            {downloading ? 'Generating…' : 'Download PDF'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Summary bar ── */}
            {representationData.length > 0 && (
                <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 24px' }}>
                    <SummaryBar data={representationData} />
                </div>
            )}

            {/* ── Document ── */}
            <div style={{ padding: '32px 24px', display: 'flex', justifyContent: 'center' }}>
                <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    style={isEndo ? {
                        // Endo letterhead geometry, matching Representation_Letter_Tool_8.html:
                        // true A4 with room at the top for the logo and at the foot for the
                        // full-width band, so the printed page matches what is on screen.
                        position: 'relative',
                        width: '210mm', minHeight: '297mm', background: '#fff',
                        padding: '32mm 20mm 48mm 20mm',
                        fontFamily: "'Times New Roman', Times, serif",
                        fontSize: '11pt', lineHeight: '1.7',
                        boxShadow: '0 6px 24px rgba(20,30,60,0.12)',
                        outline: 'none', color: '#1a1a1a', overflow: 'hidden',
                    } : {
                        width: '900px', minHeight: '1100px', background: '#fff',
                        padding: '48px 56px', fontFamily: "'Times New Roman', Times, serif",
                        fontSize: '11pt', lineHeight: '1.7',
                        boxShadow: '0 2px 24px rgba(0,0,0,0.10)', borderRadius: '4px',
                        outline: 'none', color: '#1a1a1a',
                    }}
                    spellCheck
                >
                    {/* Header — Endo uses the letterhead artwork (logo top-right, footer
                        band at the foot of the page); Diagno keeps the typeset heading. */}
                    {isEndo ? (
                        <>
                            <div contentEditable={false} style={{ position: 'absolute', top: '10mm', right: '20mm' }}>
                                <img src={EndoLetterheadLogo} alt="Meril Endo Surgery" style={{ height: '16mm', display: 'block' }} />
                            </div>
                            <div contentEditable={false} style={{
                                position: 'absolute', left: 0, right: 0, bottom: 0,
                                width: '100%', pointerEvents: 'none',
                            }}>
                                <img src={EndoLetterheadFooter} alt="" style={{ width: '100%', display: 'block' }} />
                            </div>
                        </>
                    ) : (
                        <div style={{ borderBottom: '3px solid #084f9a', paddingBottom: '16px', marginBottom: '32px' }}>
                            <div style={{ fontSize: '20pt', fontWeight: '700', color: '#084f9a', letterSpacing: '-0.3px' }}>Meril Diagnostics Pvt. Ltd.</div>
                            <div style={{ fontSize: '9pt', color: '#6b7280', marginTop: '4px' }}>Deviation Representation Letter</div>
                        </div>
                    )}

                    {/* Date — right-aligned */}
                    <div style={{ textAlign: 'right', marginBottom: '28px', fontSize: '11pt' }}>
                        Dated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.')}
                    </div>

                    {/* Sub / Ref */}
                    <div style={{ marginBottom: '20px' }}>
                        <p style={{ margin: '0 0 6px', fontWeight: '700', fontSize: '11pt' }}>
                            Sub.: REPRESENTATION LETTER
                        </p>
                        <p style={{ margin: '0 0 6px', fontSize: '11pt' }}>
                            Ref: {metadata?.tender_id}
                        </p>
                    </div>

                    {/* Salutation */}
                    <p style={{ marginBottom: '20px', fontSize: '11pt' }}>Dear Sir,</p>

                    {/* Opening paragraph */}
                    <p style={{ textAlign: 'justify', marginBottom: '24px', fontSize: '11pt', lineHeight: '1.8' }}>
                        We are eager to participate in your reference tender and please find our representation against above
                        reference tender for your kind consideration.
                    </p>

                    {/* Table — Endo uses the official template's simplified 4-column
                        layout; Diagno keeps the existing full breakdown. */}
                    <div style={{ margin: '24px 0', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt' }}>
                            <thead>
                                <tr style={{ background: '#084f9a', color: '#fff' }}>
                                    {(isEndo
                                        ? ['Sr. No', 'Item Code', 'Tender Specification Amendment', 'Required Justification', '']
                                        : ['#', 'Specification', 'Tender Requirement', 'Product Offered', 'Reason', 'Justification', 'Remarks', 'Representation', '']
                                    ).map((h, i) => (
                                        <th key={i} style={{ padding: '10px 8px', border: '1px solid #1e6ec8', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap', width: h === '' ? '36px' : undefined }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {representationData.map((row, idx) => (
                                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f0f6ff' }}>
                                        <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top', color: '#6b7280', fontSize: '9pt', textAlign: 'center', minWidth: '28px' }}>{row.sno ?? idx + 1}</td>
                                        {isEndo ? (
                                            <>
                                                <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top' }}>{formatItemCode(row.item_key)}</td>
                                                <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top', textAlign: 'justify' }}>{row.representation}</td>
                                                <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top', textAlign: 'justify' }}>{row.justification || '—'}</td>
                                            </>
                                        ) : (
                                            <>
                                                <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top', fontWeight: '500' }}>{row.specification}</td>
                                                <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top' }}>{row.tender_requirement}</td>
                                                <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top' }}>{row.product_offered}</td>
                                                <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top', textAlign: 'justify' }}>{row.reason || '—'}</td>
                                                <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top', textAlign: 'justify' }}>{row.justification || '—'}</td>
                                                <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top', color: '#6b7280' }}>{row.remarks || '—'}</td>
                                                <td style={{ padding: '8px', border: '1px solid #dde4f0', verticalAlign: 'top', textAlign: 'justify' }}>{row.representation}</td>
                                            </>
                                        )}
                                        <td style={{ padding: '4px', border: '1px solid #dde4f0', verticalAlign: 'middle', textAlign: 'center' }}>
                                            <button
                                                onClick={() => requestDeleteRow(idx)}
                                                title="Delete this row"
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: '#dc2626', padding: '4px', borderRadius: '4px',
                                                    display: 'inline-flex', alignItems: 'center',
                                                    transition: 'background 0.15s',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Closing paragraph */}
                    <p style={{ textAlign: 'justify', marginTop: '28px', marginBottom: '28px', fontSize: '11pt', lineHeight: '1.8' }}>
                        Looking at above technical facts, we request you to kindly consider above suggested terms and issue
                        necessary amendments in the reference tender so that the terms are more open which will enable more
                        bidders to participate in the tender. This will further allow you to choose quality products at most
                        competitive prices.
                    </p>

                    {/* Sign-off */}
                    <div style={{ marginTop: '16px' }}>
                        <p style={{ marginBottom: isEndo ? '12px' : '48px', fontSize: '11pt' }}>Thanking your best of the services always.</p>
                        {isEndo ? (
                            <MerilLetterSignature />
                        ) : (
                            <p style={{ fontWeight: '700', fontSize: '11pt', letterSpacing: '0.3px' }}>FOR MERIL DIAGNOSTICS PVT. LTD</p>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @media print {
                    body > *:not(.print-area) { display: none !important; }
                    @page { margin: 15mm; }
                }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>

            {/* ── Delete confirmation modal ── */}
            {showDeleteConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '14px', padding: '36px 40px',
                        width: '420px', maxWidth: '95vw',
                        boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
                        display: 'flex', flexDirection: 'column', gap: '20px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '50%',
                                background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <Trash2 size={22} color="#dc2626" />
                            </div>
                            <div>
                                <div style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>Delete Row?</div>
                                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '3px' }}>
                                    Row #{deleteTargetIdx !== null ? (representationData[deleteTargetIdx]?.sno ?? deleteTargetIdx + 1) : ''} will be permanently removed from the letter.
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setShowDeleteConfirm(false); setDeleteTargetIdx(null); }}
                                style={{
                                    padding: '9px 22px', background: '#f3f4f6', color: '#374151',
                                    border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer',
                                    fontWeight: '600', fontSize: '13px',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                style={{
                                    padding: '9px 22px', background: '#dc2626', color: '#fff',
                                    border: 'none', borderRadius: '8px', cursor: 'pointer',
                                    fontWeight: '600', fontSize: '13px',
                                    boxShadow: '0 1px 4px rgba(220,38,38,0.3)',
                                }}
                            >
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Add Row modal ── */}
            {showAddRow && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '14px', padding: '36px 40px',
                        width: '640px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
                        boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
                        display: 'flex', flexDirection: 'column', gap: '18px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '50%',
                                background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <PlusCircle size={22} color="#084f9a" />
                            </div>
                            <div>
                                <div style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>Add New Row</div>
                                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>Fill in the details for the new representation row</div>
                            </div>
                        </div>

                        {[
                            { label: 'Specification', key: 'specification', multiline: true },
                            { label: 'Tender Requirement', key: 'tender_requirement', multiline: true },
                            { label: 'Product Offered', key: 'product_offered', multiline: false },
                            { label: 'Reason', key: 'reason', multiline: true },
                            { label: 'Justification', key: 'justification', multiline: true },
                            { label: 'Remarks', key: 'remarks', multiline: false },
                            { label: 'Representation', key: 'representation', multiline: true },
                        ].map(({ label, key, multiline }) => (
                            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{label}</label>
                                {multiline ? (
                                    <textarea
                                        rows={3}
                                        value={newRow[key]}
                                        onChange={e => setNewRow(prev => ({ ...prev, [key]: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '8px 10px', fontSize: '13px',
                                            border: '1px solid #d1d5db', borderRadius: '8px',
                                            resize: 'vertical', boxSizing: 'border-box',
                                            fontFamily: 'inherit', color: '#1f2937',
                                        }}
                                        placeholder={`Enter ${label.toLowerCase()}…`}
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        value={newRow[key]}
                                        onChange={e => setNewRow(prev => ({ ...prev, [key]: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '8px 10px', fontSize: '13px',
                                            border: '1px solid #d1d5db', borderRadius: '8px',
                                            boxSizing: 'border-box', color: '#1f2937',
                                        }}
                                        placeholder={`Enter ${label.toLowerCase()}…`}
                                    />
                                )}
                            </div>
                        ))}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Status</label>
                            <select
                                value={newRow.status}
                                onChange={e => setNewRow(prev => ({ ...prev, status: e.target.value }))}
                                style={{
                                    width: '100%', padding: '8px 10px', fontSize: '13px',
                                    border: '1px solid #d1d5db', borderRadius: '8px',
                                    boxSizing: 'border-box', color: '#1f2937', background: '#fff',
                                }}
                            >
                                <option value="Not Complied">Not Complied</option>
                                <option value="Deviation">Deviation</option>
                                <option value="Complied">Complied</option>
                                <option value="Not Specified">Not Specified</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                            <button
                                onClick={() => { setShowAddRow(false); setNewRow(EMPTY_ROW); }}
                                style={{
                                    padding: '9px 22px', background: '#f3f4f6', color: '#374151',
                                    border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer',
                                    fontWeight: '600', fontSize: '13px',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddRow}
                                disabled={!newRow.specification.trim()}
                                style={{
                                    padding: '9px 22px',
                                    background: newRow.specification.trim() ? '#084f9a' : '#9ca3af',
                                    color: '#fff', border: 'none', borderRadius: '8px',
                                    cursor: newRow.specification.trim() ? 'pointer' : 'not-allowed',
                                    fontWeight: '600', fontSize: '13px',
                                    boxShadow: newRow.specification.trim() ? '0 1px 4px rgba(8,79,154,0.3)' : 'none',
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <PlusCircle size={15} /> Add Row
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeviationRepresentationEditor;

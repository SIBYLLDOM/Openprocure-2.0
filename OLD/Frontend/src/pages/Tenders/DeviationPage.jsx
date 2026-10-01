import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ProductSearchModal from '../../components/common/ProductSearchModal';
import ShareDeviationModal from './ShareDeviationModal';
import MasterProductListModal from './MasterProductListModal';
import { RefreshCw, Loader2 } from 'lucide-react';
import '../../assets/css/TenderDetails.css';

const DeviationPage = () => {
    const { tenderId } = useParams();
    const navigate = useNavigate();
    const [isEditing, setIsEditing] = useState(false);
    const [deviationData, setDeviationData] = useState(null);
    const [localData, setLocalData] = useState({});
    const [productCodes, setProductCodes] = useState({});
    const [relevancyScores, setRelevancyScores] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [hasRepresentation, setHasRepresentation] = useState(false);
    const [regenerating, setRegenerating] = useState(false);

    // Modal state for selection
    const [showModal, setShowModal] = useState(false);
    const [selectedItems, setSelectedItems] = useState([]);

    // State for Recalculate Product
    const [activeSearchItem, setActiveSearchItem] = useState(null);
    const [recalculatingItem, setRecalculatingItem] = useState(null);
    const [showShareModal, setShowShareModal] = useState(false);

    // Master list (Excel-style bulk edit / delete) modal
    const [showMasterList, setShowMasterList] = useState(false);
    const [masterListProducts, setMasterListProducts] = useState([]);
    const [masterListLoading, setMasterListLoading] = useState(false);

    // Deviation table Excel download/import
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const importInputRef = useRef(null);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    useEffect(() => {
        fetchDeviations();
    }, [tenderId]);

    const fetchDeviations = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');

            const response = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/deviations`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            const data = await response.json();

            if (data.success) {
                // Add original_status to track transitions from "Not Specified"
                const initData = JSON.parse(JSON.stringify(data.data));
                Object.keys(initData).forEach(key => {
                    initData[key].forEach(row => {
                        if (row.status === 'Deviation') row.status = 'Not Complied';
                        row.original_status = row.status || 'Not Specified';
                    });
                });
                setDeviationData(data.data);
                setLocalData(initData);
                setProductCodes(data.productCodes || {});
                setRelevancyScores(data.relevancyScores || {});
                setHasRepresentation(data.has_representation || false);
            } else {
                setError('Failed to fetch deviation data');
            }
        } catch (err) {
            console.error('Error fetching deviations:', err);
            setError('Error fetching deviation data');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = (itemKey, rowIndex, newStatus) => {
        setLocalData(prev => ({
            ...prev,
            [itemKey]: prev[itemKey].map((row, idx) =>
                idx === rowIndex ? { ...row, status: newStatus, edited: true } : row
            )
        }));
    };

    const handleFieldChange = (itemKey, rowIndex, field, newValue) => {
        setLocalData(prev => ({
            ...prev,
            [itemKey]: prev[itemKey].map((row, idx) =>
                idx === rowIndex ? { ...row, [field]: newValue, edited: true } : row
            )
        }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');

            // Find all newly edited "Not Specified" items and push to 8082
            const editPromises = [];
            Object.keys(localData).forEach(itemKey => {
                const pCode = productCodes[itemKey];
                localData[itemKey].forEach(row => {
                    if (row.original_status === 'Not Specified' && row.status !== 'Not Specified' && row.edited && pCode) {
                        editPromises.push(
                            fetch(`${import.meta.env.VITE_ENDO_PIPELINE_URL || 'https://suggestions.openprocure.ai'}/edit`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    product_code: pCode,
                                    updates: {
                                        reason: row.reason || '',
                                        remarks: row.remarks || '',
                                        product_offered: row.product_offered || ''
                                    }
                                })
                            }).catch(e => console.error("Inline edit trigger failed", e))
                        );
                    }
                });
            });

            // Fire integrations in parallel
            await Promise.all(editPromises);

            const response = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/deviations`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ deviations: localData })
                }
            );

            const data = await response.json();

            if (data.success) {
                // Sync Not Complied rows that carry a remark back to the product
                // JSON via Ollama — keyed on status + remark rather than the
                // `edited` flag so feedback still reaches the model even if the
                // row was marked Not Complied in an earlier save.
                const productUpdatePromises = [];
                Object.keys(localData).forEach(itemKey => {
                    const pCode = productCodes[itemKey];
                    if (!pCode) return;
                    localData[itemKey].forEach(row => {
                        if (row.status === 'Not Complied' && row.remarks && row.remarks.trim()) {
                            productUpdatePromises.push(
                                fetch(`${import.meta.env.VITE_ENDO_PIPELINE_URL || 'https://suggestions.openprocure.ai'}/product/update-from-deviation`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        product_code: pCode,
                                        specification: row.specification || '',
                                        tender_requirement: row.tender_requirement || '',
                                        product_offered: row.product_offered || '',
                                        status: row.status || '',
                                        reason: row.reason || '',
                                        remarks: row.remarks || '',
                                    })
                                }).catch(e => console.error('Product JSON update failed:', e))
                            );
                        }
                    });
                });
                if (productUpdatePromises.length > 0) {
                    console.log(`[deviations] Syncing ${productUpdatePromises.length} product JSON update(s) via Ollama...`);
                    await Promise.all(productUpdatePromises);
                }

                // reset original_status tracking
                const updatedData = JSON.parse(JSON.stringify(localData));
                Object.keys(updatedData).forEach(key => {
                    updatedData[key].forEach(row => {
                        row.original_status = row.status;
                        row.edited = false;
                    });
                });

                setDeviationData(updatedData);
                setLocalData(updatedData);
                setIsEditing(false);
                alert('✅ Deviation data saved successfully!');
            } else {
                alert('❌ Failed to save deviation data');
            }
        } catch (err) {
            console.error('Error saving deviations:', err);
            alert('❌ Error saving deviation data');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setLocalData(JSON.parse(JSON.stringify(deviationData))); // Reset to original
        setIsEditing(false);
    };

    const handleExportExcel = async () => {
        setExporting(true);
        try {
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');

            const res = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/deviations/export`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || 'Export failed');
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `deviation_${tenderId}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export deviation excel error:', err);
            alert(`❌ Failed to export: ${err.message}`);
        } finally {
            setExporting(false);
        }
    };

    const handleImportClick = () => importInputRef.current?.click();

    const handleImportFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file next time
        if (!file) return;

        setImporting(true);
        try {
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/deviations/import`,
                { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }
            );
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Import failed');

            // Load parsed rows into the page in Edit mode — nothing is saved
            // to the DB until the existing Save button is clicked, same as a
            // manual edit. `deviationData` (the last-saved baseline) is left
            // untouched, so Cancel still discards the import if unwanted.
            const initData = JSON.parse(JSON.stringify(data.data));
            Object.keys(initData).forEach(key => {
                initData[key].forEach(row => {
                    row.original_status = row.status || 'Not Specified';
                    row.edited = true;
                });
            });
            setLocalData(initData);
            setIsEditing(true);
            alert('✅ Excel imported — review the changes below, then click Save to apply them.');
        } catch (err) {
            console.error('Import deviation excel error:', err);
            alert(`❌ Failed to import: ${err.message}`);
        } finally {
            setImporting(false);
        }
    };

    const handleRecalculate = async (product) => {
        if (!activeSearchItem || !product || !product.product_code) return;

        const currentItem = activeSearchItem;
        setActiveSearchItem(null);
        setRecalculatingItem(currentItem);

        try {
            const cleanBidNumber = tenderId.replace(/_/g, '/');
            const response = await fetch(`${import.meta.env.VITE_ENDO_PIPELINE_URL || 'https://suggestions.openprocure.ai'}/recalculate-deviation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bid_no: cleanBidNumber,
                    item_key: currentItem,
                    product_code: product.product_code
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                alert('Specification updated and deviation updated successfully!');
                window.location.reload();
            } else {
                alert(`Failed to recalculate: ${data.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Error recalculating deviation:', err);
            alert('Error communicating with recalculation service.');
        } finally {
            setRecalculatingItem(null);
        }
    };

    const handleRegenerateDeviation = async () => {
        try {
            setRegenerating(true);
            const cleanBidNumber = tenderId.replace(/_/g, '/');

            // Get suggested products
            const productsResponse = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/suggestions`,
                { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }
            );
            const productsResult = await productsResponse.json();

            if (!productsResult.success || !productsResult.data || productsResult.data.length === 0) {
                throw new Error('No suggested products found');
            }

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
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    bid_number: cleanBidNumber,
                    product_code: productCode,
                    product_name: firstProduct.title || firstProduct.suggested_product_name,
                    product_specs: fullProductSpecs,
                    item_key: firstProduct.item_key || 'item_1'
                })
            });

            const pythonResult = await pythonResponse.json();

            if (pythonResult.status !== 'success') {
                throw new Error(pythonResult.detail || 'Failed to regenerate deviation');
            }

            alert('✅ Deviation table regenerated successfully!');
            setRegenerating(false);
            fetchDeviations(); // Reload the data

        } catch (err) {
            console.error('Error regenerating deviation:', err);
            alert(`❌ Error: ${err.message}`);
            setRegenerating(false);
        }
    };

    const openMasterList = async () => {
        try {
            setMasterListLoading(true);
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');
            const res = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/suggestions`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            if (data.success) {
                setMasterListProducts(data.data || []);
                setShowMasterList(true);
            } else {
                alert(data.message || 'Failed to load suggested products');
            }
        } catch (err) {
            console.error('Error loading master list:', err);
            alert('Error loading suggested products');
        } finally {
            setMasterListLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="tender-details-container" style={{ padding: '40px', textAlign: 'center' }}>
                <p>Loading deviation data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="tender-details-container" style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ color: '#dc2626' }}>{error}</p>
                <button
                    onClick={() => navigate(-1)}
                    style={{
                        marginTop: '20px',
                        padding: '10px 20px',
                        background: '#084f9a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    ← Go Back
                </button>
            </div>
        );
    }

    const items = Object.keys(localData).filter(key => key.startsWith('item_'));

    const openGenerateModal = () => {
        // Block if any rows are still "Not Specified"
        const unresolved = [];
        items.forEach(itemKey => {
            (localData[itemKey] || []).forEach(row => {
                if (row.status === 'Not Specified') {
                    unresolved.push(`• ${itemKey.replace('_', ' ')}: ${row.specification || 'Unknown spec'}`);
                }
            });
        });

        if (unresolved.length > 0) {
            const proceed = window.confirm(
                `⚠️ ${unresolved.length} row(s) are still "Not Specified":\n\n` +
                `${unresolved.join('\n')}\n\n` +
                `Click OK to generate the letter using only "Not Complied" rows (Not Specified rows will be skipped).\n` +
                `Click Cancel to go back and resolve them first.`
            );
            if (!proceed) return;
        }

        if (items.length <= 1) {
            // Direct navigation if 1 or 0 items
            navigate(`/Admin/tenderdetails/${encodeURIComponent(tenderId)}/deviation-representation`);
        } else {
            // Show selection modal and select all by default
            setSelectedItems([...items]);
            setShowModal(true);
        }
    };

    const handleCheckboxChange = (itemKey) => {
        if (selectedItems.includes(itemKey)) {
            setSelectedItems(selectedItems.filter(i => i !== itemKey));
        } else {
            setSelectedItems([...selectedItems, itemKey]);
        }
    };

    const handleGenerateWithSelected = () => {
        if (selectedItems.length === 0) {
            alert("Please select at least one item.");
            return;
        }
        const queryParams = selectedItems.join(',');
        navigate(`/Admin/tenderdetails/${encodeURIComponent(tenderId)}/deviation-representation?items=${queryParams}`);
    };

    return (
        <div className="tender-details-container" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '30px',
                padding: '20px',
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <div>
                    <button
                        onClick={() => navigate(-1)}
                        style={{
                            padding: '8px 16px',
                            background: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            marginBottom: '10px'
                        }}
                    >
                        ← Back
                    </button>
                    <h1 style={{ fontSize: '24px', margin: '10px 0 5px 0', color: '#084f9a' }}>
                        Deviation Analysis
                    </h1>
                    <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                        Bid Number: {tenderId.replace(/_/g, '/')}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {!isEditing ? (
                        <>
                            {hasRepresentation && (
                                <button
                                    onClick={() => navigate(`/Admin/tenderdetails/${encodeURIComponent(tenderId)}/deviation-representation`)}
                                    style={{
                                        padding: '10px 20px',
                                        background: '#0891b2',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: 600
                                    }}
                                >
                                    👁️ View Representation Letter
                                </button>
                            )}
                            <button
                                onClick={openGenerateModal}
                                style={{
                                    padding: '10px 20px',
                                    background: '#6d28d9',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                {hasRepresentation ? '🔄 Regenerate Letter' : '🤖 Generate Deviation Representation Letter'}
                            </button>
                            <button
                                onClick={handleRegenerateDeviation}
                                disabled={regenerating}
                                style={{
                                    padding: '10px 20px',
                                    background: regenerating ? '#9ca3af' : '#7c3aed',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: regenerating ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                {regenerating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                Re-Generate Deviation
                            </button>
                            <button
                                onClick={openMasterList}
                                disabled={masterListLoading}
                                style={{
                                    padding: '10px 20px',
                                    background: masterListLoading ? '#9ca3af' : '#0369a1',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: masterListLoading ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                {masterListLoading ? '⏳ Loading…' : '📊 Edit Master List'}
                            </button>
                            <button
                                onClick={handleExportExcel}
                                disabled={exporting}
                                style={{
                                    padding: '10px 20px',
                                    background: exporting ? '#9ca3af' : '#0d9488',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: exporting ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                {exporting ? '⏳ Exporting…' : '⬇️ Download Excel'}
                            </button>
                            <button
                                onClick={handleImportClick}
                                disabled={importing}
                                style={{
                                    padding: '10px 20px',
                                    background: importing ? '#9ca3af' : '#ca8a04',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: importing ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                {importing ? '⏳ Importing…' : '⬆️ Import Excel'}
                            </button>
                            <input
                                ref={importInputRef}
                                type="file"
                                accept=".xlsx"
                                onChange={handleImportFile}
                                style={{ display: 'none' }}
                            />
                            <button
                                onClick={() => setShowShareModal(true)}
                                style={{
                                    padding: '10px 20px',
                                    background: '#0891b2',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                📧 Share
                            </button>
                            <button
                                onClick={() => setIsEditing(true)}
                                style={{
                                    padding: '10px 20px',
                                    background: '#084f9a',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                ✏️ Edit
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{
                                    padding: '10px 20px',
                                    background: '#22c55e',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                {saving ? 'Saving...' : '💾 Save'}
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={saving}
                                style={{
                                    padding: '10px 20px',
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                ✖️ Cancel
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Content */}
            <div style={{ background: 'white', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                {items.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#666', padding: '40px' }}>No deviation data available.</p>
                ) : (
                    items.map((itemKey, idx) => (
                        <div key={idx} style={{ marginBottom: '40px' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '20px',
                                borderBottom: '2px solid #084f9a',
                                paddingBottom: '10px'
                            }}>
                                <h3 style={{
                                    fontSize: '18px',
                                    color: '#084f9a',
                                    textTransform: 'capitalize',
                                    margin: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                }}>
                                    {itemKey.replace('_', ' ')}
                                    {productCodes[itemKey] && (
                                        <span style={{
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            color: '#6d28d9',
                                            background: '#ede9fe',
                                            border: '1px solid #c4b5fd',
                                            borderRadius: '4px',
                                            padding: '2px 8px',
                                            textTransform: 'none',
                                            letterSpacing: '0.02em',
                                        }}>
                                            {productCodes[itemKey]}
                                        </span>
                                    )}
                                    {relevancyScores[itemKey] != null && (() => {
                                        const score = relevancyScores[itemKey];
                                        const pct   = Math.round(score * 100);
                                        const isHigh = score >= 0.8;
                                        const isMid  = score >= 0.5;
                                        return (
                                            <span style={{
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                color:      isHigh ? '#065f46' : isMid ? '#92400e' : '#991b1b',
                                                background: isHigh ? '#d1fae5' : isMid ? '#fef3c7' : '#fee2e2',
                                                border:     `1px solid ${isHigh ? '#6ee7b7' : isMid ? '#fcd34d' : '#fca5a5'}`,
                                                borderRadius: '4px',
                                                padding: '2px 8px',
                                                textTransform: 'none',
                                            }}>
                                                {pct}% match
                                            </span>
                                        );
                                    })()}
                                </h3>
                                {recalculatingItem === itemKey ? (
                                    <span style={{ fontSize: '13px', color: '#6d28d9', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                                        Recalculating...
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => setActiveSearchItem(itemKey)}
                                        disabled={isEditing || recalculatingItem !== null}
                                        style={{
                                            padding: '6px 12px',
                                            background: (isEditing || recalculatingItem !== null) ? '#d1d5db' : '#f3f4f6',
                                            color: (isEditing || recalculatingItem !== null) ? '#9ca3af' : '#084f9a',
                                            border: '1px solid currentColor',
                                            borderRadius: '4px',
                                            cursor: (isEditing || recalculatingItem !== null) ? 'not-allowed' : 'pointer',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}
                                        title={isEditing ? "Save or cancel edits before changing product" : "Change the suggested product and recalculate deviation"}
                                    >
                                        🔄 Change Product
                                    </button>
                                )}
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="products-table" style={{ minWidth: '100%', width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '18%' }}>Specification</th>
                                            <th style={{ width: '13%' }}>Tender Requirement</th>
                                            <th style={{ width: '13%' }}>Product Offered</th>
                                            <th style={{ width: '12%' }}>Status</th>
                                            <th style={{ width: '24%' }}>Reason</th>
                                            <th style={{ width: '20%' }}>Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {localData[itemKey].map((row, rIdx) => (
                                            <tr key={rIdx} style={row.edited ? { backgroundColor: '#fef3c7' } : {}}>
                                                <td style={{ fontWeight: 500 }}>{row.specification || '-'}</td>
                                                <td>{row.tender_requirement || '-'}</td>
                                                <td>
                                                    {isEditing ? (
                                                        <textarea
                                                            value={row.product_offered || ''}
                                                            onChange={(e) => handleFieldChange(itemKey, rIdx, 'product_offered', e.target.value)}
                                                            placeholder="Product offered..."
                                                            style={{
                                                                width: '100%', padding: '6px', borderRadius: '4px',
                                                                border: '1px solid #d1d5db', fontSize: '13px',
                                                                minHeight: '60px', resize: 'vertical', fontFamily: 'inherit'
                                                            }}
                                                        />
                                                    ) : (
                                                        row.product_offered || '-'
                                                    )}
                                                </td>
                                                <td>
                                                    {isEditing ? (
                                                        <select
                                                            value={row.status || ''}
                                                            onChange={(e) => handleStatusChange(itemKey, rIdx, e.target.value)}
                                                            style={{
                                                                padding: '8px',
                                                                borderRadius: '4px',
                                                                border: '1px solid #d1d5db',
                                                                fontSize: '13px',
                                                                width: '100%'
                                                            }}
                                                        >
                                                            <option value="Complied">Complied</option>
                                                            <option value="Not Complied">Not Complied</option>
                                                            <option value="Not Specified">Not Specified</option>
                                                            <option value="Not Applicable">Not Applicable</option>
                                                        </select>
                                                    ) : (
                                                        <span style={{
                                                            padding: '6px 12px',
                                                            borderRadius: '4px',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            display: 'inline-block',
                                                            backgroundColor:
                                                                row.status === 'Complied' ? '#d1fae5' :
                                                                    row.status === 'Not Specified' ? '#fef3c7' :
                                                                        row.status === 'Not Applicable' ? '#e5e7eb' : '#fee2e2',
                                                            color:
                                                                row.status === 'Complied' ? '#065f46' :
                                                                    row.status === 'Not Specified' ? '#92400e' :
                                                                        row.status === 'Not Applicable' ? '#374151' : '#dc2626'
                                                        }}>
                                                            {row.status || '-'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ fontSize: '13px', color: '#555' }}>
                                                    {isEditing ? (
                                                        <textarea
                                                            value={row.reason || ''}
                                                            onChange={(e) => handleFieldChange(itemKey, rIdx, 'reason', e.target.value)}
                                                            placeholder="Reason / Extra Spec..."
                                                            style={{
                                                                width: '100%', padding: '6px', borderRadius: '4px',
                                                                border: '1px solid #d1d5db', fontSize: '13px',
                                                                minHeight: '60px', resize: 'vertical', fontFamily: 'inherit'
                                                            }}
                                                        />
                                                    ) : (
                                                        row.reason || '-'
                                                    )}
                                                </td>
                                                <td>
                                                    {isEditing ? (
                                                        <textarea
                                                            value={row.remarks || ''}
                                                            onChange={(e) => handleFieldChange(itemKey, rIdx, 'remarks', e.target.value)}
                                                            placeholder="Add remarks..."
                                                            style={{
                                                                width: '100%',
                                                                padding: '8px',
                                                                borderRadius: '4px',
                                                                border: '1px solid #d1d5db',
                                                                fontSize: '13px',
                                                                minHeight: '70px',
                                                                resize: 'vertical',
                                                                fontFamily: 'inherit'
                                                            }}
                                                        />
                                                    ) : (
                                                        <span style={{ fontSize: '13px', color: '#555' }}>
                                                            {row.remarks || '-'}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Selection Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
                    justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{
                        background: 'white', padding: '30px', borderRadius: '8px',
                        width: '400px', maxWidth: '90%', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}>
                        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#084f9a', fontSize: '1.25rem' }}>
                            Select Items for Letter
                        </h2>
                        <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
                            Choose which items to include in the generated representation letter.
                        </p>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px' }}>
                            {items.map(itemKey => (
                                <label key={itemKey} style={{ display: 'flex', alignItems: 'center', margin: '10px 0', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedItems.includes(itemKey)}
                                        onChange={() => handleCheckboxChange(itemKey)}
                                        style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '15px', textTransform: 'capitalize' }}>{itemKey.replace('_', ' ')}</span>
                                </label>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                onClick={() => setShowModal(false)}
                                style={{
                                    padding: '8px 16px', background: '#e5e7eb', color: '#374151',
                                    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleGenerateWithSelected}
                                disabled={selectedItems.length === 0}
                                style={{
                                    padding: '8px 16px', background: '#084f9a', color: 'white',
                                    border: 'none', borderRadius: '4px', cursor: selectedItems.length === 0 ? 'not-allowed' : 'pointer',
                                    fontWeight: 600, opacity: selectedItems.length === 0 ? 0.5 : 1
                                }}
                            >
                                Generate Letter
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Share Deviation Modal */}
            {showShareModal && (
                <ShareDeviationModal
                    tenderId={tenderId}
                    onClose={() => setShowShareModal(false)}
                />
            )}

            {/* Product Search Modal */}
            {activeSearchItem && (
                <ProductSearchModal
                    onClose={() => setActiveSearchItem(null)}
                    onSelect={handleRecalculate}
                    bidNumber={tenderId.replace(/_/g, '/')}
                />
            )}

            {/* Master List (Excel-style bulk edit / delete) */}
            {showMasterList && (
                <MasterProductListModal
                    bidNumber={tenderId.replace(/_/g, '/')}
                    products={masterListProducts}
                    onClose={() => setShowMasterList(false)}
                    onSaved={() => fetchDeviations()}
                />
            )}
        </div>
    );
};

export default DeviationPage;

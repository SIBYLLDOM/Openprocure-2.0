import React, { useState } from 'react';

// Deviation Modal Component
const DeviationModal = ({ data, productCodes = {}, onClose, bidNumber }) => {
    const [isEditing, setIsEditing] = useState(false);

    // Add original_status tracking for inline edits
    const getInitialData = () => {
        const initData = JSON.parse(JSON.stringify(data || {}));
        Object.keys(initData).forEach(key => {
            initData[key].forEach(row => {
                row.original_status = row.status || 'Not Specified';
            });
        });
        return initData;
    };

    const [localData, setLocalData] = useState(getInitialData());
    const [saving, setSaving] = useState(false);

    if (!data) return null;

    // Extract all items (item_1, item_2, etc.)
    const items = Object.keys(localData).filter(key => key.startsWith('item_'));

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

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    const handleSave = async () => {
        console.log('Saving deviation data:', localData);
        setSaving(true);

        try {
            const token = localStorage.getItem('token');
            const cleanBidNumber = bidNumber.replace(/_/g, '/');

            // 1. Process inline edits for specified products (sent to 8082)
            const editPromises = [];
            Object.keys(localData).forEach(itemKey => {
                const pCode = productCodes[itemKey];
                localData[itemKey].forEach(row => {
                    if (row.original_status === 'Not Specified' && row.status !== 'Not Specified' && row.edited && pCode) {
                        editPromises.push(
                            fetch('http://localhost:8082/edit', {
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
                            }).catch(e => console.error("Inline edit trigger failed in modal", e))
                        );
                    }
                });
            });

            await Promise.all(editPromises);

            // 2. Save the deviation data back to the primary DB
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

            const result = await response.json();

            if (result.success) {
                // Update tracking original_status
                const updatedData = JSON.parse(JSON.stringify(localData));
                Object.keys(updatedData).forEach(key => {
                    updatedData[key].forEach(row => {
                        row.original_status = row.status;
                        row.edited = false;
                    });
                });
                setLocalData(updatedData);
                setIsEditing(false);
                alert('✅ Deviation data saved successfully!');
            } else {
                alert('❌ Failed to save deviation data');
            }
        } catch (err) {
            console.error('Error in handleSave:', err);
            alert('❌ Error saving deviation data');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setLocalData(getInitialData()); // Reset to original
        setIsEditing(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1001 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '1200px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Deviation Analysis - {bidNumber.replace(/_/g, '/')}</h2>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {!isEditing ? (
                            <button
                                onClick={() => setIsEditing(true)}
                                style={{
                                    padding: '8px 16px',
                                    background: '#084f9a',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                ✏️ Edit
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    style={{
                                        padding: '8px 16px',
                                        background: '#22c55e',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: saving ? 'not-allowed' : 'pointer',
                                        fontSize: '14px'
                                    }}
                                >
                                    {saving ? 'Saving...' : '💾 Save'}
                                </button>
                                <button
                                    onClick={handleCancel}
                                    disabled={saving}
                                    style={{
                                        padding: '8px 16px',
                                        background: '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: saving ? 'not-allowed' : 'pointer',
                                        fontSize: '14px'
                                    }}
                                >
                                    ✖️ Cancel
                                </button>
                            </>
                        )}
                        <button className="modal-close" onClick={onClose}>×</button>
                    </div>
                </div>

                <div className="modal-body" style={{ overflowY: 'auto', padding: '20px' }}>
                    {items.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#666' }}>No deviation data available.</p>
                    ) : (
                        items.map((itemKey, idx) => (
                            <div key={idx} style={{ marginBottom: '30px' }}>
                                <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#084f9a', textTransform: 'capitalize' }}>
                                    {itemKey.replace('_', ' ')}
                                </h3>
                                <div className="products-table-wrapper" style={{ overflowX: 'auto' }}>
                                    <table className="products-table" style={{ minWidth: '100%' }}>
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
                                                                value={row.status || 'Complied'}
                                                                onChange={(e) => handleStatusChange(itemKey, rIdx, e.target.value)}
                                                                style={{
                                                                    padding: '6px',
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
                                                                padding: '4px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '12px',
                                                                fontWeight: 600,
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
                                                                    padding: '6px',
                                                                    borderRadius: '4px',
                                                                    border: '1px solid #d1d5db',
                                                                    fontSize: '13px',
                                                                    minHeight: '60px',
                                                                    resize: 'vertical'
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
            </div>
        </div>
    );
};

export default DeviationModal;

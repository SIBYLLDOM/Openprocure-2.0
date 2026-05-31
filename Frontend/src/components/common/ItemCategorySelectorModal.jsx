import React from 'react';

const ItemCategorySelectorModal = ({ itemCategories, onSelect, onClose }) => {
    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1001 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Select Item Category</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body" style={{ overflowY: 'auto', padding: '20px' }}>
                    <p style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
                        This tender has multiple item categories. Please select which category you want to add products for:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {itemCategories.map((category, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    onSelect(category);
                                    onClose();
                                }}
                                style={{
                                    padding: '16px 20px',
                                    background: 'white',
                                    border: '2px solid #e5e7eb',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '15px',
                                    fontWeight: '500',
                                    textAlign: 'left',
                                    transition: 'all 0.2s',
                                    color: '#333'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.borderColor = '#084f9a';
                                    e.target.style.background = '#f0f9ff';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.borderColor = '#e5e7eb';
                                    e.target.style.background = 'white';
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: '#084f9a',
                                        flexShrink: 0
                                    }}></span>
                                    <span>{category}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn-cancel" style={{ width: '100%', background: '#6c757d', color: 'white' }}>Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default ItemCategorySelectorModal;

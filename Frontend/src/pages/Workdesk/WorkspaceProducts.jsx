import React, { useState, useEffect, useCallback } from 'react';
import { Package, Plus, Trash2, Save, ShoppingCart, Pencil, Check, X } from 'lucide-react';
import ProductSearchModal from '../../components/common/ProductSearchModal';

const DOC_TAGS = ['MSC', 'CE', 'NCC'];

const WorkspaceProducts = ({ tenderId }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [detectedCategory, setDetectedCategory] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [docFlags, setDocFlags] = useState({}); // brand -> { MSC, CE, NCC }
    const [editingIndex, setEditingIndex] = useState(null);
    const [editDraft, setEditDraft] = useState(null);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
    const cleanBidNumber = tenderId.replace(/_/g, '/');
    const token = localStorage.getItem('token');

    let currentUser = null;
    try { currentUser = JSON.parse(localStorage.getItem('user')); } catch { /* ignore */ }
    const canDelete = currentUser?.role === 'Admin' || currentUser?.role === 'Tender Admin' || currentUser?.role === 'Office Administrator';

    useEffect(() => {
        fetchProducts();
    }, [tenderId]);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const response = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/suggestions`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await response.json();

            if (data.success) {
                const list = data.data || [];
                setProducts(list);
                setDetectedCategory(data.detected_category);
                setSelectedProduct(data.selected_product);
                loadDocFlags(list);
            }
        } catch (err) {
            console.error('Error fetching products:', err);
        } finally {
            setLoading(false);
        }
    };

    // For every distinct brand in the product list, look up which MSC/CE/NCC
    // certs already exist in the Library, then auto-push whatever's found
    // into this tender's My Documents so it doesn't have to be done by hand.
    const loadDocFlags = async (list) => {
        const brands = [...new Set(list.map(p => p.brand).filter(Boolean))];
        if (!brands.length) return;

        const flags = {};
        const fileIdsToPush = new Set();

        await Promise.all(brands.map(async (brand) => {
            try {
                const res = await fetch(`${API_BASE_URL}/library/brand-docs?brand=${encodeURIComponent(brand)}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    flags[brand] = data.docs;
                    DOC_TAGS.forEach(tag => {
                        if (data.docs[tag]?.id) fileIdsToPush.add(data.docs[tag].id);
                    });
                }
            } catch (err) {
                console.error(`Error looking up docs for brand ${brand}:`, err);
            }
        }));

        setDocFlags(flags);

        if (fileIdsToPush.size) {
            fetch(`${API_BASE_URL}/doc-prep/${encodeURIComponent(cleanBidNumber)}/import-from-library`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ fileIds: [...fileIdsToPush] })
            }).catch(err => console.error('Error auto-pushing brand docs to My Documents:', err));
        }
    };

    const handleAddProduct = (product) => {
        const nextSerial = products.reduce((max, p) => Math.max(max, p.serial_no || 0), 0) + 1;
        const added = { ...product, serial_no: product.serial_no || nextSerial };
        const updated = [...products, added];
        setProducts(updated);
        setShowSearch(false);
        loadDocFlags(updated);
    };

    const handleRemoveProduct = (index) => {
        const updated = [...products];
        updated.splice(index, 1);
        setProducts(updated);
    };

    const startEdit = (index) => {
        setEditingIndex(index);
        setEditDraft({ ...products[index] });
    };

    const cancelEdit = () => {
        setEditingIndex(null);
        setEditDraft(null);
    };

    const saveEdit = (index) => {
        const updated = [...products];
        updated[index] = editDraft;
        setProducts(updated);
        setEditingIndex(null);
        setEditDraft(null);
        loadDocFlags(updated);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/suggestions`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ products: products })
            });
            const data = await res.json();

            if (data.success) {
                alert('Products saved successfully!');
            } else {
                alert('Failed to save products');
            }
        } catch (e) {
            console.error(e);
            alert('Error saving products');
        } finally {
            setSaving(false);
        }
    };

    const th = { padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' };
    const td = { padding: '1rem', color: '#334155', verticalAlign: 'top' };
    const editInput = { width: '100%', padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem', boxSizing: 'border-box' };

    return (
        <div style={{ background: '#f3f6fb', minHeight: '100vh', padding: '2rem' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: '700', color: '#1f2937', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <ShoppingCart size={32} color="#2563eb" />
                            Quoted Products
                        </h1>
                        <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
                            {detectedCategory ? `Detected Category: ${detectedCategory}` : 'Manage products for this tender'}
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={() => setShowSearch(true)}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: 'white',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                color: '#374151',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Plus size={18} /> Add Product
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: '#2563eb',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                opacity: saving ? 0.7 : 1
                            }}
                        >
                            <Save size={18} /> {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>

                {/* Product List */}
                <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading products...</div>
                    ) : products.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center' }}>
                            <Package size={48} color="#e5e7eb" style={{ marginBottom: '1rem' }} />
                            <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>No products added yet.</p>
                            <button
                                onClick={() => setShowSearch(true)}
                                style={{ marginTop: '1rem', color: '#2563eb', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                            >
                                + Add your first product
                            </button>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                    <th style={{ ...th, width: '4%' }}>S.No</th>
                                    <th style={{ ...th, width: '10%' }}>Product Code</th>
                                    <th style={{ ...th, width: '10%' }}>Brand</th>
                                    <th style={{ ...th, width: '16%' }}>Product Name</th>
                                    <th style={{ ...th, width: '22%' }}>Technical Specification</th>
                                    <th style={{ ...th, width: '12%' }}>Files</th>
                                    <th style={{ ...th, width: '9%' }}>Relevancy</th>
                                    <th style={{ ...th, width: '10%', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product, index) => {
                                    const isSelected = selectedProduct && ((product.product_code && product.product_code === selectedProduct.product_code) || product.title === selectedProduct.title);
                                    const isEditing = editingIndex === index;
                                    const docs = docFlags[product.brand] || {};

                                    if (isEditing) {
                                        return (
                                            <tr key={index} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: '#fffbeb' }}>
                                                <td style={td}>{product.serial_no ?? index + 1}</td>
                                                <td style={td}>
                                                    <input style={editInput} value={editDraft.product_code || ''}
                                                        onChange={e => setEditDraft({ ...editDraft, product_code: e.target.value })} />
                                                </td>
                                                <td style={td}>
                                                    <input style={editInput} value={editDraft.brand || ''}
                                                        onChange={e => setEditDraft({ ...editDraft, brand: e.target.value })} />
                                                </td>
                                                <td style={td}>
                                                    <input style={editInput} value={editDraft.title || ''}
                                                        onChange={e => setEditDraft({ ...editDraft, title: e.target.value })} />
                                                </td>
                                                <td style={td}>
                                                    <textarea style={{ ...editInput, minHeight: '60px' }} value={editDraft.specification || ''}
                                                        onChange={e => setEditDraft({ ...editDraft, specification: e.target.value })} />
                                                </td>
                                                <td style={{ ...td, fontSize: '0.8rem', color: '#94a3b8' }}>auto-matched</td>
                                                <td style={td}>{((editDraft.relevancy_score || 0) * 100).toFixed(1)}%</td>
                                                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <button onClick={() => saveEdit(index)} title="Save"
                                                        style={{ padding: '0.5rem', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                        <Check size={18} />
                                                    </button>
                                                    <button onClick={cancelEdit} title="Cancel"
                                                        style={{ padding: '0.5rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                        <X size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return (
                                        <tr key={index} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isSelected ? '#f0fdf4' : 'transparent' }}>
                                            <td style={{ ...td, fontWeight: 500 }}>{product.serial_no ?? index + 1}</td>
                                            <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{product.product_code || '-'}</td>
                                            <td style={td}>{product.brand || '-'}</td>
                                            <td style={td}>
                                                {product.title}
                                                {isSelected && (
                                                    <span style={{
                                                        marginLeft: '0.5rem',
                                                        backgroundColor: '#22c55e',
                                                        color: '#ffffff',
                                                        padding: '0.15rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        border: '1px solid #16a34a'
                                                    }}>
                                                        ✓ SELECTED
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ ...td, fontSize: '0.9rem', lineHeight: '1.4' }}>
                                                {product.specification || product.tender_item_name}
                                            </td>
                                            <td style={td}>
                                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                    {DOC_TAGS.map(tag => {
                                                        const found = !!docs[tag]?.id;
                                                        return (
                                                            <span key={tag} title={docs[tag]?.name || `${tag}: not found in library`} style={{
                                                                padding: '0.2rem 0.5rem',
                                                                borderRadius: '999px',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700,
                                                                backgroundColor: found ? '#dcfce7' : '#f1f5f9',
                                                                color: found ? '#166534' : '#94a3b8',
                                                                border: `1px solid ${found ? '#86efac' : '#e2e8f0'}`
                                                            }}>
                                                                {found ? '✓ ' : ''}{tag}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td style={td}>
                                                <span style={{
                                                    backgroundColor: product.relevancy_score > 0.8 ? '#dcfce7' : '#e0f2fe',
                                                    color: product.relevancy_score > 0.8 ? '#166534' : '#0369a1',
                                                    padding: '0.25rem 0.6rem',
                                                    borderRadius: '999px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600
                                                }}>
                                                    {((product.relevancy_score || 0) * 100).toFixed(1)}%
                                                </span>
                                            </td>
                                            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <button
                                                    onClick={() => startEdit(index)}
                                                    title="Edit"
                                                    style={{ padding: '0.5rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                                                >
                                                    <Pencil size={18} />
                                                </button>
                                                {canDelete && (
                                                    <button
                                                        onClick={() => handleRemoveProduct(index)}
                                                        title="Delete"
                                                        style={{ padding: '0.5rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {showSearch && (
                <ProductSearchModal
                    onClose={() => setShowSearch(false)}
                    onSelect={handleAddProduct}
                />
            )}
        </div>
    );
};

export default WorkspaceProducts;

import React, { useState, useEffect } from 'react';
import { Package, Search, Plus, Trash2, Save, ShoppingCart } from 'lucide-react';
import ProductSearchModal from '../../components/common/ProductSearchModal';

const WorkspaceProducts = ({ tenderId }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [detectedCategory, setDetectedCategory] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    useEffect(() => {
        fetchProducts();
    }, [tenderId]);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            // Use the same endpoint as suggestions to get the "Quoted Products" list
            const response = await fetch(
                `${API_BASE_URL}/tenders/${encodeURIComponent(tenderId.replace(/_/g, '/'))}/suggestions`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            const data = await response.json();

            if (data.success) {
                setProducts(data.data || []);
                setDetectedCategory(data.detected_category);
                setSelectedProduct(data.selected_product);
            }
        } catch (err) {
            console.error('Error fetching products:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddProduct = (product) => {
        setProducts([...products, product]);
        setShowSearch(false);
    };

    const handleRemoveProduct = (index) => {
        const updated = [...products];
        updated.splice(index, 1);
        setProducts(updated);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const cleanBidNumber = tenderId.replace(/_/g, '/');

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

    return (
        <div style={{ background: '#f3f6fb', minHeight: '100vh', padding: '2rem' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

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
                <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
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
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Product Code</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Type / Category</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Title</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Relevancy</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.9rem', width: '30%' }}>Specification</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.9rem', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product, index) => {
                                    const isSelected = selectedProduct && ((product.product_code && product.product_code === selectedProduct.product_code) || product.title === selectedProduct.title);
                                    return (
                                        <tr key={index} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isSelected ? '#f0fdf4' : 'transparent' }}>
                                            <td style={{ padding: '1rem', fontWeight: 500, color: '#1e293b' }}>{product.product_code || '-'}</td>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ fontWeight: 500, color: '#334155' }}>{product.type}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{product.category}</div>
                                            </td>
                                            <td style={{ padding: '1rem', color: '#334155' }}>{product.title}</td>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <span style={{
                                                        backgroundColor: product.relevancy > 0.8 ? '#dcfce7' : '#e0f2fe',
                                                        color: product.relevancy > 0.8 ? '#166534' : '#0369a1',
                                                        padding: '0.25rem 0.6rem',
                                                        borderRadius: '999px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 600
                                                    }}>
                                                        {(product.raw_score * 100).toFixed(1)}%
                                                    </span>
                                                    {selectedProduct && ((product.product_code && product.product_code === selectedProduct.product_code) || product.title === selectedProduct.title) && (
                                                        <span style={{
                                                            backgroundColor: '#22c55e',
                                                            color: '#ffffff',
                                                            padding: '0.25rem 0.6rem',
                                                            borderRadius: '4px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            border: '1px solid #16a34a'
                                                        }}>
                                                            ✓ SELECTED
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem', fontSize: '0.9rem', color: '#475569', lineHeight: '1.4' }}>
                                                {product.specification}
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleRemoveProduct(index)}
                                                    style={{ padding: '0.5rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                                                    onMouseEnter={(e) => e.target.style.background = '#fee2e2'}
                                                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                                >
                                                    <Trash2 size={18} />
                                                </button>
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

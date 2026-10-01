import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const ProductSearchModal = ({ onClose, onSelect, itemCategory }) => {
    const [query, setQuery] = useState('');
    const [department, setDepartment] = useState('all');
    const [category, setCategory] = useState('all');
    const [allProducts, setAllProducts] = useState([]);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [availableCategories, setAvailableCategories] = useState([]);

    const departments = [
        { value: 'all', label: 'All Departments' },
        { value: 'endo', label: 'Endo' },
        { value: 'diagnostic', label: 'Diagnostic' },
        { value: 'analyser', label: 'Analyser' },
        { value: 'rapid_elisa', label: 'Rapid ELISA' },
        { value: 'reagents', label: 'Reagents' },
        { value: 'system_packs', label: 'System Packs' }
    ];

    // Sanitize product data to handle NaN and other invalid JSON values
    const sanitizeProductData = (products) => {
        if (!Array.isArray(products)) return [];

        return products.map(product => {
            const sanitized = {};
            for (const [key, value] of Object.entries(product)) {
                // Replace NaN, Infinity, and undefined with null or empty string
                if (typeof value === 'number' && !isFinite(value)) {
                    sanitized[key] = null;
                } else if (value === undefined) {
                    sanitized[key] = '';
                } else {
                    sanitized[key] = value;
                }
            }
            return sanitized;
        });
    };

    // When department changes: load subcategories from DB, then load products
    useEffect(() => {
        setCategory('all');
        setAvailableCategories([]);
        loadDbCategories(department);
        if (!query.trim()) fetchProducts('', department);
    }, [department]);

    const loadDbCategories = async (dept) => {
        if (dept === 'all') return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(
                `${API_BASE}/product-categories?dept=${dept}&limit=200`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const j = await res.json();
            if (j.success && j.data.length > 0) {
                // Perfect first, then Open
                const perfect = j.data.filter(r => r.category === 'Perfect').map(r => r.keywords);
                const open    = j.data.filter(r => r.category === 'Open').map(r => r.keywords);
                setAvailableCategories([...perfect, ...open]);
            }
        } catch (_) {}
    };

    // Apply category filter whenever the loaded product set or the filter changes
    useEffect(() => {
        const filtered = category === 'all' ? allProducts : allProducts.filter(p => (p.category || p.type) === category);
        setResults(filtered);
    }, [category, allProducts]);

    // Local product catalogue, served by our own backend (backend/src/asset/products) —
    // no dependency on any external product service.
    const fetchProducts = async (q, dept) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (dept && dept !== 'all') params.set('dept', dept);

            const res = await fetch(`${API_BASE}/tenders/products/search?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error(`Failed to fetch products (HTTP ${res.status})`);
            }

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || 'Failed to fetch products');
            }

            const sanitizedData = sanitizeProductData(data.data || []);
            setAllProducts(sanitizedData);

            // Only populate subcategories from product data when no DB-driven list was loaded
            if (availableCategories.length === 0) {
                const categories = [...new Set(sanitizedData.map(p => p.category || p.type).filter(Boolean))];
                setAvailableCategories(categories);
            }
        } catch (err) {
            console.error("Failed to load products:", err);
            setError(err.message);
            setAllProducts([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        fetchProducts(query.trim(), department);
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1002 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', height: '600px', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <div>
                        <h2>Add Product</h2>
                        {itemCategory && (
                            <div style={{ fontSize: '13px', color: '#084f9a', marginTop: '4px', fontWeight: '500' }}>
                                For: {itemCategory}
                            </div>
                        )}
                    </div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {/* Search and Filter Controls */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                        <select
                            value={department}
                            onChange={e => setDepartment(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                background: 'white',
                                cursor: 'pointer',
                                minWidth: '150px'
                            }}
                        >
                            {departments.map(dept => (
                                <option key={dept.value} value={dept.value}>
                                    {dept.label}
                                </option>
                            ))}
                        </select>
                        <select
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                background: 'white',
                                cursor: 'pointer',
                                minWidth: '150px'
                            }}
                            disabled={availableCategories.length === 0}
                        >
                            <option value="all">All Categories</option>
                            {availableCategories.map(cat => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search by code, title or type..."
                            style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '200px' }}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        />
                        <button
                            onClick={handleSearch}
                            style={{ padding: '8px 16px', background: '#084f9a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            {query.trim() ? 'Search' : 'Browse All'}
                        </button>
                    </div>

                    {/* Results Count */}
                    {!loading && results.length > 0 && (
                        <div style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
                            Found {results.length} product{results.length !== 1 ? 's' : ''}
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div style={{ padding: '10px', background: '#fee2e2', color: '#dc2626', borderRadius: '4px', marginBottom: '10px', fontSize: '13px' }}>
                            ⚠️ {error}
                        </div>
                    )}
                    {/* Results Table */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <div className="spinner"></div>
                                <p style={{ marginTop: '10px', color: '#666' }}>Loading products...</p>
                            </div>
                        ) : results.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <p style={{ color: '#666', fontSize: '14px' }}>
                                    {error ? 'Unable to load products. Please try again.' :
                                        query ? 'No products found matching your search.' :
                                            'Select a department to browse products.'}
                                </p>
                            </div>
                        ) : (
                            <table className="products-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', fontSize: '13px' }}>Category</th>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', fontSize: '13px' }}>Title</th>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', fontSize: '13px' }}>Product Code</th>
                                        <th style={{ padding: '10px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((p, i) => (
                                        <tr
                                            key={i}
                                            style={{
                                                borderBottom: '1px solid #e5e7eb',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f8f9fa'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '10px', fontSize: '13px' }}>
                                                <div style={{ fontWeight: 500 }}>{p.category || p.type || ''}</div>
                                                <div style={{ fontSize: '11px', color: '#666' }}>{p.brand || ''}</div>
                                            </td>
                                            <td style={{ padding: '10px', fontSize: '13px' }}>
                                                <div style={{ fontWeight: 500 }}>{p.product_name || p.instrument_name || ''}</div>
                                                <div style={{ fontSize: '11px', color: '#666' }}>{p.description || ''}</div>
                                            </td>
                                            <td style={{ padding: '10px', fontSize: '13px', fontWeight: '500' }}>
                                                {p.item_code || p.product_code || ''}
                                            </td>
                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => onSelect(p)}
                                                    style={{
                                                        padding: '6px 16px',
                                                        background: '#28a745',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '13px',
                                                        fontWeight: '500'
                                                    }}
                                                    onMouseOver={(e) => e.target.style.background = '#218838'}
                                                    onMouseOut={(e) => e.target.style.background = '#28a745'}
                                                >
                                                    Add
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductSearchModal;

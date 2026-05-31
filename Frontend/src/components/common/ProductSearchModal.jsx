import React, { useState, useEffect } from 'react';

const ProductSearchModal = ({ onClose, onSelect, itemCategory }) => {
    const [query, setQuery] = useState('');
    const [department, setDepartment] = useState('all');
    const [category, setCategory] = useState('all');
    const [allProducts, setAllProducts] = useState([]);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [availableCategories, setAvailableCategories] = useState([]);

    const PRODUCT_API_BASE = 'https://products.openprocure.ai';

    const departments = [
        { value: 'all', label: 'All Departments', endpoint: '/all' },
        { value: 'endo', label: 'Endo', endpoint: '/endo' },
        { value: 'analyser', label: 'Analyser', endpoint: '/analyser' },
        { value: 'rapid_elisa', label: 'Rapid ELISA', endpoint: '/rapid_elisa' },
        { value: 'reagents', label: 'Reagents', endpoint: '/reagents' },
        { value: 'system_packs', label: 'System Packs', endpoint: '/system_packs' }
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

    // Load all products from selected department on mount or department change
    useEffect(() => {
        setCategory('all'); // Reset category when department changes
        if (!query.trim()) {
            loadDepartmentProducts();
        }
    }, [department]);

    // Apply category filter when category changes
    useEffect(() => {
        if (allProducts.length > 0) {
            const filtered = category === 'all' ? allProducts : allProducts.filter(p => (p.category || p.type) === category);
            setResults(filtered);
        }
    }, [category]);

    const loadDepartmentProducts = async () => {
        setLoading(true);
        setError(null);
        try {
            const selectedDept = departments.find(d => d.value === department);
            const res = await fetch(`${PRODUCT_API_BASE}${selectedDept.endpoint}`);

            if (!res.ok) {
                throw new Error(`Failed to fetch products (HTTP ${res.status})`);
            }

            const data = await res.json();

            // Handle different response structures
            let products = [];
            if (department === 'all') {
                // For /all endpoint, flatten all departments
                if (data.departments) {
                    Object.values(data.departments).forEach(deptProducts => {
                        if (Array.isArray(deptProducts)) {
                            products = products.concat(deptProducts);
                        }
                    });
                }
            } else {
                // For specific department endpoints
                products = data.products || [];
            }

            const sanitizedData = sanitizeProductData(products);
            setAllProducts(sanitizedData);

            // Extract unique categories
            const categories = [...new Set(sanitizedData.map(p => p.category || p.type).filter(Boolean))];
            setAvailableCategories(categories);

            // Apply category filter if selected
            const filtered = category === 'all' ? sanitizedData : sanitizedData.filter(p => (p.category || p.type) === category);
            setResults(filtered);
        } catch (err) {
            console.error("Failed to load products:", err);
            setError(err.message);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!query.trim()) {
            loadDepartmentProducts();
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const deptParam = department === 'all' ? '' : department;
            const searchUrl = `${PRODUCT_API_BASE}/search?q=${encodeURIComponent(query)}${deptParam ? `&dept=${deptParam}` : ''}`;
            const res = await fetch(searchUrl);

            if (!res.ok) {
                throw new Error(`Search failed (HTTP ${res.status})`);
            }

            const data = await res.json();

            // Extract products from search results
            const products = (data.results || []).map(result => result.product);
            const sanitizedData = sanitizeProductData(products);
            setAllProducts(sanitizedData);

            // Extract unique categories
            const categories = [...new Set(sanitizedData.map(p => p.category || p.type).filter(Boolean))];
            setAvailableCategories(categories);

            // Apply category filter if selected
            const filtered = category === 'all' ? sanitizedData : sanitizedData.filter(p => (p.category || p.type) === category);
            setResults(filtered);
        } catch (err) {
            console.error("Search failed:", err);
            setError(err.message);
            setResults([]);
        } finally {
            setLoading(false);
        }
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

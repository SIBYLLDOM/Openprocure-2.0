import React, { useState, useEffect } from 'react';

const ZONES = ['North', 'South', 'East', 'West'];

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
    'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const EMPTY_FORM = { name: '', email_id: '', emp_id: '', role: 'Leader', zone: '', state: '' };

const FieldTeamManagement = () => {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
    const token = () => localStorage.getItem('token');

    const [activeTab, setActiveTab] = useState('Leader');
    const [members, setMembers] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingEmpId, setEditingEmpId] = useState(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    useEffect(() => {
        fetchMembers();
    }, []);

    const fetchMembers = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/prebid/zone-members`, {
                headers: { Authorization: `Bearer ${token()}` }
            });
            const data = await res.json();
            if (data.success) setMembers(data.members);
        } catch (e) {
            console.error('Error fetching members:', e);
        } finally {
            setLoading(false);
        }
    };

    const openAddModal = () => {
        setEditingEmpId(null);
        setForm({ ...EMPTY_FORM, role: activeTab });
        setFormError('');
        setShowModal(true);
    };

    const openEditModal = (member) => {
        setEditingEmpId(member.emp_id);
        setForm({
            name: member.name || '',
            email_id: member.email_id || '',
            emp_id: member.emp_id || '',
            role: member.role || 'Leader',
            zone: member.zone || '',
            state: member.state || '',
        });
        setFormError('');
        setShowModal(true);
    };

    const handleDelete = async (emp_id, name) => {
        if (!window.confirm(`Remove "${name}" from the field team?`)) return;
        try {
            const res = await fetch(`${API_BASE}/prebid/zone-members/${encodeURIComponent(emp_id)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token()}` }
            });
            const data = await res.json();
            if (data.success) {
                setMembers(prev => prev.filter(m => m.emp_id !== emp_id));
            } else {
                alert('❌ ' + (data.message || 'Failed to delete.'));
            }
        } catch (e) {
            alert('❌ Error deleting member.');
        }
    };

    const handleSave = async () => {
        setFormError('');
        if (!form.name.trim() || !form.email_id.trim() || !form.emp_id.trim() || !form.zone.trim()) {
            setFormError('Name, Email, Emp ID, and Zone are required.');
            return;
        }
        if (form.role === 'FLSP' && !form.state.trim()) {
            setFormError('State is required for FLSP.');
            return;
        }

        setSaving(true);
        try {
            const isEdit = !!editingEmpId;
            const url = isEdit
                ? `${API_BASE}/prebid/zone-members/${encodeURIComponent(editingEmpId)}`
                : `${API_BASE}/prebid/zone-members`;
            const res = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token()}`
                },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (data.success) {
                setShowModal(false);
                fetchMembers();
            } else {
                setFormError(data.message || 'Failed to save.');
            }
        } catch (e) {
            setFormError('Error saving. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const filtered = members.filter(m => {
        if (m.role !== activeTab) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (m.name || '').toLowerCase().includes(q)
            || (m.email_id || '').toLowerCase().includes(q)
            || (m.emp_id || '').toLowerCase().includes(q)
            || (m.zone || '').toLowerCase().includes(q)
            || (m.state || '').toLowerCase().includes(q);
    });

    const tabStyle = (tab) => ({
        padding: '10px 24px',
        border: 'none',
        borderBottom: activeTab === tab ? '3px solid #084f9a' : '3px solid transparent',
        background: 'none',
        fontWeight: activeTab === tab ? 700 : 500,
        color: activeTab === tab ? '#084f9a' : '#6b7280',
        cursor: 'pointer',
        fontSize: '14px',
        transition: 'all 0.15s',
    });

    const inputStyle = {
        width: '100%', padding: '9px 12px', borderRadius: '6px',
        border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box',
    };

    return (
        <div style={{ padding: '28px', maxWidth: '1100px', margin: '0 auto' }}>
            {/* Page header */}
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#111827' }}>Field Team Management</h1>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                    Manage Zonal Managers and FLSP personnel for pre-bid and deviation workflows.
                </p>
            </div>

            {/* Card */}
            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

                {/* Tabs + toolbar */}
                <div style={{ borderBottom: '1px solid #e5e7eb', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <button style={tabStyle('Leader')} onClick={() => setActiveTab('Leader')}>
                            Zonal Managers
                            <span style={{ marginLeft: '8px', background: activeTab === 'Leader' ? '#dbeafe' : '#f3f4f6', color: activeTab === 'Leader' ? '#1d4ed8' : '#6b7280', borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: 700 }}>
                                {members.filter(m => m.role === 'Leader').length}
                            </span>
                        </button>
                        <button style={tabStyle('FLSP')} onClick={() => setActiveTab('FLSP')}>
                            FLSP
                            <span style={{ marginLeft: '8px', background: activeTab === 'FLSP' ? '#dbeafe' : '#f3f4f6', color: activeTab === 'FLSP' ? '#1d4ed8' : '#6b7280', borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: 700 }}>
                                {members.filter(m => m.role === 'FLSP').length}
                            </span>
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', width: '200px' }}
                        />
                        <button
                            onClick={openAddModal}
                            style={{ padding: '8px 18px', background: '#084f9a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                        >
                            + Add {activeTab === 'Leader' ? 'Zonal Manager' : 'FLSP'}
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                    {loading ? (
                        <p style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading…</p>
                    ) : filtered.length === 0 ? (
                        <p style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                            No {activeTab === 'Leader' ? 'Zonal Managers' : 'FLSPs'} found.
                        </p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Emp ID</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Email</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Zone</th>
                                    {activeTab === 'FLSP' && (
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>State</th>
                                    )}
                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((m, idx) => (
                                    <tr key={m.emp_id} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ padding: '12px 16px', color: '#6b7280', fontFamily: 'monospace', fontSize: '13px' }}>{m.emp_id}</td>
                                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>{m.name}</td>
                                        <td style={{ padding: '12px 16px', color: '#374151' }}>{m.email_id}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 600 }}>
                                                {m.zone}
                                            </span>
                                        </td>
                                        {activeTab === 'FLSP' && (
                                            <td style={{ padding: '12px 16px', color: '#374151' }}>{m.state || '—'}</td>
                                        )}
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => openEditModal(m)}
                                                style={{ padding: '5px 12px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, marginRight: '8px' }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(m.emp_id, m.name)}
                                                style={{ padding: '5px 12px', background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Add / Edit Modal */}
            {showModal && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
                    onClick={() => setShowModal(false)}
                >
                    <div
                        style={{ background: '#fff', borderRadius: '12px', width: '460px', maxWidth: '95%', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', padding: '28px' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>
                                {editingEmpId ? 'Edit' : 'Add'} {form.role === 'Leader' ? 'Zonal Manager' : 'FLSP'}
                            </h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Role toggle (only when adding) */}
                            {!editingEmpId && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Role</label>
                                    <div style={{ display: 'flex', gap: '0', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden' }}>
                                        {['Leader', 'FLSP'].map(r => (
                                            <button
                                                key={r}
                                                onClick={() => setForm(f => ({ ...f, role: r, state: '' }))}
                                                style={{
                                                    flex: 1, padding: '9px', border: 'none',
                                                    background: form.role === r ? '#084f9a' : '#f9fafb',
                                                    color: form.role === r ? '#fff' : '#374151',
                                                    fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                                                }}
                                            >
                                                {r === 'Leader' ? 'Zonal Manager' : 'FLSP'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Full Name *</label>
                                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Rajesh Kumar" />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Email ID *</label>
                                <input style={inputStyle} type="email" value={form.email_id} onChange={e => setForm(f => ({ ...f, email_id: e.target.value }))} placeholder="employee@meril.com" />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Employee ID *</label>
                                <input
                                    style={{ ...inputStyle, background: editingEmpId ? '#f9fafb' : '#fff' }}
                                    value={form.emp_id}
                                    onChange={e => setForm(f => ({ ...f, emp_id: e.target.value }))}
                                    placeholder="e.g. EMP001"
                                    disabled={!!editingEmpId}
                                />
                                {editingEmpId && <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9ca3af' }}>Employee ID cannot be changed.</p>}
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Zone *</label>
                                <select style={inputStyle} value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value, state: '' }))}>
                                    <option value="">— Select Zone —</option>
                                    {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                                </select>
                            </div>

                            {form.role === 'FLSP' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>State *</label>
                                    <select style={inputStyle} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} disabled={!form.zone}>
                                        <option value="">— Select State —</option>
                                        {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            )}

                            {formError && (
                                <p style={{ margin: 0, padding: '8px 12px', background: '#fff1f2', color: '#be123c', borderRadius: '6px', fontSize: '13px' }}>{formError}</p>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                            <button
                                onClick={() => setShowModal(false)}
                                style={{ padding: '8px 18px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{ padding: '8px 22px', background: '#084f9a', color: '#fff', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}
                            >
                                {saving ? 'Saving…' : editingEmpId ? 'Save Changes' : 'Add Member'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FieldTeamManagement;

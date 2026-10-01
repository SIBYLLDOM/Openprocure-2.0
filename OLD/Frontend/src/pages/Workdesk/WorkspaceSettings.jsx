import React, { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Save, Users, Bell, Lock, Palette, Database, Plus, Edit2, Trash2, Calendar, UserPlus, Briefcase, Search, ChevronDown, Check } from 'lucide-react';

const UserSelectDropdown = ({ options, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const filteredOptions = options.filter(opt =>
        (opt.name && opt.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (opt.email && opt.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
            <style>{`
                .prof-dropdown-trigger {
                    transition: all 0.2s ease;
                }
                .prof-dropdown-trigger:hover {
                    border-color: #3b82f6 !important;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                .prof-dropdown-trigger:focus {
                    outline: none;
                    border-color: #3b82f6 !important;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
                }
                .prof-dropdown-menu {
                    animation: dropdownFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .prof-dropdown-menu::-webkit-scrollbar {
                    width: 6px;
                }
                .prof-dropdown-menu::-webkit-scrollbar-track {
                    background: transparent;
                }
                .prof-dropdown-menu::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 10px;
                }
                .prof-dropdown-menu::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
                .prof-dropdown-option {
                    transition: all 0.15s ease;
                }
                .prof-dropdown-option:hover {
                    background-color: #f8fafc !important;
                    transform: translateX(4px);
                }
                @keyframes dropdownFadeIn {
                    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
            <button
                type="button"
                className="prof-dropdown-trigger"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    color: value ? '#111827' : '#6b7280',
                    fontWeight: value ? '500' : '400',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                    textAlign: 'left'
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {value ? value.name : 'Select an employee...'}
                    </span>
                    {value && (
                        <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '400' }}>
                            {value.email}
                        </span>
                    )}
                </div>
                <ChevronDown
                    size={18}
                    style={{
                        color: '#9ca3af',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        flexShrink: 0,
                        marginLeft: '1rem'
                    }}
                />
            </button>

            {isOpen && (
                <div
                    className="prof-dropdown-menu"
                    style={{
                        position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 100,
                        background: 'white', border: '1px solid #e5e7eb',
                        borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        maxHeight: '320px', overflowY: 'auto',
                        padding: '0.5rem'
                    }}
                >
                    <div style={{ position: 'sticky', top: '-0.5rem', background: 'white', zIndex: 2, padding: '0.5rem 0 0.5rem 0', borderBottom: '1px solid #f3f4f6', marginBottom: '0.5rem' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Search employees..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.25rem',
                                    background: '#f9fafb', border: '1px solid #e5e7eb',
                                    borderRadius: '8px', fontSize: '0.9rem', outline: 'none',
                                    transition: 'border-color 0.2s ease, background-color 0.2s ease'
                                }}
                                onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.backgroundColor = 'white'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.backgroundColor = '#f9fafb'; }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {filteredOptions.length > 0 ? filteredOptions.map((opt, idx) => {
                            const isSelected = value && value.email === opt.email;
                            return (
                                <div
                                    key={idx}
                                    className="prof-dropdown-option"
                                    onClick={() => {
                                        onChange(opt);
                                        setIsOpen(false);
                                        setSearchTerm('');
                                    }}
                                    style={{
                                        padding: '0.75rem 0.5rem', cursor: 'pointer', borderRadius: '8px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: isSelected ? '#eff6ff' : 'transparent',
                                        color: isSelected ? '#1d4ed8' : '#374151'
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span style={{ fontWeight: isSelected ? 600 : 500, fontSize: '0.95rem' }}>{opt.name}</span>
                                        <span style={{ color: isSelected ? '#3b82f6' : '#6b7280', fontSize: '0.8rem' }}>{opt.email}</span>
                                    </div>
                                    {isSelected && <Check size={18} color="#3b82f6" />}
                                </div>
                            );
                        }) : (
                            <div style={{ padding: '1.5rem', color: '#6b7280', fontSize: '0.95rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                <Search size={24} color="#e5e7eb" />
                                <span>No users found</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const WorkspaceSettings = ({ tenderId }) => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [deadlines, setDeadlines] = useState([]);
    const [eligibleUsers, setEligibleUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Form states
    const [deptForm, setDeptForm] = useState({ name: '', color: '#2563eb', icon: '📁' });
    const [empForm, setEmpForm] = useState({ name: '', email: '', role: 'member', department_id: '' });
    const [deadlineForm, setDeadlineForm] = useState({ title: '', deadline_date: '', description: '', reminder_days: 3 });

    // Editing states
    const [editingDept, setEditingDept] = useState(null);
    const [editingEmp, setEditingEmp] = useState(null);
    const [editingDeadline, setEditingDeadline] = useState(null);

    // Fetch data on mount
    useEffect(() => {
        fetchAllData();
    }, [tenderId]);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchDepartments(),
                fetchEmployees(),
                fetchDeadlines(),
                fetchEligibleUsers()
            ]);
        } catch (err) {
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const fetchEligibleUsers = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/eligible-users`);
            if (res.ok) {
                const data = await res.json();
                setEligibleUsers(data);
            }
        } catch (err) {
            console.error('Error fetching eligible users:', err);
        }
    };

    // ==================== DEPARTMENT FUNCTIONS ====================
    const fetchDepartments = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/departments`);
            const data = await res.json();
            setDepartments(data);
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };

    const handleCreateDepartment = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/departments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deptForm)
            });
            if (res.ok) {
                setDeptForm({ name: '', color: '#2563eb', icon: '📁' });
                fetchDepartments();
            }
        } catch (err) {
            alert('Failed to create department');
        }
    };

    const handleUpdateDepartment = async (deptId) => {
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/departments/${deptId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingDept)
            });
            if (res.ok) {
                setEditingDept(null);
                fetchDepartments();
            }
        } catch (err) {
            alert('Failed to update department');
        }
    };

    const handleDeleteDepartment = async (deptId) => {
        if (!confirm('Delete this department? Employees will be unassigned.')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/departments/${deptId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchDepartments();
                fetchEmployees();
            }
        } catch (err) {
            alert('Failed to delete department');
        }
    };

    // ==================== EMPLOYEE FUNCTIONS ====================
    const fetchEmployees = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/employees`);
            const data = await res.json();
            setEmployees(data);
        } catch (err) {
            console.error('Error fetching employees:', err);
        }
    };

    const handleCreateEmployee = async (e) => {
        e.preventDefault();
        if (!empForm.name || !empForm.email) {
            alert('Please select an employee from the dropdown before adding.');
            return;
        }
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/employees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(empForm)
            });
            if (res.ok) {
                setEmpForm({ name: '', email: '', role: 'member', department_id: '' });
                fetchEmployees();
            } else {
                const error = await res.json();
                alert(error.error || 'Failed to create employee');
            }
        } catch (err) {
            alert('Failed to create employee');
        }
    };

    const handleUpdateEmployee = async (empId) => {
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/employees/${empId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingEmp)
            });
            if (res.ok) {
                setEditingEmp(null);
                fetchEmployees();
            }
        } catch (err) {
            alert('Failed to update employee');
        }
    };

    const handleDeleteEmployee = async (empId) => {
        if (!confirm('Remove this employee from the workspace?')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/employees/${empId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchEmployees();
            }
        } catch (err) {
            alert('Failed to delete employee');
        }
    };

    // ==================== DEADLINE FUNCTIONS ====================
    const fetchDeadlines = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/deadlines`);
            const data = await res.json();
            setDeadlines(data);
        } catch (err) {
            console.error('Error fetching deadlines:', err);
        }
    };

    const handleCreateDeadline = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/deadlines`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deadlineForm)
            });
            if (res.ok) {
                setDeadlineForm({ title: '', deadline_date: '', description: '', reminder_days: 3 });
                fetchDeadlines();
            }
        } catch (err) {
            alert('Failed to create deadline');
        }
    };

    const handleUpdateDeadline = async (deadlineId) => {
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/deadlines/${deadlineId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingDeadline)
            });
            if (res.ok) {
                setEditingDeadline(null);
                fetchDeadlines();
            }
        } catch (err) {
            alert('Failed to update deadline');
        }
    };

    const handleDeleteDeadline = async (deadlineId) => {
        if (!confirm('Delete this deadline?')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(tenderId)}/deadlines/${deadlineId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchDeadlines();
            }
        } catch (err) {
            alert('Failed to delete deadline');
        }
    };

    const getStatusBadgeColor = (status) => {
        switch (status) {
            case 'completed': return '#10b981';
            case 'overdue': return '#ef4444';
            default: return '#f59e0b';
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
    }

    return (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{
                    fontSize: '2rem',
                    fontWeight: '700',
                    color: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    margin: '0 0 0.5rem 0'
                }}>
                    <SettingsIcon size={32} style={{ color: '#2563eb' }} />
                    Workspace Settings
                </h1>
                <p style={{ fontSize: '0.95rem', color: '#6b7280', margin: 0 }}>
                    Manage team, departments, and deadlines for {tenderId}
                </p>
            </div>

            {error && (
                <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '1rem' }}>
                    {error}
                </div>
            )}

            {/* Team Management Section */}
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: '600',
                    color: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1.5rem'
                }}>
                    <Users size={24} style={{ color: '#2563eb' }} />
                    Team Management
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    {/* Departments */}
                    <div style={{
                        background: 'white',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        border: '1px solid #e5e7eb'
                    }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Briefcase size={18} style={{ color: '#2563eb' }} />
                            Departments
                        </h3>

                        {/* Add Department Form */}
                        <form onSubmit={handleCreateDepartment} style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    placeholder="Department name"
                                    value={deptForm.name}
                                    onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                                    required
                                    style={{
                                        flex: 1,
                                        minWidth: '150px',
                                        padding: '0.6rem',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '6px',
                                        fontSize: '0.9rem'
                                    }}
                                />
                                <input
                                    type="color"
                                    value={deptForm.color}
                                    onChange={(e) => setDeptForm({ ...deptForm, color: e.target.value })}
                                    style={{ width: '50px', height: '38px', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }}
                                />
                                <input
                                    type="text"
                                    placeholder="Icon"
                                    value={deptForm.icon}
                                    onChange={(e) => setDeptForm({ ...deptForm, icon: e.target.value })}
                                    maxLength={2}
                                    style={{ width: '60px', padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', textAlign: 'center', fontSize: '1.2rem' }}
                                />
                                <button
                                    type="submit"
                                    style={{
                                        padding: '0.6rem 1rem',
                                        background: '#2563eb',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                        </form>

                        {/* Department List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto' }}>
                            {departments.map(dept => (
                                <div key={dept.id} style={{
                                    padding: '1rem',
                                    background: '#f8fafc',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    {editingDept?.id === dept.id ? (
                                        <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                                            <input
                                                type="text"
                                                value={editingDept.name}
                                                onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
                                                style={{ flex: 1, padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '4px' }}
                                            />
                                            <input
                                                type="color"
                                                value={editingDept.color}
                                                onChange={(e) => setEditingDept({ ...editingDept, color: e.target.value })}
                                                style={{ width: '40px' }}
                                            />
                                            <input
                                                type="text"
                                                value={editingDept.icon}
                                                onChange={(e) => setEditingDept({ ...editingDept, icon: e.target.value })}
                                                maxLength={2}
                                                style={{ width: '50px', textAlign: 'center' }}
                                            />
                                            <button onClick={() => handleUpdateDepartment(dept.id)} style={{ padding: '0.5rem 0.75rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                                            <button onClick={() => setEditingDept(null)} style={{ padding: '0.5rem 0.75rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: dept.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                                    {dept.icon}
                                                </div>
                                                <div>
                                                    <p style={{ fontWeight: '600', color: '#1f2937', margin: 0 }}>{dept.name}</p>
                                                    <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>{dept.employee_count || 0} employees</p>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => setEditingDept(dept)}
                                                    style={{ padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                                                >
                                                    <Edit2 size={16} style={{ color: '#2563eb' }} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteDepartment(dept.id)}
                                                    style={{ padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                                                >
                                                    <Trash2 size={16} style={{ color: '#ef4444' }} />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Employees */}
                    <div style={{
                        background: 'white',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        border: '1px solid #e5e7eb'
                    }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <UserPlus size={18} style={{ color: '#2563eb' }} />
                            Employees
                        </h3>

                        {/* Add Employee Form */}
                        <form onSubmit={handleCreateEmployee} style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <UserSelectDropdown
                                    options={eligibleUsers}
                                    value={empForm.name ? { name: empForm.name, email: empForm.email } : null}
                                    onChange={(selected) => setEmpForm({ ...empForm, name: selected.name, email: selected.email })}
                                />
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={empForm.email}
                                    readOnly
                                    disabled
                                    style={{ padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#f3f4f6', color: '#6b7280' }}
                                />
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <select
                                        value={empForm.role}
                                        onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })}
                                        style={{ flex: 1, padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.9rem' }}
                                    >
                                        <option value="admin">Admin</option>
                                        <option value="member">Member</option>
                                        <option value="viewer">Viewer</option>
                                    </select>
                                    <select
                                        value={empForm.department_id}
                                        onChange={(e) => setEmpForm({ ...empForm, department_id: e.target.value })}
                                        style={{ flex: 1, padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.9rem' }}
                                    >
                                        <option value="">No Department</option>
                                        {departments.map(dept => (
                                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="submit"
                                    style={{
                                        padding: '0.6rem 1rem',
                                        background: '#2563eb',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem'
                                    }}
                                >
                                    <Plus size={16} /> Add Employee
                                </button>
                            </div>
                        </form>

                        {/* Employee List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto' }}>
                            {employees.map(emp => (
                                <div key={emp.id} style={{
                                    padding: '1rem',
                                    background: '#f8fafc',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <p style={{ fontWeight: '600', color: '#1f2937', margin: 0 }}>{emp.name}</p>
                                        <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>{emp.email}</p>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: '#dbeafe', color: '#1e40af', borderRadius: '4px' }}>{emp.role}</span>
                                            {emp.department_name && (
                                                <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: emp.department_color + '20', color: emp.department_color, borderRadius: '4px' }}>{emp.department_name}</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteEmployee(emp.id)}
                                        style={{ padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                                    >
                                        <Trash2 size={16} style={{ color: '#ef4444' }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Time Management Section */}
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: '600',
                    color: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1.5rem'
                }}>
                    <Calendar size={24} style={{ color: '#2563eb' }} />
                    Time Management
                </h2>

                <div style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    border: '1px solid #e5e7eb'
                }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937', marginBottom: '1rem' }}>
                        Deadlines & Milestones
                    </h3>

                    {/* Add Deadline Form */}
                    <form onSubmit={handleCreateDeadline} style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <input
                                type="text"
                                placeholder="Deadline title"
                                value={deadlineForm.title}
                                onChange={(e) => setDeadlineForm({ ...deadlineForm, title: e.target.value })}
                                required
                                style={{ padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.9rem' }}
                            />
                            <input
                                type="date"
                                value={deadlineForm.deadline_date}
                                onChange={(e) => setDeadlineForm({ ...deadlineForm, deadline_date: e.target.value })}
                                required
                                style={{ padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.9rem' }}
                            />
                            <input
                                type="number"
                                placeholder="Reminder (days)"
                                value={deadlineForm.reminder_days}
                                onChange={(e) => setDeadlineForm({ ...deadlineForm, reminder_days: e.target.value })}
                                min="1"
                                style={{ padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.9rem' }}
                            />
                        </div>
                        <textarea
                            placeholder="Description (optional)"
                            value={deadlineForm.description}
                            onChange={(e) => setDeadlineForm({ ...deadlineForm, description: e.target.value })}
                            rows={2}
                            style={{ width: '100%', padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.9rem', marginBottom: '0.5rem' }}
                        />
                        <button
                            type="submit"
                            style={{
                                padding: '0.6rem 1rem',
                                background: '#2563eb',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Plus size={16} /> Add Deadline
                        </button>
                    </form>

                    {/* Deadline List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {deadlines.map(deadline => (
                            <div key={deadline.id} style={{
                                padding: '1rem',
                                background: '#f8fafc',
                                borderRadius: '8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderLeft: `4px solid ${getStatusBadgeColor(deadline.status)}`
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                        <p style={{ fontWeight: '600', color: '#1f2937', margin: 0 }}>{deadline.title}</p>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            padding: '0.25rem 0.5rem',
                                            background: getStatusBadgeColor(deadline.status) + '20',
                                            color: getStatusBadgeColor(deadline.status),
                                            borderRadius: '4px',
                                            fontWeight: '600'
                                        }}>
                                            {deadline.status}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>{deadline.description}</p>
                                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#6b7280' }}>
                                        <span>📅 {new Date(deadline.deadline_date).toLocaleDateString()}</span>
                                        <span>⏰ {deadline.days_remaining >= 0 ? `${deadline.days_remaining} days left` : `${Math.abs(deadline.days_remaining)} days overdue`}</span>
                                        <span>🔔 {deadline.reminder_days} days reminder</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteDeadline(deadline.id)}
                                    style={{ padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                                >
                                    <Trash2 size={16} style={{ color: '#ef4444' }} />
                                </button>
                            </div>
                        ))}
                        {deadlines.length === 0 && (
                            <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 0' }}>No deadlines set</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkspaceSettings;

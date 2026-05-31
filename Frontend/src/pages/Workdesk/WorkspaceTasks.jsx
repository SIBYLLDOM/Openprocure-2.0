import React, { useState } from 'react';
import {
  CheckCircle2, Circle, Search, ClipboardList, Tag,
  Wand2, User, Calendar, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react';

const categoryColors = {
  Step: { bg: '#eff6ff', text: '#2563eb' },
  Doc: { bg: '#f0fdf4', text: '#16a34a' },
  Request: { bg: '#fff7ed', text: '#ea580c' },
  Urgent: { bg: '#fef2f2', text: '#dc2626' },
};

const WorkspaceTask = ({ departments, tasks, onToggleStatus, onGenerateClick, workspaceEmployees = [] }) => {

  // Support both Array (Backend) and Object (Legacy/Local) formats
  const allTasks = Array.isArray(tasks)
    ? tasks.map(t => ({
      ...t,
      deptId: t.department_id || t.deptId,
      createdAt: t.created_at ? new Date(t.created_at).toLocaleDateString() : t.createdAt,
      tags: typeof t.tags === 'string' ? (() => { try { return JSON.parse(t.tags); } catch { return []; } })() : (t.tags || []),
      assigned_users: typeof t.assigned_users === 'string' ? (() => { try { return JSON.parse(t.assigned_users); } catch { return []; } })() : (t.assigned_users || []),
    }))
    : Object.entries(tasks).flatMap(([deptId, deptTasks]) =>
      deptTasks.map(task => ({ ...task, deptId: Number(deptId) }))
    );

  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedTask, setExpandedTask] = useState(null);

  const filteredTasks = allTasks.filter(task => {
    const matchDept = filterDept === 'all' || task.deptId === Number(filterDept);
    const matchStatus = filterStatus === 'all' || task.status === filterStatus;
    const matchSearch = task.title.toLowerCase().includes(search.toLowerCase());
    return matchDept && matchStatus && matchSearch;
  });

  const getDept = (id) => departments.find(d => d.id === id) || { name: 'Unknown', color: '#9ca3af' };
  const totalTasks = allTasks.length;
  const totalDone = allTasks.filter(t => t.status === 'done').length;
  const totalPending = allTasks.filter(t => t.status !== 'done').length;
  const completionPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  const resolveUserName = (userId) => {
    const emp = workspaceEmployees.find(e => String(e.id) === String(userId) || String(e.user_id) === String(userId));
    return emp ? emp.name : `User #${userId}`;
  };

  const isOverdue = (deadline) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f6fb', padding: '2rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* PAGE HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ClipboardList size={30} color="#2563eb" />
            <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1f2937', margin: 0 }}>
              All Tasks Overview
            </h1>
          </div>
          <button onClick={onGenerateClick} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.7rem 1.2rem', background: '#7c3aed', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
            boxShadow: '0 2px 8px rgba(124,58,237,0.3)', fontSize: '0.9rem'
          }}>
            <Wand2 size={17} /> Generate Tasks
          </button>
        </div>

        {/* SUMMARY CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          <SummaryCard label="Total Tasks" value={totalTasks} color="#2563eb" icon={<ClipboardList size={32} />} />
          <SummaryCard label="Pending" value={totalPending} color="#dc2626" icon={<Circle size={32} />} />
          <SummaryCard label="Completed" value={totalDone} color="#059669" icon={<CheckCircle2 size={32} />} />

          {/* Progress Card */}
          <div style={{ background: 'white', padding: '1.25rem', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #e5e7eb' }}>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completion Rate</p>
            <p style={{ margin: '0.4rem 0 0.75rem 0', fontSize: '2rem', fontWeight: 700, color: '#1f2937' }}>{completionPct}%</p>
            <div style={{ background: '#e5e7eb', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
              <div style={{ width: `${completionPct}%`, background: 'linear-gradient(90deg,#059669,#34d399)', height: '100%', borderRadius: '999px', transition: 'width 0.5s ease' }} />
            </div>
          </div>
        </div>

        {/* FILTER BAR */}
        <div style={{ background: 'white', padding: '1.25rem', borderRadius: '10px', marginBottom: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.6rem 0.9rem' }}>
              <Search size={16} color="#9ca3af" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.9rem', color: '#1f2937' }}
              />
            </div>
            <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
              style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#f9fafb', minWidth: '160px', color: '#374151', fontSize: '0.9rem' }}>
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#f9fafb', minWidth: '140px', color: '#374151', fontSize: '0.9rem' }}>
              <option value="all">All Status</option>
              <option value="not-done">Pending</option>
              <option value="done">Done</option>
            </select>
            <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#6b7280', fontWeight: 500 }}>
              {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} shown
            </span>
          </div>
        </div>

        {/* TASK LIST */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {filteredTasks.length === 0 ? (
            <div style={{ textAlign: 'center', background: 'white', borderRadius: '10px', padding: '3rem', border: '1px dashed #d1d5db' }}>
              <p style={{ color: '#9ca3af', margin: 0, fontSize: '1rem' }}>No tasks match the current filters.</p>
            </div>
          ) : (
            filteredTasks.map(task => {
              const dept = getDept(task.deptId);
              const isDone = task.status === 'done';
              const overdue = !isDone && isOverdue(task.deadline);
              const isExpanded = expandedTask === task.id;
              const assignedList = Array.isArray(task.assigned_users) ? task.assigned_users : [];

              return (
                <div key={task.id} style={{
                  background: 'white',
                  borderRadius: '10px',
                  border: `1px solid ${overdue ? '#fecaca' : isDone ? '#d1fae5' : '#e5e7eb'}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s'
                }}>
                  {/* Main Task Row */}
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>

                    {/* Status Icon */}
                    <div onClick={() => onToggleStatus && onToggleStatus(task.id, task)}
                      style={{ cursor: onToggleStatus ? 'pointer' : 'default', paddingTop: '2px', flexShrink: 0 }}>
                      {isDone
                        ? <CheckCircle2 size={22} color="#059669" />
                        : <Circle size={22} color="#9ca3af" />}
                    </div>

                    {/* Task Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <p style={{
                          margin: 0, fontWeight: 600, fontSize: '0.95rem',
                          color: isDone ? '#059669' : '#1f2937',
                          textDecoration: isDone ? 'line-through' : 'none'
                        }}>{task.title}</p>

                        {/* Dept Badge */}
                        <span style={{
                          padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                          background: dept.color + '20', color: dept.color
                        }}>{dept.name}</span>

                        {/* Done Badge */}
                        {isDone && <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: '#d1fae5', color: '#047857' }}>✓ Done</span>}

                        {/* Overdue Badge */}
                        {overdue && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: '#fef2f2', color: '#dc2626' }}>
                            <AlertCircle size={11} /> Overdue
                          </span>
                        )}
                      </div>

                      {/* Tags */}
                      {task.tags && task.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                          {task.tags.map((tag, i) => {
                            const c = categoryColors[tag] || { bg: '#f3f4f6', text: '#6b7280' };
                            return (
                              <span key={i} style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '4px', background: c.bg, color: c.text, display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                                <Tag size={10} /> {tag}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Meta Row: date, deadline, assigned */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                        <span>📅 Created: {task.createdAt}</span>
                        {task.deadline && (
                          <span style={{ color: overdue ? '#dc2626' : '#374151', fontWeight: overdue ? 600 : 400 }}>
                            <Calendar size={12} style={{ display: 'inline', marginRight: 3 }} />
                            Due: {new Date(task.deadline).toLocaleDateString()}
                          </span>
                        )}
                        {assignedList.length > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <User size={12} />
                            {assignedList.map(id => resolveUserName(id)).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expand Toggle */}
                    {(task.description || (isDone && task.remarks)) && (
                      <button onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '2px', flexShrink: 0 }}>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #f3f4f6', padding: '0.9rem 1.25rem 1.1rem 3.75rem', background: '#fafafa' }}>
                      {task.description && (
                        <div style={{ marginBottom: '0.75rem' }}>
                          <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</p>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>{task.description}</p>
                        </div>
                      )}
                      {isDone && task.remarks && (
                        <div style={{ background: '#d1fae520', border: '1px solid #d1fae5', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                          <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.75rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>✓ Completion Remarks</p>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#065f46', lineHeight: 1.6 }}>{task.remarks}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, color, icon }) => (
  <div style={{ background: color, padding: '1.25rem', borderRadius: '10px', color: 'white', boxShadow: `0 4px 12px ${color}40` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <p style={{ opacity: 0.85, margin: 0, fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
        <h2 style={{ margin: '0.4rem 0 0 0', fontSize: '2.2rem', fontWeight: 700 }}>{value}</h2>
      </div>
      <div style={{ opacity: 0.6 }}>{icon}</div>
    </div>
  </div>
);

export default WorkspaceTask;

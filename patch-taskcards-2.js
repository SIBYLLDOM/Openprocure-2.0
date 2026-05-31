const fs = require('fs');
const filePath = 'Frontend/src/pages/Workdesk/Workspaces.jsx';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// The block to replace:
const oldBlock = `                    {editingTaskId === task.id ? (
                      <div style={{ flex: 1, display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', flex: 1 }}
                        />
                        <select
                          value={editForm.tag}
                          onChange={e => setEditForm({ ...editForm, tag: e.target.value })}
                          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
                        >
                          <option value="step">Step</option>
                          <option value="doc">Doc</option>
                          <option value="request">Request</option>
                          <option value="urgent">Urgent</option>
                        </select>
                        <select
                          value={editForm.department_id}
                          onChange={e => setEditForm({ ...editForm, department_id: parseInt(e.target.value) })}
                          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
                        >
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <button onClick={() => saveEditing(task.id)} style={{ padding: '5px 10px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                        <button onClick={cancelEditing} style={{ padding: '5px 10px', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                          <button
                            onClick={() => handleTaskToggle(task.id, task)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              flexShrink: 0
                            }}>
                            {task.status === 'done' ? (
                              <CheckCircle2 style={{ width: '1.25rem', height: '1.25rem', color: '#059669' }} />
                            ) : (
                              <Circle style={{ width: '1.25rem', height: '1.25rem', color: '#9ca3af' }} />
                            )}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontWeight: '500',
                              color: task.status === 'done' ? '#6b7280' : '#1f2937',
                              textDecoration: task.status === 'done' ? 'line-through' : 'none',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {task.title}
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.25rem' }}>
                              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Added: {new Date(task.createdAt).toLocaleDateString()}</span>
                              {task.deadline && (
                                <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 500, background: '#fee2e2', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                  Due: {new Date(task.deadline).toLocaleDateString()}
                                </span>
                              )}
                              {task.tags && task.tags.length > 0 && task.tags.map((tag, idx) => (
                                <span key={idx} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <Tag size={10} /> {tag}
                                </span>
                              ))}
                            </div>

                            {task.description && (
                              <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '0.5rem 0 0 0', fontStyle: 'italic' }}>
                                {task.description}
                              </p>
                            )}

                            {task.assigned_users && typeof task.assigned_users === 'object' && task.assigned_users.length > 0 && (
                                           <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                             <Users size={12} style={{ color: '#6d28d9', flexShrink: 0 }} />
                                             <span style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>Assigned:</span>
                                             {task.assigned_users.map((uid) => {
                                               const user = deptUsers.find(u => u.id === uid);
                                               return (
                                                 <span key={uid} style={{ background: '#ede9fe', color: '#6d28d9', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 500 }}>
                                                   {user ? user.name : \`User #\${uid}\`}
                                                 </span>
                                               );
                                             })}
                                           </div>
                                        )}

                            {task.remarks && (
                              <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f0fdf4', borderLeft: '3px solid #22c55e', borderRadius: '4px' }}>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#166534' }}><strong>Remarks:</strong> {task.remarks}</p>
                              </div>
                            )}

                            {/* Remarks Input inline when they click Done */}
                            {remarksModal.taskId === task.id && (
                              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                <textarea
                                  value={remarksModal.remarks}
                                  onChange={(e) => setRemarksModal(prev => ({ ...prev, remarks: e.target.value }))}
                                  placeholder="Add any remarks before completing... (optional)"
                                  rows={1}
                                  style={{ flex: 1, minWidth: '200px', padding: '0.5rem', border: '1px solid #22c55e', borderRadius: '4px', fontSize: '0.85rem', resize: 'vertical' }}
                                  autoFocus
                                />
                                <button
                                  onClick={confirmTaskDone}
                                  style={{ padding: '0.5rem 1rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
                                  Confirm Done
                                </button>
                                <button
                                  onClick={() => setRemarksModal({ open: false, taskId: null, remarks: '' })}
                                  style={{ padding: '0.5rem 1rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                          {/* Edit Button */}
                          <button
                            onClick={() => startEditing(task)}
                            style={{
                              padding: '0.5rem',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'background 0.2s',
                              flexShrink: 0
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#ffffff'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                          >
                            <Edit2 style={{ width: '1rem', height: '1rem', color: '#3b82f6' }} />
                          </button>

                          {/* New Done button */}
                          {task.status !== 'done' && (
                            <button
                              onClick={() => setRemarksModal({ open: true, taskId: task.id, remarks: '' })}
                              style={{
                                padding: '0.5rem 0.75rem',
                                background: '#059669',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 600,
                              }}
                              onMouseEnter={(e) => e.target.style.background = '#047857'}
                              onMouseLeave={(e) => e.target.style.background = '#059669'}
                            >
                              Done
                            </button>
                          )}

                          <button
                            onClick={() => deleteTask(task.id)}
                            style={{
                              padding: '0.5rem',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'background 0.2s',
                              flexShrink: 0
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#ffffff'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}>
                            <Trash2 style={{ width: '1rem', height: '1rem', color: '#dc2626' }} />
                          </button>
                        </div>
                      </>
                    )}`;

const newBlock = `                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontWeight: '600',
                              fontSize: '0.95rem',
                              color: task.status === 'done' ? '#6b7280' : '#1f2937',
                              textDecoration: task.status === 'done' ? 'line-through' : 'none',
                              margin: '0 0 0.25rem 0',
                              wordBreak: 'break-word'
                            }}>
                              {task.title}
                            </p>
                            
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Added: {new Date(task.createdAt).toLocaleDateString()}</span>
                              {task.deadline && (
                                <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600, background: '#fee2e2', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #fca5a5' }}>
                                  Due: {new Date(task.deadline).toLocaleDateString()}
                                </span>
                              )}
                              {task.tags && task.tags.length > 0 && task.tags.map((tag, idx) => (
                                <span key={idx} style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', fontWeight: 500 }}>
                                  {tag.toUpperCase()}
                                </span>
                              ))}
                            </div>

                            {task.description && (
                              <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '0.5rem 0 0 0', fontStyle: 'italic', background: '#f9fafb', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                                {task.description}
                              </p>
                            )}

                            {task.assigned_users && typeof task.assigned_users === 'object' && task.assigned_users.length > 0 && (
                               <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                                 <Users size={14} style={{ color: '#4f46e5', flexShrink: 0 }} />
                                 <span style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>Assigned To:</span>
                                 {task.assigned_users.map((uid) => {
                                   const user = deptUsers.find(u => u.id === uid);
                                   return (
                                     <span key={uid} style={{ background: '#e0e7ff', color: '#4338ca', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600, border: '1px solid #c7d2fe' }}>
                                       {user ? user.name : \`User #\${uid}\`}
                                     </span>
                                   );
                                 })}
                               </div>
                            )}

                            {task.remarks && (
                              <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', borderLeft: '4px solid #22c55e', borderRadius: '4px' }}>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#166534' }}><strong>Completion Remarks:</strong> {task.remarks}</p>
                              </div>
                            )}
                          </div>
                      </div>

                      {/* Icon Actions Container */}
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0, alignSelf: 'flex-start' }}>
                          {/* Edit IconButton */}
                          <button
                            title="Edit Task"
                            onClick={() => openEditTaskModal(task)}
                            style={{
                              padding: '0.4rem',
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                            <Edit2 size={16} color="#2563eb" />
                          </button>

                          {/* Complete IconButton */}
                          {task.status !== 'done' && (
                            <button
                              title="Mark as Completed"
                              onClick={() => openCompleteModal(task.id)}
                              style={{
                                padding: '0.4rem',
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                              <CheckCircle2 size={16} color="#16a34a" />
                            </button>
                          )}

                          {/* Delete IconButton */}
                          <button
                            title="Delete Task"
                            onClick={() => deleteTask(task.id)}
                            style={{
                              padding: '0.4rem',
                              background: '#fef2f2',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                            <Trash2 size={16} color="#dc2626" />
                          </button>
                      </div>`;

if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    console.log('PATCH 2: Task card JSX replaced.');
} else {
    console.log('PATCH 2 NOT FOUND. Writing debug snippet.');
    const idx = content.indexOf('editingTaskId === task.id');
    fs.writeFileSync('debug_snippet_patch2.txt', content.substring(idx - 200, idx + 400));
}

fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');

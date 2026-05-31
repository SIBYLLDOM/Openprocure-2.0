const fs = require('fs');
const filePath = 'Frontend/src/pages/Workdesk/Workspaces.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const startStr = '                    {editingTaskId === task.id ? (';
const startIdx = content.indexOf(startStr);

if (startIdx === -1) {
    console.log('Start index not found');
    process.exit(1);
}

// Find the end of the task card render block
const endStr = '                  </div>\r\n                ))\r\n              ) : (';
const endIdx = content.indexOf(endStr, startIdx);

if (endIdx === -1) {
    console.log('End index not found');
    process.exit(1);
}

const beforeBlock = content.substring(0, startIdx);
const afterBlock = content.substring(endIdx);

const newBlock = `                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1, minWidth: 0, paddingBottom: '0.25rem' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontWeight: '600',
                              fontSize: '0.95rem',
                              color: task.status === 'done' ? '#6b7280' : '#1f2937',
                              textDecoration: task.status === 'done' ? 'line-through' : 'none',
                              margin: '0 0 0.25rem 0',
                              wordBreak: 'break-word',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              {task.status === 'done' && <CheckCircle2 size={16} color="#16a34a" />}
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
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, alignSelf: 'flex-start', background: 'white', padding: '0.3rem', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                          
                          {/* Complete IconButton */}
                          {task.status !== 'done' && (
                            <button
                              title="Mark as Completed"
                              onClick={() => openCompleteModal(task.id)}
                              style={{
                                padding: '0.5rem',
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#dcfce7'; e.currentTarget.style.transform = 'scale(1.05)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.transform = 'scale(1)' }}
                            >
                              <CheckCircle2 size={18} color="#16a34a" />
                            </button>
                          )}

                          {/* Edit IconButton */}
                          <button
                            title="Edit Task"
                            onClick={() => openEditTaskModal(task)}
                            style={{
                              padding: '0.5rem',
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.transform = 'scale(1.05)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.transform = 'scale(1)' }}
                          >
                            <Edit2 size={18} color="#2563eb" />
                          </button>

                          {/* Delete IconButton */}
                          <button
                            title="Delete Task"
                            onClick={() => deleteTask(task.id)}
                            style={{
                              padding: '0.5rem',
                              background: '#fef2f2',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.transform = 'scale(1.05)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.transform = 'scale(1)' }}
                          >
                            <Trash2 size={18} color="#dc2626" />
                          </button>
                      </div>\r\n`;

fs.writeFileSync(filePath, beforeBlock + newBlock + afterBlock, 'utf8');
console.log('PATCH 2 applied via string boundaries.');

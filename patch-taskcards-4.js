const fs = require('fs');
const filePath = 'Frontend/src/pages/Workdesk/Workspaces.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = '      <style>{`\n        @keyframes fadeIn {';
const newModals = `      {/* ---- EDIT TASK MODAL ---- */}
      {editTaskModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', width: '500px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1f2937' }}>Edit Task</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Title</label>
              <input type="text" value={editTaskModal.title} onChange={e => setEditTaskModal(prev => ({ ...prev, title: e.target.value }))} style={{ padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Category / Tag</label>
                <select value={editTaskModal.tag} onChange={e => setEditTaskModal(prev => ({ ...prev, tag: e.target.value }))} style={{ padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}>
                  <option value="step">Step</option><option value="doc">Doc</option><option value="request">Request</option><option value="urgent">Urgent</option>
                </select>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Deadline</label>
                <input type="date" value={editTaskModal.deadline} onChange={e => setEditTaskModal(prev => ({ ...prev, deadline: e.target.value }))} style={{ padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Description</label>
              <textarea value={editTaskModal.description} onChange={e => setEditTaskModal(prev => ({ ...prev, description: e.target.value }))} rows={2} style={{ padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Assigned Department Users</label>
              <div style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.5rem 0.75rem', maxHeight: '120px', overflowY: 'auto', background: '#f9fafb' }}>
                {deptUsers.map(u => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', padding: '0.25rem 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={editTaskModal.assigned_users.includes(u.id)} onChange={e => {
                      if (e.target.checked) setEditTaskModal(p => ({ ...p, assigned_users: [...p.assigned_users, u.id] }));
                      else setEditTaskModal(p => ({ ...p, assigned_users: p.assigned_users.filter(id => id !== u.id) }));
                    }} /> 
                    {u.name} <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>({u.email})</span>
                  </label>
                ))}
                {deptUsers.length === 0 && <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>No users loaded.</span>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button onClick={() => setEditTaskModal(null)} style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button onClick={saveEditTaskModal} style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- COMPLETE TASK MODAL ---- */}
      {completeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '1.75rem', borderRadius: '12px', width: '450px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#166534' }}>
              <CheckCircle2 size={24} />
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1f2937' }}>Mark Task as Done</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Remarks / Summary (Optional)</label>
              <textarea 
                value={completeModal.remarks} 
                onChange={e => setCompleteModal(prev => ({ ...prev, remarks: e.target.value }))} 
                placeholder="E.g. Uploaded the pricing sheets..." 
                rows={2} 
                style={{ padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', resize: 'vertical' }} 
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#fef2f2', padding: '1rem', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <input 
                type="checkbox" 
                id="confirmComplete"
                checked={completeModal.confirmed}
                onChange={e => setCompleteModal(prev => ({ ...prev, confirmed: e.target.checked }))}
                style={{ marginTop: '0.2rem', accentColor: '#dc2626', width: '1.2rem', height: '1.2rem' }}
              />
              <label htmlFor="confirmComplete" style={{ fontSize: '0.85rem', color: '#991b1b', margin: 0, cursor: 'pointer', lineHeight: '1.4' }}>
                <strong>Confirmation Verification:</strong> By checking this box, I confirm that I have fully completed this task and validated my work. I understand this action notifies the team.
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button onClick={() => setCompleteModal(null)} style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button 
                onClick={submitCompleteModal} 
                disabled={!completeModal.confirmed}
                style={{ 
                  padding: '0.5rem 1rem', 
                  background: completeModal.confirmed ? '#16a34a' : '#86efac', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px', 
                  cursor: completeModal.confirmed ? 'pointer' : 'not-allowed', 
                  fontWeight: 600,
                  transition: 'background 0.2s'
                }}>
                Confirm Completion
              </button>
            </div>
          </div>
        </div>
      )}

`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, newModals + targetStr);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('PATCH 4: Modals injected successfully!');
} else {
    // If exact whitespace varies, find it flexibly
    const idx = content.indexOf('<style>{`');
    if (idx !== -1) {
        // Insert right before <style>
        const leadingSpaceStr = content.substring(idx - 10, idx);
        const lastNewline = leadingSpaceStr.lastIndexOf('\n');
        const spacesToInsertAt = idx - (leadingSpaceStr.length - 1 - lastNewline);
        const patched = content.substring(0, spacesToInsertAt) + newModals + content.substring(spacesToInsertAt);
        fs.writeFileSync(filePath, patched, 'utf8');
        console.log('PATCH 4: Modals injected using flexible fallback!');
    } else {
        console.log('PATCH 4 FAILED: Could not find <style> tag.');
    }
}

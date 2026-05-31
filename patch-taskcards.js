const fs = require('fs');
const filePath = 'Frontend/src/pages/Workdesk/Workspaces.jsx';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// ==============================================================
// PATCH 1: Replace the editing state + logic block (lines ~503-552)
// ==============================================================
const OLD_EDIT_STATE = `  // Editing logic
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', tag: '', department_id: null });

  const startEditing = (task) => {
    setEditingTaskId(task.id);
    setEditForm({
      title: task.title,
      tag: task.tags && task.tags.length > 0 ? task.tags[0] : 'step',
      department_id: task.department_id
    });
  };

  const cancelEditing = () => {
    setEditingTaskId(null);
    setEditForm({ title: '', tag: '', department_id: null });
  };

  const saveEditing = async (taskId) => {
    const { title, tag, department_id: newDeptId } = editForm;
    if (!title.trim()) return;

    const cleanTenderId = tenderId.replace(/_/g, '/');
    const token = localStorage.getItem('token');

    try {
      const res = await fetch(\`\${API_BASE_URL}/workspaces/\${encodeURIComponent(cleanTenderId)}/tasks/\${taskId}\`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`
        },
        body: JSON.stringify({
          title: title,
          tags: [tag],
          department_id: newDeptId
        })
      });

      if (res.ok) {
        const updatedTask = await res.json();
        setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
        setEditingTaskId(null);
      } else {
        console.error('Failed to update task:', res.statusText);
      }
    } catch (err) {
      console.error('Error updating task:', err);
    }
  };`;

const NEW_EDIT_STATE = `  // ---- Task Edit Modal ----
  const [editTaskModal, setEditTaskModal] = useState(null); // null or { id, title, tag, description, deadline, assigned_users, department_id }

  const openEditTaskModal = (task) => {
    setEditTaskModal({
      id: task.id,
      title: task.title || '',
      tag: task.tags && task.tags.length > 0 ? task.tags[0] : 'step',
      description: task.description || '',
      deadline: task.deadline ? task.deadline.split('T')[0] : '',
      assigned_users: Array.isArray(task.assigned_users) ? task.assigned_users : [],
      department_id: task.department_id
    });
  };

  const saveEditTaskModal = async () => {
    if (!editTaskModal || !editTaskModal.title.trim()) return;
    const { id: taskId, title, tag, description, deadline, assigned_users, department_id } = editTaskModal;
    const cleanTenderId = tenderId.replace(/_/g, '/');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(\`\${API_BASE_URL}/workspaces/\${encodeURIComponent(cleanTenderId)}/tasks/\${taskId}\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
        body: JSON.stringify({ title, tags: [tag], description, deadline: deadline || null, assigned_users, department_id })
      });
      if (res.ok) {
        const updatedTask = await res.json();
        setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
        setEditTaskModal(null);
      }
    } catch (err) { console.error('Error updating task:', err); }
  };

  // ---- Task Complete Modal ----
  const [completeModal, setCompleteModal] = useState(null); // null or { taskId, remarks, confirmed }

  const openCompleteModal = (taskId) => {
    setCompleteModal({ taskId, remarks: '', confirmed: false });
  };

  const submitCompleteModal = async () => {
    if (!completeModal || !completeModal.confirmed) return;
    const { taskId, remarks } = completeModal;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done', remarks } : t));
    try {
      const cleanTenderId = tenderId.replace(/_/g, '/');
      const token = localStorage.getItem('token');
      const res = await fetch(\`\${API_BASE_URL}/workspaces/\${encodeURIComponent(cleanTenderId)}/tasks/\${taskId}\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
        body: JSON.stringify({ status: 'done', remarks })
      });
      if (!res.ok) throw new Error('Failed');
    } catch (e) {
      setTasks(prev => prev.map(t => t.id === completeModal.taskId ? { ...t, status: 'not-done', remarks: null } : t));
      alert('Failed to mark task as done. Please try again.');
    }
    setCompleteModal(null);
  };`;

if (content.includes(OLD_EDIT_STATE)) {
    content = content.replace(OLD_EDIT_STATE, NEW_EDIT_STATE);
    console.log('PATCH 1 applied: state/logic updated');
} else {
    console.log('PATCH 1 NOT found. Trying substring search...');
    const idx = content.indexOf('// Editing logic');
    console.log('// Editing logic at index:', idx);
}

fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
console.log('File saved after PATCH 1');

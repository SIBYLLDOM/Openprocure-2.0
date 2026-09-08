import { useEffect, useState } from 'react';
import { Plus, Trash2, FolderKanban, CheckCircle2, Circle, CircleDot } from 'lucide-react';
import {
  getDepartments, createDepartment, deleteDepartment,
  getTasks, createTask, updateTask, deleteTask,
} from '../../../services/workspaceApi';
import type { WorkspaceDepartmentRow, WorkspaceTaskRow } from '../../../services/workspaceApi';
import { Button } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';

const STATUS_ICON = { todo: Circle, in_progress: CircleDot, done: CheckCircle2 } as const;

// Tender Hub > Workspace — department-grouped task board. See
// backend/models/WorkspaceDepartment.js for why departments are a
// partner-defined grouping here rather than the original's internal team.
const WorkspaceTab = ({ bidUrlId }: { bidUrlId: string }) => {
  const { show } = useToast();
  const [departments, setDepartments] = useState<WorkspaceDepartmentRow[]>([]);
  const [tasks, setTasks] = useState<WorkspaceTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDeptName, setNewDeptName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState<Record<number | 'none', string>>({ none: '' });

  const load = () => {
    setLoading(true);
    Promise.all([getDepartments(bidUrlId), getTasks(bidUrlId)])
      .then(([d, t]) => { setDepartments(d.data); setTasks(t.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [bidUrlId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addDepartment = async () => {
    if (!newDeptName.trim()) return;
    try {
      await createDepartment(bidUrlId, newDeptName.trim());
      setNewDeptName('');
      load();
    } catch { show('Failed to create department.', 'error'); }
  };

  const removeDepartment = async (id: number) => {
    try { await deleteDepartment(bidUrlId, id); load(); } catch { show('Failed to delete department.', 'error'); }
  };

  const addTask = async (departmentId: number | null) => {
    const key = departmentId ?? 'none';
    const title = (newTaskTitle[key] || '').trim();
    if (!title) return;
    try {
      await createTask(bidUrlId, { title, departmentId: departmentId ?? undefined } as any);
      setNewTaskTitle((prev) => ({ ...prev, [key]: '' }));
      load();
    } catch { show('Failed to create task.', 'error'); }
  };

  const cycleStatus = async (task: WorkspaceTaskRow) => {
    const next = task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo';
    try {
      await updateTask(bidUrlId, task.id, { status: next });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    } catch { show('Failed to update task.', 'error'); }
  };

  const removeTask = async (id: number) => {
    try { await deleteTask(bidUrlId, id); setTasks((prev) => prev.filter((t) => t.id !== id)); } catch { show('Failed to delete task.', 'error'); }
  };

  if (loading) return <p className="text-sm text-gray-400">Loading workspace…</p>;

  const groups: (WorkspaceDepartmentRow | { id: null; name: string })[] = [...departments, { id: null, name: 'Unassigned' }];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex items-center gap-3">
        <input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDepartment()} placeholder="New department name (e.g. Documentation, Logistics)…" className="input flex-1" />
        <Button size="sm" icon={Plus} onClick={addDepartment}>Add Department</Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {groups.map((dept) => {
          const deptTasks = tasks.filter((t) => t.departmentId === dept.id);
          const key = dept.id ?? 'none';
          return (
            <div key={key} className="rounded-xl border border-gray-100 bg-white overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold text-sm text-gray-900"><FolderKanban size={14} className="text-primary-600" /> {dept.name}</span>
                {dept.id !== null && (
                  <button onClick={() => removeDepartment(dept.id!)} className="text-gray-300 hover:text-danger-600"><Trash2 size={13} /></button>
                )}
              </div>
              <div className="p-3 space-y-1.5 flex-1">
                {deptTasks.length === 0 && <p className="text-xs text-gray-400 px-1 py-2">No tasks yet.</p>}
                {deptTasks.map((task) => {
                  const Icon = STATUS_ICON[task.status];
                  return (
                    <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group">
                      <button onClick={() => cycleStatus(task)} className={task.status === 'done' ? 'text-success-600' : task.status === 'in_progress' ? 'text-amber-500' : 'text-gray-300'}>
                        <Icon size={16} />
                      </button>
                      <span className={`flex-1 text-sm ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task.title}</span>
                      <button onClick={() => removeTask(task.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-danger-600"><Trash2 size={13} /></button>
                    </div>
                  );
                })}
              </div>
              <div className="p-3 border-t border-gray-50 flex gap-2">
                <input
                  value={newTaskTitle[key] || ''}
                  onChange={(e) => setNewTaskTitle((prev) => ({ ...prev, [key]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addTask(dept.id)}
                  placeholder="Add a task…"
                  className="input flex-1 !py-1.5 !text-sm"
                />
                <Button size="sm" variant="secondary" onClick={() => addTask(dept.id)}>Add</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkspaceTab;

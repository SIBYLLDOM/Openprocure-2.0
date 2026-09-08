import { useEffect, useState } from 'react';
import { Plus, Trash2, Users, Calendar, AlertTriangle } from 'lucide-react';
import {
  getDepartments, createDepartment, deleteDepartment,
  getDeadlines, createDeadline, deleteDeadline,
  getTeam, resetDocPrep,
} from '../../../services/workspaceApi';
import type { WorkspaceDepartmentRow, WorkspaceDeadlineRow, TeamContact } from '../../../services/workspaceApi';
import { Button, Modal } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';

// Tender Hub > Settings — Departments, a read-only Team reference (pulled
// from this partner's own Setup-Profile contacts — see PartnerContact.js —
// standing in for the original's internal employee assignment), Deadlines,
// and a Danger Zone reset.
const SettingsTab = ({ bidUrlId }: { bidUrlId: string }) => {
  const { show } = useToast();
  const [departments, setDepartments] = useState<WorkspaceDepartmentRow[]>([]);
  const [deadlines, setDeadlines] = useState<WorkspaceDeadlineRow[]>([]);
  const [team, setTeam] = useState<TeamContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDept, setNewDept] = useState('');
  const [newDeadlineTitle, setNewDeadlineTitle] = useState('');
  const [newDeadlineDate, setNewDeadlineDate] = useState('');
  const [showReset, setShowReset] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getDepartments(bidUrlId), getDeadlines(bidUrlId), getTeam(bidUrlId)])
      .then(([d, dl, t]) => { setDepartments(d.data); setDeadlines(dl.data); setTeam(t.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [bidUrlId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addDept = async () => {
    if (!newDept.trim()) return;
    try { await createDepartment(bidUrlId, newDept.trim()); setNewDept(''); load(); } catch { show('Failed to add department.', 'error'); }
  };
  const removeDept = async (id: number) => {
    try { await deleteDepartment(bidUrlId, id); load(); } catch { show('Failed to delete department.', 'error'); }
  };
  const addDeadline = async () => {
    if (!newDeadlineTitle.trim() || !newDeadlineDate) return;
    try { await createDeadline(bidUrlId, newDeadlineTitle.trim(), newDeadlineDate); setNewDeadlineTitle(''); setNewDeadlineDate(''); load(); } catch { show('Failed to add deadline.', 'error'); }
  };
  const removeDeadline = async (id: number) => {
    try { await deleteDeadline(bidUrlId, id); load(); } catch { show('Failed to delete deadline.', 'error'); }
  };
  const doResetDocPrep = async () => {
    try { await resetDocPrep(bidUrlId); show('Doc Prep reset.', 'success'); } catch { show('Reset failed.', 'error'); } finally { setShowReset(false); }
  };

  if (loading) return <p className="text-sm text-gray-400">Loading settings…</p>;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h2 className="text-[13px] font-bold text-gray-900 mb-3">Departments</h2>
        <div className="flex gap-2 mb-3">
          <input value={newDept} onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDept()} placeholder="New department…" className="input flex-1" />
          <Button size="sm" icon={Plus} onClick={addDept}>Add</Button>
        </div>
        {departments.length === 0 ? (
          <p className="text-sm text-gray-400">No departments yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-full">
                {d.name}
                <button onClick={() => removeDept(d.id)} className="text-gray-400 hover:text-danger-600"><Trash2 size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h2 className="text-[13px] font-bold text-gray-900 mb-3 flex items-center gap-1.5"><Users size={14} /> Team</h2>
        {team.length === 0 ? (
          <p className="text-sm text-gray-400">No contacts on file — add contacts from your Setup Profile to see them here.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {team.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{c.name || 'Unnamed contact'}</p>
                  <p className="text-xs text-gray-500">{c.designation || '—'}</p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{c.email || '—'}</p>
                  <p>{c.mobile || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h2 className="text-[13px] font-bold text-gray-900 mb-3 flex items-center gap-1.5"><Calendar size={14} /> Time Management</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <input value={newDeadlineTitle} onChange={(e) => setNewDeadlineTitle(e.target.value)} placeholder="Deadline title…" className="input flex-1 min-w-[180px]" />
          <input type="date" value={newDeadlineDate} onChange={(e) => setNewDeadlineDate(e.target.value)} className="input !w-auto" />
          <Button size="sm" icon={Plus} onClick={addDeadline}>Add</Button>
        </div>
        {deadlines.length === 0 ? (
          <p className="text-sm text-gray-400">No deadlines set.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {deadlines.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{d.title}</p>
                  <p className="text-xs text-gray-500">{new Date(d.dueDate).toLocaleDateString('en-IN')}</p>
                </div>
                <button onClick={() => removeDeadline(d.id)} className="text-gray-300 hover:text-danger-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-danger-200 bg-danger-50/40 p-5">
        <h2 className="text-[13px] font-bold text-danger-700 mb-1 flex items-center gap-1.5"><AlertTriangle size={14} /> Danger Zone</h2>
        <p className="text-xs text-gray-600 mb-3">Wipes this tender's Doc Prep checklist and drafts only — tasks, departments, and deadlines are kept.</p>
        <Button size="sm" variant="danger" onClick={() => setShowReset(true)}>Reset Doc Prep</Button>
      </div>

      {showReset && (
        <Modal open onClose={() => setShowReset(false)} title="Reset Doc Prep?" size="sm"
          footer={<><Button variant="secondary" onClick={() => setShowReset(false)}>Cancel</Button><Button variant="danger" onClick={doResetDocPrep}>Reset</Button></>}>
          <p className="text-sm text-gray-600">This permanently clears the Doc Prep checklist and any generated drafts for this tender.</p>
        </Modal>
      )}
    </div>
  );
};

export default SettingsTab;

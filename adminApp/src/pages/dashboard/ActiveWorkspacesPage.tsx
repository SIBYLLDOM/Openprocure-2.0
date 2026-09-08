import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, LayoutGrid, List, Clock3, MapPin, CheckCircle2 } from 'lucide-react';
import { getActiveWorkspaces } from '../../services/workdeskApi';
import type { WorkspaceRow } from '../../services/workdeskApi';
import { postTenderStatus } from '../../services/tenderApi';
import { Modal, Button, Select } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'review', label: 'Needs Review' },
];

const STATUS_BADGE: Record<WorkspaceRow['status'], string> = {
  active: 'bg-primary-50 text-primary-700',
  urgent: 'bg-danger-50 text-danger-700',
  review: 'bg-amber-50 text-amber-700',
};

const daysLeftLabel = (hoursLeft: number | null) => {
  if (hoursLeft == null) return null;
  if (hoursLeft < 0) return 'Closed';
  if (hoursLeft < 24) return `${hoursLeft} hrs left`;
  return `${Math.floor(hoursLeft / 24)} days left`;
};

const CloseWorkspaceModal = ({ workspace, onClose, onDone }: { workspace: WorkspaceRow; onClose: () => void; onDone: () => void }) => {
  const { show } = useToast();
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    try {
      await postTenderStatus(workspace.urlId, 'close', remarks);
      show('Workspace closed.', 'success');
      onDone();
    } catch {
      show('Failed to close workspace.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Close Workspace?" size="sm"
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button variant="danger" loading={saving} onClick={confirm}>Close Workspace</Button></>}>
      <p className="text-sm text-gray-600 mb-4">
        You're closing the workspace for <strong className="text-gray-900">{workspace.bidNumber}</strong>. It will move out of Active Workspaces.
      </p>
      <label className="label">Closing Remarks (optional)</label>
      <textarea autoFocus rows={3} className="input" placeholder="Why is this workspace closing? (won, lost, dropped…)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
    </Modal>
  );
};

// Clone of the automation site's "Active Workspaces" — a tender the partner
// has marked "proceed" and hasn't since closed. See tenderController.js's
// getActiveWorkspaces for why this is a derived view (no dedicated
// workspaces table), matching the original's own architecture.
const ActiveWorkspacesPage = () => {
  const navigate = useNavigate();
  const { name, id } = useParams();
  const base = `/${window.location.pathname.split('/')[1]}/${name}/${id}/tenders`;

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<WorkspaceRow | null>(null);

  const load = () => {
    setLoading(true);
    getActiveWorkspaces({ search, status: status === 'all' ? undefined : status })
      .then((r) => setRows(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  usePageHeader('Active Workspaces', `${rows.length} open workspace${rows.length === 1 ? '' : 's'} across your pursued tenders.`);

  const counts = useMemo(() => ({
    active: rows.filter((r) => r.status === 'active').length,
    urgent: rows.filter((r) => r.status === 'urgent').length,
    review: rows.filter((r) => r.status === 'review').length,
  }), [rows]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="text-2xl font-bold text-primary-700">{counts.active}</p>
          <p className="text-xs font-semibold text-gray-500 mt-0.5">Active</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="text-2xl font-bold text-danger-600">{counts.urgent}</p>
          <p className="text-xs font-semibold text-gray-500 mt-0.5">Urgent (closing ≤48h)</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="text-2xl font-bold text-amber-600">{counts.review}</p>
          <p className="text-xs font-semibold text-gray-500 mt-0.5">Needs Review (7d+ idle)</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by bid number or title…" className="input w-full !pl-9" />
        </div>
        <Select wrapperClassName="w-44" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} />
        <div className="inline-flex rounded-lg border border-gray-200 p-1">
          <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-primary-950 text-white' : 'text-gray-500 hover:bg-gray-50'}`}><LayoutGrid size={15} /></button>
          <button onClick={() => setView('list')} className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-primary-950 text-white' : 'text-gray-500 hover:bg-gray-50'}`}><List size={15} /></button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">Loading workspaces…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">
          No open workspaces. Mark a tender "Proceed" from its Tender Status action to open one.
        </div>
      ) : (
        <div className={view === 'grid' ? 'grid sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'flex flex-col gap-3'}>
          {rows.map((w) => {
            const daysLeft = daysLeftLabel(w.hoursLeft);
            return (
              <div key={w.bidNumber} className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-gray-400 truncate">{w.bidNumber}</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5 line-clamp-2">{w.title}</p>
                  </div>
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[w.status]}`}>{w.status}</span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  {w.dept && <span className="font-semibold text-primary-700">{w.dept}</span>}
                  {w.state && <span className="flex items-center gap-1"><MapPin size={11} /> {w.state}</span>}
                  {daysLeft && (
                    <span className={`flex items-center gap-1 font-semibold ${w.status === 'urgent' ? 'text-danger-600' : ''}`}><Clock3 size={11} /> {daysLeft}</span>
                  )}
                </div>

                {w.remarks && <p className="text-xs text-gray-500 italic line-clamp-2">"{w.remarks}"</p>}

                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-50">
                  <Button size="sm" className="flex-1" onClick={() => navigate(`${base}/workspace/${w.urlId}`)}>Open Workspace</Button>
                  <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => setClosing(w)}>Close</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {closing && (
        <CloseWorkspaceModal
          workspace={closing}
          onClose={() => setClosing(null)}
          onDone={() => { setClosing(null); load(); }}
        />
      )}
    </div>
  );
};

export default ActiveWorkspacesPage;

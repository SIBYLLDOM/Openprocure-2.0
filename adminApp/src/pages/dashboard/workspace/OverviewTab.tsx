import { useEffect, useState } from 'react';
import { FolderKanban, ListChecks, FileText, StickyNote, Clock3 } from 'lucide-react';
import { getWorkspaceOverview } from '../../../services/workspaceApi';
import type { WorkspaceOverview } from '../../../services/workspaceApi';
import { StatCard } from '../../../components/ui';

const formatMoney = (v: string | null) => (v ? `₹${Number(v).toLocaleString('en-IN')}` : 'Not Specified');

const OverviewTab = ({ bidUrlId }: { bidUrlId: string }) => {
  const [data, setData] = useState<WorkspaceOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorkspaceOverview(bidUrlId).then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [bidUrlId]);

  if (loading) return <p className="text-sm text-gray-400">Loading overview…</p>;
  if (!data) return <p className="text-sm text-gray-400">Could not load this workspace.</p>;

  const { tender, summary, timeline } = data;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-6">
        <h2 className="text-[15px] font-bold text-gray-900 mb-1">Project Overview</h2>
        <p className="text-xs text-gray-400 mb-4">Tender Details</p>
        <p className="text-sm font-semibold text-primary-700 mb-4">{tender.title}</p>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Tender ID</label>
            <p className="text-sm font-medium text-gray-800 mt-1">{tender.bidNumber}</p>
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Status</label>
            <p className="text-sm font-medium text-gray-800 mt-1 capitalize">{tender.status || 'N/A'}</p>
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Deadline</label>
            <p className="text-sm font-medium text-gray-800 mt-1">{tender.endDate || 'N/A'}</p>
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Value / Budget</label>
            <p className="text-sm font-medium text-gray-800 mt-1">{formatMoney(tender.bidValue)}</p>
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Department</label>
            <p className="text-sm font-medium text-gray-800 mt-1">{tender.department || 'N/A'}</p>
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Division</label>
            <p className="text-sm font-medium text-gray-800 mt-1">{tender.dept || 'N/A'}</p>
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">State</label>
            <p className="text-sm font-medium text-gray-800 mt-1">{tender.state || 'N/A'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Departments" value={summary.departments} icon={FolderKanban} accent="primary" />
        <StatCard label="Tasks" value={`${summary.tasksDone}/${summary.totalTasks}`} icon={ListChecks} accent="teal" />
        <StatCard label="Documents" value={summary.documents} icon={FileText} accent="amber" />
        <StatCard label="My Docs" value={summary.myDocs} icon={StickyNote} accent="violet" />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h3 className="text-[13px] font-bold text-gray-900 mb-4 flex items-center gap-1.5"><Clock3 size={14} /> Activity Timeline</h3>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-400">No activity yet.</p>
        ) : (
          <div className="space-y-3">
            {timeline.map((event, i) => (
              <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 font-medium">{event.label}</p>
                  {event.detail && <p className="text-xs text-gray-500">{event.detail}</p>}
                  <p className="text-[11px] text-gray-400 mt-0.5">{new Date(event.at).toLocaleString('en-IN')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OverviewTab;

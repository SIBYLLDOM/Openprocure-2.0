import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getParticipatedTenders, updateParticipatedTenderNote } from '../../services/tenderApi';
import type { ParticipatedTenderRow } from '../../services/tenderApi';
import { Select, Pagination } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';

const DEPT_OPTIONS = [
  { value: '', label: 'All Divisions' },
  { value: 'diagno', label: 'Diagno' },
  { value: 'endo', label: 'Endo' },
];

// Clone of the automation site's "Participated Tenders" page
// (Insights > Participated Tender / WinningProbability.jsx) — a tender only
// shows up here once the automation pipeline itself has already flagged it
// tender_processing_results.result = 'yes' (there's no manual "mark as
// participated" step). RA Date / Remarks are this partner's own notes,
// saved on blur exactly like the original's inline-editable columns.
const ParticipatedTendersPage = () => {
  const navigate = useNavigate();
  const { name, id } = useParams();
  const { show } = useToast();
  const base = `/${window.location.pathname.split('/')[1]}/${name}/${id}/tenders`;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [rows, setRows] = useState<ParticipatedTenderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingBid, setSavingBid] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      getParticipatedTenders({ page, limit: 20, search, dept, startDate, endDate })
        .then((r) => { setRows(r.data); setTotal(r.total); })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [page, search, dept, startDate, endDate]);

  const saveNote = async (row: ParticipatedTenderRow, field: 'ra_date' | 'remarks', value: string) => {
    setRows((prev) => prev.map((r) => (r.bid_number === row.bid_number ? { ...r, [field]: value } : r)));
    setSavingBid(row.bid_number);
    try {
      await updateParticipatedTenderNote(row.url_id, field === 'ra_date' ? { raDate: value || null } : { remarks: value || null });
    } catch {
      show('Failed to save.', 'error');
    } finally {
      setSavingBid(null);
    }
  };

  usePageHeader('Participated Tenders', `${total.toLocaleString('en-IN')} tender${total === 1 ? '' : 's'} already marked relevant by the automation pipeline.`);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Search by bid number…"
            className="input w-full !pl-9"
          />
        </div>
        <Select wrapperClassName="w-40" value={dept} onChange={(e) => { setPage(1); setDept(e.target.value); }} options={DEPT_OPTIONS} />
        <div className="flex items-center gap-2 text-sm text-gray-600">
          Start
          <input type="date" value={startDate} onChange={(e) => { setPage(1); setStartDate(e.target.value); }} className="input !w-auto !py-1.5" />
          <span>to</span>
          <input type="date" value={endDate} onChange={(e) => { setPage(1); setEndDate(e.target.value); }} className="input !w-auto !py-1.5" />
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading participated tenders…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No participated tenders match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">S.No</th>
                  <th className="px-4 py-3">Bid No</th>
                  <th className="px-4 py-3">Division</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">RA Date</th>
                  <th className="px-4 py-3">QTY</th>
                  <th className="px-4 py-3">Opening Date</th>
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.bid_number} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-gray-500">{i + 1 + (page - 1) * 20}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => navigate(`${base}/${r.url_id}`)} className="font-semibold text-primary-700 hover:underline">
                        {r.bid_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-700">{r.dept || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-700">{r.state || 'N/A'}</td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        defaultValue={r.ra_date || ''}
                        onBlur={(e) => saveNote(r, 'ra_date', e.target.value)}
                        disabled={savingBid === r.bid_number}
                        className="input !w-auto !py-1 !text-xs"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.quantity || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.start_date || 'N/A'}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        defaultValue={r.remarks || ''}
                        onBlur={(e) => saveNote(r, 'remarks', e.target.value)}
                        disabled={savingBid === r.bid_number}
                        placeholder="Add remarks…"
                        className="input !py-1 !text-xs min-w-[160px]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalItems={total} pageSize={20} onPageChange={setPage} />
      </div>
    </div>
  );
};

export default ParticipatedTendersPage;

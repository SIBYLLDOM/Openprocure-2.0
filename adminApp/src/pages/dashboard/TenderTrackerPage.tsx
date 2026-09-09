import { useEffect, useMemo, useState } from 'react';
import { Search, Download, RefreshCw } from 'lucide-react';
import { getTenderTracker, saveTenderTrackerOverride, getRemarkOptions, exportTenderTrackerCsv } from '../../services/tenderTrackerApi';
import type { TenderTrackerRow, TenderTrackerOverridePayload } from '../../services/tenderTrackerApi';
import { Select, Button, Pagination } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';

const DEPT_CHIPS = [{ value: '', label: 'All' }, { value: 'endo', label: 'Endo' }, { value: 'diagno', label: 'Diagno' }];
const SOURCE_CHIPS = [{ value: '', label: 'All' }, { value: 'gem', label: 'GeM' }, { value: 'open', label: 'Open' }];

type EditableField = keyof Pick<TenderTrackerRow, 'zh' | 'flsp' | 'db_ho_dp_np' | 'db_name' | 'sap_material_code' | 'emd_override' | 'final_remarks' | 'zm' | 'ho_person' | 'zone' | 'feedback_response'>;
const FIELD_TO_PAYLOAD: Record<EditableField, keyof TenderTrackerOverridePayload> = {
  zh: 'zh', flsp: 'flsp', db_ho_dp_np: 'dbHoDpNp', db_name: 'dbName', sap_material_code: 'sapMaterialCode',
  emd_override: 'emdOverride', final_remarks: 'finalRemarks', zm: 'zm', ho_person: 'hoPerson', zone: 'zone', feedback_response: 'feedbackResponse',
};

// Tenders > Tender Tracker — see backend/controllers/tenderTrackerController.js
// for the reasoning behind what was cloned vs deliberately dropped from the
// reference AUTOMATION SITE page (no fabricated L1/L2/L3 pricing or
// staff-roster dropdowns; everything shown here is real migrated tender
// data plus this partner's own manual tracking notes).
const TenderTrackerPage = () => {
  const { show } = useToast();
  const [rows, setRows] = useState<TenderTrackerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [source, setSource] = useState('');
  const [remarks, setRemarks] = useState('');
  const [remarkOptions, setRemarkOptions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  usePageHeader('Tender Tracker', `${total.toLocaleString('en-IN')} tender${total === 1 ? '' : 's'} tracked across GeM and Open sources.`);

  const load = () => {
    setLoading(true);
    getTenderTracker({ page, limit: 40, search, dept, source, remarks }).then((r) => { setRows(r.data); setTotal(r.total); }).finally(() => setLoading(false));
  };

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [page, search, dept, source, remarks]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { getRemarkOptions().then((r) => setRemarkOptions(r.data)); }, []);

  const remarkFilterOptions = useMemo(() => [
    { value: '', label: 'All Remarks' },
    { value: '__blank__', label: 'Blank / Not set' },
    ...remarkOptions.map((r) => ({ value: r, label: r })),
  ], [remarkOptions]);

  const saveField = async (row: TenderTrackerRow, field: EditableField, value: string) => {
    const key = `${row.source}:${row.tender_no}`;
    setRows((prev) => prev.map((r) => (r.tender_no === row.tender_no && r.source === row.source ? { ...r, [field]: value } : r)));
    setSavingKey(key);
    try {
      await saveTenderTrackerOverride({ tenderNo: row.tender_no, source: row.source, [FIELD_TO_PAYLOAD[field]]: value } as TenderTrackerOverridePayload);
    } catch {
      show('Failed to save.', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const from = total === 0 ? 0 : (page - 1) * 40 + 1;
  const to = Math.min(page * 40, total);

  const EditCell = ({ row, field, placeholder, width = 'min-w-[110px]' }: { row: TenderTrackerRow; field: EditableField; placeholder?: string; width?: string }) => (
    <input
      type="text"
      defaultValue={row[field] || ''}
      onBlur={(e) => { if (e.target.value !== (row[field] || '')) saveField(row, field, e.target.value); }}
      disabled={savingKey === `${row.source}:${row.tender_no}`}
      placeholder={placeholder}
      className={`input !py-1 !text-xs ${width}`}
    />
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search by tender no., dept or state…" className="input w-full !pl-9" />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1">
          {DEPT_CHIPS.map((c) => (
            <button key={c.value} type="button" onClick={() => { setPage(1); setDept(c.value); }} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${dept === c.value ? 'bg-primary-950 text-white' : 'text-gray-600'}`}>{c.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1">
          {SOURCE_CHIPS.map((c) => (
            <button key={c.value} type="button" onClick={() => { setPage(1); setSource(c.value); }} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${source === c.value ? 'bg-primary-950 text-white' : 'text-gray-600'}`}>{c.label}</button>
          ))}
        </div>
        <Select wrapperClassName="w-44" value={remarks} onChange={(e) => { setPage(1); setRemarks(e.target.value); }} options={remarkFilterOptions} />
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
        <Button size="sm" variant="secondary" icon={Download} onClick={() => exportTenderTrackerCsv({ search, dept, source, remarks })}>Export to Excel</Button>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <p className="px-4 py-2.5 text-xs text-gray-500 border-b border-gray-50">Showing {from}–{to} of {total.toLocaleString('en-IN')}</p>
        {loading && rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading tender tracker…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No tenders match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  <th className="px-3 py-2.5">S.No</th>
                  <th className="px-3 py-2.5">Tender No</th>
                  <th className="px-3 py-2.5">FY Year</th>
                  <th className="px-3 py-2.5">State</th>
                  <th className="px-3 py-2.5">ZH</th>
                  <th className="px-3 py-2.5">FLSP</th>
                  <th className="px-3 py-2.5">Location</th>
                  <th className="px-3 py-2.5">Customer Name</th>
                  <th className="px-3 py-2.5">Due Date</th>
                  <th className="px-3 py-2.5">DB/HO/DP/NP</th>
                  <th className="px-3 py-2.5">DB Name</th>
                  <th className="px-3 py-2.5">SAP Code</th>
                  <th className="px-3 py-2.5">EMD Amt</th>
                  <th className="px-3 py-2.5">Final Remarks</th>
                  <th className="px-3 py-2.5">ZM</th>
                  <th className="px-3 py-2.5">HO Person</th>
                  <th className="px-3 py-2.5">Zone</th>
                  <th className="px-3 py-2.5">Feedback Response</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.source}:${r.tender_no}`} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-gray-500">{i + 1 + (page - 1) * 40}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800">
                      <div className="w-[200px] flex items-center gap-1.5">
                        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${r.source === 'gem' ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-amber-700'}`}>{r.source}</span>
                        <span className="truncate" title={r.tender_no}>{r.tender_no}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.fy_year || '-'}</td>
                    <td className="px-3 py-2 text-gray-600"><div className="w-[110px] truncate" title={r.state || ''}>{r.state || '-'}</div></td>
                    <td className="px-3 py-2"><EditCell row={r} field="zh" placeholder="ZH" /></td>
                    <td className="px-3 py-2"><EditCell row={r} field="flsp" placeholder="FLSP" /></td>
                    <td className="px-3 py-2 text-gray-600"><div className="w-[140px] truncate" title={r.location || ''}>{r.location || '-'}</div></td>
                    <td className="px-3 py-2 text-gray-600"><div className="w-[160px] truncate" title={r.customer_name || ''}>{r.customer_name || '-'}</div></td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.due_date || '-'}</td>
                    <td className="px-3 py-2"><EditCell row={r} field="db_ho_dp_np" placeholder="DB/HO/DP/NP" /></td>
                    <td className="px-3 py-2"><EditCell row={r} field="db_name" placeholder="DB Name" /></td>
                    <td className="px-3 py-2"><EditCell row={r} field="sap_material_code" placeholder="SAP Code" /></td>
                    <td className="px-3 py-2"><EditCell row={r} field="emd_override" placeholder={r.emd_amount || 'EMD'} width="w-24" /></td>
                    <td className="px-3 py-2"><EditCell row={r} field="final_remarks" placeholder="Remarks" width="min-w-[140px]" /></td>
                    <td className="px-3 py-2"><EditCell row={r} field="zm" placeholder="ZM" /></td>
                    <td className="px-3 py-2"><EditCell row={r} field="ho_person" placeholder="HO Person" /></td>
                    <td className="px-3 py-2"><EditCell row={r} field="zone" placeholder="Zone" width="w-24" /></td>
                    <td className="px-3 py-2"><EditCell row={r} field="feedback_response" placeholder="Feedback" width="min-w-[140px]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalItems={total} pageSize={40} onPageChange={setPage} />
      </div>
    </div>
  );
};

export default TenderTrackerPage;

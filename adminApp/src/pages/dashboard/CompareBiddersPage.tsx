import { useEffect, useMemo, useState } from 'react';
import { Crown } from 'lucide-react';
import { getSellers, compareBidders } from '../../services/analyticsApi';
import type { CompareBiddersData } from '../../services/analyticsApi';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { Button } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';

const formatMoney = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const PAGE_SIZE = 10;

function usePaged<T>(rows: T[]) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { page, setPage, totalPages, paged };
}

const PagerFooter = ({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-50">
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Prev</button>
      <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
    </div>
  );
};

const KpiBattleRow = ({ label, a, b, format = (v: number) => v.toLocaleString('en-IN') }: { label: string; a: number; b: number; format?: (v: number) => string }) => {
  const aWins = a > b;
  const bWins = b > a;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 border-t border-gray-50 first:border-t-0">
      <div className={`text-right ${aWins ? 'text-primary-700' : 'text-gray-700'}`}>
        <span className="text-base font-bold">{format(a)}</span>
        {aWins && <Crown size={13} className="inline-block ml-1.5 text-amber-500" />}
      </div>
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-2 whitespace-nowrap">{label}</div>
      <div className={`text-left ${bWins ? 'text-primary-700' : 'text-gray-700'}`}>
        {bWins && <Crown size={13} className="inline-block mr-1.5 text-amber-500" />}
        <span className="text-base font-bold">{format(b)}</span>
      </div>
    </div>
  );
};

// Clone of the automation site's "Compare Competitors"
// (/insights/Compare-Bidders) — head-to-head KPI/price/state comparison
// between any two sellers that appear in the migrated `contracts` table.
const CompareBiddersPage = () => {
  const { show } = useToast();
  const [sellers, setSellers] = useState<string[]>([]);
  const [sellerA, setSellerA] = useState('');
  const [sellerB, setSellerB] = useState('');
  const [data, setData] = useState<CompareBiddersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSellers, setLoadingSellers] = useState(true);

  useEffect(() => {
    getSellers().then((r) => {
      setSellers(r.data);
      if (r.data.length > 1) { setSellerA(r.data[0]); setSellerB(r.data[1]); }
    }).finally(() => setLoadingSellers(false));
  }, []);

  const sellerOptions = useMemo(() => sellers.map((s) => ({ value: s, label: s })), [sellers]);

  const run = async () => {
    if (!sellerA || !sellerB) return;
    if (sellerA === sellerB) { show('Choose two different sellers.', 'error'); return; }
    setLoading(true);
    try {
      const r = await compareBidders(sellerA, sellerB);
      setData(r.data);
    } catch (err: any) {
      show(err?.response?.data?.message || 'Failed to compare sellers.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const priceRows = usePaged(data?.priceComparison ?? []);
  const stateRows = usePaged(data?.stateComparison ?? []);
  const recentRows = usePaged(data?.recentContracts ?? []);

  usePageHeader('Compare Competitors', 'Head-to-head KPI, pricing, and state-coverage comparison between two sellers.');

  return (
    <div className="space-y-5">

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-end gap-3">
        <SearchableSelect
          className="w-64"
          label="Competitor A"
          value={sellerA}
          onChange={setSellerA}
          options={sellerOptions}
          placeholder={loadingSellers ? 'Loading…' : 'Select seller…'}
          searchPlaceholder="Search sellers…"
        />
        <span className="text-sm font-bold text-gray-400 pb-2.5">VS</span>
        <SearchableSelect
          className="w-64"
          label="Competitor B"
          value={sellerB}
          onChange={setSellerB}
          options={sellerOptions}
          placeholder={loadingSellers ? 'Loading…' : 'Select seller…'}
          searchPlaceholder="Search sellers…"
        />
        <Button loading={loading} disabled={!sellerA || !sellerB} onClick={run}>Run Comparison</Button>
      </div>

      {!data ? (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">Pick two sellers and run the comparison.</div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-100 bg-white p-5">
            <div className="flex items-center justify-center gap-6 mb-2">
              <h3 className="text-base font-bold text-gray-900 text-right flex-1 truncate">{data.seller1.sellerName}</h3>
              <span className="flex-shrink-0 w-9 h-9 rounded-full bg-primary-950 text-white text-xs font-bold flex items-center justify-center">VS</span>
              <h3 className="text-base font-bold text-gray-900 flex-1 truncate">{data.seller2.sellerName}</h3>
            </div>
            <div className="divide-y divide-gray-50">
              <KpiBattleRow label="Total Contracts" a={data.seller1.totalContracts} b={data.seller2.totalContracts} />
              <KpiBattleRow label="Total Revenue" a={data.seller1.totalRevenue} b={data.seller2.totalRevenue} format={formatMoney} />
              <KpiBattleRow label="Avg Contract Value" a={data.seller1.avgValue} b={data.seller2.avgValue} format={formatMoney} />
              <KpiBattleRow label="Direct Supply %" a={data.seller1.directSupplyPct} b={data.seller2.directSupplyPct} format={(v) => `${v}%`} />
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <h2 className="px-4 pt-4 pb-2 text-[13px] font-bold text-gray-900">Product-Level Price Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Brand</th>
                    <th className="px-4 py-2.5">{data.seller1.sellerName}</th>
                    <th className="px-4 py-2.5">{data.seller2.sellerName}</th>
                    <th className="px-4 py-2.5">Δ %</th>
                  </tr>
                </thead>
                <tbody>
                  {priceRows.paged.map((r, i) => {
                    const diffPct = r.seller1AvgPrice && r.seller2AvgPrice
                      ? Math.round(((r.seller2AvgPrice - r.seller1AvgPrice) / r.seller1AvgPrice) * 1000) / 10
                      : null;
                    return (
                      <tr key={`${r.product}-${i}`} className="border-t border-gray-50">
                        <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate">{r.product}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.brand}</td>
                        <td className="px-4 py-2.5 text-gray-700">{r.seller1AvgPrice ? formatMoney(r.seller1AvgPrice) : '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700">{r.seller2AvgPrice ? formatMoney(r.seller2AvgPrice) : '—'}</td>
                        <td className="px-4 py-2.5">
                          {diffPct !== null ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${diffPct > 0 ? 'bg-danger-50 text-danger-600' : diffPct < 0 ? 'bg-success-50 text-success-600' : 'bg-gray-100 text-gray-600'}`}>
                              {diffPct > 0 ? '+' : ''}{diffPct}%
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PagerFooter page={priceRows.page} totalPages={priceRows.totalPages} onPageChange={priceRows.setPage} />
          </div>

          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <h2 className="px-4 pt-4 pb-2 text-[13px] font-bold text-gray-900">State Penetration</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5">State</th>
                    <th className="px-4 py-2.5">{data.seller1.sellerName}</th>
                    <th className="px-4 py-2.5">{data.seller2.sellerName}</th>
                  </tr>
                </thead>
                <tbody>
                  {stateRows.paged.map((r) => (
                    <tr key={r.state} className="border-t border-gray-50">
                      <td className="px-4 py-2.5 text-gray-800">{r.state}</td>
                      <td className={`px-4 py-2.5 font-semibold ${r.seller1Revenue >= r.seller2Revenue ? 'text-primary-700' : 'text-gray-600'}`}>{formatMoney(r.seller1Revenue)}</td>
                      <td className={`px-4 py-2.5 font-semibold ${r.seller2Revenue >= r.seller1Revenue ? 'text-primary-700' : 'text-gray-600'}`}>{formatMoney(r.seller2Revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PagerFooter page={stateRows.page} totalPages={stateRows.totalPages} onPageChange={stateRows.setPage} />
          </div>

          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <h2 className="px-4 pt-4 pb-2 text-[13px] font-bold text-gray-900">Recent Contracts</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5">Seller</th>
                    <th className="px-4 py-2.5">State</th>
                    <th className="px-4 py-2.5">Brand</th>
                    <th className="px-4 py-2.5">Value</th>
                    <th className="px-4 py-2.5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.paged.map((r, i) => (
                    <tr key={`${r.contractNo}-${i}`} className="border-t border-gray-50">
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.sellerName === data.seller1.sellerName ? 'bg-primary-50 text-primary-700' : 'bg-teal-50 text-teal-700'}`}>
                          {r.sellerName}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{r.state || 'N/A'}</td>
                      <td className="px-4 py-2.5 text-gray-700">{r.brand || 'N/A'}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{r.totalValue ? `₹${Number(r.totalValue).toLocaleString('en-IN')}` : 'N/A'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{r.contractDate || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PagerFooter page={recentRows.page} totalPages={recentRows.totalPages} onPageChange={recentRows.setPage} />
          </div>
        </>
      )}
    </div>
  );
};

export default CompareBiddersPage;

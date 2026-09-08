import { useEffect, useMemo, useState } from 'react';
import { FileText, IndianRupee, TrendingUp, MapPin, Tag, Truck, RotateCcw } from 'lucide-react';
import { getSellers, getCompanyProfile } from '../../services/analyticsApi';
import type { CompanyProfileData } from '../../services/analyticsApi';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { StatCard } from '../../components/ui/StatCard';
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

// Clone of the automation site's "Competitor Portfolio Tracking"
// (/insights/Company-Profile) — pick any seller that has appeared in the
// migrated `contracts` table (GeM-awarded contracts, not scoped to Meril)
// and see their KPIs plus state/brand/product breakdown.
const CompanyProfilePage = () => {
  const [sellers, setSellers] = useState<string[]>([]);
  const [seller, setSeller] = useState('');
  const [data, setData] = useState<CompanyProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSellers, setLoadingSellers] = useState(true);

  useEffect(() => {
    getSellers().then((r) => {
      setSellers(r.data);
      if (r.data.length) setSeller(r.data[0]);
    }).finally(() => setLoadingSellers(false));
  }, []);

  useEffect(() => {
    if (!seller) { setData(null); return; }
    setLoading(true);
    getCompanyProfile(seller).then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [seller]);

  const sellerOptions = useMemo(() => sellers.map((s) => ({ value: s, label: s })), [sellers]);

  const statePager = usePaged(data?.stateWise ?? []);
  const brandPager = usePaged(data?.brandWise ?? []);
  const productPager = usePaged(data?.products ?? []);

  usePageHeader('Competitor Portfolio Tracking', 'Awarded-contract footprint for any seller in the market, sourced from GeM contract data.');

  return (
    <div className="space-y-5">

      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-end gap-3">
        <SearchableSelect
          className="w-72"
          label="Competitor / Seller"
          value={seller}
          onChange={setSeller}
          options={sellerOptions}
          placeholder={loadingSellers ? 'Loading sellers…' : 'Select a seller…'}
          searchPlaceholder="Search sellers…"
        />
        <button
          onClick={() => setSeller(sellers[0] || '')}
          className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">Loading portfolio…</div>
      ) : !data ? (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">Select a seller to view their portfolio.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Total Contracts" value={data.kpis.totalContracts.toLocaleString('en-IN')} icon={FileText} accent="primary" />
            <StatCard label="Total Revenue" value={formatMoney(data.kpis.totalRevenue)} icon={IndianRupee} accent="teal" />
            <StatCard label="Avg Contract Value" value={formatMoney(data.kpis.avgContractValue)} icon={TrendingUp} accent="violet" />
            <StatCard label="States Covered" value={data.kpis.statesCovered} icon={MapPin} accent="amber" />
            <StatCard label="Brands Supplied" value={data.kpis.brandsSupplied} icon={Tag} accent="rose" />
            <StatCard label="Direct Supply %" value={`${data.kpis.directSupplyPct}%`} icon={Truck} accent="indigo" />
          </div>

          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <h2 className="px-4 pt-4 pb-2 text-[13px] font-bold text-gray-900">State-wise Revenue</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5">State</th>
                    <th className="px-4 py-2.5">Contracts</th>
                    <th className="px-4 py-2.5">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {statePager.paged.map((r) => (
                    <tr key={r.state} className="border-t border-gray-50">
                      <td className="px-4 py-2.5 text-gray-800">{r.state}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.contracts}</td>
                      <td className="px-4 py-2.5 font-semibold text-primary-700">{formatMoney(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PagerFooter page={statePager.page} totalPages={statePager.totalPages} onPageChange={statePager.setPage} />
          </div>

          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <h2 className="px-4 pt-4 pb-2 text-[13px] font-bold text-gray-900">Brand-wise Market Penetration</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5">Brand</th>
                    <th className="px-4 py-2.5">Contracts</th>
                    <th className="px-4 py-2.5">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {brandPager.paged.map((r) => (
                    <tr key={r.brand} className="border-t border-gray-50">
                      <td className="px-4 py-2.5 text-gray-800">{r.brand}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.contracts}</td>
                      <td className="px-4 py-2.5 font-semibold text-primary-700">{formatMoney(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PagerFooter page={brandPager.page} totalPages={brandPager.totalPages} onPageChange={brandPager.setPage} />
          </div>

          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <h2 className="px-4 pt-4 pb-2 text-[13px] font-bold text-gray-900">Product Market Strength & Pricing Analysis</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Brand</th>
                    <th className="px-4 py-2.5">Qty Sold</th>
                    <th className="px-4 py-2.5">Revenue</th>
                    <th className="px-4 py-2.5">Avg Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {productPager.paged.map((r, i) => (
                    <tr key={`${r.product}-${i}`} className="border-t border-gray-50">
                      <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate">{r.product}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.brand}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.qtySold.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2.5 font-semibold text-primary-700">{formatMoney(r.revenue)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{formatMoney(r.avgUnitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PagerFooter page={productPager.page} totalPages={productPager.totalPages} onPageChange={productPager.setPage} />
          </div>
        </>
      )}
    </div>
  );
};

export default CompanyProfilePage;

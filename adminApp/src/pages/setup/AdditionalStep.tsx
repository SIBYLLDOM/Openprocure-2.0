import { useState } from 'react';
import { Input } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import * as setupApi from '../../services/setupProfileApi';
import type { PartnerProfileData, AdditionalInfo } from '../../types/setupProfile';

const CUSTOMER_SEGMENTS = ['B2B', 'B2C', 'B2B2C', 'Government', 'Enterprise', 'Retail', 'Distributor', 'Dealer'];

const AdditionalStep = ({ profile, onSaved }: { profile: PartnerProfileData; onSaved: (p: PartnerProfileData) => void }) => {
  const { show } = useToast();
  const [form, setForm] = useState<AdditionalInfo>(profile.additionalInfo || {});
  const set = (k: keyof AdditionalInfo, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // No explicit Save button on this step — fields persist on blur, and the
  // customer-segment toggle chips persist the instant they're clicked.
  const persist = (next: AdditionalInfo) => setupApi.saveSection('additionalInfo', next).then(onSaved).catch(() => show('Failed to save.', 'error'));

  const toggleSegment = (s: string) => {
    const cur = form.customerSegments || [];
    const next = { ...form, customerSegments: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] };
    setForm(next);
    persist(next);
  };

  return (
    <div>
      <div className="grid lg:grid-cols-2 gap-x-10 gap-y-6">
        <div className="rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Reach & Scale</h3>
          <div className="grid sm:grid-cols-2 gap-5">
            <Input label="Key Products" placeholder="Comma-separated" wrapperClassName="sm:col-span-2" value={form.keyProducts || ''} onChange={(e) => set('keyProducts', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Key Markets" placeholder="e.g. Healthcare, Manufacturing" value={form.keyMarkets || ''} onChange={(e) => set('keyMarkets', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Countries Served" placeholder="e.g. India, UAE" value={form.countriesServed || ''} onChange={(e) => set('countriesServed', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Number of Branches" placeholder="e.g. 5" value={form.branchCount || ''} onChange={(e) => set('branchCount', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Number of Warehouses" placeholder="e.g. 3" value={form.warehouseCount || ''} onChange={(e) => set('warehouseCount', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Annual Turnover Range" placeholder="e.g. ₹10-50 Cr" value={form.annualTurnoverRange || ''} onChange={(e) => set('annualTurnoverRange', e.target.value)} onBlur={() => persist(form)} />
            <Input label="Business Model" placeholder="e.g. B2B distribution" value={form.businessModel || ''} onChange={(e) => set('businessModel', e.target.value)} onBlur={() => persist(form)} />
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 p-5 flex flex-col">
          <div>
            <label className="label">Mission / About Company</label>
            <textarea className="input" rows={7} placeholder="A short overview of your mission and what you do…" value={form.missionAbout || ''} onChange={(e) => set('missionAbout', e.target.value)} onBlur={() => persist(form)} />
          </div>

          <div className="mt-5">
            <label className="label mb-2.5">Customer Segment — select all that apply</label>
            <div className="flex flex-wrap gap-2">
              {CUSTOMER_SEGMENTS.map((s) => (
                <button key={s} type="button" onClick={() => toggleSegment(s)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${(form.customerSegments || []).includes(s) ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdditionalStep;

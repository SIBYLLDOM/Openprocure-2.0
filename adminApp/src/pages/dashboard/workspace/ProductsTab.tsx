import { useEffect, useState } from 'react';
import { Package, Check } from 'lucide-react';
import { getSuggestedProducts, selectSuggestedProduct, generateSuggestedProducts } from '../../../services/tenderApi';
import type { SuggestedProduct } from '../../../services/tenderApi';
import { Button } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';

const scoreColor = (score: number | null) => {
  if (score == null) return 'bg-gray-200';
  if (score >= 0.7) return 'bg-success-500';
  if (score >= 0.4) return 'bg-warning-500';
  return 'bg-danger-500';
};

// Tender Hub > Products — full-page version of the same AI-suggested
// products feature already built for the tender-row modal (see
// TenderRowCard.tsx's SuggestedProductsModal); same backend, same data.
const ProductsTab = ({ bidUrlId }: { bidUrlId: string }) => {
  const { show } = useToast();
  const [products, setProducts] = useState<SuggestedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = () => {
    setLoading(true);
    getSuggestedProducts(bidUrlId).then((r) => setProducts(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [bidUrlId]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = async (item: string, productCode: string | null) => {
    if (!productCode) return;
    setSavingItem(item);
    try {
      await selectSuggestedProduct(bidUrlId, item, productCode);
      setProducts((prev) => prev.map((p) => (p.item === item ? { ...p, isSelected: true } : p)));
      show('Product selected.', 'success');
    } catch { show('Failed to save selection.', 'error'); } finally { setSavingItem(null); }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      await generateSuggestedProducts(bidUrlId);
      load();
      show('Suggestions generated.', 'success');
    } catch (err: any) {
      show(err?.response?.data?.message || 'Failed to generate suggestions.', 'error');
    } finally { setGenerating(false); }
  };

  if (loading) return <p className="text-sm text-gray-400">Loading suggested products…</p>;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5">
      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
          <Package size={28} />
          <p className="text-sm">No AI-matched products are available for this tender yet.</p>
          <Button size="sm" loading={generating} onClick={generate}>Generate Suggestions</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" loading={generating} onClick={generate}>Regenerate</Button>
          </div>
          {products.map((p, i) => (
            <div key={p.item} className="rounded-lg border border-gray-100 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Item {i + 1}</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">{p.tenderItemName || p.itemCategory || '—'}</p>
                </div>
                {p.isSelected && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold text-success-700 bg-success-50 px-2 py-1 rounded-md">
                    <Check size={12} /> Selected
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-50">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary-700 truncate">{p.productName || 'N/A'}</p>
                  <p className="text-xs text-gray-500">{p.productCode || 'N/A'}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${scoreColor(p.relevancyScore)}`} style={{ width: `${Math.round((p.relevancyScore ?? 0) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-500">{p.relevancyScore != null ? `${Math.round(p.relevancyScore * 100)}%` : 'N/A'}</span>
                  </div>
                  <Button size="sm" variant={p.isSelected ? 'secondary' : 'primary'} loading={savingItem === p.item} disabled={!p.productCode || p.isSelected} onClick={() => select(p.item, p.productCode)}>
                    {p.isSelected ? 'Selected' : 'Select'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductsTab;

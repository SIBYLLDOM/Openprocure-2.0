import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, Plus, X, PackageSearch } from 'lucide-react';
import { Button, Input, Badge, EmptyState, Pagination, paginate } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import * as setupApi from '../../services/setupProfileApi';
import type { PartnerProfileData, ProductMasterCategory } from '../../types/setupProfile';

interface Selection { productId: number; categoryId: number; subCategoryId: number; name: string }
interface CustomEntry { categoryId: number; name: string }

const PAGE_SIZE = 10;

const ProductsStep = ({ profile, onRefetch }: { profile: PartnerProfileData; onRefetch: () => void }) => {
  const { show } = useToast();
  const [categories, setCategories] = useState<ProductMasterCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const [selections, setSelections] = useState<Selection[]>(
    profile.productSelections.filter((s) => s.productId).map((s) => ({ productId: s.productId!, categoryId: s.categoryId!, subCategoryId: s.subCategoryId!, name: s.product?.name || '' }))
  );
  const [customEntries, setCustomEntries] = useState<CustomEntry[]>(
    profile.productSelections.filter((s) => s.customProductName).map((s) => ({ categoryId: s.categoryId!, name: s.customProductName! }))
  );

  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);
  const [activeSubCategory, setActiveSubCategory] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<{ id: number; name: string }[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [summaryPage, setSummaryPage] = useState(1);

  useEffect(() => {
    setupApi.getMyCategories().then((cats) => {
      setCategories(cats);
      if (cats.length > 0) setExpandedCategory(cats[0].id);
    }).finally(() => setLoadingCategories(false));
  }, []);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil((selections.length + customEntries.length) / 10));
    if (summaryPage > pageCount) setSummaryPage(pageCount);
  }, [selections.length, customEntries.length, summaryPage]);

  useEffect(() => {
    if (!activeSubCategory) { setProducts([]); return; }
    setLoadingProducts(true);
    setupApi.getProducts({ subCategoryId: activeSubCategory, search: search || undefined, page, pageSize: PAGE_SIZE })
      .then((r) => { setProducts(r.items); setTotalPages(r.totalPages); setTotal(r.total); })
      .finally(() => setLoadingProducts(false));
  }, [activeSubCategory, search, page]);

  const selectedIds = useMemo(() => new Set(selections.map((s) => s.productId)), [selections]);

  const toggleProduct = (productId: number, name: string, categoryId: number, subCategoryId: number) => {
    setSelections((prev) => (
      prev.some((s) => s.productId === productId)
        ? prev.filter((s) => s.productId !== productId)
        : [...prev, { productId, categoryId, subCategoryId, name }]
    ));
  };

  const selectAllOnPage = () => {
    setSelections((prev) => {
      const ids = new Set(prev.map((s) => s.productId));
      const additions = products.filter((p) => !ids.has(p.id)).map((p) => ({ productId: p.id, categoryId: expandedCategory!, subCategoryId: activeSubCategory!, name: p.name }));
      return [...prev, ...additions];
    });
  };
  const clearAllOnPage = () => setSelections((prev) => prev.filter((s) => !products.some((p) => p.id === s.productId)));

  const countForCategory = (categoryId: number) => selections.filter((s) => s.categoryId === categoryId).length + customEntries.filter((c) => c.categoryId === categoryId).length;

  const addCustom = (categoryId: number) => {
    if (!customInput.trim()) return;
    setCustomEntries((prev) => [...prev, { categoryId, name: customInput.trim() }]);
    setCustomInput('');
  };
  const removeCustom = (categoryId: number, name: string) => setCustomEntries((prev) => prev.filter((c) => !(c.categoryId === categoryId && c.name === name)));

  const totalSelected = selections.length + customEntries.length;
  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name || '';

  // A combined, paginated view of everything selected — companies dealing
  // in 50-100 products need this paged rather than one long scroll.
  type SummaryRow = { kind: 'product'; key: string; name: string; categoryId: number } | { kind: 'custom'; key: string; name: string; categoryId: number };
  const summaryRows: SummaryRow[] = [
    ...selections.map((s): SummaryRow => ({ kind: 'product', key: `p-${s.productId}`, name: s.name, categoryId: s.categoryId })),
    ...customEntries.map((c): SummaryRow => ({ kind: 'custom', key: `c-${c.categoryId}-${c.name}`, name: c.name, categoryId: c.categoryId })),
  ];
  const pagedSummaryRows = paginate(summaryRows, summaryPage);

  // No explicit Save button — every change (a toggle, "Select All", a
  // removal) debounces into a save shortly after, so a closed browser tab
  // never loses a selection that was already clicked.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setSaving(true);
    const t = setTimeout(() => {
      setupApi.setProducts(
        selections.map((s) => ({ productId: s.productId, categoryId: s.categoryId, subCategoryId: s.subCategoryId })),
        customEntries.map((c) => ({ categoryId: c.categoryId, name: c.name }))
      )
        .then(() => onRefetch())
        .catch((err: any) => show(err?.response?.data?.message ?? 'Failed to save products.', 'error'))
        .finally(() => setSaving(false));
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, customEntries]);

  if (loadingCategories) return <p className="text-sm text-gray-400">Loading your product categories…</p>;

  if (categories.length === 0) {
    return <EmptyState icon={PackageSearch} title="No categories available" description="No product master categories are set up for your registered business type yet." />;
  }

  return (
    <div className="grid lg:grid-cols-3 gap-x-10 gap-y-6">
      {/* Left — the category/product picker, the main task of this step */}
      <div className="lg:col-span-2 space-y-3">
        {categories.map((cat) => {
          const isExpanded = expandedCategory === cat.id;
          return (
            <div key={cat.id} className="rounded-xl border border-gray-100 overflow-hidden">
              <button
                onClick={() => { setExpandedCategory(isExpanded ? null : cat.id); setActiveSubCategory(null); setSearch(''); setPage(1); }}
                className="w-full flex items-center justify-between gap-3 p-4 bg-gray-50/60 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                  <span className="font-semibold text-sm text-gray-900">{cat.name}</span>
                </div>
                <Badge status={`${countForCategory(cat.id)} products selected`} variant={countForCategory(cat.id) > 0 ? 'success' : 'gray'} />
              </button>

              {isExpanded && (
                <div className="p-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {cat.subCategories.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => { setActiveSubCategory(sub.id); setSearch(''); setPage(1); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${activeSubCategory === sub.id ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        {sub.name}
                      </button>
                    ))}
                  </div>

                  {activeSubCategory && cat.subCategories.some((s) => s.id === activeSubCategory) && (
                    <div>
                      <div className="relative mb-3">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                          placeholder="Search products…" className="input w-full !pl-9 !text-sm"
                        />
                      </div>

                      {loadingProducts ? (
                        <p className="text-xs text-gray-400 py-4 text-center">Loading products…</p>
                      ) : products.length === 0 ? (
                        <p className="text-xs text-gray-400 py-4 text-center">No products match.</p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400">{total} product{total === 1 ? '' : 's'}</span>
                            <div className="flex gap-3">
                              <button onClick={selectAllOnPage} className="text-xs font-semibold text-primary-600 hover:underline">Select All</button>
                              <button onClick={clearAllOnPage} className="text-xs font-semibold text-gray-400 hover:underline">Clear All</button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {products.map((p) => (
                              <label key={p.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${selectedIds.has(p.id) ? 'border-primary-500 bg-primary-50/50 text-primary-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                <input type="checkbox" className="accent-primary-600" checked={selectedIds.has(p.id)} onChange={() => toggleProduct(p.id, p.name, cat.id, activeSubCategory)} />
                                <span className="truncate">{p.name}</span>
                              </label>
                            ))}
                          </div>
                          {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-3">
                              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-xs px-2 py-1 rounded disabled:opacity-30 text-gray-600 hover:bg-gray-100">Previous</button>
                              <span className="text-xs text-gray-500">{page} / {totalPages}</span>
                              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="text-xs px-2 py-1 rounded disabled:opacity-30 text-gray-600 hover:bg-gray-100">Next</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {customEntries.filter((c) => c.categoryId === cat.id).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {customEntries.filter((c) => c.categoryId === cat.id).map((c) => (
                        <span key={c.name} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">
                          {c.name} <Badge status="Pending Approval" variant="warning" className="!text-[9px] !px-1.5 !py-0" />
                          <button onClick={() => removeCustom(cat.id, c.name)}><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Input wrapperClassName="flex-1" placeholder="+ Add a product not listed above" value={customInput} onChange={(e) => setCustomInput(e.target.value)} />
                    <Button size="sm" variant="secondary" icon={Plus} onClick={() => addCustom(cat.id)}>Add Other Product</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Right — running summary + save, secondary to the picker */}
      <div className="lg:border-l lg:border-gray-100 lg:pl-10 flex flex-col h-full">
        <div className="rounded-xl border border-gray-100 p-4 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Selection Summary</h3>
            <Badge status={`${totalSelected} Selected`} variant="primary" />
          </div>

          {totalSelected === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No products selected yet — pick from the categories on the left.</p>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {pagedSummaryRows.map((row) => {
                if (row.kind === 'product') {
                  const s = selections.find((x) => x.productId === Number(row.key.slice(2)))!;
                  return (
                    <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{row.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{categoryName(row.categoryId)}</p>
                      </div>
                      <button onClick={() => toggleProduct(s.productId, s.name, s.categoryId, s.subCategoryId)} className="text-gray-300 hover:text-danger-600 flex-shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{row.name}</p>
                      <p className="text-[11px] text-amber-600 truncate">{categoryName(row.categoryId)} · Pending approval</p>
                    </div>
                    <button onClick={() => removeCustom(row.categoryId, row.name)} className="text-gray-300 hover:text-danger-600 flex-shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {summaryRows.length > 10 && (
            <Pagination page={summaryPage} totalItems={summaryRows.length} onPageChange={setSummaryPage} />
          )}
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">Across {categories.filter((c) => countForCategory(c.id) > 0).length} of {categories.length} categories.</p>
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">{saving ? 'Saving…' : 'Selections save automatically.'}</p>
      </div>
    </div>
  );
};

export default ProductsStep;

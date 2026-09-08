import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Calendar, Clock3, Heart, Download, Eye, X, ListChecks, Loader2, Package, Check,
} from 'lucide-react';
import { Badge, Modal, Button, Select } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import {
  getTenderDetails, toggleTenderInterest, setTenderNotRelevant,
  getTenderStatusHistory, postTenderStatus, getSuggestedProducts, selectSuggestedProduct,
  generateSuggestedProducts,
} from '../../services/tenderApi';
import type { TenderRow, TenderStatusEntry, SuggestedProduct } from '../../services/tenderApi';

const formatMoney = (v?: string | null) => (v ? `₹${Number(v).toLocaleString('en-IN')}` : 'N/A');

const daysLeftLabel = (hoursLeft: number | null) => {
  if (hoursLeft == null) return null;
  if (hoursLeft < 0) return 'Closed';
  if (hoursLeft < 24) return `${hoursLeft} hrs left`;
  return `${Math.floor(hoursLeft / 24)} days left`;
};

const STATUS_OPTIONS = [
  { value: 'proceed', label: 'Proceed' },
  { value: 'win', label: 'Win' },
  { value: 'lose', label: 'Lose' },
  { value: 'close', label: 'Close' },
];
const statusBadgeVariant = (s: string): 'primary' | 'success' | 'danger' | 'gray' => (
  s === 'win' ? 'success' : s === 'lose' ? 'danger' : s === 'close' ? 'gray' : 'primary'
);

// Renders a JSON blob (array of records, or a single record) as a simple
// key/value table — the shape Representation_json / Corrigendum_json come
// in from the scraper isn't fixed, so this just lays out whatever's there.
const JsonTable = ({ data }: { data: any }) => {
  const records: Record<string, any>[] = Array.isArray(data) ? data : [data];
  if (records.length === 0 || !records[0]) return <p className="text-sm text-gray-400 text-center py-6">No data available.</p>;
  return (
    <div className="space-y-4">
      {records.map((rec, i) => (
        <div key={i} className="rounded-lg border border-gray-100 p-3.5">
          {Object.entries(rec).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-1.5 text-sm border-b border-gray-50 last:border-0">
              <span className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}</span>
              <span className="text-gray-900 font-medium text-right break-words max-w-[65%]">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export const StatusModal = ({ urlId, onClose }: { urlId: string; onClose: () => void }) => {
  const { show } = useToast();
  const [history, setHistory] = useState<TenderStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('proceed');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useState(() => {
    getTenderStatusHistory(urlId).then((r) => setHistory(r.data)).finally(() => setLoading(false));
  });

  const submit = async () => {
    setSubmitting(true);
    try {
      const r = await postTenderStatus(urlId, status as TenderStatusEntry['status'], remarks);
      setHistory((prev) => [r.data, ...prev]);
      setRemarks('');
      show('Status saved.', 'success');
    } catch {
      show('Failed to save status.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Tender Status" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={submitting} onClick={submit}>Save Status</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="New Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} />
        </div>
        <div>
          <label className="label">Remarks</label>
          <textarea className="input" rows={3} placeholder="Enter your remarks…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <div>
          <label className="label mb-2">History (your own log for this tender)</label>
          {loading ? (
            <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No status logged yet.</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className="rounded-lg border border-gray-100 p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Badge status={h.status} variant={statusBadgeVariant(h.status)} />
                    {h.remarks && <p className="text-xs text-gray-600 mt-1.5">{h.remarks}</p>}
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">{new Date(h.createdAt).toLocaleDateString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export const NotRelevantModal = ({ bidNumber, urlId, onClose, onDone }: { bidNumber: string; urlId: string; onClose: () => void; onDone: () => void }) => {
  const { show } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await setTenderNotRelevant(urlId, { relevant: false, reason: reason.trim() });
      show('Marked as not relevant.', 'success');
      onDone();
    } catch {
      show('Failed to update.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Mark as Not Relevant?" size="sm"
      footer={<><Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button><Button variant="danger" loading={submitting} disabled={!reason.trim()} onClick={submit}>Yes, Mark Not Relevant</Button></>}>
      <p className="text-sm text-gray-600 mb-4">You are marking <strong className="text-gray-900">{bidNumber}</strong> as not relevant for your account. This only affects your own view.</p>
      <label className="label">Reason <span className="text-danger-600">*</span></label>
      <textarea
        autoFocus rows={3} className="input"
        placeholder="Why is this tender not relevant? (e.g. wrong category, out of scope, already participated…)"
        value={reason} onChange={(e) => setReason(e.target.value)}
      />
    </Modal>
  );
};

export const CorrigendumModal = ({ urlId, onClose }: { urlId: string; onClose: () => void }) => {
  const [tab, setTab] = useState<'representation' | 'corrigendum'>('representation');
  const [data, setData] = useState<{ representationJson: any; corrigendumJson: any } | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    getTenderDetails(urlId).then((r) => setData({ representationJson: r.data.representationJson, corrigendumJson: r.data.corrigendumJson })).finally(() => setLoading(false));
  });

  return (
    <Modal open onClose={onClose} title="Corrigendum / Representation" size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400 gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            {data?.representationJson && (
              <button onClick={() => setTab('representation')} className={`px-3 py-1.5 rounded-md text-sm font-semibold ${tab === 'representation' ? 'bg-primary-950 text-white' : 'bg-gray-100 text-gray-600'}`}>Representation</button>
            )}
            {data?.corrigendumJson && (
              <button onClick={() => setTab('corrigendum')} className={`px-3 py-1.5 rounded-md text-sm font-semibold ${tab === 'corrigendum' ? 'bg-primary-950 text-white' : 'bg-gray-100 text-gray-600'}`}>Corrigendum</button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <JsonTable data={tab === 'representation' ? data?.representationJson : data?.corrigendumJson} />
          </div>
        </>
      )}
    </Modal>
  );
};

const scoreColor = (score: number | null) => {
  if (score == null) return 'bg-gray-200';
  if (score >= 0.7) return 'bg-success-500';
  if (score >= 0.4) return 'bg-warning-500';
  return 'bg-danger-500';
};

// Shows the AI-matched Meril products the automation pipeline already
// worked out for this tender's line items (tender_processing_results.
// suggested_products) and lets this partner pick which one they're going
// with — that pick is per-partner state (tender_product_selections), never
// written back onto the shared row.
export const SuggestedProductsModal = ({ urlId, onClose }: { urlId: string; onClose: () => void }) => {
  const { show } = useToast();
  const [products, setProducts] = useState<SuggestedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useState(() => {
    getSuggestedProducts(urlId).then((r) => setProducts(r.data)).finally(() => setLoading(false));
  });

  const select = async (item: string, productCode: string | null) => {
    if (!productCode) return;
    setSavingItem(item);
    try {
      await selectSuggestedProduct(urlId, item, productCode);
      setProducts((prev) => prev.map((p) => (p.item === item ? { ...p, isSelected: true } : p)));
      show('Product selected.', 'success');
    } catch {
      show('Failed to save selection.', 'error');
    } finally {
      setSavingItem(null);
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      await generateSuggestedProducts(urlId);
      const r = await getSuggestedProducts(urlId);
      setProducts(r.data);
      show('Suggestions generated.', 'success');
    } catch (err: any) {
      show(err?.response?.data?.message || 'Failed to generate suggestions.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Suggested Products" size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400 gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-gray-400">
          <Package size={28} />
          <p className="text-sm">No AI-matched products are available for this tender yet.</p>
          <Button size="sm" loading={generating} onClick={generate}>Generate Suggestions</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" loading={generating} onClick={generate}>Regenerate</Button>
          </div>
          <div className="max-h-[55vh] overflow-y-auto space-y-3">
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
                  <Button
                    size="sm"
                    variant={p.isSelected ? 'secondary' : 'primary'}
                    loading={savingItem === p.item}
                    disabled={!p.productCode || p.isSelected}
                    onClick={() => select(p.item, p.productCode)}
                  >
                    {p.isSelected ? 'Selected' : 'Select'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

interface Props {
  tender: TenderRow;
  serialNumber: number;
  isOpen: boolean;
  basePath: string;
  onMarkedNotRelevant: (bidNumber: string) => void;
}

// Full clone of the tender-automation site's compact tender-row card,
// reskinned in our navy/white theme — fact-strip header, title, location,
// tags, and the right-hand action-icon column (status / interest / open /
// view / not-relevant), plus the Corrigendum/Representation link above them
// when the tender actually has that data.
const TenderRowCard = ({ tender: t, serialNumber, isOpen, basePath, onMarkedNotRelevant }: Props) => {
  const navigate = useNavigate();
  const { show } = useToast();
  const [interested, setInterested] = useState(!!t.is_interested);
  const [showStatus, setShowStatus] = useState(false);
  const [showNotRelevant, setShowNotRelevant] = useState(false);
  const [showCorrigendum, setShowCorrigendum] = useState(false);

  const daysLeft = daysLeftLabel(t.hours_left);
  const urgent = (t.hours_left ?? 999) <= 24;
  const hasCorrigendumData = !!t.has_representation || !!t.has_corrigendum;

  const toggleInterest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const r = await toggleTenderInterest(t.url_id);
      setInterested(r.isInterested);
      show(r.isInterested ? 'Marked as interested.' : 'Removed from interested.', 'success');
    } catch {
      show('Failed to update.', 'error');
    }
  };

  return (
    <div
      onClick={() => navigate(`${basePath}/${t.url_id}`)}
      className="rounded-lg border border-gray-100 bg-white shadow-sm hover:shadow-md hover:border-primary-200 transition-all cursor-pointer p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Header line — bid no, value, dates, EMD, all inline like a compact fact strip */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
            <span className="font-bold text-primary-800 flex-shrink-0">{serialNumber}.</span>
            <span className="font-bold text-primary-800">{isOpen ? 'Tender ID' : 'Bid No'}: {t.bid_number}</span>
            {!isOpen && <span className="font-bold text-primary-800">{formatMoney(t.bid_value)}</span>}
            <span className="flex items-center gap-1 font-semibold text-primary-700">
              <Calendar size={12} /> Start: {t.start_date?.split(' ').slice(0, 2).join(' ') || 'N/A'}
            </span>
            <span className="flex items-center gap-1 font-semibold text-primary-700">
              <Clock3 size={12} /> End: {t.end_date || 'N/A'}
              {daysLeft && (
                <span className={`ml-1.5 px-2 py-0.5 rounded text-[10px] font-bold text-white ${urgent ? 'bg-danger-600' : 'bg-primary-700'}`}>{daysLeft}</span>
              )}
            </span>
            {!isOpen && <span className="font-semibold text-primary-700">EMD: {formatMoney(t.emd_amount)}</span>}
          </div>

          {/* Title */}
          <p className="text-[15px] font-medium text-gray-900 mt-2 hover:text-primary-700 hover:underline leading-snug">
            {t.items || t.bid_number}{t.quantity ? ` | QTY: ${t.quantity}` : ''}
          </p>

          {/* Location / department line */}
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-primary-700 mt-2">
            <MapPin size={13} /> {t.organisation_chain || t.department}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {t.dept && <Badge status={t.dept} variant="primary" />}
            {t.state && <Badge status={t.state} variant="gray" />}
            {t.sub_cat && <Badge status={t.sub_cat} variant="teal" />}
          </div>
        </div>

        {/* Right — corrigendum link + action icons, mirroring the automation site's layout */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {hasCorrigendumData && (
            <button onClick={() => setShowCorrigendum(true)} className="text-xs font-semibold text-primary-600 hover:underline whitespace-nowrap">
              View Corrigendum / Representation
            </button>
          )}
          <div className="flex items-center gap-1">
            <button onClick={() => setShowStatus(true)} title="Tender status" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors">
              <ListChecks size={17} />
            </button>
            <button onClick={toggleInterest} title="Mark interested" className={`p-1.5 rounded-md transition-colors hover:bg-danger-50 ${interested ? 'text-danger-600' : 'text-gray-400 hover:text-danger-600'}`}>
              <Heart size={17} fill={interested ? 'currentColor' : 'none'} />
            </button>
            {t.detail_url && (
              <a href={t.detail_url} target="_blank" rel="noreferrer" title="Open on portal" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors inline-flex">
                <Download size={17} />
              </a>
            )}
            <a href={`${basePath}/${t.url_id}`} onClick={(e) => e.preventDefault()} onMouseDown={() => window.open(`${basePath}/${t.url_id}`, '_blank')} title="View tender details" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors inline-flex cursor-pointer">
              <Eye size={17} />
            </a>
            <button onClick={() => setShowNotRelevant(true)} title="Mark as not relevant" className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-md transition-colors">
              <X size={17} />
            </button>
          </div>
        </div>
      </div>

      {showStatus && <StatusModal urlId={t.url_id} onClose={() => setShowStatus(false)} />}
      {showNotRelevant && (
        <NotRelevantModal
          bidNumber={t.bid_number}
          urlId={t.url_id}
          onClose={() => setShowNotRelevant(false)}
          onDone={() => { setShowNotRelevant(false); onMarkedNotRelevant(t.bid_number); }}
        />
      )}
      {showCorrigendum && <CorrigendumModal urlId={t.url_id} onClose={() => setShowCorrigendum(false)} />}
    </div>
  );
};

export default TenderRowCard;

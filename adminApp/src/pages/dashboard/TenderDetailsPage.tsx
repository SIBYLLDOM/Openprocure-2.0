import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import {
  ChevronDown, FileText, Download, Heart, ListChecks, X,
  FileSpreadsheet, CheckSquare, Eye, Package,
} from 'lucide-react';
import { getTenderDetails, toggleTenderInterest } from '../../services/tenderApi';
import { useToast } from '../../context/ToastContext';
import { StatusModal, NotRelevantModal, CorrigendumModal, SuggestedProductsModal } from './TenderRowCard';
import { usePageHeader } from '../../context/PageHeaderContext';

const DetailItem = ({ label, value, full }: { label: string; value?: string | number | null; full?: boolean }) => (
  <div className={`flex flex-col gap-1.5 ${full ? 'col-span-full' : ''}`}>
    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{label}</label>
    <p className="text-sm text-gray-800 font-medium leading-relaxed break-words">{value || '—'}</p>
  </div>
);

// Collapsible section — mirrors the tender-automation site's accordion
// layout (chevron flips, grey hover/expanded header) reskinned in our
// navy/white theme instead of its blue-on-white.
const AccordionSection = ({ title, children, defaultOpen }: { title: string; children: ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-6 py-4 transition-colors ${open ? 'bg-primary-50/60' : 'bg-white hover:bg-gray-50'}`}
      >
        <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
        <ChevronDown size={18} className={`text-gray-400 transition-transform ${open ? 'rotate-180 text-primary-600' : ''}`} />
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  );
};

const DetailGrid = ({ children }: { children: ReactNode }) => (
  <div className="px-6 py-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-5">{children}</div>
);

// Raw scraped table rows ([[cell,cell,...],...]) rendered as-is — the
// underlying gem_tenders.json_data has no structured columns for these
// sections (consignee list, technical spec catalogue), so we render
// whatever cells the scraper captured rather than reshaping them.
const RawTable = ({ rows }: { rows: string[][] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={i === 0 ? 'bg-gray-50 font-bold text-gray-700' : 'border-t border-gray-50 text-gray-700'}>
            {row.map((cell, j) => (
              <td key={j} className="px-4 py-2.5 align-top whitespace-pre-wrap">{cell || '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const TenderDetailsPage = () => {
  const { bidNumber: urlId } = useParams();
  const { show } = useToast();
  const [source, setSource] = useState<'gem' | 'open' | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [interested, setInterested] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showNotRelevant, setShowNotRelevant] = useState(false);
  const [showCorrigendum, setShowCorrigendum] = useState(false);
  const [showSuggested, setShowSuggested] = useState(false);
  const [markedDone, setMarkedDone] = useState(false);

  useEffect(() => {
    if (!urlId) return;
    setLoading(true);
    setNotFound(false);
    getTenderDetails(urlId)
      .then((r) => { setSource(r.source); setData(r.data); setInterested(!!r.data.isInterested); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [urlId]);

  const toggleInterest = async () => {
    if (!urlId) return;
    try {
      const r = await toggleTenderInterest(urlId);
      setInterested(r.isInterested);
      show(r.isInterested ? 'Marked as interested.' : 'Removed from interested.', 'success');
    } catch {
      show('Failed to update.', 'error');
    }
  };

  usePageHeader('Tender Details', data ? (source === 'gem' ? data.bidNumber : data.tenderId) : undefined);

  if (loading) return <p className="text-sm text-gray-400">Loading tender details…</p>;
  if (notFound || !data) return <p className="text-sm text-gray-400">This tender could not be found.</p>;
  if (markedDone) return <p className="text-sm text-gray-400">Marked as not relevant. This tender will no longer appear in your list.</p>;

  const isGem = source === 'gem';
  const id = isGem ? data.bidNumber : data.tenderId;
  const department = isGem ? data.department : data.organisationName;
  const startDate = isGem ? data.startDate : data.ePublishedDate;
  const endDate = isGem ? data.endDate : data.closingDate;
  const pdfUrl = isGem ? data.document?.pdfUrl : null;
  const bidValue = data.bidValue ? `₹${Number(data.bidValue).toLocaleString('en-IN')}` : null;
  const emdAmount = data.emdAmount ? `₹${Number(data.emdAmount).toLocaleString('en-IN')}` : null;

  const p = isGem ? (data.parsed || {}) : null;
  const documents: { label: string; url: string }[] = isGem ? (data.documents || []) : [];
  const consigneeRows: string[][] = p?.consigneeRows || [];
  const techSpecTables: string[][][] = p?.techSpecTables || [];
  const eligibilityCriteria: string[] = p?.eligibilityCriteria || [];

  return (
    <div>
      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Left — accordion sections */}
        <div className="flex flex-col gap-4 min-w-0">
          <AccordionSection title="Tender Details" defaultOpen>
            <DetailGrid>
              <DetailItem label={isGem ? 'Bid No' : 'Tender ID'} value={id || 'N/A'} />
              <DetailItem label="RA No" value={(isGem && data.raNo) || 'N/A'} />
              <DetailItem label="Bid to RA" value={p?.bidToRA || 'N/A'} />
              <DetailItem label="Bid End Date" value={p?.bidEndDate || endDate || 'N/A'} />
              <DetailItem label="Bid Opening Date" value={p?.bidOpeningDate || (!isGem ? data.openingDate : null) || 'N/A'} />
              <DetailItem label="Bid Offer Validity" value={p?.bidOfferValidity || 'N/A'} />
              <DetailItem label="Total Quantity" value={p?.totalQty || (isGem ? data.quantity : null) || 'N/A'} />
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Item Category</label>
                <p className="text-sm font-semibold text-primary-700">
                  {p && p.itemCategories?.length > 0
                    ? <>{p.itemCategories.length} item{p.itemCategories.length > 1 ? 's' : ''} <span className="text-gray-400 font-normal">— {p.itemCategories[0]}</span></>
                    : <span className="text-gray-400 font-normal">N/A</span>}
                </p>
              </div>
              <DetailItem label="Organisation Name" value={p?.organisationName || department || 'N/A'} />
              <DetailItem label="Office Name" value={p?.officeName || 'N/A'} />
              <DetailItem label="EMD Amount" value={p?.emdAmount || emdAmount || 'N/A'} />
              <DetailItem label="Estimated Bid Value" value={p?.estimatedBidValue || bidValue || 'N/A'} />
              <DetailItem label="EMD Required" value={p?.emdRequired || 'N/A'} />
              <DetailItem label="Advisory Bank" value={p?.advisoryBank || 'N/A'} />
              <DetailItem label="ePBG Percentage (%)" value={p?.epbgPercentage || 'N/A'} />
              <DetailItem label="Duration of ePBG (Months)" value={p?.epbgDuration || 'N/A'} />
            </DetailGrid>
          </AccordionSection>

          <AccordionSection title="Organisation & Location">
            <DetailGrid>
              <DetailItem label="Department" value={department || 'N/A'} full />
              <DetailItem label="Organisation Chain" value={(!isGem && data.organisationChain) || 'N/A'} full />
              <DetailItem label="State" value={data.state || 'N/A'} />
              <DetailItem label="District" value={(isGem && data.district) || 'N/A'} />
              <DetailItem label="Pincode" value={(isGem && data.pincode) || 'N/A'} />
              <DetailItem label="Location" value={(!isGem && data.location) || 'N/A'} />
              <DetailItem label="Division" value={data.dept || 'N/A'} />
            </DetailGrid>
          </AccordionSection>

          <AccordionSection title="Consignee Details">
            {consigneeRows.length > 0 ? (
              <RawTable rows={consigneeRows} />
            ) : (
              <div className="px-6 py-5 text-sm text-gray-400">N/A</div>
            )}
          </AccordionSection>

          <AccordionSection title="Pre-Bid Details">
            <DetailGrid>
              <DetailItem label="Pre-Bid Date" value={p?.preBidDate || 'N/A'} />
              <DetailItem label="Pre-Bid Time" value={p?.preBidTime || 'N/A'} />
              <DetailItem label="Pre-Bid Venue" value={p?.preBidVenue || 'N/A'} full />
              <DetailItem label="Sample Required" value={p?.sampleRequired || 'N/A'} />
            </DetailGrid>
          </AccordionSection>

          <AccordionSection title="Technical Specifications">
            {techSpecTables.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {techSpecTables.map((table, i) => (
                  <div key={i} className="py-2">
                    <RawTable rows={table} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-5 text-sm text-gray-400">N/A</div>
            )}
          </AccordionSection>

          <AccordionSection title="Documents">
            {(documents.length > 0 || pdfUrl) ? (
              <div className="divide-y divide-gray-50">
                {pdfUrl && (
                  <div className="flex items-center justify-between gap-3 px-6 py-3.5">
                    <span className="text-sm font-semibold text-gray-800">Tender Document (PDF)</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-700 hover:underline"><Eye size={13} /> View</a>
                      <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-primary-700 hover:bg-primary-800 rounded-md px-3 py-1.5 transition-colors"><Download size={13} /> Download</a>
                    </div>
                  </div>
                )}
                {documents.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-6 py-3.5">
                    <span className="text-sm font-semibold text-gray-800">{doc.label}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-700 hover:underline"><Eye size={13} /> View</a>
                      <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-primary-700 hover:bg-primary-800 rounded-md px-3 py-1.5 transition-colors"><Download size={13} /> Download</a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-5 text-sm text-gray-400">N/A</div>
            )}
          </AccordionSection>

          <AccordionSection title="Required Documents To Participate">
            {eligibilityCriteria.length > 0 ? (
              <div className="px-6 py-5 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {eligibilityCriteria.map((c, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <CheckSquare size={15} className="text-primary-600 mt-0.5 flex-shrink-0" />
                    {c}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-5 text-sm text-gray-400">N/A</div>
            )}
          </AccordionSection>
        </div>

        {/* Right — sticky sidebar */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-0">
          <div className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="text-center py-3.5 text-xs font-bold text-white tracking-wide" style={{ backgroundImage: 'linear-gradient(135deg, var(--color-primary-800) 0%, var(--color-primary-600) 100%)' }}>
              ACTIONS
            </div>
            <button onClick={() => setShowSuggested(true)} className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-50">
              <Package size={16} className="text-primary-600" /> View Suggested Products
            </button>
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-50">
                <FileText size={16} className="text-primary-600" /> Tender Document
              </a>
            )}
            {isGem && (data.representationJson || data.corrigendumJson) && (
              <button onClick={() => setShowCorrigendum(true)} className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-50">
                <FileSpreadsheet size={16} className="text-primary-600" /> View Corrigendum / Representation
              </button>
            )}
            <button onClick={toggleInterest} className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-50">
              <Heart size={16} className={interested ? 'text-danger-600' : 'text-primary-600'} fill={interested ? 'currentColor' : 'none'} />
              {interested ? 'Marked Interested' : 'Mark Interested'}
            </button>
            <button onClick={() => setShowStatus(true)} className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-50">
              <ListChecks size={16} className="text-primary-600" /> Tender Status
            </button>
            <button onClick={() => setShowNotRelevant(true)} className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-danger-600 hover:bg-danger-50 transition-colors">
              <X size={16} /> Mark Not Relevant
            </button>
          </div>
        </div>
      </div>

      {urlId && showStatus && <StatusModal urlId={urlId} onClose={() => setShowStatus(false)} />}
      {urlId && showNotRelevant && (
        <NotRelevantModal
          bidNumber={id}
          urlId={urlId}
          onClose={() => setShowNotRelevant(false)}
          onDone={() => { setShowNotRelevant(false); setMarkedDone(true); }}
        />
      )}
      {urlId && showCorrigendum && <CorrigendumModal urlId={urlId} onClose={() => setShowCorrigendum(false)} />}
      {urlId && showSuggested && <SuggestedProductsModal urlId={urlId} onClose={() => setShowSuggested(false)} />}
    </div>
  );
};

export default TenderDetailsPage;

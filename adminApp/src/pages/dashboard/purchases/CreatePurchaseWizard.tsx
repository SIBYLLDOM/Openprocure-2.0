import { useEffect, useMemo, useState } from 'react';
import { Upload, Plus, Trash2 } from 'lucide-react';
import {
  createPurchase, updatePurchase, getNextPurchaseNumber, getPurchase, resolvePurchaseLogoUrl,
} from '../../../services/purchasesApi';
import type { PurchaseRow, ShippingAddress, AdditionalCharge } from '../../../services/purchasesApi';
import { getVendor } from '../../../services/vendorsApi';
import type { VendorRow, VendorDetail } from '../../../services/vendorsApi';
import { getProfile } from '../../../services/setupProfileApi';
import { Button, Modal, Select } from '../../../components/ui';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { COUNTRIES, INDIA_STATES } from '../../../data/geo';
import { useToast } from '../../../context/ToastContext';
import VendorFormModal from '../vendors/VendorFormModal';
import PurchaseSummaryView from './PurchaseSummaryView';

type LineItem = { name: string; hsn: string; gstRate: number; qty: number; unit: string; rate: number };
const emptyLine = (): LineItem => ({ name: '', hsn: '', gstRate: 18, qty: 1, unit: 'Unit', rate: 0 });
const emptyShipFrom: ShippingAddress = { warehouse: '', sameAsBusiness: false, name: '', country: '', address: '', city: '', postalCode: '', state: '' };
const emptyShipTo: ShippingAddress = { sameAsClient: true, name: '', country: '', address: '', city: '', postalCode: '', state: '', gstin: '' };

const CURRENCIES = [{ value: 'INR', label: 'Indian Rupee (INR, ₹)' }, { value: 'USD', label: 'US Dollar (USD, $)' }, { value: 'EUR', label: 'Euro (EUR, €)' }];
const UNITS = ['Unit', 'Pcs', 'Box', 'Kg', 'Ltr', 'Set', 'Hrs'];

function round2(n: number) { return Math.round(n * 100) / 100; }
function computeLine(l: LineItem) {
  const amount = round2(l.qty * l.rate);
  const gst = round2((amount * l.gstRate) / 100);
  const cgst = round2(gst / 2);
  const sgst = round2(gst - cgst);
  return { amount, cgst, sgst, total: round2(amount + cgst + sgst) };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function chunk(num: number): string {
  let s = '';
  if (num >= 100) { s += `${ONES[Math.floor(num / 100)]} Hundred `; num %= 100; }
  if (num >= 20) { s += `${TENS[Math.floor(num / 10)]} `; num %= 10; }
  if (num > 0) s += `${ONES[num]} `;
  return s.trim();
}
function numToWords(n: number): string {
  n = Math.floor(n);
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${chunk(crore)} Crore`);
  if (lakh) parts.push(`${chunk(lakh)} Lakh`);
  if (thousand) parts.push(`${chunk(thousand)} Thousand`);
  if (n) parts.push(chunk(n));
  return parts.join(' ') || 'Zero';
}
function totalInWords(amount: number, currency: string) {
  const whole = Math.floor(amount);
  const name = currency === 'INR' ? 'Rupees' : currency;
  return `${numToWords(whole)} ${name} Only`;
}

interface Props {
  purchaseId?: number;
  vendors: VendorRow[];
  onClose: () => void;
  onDone: (p: PurchaseRow) => void;
  onVendorAdded: (v: VendorRow) => void;
}

// Purchases > Purchases Hub > Create New Purchase — a single-step popup
// mirroring the sales-side wizards (CreateQuotationWizard), but the
// counterparty is a Vendor and the document's roles are reversed: "Billed
// To" is the partner's own company details, "Billed By" is the vendor's.
const CreatePurchaseWizard = ({ purchaseId, vendors, onClose, onDone, onVendorAdded }: Props) => {
  const { show } = useToast();
  const [loading, setLoading] = useState(!!purchaseId);
  const [savedId, setSavedId] = useState<number | null>(purchaseId || null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('Purchase');
  const [subtitle, setSubtitle] = useState('');
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [purchaseNo, setPurchaseNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().slice(0, 10); });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [existingLogoPath, setExistingLogoPath] = useState<string | null>(null);

  const [billedTo, setBilledTo] = useState<{ name: string; address: string; gstin: string; pan: string } | null>(null);
  const [vendorId, setVendorId] = useState('');
  const [vendorDetail, setVendorDetail] = useState<VendorDetail | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);

  const [shippingEnabled, setShippingEnabled] = useState(false);
  const [shipFrom, setShipFrom] = useState<ShippingAddress>(emptyShipFrom);
  const [shipTo, setShipTo] = useState<ShippingAddress>(emptyShipTo);

  const [currency, setCurrency] = useState('INR');
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat');
  const [charges, setCharges] = useState<AdditionalCharge[]>([]);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  useEffect(() => {
    getProfile().then((r: any) => {
      const profile = r.data || r;
      const info = profile?.companyInfo || {};
      const addr = profile?.registeredAddress || {};
      setBilledTo({
        name: info.tradeName || info.legalName || info.shortName || '',
        address: [addr.line1, addr.line2, addr.city, addr.district, addr.state, addr.country, addr.pincode].filter(Boolean).join(', '),
        gstin: info.gstin || '', pan: info.pan || '',
      });
    }).catch(() => setBilledTo({ name: '', address: '', gstin: '', pan: '' }));

    if (!purchaseId) {
      getNextPurchaseNumber().then((r) => setPurchaseNo(r.purchaseNo)).catch(() => setPurchaseNo('A00001'));
    } else {
      getPurchase(purchaseId).then((r) => {
        const p = r.data;
        setTitle(p.title); setSubtitle(p.subtitle || ''); setShowSubtitle(!!p.subtitle);
        setPurchaseNo(p.purchaseNo); setInvoiceNo(p.invoiceNo || ''); setPoNumber(p.poNumber || '');
        setPurchaseDate(p.purchaseDate); setDueDate(p.dueDate || '');
        setExistingLogoPath(p.logoPath);
        setVendorId(p.vendorId ? String(p.vendorId) : '');
        setShippingEnabled(p.shippingEnabled);
        setShipFrom(p.shippingFrom || emptyShipFrom);
        setShipTo(p.shippingTo || emptyShipTo);
        setCurrency(p.currency);
        setItems((p.items && p.items.length ? p.items : [emptyLine()]).map((it) => ({ name: it.name, hsn: it.hsn || '', gstRate: Number(it.gstRate) || 0, qty: Number(it.qty) || 1, unit: it.unit || 'Unit', rate: Number(it.rate) || 0 })));
        if (p.discount) { setDiscountType(p.discount.type); setDiscountValue(String(p.discount.value)); }
        setCharges(p.additionalCharges || []);
        setNotes(p.notes || ''); setTerms(p.terms || ''); setIsRecurring(p.isRecurring);
      }).finally(() => setLoading(false));
    }
  }, [purchaseId]);

  useEffect(() => {
    if (!vendorId) { setVendorDetail(null); return; }
    getVendor(Number(vendorId)).then((r) => setVendorDetail(r.data)).catch(() => setVendorDetail(null));
  }, [vendorId]);

  useEffect(() => {
    if (shipTo.sameAsClient && vendorDetail) {
      setShipTo((s) => ({ ...s, name: vendorDetail.businessName, country: vendorDetail.country || '', city: vendorDetail.city || '', postalCode: vendorDetail.postalCode || '', state: vendorDetail.state || '', address: vendorDetail.streetAddress || '', gstin: vendorDetail.gstin || '' }));
    }
  }, [vendorDetail, shipTo.sameAsClient]);

  useEffect(() => {
    if (shipFrom.sameAsBusiness && billedTo) {
      setShipFrom((s) => ({ ...s, name: billedTo.name }));
    }
  }, [billedTo, shipFrom.sameAsBusiness]);

  const computedItems = useMemo(() => items.map((l) => ({ ...l, ...computeLine(l) })), [items]);
  const subtotal = useMemo(() => round2(computedItems.reduce((s, l) => s + l.amount, 0)), [computedItems]);
  const cgstTotal = useMemo(() => round2(computedItems.reduce((s, l) => s + l.cgst, 0)), [computedItems]);
  const sgstTotal = useMemo(() => round2(computedItems.reduce((s, l) => s + l.sgst, 0)), [computedItems]);
  const totalQty = useMemo(() => round2(computedItems.reduce((s, l) => s + l.qty, 0)), [computedItems]);
  const discountAmount = useMemo(() => {
    const v = Number(discountValue) || 0;
    if (!v) return 0;
    return discountType === 'percent' ? round2((subtotal * v) / 100) : round2(v);
  }, [discountValue, discountType, subtotal]);
  const chargesTotal = useMemo(() => round2(charges.reduce((s, c) => s + (Number(c.amount) || 0), 0)), [charges]);
  const grandTotal = useMemo(() => round2(subtotal + cgstTotal + sgstTotal - discountAmount + chargesTotal), [subtotal, cgstTotal, sgstTotal, discountAmount, chargesTotal]);
  const currencySymbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;

  const setLine = (idx: number, patch: Partial<LineItem>) => setItems((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setItems((ls) => [...ls, emptyLine()]);
  const removeLine = (idx: number) => setItems((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));

  const buildFormData = (status: PurchaseRow['status']) => {
    const fd = new FormData();
    fd.append('purchaseNo', purchaseNo);
    if (invoiceNo) fd.append('invoiceNo', invoiceNo);
    if (poNumber) fd.append('poNumber', poNumber);
    fd.append('title', title);
    if (showSubtitle && subtitle) fd.append('subtitle', subtitle);
    fd.append('purchaseDate', purchaseDate);
    if (dueDate) fd.append('dueDate', dueDate);
    if (vendorId) fd.append('vendorId', vendorId);
    fd.append('currency', currency);
    fd.append('shippingEnabled', String(shippingEnabled));
    if (shippingEnabled) { fd.append('shippingFrom', JSON.stringify(shipFrom)); fd.append('shippingTo', JSON.stringify(shipTo)); }
    fd.append('items', JSON.stringify(items));
    if (Number(discountValue) > 0) fd.append('discount', JSON.stringify({ type: discountType, value: Number(discountValue), amount: discountAmount }));
    fd.append('additionalCharges', JSON.stringify(charges));
    if (notes) fd.append('notes', notes);
    if (terms) fd.append('terms', terms);
    fd.append('isRecurring', String(isRecurring));
    fd.append('status', status);
    if (logoFile) fd.append('logo', logoFile);
    return fd;
  };

  const [summaryData, setSummaryData] = useState<PurchaseRow | null>(null);

  const doSave = async (status: PurchaseRow['status']) => {
    if (!vendorId) { show('Please select a vendor.', 'error'); return; }
    if (!items.some((l) => l.name.trim())) { show('Add at least one item.', 'error'); return; }
    setSaving(true);
    try {
      const fd = buildFormData(status);
      const r = savedId ? await updatePurchase(savedId, fd) : await createPurchase(fd);
      setSavedId(r.data.id);
      if (status === 'Draft') {
        show('Saved as draft.', 'success');
        onDone(r.data);
      } else {
        setSummaryData(r.data);
      }
    } catch (err: any) {
      show(err?.response?.data?.message || 'Failed to save purchase.', 'error');
    } finally { setSaving(false); }
  };

  if (loading) return <Modal open onClose={onClose} title="Loading…" size="sm"><p className="text-sm text-gray-400 text-center py-6">Loading…</p></Modal>;

  if (summaryData) {
    return (
      <PurchaseSummaryView
        purchase={summaryData}
        billedTo={billedTo}
        vendor={vendorDetail}
        onBack={() => setSummaryData(null)}
        onEdit={() => setSummaryData(null)}
        onSubmit={() => onDone(summaryData)}
      />
    );
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={purchaseId ? 'Edit Purchase' : 'Create New Purchase'}
        size="2xl"
        footer={<>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" loading={saving} onClick={() => doSave('Draft')}>Save As Draft</Button>
          <Button loading={saving} onClick={() => doSave('Sent')}>Save Purchase</Button>
        </>}
      >
        <div className="space-y-8">
          <div className="text-center">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="text-2xl font-extrabold text-gray-900 text-center border-b-2 border-dashed border-gray-200 focus:border-primary-400 outline-none px-2 bg-transparent" />
            {showSubtitle ? (
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle" className="block mx-auto mt-2 text-sm text-gray-500 text-center border-b border-dashed border-gray-200 outline-none bg-transparent" />
            ) : (
              <button type="button" onClick={() => setShowSubtitle(true)} className="mt-2 text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1 mx-auto"><Plus size={12} /> Add Subtitle</button>
            )}
          </div>

          <div className="grid md:grid-cols-[1fr_auto] gap-8">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Purchase No *</label>
                <input className="input bg-gray-50" value={purchaseNo} readOnly />
              </div>
              <div>
                <label className="label">Invoice No</label>
                <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Enter Invoice Number" />
              </div>
              <div>
                <label className="label">PO Number</label>
                <input className="input" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
              </div>
              <div>
                <label className="label">Purchase Date *</label>
                <input type="date" className="input" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Due Date</label>
                <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            <div className="w-56 rounded-xl border-2 border-dashed border-gray-200 p-4 text-center flex-shrink-0">
              <label className="cursor-pointer block">
                <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
                {logoFile || existingLogoPath ? (
                  <img src={logoFile ? URL.createObjectURL(logoFile) : resolvePurchaseLogoUrl(existingLogoPath)!} alt="logo" className="w-16 h-16 object-cover rounded-lg mx-auto mb-2" />
                ) : (
                  <Upload size={20} className="mx-auto text-primary-500 mb-2" />
                )}
                <p className="text-sm font-bold text-gray-800">Add Business Logo</p>
                <p className="text-xs text-gray-400 mt-1">Resolution up to 1080x1080px. PNG or JPEG file.</p>
              </label>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 border-b border-dashed border-gray-300 pb-2 mb-3 inline-block">Billed To <span className="text-gray-400 font-normal">(Your Details)</span></h3>
              <div className="rounded-lg bg-white border border-gray-100 p-3">
                <p className="text-sm font-bold text-gray-900">{billedTo?.name || 'Set up your company profile'}</p>
                <p className="text-xs text-gray-500 mt-1">{billedTo?.address || '-'}</p>
                {billedTo?.gstin && <p className="text-xs text-gray-500 mt-2">GSTIN <span className="font-semibold text-gray-700">{billedTo.gstin}</span></p>}
                {billedTo?.pan && <p className="text-xs text-gray-500">PAN <span className="font-semibold text-gray-700">{billedTo.pan}</span></p>}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 border-b border-dashed border-gray-300 pb-2 mb-3 inline-block">Billed By <span className="text-gray-400 font-normal">(Vendor's Details)</span></h3>
              <SearchableSelect
                className="w-full mb-3"
                value={vendorId}
                onChange={setVendorId}
                options={[{ value: '', label: 'Select Vendor By Bill' }, ...vendors.map((v) => ({ value: String(v.id), label: v.businessName }))]}
                placeholder="Select Vendor By Bill"
                searchPlaceholder="Search vendors…"
              />
              {vendorDetail ? (
                <div className="rounded-lg bg-white border border-gray-100 p-3">
                  <p className="text-sm font-bold text-gray-900">{vendorDetail.businessName}</p>
                  <p className="text-xs text-gray-500 mt-1">{[vendorDetail.city, vendorDetail.state, vendorDetail.country].filter(Boolean).join(', ') || '-'}</p>
                  {vendorDetail.gstin && <p className="text-xs text-gray-500 mt-2">GSTIN <span className="font-semibold text-gray-700">{vendorDetail.gstin}</span></p>}
                  {vendorDetail.pan && <p className="text-xs text-gray-500">PAN <span className="font-semibold text-gray-700">{vendorDetail.pan}</span></p>}
                </div>
              ) : (
                <div className="rounded-lg bg-white border border-dashed border-gray-200 p-4 text-center">
                  <p className="text-xs text-gray-400 mb-2">Select Vendor/Business from the list</p>
                  <p className="text-[10px] text-gray-300 mb-2">OR</p>
                  <Button size="sm" icon={Plus} onClick={() => setShowAddVendor(true)}>Add New Vendor</Button>
                </div>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={shippingEnabled} onChange={(e) => setShippingEnabled(e.target.checked)} className="w-4 h-4 rounded accent-primary-600" />
            Add Shipping Details
          </label>

          {shippingEnabled && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-5 space-y-2.5">
                <h4 className="text-sm font-bold text-gray-900 mb-1">Shipped From</h4>
                <input className="input" placeholder="Select Warehouse" value={shipFrom.warehouse} onChange={(e) => setShipFrom({ ...shipFrom, warehouse: e.target.value })} />
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={!!shipFrom.sameAsBusiness} onChange={(e) => setShipFrom({ ...shipFrom, sameAsBusiness: e.target.checked, name: e.target.checked ? (billedTo?.name || '') : shipFrom.name })} className="w-3.5 h-3.5 rounded accent-primary-600" />
                  Same as your business address
                </label>
                <input className="input" placeholder="Your Business Name" value={shipFrom.name} onChange={(e) => setShipFrom({ ...shipFrom, name: e.target.value })} />
                <Select value={shipFrom.country || ''} onChange={(e) => setShipFrom({ ...shipFrom, country: e.target.value })} options={[{ value: '', label: 'Select Country' }, ...COUNTRIES.map((c) => ({ value: c.code, label: c.name }))]} />
                <input className="input" placeholder="Address (optional)" value={shipFrom.address} onChange={(e) => setShipFrom({ ...shipFrom, address: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" placeholder="City (optional)" value={shipFrom.city} onChange={(e) => setShipFrom({ ...shipFrom, city: e.target.value })} />
                  <input className="input" placeholder="Postal Code / ZIP Code" value={shipFrom.postalCode} onChange={(e) => setShipFrom({ ...shipFrom, postalCode: e.target.value })} />
                </div>
                {shipFrom.country === 'IN' ? (
                  <Select value={shipFrom.state || ''} onChange={(e) => setShipFrom({ ...shipFrom, state: e.target.value })} options={[{ value: '', label: 'State (optional)' }, ...INDIA_STATES.map((s) => ({ value: s, label: s }))]} />
                ) : (
                  <input className="input" placeholder="State (optional)" value={shipFrom.state} onChange={(e) => setShipFrom({ ...shipFrom, state: e.target.value })} />
                )}
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-100 p-5 space-y-2.5">
                <h4 className="text-sm font-bold text-gray-900 mb-1">Shipped To</h4>
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={!!shipTo.sameAsClient} onChange={(e) => setShipTo({ ...shipTo, sameAsClient: e.target.checked })} className="w-3.5 h-3.5 rounded accent-primary-600" />
                  Same as vendor's address
                </label>
                <input className="input" placeholder="Name" value={shipTo.name} onChange={(e) => setShipTo({ ...shipTo, name: e.target.value })} />
                <Select value={shipTo.country || ''} onChange={(e) => setShipTo({ ...shipTo, country: e.target.value })} options={[{ value: '', label: 'Select Country' }, ...COUNTRIES.map((c) => ({ value: c.code, label: c.name }))]} />
                <input className="input" placeholder="Address (optional)" value={shipTo.address} onChange={(e) => setShipTo({ ...shipTo, address: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" placeholder="City (optional)" value={shipTo.city} onChange={(e) => setShipTo({ ...shipTo, city: e.target.value })} />
                  <input className="input" placeholder="Postal Code / ZIP Code" value={shipTo.postalCode} onChange={(e) => setShipTo({ ...shipTo, postalCode: e.target.value })} />
                </div>
                {shipTo.country === 'IN' ? (
                  <Select value={shipTo.state || ''} onChange={(e) => setShipTo({ ...shipTo, state: e.target.value })} options={[{ value: '', label: 'State (optional)' }, ...INDIA_STATES.map((s) => ({ value: s, label: s }))]} />
                ) : (
                  <input className="input" placeholder="State (optional)" value={shipTo.state} onChange={(e) => setShipTo({ ...shipTo, state: e.target.value })} />
                )}
                <input className="input" placeholder="GSTIN (Optional)" value={shipTo.gstin} onChange={(e) => setShipTo({ ...shipTo, gstin: e.target.value })} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Select wrapperClassName="w-56" label="Currency *" value={currency} onChange={(e) => setCurrency(e.target.value)} options={CURRENCIES} />
          </div>

          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left bg-primary-950 text-white text-xs font-bold">
                    <th className="px-3 py-2.5 w-8">#</th>
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5 w-24">HSN/SAC</th>
                    <th className="px-3 py-2.5 w-20">GST Rate</th>
                    <th className="px-3 py-2.5 w-20">Quantity</th>
                    <th className="px-3 py-2.5 w-24">Unit</th>
                    <th className="px-3 py-2.5 w-24">Rate</th>
                    <th className="px-3 py-2.5 w-24">Amount</th>
                    <th className="px-3 py-2.5 w-20">CGST</th>
                    <th className="px-3 py-2.5 w-20">SGST</th>
                    <th className="px-3 py-2.5 w-24">Total</th>
                    <th className="px-2 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {computedItems.map((l, idx) => (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-500 align-top">{idx + 1}</td>
                      <td className="px-3 py-2 align-top"><input className="input !py-1 !text-sm" placeholder="Item Name / SKU Id" value={l.name} onChange={(e) => setLine(idx, { name: e.target.value })} /></td>
                      <td className="px-3 py-2 align-top"><input className="input !py-1 !text-sm" value={l.hsn} onChange={(e) => setLine(idx, { hsn: e.target.value })} /></td>
                      <td className="px-3 py-2 align-top"><input type="number" className="input !py-1 !text-sm" value={l.gstRate} onChange={(e) => setLine(idx, { gstRate: Number(e.target.value) })} /></td>
                      <td className="px-3 py-2 align-top"><input type="number" min={0} className="input !py-1 !text-sm" value={l.qty} onChange={(e) => setLine(idx, { qty: Number(e.target.value) })} /></td>
                      <td className="px-3 py-2 align-top">
                        <select className="input !py-1 !text-sm" value={l.unit} onChange={(e) => setLine(idx, { unit: e.target.value })}>
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 align-top"><input type="number" className="input !py-1 !text-sm" value={l.rate} onChange={(e) => setLine(idx, { rate: Number(e.target.value) })} /></td>
                      <td className="px-3 py-2 align-top text-gray-700 font-semibold">{currencySymbol}{l.amount.toFixed(2)}</td>
                      <td className="px-3 py-2 align-top text-gray-600">{currencySymbol}{l.cgst.toFixed(2)}</td>
                      <td className="px-3 py-2 align-top text-gray-600">{currencySymbol}{l.sgst.toFixed(2)}</td>
                      <td className="px-3 py-2 align-top text-gray-900 font-bold">{currencySymbol}{l.total.toFixed(2)}</td>
                      <td className="px-2 py-2 align-top"><button type="button" onClick={() => removeLine(idx)} className="text-gray-300 hover:text-danger-600"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-gray-50">
              <button type="button" onClick={addLine} className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1"><Plus size={12} /> Add New Line</button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-100 p-3">
                <label className="text-xs font-bold text-gray-500 uppercase">Discount</label>
                <div className="flex gap-2 mt-1.5">
                  <select className="input !py-1.5 !text-sm w-28" value={discountType} onChange={(e) => setDiscountType(e.target.value as any)}>
                    <option value="flat">Flat ({currencySymbol})</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                  <input type="number" className="input !py-1.5 !text-sm" placeholder="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-500 uppercase">Additional Charges</label>
                  <button type="button" onClick={() => setCharges((c) => [...c, { label: '', amount: 0 }])} className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1"><Plus size={12} /> Add</button>
                </div>
                {charges.map((c, idx) => (
                  <div key={idx} className="flex gap-2 mt-2">
                    <input className="input !py-1.5 !text-sm flex-1" placeholder="Label" value={c.label} onChange={(e) => setCharges((cs) => cs.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} />
                    <input type="number" className="input !py-1.5 !text-sm w-28" placeholder="Amount" value={c.amount} onChange={(e) => setCharges((cs) => cs.map((x, i) => (i === idx ? { ...x, amount: Number(e.target.value) } : x)))} />
                    <button type="button" onClick={() => setCharges((cs) => cs.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-danger-600"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-100 p-5 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600"><span>Amount</span><span>{currencySymbol}{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-gray-600"><span>CGST</span><span>{currencySymbol}{cgstTotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-gray-600"><span>SGST</span><span>{currencySymbol}{sgstTotal.toFixed(2)}</span></div>
              {discountAmount > 0 && <div className="flex justify-between text-gray-600"><span>Discount</span><span>-{currencySymbol}{discountAmount.toFixed(2)}</span></div>}
              {chargesTotal > 0 && <div className="flex justify-between text-gray-600"><span>Additional Charges</span><span>{currencySymbol}{chargesTotal.toFixed(2)}</span></div>}
              <div className="flex justify-between text-gray-500 text-xs"><span>Total Quantity</span><span>{totalQty}</span></div>
              <div className="flex justify-between text-base font-extrabold text-gray-900 pt-2 border-t border-gray-200"><span>Total ({currency})</span><span>{currencySymbol}{grandTotal.toFixed(2)}</span></div>
              <p className="text-xs text-gray-400 italic pt-1">{totalInWords(grandTotal, currency)}</p>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="w-4 h-4 rounded accent-primary-600 mt-0.5" />
            <span>
              This is a Recurring purchase
              <span className="block text-xs font-normal text-gray-400">A draft purchase will be created with the same details every next period.</span>
            </span>
          </label>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="label">Terms &amp; Conditions</label>
              <textarea className="input min-h-[90px]" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Payment due within 15 days of receipt." />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes for this purchase." />
            </div>
          </div>
        </div>
      </Modal>

      {showAddVendor && (
        <VendorFormModal
          onClose={() => setShowAddVendor(false)}
          onDone={(v) => { setShowAddVendor(false); onVendorAdded(v); setVendorId(String(v.id)); }}
        />
      )}
    </>
  );
};

export default CreatePurchaseWizard;

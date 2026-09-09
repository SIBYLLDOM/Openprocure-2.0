import { useState } from 'react';
import { ArrowLeft, Pencil, Download, ChevronDown, ClipboardList } from 'lucide-react';
import type { PurchaseRow, PurchaseItem } from '../../../services/purchasesApi';
import { PURCHASE_STATUS_COLORS, downloadPurchasePdf } from '../../../services/purchasesApi';
import type { VendorDetail } from '../../../services/vendorsApi';
import { COUNTRIES } from '../../../data/geo';
import { Modal, Button } from '../../../components/ui';

const countryName = (code: string | null | undefined) => COUNTRIES.find((c) => c.code === code)?.name || code || '-';
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const fmtMoney = (currency: string, n: string | number) => `${currency === 'INR' ? '₹' : currency} ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  purchase: PurchaseRow;
  billedTo: { name: string; address: string; gstin: string; pan: string } | null;
  vendor: VendorDetail | null;
  onBack: () => void;
  onEdit: () => void;
  onSubmit: () => void;
}

// Shown right after "Save Purchase" — a read-only, invoice-style preview of
// exactly what was just saved, same pattern as QuotationSummaryView.
// "Submit" is what actually surfaces it to the Purchases Hub list.
const PurchaseSummaryView = ({ purchase, billedTo, vendor, onBack, onEdit, onSubmit }: Props) => {
  const [expanded, setExpanded] = useState(true);
  const items: PurchaseItem[] = purchase.items || [];

  return (
    <Modal
      open
      onClose={onBack}
      size="2xl"
      title={
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} className="p-1.5 -ml-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex-shrink-0"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <p className="text-xs text-gray-400 truncate">{billedTo?.name || 'Your Company'} <span className="mx-1">›</span> Purchase</p>
            <p className="text-base font-bold text-gray-900">{purchase.purchaseNo}</p>
          </div>
          <button type="button" onClick={onEdit} title="Edit" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg flex-shrink-0 ml-2"><Pencil size={16} /></button>
          <button type="button" onClick={() => downloadPurchasePdf(purchase.id, purchase.purchaseNo)} title="Download PDF" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg flex-shrink-0"><Download size={16} /></button>
        </div>
      }
      footer={<>
        <Button variant="secondary" onClick={onBack}>Back to Edit</Button>
        <Button onClick={onSubmit}>Submit</Button>
      </>}
    >
      <div className="space-y-4">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-bold text-gray-800"><ClipboardList size={16} className="text-gray-400" /> Purchase Summary</span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {expanded && (
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="p-6 text-center border-b border-gray-100">
              <p className="text-lg font-bold text-gray-900">{vendor?.businessName || purchase.vendor?.businessName || '-'}</p>
              <p className="text-xs text-gray-500 mt-1">{vendor ? [vendor.streetAddress, vendor.city, vendor.state, countryName(vendor.country)].filter(Boolean).join(', ') : '-'}</p>
              <div className="flex items-center justify-center gap-8 mt-3 text-xs">
                {vendor?.gstin && <span className="font-semibold text-gray-700">GSTIN: <span className="font-bold">{vendor.gstin}</span></span>}
                {vendor?.pan && <span className="font-semibold text-gray-700">PAN: <span className="font-bold">{vendor.pan}</span></span>}
              </div>
            </div>

            <div className="p-4 text-center border-b border-gray-100 flex items-center justify-center gap-2">
              <span className="text-2xl font-bold text-gray-900">{purchase.title || 'Purchase'}</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${PURCHASE_STATUS_COLORS[purchase.status]}`}>{purchase.status}</span>
            </div>

            <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100 border-b border-gray-100">
              <div className="p-4">
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">Billed To</p>
                <p className="text-sm font-bold text-gray-900">{billedTo?.name || '-'}</p>
                <p className="text-xs text-gray-500 mt-1">{billedTo?.address || '-'}</p>
              </div>
              <div className="p-4">
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">Billed By</p>
                <p className="text-sm font-bold text-gray-900">{vendor?.businessName || purchase.vendor?.businessName || '-'}</p>
              </div>
              <div className="p-4 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">Purchase No</span><span className="font-semibold text-gray-800">{purchase.purchaseNo}</span></div>
                {purchase.invoiceNo && <div className="flex justify-between"><span className="text-gray-400">Invoice No</span><span className="font-semibold text-gray-800">{purchase.invoiceNo}</span></div>}
                <div className="flex justify-between"><span className="text-gray-400">Purchase Date</span><span className="font-semibold text-gray-800">{fmtDate(purchase.purchaseDate)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Due Date</span><span className="font-semibold text-gray-800">{fmtDate(purchase.dueDate)}</span></div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase">
                    <th className="px-3 py-2 w-8">#</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">HSN/SAC</th>
                    <th className="px-3 py-2">GST Rate</th>
                    <th className="px-3 py-2">Quantity</th>
                    <th className="px-3 py-2">Rate</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">CGST</th>
                    <th className="px-3 py-2">SGST</th>
                    <th className="px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-500">{idx + 1}.</td>
                      <td className="px-3 py-2 font-semibold text-gray-800">{it.name}</td>
                      <td className="px-3 py-2 text-gray-600">{it.hsn || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{it.gstRate}%</td>
                      <td className="px-3 py-2 text-gray-600">{it.qty}</td>
                      <td className="px-3 py-2 text-gray-600">{fmtMoney(purchase.currency, it.rate)}</td>
                      <td className="px-3 py-2 text-gray-700 font-semibold">{fmtMoney(purchase.currency, it.amount)}</td>
                      <td className="px-3 py-2 text-gray-600">{fmtMoney(purchase.currency, it.cgst)}</td>
                      <td className="px-3 py-2 text-gray-600">{fmtMoney(purchase.currency, it.sgst)}</td>
                      <td className="px-3 py-2 text-gray-900 font-bold">{fmtMoney(purchase.currency, it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 space-y-1.5 text-sm max-w-xs ml-auto">
              <div className="flex justify-between text-gray-600"><span>Amount</span><span className="font-semibold">{fmtMoney(purchase.currency, purchase.subtotal)}</span></div>
              <div className="flex justify-between text-gray-600"><span>CGST</span><span className="font-semibold">{fmtMoney(purchase.currency, purchase.cgstTotal)}</span></div>
              <div className="flex justify-between text-gray-600"><span>SGST</span><span className="font-semibold">{fmtMoney(purchase.currency, purchase.sgstTotal)}</span></div>
              <div className="flex justify-between text-base font-extrabold text-gray-900 pt-2 border-t border-gray-200"><span>Total ({purchase.currency})</span><span>{fmtMoney(purchase.currency, purchase.grandTotal)}</span></div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PurchaseSummaryView;

import { useState } from 'react';
import { ArrowLeft, Pencil, Download, ChevronDown, ClipboardList } from 'lucide-react';
import type { QuotationRow, QuotationItem } from '../../../services/quotationsApi';
import { QUOTATION_STATUS_COLORS, downloadQuotationPdf } from '../../../services/quotationsApi';
import type { ClientDetail } from '../../../services/clientsApi';
import { COUNTRIES } from '../../../data/geo';
import { Modal, Button } from '../../../components/ui';

const countryName = (code: string | null | undefined) => COUNTRIES.find((c) => c.code === code)?.name || code || '-';
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const fmtMoney = (currency: string, n: string | number) => `${currency === 'INR' ? '₹' : currency} ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  label: string; // "Quotation" / "Invoice" / "Proforma Invoice" / "Sales Order" / "Delivery Challan"
  fromLabel?: string; // "Quotation From" / "Billed By" / "Delivered By"
  toLabel?: string; // "Quotation For" / "Billed To" / "Delivered To"
  dueDateLabel?: string; // "Valid Till Date" / "Due Date"
  showDueDate?: boolean; // false for Sales Order / Delivery Challan
  quotation: QuotationRow;
  fromInfo: { name: string; address: string; gstin: string; pan: string } | null;
  client: ClientDetail | null;
  onBack: () => void;
  onEdit: () => void;
  onSubmit: () => void;
}

// Shown right after "Save Quotation" / "Save Sales Order" / etc — a
// read-only, invoice-style preview of exactly what was just saved,
// mirroring the reference tool's confirmation screen. "Submit" is what
// actually surfaces it to the partner's list; Back/Edit return to the form
// with nothing lost (the record itself was already persisted by the Save
// step, so this is a review gate, not a second save).
const QuotationSummaryView = ({ label, toLabel, dueDateLabel, showDueDate = true, quotation, fromInfo, client, onBack, onEdit, onSubmit }: Props) => {
  const resolvedToLabel = toLabel || `${label} For`;
  const resolvedDueDateLabel = dueDateLabel || 'Valid Till Date';
  const [expanded, setExpanded] = useState(true);
  const items: QuotationItem[] = quotation.items || [];
  const shipTo = quotation.shippingEnabled ? quotation.shippingTo : null;

  return (
    <Modal
      open
      onClose={onBack}
      size="2xl"
      title={
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} className="p-1.5 -ml-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex-shrink-0"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <p className="text-xs text-gray-400 truncate">{fromInfo?.name || 'Your Company'} <span className="mx-1">›</span> {label}</p>
            <p className="text-base font-bold text-gray-900">{quotation.quotationNo}</p>
          </div>
          <button type="button" onClick={onEdit} title="Edit" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg flex-shrink-0 ml-2"><Pencil size={16} /></button>
          <button type="button" onClick={() => downloadQuotationPdf(quotation.id, quotation.quotationNo)} title="Download PDF" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg flex-shrink-0"><Download size={16} /></button>
        </div>
      }
      footer={<>
        <Button variant="secondary" onClick={onBack}>Back to Edit</Button>
        <Button onClick={onSubmit}>Submit</Button>
      </>}
    >
      <div className="space-y-4">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-bold text-gray-800"><ClipboardList size={16} className="text-gray-400" /> {label} Summary</span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {expanded && (
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="p-6 text-center border-b border-gray-100">
              <p className="text-lg font-bold text-gray-900">{fromInfo?.name || '-'}</p>
              <p className="text-xs text-gray-500 mt-1">{fromInfo?.address || '-'}</p>
              <div className="flex items-center justify-center gap-8 mt-3 text-xs">
                {fromInfo?.gstin && <span className="font-semibold text-gray-700">GSTIN: <span className="font-bold">{fromInfo.gstin}</span></span>}
                {fromInfo?.pan && <span className="font-semibold text-gray-700">PAN: <span className="font-bold">{fromInfo.pan}</span></span>}
              </div>
            </div>

            <div className="p-4 text-center border-b border-gray-100 flex items-center justify-center gap-2">
              <span className="text-2xl font-bold text-gray-900">{quotation.title || label}</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${QUOTATION_STATUS_COLORS[quotation.status]}`}>{quotation.status}</span>
            </div>

            <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100 border-b border-gray-100">
              <div className="p-4">
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">{resolvedToLabel}</p>
                <p className="text-sm font-bold text-gray-900">{client?.businessName || quotation.client?.businessName || '-'}</p>
                {client && (
                  <>
                    <p className="text-xs text-gray-500 mt-1">{[client.city, client.state, countryName(client.country)].filter(Boolean).join(', ')}</p>
                    {client.gstin && <p className="text-xs text-gray-500 mt-1">GSTIN: <span className="font-semibold text-gray-700">{client.gstin}</span></p>}
                    {client.pan && <p className="text-xs text-gray-500">PAN: <span className="font-semibold text-gray-700">{client.pan}</span></p>}
                  </>
                )}
              </div>
              <div className="p-4">
                {quotation.docType === 'credit_note' ? (
                  <>
                    <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">Reason</p>
                    <p className="text-sm font-bold text-gray-900">{quotation.reason || '-'}</p>
                    {quotation.linkedInvoice && <p className="text-xs text-gray-500 mt-2">Linked Invoice: <span className="font-semibold text-gray-700">{quotation.linkedInvoice.quotationNo}</span></p>}
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">Shipped To</p>
                    {shipTo ? (
                      <>
                        <p className="text-sm font-bold text-gray-900">{shipTo.name || '-'}</p>
                        <p className="text-xs text-gray-500 mt-1">{countryName(shipTo.country)}</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Not applicable</p>
                    )}
                  </>
                )}
              </div>
              <div className="p-4 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">{label} No</span><span className="font-semibold text-gray-800">{quotation.quotationNo}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">{label} Date</span><span className="font-semibold text-gray-800">{fmtDate(quotation.quotationDate)}</span></div>
                {showDueDate && <div className="flex justify-between"><span className="text-gray-400">{resolvedDueDateLabel}</span><span className="font-semibold text-gray-800">{fmtDate(quotation.validTillDate)}</span></div>}
                <div className="flex justify-between"><span className="text-gray-400">Country of Supply</span><span className="font-semibold text-gray-800">{countryName(client?.country)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Place of Supply</span><span className="font-semibold text-gray-800">{client?.state || '-'}</span></div>
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
                      <td className="px-3 py-2 text-gray-600">{fmtMoney(quotation.currency, it.rate)}</td>
                      <td className="px-3 py-2 text-gray-700 font-semibold">{fmtMoney(quotation.currency, it.amount)}</td>
                      <td className="px-3 py-2 text-gray-600">{fmtMoney(quotation.currency, it.cgst)}</td>
                      <td className="px-3 py-2 text-gray-600">{fmtMoney(quotation.currency, it.sgst)}</td>
                      <td className="px-3 py-2 text-gray-900 font-bold">{fmtMoney(quotation.currency, it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 space-y-1.5 text-sm max-w-xs ml-auto">
              <div className="flex justify-between text-gray-600"><span>Amount</span><span className="font-semibold">{fmtMoney(quotation.currency, quotation.subtotal)}</span></div>
              <div className="flex justify-between text-gray-600"><span>CGST</span><span className="font-semibold">{fmtMoney(quotation.currency, quotation.cgstTotal)}</span></div>
              <div className="flex justify-between text-gray-600"><span>SGST</span><span className="font-semibold">{fmtMoney(quotation.currency, quotation.sgstTotal)}</span></div>
              <div className="flex justify-between text-base font-extrabold text-gray-900 pt-2 border-t border-gray-200"><span>Total ({quotation.currency})</span><span>{fmtMoney(quotation.currency, quotation.grandTotal)}</span></div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default QuotationSummaryView;

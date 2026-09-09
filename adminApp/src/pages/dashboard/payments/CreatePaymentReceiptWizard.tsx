import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, AlertCircle } from 'lucide-react';
import {
  createPaymentReceipt, updatePaymentReceipt, getPaymentReceipt, getNextReceiptNumber, getUnpaidInvoices,
} from '../../../services/paymentReceiptsApi';
import type { PaymentReceiptRow, PaymentType, PaymentRecord, UnpaidInvoice } from '../../../services/paymentReceiptsApi';
import type { ClientRow } from '../../../services/clientsApi';
import { Button, Modal, Select } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import RecordPaymentModal from './RecordPaymentModal';

const CURRENCIES = [{ value: 'INR', label: 'Indian Rupee (INR, ₹)' }, { value: 'USD', label: 'US Dollar (USD, $)' }, { value: 'EUR', label: 'Euro (EUR, €)' }];

interface Props {
  paymentType: PaymentType;
  receiptId?: number;
  clients: ClientRow[];
  onClose: () => void;
  onDone: (r: PaymentReceiptRow) => void;
}

// Sales & Invoices > Payment Receipts > New Payment Receipt — a 3-step popup
// (Select Client, Add Payment Records, Settle Unpaid Invoices). Step 3 is
// skipped entirely for paymentType='advance', matching "Client Advance"
// meaning exactly that: no invoice to settle against.
const CreatePaymentReceiptWizard = ({ paymentType, receiptId, clients, onClose, onDone }: Props) => {
  const { show } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(!!receiptId);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(receiptId || null);

  const [receiptNo, setReceiptNo] = useState('');
  const [clientId, setClientId] = useState('');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('INR');

  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [editingRecordIdx, setEditingRecordIdx] = useState<number | null>(null);

  const [unpaid, setUnpaid] = useState<UnpaidInvoice[] | null>(null);
  const [loadingUnpaid, setLoadingUnpaid] = useState(false);
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');

  const selectedClient = clients.find((c) => String(c.id) === clientId);

  useEffect(() => {
    if (!receiptId) {
      getNextReceiptNumber().then((r) => setReceiptNo(r.receiptNo)).catch(() => setReceiptNo('A00001'));
    } else {
      getPaymentReceipt(receiptId).then((r) => {
        const p = r.data;
        setReceiptNo(p.receiptNo);
        setClientId(p.clientId ? String(p.clientId) : '');
        setReceivedFrom(p.receivedFrom || '');
        setReceiptDate(p.receiptDate);
        setCurrency(p.currency);
        setRecords(p.paymentRecords || []);
        setNotes(p.notes || '');
        const allocMap: Record<number, string> = {};
        (p.allocations || []).forEach((a) => { allocMap[a.invoiceId] = a.amount; });
        setAllocations(allocMap);
      }).finally(() => setLoading(false));
    }
  }, [receiptId]);

  useEffect(() => {
    if (selectedClient) setReceivedFrom((r) => r || selectedClient.businessName);
  }, [selectedClient]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== 3 || paymentType !== 'receipt' || !clientId) return;
    setLoadingUnpaid(true);
    getUnpaidInvoices(Number(clientId)).then((r) => setUnpaid(r.data)).finally(() => setLoadingUnpaid(false));
  }, [step, paymentType, clientId]);

  const totalReceived = useMemo(() => Math.round(records.reduce((s, r) => s + r.netAmount, 0) * 100) / 100, [records]);
  const totalAllocated = useMemo(() => Math.round(Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100, [allocations]);
  const advanceAmount = useMemo(() => Math.round((totalReceived - totalAllocated) * 100) / 100, [totalReceived, totalAllocated]);
  const currencySymbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;

  const saveRecord = (record: PaymentRecord) => {
    if (editingRecordIdx !== null) setRecords((rs) => rs.map((r, i) => (i === editingRecordIdx ? record : r)));
    else setRecords((rs) => [...rs, record]);
    setShowRecordModal(false);
    setEditingRecordIdx(null);
  };
  const removeRecord = (idx: number) => setRecords((rs) => rs.filter((_, i) => i !== idx));

  const buildPayload = (status: 'Draft' | 'Saved') => ({
    receiptNo,
    paymentType,
    clientId,
    receivedFrom,
    receiptDate,
    currency,
    paymentRecords: records,
    allocations: Object.entries(allocations).filter(([, v]) => Number(v) > 0).map(([invoiceId, amount]) => ({ invoiceId: Number(invoiceId), amount: Number(amount) })),
    notes,
    status,
  });

  const doSave = async (status: 'Draft' | 'Saved') => {
    if (!clientId) { show('Please select a client.', 'error'); return; }
    setSaving(true);
    try {
      const payload = buildPayload(status);
      const r = savedId ? await updatePaymentReceipt(savedId, payload) : await createPaymentReceipt(payload);
      setSavedId(r.data.id);
      show(status === 'Draft' ? 'Saved as draft.' : 'Payment receipt saved.', 'success');
      onDone(r.data);
    } catch (err: any) {
      show(err?.response?.data?.message || 'Failed to save payment receipt.', 'error');
    } finally { setSaving(false); }
  };

  const goToStep2 = () => {
    if (!clientId) { show('Please select a client.', 'error'); return; }
    setStep(2);
  };
  const goToStep3 = () => {
    if (records.length === 0) { show('Add at least one payment record.', 'error'); return; }
    if (paymentType === 'advance') { doSave('Saved'); return; }
    setStep(3);
  };

  const label = paymentType === 'advance' ? 'Client Advance' : 'Payment Receipt';

  if (loading) return <Modal open onClose={onClose} title="Loading…" size="sm"><p className="text-sm text-gray-400 text-center py-6">Loading…</p></Modal>;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`New ${label}`}
        size="xl"
        footer={
          step === 1 ? (
            <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={goToStep2}>Continue</Button></>
          ) : step === 2 ? (
            <>
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button variant="secondary" loading={saving} onClick={() => doSave('Draft')}>Save as Draft</Button>
              <Button onClick={goToStep3}>Continue</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
              <Button variant="secondary" loading={saving} onClick={() => doSave('Draft')}>Save as Draft</Button>
              <Button loading={saving} onClick={() => doSave('Saved')}>Save &amp; Continue</Button>
            </>
          )
        }
      >
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, ...(paymentType === 'receipt' ? [3] : [])].map((s, idx, arr) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 ${step === s ? 'text-primary-700' : 'text-gray-400'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-primary-600 text-white' : 'bg-gray-100'}`}>{s}</span>
                <span className="text-sm font-semibold">{s === 1 ? 'Select Client' : s === 2 ? 'Add Payment Records' : 'Settle Unpaid Invoices'}</span>
              </div>
              {idx < arr.length - 1 && <span className="text-gray-300">›</span>}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
            <div>
              <label className="label">{label} No *</label>
              <input className="input bg-gray-50" value={receiptNo} readOnly />
            </div>
            <Select label="Payment Received From *" value={clientId} onChange={(e) => setClientId(e.target.value)} options={[{ value: '', label: 'Select…' }, ...clients.map((c) => ({ value: String(c.id), label: c.businessName }))]} />
            <div>
              <label className="label">Receipt Date *</label>
              <input type="date" className="input" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
            </div>
            <Select label="Currency *" value={currency} onChange={(e) => setCurrency(e.target.value)} options={CURRENCIES} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">Record Payments</p>
                <p className="text-xs text-gray-500">Record multiple payments against multiple invoices.</p>
              </div>
              <Button size="sm" icon={Plus} onClick={() => { setEditingRecordIdx(null); setShowRecordModal(true); }}>Add New Payment Record</Button>
            </div>

            {records.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">No payment records yet — add one to continue.</div>
            ) : (
              <div className="space-y-2">
                {records.map((r, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-100 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{r.paymentMethod} · {currencySymbol}{r.netAmount.toFixed(2)}</p>
                      <p className="text-xs text-gray-500">{r.depositedTo} {r.referenceId ? `· Ref: ${r.referenceId}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => { setEditingRecordIdx(idx); setShowRecordModal(true); }} className="p-1.5 text-gray-400 hover:text-primary-600"><Pencil size={14} /></button>
                      <button type="button" onClick={() => removeRecord(idx)} className="p-1.5 text-gray-400 hover:text-danger-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 flex justify-between text-sm font-bold text-gray-900">
                  <span>Total Received</span><span>{currencySymbol}{totalReceived.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm font-bold text-gray-900">Settle Unpaid Invoices</p>
            {loadingUnpaid ? (
              <p className="text-sm text-gray-400 py-8 text-center">Loading unpaid invoices…</p>
            ) : !unpaid || unpaid.length === 0 ? (
              <div className="rounded-xl border border-gray-100 p-6 text-center flex flex-col items-center gap-2">
                <AlertCircle size={22} className="text-gray-300" />
                <p className="text-sm font-semibold text-gray-700">No unpaid invoices found</p>
                <p className="text-xs text-gray-500">There are no unpaid invoices against this client. This payment will be recorded as an advance payment.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase">
                      <th className="px-3 py-2">Invoice No.</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Paid</th>
                      <th className="px-3 py-2">Remaining</th>
                      <th className="px-3 py-2">Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaid.map((inv) => (
                      <tr key={inv.invoiceId} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-800">{inv.quotationNo}</td>
                        <td className="px-3 py-2 text-gray-600">{new Date(inv.quotationDate).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2 text-gray-600">{currencySymbol}{inv.grandTotal.toFixed(2)}</td>
                        <td className="px-3 py-2 text-gray-600">{currencySymbol}{inv.paid.toFixed(2)}</td>
                        <td className="px-3 py-2 text-gray-800 font-semibold">{currencySymbol}{inv.remaining.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            className="input !py-1 !text-sm w-28"
                            max={inv.remaining}
                            value={allocations[inv.invoiceId] || ''}
                            onChange={(e) => setAllocations((a) => ({ ...a, [inv.invoiceId]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 grid sm:grid-cols-3 gap-3 text-sm">
              <div><p className="text-gray-500">Total Received</p><p className="font-bold text-gray-900">{currencySymbol}{totalReceived.toFixed(2)}</p></div>
              <div><p className="text-gray-500">Allocated to Invoices</p><p className="font-bold text-gray-900">{currencySymbol}{totalAllocated.toFixed(2)}</p></div>
              <div><p className="text-gray-500">Recorded as Advance</p><p className="font-bold text-gray-900">{currencySymbol}{advanceAmount.toFixed(2)}</p></div>
            </div>

            <div>
              <label className="label">Notes (optional)</label>
              <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes for this payment receipt." />
            </div>
          </div>
        )}
      </Modal>

      {showRecordModal && (
        <RecordPaymentModal
          currency={currency}
          receiptDateLabel={new Date(receiptDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
          initial={editingRecordIdx !== null ? records[editingRecordIdx] : undefined}
          onClose={() => { setShowRecordModal(false); setEditingRecordIdx(null); }}
          onSave={saveRecord}
        />
      )}
    </>
  );
};

export default CreatePaymentReceiptWizard;

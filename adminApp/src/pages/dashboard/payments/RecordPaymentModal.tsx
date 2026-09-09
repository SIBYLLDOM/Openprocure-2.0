import { useState } from 'react';
import { Modal, Button } from '../../../components/ui';
import type { PaymentRecord } from '../../../services/paymentReceiptsApi';

const PAYMENT_METHODS = ['Cash', 'Cheque', 'Bank Transfer / NEFT / RTGS', 'UPI', 'Card', 'Other'];

const empty: PaymentRecord = {
  paymentMethod: '', depositedTo: '', ledger: 'Sales', amountReceived: 0, tdsPercent: 0, tdsAmount: 0, transactionCharge: 0, referenceId: '', notes: '', netAmount: 0,
};

interface Props {
  currency: string;
  receiptDateLabel: string;
  initial?: PaymentRecord;
  onClose: () => void;
  onSave: (record: PaymentRecord) => void;
}

// The "Record Payment Received" popup inside step 2 of the Payment Receipt
// wizard. Deposited To / Payment Ledger are plain text rather than dropdowns
// backed by a bank-account or chart-of-accounts model — this app has
// neither, so a fake dropdown of accounts that don't exist would be worse
// than an honest free-text field.
const RecordPaymentModal = ({ currency, receiptDateLabel, initial, onClose, onSave }: Props) => {
  const [form, setForm] = useState<PaymentRecord>(initial || empty);

  const set = <K extends keyof PaymentRecord>(key: K, value: PaymentRecord[K]) => setForm((f) => ({ ...f, [key]: value }));

  const tdsAmount = Math.round(((Number(form.amountReceived) || 0) * (Number(form.tdsPercent) || 0)) / 100 * 100) / 100;
  const netAmount = Math.round(((Number(form.amountReceived) || 0) - tdsAmount - (Number(form.transactionCharge) || 0)) * 100) / 100;

  const save = () => {
    if (!form.paymentMethod || !form.amountReceived) return;
    onSave({ ...form, tdsAmount, netAmount });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record Payment Received"
      size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!form.paymentMethod || !form.amountReceived} onClick={save}>Save &amp; Continue</Button></>}
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-400">Payment Receipt Date: {receiptDateLabel}</p>

        <div>
          <label className="label">Payment Method *</label>
          <select className="input" value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
            <option value="">Select…</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-3.5">
          <div>
            <label className="label">Deposited To *</label>
            <input className="input" placeholder="e.g. HDFC Current A/c" value={form.depositedTo} onChange={(e) => set('depositedTo', e.target.value)} />
          </div>
          <div>
            <label className="label">Payment Ledger *</label>
            <input className="input" value={form.ledger} onChange={(e) => set('ledger', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Amount Received (A) *</label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 w-10">{currency}</span>
            <input type="number" className="input" value={form.amountReceived || ''} onChange={(e) => set('amountReceived', Number(e.target.value))} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3.5">
          <div>
            <label className="label">TDS (%)</label>
            <input type="number" className="input" value={form.tdsPercent || ''} onChange={(e) => set('tdsPercent', Number(e.target.value))} />
          </div>
          <div>
            <label className="label">TDS Withheld (B)</label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 w-10">{currency}</span>
              <input className="input bg-gray-50" value={tdsAmount.toFixed(2)} readOnly />
            </div>
          </div>
        </div>

        <div>
          <label className="label">Transaction Charge (C)</label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 w-10">{currency}</span>
            <input type="number" className="input" value={form.transactionCharge || ''} onChange={(e) => set('transactionCharge', Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label className="label">Reference ID (optional)</label>
          <input className="input" value={form.referenceId} onChange={(e) => set('referenceId', e.target.value)} />
        </div>
        <div>
          <label className="label">Additional Notes (optional)</label>
          <textarea className="input min-h-[70px]" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 flex justify-between text-sm">
          <span className="text-gray-500">Net Amount (A - B - C)</span>
          <span className="font-bold text-gray-900">{currency} {netAmount.toFixed(2)}</span>
        </div>

        <p className="text-[11px] text-gray-400">This is not an online payment gateway — this simply records a payment the client already made to you directly.</p>
      </div>
    </Modal>
  );
};

export default RecordPaymentModal;

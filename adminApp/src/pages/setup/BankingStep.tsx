import { useState } from 'react';
import { Landmark, Plus, Pencil, Trash2, Building2, Eye, EyeOff, CreditCard } from 'lucide-react';
import { Button, Input, Select, Modal, EmptyState, Badge } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import * as setupApi from '../../services/setupProfileApi';
import { deriveAccounts, deriveMethods } from '../../utils/bankDetails';
import type { PartnerProfileData, BankAccount, PaymentMethodEntry } from '../../types/setupProfile';

const ACCOUNT_TYPES = [
  { value: '', label: 'Select…' },
  { value: 'Current', label: 'Current' },
  { value: 'Savings', label: 'Savings' },
  { value: 'OD', label: 'OD' },
  { value: 'CC', label: 'CC' },
  { value: 'Other', label: 'Other' },
];
const PAYMENT_METHODS = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Wire Transfer', 'Letter of Credit', 'Other'];

const emptyAccount = { accountHolderName: '', bankName: '', branchName: '', accountType: '', accountNumber: '', confirmAccountNumber: '', ifsc: '', swift: '', bankAddress: '' };
const emptyMethod = { preferredPaymentMethod: PAYMENT_METHODS[0], customMethod: '', paymentTerms: '', currency: '', creditPeriod: '', upiId: '' };

const digitsOnly = (v: string) => v.replace(/\D/g, '');

const BankingStep = ({ profile, onSaved }: { profile: PartnerProfileData; onSaved: (p: PartnerProfileData) => void }) => {
  const { show } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>(deriveAccounts(profile.bankDetails));
  const [methods, setMethods] = useState<PaymentMethodEntry[]>(deriveMethods(profile.bankDetails));

  const persistAccounts = async (next: BankAccount[]) => {
    const updated = await setupApi.saveSection('bankDetails', { accounts: next });
    setAccounts(next);
    onSaved(updated);
  };
  const persistMethods = async (next: PaymentMethodEntry[]) => {
    const updated = await setupApi.saveSection('bankDetails', { paymentMethods: next });
    setMethods(next);
    onSaved(updated);
  };

  // ----- Bank accounts -----
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyAccount);
  const [saving, setSaving] = useState(false);
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  const mismatch = form.accountNumber && form.confirmAccountNumber && form.accountNumber !== form.confirmAccountNumber;

  const openAdd = () => { setEditingId(null); setForm(emptyAccount); setShowAccountNumber(false); setModalOpen(true); };
  const openEdit = (a: BankAccount) => {
    setEditingId(a.id);
    setForm({
      accountHolderName: a.accountHolderName || '', bankName: a.bankName || '', branchName: a.branchName || '',
      accountType: a.accountType || '', accountNumber: a.accountNumber || '', confirmAccountNumber: a.confirmAccountNumber || '',
      ifsc: a.ifsc || '', swift: a.swift || '', bankAddress: a.bankAddress || '',
    });
    setShowAccountNumber(false);
    setModalOpen(true);
  };

  const saveAccount = async () => {
    setSaving(true);
    try {
      const next = editingId
        ? accounts.map((a) => (a.id === editingId ? { ...a, ...form } : a))
        : [...accounts, { id: `acc-${Date.now()}`, ...form }];
      await persistAccounts(next);
      show('Bank account saved.', 'success');
      setModalOpen(false);
    } catch (err: any) {
      show(err?.response?.data?.message ?? 'Failed to save account.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeAccount = async (id: string) => {
    try {
      await persistAccounts(accounts.filter((a) => a.id !== id));
      show('Bank account removed.', 'success');
    } catch {
      show('Failed to remove account.', 'error');
    }
  };

  // ----- Payment methods -----
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [methodForm, setMethodForm] = useState(emptyMethod);
  const [savingMethod, setSavingMethod] = useState(false);

  const openAddMethod = () => { setEditingMethodId(null); setMethodForm(emptyMethod); setMethodModalOpen(true); };
  const openEditMethod = (m: PaymentMethodEntry) => {
    setEditingMethodId(m.id);
    const known = PAYMENT_METHODS.includes(m.preferredPaymentMethod || '');
    setMethodForm({
      preferredPaymentMethod: known ? (m.preferredPaymentMethod || PAYMENT_METHODS[0]) : 'Other',
      customMethod: known ? '' : (m.preferredPaymentMethod || ''),
      paymentTerms: m.paymentTerms || '', currency: m.currency || '', creditPeriod: m.creditPeriod || '', upiId: m.upiId || '',
    });
    setMethodModalOpen(true);
  };

  const saveMethod = async () => {
    setSavingMethod(true);
    try {
      const preferredPaymentMethod = methodForm.preferredPaymentMethod === 'Other' && methodForm.customMethod.trim() ? methodForm.customMethod.trim() : methodForm.preferredPaymentMethod;
      const payload = { preferredPaymentMethod, paymentTerms: methodForm.paymentTerms, currency: methodForm.currency, creditPeriod: methodForm.creditPeriod, upiId: methodForm.upiId };
      const next = editingMethodId
        ? methods.map((m) => (m.id === editingMethodId ? { ...m, ...payload } : m))
        : [...methods, { id: `pm-${Date.now()}`, ...payload }];
      await persistMethods(next);
      show('Payment method saved.', 'success');
      setMethodModalOpen(false);
    } catch (err: any) {
      show(err?.response?.data?.message ?? 'Failed to save payment method.', 'error');
    } finally {
      setSavingMethod(false);
    }
  };

  const removeMethod = async (id: string) => {
    try {
      await persistMethods(methods.filter((m) => m.id !== id));
      show('Payment method removed.', 'success');
    } catch {
      show('Failed to remove payment method.', 'error');
    }
  };

  return (
    <div>
      <div className="grid lg:grid-cols-2 gap-x-10 gap-y-6">
        <div className="rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Bank Accounts</h3>
            <Button size="sm" icon={Plus} onClick={openAdd} className="flex-shrink-0">Add Bank Account</Button>
          </div>

          {accounts.length === 0 ? (
            <EmptyState icon={Landmark} title="No bank accounts added yet" description="Add your primary account, and any additional accounts you settle payments from." />
          ) : (
            <div className="space-y-2.5">
              {accounts.map((a, i) => (
                <div key={a.id} className="rounded-lg border border-gray-100 p-3.5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                      <Building2 size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
                        {a.bankName || 'Unnamed bank'} <Badge status={i === 0 ? 'Primary' : 'Additional'} variant={i === 0 ? 'primary' : 'gray'} />
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{[a.accountHolderName, a.accountNumber ? `••••${a.accountNumber.slice(-4)}` : null, a.ifsc].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(a)} className="p-1.5 text-gray-400 hover:text-primary-600"><Pencil size={14} /></button>
                    <button onClick={() => removeAccount(a.id)} className="p-1.5 text-gray-400 hover:text-danger-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Payment Details</h3>
            <Button size="sm" icon={Plus} onClick={openAddMethod} className="flex-shrink-0">Add Payment Method</Button>
          </div>

          {methods.length === 0 ? (
            <EmptyState icon={CreditCard} title="No payment methods added yet" description="Add how you'd like to be paid — NEFT, RTGS, UPI, and more." />
          ) : (
            <div className="space-y-2.5">
              {methods.map((m) => (
                <div key={m.id} className="rounded-lg border border-gray-100 p-3.5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                      <CreditCard size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900">{m.preferredPaymentMethod || 'Unnamed method'}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{[m.paymentTerms, m.currency, m.creditPeriod, m.upiId].filter(Boolean).join(' · ') || 'No details added'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEditMethod(m)} className="p-1.5 text-gray-400 hover:text-primary-600"><Pencil size={14} /></button>
                    <button onClick={() => removeMethod(m.id)} className="p-1.5 text-gray-400 hover:text-danger-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">Payment details are used for processing supplier payments and are kept confidential.</p>
        </div>
      </div>

      {/* Bank account modal */}
      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title={editingId ? 'Edit Bank Account' : 'Add Bank Account'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button loading={saving} onClick={saveAccount}>Save</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Input label="Account Holder Name" placeholder="As per bank records" value={form.accountHolderName} onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })} />
            <Input label="Bank Name" placeholder="e.g. HDFC Bank" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
            <Input label="Branch Name" placeholder="e.g. Andheri East" value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} />
            <Select label="Account Type" value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })} options={ACCOUNT_TYPES} />

            {/* Not a shared Input: needs a show/hide toggle and digit-only
                input, and autoComplete="off" + a non-matching name so
                Chrome/Edge don't offer to autofill a saved card/account
                number into this field. */}
            <div>
              <label className="label">Account Number</label>
              <div className="relative">
                <input
                  type={showAccountNumber ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="off"
                  name="bank-acct-no"
                  placeholder="Enter account number"
                  className="input pr-9"
                  value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: digitsOnly(e.target.value) })}
                />
                <button type="button" onClick={() => setShowAccountNumber((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showAccountNumber ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <Input
              label="Confirm Account Number" placeholder="Re-enter account number" inputMode="numeric" autoComplete="off"
              value={form.confirmAccountNumber} onChange={(e) => setForm({ ...form, confirmAccountNumber: digitsOnly(e.target.value) })}
              error={mismatch ? 'Account numbers do not match' : undefined}
            />
            <Input label="IFSC Code" placeholder="e.g. HDFC0000123" value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} />
            <Input label="SWIFT Code" placeholder="For international transfers" value={form.swift} onChange={(e) => setForm({ ...form, swift: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label className="label">Bank Address</label>
            <textarea className="input" rows={2} placeholder="Branch address" value={form.bankAddress} onChange={(e) => setForm({ ...form, bankAddress: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Payment method modal */}
      <Modal open={methodModalOpen} onClose={() => !savingMethod && setMethodModalOpen(false)} title={editingMethodId ? 'Edit Payment Method' : 'Add Payment Method'} size="md"
        footer={<><Button variant="secondary" onClick={() => setMethodModalOpen(false)} disabled={savingMethod}>Cancel</Button><Button loading={savingMethod} onClick={saveMethod}>Save</Button></>}>
        <div className="space-y-4">
          <Select label="Preferred Payment Method" value={methodForm.preferredPaymentMethod} onChange={(e) => setMethodForm({ ...methodForm, preferredPaymentMethod: e.target.value })} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
          {methodForm.preferredPaymentMethod === 'Other' && (
            <Input label="Specify Payment Method" placeholder="Type the payment method…" value={methodForm.customMethod} onChange={(e) => setMethodForm({ ...methodForm, customMethod: e.target.value })} />
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Payment Terms" placeholder="e.g. Net 30 days" value={methodForm.paymentTerms} onChange={(e) => setMethodForm({ ...methodForm, paymentTerms: e.target.value })} />
            <Input label="Credit Period" placeholder="e.g. 30 days" value={methodForm.creditPeriod} onChange={(e) => setMethodForm({ ...methodForm, creditPeriod: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Currency" placeholder="e.g. 91 (ISO numeric code)" inputMode="numeric" value={methodForm.currency} onChange={(e) => setMethodForm({ ...methodForm, currency: digitsOnly(e.target.value) })} />
            <Input label="UPI ID" placeholder="name@upi" value={methodForm.upiId} onChange={(e) => setMethodForm({ ...methodForm, upiId: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BankingStep;

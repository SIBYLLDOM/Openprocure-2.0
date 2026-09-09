import { Receipt, PiggyBank } from 'lucide-react';
import { Modal } from '../../../components/ui';
import type { PaymentType } from '../../../services/paymentReceiptsApi';

const NewPaymentChoiceModal = ({ onClose, onSelect }: { onClose: () => void; onSelect: (type: PaymentType) => void }) => (
  <Modal open onClose={onClose} title="Record New Payment" size="md">
    <p className="text-sm text-gray-500 mb-4">Which payment would you like to record?</p>
    <div className="grid sm:grid-cols-2 gap-4">
      <button
        type="button"
        onClick={() => onSelect('receipt')}
        className="flex flex-col items-center gap-3 rounded-xl border-2 border-gray-100 p-6 text-center hover:border-primary-400 hover:bg-primary-50/40 transition-colors"
      >
        <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center"><Receipt size={22} /></div>
        <div>
          <p className="text-sm font-bold text-gray-900">Payment Receipt</p>
          <p className="text-xs text-gray-500 mt-1">Record a payment and settle it against unpaid invoices.</p>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onSelect('advance')}
        className="flex flex-col items-center gap-3 rounded-xl border-2 border-gray-100 p-6 text-center hover:border-primary-400 hover:bg-primary-50/40 transition-colors"
      >
        <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center"><PiggyBank size={22} /></div>
        <div>
          <p className="text-sm font-bold text-gray-900">Client Advance</p>
          <p className="text-xs text-gray-500 mt-1">Record money received upfront, before any invoice.</p>
        </div>
      </button>
    </div>
  </Modal>
);

export default NewPaymentChoiceModal;

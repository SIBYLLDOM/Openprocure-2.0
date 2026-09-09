import { FilePlus2, UploadCloud } from 'lucide-react';
import { Modal } from '../../../components/ui';

const NewPurchaseChoiceModal = ({ onClose, onCreate, onUpload }: { onClose: () => void; onCreate: () => void; onUpload: () => void }) => (
  <Modal open onClose={onClose} title="New Purchase" size="md">
    <div className="grid sm:grid-cols-2 gap-4">
      <button
        type="button"
        onClick={onCreate}
        className="flex flex-col items-center gap-3 rounded-xl border-2 border-gray-100 p-6 text-center hover:border-primary-400 hover:bg-primary-50/40 transition-colors"
      >
        <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center"><FilePlus2 size={22} /></div>
        <div>
          <p className="text-sm font-bold text-gray-900">Create New Purchase</p>
          <p className="text-xs text-gray-500 mt-1">Build one from scratch with items, GST and totals.</p>
        </div>
      </button>
      <button
        type="button"
        onClick={onUpload}
        className="flex flex-col items-center gap-3 rounded-xl border-2 border-gray-100 p-6 text-center hover:border-primary-400 hover:bg-primary-50/40 transition-colors"
      >
        <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center"><UploadCloud size={22} /></div>
        <div>
          <p className="text-sm font-bold text-gray-900">Upload Purchase</p>
          <p className="text-xs text-gray-500 mt-1">Already have a bill? Upload the file from your computer.</p>
        </div>
      </button>
    </div>
  </Modal>
);

export default NewPurchaseChoiceModal;

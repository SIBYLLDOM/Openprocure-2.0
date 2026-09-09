import { FilePlus2, UploadCloud } from 'lucide-react';
import { Modal } from '../../../components/ui';

interface Props { label: string; onClose: () => void; onCreate: () => void; onUpload: () => void }

const NewQuotationChoiceModal = ({ label, onClose, onCreate, onUpload }: Props) => (
  <Modal open onClose={onClose} title={`New ${label}`} size="md">
    <div className="grid sm:grid-cols-2 gap-4">
      <button
        type="button"
        onClick={onCreate}
        className="flex flex-col items-center gap-3 rounded-xl border-2 border-gray-100 p-6 text-center hover:border-primary-400 hover:bg-primary-50/40 transition-colors"
      >
        <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center"><FilePlus2 size={22} /></div>
        <div>
          <p className="text-sm font-bold text-gray-900">Create New {label}</p>
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
          <p className="text-sm font-bold text-gray-900">Upload {label}</p>
          <p className="text-xs text-gray-500 mt-1">Already have one? Upload the file from your computer.</p>
        </div>
      </button>
    </div>
  </Modal>
);

export default NewQuotationChoiceModal;

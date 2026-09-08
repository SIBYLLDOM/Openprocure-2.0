import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import type { ToastItem, ToastType } from '../../context/ToastContext';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

interface ToastStyle {
  border: string;
  icon: LucideIcon;
  iconClass: string;
}

const styleByType: Record<ToastType, ToastStyle> = {
  success: { border: 'border-l-4 border-success-500', icon: CheckCircle2, iconClass: 'text-success-600' },
  error: { border: 'border-l-4 border-danger-500', icon: XCircle, iconClass: 'text-danger-600' },
  info: { border: 'border-l-4 border-primary-500', icon: Info, iconClass: 'text-primary-600' },
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        const { border, icon: Icon, iconClass } = styleByType[toast.type];
        return (
          <div
            key={toast.id}
            className={`bg-white rounded-xl shadow-lg ${border} px-4 py-3 flex items-start gap-3 pointer-events-auto`}
          >
            <Icon size={18} className={`${iconClass} flex-shrink-0 mt-0.5`} />
            <p className="text-sm font-medium text-gray-700 flex-1">{toast.message}</p>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

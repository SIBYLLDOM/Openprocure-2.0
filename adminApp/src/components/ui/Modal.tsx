import { useEffect } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  size?: ModalSize;
  children?: ReactNode;
  footer?: ReactNode;
}

const maxWidthBySize: Record<ModalSize, string> = {
  sm: '28rem',
  md: '32rem',
  lg: '48rem',
  xl: '64rem',
  '2xl': '88rem',
};

export function Modal({ open, onClose, title, size = 'md', children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const stopPropagation = (e: MouseEvent<HTMLDivElement>) => e.stopPropagation();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box rounded-2xl"
        style={{ maxWidth: maxWidthBySize[size] }}
        onClick={stopPropagation}
      >
        <div className="h-1.5 w-full rounded-t-2xl" style={{ backgroundImage: 'var(--gradient-brand)' }} />

        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex-shrink-0">
              <X size={18} />
            </button>
          </div>
        )}

        <div className="p-6">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

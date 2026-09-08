import type { InputHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: LucideIcon;
  // Applied to the outer wrapper — the actual flex/grid item in a caller's
  // layout (e.g. "flex-1" in a search bar, "col-span-2" in a form grid).
  // `className` alone can't do this: it lands on the inner <input>, two
  // levels below the wrapper, so flex-grow/grid-span never reach the node
  // the parent layout is actually sizing.
  wrapperClassName?: string;
}

export function Input({ label, error, icon: Icon, className = '', wrapperClassName = '', id, style, ...rest }: InputProps) {
  return (
    <div className={wrapperClassName}>
      {label && (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        )}
        <input
          id={id}
          className={`input ${Icon ? 'pl-9' : ''} ${className}`.trim()}
          style={error ? { borderColor: 'var(--color-danger-500)', borderWidth: '1px', ...style } : style}
          {...rest}
        />
      </div>
      {error && <p className="text-xs text-danger-600 mt-1">{error}</p>}
    </div>
  );
}

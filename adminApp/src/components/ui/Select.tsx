import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  // Applied to the outer wrapper — see Input's wrapperClassName for why
  // `className` alone (which lands on the inner <select>) can't do this.
  wrapperClassName?: string;
}

export function Select({ label, error, options, className = '', wrapperClassName = '', id, style, ...rest }: SelectProps) {
  return (
    <div className={wrapperClassName}>
      {label && (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      )}
      <select
        id={id}
        className={`input ${className}`.trim()}
        style={error ? { borderColor: 'var(--color-danger-500)', borderWidth: '1px', ...style } : style}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-danger-600 mt-1">{error}</p>}
    </div>
  );
}

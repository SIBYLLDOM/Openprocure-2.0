import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'solid' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  children?: ReactNode;
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-200 whitespace-nowrap';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-950 hover:bg-primary-900 text-white shadow-md shadow-primary-950/20 hover:shadow-lg hover:shadow-primary-950/30',
  solid: 'bg-primary-950 hover:bg-primary-900 text-white',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
  danger: 'bg-danger-50 hover:bg-red-100 text-danger-700 border border-red-200',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-600',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
};

const iconSizeBySize: Record<ButtonSize, number> = {
  sm: 14,
  md: 16,
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${
        isDisabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''
      } ${className}`.trim()}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSizeBySize[size]} className="animate-spin" />
      ) : Icon ? (
        <Icon size={iconSizeBySize[size]} />
      ) : null}
      {children}
    </button>
  );
}

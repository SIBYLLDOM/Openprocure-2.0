export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'primary'
  | 'violet'
  | 'teal'
  | 'rose'
  | 'indigo'
  | 'gray';

interface BadgeProps {
  status: string;
  variant?: BadgeVariant;
  className?: string;
}

// Centralized status -> color mapping. This fixes the previous bug where some
// pages referenced badge-indigo / badge-orange classes that never existed in index.css.
const statusVariantMap: Record<string, BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  completed: 'success',
  active: 'success',
  rejected: 'danger',
  expired: 'danger',
  cancelled: 'danger',
  processing: 'primary',
  installation: 'violet',
  warranty: 'teal',
  amc: 'teal',
  unassigned: 'indigo',
  'out-of-stock': 'danger',
  'in-stock': 'success',
};

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  primary: 'bg-primary-50 text-primary-700',
  violet: 'bg-violet-50 text-violet-700',
  teal: 'bg-teal-50 text-teal-700',
  rose: 'bg-rose-50 text-rose-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  gray: 'bg-gray-100 text-gray-700',
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, '-');
}

export function Badge({ status, variant, className = '' }: BadgeProps) {
  const resolvedVariant = variant ?? statusVariantMap[normalizeStatus(status)] ?? 'gray';

  return (
    <span className={`badge ${variantClasses[resolvedVariant]} ${className}`.trim()}>
      {status}
    </span>
  );
}

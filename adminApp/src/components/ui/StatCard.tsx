import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowUp, ArrowDown } from 'lucide-react';

export type StatCardAccent = 'primary' | 'violet' | 'amber' | 'teal' | 'rose' | 'indigo';

interface Trend {
  value: number;
  direction: 'up' | 'down';
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  accent?: StatCardAccent;
  trend?: Trend;
}

const accentClasses: Record<StatCardAccent, string> = {
  primary: 'bg-primary-50 text-primary-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  teal: 'bg-teal-50 text-teal-600',
  rose: 'bg-rose-50 text-rose-600',
  indigo: 'bg-indigo-50 text-indigo-600',
};

export function StatCard({ label, value, icon: Icon, accent = 'primary', trend }: StatCardProps) {
  return (
    <div className="stat-card">
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${accentClasses[accent]}`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {trend && (
            <span
              className={`flex items-center gap-0.5 text-xs font-semibold ${
                trend.direction === 'up' ? 'text-success-600' : 'text-danger-600'
              }`}
            >
              {trend.direction === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {Math.abs(trend.value)}%
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
    </div>
  );
}

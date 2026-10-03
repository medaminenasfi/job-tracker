'use client';

import { ComponentType } from 'react';
import { useCountUp } from '@/lib/useCountUp';

// Shared stat card: icon + animated metric + label, with an optional real
// trend. Replaces the page-local StatCard (which used emoji + hardcoded
// accents). `tone` maps to a semantic token so it themes in light/dark.

export type StatTone = 'default' | 'accent' | 'success' | 'warning' | 'info' | 'danger';

const TONE_ICON: Record<StatTone, string> = {
  default: 'bg-muted text-muted-foreground',
  accent: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  danger: 'bg-danger/10 text-danger',
};

const TONE_VALUE: Record<StatTone, string> = {
  default: 'text-foreground',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  danger: 'text-danger',
};

export function StatCard({
  value,
  label,
  icon: Icon,
  tone = 'default',
  hint,
  suffix,
}: {
  value: number;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: StatTone;
  /** Small caption under the label — only for real data, never invented. */
  hint?: string;
  /** Unit appended to the animated number, e.g. "%" for rates. */
  suffix?: string;
}) {
  const display = useCountUp(value);
  return (
    <div className="group rounded-xl border border-border bg-card p-5 shadow-card transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={`text-2xl font-bold tabular-nums sm:text-3xl ${TONE_VALUE[tone]}`}
            data-testid="stat-value"
          >
            {display}
            {suffix}
          </div>
          <div className="mt-1 truncate text-sm text-muted-foreground">{label}</div>
          {hint && <div className="mt-0.5 text-xs text-muted-foreground/80">{hint}</div>}
        </div>
        {Icon && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 ${TONE_ICON[tone]}`}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </div>
  );
}

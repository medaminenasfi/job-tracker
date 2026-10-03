import { ReactNode } from 'react';
import { statusStyle } from '@/lib/statusStyles';

// Badge: small pill. `StatusBadge` colors a job status consistently everywhere
// via the shared statusStyles map (no per-page palettes).

export function Badge({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  withDot = true,
  className = '',
}: {
  status: string;
  withDot?: boolean;
  className?: string;
}) {
  const style = statusStyle(status);
  const label = status
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge className={`${style.badge} ${className}`}>
      {withDot && <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />}
      {label}
    </Badge>
  );
}

import { ReactNode } from 'react';

// Page header shared by every dashboard page: strong title, concise subtitle,
// and an optional right-aligned action slot (CTA button, filters, etc.).

export function PageHeader({
  title,
  subtitle,
  actions,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

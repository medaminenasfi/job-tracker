// Phase 11.3 — skeleton loading shapes sized like the content they replace.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton rounded-md ${className}`} />;
}

// Overview loading state: page header + 4 stat cards + 2 panels. Shared by the
// user dashboard and the admin overview (same shape) — pass `label` to suit the
// screen so the busy state is announced correctly.
export function DashboardSkeleton({ label = 'Loading dashboard' }: { label?: string }) {
  return (
    <div className="p-4 sm:p-6" role="status" aria-label={label}>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <Skeleton className="h-9 w-16" />
            <Skeleton className="mt-3 h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <Skeleton className="mb-4 h-5 w-28" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="mb-2 h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <Skeleton className="mb-4 h-5 w-36" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="mb-2 h-4 w-4/6" />
          <Skeleton className="h-4 w-3/6" />
        </div>
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

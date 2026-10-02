'use client';

import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { DashboardSummary } from '@/lib/types';
import { useCountUp } from '@/lib/useCountUp';
import { DashboardSkeleton } from '@/components/Skeleton';
import Link from 'next/link';
import {
  GettingStartedChecklist,
  InstallExtensionCard,
  HowItWorksCard,
  TipsCard,
  ActivitySummary,
  AnnouncementsCard,
  EmptyState,
} from '@/components/dashboard/DashboardCards';

const STATUS_ROWS: { key: keyof DashboardSummary['counts']; label: string }[] = [
  { key: 'saved', label: 'Saved' },
  { key: 'applied', label: 'Applied' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'withdrawn', label: 'Withdrawn' },
];

const STATUS_BAR_COLORS: Record<keyof DashboardSummary['counts'], string> = {
  total: 'bg-foreground/40',
  saved: 'bg-sky-500',
  applied: 'bg-blue-500',
  accepted: 'bg-violet-500',
  interview: 'bg-amber-500',
  offer: 'bg-emerald-500',
  rejected: 'bg-rose-500',
  withdrawn: 'bg-slate-400',
};

export default function DashboardPage() {
  const { user } = useAuth();

  // One aggregated request powers the whole home page. The DashboardGuard in the
  // layout withholds this page until the session is restored, so the query never
  // fires before the access token exists.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiJson<DashboardSummary>('/api/dashboard/summary'),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) {
    return (
      <div className="p-6 text-red-600" role="alert">
        Failed to load your dashboard:{' '}
        {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );
  }

  const { counts, activity, recentJobs, checklist, announcements } = data;
  const hasJobs = counts.total > 0;
  const totalForBars = Math.max(1, counts.total);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Welcome back, {user?.name || 'Candidate'}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Here is what is happening across your job search pipeline today.
          </p>
        </div>
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent/25 transition-all hover:bg-accent-hover hover:shadow hover:scale-[1.01] self-start sm:self-auto"
        >
          <span>Open Kanban Board</span>
          <span>→</span>
        </Link>
      </div>

      <GettingStartedChecklist checklist={checklist} />

      {!hasJobs ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            <StatCard value={counts.total} label="Total Tracked" icon="∑" />
            <StatCard value={counts.applied} label="Applications Sent" icon="⚡" accent="text-amber-700 dark:text-amber-300" />
            <StatCard value={counts.interview} label="Active Interviews" icon="💬" accent="text-green-700 dark:text-green-300" />
            <StatCard value={counts.offer} label="Job Offers" icon="🎉" accent="text-emerald-700 dark:text-emerald-300" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <ActivitySummary activity={activity} />

            <div className="rounded-lg border border-border bg-card p-6 shadow-card">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Pipeline breakdown</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Where your applications stand</p>
                </div>
                <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                  {counts.total} total
                </span>
              </div>
              <div className="space-y-3">
                {STATUS_ROWS.map((row) => (
                  <div key={row.key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-muted-foreground">{row.label}</span>
                      <span className="font-medium tabular-nums text-foreground">{counts[row.key]}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${STATUS_BAR_COLORS[row.key]}`}
                        style={{ width: `${Math.min(100, (counts[row.key] / totalForBars) * 100)}%` }}
                        role="progressbar"
                        aria-label={`${row.label} applications`}
                        aria-valuenow={counts[row.key]}
                        aria-valuemin={0}
                        aria-valuemax={counts.total}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 mb-8">
            <h2 className="text-lg font-bold text-foreground mb-4">Recent Jobs</h2>
            {recentJobs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No jobs yet. Start adding jobs!</p>
            ) : (
              <div className="space-y-3">
                {recentJobs.map((job) => (
                  <div key={job.id} className="border-b border-border pb-3 last:border-0">
                    <div className="font-medium text-foreground">{job.title}</div>
                    <div className="text-sm text-muted-foreground">{job.company}</div>
                    <div className="text-xs text-muted-foreground mt-1">{job.status}</div>
                  </div>
                ))}
              </div>
            )}
            {recentJobs.length > 0 && (
              <Link
                href="/dashboard/jobs"
                className="block mt-4 text-sm text-accent hover:text-accent-hover"
              >
                View all jobs →
              </Link>
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <InstallExtensionCard />
        <HowItWorksCard />
        <TipsCard />
      </div>

      <AnnouncementsCard items={announcements} />
    </div>
  );
}

function StatCard({
  value,
  label,
  icon,
  accent = 'text-foreground',
}: {
  value: number;
  label: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  const display = useCountUp(value);
  return (
    <div className="group bg-card border border-border rounded-xl p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div className={`text-2xl font-bold tabular-nums sm:text-3xl ${accent}`} data-testid="stat-value">
          {display}
        </div>
        {icon && (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-base"
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Welcome back, {user?.name}</p>
      </div>

      <GettingStartedChecklist checklist={checklist} />

      {!hasJobs ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard value={counts.total} label="Total Jobs" />
            <StatCard value={counts.applied} label="Applied" accent="text-accent" />
            <StatCard value={counts.interview} label="Interviews" accent="text-green-600" />
            <StatCard value={counts.offer} label="Offers" accent="text-emerald-600" />
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
  accent = 'text-foreground',
}: {
  value: number;
  label: string;
  accent?: string;
}) {
  const display = useCountUp(value);
  return (
    <div className="group bg-card border border-border rounded-lg p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className={`text-3xl font-bold tabular-nums ${accent}`} data-testid="stat-value">
        {display}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

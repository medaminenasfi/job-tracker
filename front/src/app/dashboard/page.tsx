'use client';

import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowRight,
  Briefcase,
  Inbox,
  Layers,
  Send,
  Video,
  Trophy,
} from 'lucide-react';
import { apiJson } from '@/lib/api';
import { DashboardSummary } from '@/lib/types';
import { statusStyle } from '@/lib/statusStyles';
import { DashboardSkeleton } from '@/components/Skeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/Badge';
import { buttonStyles } from '@/components/ui/Button';
import {
  GettingStartedChecklist,
  InstallExtensionCard,
  HowItWorksCard,
  TipsCard,
  ActivitySummary,
  AnnouncementsCard,
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

export default function DashboardPage() {
  const { user } = useAuth();

  // One aggregated request powers the whole home page. The DashboardGuard in the
  // layout withholds this page until the session is restored, so the query never
  // fires before the access token exists.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiJson<DashboardSummary>('/api/dashboard/summary'),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <ErrorState
          title="We couldn't load your dashboard"
          message={error instanceof Error ? error.message : 'Something went wrong.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const { counts, activity, recentJobs, checklist, announcements } = data;
  const hasJobs = counts.total > 0;
  const totalForBars = Math.max(1, counts.total);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={`Welcome back, ${user?.name || 'Candidate'}`}
        subtitle="Here is what is happening across your job search pipeline today."
        actions={
          <Link href="/dashboard/jobs" className={buttonStyles('primary', 'md')}>
            <span>Open Kanban Board</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        }
      />

      <GettingStartedChecklist checklist={checklist} />

      {!hasJobs ? (
        <EmptyState
          icon={Inbox}
          title="No jobs yet"
          description="Add your first job to start tracking your applications."
          action={
            <Link href="/dashboard/jobs" className={buttonStyles('primary', 'md')}>
              Add your first job
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <StatCard value={counts.total} label="Total Tracked" icon={Layers} tone="accent" />
            <StatCard value={counts.applied} label="Applications Sent" icon={Send} tone="warning" />
            <StatCard value={counts.interview} label="Active Interviews" icon={Video} tone="info" />
            <StatCard value={counts.offer} label="Job Offers" icon={Trophy} tone="success" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ActivitySummary activity={activity} />

            <Card className="p-6">
              <CardHeader className="mb-5">
                <div>
                  <CardTitle icon={<Briefcase className="h-5 w-5 text-accent" aria-hidden />}>
                    Pipeline breakdown
                  </CardTitle>
                  <CardDescription className="mt-1">Where your applications stand</CardDescription>
                </div>
                <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                  {counts.total} total
                </span>
              </CardHeader>
              <CardContent className="space-y-3">
                {STATUS_ROWS.map((row) => (
                  <div key={row.key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-muted-foreground">{row.label}</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {counts[row.key]}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${statusStyle(row.key).bar}`}
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
              </CardContent>
            </Card>
          </div>

          <Card className="p-6">
            <CardHeader className="mb-4">
              <CardTitle>Recent Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {recentJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs yet. Start adding jobs!</p>
              ) : (
                <div className="space-y-3">
                  {recentJobs.map((job) => (
                    <div key={job.id} className="border-b border-border pb-3 last:border-0">
                      <div className="font-medium text-foreground">{job.title}</div>
                      <div className="text-sm text-muted-foreground">{job.company}</div>
                      <div className="mt-1.5">
                        <StatusBadge status={job.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {recentJobs.length > 0 && (
                <Link
                  href="/dashboard/jobs"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
                >
                  View all jobs <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <InstallExtensionCard />
        <HowItWorksCard />
        <TipsCard />
      </div>

      <AnnouncementsCard items={announcements} />
    </div>
  );
}

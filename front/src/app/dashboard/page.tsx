'use client';

import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { DashboardSummary } from '@/lib/types';
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
  { key: 'screening', label: 'Screening' },
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
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiJson<DashboardSummary>('/api/dashboard/summary'),
  });

  if (isLoading) return <div className="p-6 text-gray-500">Loading...</div>;
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome back, {user?.name}</p>
      </div>

      <GettingStartedChecklist checklist={checklist} />

      {!hasJobs ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard value={counts.total} label="Total Jobs" />
            <StatCard value={counts.applied} label="Applied" accent="text-blue-600" />
            <StatCard value={counts.interview} label="Interviews" accent="text-green-600" />
            <StatCard value={counts.offer} label="Offers" accent="text-emerald-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <ActivitySummary activity={activity} />

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-bold text-black mb-4">Status Breakdown</h2>
              <div className="space-y-3">
                {STATUS_ROWS.map((row) => (
                  <div key={row.key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{row.label}</span>
                    <span className="font-medium text-black">{counts[row.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-bold text-black mb-4">Recent Jobs</h2>
            {recentJobs.length === 0 ? (
              <p className="text-gray-500 text-sm">No jobs yet. Start adding jobs!</p>
            ) : (
              <div className="space-y-3">
                {recentJobs.map((job) => (
                  <div key={job.id} className="border-b border-gray-100 pb-3 last:border-0">
                    <div className="font-medium text-black">{job.title}</div>
                    <div className="text-sm text-gray-600">{job.company}</div>
                    <div className="text-xs text-gray-500 mt-1">{job.status}</div>
                  </div>
                ))}
              </div>
            )}
            {recentJobs.length > 0 && (
              <Link
                href="/dashboard/jobs"
                className="block mt-4 text-sm text-blue-600 hover:text-blue-700"
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
  accent = 'text-black',
}: {
  value: number;
  label: string;
  accent?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className={`text-3xl font-bold ${accent}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

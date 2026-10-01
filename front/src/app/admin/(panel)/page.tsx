'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { AdminStats } from '@/lib/types';
import { useCountUp } from '@/lib/useCountUp';

export default function AdminOverviewPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => apiJson<AdminStats>('/api/admin/stats'),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (isError) {
    return (
      <div className="p-6 text-red-600" role="alert">
        Failed to load stats: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );
  }
  if (!data) return null;

  const statusCount = (s: string) => data.jobsByStatus.find((r) => r.status === s)?.count ?? 0;
  const maxSignups = Math.max(1, ...data.signupsPerWeek.map((w) => w.count));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">Platform-wide statistics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard value={data.totalUsers} label="Total users" />
        <StatCard value={data.newUsersThisWeek} label="New this week" accent="text-accent" />
        <StatCard value={data.totalJobs} label="Total jobs" accent="text-indigo-600" />
        <StatCard value={statusCount('OFFER')} label="Offers" accent="text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Signups per week</h2>
          {data.signupsPerWeek.length === 0 ? (
            <p className="text-muted-foreground text-sm">No signups in the last 8 weeks.</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {data.signupsPerWeek.map((w, index) => (
                <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground tabular-nums">{w.count}</span>
                  <div
                    className="w-full bg-accent rounded-t origin-bottom animate-bar-grow"
                    style={{
                      height: `${(w.count / maxSignups) * 100}%`,
                      animationDelay: `${index * 60}ms`,
                    }}
                    title={`${w.week}: ${w.count}`}
                  />
                  <span className="text-[10px] text-muted-foreground">{w.week.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Jobs by status</h2>
          <div className="space-y-3">
            {['SAVED', 'APPLIED', 'ACCEPTED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'].map(
              (s) => (
                <div key={s} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{s}</span>
                  <span className="font-medium text-foreground">{statusCount(s)}</span>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label, accent = 'text-foreground' }: { value: number; label: string; accent?: string }) {
  const display = useCountUp(value);
  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className={`text-3xl font-bold tabular-nums ${accent}`}>{display}</div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

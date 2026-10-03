'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Layers, Send, MessageSquare, Video } from 'lucide-react';
import { apiJson } from '@/lib/api';
import { SectionLoader } from '@/components/ui/Loading';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';

type Summary = {
  total: number;
  applied: number;
  responseRate: number;
  interviewRate: number;
  byStatus: Record<string, number>;
};

const RANGES = ['7d', '30d', '90d'] as const;

// Recharts needs concrete color strings, so we reference the theme CSS vars
// directly — the charts then adapt to light/dark automatically instead of
// using a hardcoded indigo that ignores the active theme.
const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 };
const GRID_STROKE = 'var(--border)';
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '0.625rem',
  color: 'var(--foreground)',
  fontSize: '0.8125rem',
};
const TOOLTIP_LABEL = { color: 'var(--muted-foreground)', fontSize: '0.75rem' };

export default function AnalyticsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('30d');

  const summary = useQuery<Summary>({
    queryKey: ['analytics-summary'],
    queryFn: () => apiJson('/api/analytics/summary'),
  });
  const bySource = useQuery<{ source: string; count: number }[]>({
    queryKey: ['analytics-by-source'],
    queryFn: () => apiJson('/api/analytics/by-source'),
  });
  const timeline = useQuery<{ date: string; count: number }[]>({
    queryKey: ['analytics-timeline', range],
    queryFn: () => apiJson(`/api/analytics/timeline?range=${range}`),
  });

  if (summary.isLoading) return <SectionLoader label="Loading analytics..." />;

  const hasData = (summary.data?.total ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Analytics" subtitle="Your application performance" />

      {summary.isError ? (
        <ErrorState
          title="Couldn't load analytics"
          message="Check your connection and try again."
          onRetry={() => summary.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-4">
            <StatCard value={summary.data?.total ?? 0} label="Total jobs" icon={Layers} tone="accent" />
            <StatCard value={summary.data?.applied ?? 0} label="Applied" icon={Send} tone="warning" />
            <StatCard
              value={summary.data?.responseRate ?? 0}
              suffix="%"
              label="Response rate"
              icon={MessageSquare}
              tone="info"
            />
            <StatCard
              value={summary.data?.interviewRate ?? 0}
              suffix="%"
              label="Interview rate"
              icon={Video}
              tone="success"
            />
          </div>

          {!hasData ? (
            <EmptyState
              icon={Layers}
              title="Not enough data yet"
              description="Save and apply to jobs to unlock trends, response rates and source breakdowns."
              action={
                <a href="/dashboard/jobs">
                  <Button>Go to job board</Button>
                </a>
              }
            />
          ) : (
            <>
              <Card as="section">
                <CardHeader className="flex-wrap px-4 py-4 sm:px-6">
                  <CardTitle>Applications over time</CardTitle>
                  <div className="flex gap-1" role="group" aria-label="Date range">
                    {RANGES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRange(r)}
                        aria-pressed={range === r}
                        className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          range === r
                            ? 'bg-accent text-accent-foreground'
                            : 'border border-border text-foreground hover:bg-muted'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-5 sm:px-6">
                  {timeline.isLoading ? (
                    <div className="h-64 animate-pulse rounded-lg bg-muted sm:h-72" />
                  ) : timeline.isError ? (
                    <ErrorState
                      title="Couldn't load the timeline"
                      message="Check your connection and try again."
                      onRetry={() => timeline.refetch()}
                    />
                  ) : (
                    <div className="h-64 sm:h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeline.data ?? []}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                          <XAxis dataKey="date" tick={AXIS_TICK} stroke={GRID_STROKE} fontSize={12} />
                          <YAxis allowDecimals={false} tick={AXIS_TICK} stroke={GRID_STROKE} fontSize={12} width={30} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} />
                          <Line
                            type="monotone"
                            dataKey="count"
                            name="Applications"
                            stroke="var(--accent)"
                            strokeWidth={2}
                            dot={{ fill: 'var(--accent)', r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card as="section">
                <CardHeader className="px-4 py-4 sm:px-6">
                  <CardTitle>By source</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-5 sm:px-6">
                  {bySource.isLoading ? (
                    <div className="h-64 animate-pulse rounded-lg bg-muted sm:h-72" />
                  ) : bySource.isError ? (
                    <ErrorState
                      title="Couldn't load sources"
                      message="Check your connection and try again."
                      onRetry={() => bySource.refetch()}
                    />
                  ) : (bySource.data ?? []).length === 0 ? (
                    <EmptyState
                      title="No sources yet"
                      description="Save a job from the browser extension or add one manually to see where your applications come from."
                    />
                  ) : (
                    <div className="h-64 sm:h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={bySource.data ?? []}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                          <XAxis dataKey="source" tick={AXIS_TICK} stroke={GRID_STROKE} fontSize={12} />
                          <YAxis allowDecimals={false} tick={AXIS_TICK} stroke={GRID_STROKE} fontSize={12} width={30} />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            labelStyle={TOOLTIP_LABEL}
                            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                          />
                          <Bar dataKey="count" name="Jobs" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

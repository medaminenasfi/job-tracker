'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  CheckCircle2,
  Circle,
  Lightbulb,
  Megaphone,
  TrendingUp,
} from 'lucide-react';
import type { Announcement, DashboardSummary } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { buttonStyles } from '@/components/ui/Button';

// Key set by the /extension-login bridge once the extension acknowledges the
// session. ORed with the server-derived flag so a freshly connected extension
// ticks the checklist even before the user has saved a sourced job.
const EXTENSION_FLAG = 'jt_extension_connected';

export function GettingStartedChecklist({
  checklist,
}: {
  checklist: DashboardSummary['checklist'];
}) {
  const [extLocal, setExtLocal] = useState(false);
  useEffect(() => {
    setExtLocal(localStorage.getItem(EXTENSION_FLAG) === '1');
  }, []);

  const steps = [
    { label: 'Create account', done: checklist.accountCreated },
    {
      label: 'Install the browser extension',
      done: checklist.extensionConnected || extLocal,
    },
    { label: 'Save your first job', done: checklist.firstJobSaved },
    { label: 'Mark a job as Applied', done: checklist.appliedJob },
    { label: 'Fill in your profile', done: Boolean(checklist.profileFilled) },
  ];

  // Hidden once everything is complete.
  if (steps.every((s) => s.done)) return null;
  const completed = steps.filter((s) => s.done).length;

  return (
    <Card className="mb-6 p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Getting started</h2>
        <span className="text-sm text-muted-foreground">
          {completed}/{steps.length} done
        </span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${(completed / steps.length) * 100}%` }}
        />
      </div>
      <ul className="space-y-2">
        {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-2 text-sm">
          <span aria-hidden>
            {s.done ? (
              <CheckCircle2 className="h-4 w-4 text-accent" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
            <span className={s.done ? 'text-muted-foreground line-through' : 'text-foreground'}>
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function InstallExtensionCard() {
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="mb-2 text-lg font-bold text-foreground">Browser extension</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        One-click save jobs from LinkedIn, Indeed and other boards straight into
        your pipeline — no copy/pasting.
      </p>
      <Link href="/extension-login" className={buttonStyles('primary', 'md')}>
        Install extension
      </Link>
      <p className="mt-3 text-xs text-muted-foreground">
        Chrome Web Store listing coming soon.
      </p>
    </Card>
  );
}

const HOW_IT_WORKS = [
  { step: '1', title: 'Find a job', body: 'Browse LinkedIn, Indeed or any board.' },
  { step: '2', title: 'Save it in one click', body: 'Hit the extension button to capture the posting.' },
  { step: '3', title: 'Track it on the board', body: 'Move it from Saved to Applied, Interview and Offer.' },
];

export function HowItWorksCard() {
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-foreground">How it works</h2>
      <ol className="space-y-3">
        {HOW_IT_WORKS.map((s) => (
          <li key={s.step} className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
              {s.step}
            </span>
            <div>
              <div className="text-sm font-medium text-foreground">{s.title}</div>
              <div className="text-xs text-muted-foreground">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

const TIPS = [
  'Add notes after every call or interview while it is fresh.',
  "Use 'Mark as Applied' if auto-detect misses an application.",
  'Keep your pipeline focused — quality beats quantity.',
];

export function TipsCard() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((v) => (v + 1) % TIPS.length), 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-foreground">
        <Lightbulb className="h-5 w-5 text-accent" aria-hidden />
        Tip
      </h2>
      <p className="min-h-[2.5rem] text-sm text-muted-foreground">{TIPS[index]}</p>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {TIPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-accent' : 'bg-muted'}`}
          />
        ))}
      </div>
    </Card>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const w = 160;
  const h = 56;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const points = data
    .map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`)
    .join(' ');
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-14 w-full overflow-visible text-accent"
      role="img"
      aria-label="Applications over the last 7 days"
    >
      {[14, 28, 42].map((y) => (
        <line
          key={y}
          x1="0"
          x2={w}
          y1={y}
          y2={y}
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeDasharray="3 4"
        />
      ))}
      <polygon points={areaPoints} fill="currentColor" fillOpacity="0.12" />
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
      {data.map((value, index) => (
        <circle
          key={`${index}-${value}`}
          cx={index * step}
          cy={h - (value / max) * (h - 4) - 2}
          r="2.5"
          fill="currentColor"
          stroke="var(--card)"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

export function ActivitySummary({
  activity,
}: {
  activity: DashboardSummary['activity'];
}) {
  const weeklyTotal = activity.last7Days.reduce((sum, value) => sum + value, 0);

  return (
    <Card className="relative overflow-hidden p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Activity className="h-4 w-4" aria-hidden />
            </span>
            <h2 className="text-lg font-bold text-foreground">Application activity</h2>
          </div>
          <p className="text-xs text-muted-foreground">Your recent application momentum</p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          7 days
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-accent" aria-hidden />
            This week
          </div>
          <div className="text-2xl font-bold tabular-nums text-accent">
            {weeklyTotal}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">applications</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="mb-1 text-xs text-muted-foreground">Applied this month</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {activity.appliedThisMonth}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">applications</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Daily applications</span>
          <span className="tabular-nums">{Math.max(...activity.last7Days, 0)} peak</span>
        </div>
        <Sparkline data={activity.last7Days} />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span>Applied this week</span>
        <span className="font-medium tabular-nums text-foreground">
          {activity.appliedThisWeek}
        </span>
      </div>
    </Card>
  );
}

export function AnnouncementsCard({ items }: { items: Announcement[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
        <Megaphone className="h-5 w-5 text-accent" aria-hidden />
        What&apos;s new
      </h2>
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id} className="border-b border-border pb-3 last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{a.title}</span>
              <span className="text-xs text-muted-foreground">{a.date}</span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{a.body}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

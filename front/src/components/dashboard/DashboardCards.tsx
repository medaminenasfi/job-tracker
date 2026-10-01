'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Announcement, DashboardSummary } from '@/lib/types';

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
  ];

  // Hidden once everything is complete.
  if (steps.every((s) => s.done)) return null;
  const completed = steps.filter((s) => s.done).length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-black">Getting started</h2>
        <span className="text-sm text-gray-500">
          {completed}/{steps.length} done
        </span>
      </div>
      <div className="h-1.5 w-full bg-gray-100 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all"
          style={{ width: `${(completed / steps.length) * 100}%` }}
        />
      </div>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span aria-hidden>{s.done ? '✅' : '☐'}</span>
            <span className={s.done ? 'text-gray-400 line-through' : 'text-black'}>
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InstallExtensionCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-bold text-black mb-2">Browser extension</h2>
      <p className="text-sm text-gray-600 mb-4">
        One-click save jobs from LinkedIn, Indeed and other boards straight into
        your pipeline — no copy/pasting.
      </p>
      <Link
        href="/extension-login"
        className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
      >
        Install extension
      </Link>
      <p className="text-xs text-gray-400 mt-3">
        Chrome Web Store listing coming soon.
      </p>
    </div>
  );
}

const HOW_IT_WORKS = [
  { step: '1', title: 'Find a job', body: 'Browse LinkedIn, Indeed or any board.' },
  { step: '2', title: 'Save it in one click', body: 'Hit the extension button to capture the posting.' },
  { step: '3', title: 'Track it on the board', body: 'Move it from Saved to Applied, Interview and Offer.' },
];

export function HowItWorksCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-bold text-black mb-4">How it works</h2>
      <ol className="space-y-3">
        {HOW_IT_WORKS.map((s) => (
          <li key={s.step} className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
              {s.step}
            </span>
            <div>
              <div className="text-sm font-medium text-black">{s.title}</div>
              <div className="text-xs text-gray-500">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
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
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-bold text-black mb-2">💡 Tip</h2>
      <p className="text-sm text-gray-600 min-h-[2.5rem]">{TIPS[index]}</p>
      <div className="flex gap-1.5 mt-3" aria-hidden>
        {TIPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-blue-600' : 'bg-gray-200'}`}
          />
        ))}
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const w = 160;
  const h = 40;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const points = data
    .map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`)
    .join(' ');
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="text-blue-500"
      role="img"
      aria-label="Applications over the last 7 days"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

export function ActivitySummary({
  activity,
}: {
  activity: DashboardSummary['activity'];
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-bold text-black mb-4">Activity</h2>
      <div className="flex gap-8 mb-4">
        <div>
          <div className="text-3xl font-bold text-blue-600">
            {activity.appliedThisWeek}
          </div>
          <div className="text-sm text-gray-500 mt-1">Applied this week</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-black">
            {activity.appliedThisMonth}
          </div>
          <div className="text-sm text-gray-500 mt-1">Applied this month</div>
        </div>
      </div>
      <div className="text-xs text-gray-400 mb-1">Last 7 days</div>
      <Sparkline data={activity.last7Days} />
    </div>
  );
}

export function AnnouncementsCard({ items }: { items: Announcement[] }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-bold text-black mb-4">📣 What&apos;s new</h2>
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id} className="border-b border-gray-100 pb-3 last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-black">{a.title}</span>
              <span className="text-xs text-gray-400">{a.date}</span>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">{a.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-10 text-center mb-8">
      <div className="text-5xl mb-3" aria-hidden>
        🗂️
      </div>
      <h2 className="text-lg font-bold text-blue-900 mb-1">No jobs yet</h2>
      <p className="text-sm text-blue-700 mb-5">
        Add your first job to start tracking your applications.
      </p>
      <Link
        href="/dashboard/jobs"
        className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Add your first job
      </Link>
    </div>
  );
}

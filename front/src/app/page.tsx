import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Columns3,
  MousePointerClick,
} from 'lucide-react';

export const metadata = {
  title: 'Job Tracker — Find, save and track every application',
  description:
    'Save jobs from any board with one click and track them from Saved to Offer on a clean Kanban board.',
};

const FEATURES = [
  {
    icon: MousePointerClick,
    title: 'One-click capture',
    body: 'The browser extension reads LinkedIn, Indeed and any job page and saves the posting for you.',
  },
  {
    icon: Columns3,
    title: 'Kanban pipeline',
    body: 'Drag every application from Saved through Applied, Interview and Offer — nothing slips.',
  },
  {
    icon: CheckCircle2,
    title: 'Automatic tracking',
    body: 'Applied status is detected where possible, and you can always confirm it manually.',
  },
];

const STEPS = [
  { title: 'Find a job', body: 'Browse LinkedIn, Indeed or any company careers page.' },
  { title: 'Save it in one click', body: 'Hit the extension button — title, company and location are filled in.' },
  { title: 'Track it on the board', body: 'Move the card as you progress, add notes, and land the offer.' },
];

export default function Home() {
  const hasSession = Boolean(cookies().get('refreshToken'));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <Briefcase className="h-4 w-4" aria-hidden />
            </span>
            <span className="font-semibold tracking-tight">Job Tracker</span>
          </div>
          <nav className="flex items-center gap-4" aria-label="Account">
            {hasSession ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Open dashboard
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight animate-fade-in-up sm:text-5xl">
          Stop losing track of the jobs you applied to
        </h1>
        <p
          className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground animate-fade-in-up"
          style={{ animationDelay: '60ms' }}
        >
          Save any job posting with one click and follow every application from
          Saved to Offer on a single Kanban board.
        </p>
        <div
          className="mt-8 flex items-center justify-center gap-4 animate-fade-in-up"
          style={{ animationDelay: '120ms' }}
        >
          <Link
            href="/register"
            className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Start tracking — it&apos;s free
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Sign in
          </Link>
        </div>

        {/* Product mock — the same column tints as the real board. */}
        <div
          className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-4 text-left sm:grid-cols-3 animate-fade-in-up"
          style={{ animationDelay: '180ms' }}
          aria-hidden
        >
          <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 p-4">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold">
              <span>SAVED</span>
              <span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">2</span>
            </div>
            <div className="mb-2 rounded-lg border border-border bg-card p-3 shadow-card">
              <div className="h-3 w-3/4 rounded bg-muted" />
              <div className="mt-2 h-2.5 w-1/2 rounded bg-muted" />
            </div>
            <div className="rounded-lg border border-border bg-card p-3 shadow-card">
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="mt-2 h-2.5 w-2/5 rounded bg-muted" />
            </div>
          </div>
          <div className="rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 p-4">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold">
              <span>INTERVIEW</span>
              <span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">1</span>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 shadow-card">
              <div className="h-3 w-4/5 rounded bg-muted" />
              <div className="mt-2 h-2.5 w-1/2 rounded bg-muted" />
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 p-4">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold">
              <span>OFFER</span>
              <span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">1</span>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 shadow-card">
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="mt-2 h-2.5 w-3/5 rounded bg-muted" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Everything you need to run a job search
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-background p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover animate-fade-in-up"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <feature.icon className="h-6 w-6 text-accent" aria-hidden />
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                {index + 1}
              </span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight">
            Ready to get your pipeline in order?
          </h2>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Create your account
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Job Tracker</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
            <Link href="/register" className="transition-colors hover:text-foreground">
              Get started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

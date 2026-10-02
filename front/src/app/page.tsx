import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import logoImg from '@/assest/Logo_minimaliste_AT_avec_swoosh-removebg-preview.png';
import {
  ArrowRight,
  CheckCircle2,
  Columns3,
  MousePointerClick,
  Sparkles,
  Search,
  BellRing,
  Lightbulb,
  FileText,
  Clock,
  ShieldCheck,
  TrendingUp,
  BookmarkCheck,
  Zap,
} from 'lucide-react';

export const metadata = {
  title: 'Job Tracker — Find, save and track every application',
  description:
    'Save jobs from any board with one click, organize applications on a Kanban board, and accelerate your career with smart job search tips.',
};

const FEATURES = [
  {
    icon: MousePointerClick,
    title: 'One-Click Capture',
    body: 'The browser extension reads LinkedIn, Indeed and any career site to capture titles, companies, locations, and descriptions in a single second.',
    badge: 'Instant Save',
  },
  {
    icon: Columns3,
    title: 'Visual Kanban Pipeline',
    body: 'Drag and drop every application across customizable stages from Saved to Applied, Interview, and Offer with zero friction.',
    badge: 'Smooth Motion',
  },
  {
    icon: BellRing,
    title: 'Follow-up & Notes',
    body: 'Log interview rounds, recruiter feedback, salary ranges, and follow-up reminders right on the card so you never lose context.',
    badge: 'Stay Prepared',
  },
  {
    icon: TrendingUp,
    title: 'Application Analytics',
    body: 'Monitor interview conversion rates, active pipeline volume, and response trends in real time from your personal dashboard.',
    badge: 'Data Insights',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Discover & Capture',
    subtitle: 'Browse any board',
    body: 'Find interesting roles on LinkedIn, Indeed, Glassdoor, or company career portals. Click once to capture and structure the full job posting directly into your pipeline.',
    icon: Search,
  },
  {
    step: '02',
    title: 'Organize Your Pipeline',
    subtitle: 'Drag, drop, update',
    body: 'Organize your job search visually on a responsive Kanban board. Shift cards between Saved, Applied, Interview, Offer, or Rejected with fluid animations.',
    icon: Columns3,
  },
  {
    step: '03',
    title: 'Prepare & Take Notes',
    subtitle: 'Master every interview',
    body: 'Store recruiter notes, technical questions, salary expectations, and timeline updates right inside the job card to stay sharp during every interview.',
    icon: FileText,
  },
  {
    step: '04',
    title: 'Analyze & Land the Offer',
    subtitle: 'Optimize your search',
    body: 'Identify which sources and roles yield the highest responses, refine your strategy, and confidently negotiate your top job offer.',
    icon: CheckCircle2,
  },
];

const JOB_SEARCH_TIPS = [
  {
    icon: Clock,
    title: 'Apply within the first 48 hours',
    body: 'Job postings receive 70% of views in the first 2 days. Saving roles instantly ensures you submit before recruiters begin filtering applicant pools.',
    tag: 'Timing Strategy',
  },
  {
    icon: Lightbulb,
    title: 'Tailor resume keywords to the job description',
    body: 'Review the sanitized requirements stored in Job Tracker to align your resume bullet points with the exact ATS terms found in the description.',
    tag: 'ATS Optimization',
  },
  {
    icon: BellRing,
    title: 'Follow up at 5–7 business days',
    body: 'Use card timestamps to schedule timely follow-ups. A polite check-in email with the hiring manager or recruiter boosts response likelihood significantly.',
    tag: 'Proactive Outreach',
  },
  {
    icon: ShieldCheck,
    title: 'Keep comprehensive interview logs',
    body: 'Jot down questions asked during round 1 immediately after the call so you can refer back to key discussion points during subsequent executive rounds.',
    tag: 'Interview Prep',
  },
];

// The extension ships dedicated parsers for these boards and a generic
// extractor for everything else — keep the landing copy honest to that.
const WORKS_WITH = ['LinkedIn', 'Indeed', 'Any career site'];

export default function Home() {
  const hasSession = Boolean(cookies().get('refreshToken'));

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-accent/20 selection:text-accent isolate">
      {/* Background ambient gradient glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[550px] w-full max-w-5xl -translate-x-1/2 rounded-full bg-gradient-to-b from-accent/15 via-accent/5 to-transparent blur-3xl"
        aria-hidden
      />

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-2.5 transition-transform hover:scale-[1.02]">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-card p-1 shadow-sm ring-1 ring-border group-hover:ring-accent/50 transition-all">
              <Image
                src={logoImg}
                alt="Job Tracker Logo"
                width={36}
                height={36}
                priority
                className="h-8 w-8 object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-foreground sm:text-lg">Job Tracker</span>
              <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:block -mt-1">
                Career Command
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-2.5 sm:gap-4" aria-label="Account">
            {hasSession ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent/25 transition-all hover:bg-accent-hover hover:shadow-md hover:scale-[1.02]"
              >
                Dashboard
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent/25 transition-all hover:bg-accent-hover hover:shadow-md hover:scale-[1.02]"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative isolate overflow-hidden border-b border-border bg-gradient-to-b from-muted/30 via-background to-background py-16 sm:py-24 lg:py-28">
        <div className="ambient-grid -z-10 pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 text-center">
          {/* Badge */}
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm animate-fade-in-up">
            <Sparkles className="h-3.5 w-3.5 text-accent animate-pulse" />
            <span>The smarter way to manage your job search</span>
          </div>

          {/* Heading */}
          <h1 className="mx-auto mt-6 max-w-4xl text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl animate-fade-in-up">
            Stop losing track of the jobs <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-accent to-blue-600 bg-clip-text text-transparent">
              you applied to
            </span>
          </h1>

          <p
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground animate-fade-in-up sm:text-lg lg:text-xl"
            style={{ animationDelay: '60ms' }}
          >
            One-click capture from LinkedIn and job boards, an intuitive Kanban pipeline, and organized notes to convert applications into offers.
          </p>

          {/* CTA Buttons */}
          <div
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4 animate-fade-in-up"
            style={{ animationDelay: '120ms' }}
          >
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover hover:shadow-lg hover:-translate-y-0.5"
            >
              Start tracking — it&apos;s free
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-input bg-card px-6 py-3.5 text-base font-semibold text-foreground shadow-sm transition-all hover:bg-muted hover:-translate-y-0.5"
            >
              Sign in to account
            </Link>
          </div>

          {/* Interactive Visual Board Preview */}
          <div
            className="mx-auto mt-12 sm:mt-16 max-w-4xl rounded-2xl border border-border bg-card/70 p-4 shadow-xl backdrop-blur-md animate-fade-in-up sm:p-6"
            style={{ animationDelay: '180ms' }}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-xs font-medium text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <span className="font-semibold text-foreground">Live Pipeline Board</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">4 Active Roles</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">1 Offer Pending</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 text-left sm:grid-cols-3">
              {/* Column 1: Saved */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 dark:border-blue-900/60 dark:bg-blue-950/40">
                <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  <span className="flex items-center gap-1.5">
                    <BookmarkCheck className="h-3.5 w-3.5" />
                    Saved
                  </span>
                  <span className="rounded-full bg-card px-2 py-0.5 font-semibold tabular-nums text-foreground shadow-sm">2</span>
                </div>
                <div className="space-y-2">
                  <div className="rounded-lg border border-border bg-card p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-semibold text-foreground">Senior Fullstack Engineer</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Vercel • Remote</p>
                    <div className="mt-2.5 flex items-center justify-between text-[10px]">
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 font-medium text-accent">LinkedIn 1-Click</span>
                      <span className="text-muted-foreground">Today</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-semibold text-foreground">Frontend Architect</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Linear • Remote</p>
                    <div className="mt-2.5 flex items-center justify-between text-[10px]">
                      <span className="font-medium text-foreground">$160k - $190k</span>
                      <span className="text-muted-foreground">2d ago</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 2: Interview */}
              <div className="rounded-xl border border-green-200 bg-green-50/50 p-3.5 dark:border-green-900/60 dark:bg-green-950/40">
                <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-300">
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" />
                    Interview
                  </span>
                  <span className="rounded-full bg-card px-2 py-0.5 font-semibold tabular-nums text-foreground shadow-sm">1</span>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                  <p className="text-xs font-semibold text-foreground">Staff Product Engineer</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Stripe • San Francisco</p>
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-md bg-green-500/10 px-2 py-1 text-[10px] font-semibold text-green-700 dark:text-green-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Round 2: Technical • Thu 2pm
                  </div>
                </div>
              </div>

              {/* Column 3: Offer */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/40">
                <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Offer
                  </span>
                  <span className="rounded-full bg-card px-2 py-0.5 font-semibold tabular-nums text-foreground shadow-sm">1</span>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 shadow-card ring-1 ring-emerald-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                  <p className="text-xs font-semibold text-foreground">Lead Frontend Developer</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Supabase • Remote</p>
                  <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    <span>🎉 Offer Received ($175k)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Supported boards strip */}
          <div
            className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-2.5 text-xs sm:text-sm animate-fade-in-up"
            style={{ animationDelay: '240ms' }}
          >
            <span className="font-medium text-muted-foreground">Works with</span>
            {WORKS_WITH.map((site) => (
              <span
                key={site}
                className="rounded-full border border-border bg-card/80 px-3 py-1 font-semibold text-foreground shadow-sm backdrop-blur-sm"
              >
                {site}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="workflow" className="border-b border-border bg-card/50 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <span className="inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
              Workflow Guide
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-4xl">
              How Job Tracker Works
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              A structured, 4-step pipeline designed to keep you organized from discovery to signing your offer letter.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW_STEPS.map((item) => (
              <div
                key={item.step}
                className="group relative flex flex-col justify-between rounded-2xl border border-border bg-background p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-card-hover"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold tracking-widest text-accent">{item.step}</span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                      <item.icon className="h-5 w-5" aria-hidden />
                    </div>
                  </div>

                  <h3 className="mt-4 text-base font-bold text-foreground">{item.title}</h3>
                  <p className="text-xs font-semibold text-accent mt-0.5">{item.subtitle}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Features Section */}
      <section id="features" className="border-b border-border py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <span className="inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
              Built for Candidates
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-4xl">
              Engineered for the Modern Job Hunt
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Eliminate messy spreadsheets with dedicated tools created exclusively to accelerate your career search.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-card-hover"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white shadow-md shadow-accent/20 transition-transform group-hover:scale-105">
                      <feature.icon className="h-5 w-5" aria-hidden />
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {feature.badge}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-bold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pro Tips Section */}
      <section id="tips" className="border-b border-border bg-card/40 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <span className="inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
              Actionable Strategies
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-4xl">
              Tips to Land More Interviews
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Tested strategies you can immediately practice using your Job Tracker dashboard.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {JOB_SEARCH_TIPS.map((tip) => (
              <div
                key={tip.title}
                className="group flex items-start gap-4 rounded-2xl border border-border bg-background p-6 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                  <tip.icon className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <span className="inline-block rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent">
                    {tip.tag}
                  </span>
                  <h3 className="mt-2 text-base font-bold text-foreground">{tip.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tip.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action Banner */}
      <section className="py-16 sm:py-24 text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="relative isolate overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-card via-card to-muted/40 p-8 shadow-2xl ring-1 ring-accent/15 sm:p-14">
            <div className="pointer-events-none absolute -top-20 left-1/2 -z-10 h-44 w-3/4 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" aria-hidden />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-card p-2 shadow-sm ring-1 ring-border">
              <Image
                src={logoImg}
                alt="Job Tracker Logo"
                width={48}
                height={48}
                className="h-10 w-10 object-contain"
              />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              Ready to take control of your career search?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Join job seekers organizing their applications, tracking interview rounds, and landing dream roles faster.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover hover:shadow-lg hover:-translate-y-0.5"
              >
                Create your free account
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-input bg-card px-6 py-3.5 text-base font-semibold text-foreground shadow-sm transition-all hover:bg-muted hover:-translate-y-0.5"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <Link href="/" className="inline-flex items-center gap-2.5 transition-transform hover:scale-[1.02]">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-background p-1 shadow-sm ring-1 ring-border">
                  <Image src={logoImg} alt="Job Tracker Logo" width={28} height={28} className="h-7 w-7 object-contain" />
                </span>
                <span className="font-bold tracking-tight text-foreground">Job Tracker</span>
              </Link>
              <p className="mt-3 max-w-[28ch] text-sm leading-relaxed text-muted-foreground">
                Capture jobs from any board, move them through a Kanban pipeline, and land your next offer.
              </p>
            </div>

            <nav aria-label="Product" className="text-sm">
              <h3 className="font-semibold text-foreground">Product</h3>
              <ul className="mt-3 space-y-2 text-muted-foreground">
                <li><Link href="/#features" className="transition-colors hover:text-foreground">Features</Link></li>
                <li><Link href="/#workflow" className="transition-colors hover:text-foreground">How it works</Link></li>
                <li><Link href="/#tips" className="transition-colors hover:text-foreground">Job search tips</Link></li>
              </ul>
            </nav>

            <nav aria-label="Account" className="text-sm">
              <h3 className="font-semibold text-foreground">Account</h3>
              <ul className="mt-3 space-y-2 text-muted-foreground">
                <li><Link href="/login" className="transition-colors hover:text-foreground">Sign in</Link></li>
                <li><Link href="/register" className="transition-colors hover:text-foreground">Get started</Link></li>
                <li><Link href="/forgot-password" className="transition-colors hover:text-foreground">Forgot password</Link></li>
              </ul>
            </nav>

            <nav aria-label="Legal" className="text-sm">
              <h3 className="font-semibold text-foreground">Legal</h3>
              <ul className="mt-3 space-y-2 text-muted-foreground">
                <li><Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link></li>
              </ul>
            </nav>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
            <span>© {new Date().getFullYear()} Job Tracker. All rights reserved.</span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
              Your job search data stays yours.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

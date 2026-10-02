import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy — Job Tracker',
  description: 'How the Job Tracker browser extension and web app collect, use and protect your data.',
};

// Static privacy policy (Phase 12). Required for Chrome Web Store review because
// the extension reads job-page content and the service stores account + job data.
// Replace the contact placeholder with your real email before submitting.
const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: 'What the browser extension reads',
    body: [
      'When you click the extension on a job page, it reads only the data needed to describe that posting: the job title, company, location, salary (if shown), the job URL, and the page description. It uses the page\u2019s structured data (JSON-LD / OpenGraph) and visible headings \u2014 it does not read passwords, payment details, private messages, or anything you type into other sites.',
      'The extension runs on the page you are currently viewing when you invoke it. It does not run in the background on every page and does not browse or scrape sites on its own.',
    ],
  },
  {
    heading: 'What we store',
    body: [
      'Account: your name, email address, and \u2014 if you register with a password \u2014 a salted hash of that password. We never store your password in plain text. If you sign in with Google, we store your Google name, email, profile photo URL, and a subject identifier; we do not receive or store your Google password.',
      'Jobs and notes: the job postings you save and the notes you attach to them, so your Kanban board and dashboard can display them.',
      'Security & audit data: hashed refresh tokens (so sessions can be revoked on logout), rate-limit counters, and administrator audit logs (who suspended/deleted what and when).',
    ],
  },
  {
    heading: 'How your data is protected and isolated',
    body: [
      'Every job and note is scoped to your user account. The API derives your identity from your verified access token and filters every query by your user id \u2014 one user can never read, edit, or delete another user\u2019s jobs.',
      'Passwords are hashed with bcrypt. Access tokens are short-lived; refresh tokens are stored hashed server-side and rotated on use. Login, registration and admin login are protected by a CAPTCHA (Cloudflare Turnstile) verified on the server.',
      'Job descriptions captured from third-party pages are sanitized before they are rendered, to prevent stored cross-site scripting.',
    ],
  },
  {
    heading: 'What we do NOT do',
    body: [
      'We do not sell, rent, or trade your personal data. We do not inject ads or affiliate tracking into job pages. We do not automatically submit job applications on your behalf. We do not track your browsing across unrelated sites.',
    ],
  },
  {
    heading: 'Third-party services',
    body: [
      'Google (sign-in): if you choose \u201cContinue with Google\u201d, Google authenticates you and shares the profile fields listed above. See Google\u2019s privacy policy for how Google handles that data.',
      'Cloudflare Turnstile (bot protection): verifies that login/registration requests come from a human. See Cloudflare\u2019s privacy policy for details.',
    ],
  },
  {
    heading: 'Your choices and deleting your data',
    body: [
      'You can edit or delete any job and note at any time from the dashboard. You can change your password, unlink Google sign-in, and delete your account from Settings. Deleting your account permanently removes your user record together with all of your jobs, notes and sessions.',
    ],
  },
  {
    heading: 'Data retention',
    body: [
      'Your data is retained for as long as your account exists. When you delete your account, your jobs and notes are removed. Backups, if enabled, expire on the database provider\u2019s normal retention schedule.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      'Questions about this policy or your data? Contact us at privacy@your-domain.com (replace with your real contact address before publishing).',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to home
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This policy explains what the Job Tracker browser extension and web app
          collect, why, and how it is protected.
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold">{section.heading}</h2>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

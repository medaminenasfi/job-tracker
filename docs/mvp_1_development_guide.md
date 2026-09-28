MVP 1 Development Guide — Job Capture + Kanban
Product promise: Find a job → capture it with the browser extension → save it automatically → track it on a Kanban board.

This guide breaks MVP 1 into 13 sequential phases (0–12): core product (0–6), admin system (7), user dashboard home (8), Google auth (9), CAPTCHA bot protection with Cloudflare Turnstile (10), premium UI/animations (11), and deployment (12). Each phase has a clear goal, deliverables, and a "done when" checkpoint. Build in order — don't skip ahead.

🧱 Recommended Tech Stack
Layer	Technology	Why
Web app	Next.js 14+ (App Router), TypeScript	Full-stack React framework, great DX, easy Vercel deploy
Styling / UI	Tailwind CSS + shadcn/ui	Fast, consistent, accessible components (dialogs, dropdowns, toasts)
Drag & drop	@dnd-kit/core	Modern, accessible, actively maintained (better than react-beautiful-dnd, which is unmaintained)
Backend API	Node.js + NestJS (or Next.js Route Handlers if you want one repo)	NestJS gives clean modular structure, good for a "real" portfolio project; Next.js API routes are faster to ship if you want a monorepo
Database	Self-hosted PostgreSQL (Docker locally, managed/self-managed instance in production)	Full control over schema, no vendor lock-in, you own the whole data layer
ORM	Prisma	Type-safe queries, migrations, works identically against any Postgres instance
Auth	Custom JWT auth: bcrypt/argon2 for password hashing, jsonwebtoken (or @nestjs/jwt) for access/refresh tokens	You build and own the entire auth flow — register, login, hashing, token issuance/refresh — no third-party auth provider
Extension	Chrome Extension, Manifest V3, TypeScript + React	Required for modern Chrome Web Store submissions
Extension bundler	Vite + @crxjs/vite-plugin (or Plasmo)	Plasmo = fastest to start; Vite+CRXJS = more control
State/data fetching (web)	TanStack Query (React Query)	Handles caching, refetch, optimistic updates for Kanban drag events
Validation	Zod	Shared schema validation between extension, API, and frontend
Animation	Framer Motion	Sidebar collapse, sliding active indicator (layoutId), page transitions, drag overlays
Icons / theming / toasts	lucide-react, next-themes, sonner	Consistent icons, dark mode, polished notifications
Charts	Recharts	Admin overview and dashboard charts
CAPTCHA	Cloudflare Turnstile (free) + @marsidev/react-turnstile	Bot protection on login/register, verified server-side (Phase 10)
Google sign-in	passport-google-oauth20 (NestJS) or google-auth-library	Adds "Continue with Google" on top of your own JWT sessions (Phase 9)
Deployment	Vercel (web), Render/Fly.io/VPS (API), a managed Postgres instance or your own Postgres on a VPS (DB), Chrome Web Store (extension)	
Decision to make early: one repo (monorepo with Next.js API routes) vs. separate NestJS backend. For a portfolio piece, a separate NestJS API demonstrates more backend skill. For speed, Next.js API routes in one repo is faster to ship. This guide assumes the separate-backend path but notes the shortcut where relevant.

Note on going fully self-built: dropping Supabase means you're responsible for three things it would otherwise hand you for free — password hashing/token issuance (Phase 2), enforcing per-user data isolation entirely in your API layer instead of via database-level Row-Level Security (Phase 1/6), and running/backing up Postgres yourself (Phase 0/7). None of this is hard, but it does mean there's no database-level safety net if an API query forgets to filter by user_id — so that check has to be disciplined and, ideally, tested.

Phase 0 — Planning & Environment Setup
Goal: Have all accounts, repos, and local tooling ready before writing feature code.

Tasks:

Run PostgreSQL locally via Docker (docker run -e POSTGRES_PASSWORD=... -p 5432:5432 postgres:16) or install it natively — note the connection string.
Design the initial DB schema (see Phase 1) as an ERD before touching code.
Set up three repos (or one monorepo with /web, /api, /extension folders): jobtracker-web, jobtracker-api, jobtracker-extension.
Set up .env files (never commit secrets):
DATABASE_URL (Postgres connection string), JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRY (e.g. 15m), JWT_REFRESH_EXPIRY (e.g. 7d).
Set up linting/formatting once for all repos: ESLint + Prettier + TypeScript strict mode.
Create a shared types package (or just a shared types.ts file duplicated across repos for MVP1) with the Job and User interfaces, so the extension, API, and web app agree on the same shape.
Initialize Prisma in the API repo (npx prisma init), pointing DATABASE_URL at your local Postgres instance.
Done when: you can run npm run dev on an empty Next.js app, an empty NestJS app, and load an unpacked empty extension in Chrome, all pointing at the same local Postgres database via Prisma.

Phase 1 — Database & Backend API
Goal: A working, authenticated REST API backed by PostgreSQL, with no UI yet — testable via Postman/curl.

Database schema
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

create type job_status as enum (
  'SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  title text not null,
  company text not null,
  location text,
  url text,
  source text,               -- 'linkedin' | 'indeed' | 'generic' | 'manual'
  description text,
  salary text,
  employment_type text,      -- 'full-time' | 'contract' | etc.
  status job_status not null default 'SAVED',
  notes text,
  saved_at timestamptz default now(),
  applied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_jobs_user_id on jobs(user_id);
create index idx_jobs_status on jobs(status);
Since there's no managed database-level Row-Level Security here, per-user isolation is enforced entirely in your API layer: every Prisma query on jobs must include where: { user_id: req.user.id, ... }. Write a small jobs.repository.ts wrapper that always injects user_id so no individual route handler can forget it — treat this as your single most important security control and set the pattern now, before writing the CRUD routes below.

API endpoints
POST   /auth/register
POST   /auth/login
GET    /auth/me

POST   /jobs                 -- create (used by extension "Save Job" and manual form)
GET    /jobs                 -- list, with ?status=&search=&source= query params
GET    /jobs/:id
PATCH  /jobs/:id             -- edit fields
PATCH  /jobs/:id/status      -- move card between Kanban columns
DELETE /jobs/:id
Backend tasks
Scaffold NestJS with modules: AuthModule, JobsModule, UsersModule.
Connect to your self-hosted Postgres via Prisma. Run npx prisma migrate dev to create the tables from Phase 1's schema.
Implement /auth/register: validate input, hash the password with bcrypt (or argon2), insert the user, return an access token + refresh token.
Implement /auth/login: look up the user by email, compare the password with bcrypt.compare, issue a short-lived access token (e.g. 15 min) and a longer-lived refresh token (e.g. 7 days), both signed with @nestjs/jwt using separate secrets.
Implement a POST /auth/refresh endpoint that exchanges a valid refresh token for a new access token, and store refresh tokens (or their hashes) server-side so they can be revoked on logout.
Implement an auth guard that verifies the access token from the Authorization: Bearer <token> header and attaches req.user. Never trust a user_id sent in the request body — always derive it from the verified token.
Implement the jobs CRUD endpoints, scoped to req.user.id on every query (via the repository wrapper from Phase 1).
Add input validation with Zod or class-validator DTOs on every endpoint.
Add CORS config allowing your web app origin and chrome-extension://<your-extension-id>.
Add basic rate limiting (e.g. @nestjs/throttler) on /auth/* and /jobs POST — this matters more without a managed auth provider, since brute-forcing login is now entirely your problem to defend against.
Done when: you can curl register → login → get a token → create a job → list jobs → update status → delete a job, all scoped correctly to that user, with a second test user unable to see the first user's jobs.

Phase 2 — Authentication (Web)
Goal: A working login/register flow on the website, tokens stored securely, protected routes.

Tasks:

Build /login and /register pages (simple forms, no need for polish yet) that call your NestJS /auth/register and /auth/login endpoints.
Store the access token in memory (React state/context) and the refresh token in an httpOnly cookie set by the API — avoid localStorage for tokens where you can, to reduce XSS exposure.
Add an API client wrapper (e.g. a thin fetch/axios instance) that attaches the access token to every request and, on a 401, calls /auth/refresh once and retries before giving up.
Use Next.js middleware to protect /dashboard/* routes — redirect unauthenticated users to /login.
Add a logout action that clears the refresh token cookie and revokes it server-side.
Google sign-in is added later in Phase 9 — build email/password first, and design the users table so a password is not the only way in.
Done when: a new user can register, get redirected to an empty dashboard, log out, and log back in — and visiting /dashboard while logged out redirects to /login.

Phase 3 — Web Dashboard: Kanban Board
Goal: The core UI — a working, draggable Kanban board reading/writing real data from the API.

Tasks:

Build the dashboard layout: top stats bar (Total / Applied / Interviews / Offers), search bar, "+ Add Job" button, Kanban columns.
Fetch jobs with TanStack Query, grouped client-side by status into the 7 columns (SAVED, APPLIED, SCREENING, INTERVIEW, OFFER, REJECTED, WITHDRAWN).
Implement drag-and-drop with @dnd-kit: on drop, optimistically update the UI, then call PATCH /jobs/:id/status; roll back on error (toast notification).
Build the compact Job Card component: title, company, location, source icon, applied date, salary badge (optional).
Build the Job Details modal/page: full description, notes (editable textarea with save), status dropdown, edit/delete buttons, "Open Original Job" link.
Build the Add Job manual form (title, company, location, URL, salary, source dropdown, status dropdown) — this is your fallback path when the extension isn't used.
Implement search (title/company/location) and filters (status, source, date) — client-side filtering is fine for MVP1 volumes; move to server-side filtering only if job counts get large.
Wire the stats bar to simple counts derived from the fetched jobs (no need for a separate analytics endpoint yet).
Done when: you can add a job manually, see it appear in SAVED, drag it through every column to OFFER, edit its notes, and delete it — all persisting correctly on page refresh.

Phase 4 — Browser Extension: Job Capture
Goal: A Chrome extension that reads a job page and lets the user save it to their account in one click.

Architecture
extension/
├── manifest.json
├── popup/              → React UI shown on click (Save Job / Mark Applied)
├── content-scripts/    → injected into job pages, extracts job data
├── background/         → service worker, handles API calls + auth token storage
└── parsers/
    ├── linkedin.ts
    ├── indeed.ts
    └── generic.ts       → fallback using JSON-LD / OpenGraph / meta tags
Tasks:

Scaffold with Plasmo or Vite+CRXJS, Manifest V3, storage, activeTab, and host permissions for LinkedIn/Indeed + <all_urls> for the generic parser (be ready to justify broad host permissions in the Chrome Web Store review).
Build the content script: detects it's on a job page, runs the matching parser (linkedin.ts, indeed.ts, or falls back to generic.ts reading JSON-LD JobPosting schema / OpenGraph tags), and returns a structured job object matching your shared Job type.
Build the popup UI: shows the extracted title/company/location, with [ Save Job ] and [ Mark as Applied ] buttons. If extraction is incomplete, allow the user to edit fields inline before saving.
Build the background service worker: holds the auth token (obtained via an extension login flow — simplest MVP1 approach is "log in on the website, extension reads a token via chrome.storage synced through a small /extension/token endpoint or a content-script bridge on your own domain"), and makes the actual POST /jobs call.
Add extension login: simplest path for MVP1 is a dedicated /extension-login page on your website that, once authenticated, posts the session token to the extension via chrome.runtime.sendMessage — avoid re-implementing a separate login form inside the popup if you can reuse the web session.
Handle the LinkedIn parser specifically (highest priority site): extract title, company, location, salary (if shown), job ID from URL.
Handle the Indeed parser similarly.
Handle the generic parser: read <script type="application/ld+json"> for JobPosting schema first (most reliable), fall back to OpenGraph meta tags, fall back to page <title> + best-guess DOM scraping.
Done when: on a real LinkedIn job posting, clicking the extension icon shows the correct title/company/location pre-filled, and clicking "Save Job" creates the row in your database and it's visible in the web dashboard within a few seconds.

Phase 5 — Application Detection
Goal: Automatically flip a job to APPLIED when possible, with a reliable manual fallback everywhere else.

Tasks:

LinkedIn Easy Apply: content script watches for the LinkedIn "Application sent" confirmation modal/element appearing in the DOM (via MutationObserver) after the user completes the Easy Apply flow. When detected, call PATCH /jobs/:id/status with APPLIED.
Indeed: similarly watch for their post-submit confirmation screen/element.
External application flows (most companies' own ATS pages): these are the hardest to detect reliably — don't over-invest here for MVP1. Instead, when the user clicks "Apply" from your popup, set an internal "watching" flag for that tab; if the tab navigates away and later shows signs of a thank-you/confirmation page (URL patterns like /thank-you, /confirmation, or text matches like "application received"), prompt the fallback below. Otherwise just rely on manual confirmation.
Manual fallback: always show [ ✓ Mark as Applied ] in the popup for any saved job. This must work on 100% of sites — it's your safety net and the feature that makes the product usable even where detection fails.
Set applied_at server-side when status transitions to APPLIED (don't trust a client-supplied timestamp).
Be explicit in your UI copy that detection is best-effort ("We'll try to detect your application automatically — you can always confirm manually").
Done when: Scenario A (save), Scenario B (auto-detected apply on LinkedIn), Scenario C (manual "Mark as Applied" on a random company site), and Scenario D (fully manual job entry) all work end-to-end, matching the four MVP1 user scenarios.

Phase 6 — Integration, Edge Cases & Security Hardening
Goal: Make the whole pipeline robust, not just "happy path" functional.

Tasks:

Auth on every layer: confirm the extension, API, and web app all reject requests with missing/invalid/expired tokens with proper 401s. Since there's no database-level RLS as a safety net here, write integration tests that specifically try to fetch/edit/delete User A's jobs while authenticated as User B, and confirm every route rejects it — this is your substitute for defense-in-depth.
Duplicate save prevention: if the user clicks "Save Job" twice on the same URL, either update the existing row or warn them, rather than creating duplicates (simple version: unique constraint on (user_id, url) where url is not null).
Error states: no internet, API down, extraction failure (empty title/company) — the popup should degrade gracefully to the manual-edit form rather than silently failing.
Loading/empty states: empty Kanban columns, loading skeletons, "no jobs match your search" state.
Input sanitization: strip/escape any HTML pulled from job descriptions before rendering (avoid stored XSS from scraped content) — render descriptions as plain text or sanitized markdown, never dangerouslySetInnerHTML on raw scraped content.
CORS/CSP: lock down the extension's manifest.json host_permissions to only what you actually parse; tighten API CORS to your real domains.
Logging: basic server-side logging of failed extraction attempts (which site, which parser) so you know which sites to add support for next.
Done when: you've manually tried to break the flow (double-saving, logging out mid-save, bad network, malformed job pages) and nothing corrupts data or leaks another user's jobs.

Phase 7 — Admin System (Roles, Admin Login, Admin Dashboard)
Goal: A separate, protected admin area where an administrator can see and manage every user and every job on the platform.

Security decision first: how do admins get created?
You asked for admin login and register. A public "register as admin" page is the single most dangerous thing you could ship — anyone could make themselves an admin and read every user's data. Use one of these instead:

Seed script (recommended for MVP1): npm run seed:admin reads ADMIN_EMAIL / ADMIN_PASSWORD from .env and creates the first admin. Nobody registers as admin through the UI.
Admin invite (for additional admins): an existing admin generates a one-time, expiring invite link/code (/admin/register?token=...). The register page only works with a valid, unused token. This gives you an "admin register" screen without the hole.
Regular /auth/register must always create role = USER — never accept a role field from the request body.

Database changes (Prisma migration)
create type user_role as enum ('USER', 'ADMIN');
create type account_status as enum ('ACTIVE', 'SUSPENDED');

alter table users
  add column role user_role not null default 'USER',
  add column account_status account_status not null default 'ACTIVE',
  add column last_login_at timestamptz;

create table admin_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  created_by uuid references users(id),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references users(id),
  action text not null,          -- 'USER_SUSPENDED', 'USER_DELETED', 'JOB_DELETED', ...
  target_type text,
  target_id uuid,
  created_at timestamptz default now()
);
Admin API (all under /admin/*)
POST   /admin/auth/login            -- same credentials check, rejects non-ADMIN users
POST   /admin/auth/register         -- requires valid invite token
POST   /admin/invites               -- create invite (admin only)

GET    /admin/stats                 -- totals: users, jobs, jobs by status, signups per week
GET    /admin/users                 -- paginated, search by name/email, filter by role/status
GET    /admin/users/:id             -- profile + job counts
PATCH  /admin/users/:id/status      -- suspend / reactivate
PATCH  /admin/users/:id/role        -- promote / demote (cannot demote yourself)
DELETE /admin/users/:id             -- delete user + cascade jobs (cannot delete yourself)
GET    /admin/jobs                  -- all jobs across users, paginated, filter by user/status/source
GET    /admin/jobs/:id
DELETE /admin/jobs/:id
GET    /admin/audit-logs
Backend tasks
Add role to the JWT payload; build a RolesGuard + @Roles('ADMIN') decorator. Always re-check role from the database for destructive admin actions rather than trusting only the token (a demoted admin's old token would otherwise keep working until it expires).
Apply JwtAuthGuard + RolesGuard at the AdminModule controller level so no admin route can be added without protection.
Create a separate admin.repository.ts for cross-user queries. The normal jobs.repository.ts stays strictly user-scoped — this is the one deliberate exception to the "every query is scoped to req.user.id" rule, and it lives in one auditable place.
Block login for SUSPENDED accounts in /auth/login and in the auth guard (so a suspended user's still-valid token stops working immediately).
Write an audit_logs row for every mutating admin action (suspend, role change, delete).
Add safety rails: an admin cannot delete/demote/suspend themselves, and the last remaining admin cannot be removed.
Stricter rate limiting on /admin/auth/*.
Frontend tasks (Next.js)
Routes: /admin/login, /admin/register (invite only), and a protected /admin layout with its own sidebar (Overview, Users, Jobs, Audit Log, Settings). Middleware redirects non-admins away from /admin/*.
Overview page: stat cards (total users, new users this week, total jobs, applied/interview/offer counts) + a simple signups-per-week chart (Recharts) + status distribution.
Users page: searchable, paginated table (name, email, role, status, jobs count, joined, last login) with row actions: view, suspend/reactivate, promote/demote, delete (confirmation dialog).
User detail page: profile, their job counts by status, and a read-only list of their jobs.
Jobs page: all jobs across users, filter by user/status/source, delete for spam/abuse.
Audit log page: who did what, when.
Make the admin area visually distinct (e.g. a badge or accent colour in the sidebar) so an admin never confuses it with the user app.
Privacy note
Admins reading users' job data is a privacy matter. Mention it in your privacy policy, keep admin job views read-only except for deletion, and rely on the audit log.

Done when: the seeded admin can log in at /admin/login, see platform-wide stats, search and suspend a test user (who is then immediately locked out), and a normal user visiting /admin is redirected away and gets 403 on every /admin/* API call.

Phase 8 — User Dashboard Home (Simple Overview + Website Info)
Goal: Turn the user's Dashboard page into a helpful, simple home — quick stats plus a bit of information about the product — while the Kanban stays on the "Job Track" page.

You already have the stat cards, Status Breakdown, and Recent Jobs. Keep them and add:

Greeting + getting-started checklist (shown until completed): ✅ Create account · ☐ Install the browser extension · ☐ Save your first job · ☐ Mark a job as Applied. Derive completion from real data.
Install extension card: short explanation of what the extension does, with an "Install extension" button (Chrome Web Store link, or "coming soon" during development).
How it works card: three steps — Find a job → Save it with one click → Track it on the board.
Tips card: 2–3 rotating tips ("Add notes after every call", "Use 'Mark as Applied' if auto-detect misses").
Activity summary: applications this week / this month, and a small "last 7 days" sparkline.
Announcements area: a small "What's new" box fed by a simple announcements table (or a hardcoded JSON file for MVP1) that admins can later edit from the admin panel.
Empty state: if the user has 0 jobs, replace the stats with a friendly onboarding illustration and a single "Add your first job" button.
Keep the page light: one aggregated endpoint GET /dashboard/summary returning all counts and recent jobs, instead of several requests.
Parameters/Settings page: profile (name, email), change password, connected accounts (Google — see Phase 9), and delete account.
Done when: a brand-new user sees the onboarding checklist and empty state; a user with data sees accurate stats, recent jobs, and the info cards; and the whole page loads from one API call.

Phase 9 — Google Authentication
Goal: "Continue with Google" on both login and register, coexisting with email/password, with safe account linking.

Setup
In Google Cloud Console: create a project → OAuth consent screen → OAuth client ID (Web application). Add authorized redirect URIs for local and production. Store GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET only in the API's .env (AGENTS.md rule #5).
Prisma migration:
alter table users
  add column google_id text unique,
  add column avatar_url text,
  add column auth_provider text not null default 'local',  -- 'local' | 'google'
  alter column password_hash drop not null;               -- Google-only users have no password
Flow (recommended: server-side redirect flow)
[Continue with Google] → GET /auth/google → Google consent
   → GET /auth/google/callback (API verifies, finds/creates user)
   → API issues YOUR access + refresh tokens (same as email login)
   → redirect to web app /dashboard
Use Passport passport-google-oauth20 in NestJS (or google-auth-library if you prefer the client-side ID-token flow). Either way, the app's own JWTs remain the only session mechanism — Google is just an identity check.

Tasks
GET /auth/google and GET /auth/google/callback endpoints.
Account linking rule: if the Google email matches an existing local account, link it (set google_id) only if Google reports the email as verified; otherwise reject. Never create a duplicate user for the same email.
Google users are always created with role = USER; suspended accounts are refused here too.
Guard against OAuth CSRF with the state parameter (Passport handles this if sessions/state are configured).
Add "Continue with Google" buttons to /login and /register (and not to the admin login — keep admin on password + invite).
Parameters page: show "Connected: Google", allow setting a password for Google-only accounts, and only allow unlinking if a password exists.
Extension: no extra work — the extension logs in through the web session (/extension-login), so Google users are covered automatically.
Done when: a new user can register via Google, log out, log back in via Google; a user who registered with email can link Google with the same verified email and end up with one account; and the extension works for both.

Phase 10 — Bot Protection: CAPTCHA on Login/Register (Cloudflare Turnstile, Free)
Goal: Block automated login/registration attacks (credential stuffing, brute force, fake signups) with a CAPTCHA that is verified on both the frontend and the backend. The frontend widget alone protects nothing — a bot can skip your UI and call the API directly, so the backend must verify every token.

Why Cloudflare Turnstile
Turnstile is Cloudflare's free CAPTCHA alternative. Per Cloudflare's plans page, the Free plan has unlimited challenges, up to 20 widgets per account and 10 hostnames per widget, and it works on its own — you do not need to move your DNS or site to Cloudflare. Most visitors never see a puzzle: in Managed mode it is automatic or at most a checkbox. It is a good fit for MVP1 (free, no tracking-heavy behaviour, simple API).

Option	Cost	Notes
Cloudflare Turnstile (recommended)	Free, unlimited challenges	No puzzles, simple server verify call
hCaptcha	Free basic tier	Good alternative if you want a fallback provider
Google reCAPTCHA	Free only up to a monthly cap	Sets Google cookies, more friction
How the flow works
Browser                     Your API                    Cloudflare
   │  1. load widget ─────────────────────────────────────▶│
   │◀─────────── 2. token (single use, ~5 min) ────────────│
   │  3. POST /auth/login {email, password, turnstileToken}│
   │──────────────▶│                                        │
   │               │ 4. POST siteverify {secret, token, ip} ▶│
   │               │◀──────────── 5. {success: true/false} ─│
   │◀── 6. login proceeds only if success ── │
Tokens are single-use and expire after about 5 minutes, so a new token is needed for every attempt.

Step 1 — Create the widget and keys
Create a free Cloudflare account → Turnstile → Add widget.
Name it (e.g. jobtracker-auth), add hostnames (localhost for dev, then your real domains), choose mode Managed.
Copy the Site Key (public) and Secret Key (private).
Create separate widgets for dev and production so you can rotate/monitor them independently.
Environment variables:

# web/.env.local
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...

# api/.env  (never exposed to the browser or the extension — AGENTS.md rule #5)
TURNSTILE_SECRET_KEY=...
Step 2 — Frontend (Next.js)
Install the React wrapper: npm i @marsidev/react-turnstile.
Build a reusable <TurnstileField /> component around <Turnstile siteKey=... /> that exposes token, onSuccess, onExpire, onError, and a reset() via ref.
Add it to /login, /register, and /admin/login (set a different options.action for each: login, register, admin_login).
Disable the submit button until a token exists; show a small "Verifying…" state.
Send the token in the request body as turnstileToken.
Call reset() after every failed submit — the old token is spent, so without a reset the user is stuck.
Handle widget errors gracefully ("Verification failed, please refresh") and support dark/light theme (theme="auto").
Do not add the CAPTCHA to Google sign-in (Google already vets the user) or to the extension (it reuses the web session).
Step 3 — Backend (NestJS)
Create a TurnstileService and a TurnstileGuard:

// turnstile.service.ts (core idea)
async verify(token: string, ip?: string, expectedAction?: string) {
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
    response: token,
    ...(ip ? { remoteip: ip } : {}),
  });
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body, signal: AbortSignal.timeout(5000) },
  );
  const data = await res.json();
  if (!data.success) return false;
  if (expectedAction && data.action !== expectedAction) return false;
  // optionally: check data.hostname is one of your domains
  return true;
}
Tasks:

Apply the guard to POST /auth/login, POST /auth/register, and POST /admin/auth/login before any password check or database lookup (cheap rejection first).
Read the token from turnstileToken in the body, the client IP from the request (behind a proxy, configure Nest/Express trust proxy correctly), and pass an expected action per route.
Verify the action and hostname returned by Cloudflare match what you expect, so a token issued on another site/form can't be replayed here.
Fail closed: if the siteverify call errors or times out, reject the request (503 with a friendly message). Never let requests through because the CAPTCHA service is down.
Return a generic error (400 CAPTCHA verification failed) — do not reveal whether the email exists.
Log failures (IP, route, Cloudflare error-codes such as missing-input-response, invalid-input-response, timeout-or-duplicate) for monitoring.
Keep the secret key server-side only; never log it.
Step 4 — Layered defense (CAPTCHA is not enough alone)
Keep these in place, they complement the CAPTCHA:

Rate limiting on /auth/* (Phase 1) — stricter per IP and per email.
Temporary lockout / progressive delay after repeated failed logins for the same account.
Optional progressive mode: show the CAPTCHA only after N failed attempts on login (always keep it on register).
Password hashing cost tuned (bcrypt/argon2) so brute force is slow even if a bot gets through.
Step 5 — Security headers / CSP
If you use a Content-Security-Policy on the web app, allow https://challenges.cloudflare.com in script-src, frame-src, and connect-src. Without this the widget silently fails to load.

Step 6 — Local development & testing
Never disable verification with an "if dev, skip" flag that could leak into production. Use Cloudflare's official test keys instead:

Purpose	Site key	Secret key
Always passes	1x00000000000000000000AA	1x0000000000000000000000000000000AA
Always fails	2x00000000000000000000AB	2x0000000000000000000000000000000AA
Forces interactive challenge	3x00000000000000000000FF	—
Tests to write:

Unit test TurnstileService with a mocked fetch (success, success:false, timeout, wrong action).
E2E: login with the always-pass keys succeeds; with the always-fail secret returns 400; missing token returns 400; replaying the same token fails.
Confirm a direct curl to /auth/login without a token is rejected — this proves backend enforcement, not just UI.
Step 7 — Deployment notes
Add your production domains to the widget's hostname list (free plan: up to 10 per widget).
Set the production site key/secret in Vercel and your API host; rebuild the web app after changing the public key.
Update your privacy policy to mention Cloudflare Turnstile is used for bot protection.
Done when: login, register, and admin login all require a valid Turnstile token in the browser and the API rejects any request without a valid, unexpired, correctly-scoped token (verified with curl); the widget resets after failed attempts; and login still works with Google and via the extension.

Phase 11 — Premium UI/UX & Animations
Goal: Make the app feel polished and modern — cohesive design system, animated sidebar, smooth transitions — without hurting performance or accessibility.

11.1 Design system foundations
Define design tokens as CSS variables (Tailwind theme): a refined neutral palette + one brand accent, consistent radius (e.g. 12px cards), a spacing scale, and soft layered shadows instead of heavy borders.
Typography: one quality font via next/font (Inter, Geist, or Plus Jakarta Sans), a clear scale (page title / section / body / caption), tabular numbers for stats.
Replace the emoji sidebar icons with a single icon set (lucide-react) for a consistent look.
Add dark mode (next-themes) with tokens defined for both themes; toggle in the sidebar footer or Parameters.
11.2 Sidebar animation
Collapsible sidebar (expanded ↔ icon-only), width animated with Framer Motion (spring or 200–250ms ease-out); remember the state in localStorage.
Active-item indicator that slides between items using Framer Motion's layoutId (a shared pill/background that glides to the selected item).
Hover micro-interactions: subtle background fade, icon nudge, tooltip labels when collapsed.
Staggered fade-in of nav items on first load.
Mobile: sidebar becomes a slide-in drawer with a backdrop and a hamburger button; close on route change.
User card + Log out pinned to the bottom, with a small avatar (Google avatar if available, initials otherwise).
11.3 Page & component polish
Page transitions: short fade/slide-up on route change (Framer Motion AnimatePresence), 150–250ms.
Stat cards: animated count-up on load, subtle hover lift.
Kanban: smooth drag overlay with lift/rotation and shadow, animated drop placement, column highlight when a card hovers over it, coloured status accents (you already have per-column tints — refine them), empty-column illustrations ("Drop a job here").
Cards & modals: job details as a slide-over panel (right side) with animated open/close; shadcn Dialog animations tuned.
Loading: replace spinners with skeleton screens shaped like the real content.
Feedback: toast notifications (sonner) for save/move/delete/undo; button loading states; inline form validation with helpful messages.
Charts (admin + dashboard): consistent palette, animated entry, tooltips.
Landing page: hero section with product screenshot/mock, feature grid, "How it works", CTA, footer — same design tokens.
11.4 Accessibility & performance guardrails
Respect prefers-reduced-motion — disable or shorten animations for those users.
Keep animations to transform/opacity (GPU-friendly); avoid animating layout-heavy properties.
Keyboard navigation and visible focus rings everywhere (including Kanban: dnd-kit's keyboard sensor).
Check colour contrast in both themes; run Lighthouse and aim for 90+ on Performance/Accessibility.
Lazy-load heavy pieces (charts, admin routes) with dynamic imports.
Done when: the sidebar collapses/expands smoothly with a gliding active indicator on desktop and works as a drawer on mobile, dark/light themes both look intentional, every list has skeleton + empty states, and Lighthouse accessibility is 90+.

Phase 12 — Deployment & Chrome Web Store Submission
Goal: Ship it — real users can install the extension and use the live website.

Tasks:

Deploy the Next.js web app to Vercel; set production env vars.
Deploy the NestJS API to Render/Fly.io/a small VPS; set production env vars, enable HTTPS.
Provision production Postgres: either a managed Postgres add-on (Render/Fly/Railway Postgres) for less ops overhead, or your own instance on a VPS if you want full control — either way, run npx prisma migrate deploy against it and set up automated backups before real users touch it.
Build the extension for production (npm run build), zip it, and submit to the Chrome Web Store: write a clear privacy policy (required — you're reading page content and storing job data), justify host permissions in the listing, add screenshots of the popup and dashboard.
Smoke-test the full production pipeline: install the published (or unlisted/testing) extension, sign up fresh, save a real LinkedIn job, confirm it appears on the live dashboard.
Set up minimal uptime/error monitoring (e.g. Vercel/Render built-in logs, or a free Sentry tier) so you notice breakage instead of a user reporting it first.
Done when: a friend, with no help from you, can install the extension from the store link, create an account on the live site, save a job from LinkedIn, and see it move through the Kanban board.

✅ MVP 1 — Definition of Done
MVP1 is complete only when this entire loop works reliably, every time:

User finds a job
   → clicks the extension
   → job is correctly extracted (LinkedIn / Indeed / generic)
   → "Save Job" → appears in SAVED on the dashboard
   → user applies
   → status becomes APPLIED (auto-detected on LinkedIn/Indeed, or manually confirmed anywhere else)
   → user can drag the card through SCREENING → INTERVIEW → OFFER
   → user can search, filter, edit notes, and delete jobs
   → all of this is scoped strictly to the logged-in user
   → user can also sign in with Google
   → login/register are protected by a CAPTCHA verified on the backend
   → an admin can log in separately, see all users and jobs, and suspend/manage accounts
❌ Do not build yet (explicitly out of scope for MVP1)
AI job matching · AI CV analysis · AI cover letters · CV builder · job recommendations · automatic job searching · email/WhatsApp integration · mobile app · advanced analytics · billing/subscriptions · 20+ platform parsers · automatic application submission.

Everything in that list belongs to MVP2 and MVP3 — don't start it until the loop above is genuinely stable in production.